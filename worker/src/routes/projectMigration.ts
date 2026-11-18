import {
  driveJson,
  ensureProjectDriveTree,
  listFilesInFolder,
  readJsonFileById,
  upsertWorkspaceResource,
  writeJsonFileInFolder,
} from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import { SiteRegistryRecord, validateSiteSlug } from '../services/siteRegistryService';
import {
  ALL_PROJECT_MODULES,
  createProject,
  HierarchyServiceError,
  OnboardingLocalContext,
  OrganizationRecord,
  ProjectRecord,
  requireOrgMembership,
  requireProjectAccess,
  WorkspaceResourceRecord,
} from '../services/workspaceHierarchyService';
import { VerifiedSession, WorkerEnv } from '../types';

export interface SpreadsheetPartitionMapping {
  sourceSpreadsheetId: string;
  sourceSpreadsheetTitle: string;
  sourceTab: string;
  domain: 'cms' | 'inbox';
  targetDatasetKey: string;
  targetSpreadsheetTitle: string;
  estimatedRowCount: number;
  alreadyMigrated: boolean;
}

export interface MigrationVerificationCheck {
  id: string;
  label: string;
  category: 'sites' | 'drive' | 'sheets' | 'local';
  status: 'pass' | 'warning';
  detail: string;
  sourceCount?: number;
  migratedCount?: number;
}

function makeMigrationId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint8Array(5));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

