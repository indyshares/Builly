import { VerifiedSession, WorkerEnv } from '../types';
import { getSafeWorkspaceStatus, mintOwnerGoogleAccessToken } from './googleTokenVault';
import {
  normalizeSlug,
  SiteRegistryRecord,
  validateSiteSlug,
} from './siteRegistryService';

export type OrganizationRole = 'owner' | 'admin' | 'editor' | 'viewer';

export type ProjectModuleKey =
  | 'builder'
  | 'cms'
  | 'inbox'
  | 'assets'
  | 'publishing'
  | 'versions'
  | 'settings';

export const ALL_PROJECT_MODULES: readonly ProjectModuleKey[] = [
  'builder',
  'cms',
  'inbox',
  'assets',
  'publishing',
  'versions',
  'settings',
];

export interface OrganizationRecord {
  org_id: string;
  owner_id: string;
  name: string;
  org_slug: string;
  drive_folder_id: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  role?: OrganizationRole;
}

export interface ProjectRecord {
  project_id: string;
  org_id: string;
  owner_id: string;
  name: string;
  project_slug: string;
  description: string;
  drive_folder_id: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface ProjectModuleRecord {
  id: string;
  project_id: string;
  module_key: ProjectModuleKey;
  enabled: number;
  config_json: string;
  updated_at: string;
}

export interface SiteRecord {
  site_id: string;
  project_id: string;
  org_id: string;
  owner_id: string;
  site_slug: string;
  site_name: string;
  custom_domain: string | null;
  status: 'draft' | 'published' | 'suspended';
  active_publish_version: string;
  active_build_id: string;
  drive_config_folder_id: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceResourceRecord {
  resource_id: string;
  owner_id: string;
  org_id: string;
  project_id: string | null;
  site_id: string | null;
  resource_kind: string;
  resource_key: string;
  drive_file_id: string;
  spreadsheet_id: string;
  parent_folder_id: string;
  title: string;
  status: 'active' | 'legacy' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface OnboardingLocalContext {
  siteId?: string;
  siteName?: string;
  portfolioSlug?: string;
  spreadsheetId?: string;
  spreadsheetName?: string;
  driveFolderId?: string;
  hasCustomPages?: boolean;
  pageCount?: number;
}

export interface OnboardingAmbiguity {
  code:
    | 'MULTIPLE_BUILLY_ROOT_FOLDERS'
    | 'LOCAL_AND_REMOTE_SLUG_MISMATCH'
    | 'MULTIPLE_LEGACY_SITES'
    | 'RESERVED_LEGACY_SLUG'
    | 'DRIVE_INSPECTION_UNAVAILABLE';
  message: string;
  candidates?: Array<{ id: string; label: string; slug?: string }>;
}

export interface OnboardingInspectionResult {
  existingOrganizationsCount: number;
  googleWorkspace: {
    connected: boolean;
    needsReauth: boolean;
    accountEmail: string;
  };
  unattachedRegistrySites: Array<{
    siteId: string;
    siteSlug: string;
    siteName: string;
    status: string;
    activePublishVersion: string;
    hasReservedSlug: boolean;
  }>;
  unattachedDatasetsCount: number;
  unattachedFormDestinationsCount: number;
  driveDiscovery: {
    inspected: boolean;
    rootFolders: Array<{ id: string; name: string }>;
    siteFolders: Array<{ id: string; name: string; parentFolderId: string }>;
    hasLegacyRegistryFile: boolean;
    legacyRegistryFileId?: string;
    hasLegacyCmsFolder: boolean;
    legacyCmsFolderId?: string;
    error?: string;
  };
  localDraftSummary: OnboardingLocalContext | null;
  suggestedOrgName: string;
  suggestedProjectName: string;
  proposedAttachments: Array<{
    kind: 'registry_site' | 'drive_root' | 'local_site_draft' | 'linked_spreadsheet';
    id: string;
    label: string;
    detail: string;
  }>;
  ambiguities: OnboardingAmbiguity[];
  requiresUserConfirmation: boolean;
}

export class HierarchyServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'HIERARCHY_ERROR') {
    super(message);
    this.name = 'HierarchyServiceError';
    this.status = status;
    this.code = code;
  }
}

function makeId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

export function slugifyWorkspaceName(raw: string, fallback = 'workspace'): string {
  const base = normalizeSlug(raw).slice(0, 40);
  if (base.length >= 3) return base;
  if (base.length > 0) return `${base}-ws`;
  return fallback;
}

async function ensureUniqueOrgSlug(
  db: D1Database,
  ownerId: string,
  desiredName: string
): Promise<string> {
  const base = slugifyWorkspaceName(desiredName, 'personal');
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const existing = await db
      .prepare(`SELECT org_id FROM organizations WHERE owner_id = ? AND org_slug = ? LIMIT 1`)
      .bind(ownerId, candidate)
      .first<{ org_id: string }>();
    if (!existing) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function ensureUniqueProjectSlug(
  db: D1Database,
  orgId: string,
  desiredName: string
): Promise<string> {
  const base = slugifyWorkspaceName(desiredName, 'workspace');
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const existing = await db
      .prepare(`SELECT project_id FROM projects WHERE org_id = ? AND project_slug = ? LIMIT 1`)
      .bind(orgId, candidate)
      .first<{ project_id: string }>();
    if (!existing) return candidate;
    candidate = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function requireOrgMembership(
  db: D1Database,
  orgId: string,
  userId: string,
  allowedRoles: readonly OrganizationRole[] = ['owner', 'admin', 'editor', 'viewer']
): Promise<{ org: OrganizationRecord; role: OrganizationRole }> {
  const row = await db
    .prepare(
      `SELECT o.*, m.role AS member_role
       FROM organizations o
       INNER JOIN organization_members m ON m.org_id = o.org_id
       WHERE o.org_id = ? AND m.user_id = ? AND m.status = 'active' AND o.status = 'active'
       LIMIT 1`
    )
    .bind(orgId, userId)
    .first<OrganizationRecord & { member_role: OrganizationRole }>();

  if (!row) {
    throw new HierarchyServiceError(
      'Organization not found or you do not have access.',
      403,
      'ORG_FORBIDDEN'
    );
  }
  if (!allowedRoles.includes(row.member_role)) {
    throw new HierarchyServiceError(
      'Insufficient organization permissions for this action.',
      403,
      'INSUFFICIENT_ROLE'
    );
  }

  return { org: row, role: row.member_role };
}

export async function requireProjectAccess(
  db: D1Database,
  projectId: string,
  userId: string,
  allowedRoles: readonly OrganizationRole[] = ['owner', 'admin', 'editor', 'viewer']
): Promise<{ project: ProjectRecord; role: OrganizationRole }> {
  const row = await db
    .prepare(
      `SELECT p.*, m.role AS member_role
       FROM projects p
       INNER JOIN organization_members m ON m.org_id = p.org_id
       WHERE p.project_id = ? AND m.user_id = ? AND m.status = 'active' AND p.status = 'active'
       LIMIT 1`
    )
    .bind(projectId, userId)
    .first<ProjectRecord & { member_role: OrganizationRole }>();

  if (!row) {
    throw new HierarchyServiceError(
      'Project not found or you do not have access.',
      403,
      'PROJECT_FORBIDDEN'
    );
  }
  if (!allowedRoles.includes(row.member_role)) {
    throw new HierarchyServiceError(
      'Insufficient project permissions for this action.',
      403,
      'INSUFFICIENT_ROLE'
    );
  }

  return { project: row, role: row.member_role };
}

async function readIdempotentResult<T>(
  db: D1Database,
  ownerId: string,
  operationKey?: string | null
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

export async function getConsoleBootstrap(
  env: WorkerEnv,
  session: VerifiedSession
) {
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
  let modules: ProjectModuleRecord[] = [];
  let sites: SiteRecord[] = [];
  let resources: WorkspaceResourceRecord[] = [];

  if (orgIds.length > 0) {
    const placeholders = orgIds.map(() => '?').join(',');
    const projRes = await env.DB.prepare(
      `SELECT * FROM projects WHERE org_id IN (${placeholders}) AND status = 'active' ORDER BY created_at ASC`
    )
      .bind(...orgIds)
      .all<ProjectRecord>();
    projects = projRes.results || [];

    const sitesRes = await env.DB.prepare(
      `SELECT * FROM sites WHERE org_id IN (${placeholders}) ORDER BY created_at ASC`
    )
      .bind(...orgIds)
      .all<SiteRecord>();
    sites = sitesRes.results || [];

    const resRows = await env.DB.prepare(
      `SELECT * FROM workspace_resources WHERE org_id IN (${placeholders}) ORDER BY created_at ASC`
    )
      .bind(...orgIds)
      .all<WorkspaceResourceRecord>();
    resources = resRows.results || [];

    if (projects.length > 0) {
      const pPlaceholders = projects.map(() => '?').join(',');
      const modRows = await env.DB.prepare(
        `SELECT * FROM project_modules WHERE project_id IN (${pPlaceholders})`
      )
        .bind(...projects.map((p) => p.project_id))
        .all<ProjectModuleRecord>();
      modules = modRows.results || [];
    }
  }

  const unattachedReg = await env.DB.prepare(
    `SELECT * FROM site_registry
     WHERE owner_id = ? AND (project_id IS NULL OR project_id = '')
     ORDER BY updated_at DESC`
  )
    .bind(session.ownerId)
    .all<SiteRegistryRecord>();

  const googleWorkspace = await getSafeWorkspaceStatus(env, session.ownerId);

  return {
    account: {
      ownerId: session.ownerId,
      email: session.email,
    },
    needsOnboarding: organizations.length === 0,
    googleWorkspace,
    organizations,
    projects,
    modules,
    sites,
    resources,
    unattachedLegacySites: (unattachedReg.results || []).map((s) => ({
      siteId: s.site_id,
      siteSlug: s.site_slug,
      siteName: s.site_name,
      status: s.status,
      activePublishVersion: s.active_publish_version,
    })),
  };
}

export async function inspectOnboardingState(
  env: WorkerEnv,
  session: VerifiedSession,
  localContext?: OnboardingLocalContext | null
): Promise<OnboardingInspectionResult> {
  const existingOrgCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM organization_members WHERE user_id = ? AND status = 'active'`
  )
    .bind(session.ownerId)
    .first<{ cnt: number }>();
  const existingOrganizationsCount = Number(existingOrgCountRow?.cnt || 0);

  const googleStatus = await getSafeWorkspaceStatus(env, session.ownerId);

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

  const datasetCntRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM site_dataset_resources WHERE owner_id = ?`
  )
    .bind(session.ownerId)
    .first<{ cnt: number }>();
  const formDestCntRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM site_form_destinations WHERE owner_id = ?`
  )
    .bind(session.ownerId)
    .first<{ cnt: number }>();

  const ambiguities: OnboardingAmbiguity[] = [];
  const proposedAttachments: OnboardingInspectionResult['proposedAttachments'] = [];

  const driveDiscovery: OnboardingInspectionResult['driveDiscovery'] = {
    inspected: false,
    rootFolders: [],
    siteFolders: [],
    hasLegacyRegistryFile: false,
    hasLegacyCmsFolder: false,
  };

  if (googleStatus.connected) {
    try {
      const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
      const qRoots = encodeURIComponent(
        `name = 'Builly' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
      );
      const rootsRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${qRoots}&fields=files(id,name)&pageSize=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (rootsRes.ok) {
        const rootsJson = (await rootsRes.json()) as { files?: Array<{ id: string; name: string }> };
        driveDiscovery.inspected = true;
        driveDiscovery.rootFolders = rootsJson.files || [];

        if (driveDiscovery.rootFolders.length > 1) {
          ambiguities.push({
            code: 'MULTIPLE_BUILLY_ROOT_FOLDERS',
            message:
              'Multiple "Builly" folders were found in your Google Drive. Confirm which root folder to attach or keep separate.',
            candidates: driveDiscovery.rootFolders.map((f) => ({ id: f.id, label: `${f.name} (${f.id.slice(0, 8)})` })),
          });
        }

        if (driveDiscovery.rootFolders.length >= 1) {
          const primaryRootId =
            localContext?.driveFolderId &&
            driveDiscovery.rootFolders.some((f) => f.id === localContext.driveFolderId)
              ? localContext.driveFolderId
              : driveDiscovery.rootFolders[0].id;

          proposedAttachments.push({
            kind: 'drive_root',
            id: primaryRootId,
            label: 'Google Drive "Builly" Root Folder',
            detail: `Folder ID ${primaryRootId}`,
          });

          const qChildren = encodeURIComponent(`'${primaryRootId}' in parents and trashed = false`);
          const childrenRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${qChildren}&fields=files(id,name,mimeType)&pageSize=50`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (childrenRes.ok) {
            const childrenJson = (await childrenRes.json()) as {
              files?: Array<{ id: string; name: string; mimeType: string }>;
            };
            const children = childrenJson.files || [];
            const regFile = children.find((f) => f.name === 'indyshares-pages-registry.json');
            if (regFile) {
              driveDiscovery.hasLegacyRegistryFile = true;
              driveDiscovery.legacyRegistryFileId = regFile.id;
            }
            const cmsFolder = children.find(
              (f) => f.name === 'CMS' && f.mimeType === 'application/vnd.google-apps.folder'
            );
            if (cmsFolder) {
              driveDiscovery.hasLegacyCmsFolder = true;
              driveDiscovery.legacyCmsFolderId = cmsFolder.id;
            }
            const sitesFolder = children.find(
              (f) => f.name === 'Sites' && f.mimeType === 'application/vnd.google-apps.folder'
            );
            if (sitesFolder) {
              const qSites = encodeURIComponent(
                `'${sitesFolder.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
              );
              const sitesRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${qSites}&fields=files(id,name)&pageSize=50`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (sitesRes.ok) {
                const sitesJson = (await sitesRes.json()) as {
                  files?: Array<{ id: string; name: string }>;
                };
                driveDiscovery.siteFolders = (sitesJson.files || []).map((sf) => ({
                  id: sf.id,
                  name: sf.name,
                  parentFolderId: sitesFolder.id,
                }));
              }
            }
          }
        }
      }
    } catch (err) {
      driveDiscovery.error = err instanceof Error ? err.message : 'Drive inspection failed.';
      ambiguities.push({
        code: 'DRIVE_INSPECTION_UNAVAILABLE',
        message:
          'Google Drive could not be inspected right now. Your existing Drive files will remain untouched; you can attach them later.',
      });
    }
  }

  for (const s of unattachedSites) {
    proposedAttachments.push({
      kind: 'registry_site',
      id: s.siteId,
      label: `Published Site: /${s.siteSlug}`,
      detail: `${s.siteName} (${s.status})`,
    });
    if (s.hasReservedSlug) {
      ambiguities.push({
        code: 'RESERVED_LEGACY_SLUG',
        message: `Existing published site "/${s.siteSlug}" uses a newly reserved route segment. It remains reachable at /s/${s.siteSlug}, and we recommend renaming it after onboarding.`,
        candidates: [{ id: s.siteId, label: s.siteName, slug: s.siteSlug }],
      });
    }
  }

  if (unattachedSites.length > 1) {
    ambiguities.push({
      code: 'MULTIPLE_LEGACY_SITES',
      message: `Found ${unattachedSites.length} existing published sites on your account. Please confirm which ones to attach to your initial Project (others can be placed in separate Projects later).`,
      candidates: unattachedSites.map((s) => ({
        id: s.siteId,
        label: s.siteName,
        slug: s.siteSlug,
      })),
    });
  }

  const localSlug = (localContext?.portfolioSlug || '').trim().toLowerCase();
  if (localSlug) {
    const matchesExisting = unattachedSites.some((s) => s.siteSlug === localSlug);
    if (!matchesExisting) {
      if (unattachedSites.length > 0) {
        ambiguities.push({
          code: 'LOCAL_AND_REMOTE_SLUG_MISMATCH',
          message: `Browser local draft uses slug "/${localSlug}", which differs from existing published site(s) (${unattachedSites
            .map((s) => `/${s.siteSlug}`)
            .join(', ')}). Confirm whether to attach local draft as an additional Site or keep them separate.`,
          candidates: [
            { id: localContext?.siteId || 'local_draft', label: `Local Draft: ${localContext?.siteName || localSlug}`, slug: localSlug },
            ...unattachedSites.map((s) => ({ id: s.siteId, label: `Published: ${s.siteName}`, slug: s.siteSlug })),
          ],
        });
      } else {
        proposedAttachments.push({
          kind: 'local_site_draft',
          id: localContext?.siteId || 'local_draft',
          label: `Local Builder Draft: ${localContext?.siteName || localSlug}`,
          detail: `Slug /${localSlug}`,
        });
      }
    }
  }

  if (localContext?.spreadsheetId) {
    proposedAttachments.push({
      kind: 'linked_spreadsheet',
      id: localContext.spreadsheetId,
      label: localContext.spreadsheetName || 'Linked Google Spreadsheet',
      detail: `Spreadsheet ID ${localContext.spreadsheetId}`,
    });
  }

  const emailLocalPart = (session.email || '').split('@')[0]?.trim();
  const suggestedOrgName = emailLocalPart ? `${emailLocalPart}'s Organization` : 'Personal Organization';
  const suggestedProjectName =
    localContext?.siteName?.trim() ||
    unattachedSites[0]?.siteName ||
    'My Workspace';

  return {
    existingOrganizationsCount,
    googleWorkspace: {
      connected: googleStatus.connected,
      needsReauth: googleStatus.needsReauth,
      accountEmail: googleStatus.account?.email || '',
    },
    unattachedRegistrySites: unattachedSites,
    unattachedDatasetsCount: Number(datasetCntRow?.cnt || 0),
    unattachedFormDestinationsCount: Number(formDestCntRow?.cnt || 0),
    driveDiscovery,
    localDraftSummary: localContext || null,
    suggestedOrgName,
    suggestedProjectName,
    proposedAttachments,
    ambiguities,
    requiresUserConfirmation: ambiguities.length > 0,
  };
}

export interface CompleteOnboardingInput {
  operationKey?: string;
  organizationName: string;
  projectName?: string;
  projectDescription?: string;
  enabledModules?: ProjectModuleKey[];
  attachSiteIds?: string[];
  driveRootFolderId?: string;
  legacySpreadsheetId?: string;
  legacySpreadsheetName?: string;
  localDraftSite?: {
    siteId?: string;
    siteSlug: string;
    siteName: string;
  };
}

export async function completeOnboarding(
  env: WorkerEnv,
  session: VerifiedSession,
  input: CompleteOnboardingInput
) {
  const cached = await readIdempotentResult<Record<string, unknown>>(
    env.DB,
    session.ownerId,
    input.operationKey
  );
  if (cached) {
    return { ...cached, deduplicated: true };
  }

  const orgName = (input.organizationName || '').trim();
  if (orgName.length < 2 || orgName.length > 80) {
    throw new HierarchyServiceError(
      'Organization name must be between 2 and 80 characters.',
      400,
      'INVALID_ORG_NAME'
    );
  }

  const projectName = (input.projectName || 'My Workspace').trim() || 'My Workspace';
  const nowIso = new Date().toISOString();
  const orgId = makeId('org');
  const memberId = makeId('mem');
  const projectId = makeId('prj');
  const orgSlug = await ensureUniqueOrgSlug(env.DB, session.ownerId, orgName);
  const projectSlug = await ensureUniqueProjectSlug(env.DB, orgId, projectName);

  const selectedModules = new Set<ProjectModuleKey>(
    input.enabledModules && input.enabledModules.length > 0
      ? input.enabledModules
      : ALL_PROJECT_MODULES
  );

  // Verify any confirmed existing D1 sites actually belong to this verified owner
  const attachSiteIds = Array.from(new Set(input.attachSiteIds || [])).filter(Boolean);
  const verifiedRegistrySites: SiteRegistryRecord[] = [];
  for (const sid of attachSiteIds) {
    const regRow = await env.DB.prepare(
      `SELECT * FROM site_registry WHERE site_id = ? AND owner_id = ? LIMIT 1`
    )
      .bind(sid, session.ownerId)
      .first<SiteRegistryRecord>();
    if (!regRow) {
      throw new HierarchyServiceError(
        `Site "${sid}" was not found or is not owned by your account.`,
        403,
        'SITE_FORBIDDEN'
      );
    }
    verifiedRegistrySites.push(regRow);
  }

  // Validate optional new local draft site before touching DB
  let validatedLocalSite: { siteId: string; siteSlug: string; siteName: string } | null = null;
  if (input.localDraftSite?.siteSlug) {
    const check = validateSiteSlug(input.localDraftSite.siteSlug);
    if (!check.valid) {
      throw new HierarchyServiceError(
        check.error || 'Invalid site slug.',
        400,
        check.code || 'RESERVED_SITE_SLUG'
      );
    }
    const alreadyAttached = verifiedRegistrySites.some((s) => s.site_slug === check.normalized);
    if (!alreadyAttached) {
      const conflictInSites = await env.DB.prepare(
        `SELECT site_id, owner_id FROM sites WHERE site_slug = ? LIMIT 1`
      )
        .bind(check.normalized)
        .first<{ site_id: string; owner_id: string }>();
      const conflictInReg = await env.DB.prepare(
        `SELECT site_id, owner_id FROM site_registry WHERE site_slug = ? LIMIT 1`
      )
        .bind(check.normalized)
        .first<{ site_id: string; owner_id: string }>();

      if (
        (conflictInSites && conflictInSites.owner_id !== session.ownerId) ||
        (conflictInReg && conflictInReg.owner_id !== session.ownerId)
      ) {
        throw new HierarchyServiceError(
          `Site slug "/${check.normalized}" is already in use.`,
          409,
          'SITE_SLUG_CONFLICT'
        );
      }

      if (!conflictInSites) {
        validatedLocalSite = {
          siteId: input.localDraftSite.siteId?.trim() || makeId('site'),
          siteSlug: check.normalized,
          siteName: (input.localDraftSite.siteName || check.normalized).trim(),
        };
      }
    }
  }

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
    env.DB.prepare(
      `INSERT INTO organizations (org_id, owner_id, name, org_slug, drive_folder_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(
      orgId,
      session.ownerId,
      orgName,
      orgSlug,
      input.driveRootFolderId || '',
      nowIso,
      nowIso
    ),
    env.DB.prepare(
      `INSERT INTO organization_members (member_id, org_id, user_id, email, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)`
    ).bind(memberId, orgId, session.ownerId, session.email || '', nowIso, nowIso),
    env.DB.prepare(
      `INSERT INTO projects (project_id, org_id, owner_id, name, project_slug, description, drive_folder_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', 'active', ?, ?)`
    ).bind(
      projectId,
      orgId,
      session.ownerId,
      projectName,
      projectSlug,
      (input.projectDescription || '').trim(),
      nowIso,
      nowIso
    ),
  ];

  for (const modKey of ALL_PROJECT_MODULES) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO project_modules (id, project_id, module_key, enabled, config_json, updated_at)
         VALUES (?, ?, ?, ?, '{}', ?)`
      ).bind(
        `mod_${projectId}_${modKey}`,
        projectId,
        modKey,
        selectedModules.has(modKey) ? 1 : 0,
        nowIso
      )
    );
  }

  for (const reg of verifiedRegistrySites) {
    statements.push(
      env.DB.prepare(
        `UPDATE site_registry
         SET org_id = ?, project_id = ?
         WHERE site_id = ? AND owner_id = ? AND (project_id IS NULL OR project_id = '')`
      ).bind(orgId, projectId, reg.site_id, session.ownerId)
    );
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO sites (
           site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
           status, active_publish_version, active_build_id, drive_config_folder_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
      ).bind(
        reg.site_id,
        projectId,
        orgId,
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
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO sites (
           site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
           status, active_publish_version, active_build_id, drive_config_folder_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'draft', '', '', '', ?, ?)`
      ).bind(
        validatedLocalSite.siteId,
        projectId,
        orgId,
        session.ownerId,
        validatedLocalSite.siteSlug,
        validatedLocalSite.siteName,
        nowIso,
        nowIso
      )
    );
  }

  if (input.driveRootFolderId) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO workspace_resources (
           resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
           drive_file_id, spreadsheet_id, parent_folder_id, title, status, created_at, updated_at
         ) VALUES (?, ?, ?, NULL, NULL, 'builly_root', 'default', ?, '', '', 'Builly', 'active', ?, ?)`
      ).bind(makeId('wres'), session.ownerId, orgId, input.driveRootFolderId, nowIso, nowIso)
    );
  }

  if (input.legacySpreadsheetId) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO workspace_resources (
           resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
           drive_file_id, spreadsheet_id, parent_folder_id, title, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, NULL, 'legacy_sheet', ?, '', ?, '', ?, 'legacy', ?, ?)`
      ).bind(
        makeId('wres'),
        session.ownerId,
        orgId,
        projectId,
        input.legacySpreadsheetId,
        input.legacySpreadsheetId,
        input.legacySpreadsheetName || 'Legacy Spreadsheet',
        nowIso,
        nowIso
      )
    );
  }

  const responsePayload = {
    ok: true,
    organization: {
      org_id: orgId,
      owner_id: session.ownerId,
      name: orgName,
      org_slug: orgSlug,
      drive_folder_id: input.driveRootFolderId || '',
      status: 'active' as const,
      created_at: nowIso,
      updated_at: nowIso,
      role: 'owner' as const,
    },
    project: {
      project_id: projectId,
      org_id: orgId,
      owner_id: session.ownerId,
      name: projectName,
      project_slug: projectSlug,
      description: (input.projectDescription || '').trim(),
      drive_folder_id: '',
      status: 'active' as const,
      created_at: nowIso,
      updated_at: nowIso,
    },
    attachedSitesCount: verifiedRegistrySites.length + (validatedLocalSite ? 1 : 0),
  };

  if (input.operationKey?.trim()) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO console_operation_idempotency (operation_key, owner_id, operation_type, result_json, created_at)
         VALUES (?, ?, 'onboarding_complete', ?, ?)`
      ).bind(
        input.operationKey.trim(),
        session.ownerId,
        JSON.stringify(responsePayload),
        nowIso
      )
    );
  }

  await env.DB.batch(statements);
  return { ...responsePayload, deduplicated: false };
}

export async function createOrganization(
  env: WorkerEnv,
  session: VerifiedSession,
  input: { name: string; operationKey?: string }
) {
  const cached = await readIdempotentResult<Record<string, unknown>>(
    env.DB,
    session.ownerId,
    input.operationKey
  );
  if (cached) return { ...cached, deduplicated: true };

  const name = (input.name || '').trim();
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError('Organization name must be 2–80 characters.', 400, 'INVALID_ORG_NAME');
  }

  const orgCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM organizations WHERE owner_id = ? AND status = 'active'`
  )
    .bind(session.ownerId)
    .first<{ cnt: number }>();
  if (Number(orgCountRow?.cnt || 0) >= 10) {
    throw new HierarchyServiceError(
      'Organization limit reached (maximum 10 active Organizations per account).',
      409,
      'ORG_LIMIT_REACHED'
    );
  }

  const orgId = makeId('org');
  const memberId = makeId('mem');
  const orgSlug = await ensureUniqueOrgSlug(env.DB, session.ownerId, name);
  const nowIso = new Date().toISOString();

  const payload = {
    ok: true,
    organization: {
      org_id: orgId,
      owner_id: session.ownerId,
      name,
      org_slug: orgSlug,
      drive_folder_id: '',
      status: 'active' as const,
      created_at: nowIso,
      updated_at: nowIso,
      role: 'owner' as const,
    },
  };

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
    env.DB.prepare(
      `INSERT INTO organizations (org_id, owner_id, name, org_slug, drive_folder_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', 'active', ?, ?)`
    ).bind(orgId, session.ownerId, name, orgSlug, nowIso, nowIso),
    env.DB.prepare(
      `INSERT INTO organization_members (member_id, org_id, user_id, email, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)`
    ).bind(memberId, orgId, session.ownerId, session.email || '', nowIso, nowIso),
  ];

  if (input.operationKey?.trim()) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO console_operation_idempotency (operation_key, owner_id, operation_type, result_json, created_at)
         VALUES (?, ?, 'create_organization', ?, ?)`
      ).bind(input.operationKey.trim(), session.ownerId, JSON.stringify(payload), nowIso)
    );
  }

  await env.DB.batch(statements);
  return { ...payload, deduplicated: false };
}

export async function updateOrganization(
  env: WorkerEnv,
  session: VerifiedSession,
  orgId: string,
  input: { name?: string }
) {
  const { org } = await requireOrgMembership(env.DB, orgId, session.ownerId, ['owner', 'admin']);
  const name = input.name !== undefined ? input.name.trim() : org.name;
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError('Organization name must be 2–80 characters.', 400, 'INVALID_ORG_NAME');
  }

  const nowIso = new Date().toISOString();
  await env.DB.prepare(`UPDATE organizations SET name = ?, updated_at = ? WHERE org_id = ?`)
    .bind(name, nowIso, orgId)
    .run();

  return { ok: true, organization: { ...org, name, updated_at: nowIso } };
}

export async function createProject(
  env: WorkerEnv,
  session: VerifiedSession,
  orgId: string,
  input: {
    name: string;
    description?: string;
    enabledModules?: ProjectModuleKey[];
    operationKey?: string;
  }
) {
  const cached = await readIdempotentResult<Record<string, unknown>>(
    env.DB,
    session.ownerId,
    input.operationKey
  );
  if (cached) return { ...cached, deduplicated: true };

  await requireOrgMembership(env.DB, orgId, session.ownerId, ['owner', 'admin', 'editor']);
  const name = (input.name || '').trim();
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError('Project name must be 2–80 characters.', 400, 'INVALID_PROJECT_NAME');
  }

  const projectCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ? AND status = 'active'`
  )
    .bind(orgId)
    .first<{ cnt: number }>();
  if (Number(projectCountRow?.cnt || 0) >= 10) {
    throw new HierarchyServiceError(
      'Project limit reached (maximum 10 active Projects per Organization).',
      409,
      'PROJECT_LIMIT_REACHED'
    );
  }

  const projectId = makeId('prj');
  const projectSlug = await ensureUniqueProjectSlug(env.DB, orgId, name);
  const nowIso = new Date().toISOString();
  const description = (input.description || '').trim();
  const enabledSet = new Set<ProjectModuleKey>(
    input.enabledModules && input.enabledModules.length > 0
      ? input.enabledModules
      : ALL_PROJECT_MODULES
  );

  const modules: ProjectModuleRecord[] = ALL_PROJECT_MODULES.map((m) => ({
    id: `mod_${projectId}_${m}`,
    project_id: projectId,
    module_key: m,
    enabled: enabledSet.has(m) ? 1 : 0,
    config_json: '{}',
    updated_at: nowIso,
  }));

  const payload = {
    ok: true,
    project: {
      project_id: projectId,
      org_id: orgId,
      owner_id: session.ownerId,
      name,
      project_slug: projectSlug,
      description,
      drive_folder_id: '',
      status: 'active' as const,
      created_at: nowIso,
      updated_at: nowIso,
    },
    modules,
  };

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
    env.DB.prepare(
      `INSERT INTO projects (project_id, org_id, owner_id, name, project_slug, description, drive_folder_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', 'active', ?, ?)`
    ).bind(projectId, orgId, session.ownerId, name, projectSlug, description, nowIso, nowIso),
    ...modules.map((m) =>
      env.DB.prepare(
        `INSERT INTO project_modules (id, project_id, module_key, enabled, config_json, updated_at)
         VALUES (?, ?, ?, ?, '{}', ?)`
      ).bind(m.id, projectId, m.module_key, m.enabled, nowIso)
    ),
  ];

  if (input.operationKey?.trim()) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO console_operation_idempotency (operation_key, owner_id, operation_type, result_json, created_at)
         VALUES (?, ?, 'create_project', ?, ?)`
      ).bind(input.operationKey.trim(), session.ownerId, JSON.stringify(payload), nowIso)
    );
  }

  await env.DB.batch(statements);
  return { ...payload, deduplicated: false };
}

export async function updateProject(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  input: { name?: string; description?: string }
) {
  const { project } = await requireProjectAccess(env.DB, projectId, session.ownerId, [
    'owner',
    'admin',
    'editor',
  ]);
  const name = input.name !== undefined ? input.name.trim() : project.name;
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError('Project name must be 2–80 characters.', 400, 'INVALID_PROJECT_NAME');
  }
  const description =
    input.description !== undefined ? input.description.trim() : project.description;
  const nowIso = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE project_id = ?`
  )
    .bind(name, description, nowIso, projectId)
    .run();

  return { ok: true, project: { ...project, name, description, updated_at: nowIso } };
}