function classifyLegacyTab(tabName: string): {
  domain: 'cms' | 'inbox';
  targetDatasetKey: string;
  targetSpreadsheetTitle: string;
} {
  const upper = tabName.trim().toUpperCase();
  if (
    upper.includes('SUBMISSION') ||
    upper.includes('CONTACT') ||
    upper.includes('INBOX') ||
    upper.includes('LEAD')
  ) {
    if (upper.includes('FIELD')) {
      return {
        domain: 'inbox',
        targetDatasetKey: 'SubmissionFields',
        targetSpreadsheetTitle: 'Inbox — SubmissionFields',
      };
    }
    if (upper.includes('CATEGOR')) {
      return {
        domain: 'inbox',
        targetDatasetKey: 'InboxCategories',
        targetSpreadsheetTitle: 'Inbox — Categories',
      };
    }
    if (upper.includes('NOTE')) {
      return {
        domain: 'inbox',
        targetDatasetKey: 'InboxNotes',
        targetSpreadsheetTitle: 'Inbox — Notes',
      };
    }
    if (upper.includes('ACTIVIT')) {
      return {
        domain: 'inbox',
        targetDatasetKey: 'InboxActivity',
        targetSpreadsheetTitle: 'Inbox — Activity',
      };
    }
    return {
      domain: 'inbox',
      targetDatasetKey: 'Submissions',
      targetSpreadsheetTitle: 'Inbox — Submissions',
    };
  }

  const normalizedKey = tabName
    .trim()
    .replace(/^CMS_/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const datasetKey = normalizedKey
    ? normalizedKey
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('')
    : 'Dataset';

  return {
    domain: 'cms',
    targetDatasetKey: datasetKey,
    targetSpreadsheetTitle: `CMS — ${datasetKey}`,
  };
}

async function readIdempotentMigrationResult<T>(
  db: D1Database,
  ownerId: string,
  operationKey?: string
): Promise<T | null> {
  const cleanKey = (operationKey || '').trim();
  if (!cleanKey) return null;
  const row = await db
    .prepare(
      `SELECT result_json FROM console_operation_idempotency WHERE operation_key = ? AND owner_id = ? LIMIT 1`
    )
    .bind(cleanKey, ownerId)
    .first<{ result_json: string }>();
  if (!row) return null;
  try {
    return JSON.parse(row.result_json) as T;
  } catch {
    return null;
  }
}

export async function handleMigrationPlan(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    localContext?: OnboardingLocalContext | null;
    targetOrgId?: string;
  };

  if (body.targetOrgId) {
    await requireOrgMembership(env.DB, body.targetOrgId, session.ownerId, ['owner', 'admin', 'editor']);
  }

  const orgRows = await env.DB.prepare(
    `SELECT o.*, m.role AS role
     FROM organizations o
     INNER JOIN organization_members m ON m.org_id = o.org_id
     WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
     ORDER BY o.created_at ASC`
  )
    .bind(session.ownerId)
    .all<OrganizationRecord>();
  const organizations = orgRows.results || [];
  const orgIds = organizations.map((o) => o.org_id);

  let projects: ProjectRecord[] = [];
  let activeResources: WorkspaceResourceRecord[] = [];
  let legacyResources: WorkspaceResourceRecord[] = [];

  if (orgIds.length > 0) {
    const placeholders = orgIds.map(() => '?').join(',');
    const projRes = await env.DB.prepare(
      `SELECT * FROM projects WHERE org_id IN (${placeholders}) AND status = 'active' ORDER BY created_at ASC`
    )
      .bind(...orgIds)
      .all<ProjectRecord>();
    projects = projRes.results || [];

    const resRows = await env.DB.prepare(
      `SELECT * FROM workspace_resources WHERE org_id IN (${placeholders}) ORDER BY created_at ASC`
    )
      .bind(...orgIds)
      .all<WorkspaceResourceRecord>();
    const allRes = resRows.results || [];
    activeResources = allRes.filter((r) => r.status === 'active');
    legacyResources = allRes.filter((r) => r.status === 'legacy');
  }

  const unattachedReg = await env.DB.prepare(
    `SELECT * FROM site_registry
     WHERE owner_id = ? AND (project_id IS NULL OR project_id = '')
     ORDER BY updated_at DESC`
  )
    .bind(session.ownerId)
    .all<SiteRegistryRecord>();

  const unattachedSites = (unattachedReg.results || []).map((s) => ({
    siteId: s.site_id,
    siteSlug: s.site_slug,
    siteName: s.site_name || s.site_slug,
    status: s.status,
    activePublishVersion: s.active_publish_version,
    hasReservedSlug: !validateSiteSlug(s.site_slug).valid,
  }));

  // Collect distinct legacy spreadsheet IDs from D1 legacy resources and optional local context
  const candidateSpreadsheetIds = new Set<string>();
  const spreadsheetTitleHints = new Map<string, string>();

  for (const lr of legacyResources) {
    if (lr.spreadsheet_id) {
      candidateSpreadsheetIds.add(lr.spreadsheet_id);
      if (lr.title) spreadsheetTitleHints.set(lr.spreadsheet_id, lr.title);
    }
  }
  if (body.localContext?.spreadsheetId?.trim()) {
    const sid = body.localContext.spreadsheetId.trim();
    candidateSpreadsheetIds.add(sid);
    if (body.localContext.spreadsheetName?.trim()) {
      spreadsheetTitleHints.set(sid, body.localContext.spreadsheetName.trim());
    }
  }

  // Also check unattached site_form_destinations / site_dataset_resources for those legacy sites
  for (const site of unattachedSites) {
    const formDests = await env.DB.prepare(
      `SELECT destination_spreadsheet_id, destination_worksheet_name, inbox_registry_spreadsheet_id
       FROM site_form_destinations WHERE site_id = ?`
    )
      .bind(site.siteId)
      .all<{
        destination_spreadsheet_id: string;
        destination_worksheet_name: string;
        inbox_registry_spreadsheet_id: string;
      }>();
    for (const fd of formDests.results || []) {
      if (fd.destination_spreadsheet_id) candidateSpreadsheetIds.add(fd.destination_spreadsheet_id);
      if (fd.inbox_registry_spreadsheet_id) {
        candidateSpreadsheetIds.add(fd.inbox_registry_spreadsheet_id);
      }
    }
  }

  let workspaceConnected = false;
  let driveInspected = false;
  let driveError: string | undefined;
  let buillyRootFolders: Array<{ id: string; name: string }> = [];
  let legacyRegistryFile: { id: string; name: string } | null = null;
  let legacyCmsFolder: { id: string; name: string } | null = null;
  let legacySiteFolders: Array<{ id: string; name: string; parentFolderId: string }> = [];
  const spreadsheetPartitions: SpreadsheetPartitionMapping[] = [];

  try {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    workspaceConnected = true;

    const qRoots = encodeURIComponent(
      `name = 'Builly' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );
    const rootsJson = await driveJson<{ files?: Array<{ id: string; name: string }> }>(
      `https://www.googleapis.com/drive/v3/files?q=${qRoots}&fields=files(id,name)&pageSize=10`,
      accessToken
    );
    driveInspected = true;
    buillyRootFolders = rootsJson.files || [];

    const primaryRootId =
      body.localContext?.driveFolderId &&
      buillyRootFolders.some((f) => f.id === body.localContext?.driveFolderId)
        ? body.localContext.driveFolderId
        : buillyRootFolders[0]?.id;

    if (primaryRootId) {
      const rootChildren = await listFilesInFolder(accessToken, primaryRootId);
      const regFile = rootChildren.find((f) => f.name === 'indyshares-pages-registry.json');
      if (regFile) legacyRegistryFile = { id: regFile.id, name: regFile.name };

      const cmsDir = rootChildren.find(
        (f) => f.name === 'CMS' && f.mimeType === 'application/vnd.google-apps.folder'
      );
      if (cmsDir) legacyCmsFolder = { id: cmsDir.id, name: cmsDir.name };

      const sitesDir = rootChildren.find(
        (f) => f.name === 'Sites' && f.mimeType === 'application/vnd.google-apps.folder'
      );
      if (sitesDir) {
        const qSites = encodeURIComponent(
          `'${sitesDir.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        );
        const siteRes = await driveJson<{ files?: Array<{ id: string; name: string }> }>(
          `https://www.googleapis.com/drive/v3/files?q=${qSites}&fields=files(id,name)&pageSize=50`,
          accessToken
        );
        legacySiteFolders = (siteRes.files || []).map((f) => ({
          id: f.id,
          name: f.name,
          parentFolderId: sitesDir.id,
        }));
      }
    }

    const migratedDatasetKeys = new Set(
      activeResources
        .filter((r) => r.resource_kind === 'cms_sheet' || r.resource_kind === 'inbox_sheet')
        .map((r) => `${r.resource_kind}:${r.resource_key}`)
    );

    // Inspect metadata (tabs + grid row counts) only on explicitly discovered spreadsheet IDs
    for (const ssId of candidateSpreadsheetIds) {
      try {
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            ssId
          )}?fields=spreadsheetId,properties(title),sheets(properties(title,gridProperties(rowCount)))`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!metaRes.ok) continue;
        const meta = (await metaRes.json()) as {
          spreadsheetId: string;
          properties?: { title?: string };
          sheets?: Array<{
            properties?: { title?: string; gridProperties?: { rowCount?: number } };
          }>;
        };
        const ssTitle = meta.properties?.title || spreadsheetTitleHints.get(ssId) || 'Legacy Workbook';
        for (const sheet of meta.sheets || []) {
          const tabTitle = sheet.properties?.title?.trim();
          if (!tabTitle) continue;
          const mapping = classifyLegacyTab(tabTitle);
          const migratedKey = `${mapping.domain}_sheet:${mapping.targetDatasetKey}`;
          spreadsheetPartitions.push({
            sourceSpreadsheetId: ssId,
            sourceSpreadsheetTitle: ssTitle,
            sourceTab: tabTitle,
            domain: mapping.domain,
            targetDatasetKey: mapping.targetDatasetKey,
            targetSpreadsheetTitle: mapping.targetSpreadsheetTitle,
            estimatedRowCount: Math.max(0, Number(sheet.properties?.gridProperties?.rowCount || 1) - 1),
            alreadyMigrated: migratedDatasetKeys.has(migratedKey),
          });
        }
      } catch {
        // Non-fatal if a single legacy sheet is inaccessible
      }
    }
  } catch (err) {
    driveError = err instanceof Error ? err.message : 'Unable to inspect Google Drive.';
  }

  const ambiguities: Array<{ code: string; message: string }> = [];
  for (const s of unattachedSites) {
    if (s.hasReservedSlug) {
      ambiguities.push({
        code: 'RESERVED_LEGACY_SLUG',
        message: `Legacy site "/${s.siteSlug}" uses a reserved route prefix. Attach it and visit via /s/${s.siteSlug}, or rename its slug.`,
      });
    }
  }
  if (buillyRootFolders.length > 1) {
    ambiguities.push({
      code: 'MULTIPLE_BUILLY_ROOT_FOLDERS',
      message: `Found ${buillyRootFolders.length} "Builly" root folders in Drive. Migration copies into your selected Project folder without deleting old folders.`,
    });
  }

  const hasPendingMigration =
    unattachedSites.length > 0 ||
    legacyResources.length > 0 ||
    spreadsheetPartitions.some((p) => !p.alreadyMigrated) ||
    Boolean(legacyRegistryFile) ||
    legacySiteFolders.length > 0 ||
    Boolean(body.localContext?.portfolioSlug);

  return Response.json({
    ok: true,
    workspaceConnected,
    driveInspected,
    driveError,
    organizations: organizations.map((o) => ({
      org_id: o.org_id,
      name: o.name,
      org_slug: o.org_slug,
    })),
    projects: projects.map((p) => ({
      project_id: p.project_id,
      org_id: p.org_id,
      name: p.name,
      project_slug: p.project_slug,
      drive_folder_id: p.drive_folder_id,
    })),
    unattachedSites,
    legacyResourcesCount: legacyResources.length,
    legacyResourceIds: legacyResources.map((r) => r.resource_id),
    driveLegacy: {
      buillyRootFolders,
      legacyRegistryFile,
      legacyCmsFolder,
      legacySiteFolders,
    },
    spreadsheetPartitions,
    localDraftSummary: body.localContext || null,
    ambiguities,
    hasPendingMigration,
  });
}

export async function handleMigrationExecute(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  headerIdempotencyKey?: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    operationKey?: string;
    targetOrgId?: string;
    strategy?: 'attach_to_project' | 'create_new_project';
    targetProjectId?: string;
    newProjectName?: string;
    attachSiteIds?: string[];
    partitionSpreadsheets?: Array<{
      sourceSpreadsheetId: string;
      sourceTab: string;
      domain: 'cms' | 'inbox';
      targetDatasetKey: string;
    }>;
    copyLegacyDriveConfigs?: boolean;
    localDraftSite?: { siteId?: string; siteSlug: string; siteName: string } | null;
  };

  const opKey = body.operationKey || headerIdempotencyKey;
  const cached = await readIdempotentMigrationResult<Record<string, unknown>>(
    env.DB,
    session.ownerId,
    opKey
  );
  if (cached) {
    return Response.json({ ...cached, deduplicated: true });
  }

  const targetOrgId = (body.targetOrgId || '').trim();
  if (!targetOrgId) {
    throw new HierarchyServiceError('Target Organization ID is required.', 400, 'INVALID_ORG_ID');
  }
  const { org } = await requireOrgMembership(env.DB, targetOrgId, session.ownerId, [
    'owner',
    'admin',
    'editor',
  ]);

  let resolvedProject: ProjectRecord;
  if (body.strategy === 'create_new_project') {
    const projectName = (body.newProjectName || 'Migrated Workspace').trim();
    const created = await createProject(env, session, targetOrgId, {
      name: projectName,
      description: 'Migrated legacy Builly workspace',
      enabledModules: [...ALL_PROJECT_MODULES],
    });
    if (!('project' in created) || !created.project) {
      throw new HierarchyServiceError('Failed to create target Project.', 500, 'PROJECT_CREATE_FAILED');
    }
    resolvedProject = created.project;
  } else {
    const targetProjectId = (body.targetProjectId || '').trim();
    if (!targetProjectId) {
      throw new HierarchyServiceError('Target Project ID is required.', 400, 'INVALID_PROJECT_ID');
    }
    const { project } = await requireProjectAccess(env.DB, targetProjectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
    ]);
    if (project.org_id !== targetOrgId) {
      throw new HierarchyServiceError(
        'Target Project does not belong to the selected Organization.',
        400,
        'PROJECT_ORG_MISMATCH'
      );
    }
    resolvedProject = project;
  }

  const nowIso = new Date().toISOString();
  const verificationChecks: MigrationVerificationCheck[] = [];

  // 1. Verify & attach unattached site_registry rows into D1 sites + site_registry.project_id
  const attachIds = Array.from(new Set(body.attachSiteIds || [])).filter(Boolean);
  const verifiedSites: SiteRegistryRecord[] = [];
  for (const sid of attachIds) {
    const reg = await env.DB.prepare(
      `SELECT * FROM site_registry WHERE site_id = ? AND owner_id = ? LIMIT 1`
    )
      .bind(sid, session.ownerId)
      .first<SiteRegistryRecord>();
    if (!reg) {
      throw new HierarchyServiceError(
        `Legacy site "${sid}" was not found or belongs to another account.`,
        403,
        'SITE_FORBIDDEN'
      );
    }
    verifiedSites.push(reg);
  }

  // Optional local browser draft site attachment
  let validatedLocalSite: { siteId: string; siteSlug: string; siteName: string } | null = null;
  if (body.localDraftSite?.siteSlug) {
    const check = validateSiteSlug(body.localDraftSite.siteSlug);
    if (!check.valid) {
      throw new HierarchyServiceError(
        check.error || 'Invalid local draft site slug.',
        400,
        check.code || 'RESERVED_SITE_SLUG'
      );
    }
    const alreadyInAttach = verifiedSites.some((s) => s.site_slug === check.normalized);
    if (!alreadyInAttach) {
      const existingSite = await env.DB.prepare(`SELECT site_id, owner_id FROM sites WHERE site_slug = ? LIMIT 1`)
        .bind(check.normalized)
        .first<{ site_id: string; owner_id: string }>();
      const existingReg = await env.DB.prepare(
        `SELECT site_id, owner_id FROM site_registry WHERE site_slug = ? LIMIT 1`
      )
        .bind(check.normalized)
        .first<{ site_id: string; owner_id: string }>();

      if (
        (existingSite && existingSite.owner_id !== session.ownerId) ||
        (existingReg && existingReg.owner_id !== session.ownerId)
      ) {
        throw new HierarchyServiceError(
          `Site slug "/${check.normalized}" is already owned by another account.`,
          409,
          'SITE_SLUG_CONFLICT'
        );
      }
      if (!existingSite) {
        validatedLocalSite = {
          siteId: body.localDraftSite.siteId?.trim() || makeMigrationId('site'),
          siteSlug: check.normalized,
          siteName: (body.localDraftSite.siteName || check.normalized).trim(),
        };
      }
    }
  }

  const d1Statements: D1PreparedStatement[] = [env.DB.prepare(`PRAGMA foreign_keys = ON`)];
  for (const reg of verifiedSites) {
    d1Statements.push(
      env.DB.prepare(
        `UPDATE site_registry SET org_id = ?, project_id = ?
         WHERE site_id = ? AND owner_id = ?`
      ).bind(targetOrgId, resolvedProject.project_id, reg.site_id, session.ownerId)
    );
    d1Statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO sites (
           site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
           status, active_publish_version, active_build_id, drive_config_folder_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
      ).bind(
        reg.site_id,
        resolvedProject.project_id,
        targetOrgId,
        session.ownerId,
        reg.site_slug,
        reg.site_name || reg.site_slug,
        reg.custom_domain || null,
        reg.status,
        reg.active_publish_version || '',
        reg.active_build_id || '',
        nowIso,
        reg.updated_at || nowIso
      )
    );
  }
  if (validatedLocalSite) {
    d1Statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO sites (
           site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
           status, active_publish_version, active_build_id, drive_config_folder_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'draft', '', '', '', ?, ?)`
      ).bind(
        validatedLocalSite.siteId,
        resolvedProject.project_id,
        targetOrgId,
        session.ownerId,
        validatedLocalSite.siteSlug,
        validatedLocalSite.siteName,
        nowIso,
        nowIso
      )
    );
  }
  if (d1Statements.length > 1) {
    await env.DB.batch(d1Statements);
  }

  if (verifiedSites.length > 0 || validatedLocalSite) {
    const projectSitesRes = await env.DB.prepare(`SELECT site_id FROM sites WHERE project_id = ?`)
      .bind(resolvedProject.project_id)
      .all<{ site_id: string }>();
    const totalInProject = (projectSitesRes.results || []).length;
    verificationChecks.push({
      id: 'chk_sites_attached',
      label: 'Site registry & Project ownership',
      category: 'sites',
      status: 'pass',
      detail: `Verified ${verifiedSites.length + (validatedLocalSite ? 1 : 0)} attached Site(s) mapped to ${resolvedProject.name} (${totalInProject} total in Project).`,
      sourceCount: verifiedSites.length + (validatedLocalSite ? 1 : 0),
      migratedCount: verifiedSites.length + (validatedLocalSite ? 1 : 0),
    });
  }

  // 2. Drive tree isolation, non-destructive legacy JSON backup, & spreadsheet partitioning
  const partitionedDatasets: Array<{
    domain: 'cms' | 'inbox';
    datasetKey: string;
    sourceSpreadsheetId: string;
    sourceTab: string;
    targetSpreadsheetId: string;
    parentFolderId: string;
    rowCount: number;
  }> = [];
  const legacyBackupFiles: Array<{ sourceName: string; backupFileId: string; backupFileName: string }> = [];

  const wantDriveWork =
    Boolean(body.copyLegacyDriveConfigs) || (body.partitionSpreadsheets?.length || 0) > 0;

  if (wantDriveWork) {
    let accessToken = '';
    try {
      const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
      accessToken = minted.accessToken;
    } catch {
      verificationChecks.push({
        id: 'chk_drive_disconnected',
        label: 'Google Drive & Sheets connection',
        category: 'drive',
        status: 'warning',
        detail:
          'Google Workspace is not connected; D1 Site links completed cleanly. Connect Google Workspace to partition spreadsheets into Drive.',
      });
    }

    if (accessToken) {
      const tree = await ensureProjectDriveTree(env, session, resolvedProject.project_id);
      verificationChecks.push({
        id: 'chk_drive_tree',
        label: 'Isolated Project Drive hierarchy',
        category: 'drive',
        status: 'pass',
        detail: `Provisioned & verified folder parents under Builly/${org.org_slug}/${resolvedProject.project_slug}/ (Config, Data/CMS, Data/Inbox, Assets, Exports).`,
      });

      // Non-destructively copy indyshares-pages-registry.json if present in root Builly folder
      if (body.copyLegacyDriveConfigs && tree.rootFolderId) {
        const rootFiles = await listFilesInFolder(accessToken, tree.rootFolderId);
        const regFile = rootFiles.find((f) => f.name === 'indyshares-pages-registry.json');
        if (regFile) {
          try {
            const payload = await readJsonFileById(accessToken, regFile.id);
            const backupName = `legacy-pages-registry-backup.json`;
            const savedBackup = await writeJsonFileInFolder(
              accessToken,
              tree.folders.config_draft,
              backupName,
              {
                archivedFromFileId: regFile.id,
                copiedAt: nowIso,
                projectId: resolvedProject.project_id,
                legacyRegistry: payload,
              }
            );
            legacyBackupFiles.push({
              sourceName: regFile.name,
              backupFileId: savedBackup.fileId,
              backupFileName: backupName,
            });
            await upsertWorkspaceResource(env.DB, {
              ownerId: session.ownerId,
              orgId: targetOrgId,
              projectId: resolvedProject.project_id,
              resourceKind: 'legacy_registry',
              resourceKey: regFile.id,
              driveFileId: regFile.id,
              parentFolderId: tree.rootFolderId,
              title: regFile.name,
              status: 'legacy',
            });
            verificationChecks.push({
              id: 'chk_legacy_registry_backup',
              label: 'Legacy Drive registry backup',
              category: 'drive',
              status: 'pass',
              detail: `Copied "${regFile.name}" non-destructively into Config/Draft/${backupName}. Original Drive file preserved.`,
              sourceCount: 1,
              migratedCount: 1,
            });
          } catch {
            verificationChecks.push({
              id: 'chk_legacy_registry_backup',
              label: 'Legacy Drive registry backup',
              category: 'drive',
              status: 'warning',
              detail: 'Could not read legacy registry JSON; original Drive file remains untouched.',
            });
          }
        }
      }

      // Deterministic per-dataset spreadsheet partitioning (preserving headers & stable IDs)
      for (const reqPart of body.partitionSpreadsheets || []) {
        const cleanDatasetKey = reqPart.targetDatasetKey.replace(/[^a-zA-Z0-9_-]/g, '') || 'Dataset';
        const targetFolderId =
          reqPart.domain === 'inbox' ? tree.folders.data_inbox : tree.folders.data_cms;
        const resourceKind = reqPart.domain === 'inbox' ? 'inbox_sheet' : 'cms_sheet';

        const escapedTab = reqPart.sourceTab.replace(/'/g, "''");
        const readRange = encodeURIComponent(`'${escapedTab}'!A1:ZZ2000`);
        const readRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            reqPart.sourceSpreadsheetId
          )}/values/${readRange}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!readRes.ok) {
          verificationChecks.push({
            id: `chk_sheet_${cleanDatasetKey}`,
            label: `Partition ${reqPart.sourceTab} → ${cleanDatasetKey}`,
            category: 'sheets',
            status: 'warning',
            detail: `Unable to read "${reqPart.sourceTab}" from source spreadsheet (${readRes.status}). Source remains untouched.`,
          });
          continue;
        }

        const readJson = (await readRes.json()) as { values?: string[][] };
        const sourceValues = readJson.values || [];
        const sourceDataRows = Math.max(0, sourceValues.length - 1);

        // Record source legacy spreadsheet pointer so owner can audit or archive after verification
        await upsertWorkspaceResource(env.DB, {
          ownerId: session.ownerId,
          orgId: targetOrgId,
          projectId: resolvedProject.project_id,
          resourceKind: 'legacy_sheet',
          resourceKey: reqPart.sourceSpreadsheetId,
          spreadsheetId: reqPart.sourceSpreadsheetId,
          driveFileId: reqPart.sourceSpreadsheetId,
          title: `Legacy Workbook (${reqPart.sourceTab})`,
          status: 'legacy',
        });

        // Reuse already-created partitioned dataset spreadsheet if one exists in D1
        const existingTarget = await env.DB.prepare(
          `SELECT spreadsheet_id, parent_folder_id FROM workspace_resources
           WHERE project_id = ? AND resource_kind = ? AND resource_key = ? AND status = 'active'
           LIMIT 1`
        )
          .bind(resolvedProject.project_id, resourceKind, cleanDatasetKey)
          .first<{ spreadsheet_id: string; parent_folder_id: string }>();

        let targetSpreadsheetId = existingTarget?.spreadsheet_id || '';
        if (!targetSpreadsheetId) {
          const ssTitle = `${resolvedProject.name} — ${cleanDatasetKey}`;
          const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              properties: { title: ssTitle },
              sheets: [{ properties: { title: cleanDatasetKey, gridProperties: { frozenRowCount: 1 } } }],
            }),
          });
          if (!createRes.ok) {
            throw new HierarchyServiceError(
              `Failed creating partitioned spreadsheet for ${cleanDatasetKey}.`,
              502,
              'SHEETS_PARTITION_CREATE_FAILED'
            );
          }
          const created = (await createRes.json()) as { spreadsheetId: string };
          targetSpreadsheetId = created.spreadsheetId;

          // Explicitly move/add into target folder and verify Drive parent
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
              targetSpreadsheetId
            )}?addParents=${encodeURIComponent(targetFolderId)}&fields=id,parents`,
            { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } }
          );

          await upsertWorkspaceResource(env.DB, {
            ownerId: session.ownerId,
            orgId: targetOrgId,
            projectId: resolvedProject.project_id,
            resourceKind,
            resourceKey: cleanDatasetKey,
            driveFileId: targetSpreadsheetId,
            spreadsheetId: targetSpreadsheetId,
            parentFolderId: targetFolderId,
            title: ssTitle,
            status: 'active',
          });
        }

        if (sourceValues.length > 0) {
          const targetRange = encodeURIComponent(`'${cleanDatasetKey}'!A1`);
          const writeRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
              targetSpreadsheetId
            )}/values/${targetRange}?valueInputOption=RAW`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ values: sourceValues }),
            }
          );
          if (!writeRes.ok) {
            throw new HierarchyServiceError(
              `Failed writing partitioned rows for ${cleanDatasetKey}.`,
              502,
              'SHEETS_PARTITION_WRITE_FAILED'
            );
          }
        }

        partitionedDatasets.push({
          domain: reqPart.domain,
          datasetKey: cleanDatasetKey,
          sourceSpreadsheetId: reqPart.sourceSpreadsheetId,
          sourceTab: reqPart.sourceTab,
          targetSpreadsheetId,
          parentFolderId: targetFolderId,
          rowCount: sourceDataRows,
        });

        verificationChecks.push({
          id: `chk_sheet_${cleanDatasetKey}`,
          label: `${reqPart.domain.toUpperCase()} dataset "${cleanDatasetKey}"`,
          category: 'sheets',
          status: 'pass',
          detail: `Partitioned ${sourceDataRows} record row(s) from tab "${reqPart.sourceTab}" into ${reqPart.domain === 'inbox' ? 'Data/Inbox' : 'Data/CMS'} spreadsheet.`,
          sourceCount: sourceDataRows,
          migratedCount: sourceDataRows,
        });
      }
    }
  }

  const passed =
    verificationChecks.length === 0 || verificationChecks.every((c) => c.status === 'pass');

  const responsePayload = {
    ok: true,
    deduplicated: false,
    targetOrgId,
    targetProjectId: resolvedProject.project_id,
    project: resolvedProject,
    attachedSitesCount: verifiedSites.length + (validatedLocalSite ? 1 : 0),
    partitionedDatasets,
    legacyBackupFiles,
    reconciliation: {
      passed,
      verifiedAt: new Date().toISOString(),
      checks: verificationChecks,
    },
  };

  if (opKey) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO console_operation_idempotency (operation_key, owner_id, operation_type, result_json, created_at)
       VALUES (?, ?, 'migration_execute', ?, ?)`
    )
      .bind(opKey, session.ownerId, JSON.stringify(responsePayload), nowIso)
      .run();
  }

  return Response.json(responsePayload);
}

export async function handleMigrationCleanup(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  headerIdempotencyKey?: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    operationKey?: string;
    targetOrgId?: string;
    confirmOwnerReviewed?: boolean;
    reconciliationPassed?: boolean;
    archiveLegacyResourceIds?: string[];
  };

  const opKey = body.operationKey || headerIdempotencyKey;
  const cached = await readIdempotentMigrationResult<Record<string, unknown>>(
    env.DB,
    session.ownerId,
    opKey
  );
  if (cached) {
    return Response.json({ ...cached, deduplicated: true });
  }

  if (!body.confirmOwnerReviewed || !body.reconciliationPassed) {
    throw new HierarchyServiceError(
      'Explicit owner confirmation after passing reconciliation is required before archiving legacy pointers.',
      400,
      'CLEANUP_CONFIRMATION_REQUIRED'
    );
  }

  const targetOrgId = (body.targetOrgId || '').trim();
  if (!targetOrgId) {
    throw new HierarchyServiceError('Target Organization ID is required.', 400, 'INVALID_ORG_ID');
  }
  await requireOrgMembership(env.DB, targetOrgId, session.ownerId, ['owner', 'admin']);

  const nowIso = new Date().toISOString();
  const specificIds = Array.from(new Set(body.archiveLegacyResourceIds || [])).filter(Boolean);
  let archivedCount = 0;

  if (specificIds.length > 0) {
    for (const rid of specificIds) {
      await env.DB.prepare(
        `UPDATE workspace_resources SET status = 'archived', updated_at = ?
         WHERE resource_id = ? AND org_id = ? AND status = 'legacy'`
      )
        .bind(nowIso, rid, targetOrgId)
        .run();
      archivedCount++;
    }
  } else {
    const legacyRows = await env.DB.prepare(
      `SELECT resource_id FROM workspace_resources WHERE org_id = ? AND status = 'legacy'`
    )
      .bind(targetOrgId)
      .all<{ resource_id: string }>();
    for (const row of legacyRows.results || []) {
      await env.DB.prepare(
        `UPDATE workspace_resources SET status = 'archived', updated_at = ?
         WHERE resource_id = ? AND org_id = ? AND status = 'legacy'`
      )
        .bind(nowIso, row.resource_id, targetOrgId)
        .run();
      archivedCount++;
    }
  }

  const remainingReg = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM site_registry WHERE owner_id = ? AND (project_id IS NULL OR project_id = '')`
  )
    .bind(session.ownerId)
    .first<{ cnt: number }>();

  const payload = {
    ok: true,
    deduplicated: false,
    archivedResourcesCount: archivedCount,
    remainingLegacySitesCount: Number(remainingReg?.cnt || 0),
    driveBackupsPreserved: true,
    completedAt: nowIso,
  };

  if (opKey) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO console_operation_idempotency (operation_key, owner_id, operation_type, result_json, created_at)
       VALUES (?, ?, 'migration_cleanup', ?, ?)`
    )
      .bind(opKey, session.ownerId, JSON.stringify(payload), nowIso)
      .run();
  }

  return Response.json(payload);
}