export async function updateProjectModules(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  modules: Array<{ moduleKey: ProjectModuleKey; enabled: boolean }>
) {
  await requireProjectAccess(env.DB, projectId, session.ownerId, ['owner', 'admin']);
  const nowIso = new Date().toISOString();
  const validMods = modules.filter((m) => ALL_PROJECT_MODULES.includes(m.moduleKey));
  if (validMods.length === 0) {
    throw new HierarchyServiceError('No valid modules specified.', 400, 'INVALID_MODULES');
  }

  await env.DB.batch([
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
    ...validMods.map((m) =>
      env.DB.prepare(
        `INSERT INTO project_modules (id, project_id, module_key, enabled, config_json, updated_at)
         VALUES (?, ?, ?, ?, '{}', ?)
         ON CONFLICT(project_id, module_key) DO UPDATE SET
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`
      ).bind(`mod_${projectId}_${m.moduleKey}`, projectId, m.moduleKey, m.enabled ? 1 : 0, nowIso)
    ),
  ]);

  const rows = await env.DB.prepare(`SELECT * FROM project_modules WHERE project_id = ?`)
    .bind(projectId)
    .all<ProjectModuleRecord>();
  return { ok: true, modules: rows.results || [] };
}

export async function createSiteInProject(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  input: { siteName: string; siteSlug: string; operationKey?: string }
) {
  const cached = await readIdempotentResult<Record<string, unknown>>(
    env.DB,
    session.ownerId,
    input.operationKey
  );
  if (cached) return { ...cached, deduplicated: true };

  const { project } = await requireProjectAccess(env.DB, projectId, session.ownerId, [
    'owner',
    'admin',
    'editor',
  ]);
  const slugCheck = validateSiteSlug(input.siteSlug);
  if (!slugCheck.valid) {
    throw new HierarchyServiceError(
      slugCheck.error || 'Invalid site slug.',
      400,
      slugCheck.code || 'RESERVED_SITE_SLUG'
    );
  }

  const siteName = (input.siteName || slugCheck.normalized).trim();
  if (siteName.length < 1 || siteName.length > 80) {
    throw new HierarchyServiceError('Site name is required (1–80 chars).', 400, 'INVALID_SITE_NAME');
  }

  const existingSite = await env.DB.prepare(
    `SELECT site_id FROM sites WHERE site_slug = ? LIMIT 1`
  )
    .bind(slugCheck.normalized)
    .first<{ site_id: string }>();
  const existingReg = await env.DB.prepare(
    `SELECT site_id FROM site_registry WHERE site_slug = ? LIMIT 1`
  )
    .bind(slugCheck.normalized)
    .first<{ site_id: string }>();

  if (existingSite || existingReg) {
    throw new HierarchyServiceError(
      `Site slug "/${slugCheck.normalized}" is already in use.`,
      409,
      'SITE_SLUG_CONFLICT'
    );
  }

  const siteId = makeId('site');
  const nowIso = new Date().toISOString();
  const site: SiteRecord = {
    site_id: siteId,
    project_id: projectId,
    org_id: project.org_id,
    owner_id: project.owner_id,
    site_slug: slugCheck.normalized,
    site_name: siteName,
    custom_domain: null,
    status: 'draft',
    active_publish_version: '',
    active_build_id: '',
    drive_config_folder_id: '',
    created_at: nowIso,
    updated_at: nowIso,
  };

  const payload = { ok: true, site };
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
    env.DB.prepare(
      `INSERT INTO sites (
         site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
         status, active_publish_version, active_build_id, drive_config_folder_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'draft', '', '', '', ?, ?)`
    ).bind(
      siteId,
      projectId,
      project.org_id,
      project.owner_id,
      slugCheck.normalized,
      siteName,
      nowIso,
      nowIso
    ),
  ];

  if (input.operationKey?.trim()) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO console_operation_idempotency (operation_key, owner_id, operation_type, result_json, created_at)
         VALUES (?, ?, 'create_site', ?, ?)`
      ).bind(input.operationKey.trim(), session.ownerId, JSON.stringify(payload), nowIso)
    );
  }

  await env.DB.batch(statements);
  return { ...payload, deduplicated: false };
}

export async function updateSiteInProject(
  env: WorkerEnv,
  session: VerifiedSession,
  siteId: string,
  input: { siteName?: string; siteSlug?: string }
) {
  const row = await env.DB.prepare(
    `SELECT s.*, m.role AS member_role
     FROM sites s
     INNER JOIN organization_members m ON m.org_id = s.org_id
     WHERE s.site_id = ? AND m.user_id = ? AND m.status = 'active'
     LIMIT 1`
  )
    .bind(siteId, session.ownerId)
    .first<SiteRecord & { member_role: OrganizationRole }>();

  if (!row) {
    throw new HierarchyServiceError('Site not found or access denied.', 403, 'SITE_FORBIDDEN');
  }
  if (!['owner', 'admin', 'editor'].includes(row.member_role)) {
    throw new HierarchyServiceError('Insufficient permissions to modify this site.', 403, 'INSUFFICIENT_ROLE');
  }

  let nextSlug = row.site_slug;
  if (input.siteSlug !== undefined) {
    const check = validateSiteSlug(input.siteSlug);
    if (!check.valid) {
      throw new HierarchyServiceError(
        check.error || 'Invalid or reserved site slug.',
        400,
        check.code || 'RESERVED_SITE_SLUG'
      );
    }
    if (check.normalized !== row.site_slug) {
      const conflictSite = await env.DB.prepare(
        `SELECT site_id FROM sites WHERE site_slug = ? AND site_id != ? LIMIT 1`
      )
        .bind(check.normalized, siteId)
        .first<{ site_id: string }>();
      const conflictReg = await env.DB.prepare(
        `SELECT site_id FROM site_registry WHERE site_slug = ? AND site_id != ? LIMIT 1`
      )
        .bind(check.normalized, siteId)
        .first<{ site_id: string }>();
      if (conflictSite || conflictReg) {
        throw new HierarchyServiceError(
          `Site slug "/${check.normalized}" is already in use.`,
          409,
          'SITE_SLUG_CONFLICT'
        );
      }
      nextSlug = check.normalized;
    }
  }

  const nextName = input.siteName !== undefined ? input.siteName.trim() : row.site_name;
  if (!nextName || nextName.length > 80) {
    throw new HierarchyServiceError('Site name must be 1–80 characters.', 400, 'INVALID_SITE_NAME');
  }
  const nowIso = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
    env.DB.prepare(
      `UPDATE sites SET site_name = ?, site_slug = ?, updated_at = ? WHERE site_id = ?`
    ).bind(nextName, nextSlug, nowIso, siteId),
    env.DB.prepare(
      `UPDATE site_registry SET site_name = ?, site_slug = ?, updated_at = ? WHERE site_id = ? AND owner_id = ?`
    ).bind(nextName, nextSlug, nowIso, siteId, row.owner_id),
  ]);

  return {
    ok: true,
    site: {
      ...row,
      site_name: nextName,
      site_slug: nextSlug,
      updated_at: nowIso,
    },
  };
}
