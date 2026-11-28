import { VerifiedSession, WorkerEnv } from '../types';
import {
  DRIVE_FOLDER_MIME,
  driveFetchWithRetry,
  ensureMarkerFolder,
  findBuillyRootCandidates,
  findDriveChildren,
  readDriveJsonWithConcurrency,
  verifyDriveParent,
  writeCanonicalDriveJson,
} from './driveCanonicalClient';
import {
  AccountManifestDoc,
  bootstrapAccountDrive,
  ACCOUNT_MANIFEST_FILENAME,
  ORGANIZATION_MANIFEST_FILENAME,
  OrganizationManifestDoc,
  ORGANIZATIONS_INDEX_FILENAME,
  OrganizationProjectsIndexDoc,
  OrganizationsIndexDoc,
  PROJECT_CONFIG_FILENAME,
  PROJECT_MANIFEST_FILENAME,
  PROJECT_MODULES_FILENAME,
  ProjectManifestDoc,
  ProjectModulesManifestDoc,
  PROJECTS_INDEX_FILENAME,
  SITE_CONFIG_FILENAME,
  SITE_MANIFEST_FILENAME,
  SiteManifestDoc,
  upsertCanonicalResourceRegistryEntry,
} from './driveManifestService';
import { getSafeWorkspaceStatus, mintOwnerGoogleAccessToken } from './googleTokenVault';
import { readManagementCache, writeManagementCache } from './managementCacheService';
import {
  generateOperationId,
  listAccountOperationsFromD1,
  runSagaWithJournal,
} from './operationJournalService';
import { listPendingProjectionRepairs } from './projectionRepairService';
import {
  normalizeSlug,
  SiteRegistryRecord,
  validateSiteSlug,
} from './siteRegistryService';
import { BuillyTransactionError } from './transactionErrors';

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
  canonical_revision?: number;
  projected_at?: string;
  projection_status?: string;
  last_operation_id?: string;
  drive_manifest_file_id?: string;
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
  canonical_revision?: number;
  projected_at?: string;
  projection_status?: string;
  last_operation_id?: string;
  drive_manifest_file_id?: string;
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
  canonical_revision?: number;
  projected_at?: string;
  projection_status?: string;
  last_operation_id?: string;
  drive_manifest_file_id?: string;
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
  canonical_revision?: number;
  last_operation_id?: string;
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

async function requireGoogleWriteAccess(
  env: WorkerEnv,
  ownerId: string,
  operationId: string
): Promise<string> {
  try {
    const minted = await mintOwnerGoogleAccessToken(env, ownerId);
    return minted.accessToken;
  } catch {
    throw new BuillyTransactionError(
      'WRITE_DISABLED_OAUTH_UNAVAILABLE',
      'Google Workspace connection is unavailable or expired. Writes are disabled in read-only mode until you reconnect Google.',
      { operationId, status: 503, retryable: false }
    );
  }
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
  allowedRoles: readonly OrganizationRole[] = ['owner', 'admin', 'editor', 'viewer'],
  options?: { allowArchived?: boolean }
): Promise<{ org: OrganizationRecord; role: OrganizationRole }> {
  const row = await db
    .prepare(
      options?.allowArchived
        ? `SELECT o.*, m.role AS member_role
           FROM organizations o
           INNER JOIN organization_members m ON m.org_id = o.org_id
           WHERE o.org_id = ? AND m.user_id = ? AND m.status = 'active'
           LIMIT 1`
        : `SELECT o.*, m.role AS member_role
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
  allowedRoles: readonly OrganizationRole[] = ['owner', 'admin', 'editor', 'viewer'],
  options?: { allowArchived?: boolean }
): Promise<{ project: ProjectRecord; role: OrganizationRole }> {
  const row = await db
    .prepare(
      options?.allowArchived
        ? `SELECT p.*, m.role AS member_role
           FROM projects p
           INNER JOIN organization_members m ON m.org_id = p.org_id
           WHERE p.project_id = ? AND m.user_id = ? AND m.status = 'active'
           LIMIT 1`
        : `SELECT p.*, m.role AS member_role
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

export async function getConsoleBootstrap(env: WorkerEnv, session: VerifiedSession) {
  const googleWorkspace = await getSafeWorkspaceStatus(env, session.ownerId);

  const orgRows = await env.DB.prepare(
    `SELECT o.*, m.role AS role
     FROM organizations o
     INNER JOIN organization_members m ON m.org_id = o.org_id
     WHERE m.user_id = ? AND m.status = 'active'
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
      `SELECT * FROM projects WHERE org_id IN (${placeholders}) ORDER BY created_at ASC`
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

  const pendingRepairs = await listPendingProjectionRepairs(env.DB, session.ownerId);
  const recentOps = await listAccountOperationsFromD1(env.DB, session.ownerId, 20);
  const needsReconciliationOps = recentOps.filter((o) => o.status === 'needs_reconciliation');

  const unattachedLegacySites = (unattachedReg.results || []).map((s) => ({
    siteId: s.site_id,
    siteSlug: s.site_slug,
    siteName: s.site_name,
    status: s.status,
    activePublishVersion: s.active_publish_version,
  }));

  const liveSnapshot = {
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
    unattachedLegacySites,
    pendingRepairsCount: pendingRepairs.length,
    needsReconciliationCount: needsReconciliationOps.length,
    needsReconciliationOps: needsReconciliationOps.map((o) => ({
      operationId: o.operation_id,
      operationType: o.operation_type,
      updatedAt: o.updated_at,
      error: o.error,
    })),
  };

  if (googleWorkspace.connected) {
    let driveReachable = true;
    try {
      await mintOwnerGoogleAccessToken(env, session.ownerId);
    } catch {
      driveReachable = false;
    }

    if (driveReachable) {
      const synced = await writeManagementCache(env.DB, {
        ownerId: session.ownerId,
        resourceType: 'console_bootstrap',
        resourceId: 'default',
        canonicalRevision: 1,
        payload: {
          organizations,
          projects,
          modules,
          sites,
          resources,
          unattachedLegacySites,
        },
        ttlSeconds: 3600,
      }).catch(() => ({ fetchedAt: new Date().toISOString(), lastSyncedAt: new Date().toISOString() }));

      return {
        ...liveSnapshot,
        readOnly: false,
        stale: false,
        unavailable: false,
        lastSyncedAt: synced.lastSyncedAt,
        outageReason: null,
      };
    }
  }

  // OAuth / Google Drive disconnected or unreachable -> Read authorized cache ONLY, read-only!
  const cached = await readManagementCache<{
    organizations: OrganizationRecord[];
    projects: ProjectRecord[];
    modules: ProjectModuleRecord[];
    sites: SiteRecord[];
    resources: WorkspaceResourceRecord[];
    unattachedLegacySites: typeof unattachedLegacySites;
  }>(env.DB, {
    ownerId: session.ownerId,
    resourceType: 'console_bootstrap',
    resourceId: 'default',
  });

  if (cached) {
    return {
      account: liveSnapshot.account,
      needsOnboarding: cached.payload.organizations.length === 0,
      googleWorkspace: {
        ...googleWorkspace,
        connected: false,
      },
      organizations: cached.payload.organizations,
      projects: cached.payload.projects,
      modules: cached.payload.modules,
      sites: cached.payload.sites,
      resources: cached.payload.resources,
      unattachedLegacySites: cached.payload.unattachedLegacySites || unattachedLegacySites,
      pendingRepairsCount: pendingRepairs.length,
      needsReconciliationCount: needsReconciliationOps.length,
      needsReconciliationOps: liveSnapshot.needsReconciliationOps,
      readOnly: true,
      stale: true,
      unavailable: false,
      lastSyncedAt: cached.lastSyncedAt,
      outageReason: googleWorkspace.needsReauth ? 'OAUTH_REAUTH_REQUIRED' : 'OAUTH_UNAVAILABLE',
    };
  }

  const hadPriorConnectionOrData = googleWorkspace.needsReauth || organizations.length > 0;
  return {
    ...liveSnapshot,
    readOnly: true,
    stale: hadPriorConnectionOrData,
    unavailable: hadPriorConnectionOrData,
    needsReconnect: googleWorkspace.needsReauth,
    lastSyncedAt: googleWorkspace.updatedAt || null,
    outageReason: googleWorkspace.needsReauth
      ? 'OAUTH_REAUTH_REQUIRED'
      : googleWorkspace.account
      ? 'OAUTH_UNAVAILABLE'
      : 'GOOGLE_NOT_CONNECTED',
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
      const candidates = await findBuillyRootCandidates(accessToken);
      driveDiscovery.inspected = true;
      driveDiscovery.rootFolders = candidates.map((f) => ({ id: f.id, name: f.name }));

      if (driveDiscovery.rootFolders.length > 1) {
        ambiguities.push({
          code: 'MULTIPLE_BUILLY_ROOT_FOLDERS',
          message:
            'Multiple "Builly" folders were found in your Google Drive. Confirm which root folder to attach or keep separate.',
          candidates: driveDiscovery.rootFolders.map((f) => ({
            id: f.id,
            label: `${f.name} (${f.id.slice(0, 8)})`,
          })),
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

        const children = await findDriveChildren(accessToken, { parentId: primaryRootId });
        const regFile = children.find((f) => f.name === 'indyshares-pages-registry.json');
        if (regFile) {
          driveDiscovery.hasLegacyRegistryFile = true;
          driveDiscovery.legacyRegistryFileId = regFile.id;
        }
        const cmsFolder = children.find(
          (f) => f.name === 'CMS' && f.mimeType === DRIVE_FOLDER_MIME
        );
        if (cmsFolder) {
          driveDiscovery.hasLegacyCmsFolder = true;
          driveDiscovery.legacyCmsFolderId = cmsFolder.id;
        }
        const sitesFolder = children.find(
          (f) => f.name === 'Sites' && f.mimeType === DRIVE_FOLDER_MIME
        );
        if (sitesFolder) {
          const siteFolders = await findDriveChildren(accessToken, {
            parentId: sitesFolder.id,
            mimeType: DRIVE_FOLDER_MIME,
          });
          driveDiscovery.siteFolders = siteFolders.map((sf) => ({
            id: sf.id,
            name: sf.name,
            parentFolderId: sitesFolder.id,
          }));
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
            {
              id: localContext?.siteId || 'local_draft',
              label: `Local Draft: ${localContext?.siteName || localSlug}`,
              slug: localSlug,
            },
            ...unattachedSites.map((s) => ({
              id: s.siteId,
              label: `Published: ${s.siteName}`,
              slug: s.siteSlug,
            })),
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
  const suggestedOrgName = emailLocalPart
    ? `${emailLocalPart}'s Organization`
    : 'Personal Organization';
  const suggestedProjectName =
    localContext?.siteName?.trim() || unattachedSites[0]?.siteName || 'My Workspace';

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
  operationId?: string;
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
  const operationId = (input.operationId || input.operationKey || '').trim() || generateOperationId('op_onb');
  const accessToken = await requireGoogleWriteAccess(env, session.ownerId, operationId);

  const orgName = (input.organizationName || '').trim();
  if (orgName.length < 2 || orgName.length > 80) {
    throw new HierarchyServiceError(
      'Organization name must be between 2 and 80 characters.',
      400,
      'INVALID_ORG_NAME'
    );
  }

  const projectName = (input.projectName || 'My Workspace').trim() || 'My Workspace';
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

  const orgId = makeId('org');
  const memberId = makeId('mem');
  const projectId = makeId('prj');
  const orgSlug = await ensureUniqueOrgSlug(env.DB, session.ownerId, orgName);
  const projectSlug = await ensureUniqueProjectSlug(env.DB, orgId, projectName);
  const selectedModules = Array.from(
    new Set<ProjectModuleKey>(
      input.enabledModules && input.enabledModules.length > 0
        ? input.enabledModules
        : ALL_PROJECT_MODULES
    )
  );
  const selectedModulesSet = new Set(selectedModules);

  let bootRef!: Awaited<ReturnType<typeof bootstrapAccountDrive>>;
  let orgFolderId = '';
  let orgProjectsFolderId = '';
  let orgManifestFileId = '';
  let projectFolderId = '';
  let projectManifestFileId = '';
  let configRootId = '';
  let configDraftId = '';
  let configPublishedId = '';
  let sitesFolderId = '';
  let dataRootId = '';
  let dataCmsId = '';
  let dataInboxId = '';
  let assetsRootId = '';
  let exportsRootId = '';
  const nowIso = new Date().toISOString();

  const attachedSiteMetaMap = new Map<string, { folderId: string; manifestFileId: string }>();

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'COMPLETE_ONBOARDING',
    ownerId: session.ownerId,
    scopeKey: `account:${session.ownerId}`,
    payloadForHash: {
      op: 'complete_onboarding',
      organizationName: orgName,
      projectName,
      enabledModules: [...selectedModules].sort(),
      attachSiteIds,
      driveRootFolderId: input.driveRootFolderId || '',
      localDraftSite: input.localDraftSite || null,
    },
    target: { organization_id: orgId, project_id: projectId },
    accessToken,
    repairResourceType: 'organization',
    repairResourceId: orgId,
    leaseMs: 300_000,
    steps: [
      {
        key: 'bootstrap_account_root',
        async run(ctx) {
          bootRef = await bootstrapAccountDrive(env, ctx.accessToken, session.ownerId, {
            selectedRootFolderId: input.driveRootFolderId,
            operationId,
          });
          ctx.setOperationsFolderId(bootRef.operationsFolderId);
          ctx.setDiscoveredId('rootFolderId', bootRef.rootFolderId);
          ctx.setDiscoveredId('systemFolderId', bootRef.systemFolderId);
          return {
            resource_id: session.ownerId,
            drive_file_id: bootRef.rootFolderId,
            parent_id: 'root',
          };
        },
      },
      {
        key: 'create_organization_tree',
        async run(ctx) {
          const nonDeletedOrgs = bootRef.organizationsIndex.organizations.filter(
            (o) => o.status !== 'deleted'
          );
          if (nonDeletedOrgs.length >= 10) {
            throw new HierarchyServiceError(
              'Organization limit reached (maximum 10 Organizations per account, including archived).',
              409,
              'ORG_LIMIT_REACHED'
            );
          }

          const orgF = await ensureMarkerFolder(ctx.accessToken, {
            parentId: bootRef.organizationsFolderId,
            name: orgId,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: orgId,
              resource_type: 'org_root',
              org_id: orgId,
              schema_version: '1',
            },
          });
          orgFolderId = orgF.folder.id;

          const projectsF = await ensureMarkerFolder(ctx.accessToken, {
            parentId: orgFolderId,
            name: 'Projects',
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${orgId}:projects`,
              resource_type: 'org_projects_folder',
              org_id: orgId,
              schema_version: '1',
            },
          });
          orgProjectsFolderId = projectsF.folder.id;

          const orgManifest: OrganizationManifestDoc = {
            schema_version: 1,
            organization_id: orgId,
            owner_account_id: session.ownerId,
            name: orgName,
            slug: orgSlug,
            status: 'active',
            folder_id: orgFolderId,
            projects_folder_id: orgProjectsFolderId,
            projects_index_file_id: '',
            revision: 1,
            last_operation_id: operationId,
            created_at: nowIso,
            updated_at: nowIso,
          };

          const savedOrgMan = await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: orgFolderId,
            fileName: ORGANIZATION_MANIFEST_FILENAME,
            payload: orgManifest as unknown as Record<string, unknown>,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: orgId,
              resource_type: 'organization_manifest',
              org_id: orgId,
              schema_version: '1',
            },
          });
          orgManifestFileId = savedOrgMan.fileId;

          const projIdxDoc: OrganizationProjectsIndexDoc = {
            schema_version: 1,
            organization_id: orgId,
            projects: [],
            revision: 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: orgFolderId,
            fileName: PROJECTS_INDEX_FILENAME,
            payload: projIdxDoc as unknown as Record<string, unknown>,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${orgId}:projects_index`,
              resource_type: 'projects_index',
              org_id: orgId,
              schema_version: '1',
            },
          });

          ctx.setDiscoveredId('orgFolderId', orgFolderId);
          return {
            resource_id: orgId,
            drive_file_id: orgFolderId,
            parent_id: bootRef.organizationsFolderId,
          };
        },
      },
      {
        key: 'create_project_tree_and_manifests',
        async run(ctx) {
          const projF = await ensureMarkerFolder(ctx.accessToken, {
            parentId: orgProjectsFolderId,
            name: projectId,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: projectId,
              resource_type: 'project_root',
              org_id: orgId,
              project_id: projectId,
              schema_version: '1',
            },
          });
          projectFolderId = projF.folder.id;

          configRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Config',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config`,
                resource_type: 'config_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          configDraftId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: configRootId,
              name: 'Draft',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config_draft`,
                resource_type: 'config_draft',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          configPublishedId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: configRootId,
              name: 'Published',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config_published`,
                resource_type: 'config_published',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          sitesFolderId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: configRootId,
              name: 'Sites',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config_sites`,
                resource_type: 'config_sites',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          dataRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Data',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:data`,
                resource_type: 'data_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          dataCmsId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: dataRootId,
              name: 'CMS',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:data_cms`,
                resource_type: 'data_cms',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          dataInboxId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: dataRootId,
              name: 'Inbox',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:data_inbox`,
                resource_type: 'data_inbox',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          assetsRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Assets',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:assets`,
                resource_type: 'assets_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          exportsRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Exports',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:exports`,
                resource_type: 'exports_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;

          const projectManifest: ProjectManifestDoc = {
            schema_version: 1,
            project_id: projectId,
            organization_id: orgId,
            name: projectName,
            slug: projectSlug,
            description: (input.projectDescription || '').trim(),
            status: 'active',
            folder_id: projectFolderId,
            config_folder_id: configRootId,
            config_draft_folder_id: configDraftId,
            config_published_folder_id: configPublishedId,
            sites_folder_id: sitesFolderId,
            data_folder_id: dataRootId,
            data_cms_folder_id: dataCmsId,
            data_inbox_folder_id: dataInboxId,
            assets_folder_id: assetsRootId,
            exports_folder_id: exportsRootId,
            enabled_module_keys: selectedModules,
            revision: 1,
            last_operation_id: operationId,
            created_at: nowIso,
            updated_at: nowIso,
          };

          const savedProjMan = await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: projectFolderId,
            fileName: PROJECT_MANIFEST_FILENAME,
            payload: projectManifest as unknown as Record<string, unknown>,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: projectId,
              resource_type: 'project_manifest',
              org_id: orgId,
              project_id: projectId,
              schema_version: '1',
            },
          });
          projectManifestFileId = savedProjMan.fileId;

          const modulesDoc: ProjectModulesManifestDoc = {
            schema_version: 1,
            project_id: projectId,
            modules: Object.fromEntries(
              ALL_PROJECT_MODULES.map((m) => [m, { enabled: selectedModulesSet.has(m) }])
            ),
            revision: 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: configRootId,
            fileName: PROJECT_MODULES_FILENAME,
            payload: modulesDoc as unknown as Record<string, unknown>,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${projectId}:modules`,
              resource_type: 'project_modules',
              project_id: projectId,
              schema_version: '1',
            },
          });

          // Write canonical site.json for explicitly attached / local draft sites
          for (const reg of verifiedRegistrySites) {
            const siteFolder = await ensureMarkerFolder(ctx.accessToken, {
              parentId: sitesFolderId,
              name: reg.site_id,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: reg.site_id,
                resource_type: 'site_folder',
                site_id: reg.site_id,
                project_id: projectId,
                schema_version: '1',
              },
            });
            const pubFolder = await ensureMarkerFolder(ctx.accessToken, {
              parentId: siteFolder.folder.id,
              name: 'Published',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${reg.site_id}:published`,
                resource_type: 'site_published_folder',
                site_id: reg.site_id,
                schema_version: '1',
              },
            });
            const siteDoc: SiteManifestDoc = {
              schema_version: 1,
              site_id: reg.site_id,
              project_id: projectId,
              organization_id: orgId,
              site_slug: reg.site_slug,
              site_name: reg.site_name || reg.site_slug,
              custom_domain: reg.custom_domain || null,
              status: reg.status === 'published' ? 'published' : reg.status,
              active_publish_version_id: reg.active_publish_version || null,
              active_build_id: reg.active_build_id || '',
              site_config_file_id: '',
              published_folder_id: pubFolder.folder.id,
              folder_id: siteFolder.folder.id,
              revision: 1,
              last_operation_id: operationId,
              created_at: nowIso,
              updated_at: nowIso,
            };
            const savedSite = await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: siteFolder.folder.id,
              fileName: SITE_MANIFEST_FILENAME,
              payload: siteDoc as unknown as Record<string, unknown>,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: reg.site_id,
                resource_type: 'site_manifest',
                site_id: reg.site_id,
                schema_version: '1',
              },
            });
            attachedSiteMetaMap.set(reg.site_id, {
              folderId: siteFolder.folder.id,
              manifestFileId: savedSite.fileId,
            });
          }

          if (validatedLocalSite) {
            const siteFolder = await ensureMarkerFolder(ctx.accessToken, {
              parentId: sitesFolderId,
              name: validatedLocalSite.siteId,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: validatedLocalSite.siteId,
                resource_type: 'site_folder',
                site_id: validatedLocalSite.siteId,
                project_id: projectId,
                schema_version: '1',
              },
            });
            const pubFolder = await ensureMarkerFolder(ctx.accessToken, {
              parentId: siteFolder.folder.id,
              name: 'Published',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${validatedLocalSite.siteId}:published`,
                resource_type: 'site_published_folder',
                site_id: validatedLocalSite.siteId,
                schema_version: '1',
              },
            });
            const siteDoc: SiteManifestDoc = {
              schema_version: 1,
              site_id: validatedLocalSite.siteId,
              project_id: projectId,
              organization_id: orgId,
              site_slug: validatedLocalSite.siteSlug,
              site_name: validatedLocalSite.siteName,
              custom_domain: null,
              status: 'draft',
              active_publish_version_id: null,
              active_build_id: '',
              site_config_file_id: '',
              published_folder_id: pubFolder.folder.id,
              folder_id: siteFolder.folder.id,
              revision: 1,
              last_operation_id: operationId,
              created_at: nowIso,
              updated_at: nowIso,
            };
            const savedSite = await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: siteFolder.folder.id,
              fileName: SITE_MANIFEST_FILENAME,
              payload: siteDoc as unknown as Record<string, unknown>,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: validatedLocalSite.siteId,
                resource_type: 'site_manifest',
                site_id: validatedLocalSite.siteId,
                schema_version: '1',
              },
            });
            attachedSiteMetaMap.set(validatedLocalSite.siteId, {
              folderId: siteFolder.folder.id,
              manifestFileId: savedSite.fileId,
            });
          }

          return {
            resource_id: projectId,
            drive_file_id: projectFolderId,
            parent_id: orgProjectsFolderId,
          };
        },
      },
      {
        key: 'update_account_and_org_indexes',
        async run(ctx) {
          const nextProjIdx: OrganizationProjectsIndexDoc = {
            schema_version: 1,
            organization_id: orgId,
            projects: [
              {
                project_id: projectId,
                name: projectName,
                slug: projectSlug,
                status: 'active',
                folder_id: projectFolderId,
                manifest_file_id: projectManifestFileId,
                revision: 1,
                updated_at: nowIso,
              },
            ],
            revision: 2,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: orgFolderId,
            fileName: PROJECTS_INDEX_FILENAME,
            payload: nextProjIdx as unknown as Record<string, unknown>,
            expectedRevision: 1,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${orgId}:projects_index`,
              resource_type: 'projects_index',
              org_id: orgId,
              schema_version: '1',
            },
          });

          const nextOrgIds = Array.from(
            new Set([...(bootRef.accountManifest.organization_ids || []), orgId])
          );
          const nextAccManifest: AccountManifestDoc = {
            ...bootRef.accountManifest,
            organization_ids: nextOrgIds,
            revision: (bootRef.accountManifest.revision || 1) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: bootRef.systemFolderId,
            fileName: ACCOUNT_MANIFEST_FILENAME,
            payload: nextAccManifest as unknown as Record<string, unknown>,
            knownFileId: bootRef.accountManifestFileId,
            expectedRevision: bootRef.accountManifest.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: session.ownerId,
              resource_type: 'account_manifest',
              schema_version: '1',
            },
          });

          const nextOrgIdx: OrganizationsIndexDoc = {
            schema_version: 1,
            builly_account_id: session.ownerId,
            organizations: [
              ...(bootRef.organizationsIndex.organizations || []).filter(
                (o) => o.organization_id !== orgId
              ),
              {
                organization_id: orgId,
                name: orgName,
                slug: orgSlug,
                status: 'active',
                folder_id: orgFolderId,
                projects_folder_id: orgProjectsFolderId,
                manifest_file_id: orgManifestFileId,
                revision: 1,
                updated_at: nowIso,
              },
            ],
            revision: (bootRef.organizationsIndex.revision || 1) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: bootRef.systemFolderId,
            fileName: ORGANIZATIONS_INDEX_FILENAME,
            payload: nextOrgIdx as unknown as Record<string, unknown>,
            knownFileId: bootRef.organizationsIndexFileId,
            expectedRevision: bootRef.organizationsIndex.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${session.ownerId}:organizations_index`,
              resource_type: 'organizations_index',
              schema_version: '1',
            },
          });

          await upsertCanonicalResourceRegistryEntry(ctx.accessToken, {
            systemFolderId: bootRef.systemFolderId,
            registryFileId: bootRef.resourceRegistryFileId,
            ownerAccountId: session.ownerId,
            operationId,
            entry: {
              resource_id: `wres_${projectId}_root`,
              owner_type: 'project',
              owner_id: session.ownerId,
              org_id: orgId,
              project_id: projectId,
              site_id: null,
              resource_type: 'project_root',
              resource_key: 'default',
              drive_file_id: projectFolderId,
              spreadsheet_id: '',
              parent_folder_id: orgProjectsFolderId,
              title: projectName,
              mime_type: DRIVE_FOLDER_MIME,
              schema_version: 1,
              status: 'active',
            },
          });
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        organization: {
          org_id: orgId,
          owner_id: session.ownerId,
          name: orgName,
          org_slug: orgSlug,
          drive_folder_id: orgFolderId,
          status: 'active' as const,
          canonical_revision: 1,
          last_operation_id: operationId,
          drive_manifest_file_id: orgManifestFileId,
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
          drive_folder_id: projectFolderId,
          status: 'active' as const,
          canonical_revision: 1,
          last_operation_id: operationId,
          drive_manifest_file_id: projectManifestFileId,
          created_at: nowIso,
          updated_at: nowIso,
        },
        attachedSitesCount: verifiedRegistrySites.length + (validatedLocalSite ? 1 : 0),
      };
    },
    async updateProjection() {
      const statements: D1PreparedStatement[] = [
        env.DB.prepare(`PRAGMA foreign_keys = ON`),
        env.DB.prepare(
          `INSERT INTO organizations (
             org_id, owner_id, name, org_slug, drive_folder_id, status,
             canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'active', 1, ?, 'synced', ?, ?, ?, ?)`
        ).bind(
          orgId,
          session.ownerId,
          orgName,
          orgSlug,
          orgFolderId,
          nowIso,
          operationId,
          orgManifestFileId,
          nowIso,
          nowIso
        ),
        env.DB.prepare(
          `INSERT INTO organization_members (member_id, org_id, user_id, email, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)`
        ).bind(memberId, orgId, session.ownerId, session.email || '', nowIso, nowIso),
        env.DB.prepare(
          `INSERT INTO projects (
             project_id, org_id, owner_id, name, project_slug, description, drive_folder_id, status,
             canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, 'synced', ?, ?, ?, ?)`
        ).bind(
          projectId,
          orgId,
          session.ownerId,
          projectName,
          projectSlug,
          (input.projectDescription || '').trim(),
          projectFolderId,
          nowIso,
          operationId,
          projectManifestFileId,
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
            selectedModulesSet.has(modKey) ? 1 : 0,
            nowIso
          )
        );
      }

      const folderMappings: Array<[string, string, string, string]> = [
        ['builly_root', bootRef.rootFolderId, 'root', 'Builly'],
        ['system_folder', bootRef.systemFolderId, bootRef.rootFolderId, 'System'],
        ['operations_folder', bootRef.operationsFolderId, bootRef.systemFolderId, 'Operations'],
        ['organizations_folder', bootRef.organizationsFolderId, bootRef.rootFolderId, 'Organizations'],
      ];
      for (const [kind, fId, parentId, title] of folderMappings) {
        statements.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO workspace_resources (
               resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
               drive_file_id, spreadsheet_id, parent_folder_id, title, status, created_at, updated_at
             ) VALUES (?, ?, ?, NULL, NULL, ?, 'default', ?, '', ?, ?, 'active', ?, ?)`
          ).bind(makeId('wres'), session.ownerId, orgId, kind, fId, parentId, title, nowIso, nowIso)
        );
      }

      const projFolders: Array<[string, string, string, string]> = [
        ['project_root', projectFolderId, orgProjectsFolderId, projectId],
        ['config_root', configRootId, projectFolderId, 'Config'],
        ['config_draft', configDraftId, configRootId, 'Draft'],
        ['config_published', configPublishedId, configRootId, 'Published'],
        ['config_sites', sitesFolderId, configRootId, 'Sites'],
        ['data_root', dataRootId, projectFolderId, 'Data'],
        ['data_cms', dataCmsId, dataRootId, 'CMS'],
        ['data_inbox', dataInboxId, dataRootId, 'Inbox'],
        ['assets_root', assetsRootId, projectFolderId, 'Assets'],
        ['exports_root', exportsRootId, projectFolderId, 'Exports'],
      ];
      for (const [kind, fId, parentId, title] of projFolders) {
        statements.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO workspace_resources (
               resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
               drive_file_id, spreadsheet_id, parent_folder_id, title, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, NULL, ?, 'default', ?, '', ?, ?, 'active', ?, ?)`
          ).bind(
            makeId('wres'),
            session.ownerId,
            orgId,
            projectId,
            kind,
            fId,
            parentId,
            title,
            nowIso,
            nowIso
          )
        );
      }

      for (const reg of verifiedRegistrySites) {
        const siteMeta = attachedSiteMetaMap.get(reg.site_id);
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
               status, active_publish_version, active_build_id, drive_config_folder_id,
               canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'synced', ?, ?, ?, ?)`
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
            siteMeta?.folderId || '',
            nowIso,
            operationId,
            siteMeta?.manifestFileId || '',
            nowIso,
            reg.updated_at || nowIso
          )
        );
      }

      if (validatedLocalSite) {
        const siteMeta = attachedSiteMetaMap.get(validatedLocalSite.siteId);
        statements.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO sites (
               site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
               status, active_publish_version, active_build_id, drive_config_folder_id,
               canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'draft', '', '', ?, 1, ?, 'synced', ?, ?, ?, ?)`
          ).bind(
            validatedLocalSite.siteId,
            projectId,
            orgId,
            session.ownerId,
            validatedLocalSite.siteSlug,
            validatedLocalSite.siteName,
            siteMeta?.folderId || '',
            nowIso,
            operationId,
            siteMeta?.manifestFileId || '',
            nowIso,
            nowIso
          )
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

      await env.DB.batch(statements);
    },
  });
}

export async function createOrganization(
  env: WorkerEnv,
  session: VerifiedSession,
  input: { name: string; operationKey?: string; operationId?: string; selectedRootFolderId?: string }
) {
  const operationId =
    (input.operationId || input.operationKey || '').trim() || generateOperationId('op_org');
  const accessToken = await requireGoogleWriteAccess(env, session.ownerId, operationId);

  const name = (input.name || '').trim();
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError(
      'Organization name must be 2–80 characters.',
      400,
      'INVALID_ORG_NAME'
    );
  }

  // Server-side 10-organization limit (active + archived both count!)
  const orgCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM organizations WHERE owner_id = ? AND status IN ('active', 'archived')`
  )
    .bind(session.ownerId)
    .first<{ cnt: number }>();
  if (Number(orgCountRow?.cnt || 0) >= 10) {
    throw new HierarchyServiceError(
      'Organization limit reached (maximum 10 Organizations per account, including archived). Permanently delete an archived Organization before creating a new one.',
      409,
      'ORG_LIMIT_REACHED'
    );
  }

  const orgId = makeId('org');
  const memberId = makeId('mem');
  const orgSlug = await ensureUniqueOrgSlug(env.DB, session.ownerId, name);
  const nowIso = new Date().toISOString();

  let bootRef!: Awaited<ReturnType<typeof bootstrapAccountDrive>>;
  let orgFolderId = '';
  let orgProjectsFolderId = '';
  let orgManifestFileId = '';
  let projectsIndexFileId = '';

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'CREATE_ORGANIZATION',
    ownerId: session.ownerId,
    scopeKey: `account:${session.ownerId}`,
    payloadForHash: {
      op: 'create_organization',
      name,
      selectedRootFolderId: input.selectedRootFolderId || '',
    },
    target: { organization_id: orgId },
    accessToken,
    repairResourceType: 'organization',
    repairResourceId: orgId,
    steps: [
      {
        key: 'verify_account_root_and_limit',
        async run(ctx) {
          bootRef = await bootstrapAccountDrive(env, ctx.accessToken, session.ownerId, {
            selectedRootFolderId: input.selectedRootFolderId,
            operationId,
          });
          ctx.setOperationsFolderId(bootRef.operationsFolderId);

          const activeOrArchived = bootRef.organizationsIndex.organizations.filter(
            (o) => o.status !== 'deleted'
          );
          if (activeOrArchived.length >= 10) {
            throw new HierarchyServiceError(
              'Organization limit reached (maximum 10 Organizations per account, including archived).',
              409,
              'ORG_LIMIT_REACHED'
            );
          }

          return {
            resource_id: session.ownerId,
            drive_file_id: bootRef.rootFolderId,
            parent_id: 'root',
          };
        },
      },
      {
        key: 'create_org_folder_and_projects_folder',
        async run(ctx) {
          const orgF = await ensureMarkerFolder(ctx.accessToken, {
            parentId: bootRef.organizationsFolderId,
            name: orgId,
            knownFolderId: ctx.getDiscoveredId('orgFolderId'),
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: orgId,
              resource_type: 'org_root',
              org_id: orgId,
              schema_version: '1',
            },
          });
          orgFolderId = orgF.folder.id;
          ctx.setDiscoveredId('orgFolderId', orgFolderId);

          const projF = await ensureMarkerFolder(ctx.accessToken, {
            parentId: orgFolderId,
            name: 'Projects',
            knownFolderId: ctx.getDiscoveredId('orgProjectsFolderId'),
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${orgId}:projects`,
              resource_type: 'org_projects_folder',
              org_id: orgId,
              schema_version: '1',
            },
          });
          orgProjectsFolderId = projF.folder.id;
          ctx.setDiscoveredId('orgProjectsFolderId', orgProjectsFolderId);

          return {
            resource_id: orgId,
            drive_file_id: orgFolderId,
            parent_id: bootRef.organizationsFolderId,
          };
        },
        async verifyCompleted(ctx) {
          const id = ctx.getDiscoveredId('orgFolderId');
          if (!id) return false;
          await verifyDriveParent(ctx.accessToken, id, bootRef.organizationsFolderId, operationId);
          orgFolderId = id;
          return true;
        },
      },
      {
        key: 'write_organization_manifests',
        async run(ctx) {
          const projIdxDoc: OrganizationProjectsIndexDoc = {
            schema_version: 1,
            organization_id: orgId,
            projects: [],
            revision: 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          const savedProjIdx = await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: orgFolderId,
            fileName: PROJECTS_INDEX_FILENAME,
            payload: projIdxDoc as unknown as Record<string, unknown>,
            knownFileId: ctx.getDiscoveredId('projectsIndexFileId'),
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${orgId}:projects_index`,
              resource_type: 'projects_index',
              org_id: orgId,
              schema_version: '1',
            },
          });
          projectsIndexFileId = savedProjIdx.fileId;
          ctx.setDiscoveredId('projectsIndexFileId', projectsIndexFileId);

          const orgDoc: OrganizationManifestDoc = {
            schema_version: 1,
            organization_id: orgId,
            owner_account_id: session.ownerId,
            name,
            slug: orgSlug,
            status: 'active',
            folder_id: orgFolderId,
            projects_folder_id: orgProjectsFolderId,
            projects_index_file_id: projectsIndexFileId,
            revision: 1,
            last_operation_id: operationId,
            created_at: nowIso,
            updated_at: nowIso,
          };
          const savedOrgDoc = await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: orgFolderId,
            fileName: ORGANIZATION_MANIFEST_FILENAME,
            payload: orgDoc as unknown as Record<string, unknown>,
            knownFileId: ctx.getDiscoveredId('orgManifestFileId'),
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: orgId,
              resource_type: 'organization_manifest',
              org_id: orgId,
              schema_version: '1',
            },
          });
          orgManifestFileId = savedOrgDoc.fileId;
          ctx.setDiscoveredId('orgManifestFileId', orgManifestFileId);

          return {
            resource_id: orgId,
            drive_file_id: orgManifestFileId,
            parent_id: orgFolderId,
          };
        },
      },
      {
        key: 'update_account_indexes',
        async run(ctx) {
          const nextOrgIds = Array.from(
            new Set([...(bootRef.accountManifest.organization_ids || []), orgId])
          );
          const nextAccDoc: AccountManifestDoc = {
            ...bootRef.accountManifest,
            organization_ids: nextOrgIds,
            revision: (bootRef.accountManifest.revision || 1) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: bootRef.systemFolderId,
            fileName: ACCOUNT_MANIFEST_FILENAME,
            payload: nextAccDoc as unknown as Record<string, unknown>,
            knownFileId: bootRef.accountManifestFileId,
            expectedRevision: bootRef.accountManifest.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: session.ownerId,
              resource_type: 'account_manifest',
              schema_version: '1',
            },
          });

          const nextOrgIdx: OrganizationsIndexDoc = {
            schema_version: 1,
            builly_account_id: session.ownerId,
            organizations: [
              ...(bootRef.organizationsIndex.organizations || []).filter(
                (o) => o.organization_id !== orgId
              ),
              {
                organization_id: orgId,
                name,
                slug: orgSlug,
                status: 'active',
                folder_id: orgFolderId,
                projects_folder_id: orgProjectsFolderId,
                manifest_file_id: orgManifestFileId,
                revision: 1,
                updated_at: nowIso,
              },
            ],
            revision: (bootRef.organizationsIndex.revision || 1) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: bootRef.systemFolderId,
            fileName: ORGANIZATIONS_INDEX_FILENAME,
            payload: nextOrgIdx as unknown as Record<string, unknown>,
            knownFileId: bootRef.organizationsIndexFileId,
            expectedRevision: bootRef.organizationsIndex.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${session.ownerId}:organizations_index`,
              resource_type: 'organizations_index',
              schema_version: '1',
            },
          });

          await upsertCanonicalResourceRegistryEntry(ctx.accessToken, {
            systemFolderId: bootRef.systemFolderId,
            registryFileId: bootRef.resourceRegistryFileId,
            ownerAccountId: session.ownerId,
            operationId,
            entry: {
              resource_id: `wres_${orgId}_root`,
              owner_type: 'organization',
              owner_id: session.ownerId,
              org_id: orgId,
              project_id: null,
              site_id: null,
              resource_type: 'org_root',
              resource_key: 'default',
              drive_file_id: orgFolderId,
              spreadsheet_id: '',
              parent_folder_id: bootRef.organizationsFolderId,
              title: name,
              mime_type: DRIVE_FOLDER_MIME,
              schema_version: 1,
              status: 'active',
            },
          });
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        organization: {
          org_id: orgId,
          owner_id: session.ownerId,
          name,
          org_slug: orgSlug,
          drive_folder_id: orgFolderId,
          status: 'active' as const,
          canonical_revision: 1,
          last_operation_id: operationId,
          drive_manifest_file_id: orgManifestFileId,
          created_at: nowIso,
          updated_at: nowIso,
          role: 'owner' as const,
        },
      };
    },
    async updateProjection() {
      await env.DB.batch([
        env.DB.prepare(`PRAGMA foreign_keys = ON`),
        env.DB.prepare(
          `INSERT INTO organizations (
             org_id, owner_id, name, org_slug, drive_folder_id, status,
             canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'active', 1, ?, 'synced', ?, ?, ?, ?)`
        ).bind(
          orgId,
          session.ownerId,
          name,
          orgSlug,
          orgFolderId,
          nowIso,
          operationId,
          orgManifestFileId,
          nowIso,
          nowIso
        ),
        env.DB.prepare(
          `INSERT INTO organization_members (member_id, org_id, user_id, email, role, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)`
        ).bind(memberId, orgId, session.ownerId, session.email || '', nowIso, nowIso),
        env.DB.prepare(
          `INSERT OR IGNORE INTO workspace_resources (
             resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
             drive_file_id, spreadsheet_id, parent_folder_id, title, status,
             canonical_revision, last_operation_id, created_at, updated_at
           ) VALUES (?, ?, ?, NULL, NULL, 'builly_root', 'default', ?, '', 'root', 'Builly', 'active', 1, ?, ?, ?)`
        ).bind(makeId('wres'), session.ownerId, orgId, bootRef.rootFolderId, operationId, nowIso, nowIso),
        env.DB.prepare(
          `INSERT OR IGNORE INTO workspace_resources (
             resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
             drive_file_id, spreadsheet_id, parent_folder_id, title, status,
             canonical_revision, last_operation_id, created_at, updated_at
           ) VALUES (?, ?, ?, NULL, NULL, 'org_root', 'default', ?, '', ?, ?, 'active', 1, ?, ?, ?)`
        ).bind(
          makeId('wres'),
          session.ownerId,
          orgId,
          orgFolderId,
          bootRef.organizationsFolderId,
          orgId,
          operationId,
          nowIso,
          nowIso
        ),
      ]);
    },
  });
}

export async function updateOrganization(
  env: WorkerEnv,
  session: VerifiedSession,
  orgId: string,
  input: { name?: string; expectedRevision?: number; operationId?: string }
) {
  const { org } = await requireOrgMembership(env.DB, orgId, session.ownerId, ['owner', 'admin'], {
    allowArchived: true,
  });
  const operationId = input.operationId?.trim() || generateOperationId('op_org_upd');
  const accessToken = await requireGoogleWriteAccess(env, org.owner_id || session.ownerId, operationId);

  const name = input.name !== undefined ? input.name.trim() : org.name;
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError(
      'Organization name must be 2–80 characters.',
      400,
      'INVALID_ORG_NAME'
    );
  }

  const nowIso = new Date().toISOString();
  let nextRevision = (org.canonical_revision || 1) + 1;
  let manifestFileId = org.drive_manifest_file_id || '';

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'UPDATE_ORGANIZATION',
    ownerId: session.ownerId,
    scopeKey: `org:${orgId}`,
    payloadForHash: { op: 'update_org', orgId, name, expectedRevision: input.expectedRevision ?? null },
    target: { organization_id: orgId },
    accessToken,
    repairResourceType: 'organization',
    repairResourceId: orgId,
    steps: [
      {
        key: 'update_organization_manifest',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, org.owner_id || session.ownerId, {
            operationId,
          });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          if (!org.drive_folder_id) {
            throw new BuillyTransactionError('RESOURCE_NOT_FOUND', 'Organization Drive folder ID missing.', {
              operationId,
              details: { resourceId: orgId },
            });
          }

          const children = await findDriveChildren(ctx.accessToken, {
            parentId: org.drive_folder_id,
            name: ORGANIZATION_MANIFEST_FILENAME,
            operationId,
          });
          manifestFileId = manifestFileId || children[0]?.id || '';
          if (!manifestFileId) {
            throw new BuillyTransactionError('RESOURCE_NOT_FOUND', 'organization.json not found in Drive.', {
              operationId,
              details: { resourceId: orgId },
            });
          }

          const { data: currentDoc, meta } = await readDriveJsonWithConcurrency<OrganizationManifestDoc>(
            ctx.accessToken,
            manifestFileId,
            operationId
          );

          const expectedRev = input.expectedRevision ?? currentDoc.revision;
          if (currentDoc.revision !== expectedRev) {
            throw new BuillyTransactionError(
              'REVISION_CONFLICT',
              `Revision conflict on organization "${orgId}": expected ${expectedRev}, found ${currentDoc.revision}.`,
              {
                operationId,
                details: {
                  resourceId: orgId,
                  expectedRevision: expectedRev,
                  actualRevision: currentDoc.revision,
                },
              }
            );
          }

          nextRevision = currentDoc.revision + 1;
          const updatedDoc: OrganizationManifestDoc = {
            ...currentDoc,
            name,
            revision: nextRevision,
            last_operation_id: operationId,
            updated_at: nowIso,
          };

          const saved = await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: org.drive_folder_id,
            fileName: ORGANIZATION_MANIFEST_FILENAME,
            payload: updatedDoc as unknown as Record<string, unknown>,
            knownFileId: manifestFileId,
            expectedRevision: expectedRev,
            expectedEtag: meta.etag,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: orgId,
              resource_type: 'organization_manifest',
              org_id: orgId,
              schema_version: '1',
            },
          });
          manifestFileId = saved.fileId;

          const nextOrgIdx: OrganizationsIndexDoc = {
            ...boot.organizationsIndex,
            organizations: (boot.organizationsIndex.organizations || []).map((entry) =>
              entry.organization_id === orgId
                ? { ...entry, name, revision: nextRevision, updated_at: nowIso }
                : entry
            ),
            revision: (boot.organizationsIndex.revision || 1) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: boot.systemFolderId,
            fileName: ORGANIZATIONS_INDEX_FILENAME,
            payload: nextOrgIdx as unknown as Record<string, unknown>,
            knownFileId: boot.organizationsIndexFileId,
            expectedRevision: boot.organizationsIndex.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${org.owner_id}:organizations_index`,
              resource_type: 'organizations_index',
              schema_version: '1',
            },
          });
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        organization: {
          ...org,
          name,
          canonical_revision: nextRevision,
          last_operation_id: operationId,
          drive_manifest_file_id: manifestFileId,
          updated_at: nowIso,
        },
      };
    },
    async updateProjection() {
      await env.DB.prepare(
        `UPDATE organizations
         SET name = ?, canonical_revision = ?, projected_at = ?, projection_status = 'synced',
             last_operation_id = ?, drive_manifest_file_id = ?, updated_at = ?
         WHERE org_id = ?`
      )
        .bind(name, nextRevision, nowIso, operationId, manifestFileId, nowIso, orgId)
        .run();
    },
  });
}

export async function archiveOrganization(
  env: WorkerEnv,
  session: VerifiedSession,
  orgId: string,
  options?: { expectedRevision?: number; operationId?: string }
) {
  const { org } = await requireOrgMembership(env.DB, orgId, session.ownerId, ['owner'], {
    allowArchived: true,
  });
  const operationId = options?.operationId?.trim() || generateOperationId('op_org_arch');
  const accessToken = await requireGoogleWriteAccess(env, org.owner_id || session.ownerId, operationId);
  const nowIso = new Date().toISOString();
  let nextRevision = (org.canonical_revision || 1) + 1;

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'ARCHIVE_ORGANIZATION',
    ownerId: session.ownerId,
    scopeKey: `org:${orgId}`,
    payloadForHash: { op: 'archive_org', orgId, expectedRevision: options?.expectedRevision ?? null },
    target: { organization_id: orgId },
    accessToken,
    repairResourceType: 'organization',
    repairResourceId: orgId,
    steps: [
      {
        key: 'archive_organization_in_drive',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, org.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          const children = await findDriveChildren(ctx.accessToken, {
            parentId: org.drive_folder_id,
            name: ORGANIZATION_MANIFEST_FILENAME,
            operationId,
          });
          const manifestFileId = org.drive_manifest_file_id || children[0]?.id || '';
          if (manifestFileId) {
            const { data: currentDoc, meta } = await readDriveJsonWithConcurrency<OrganizationManifestDoc>(
              ctx.accessToken,
              manifestFileId,
              operationId
            );
            const expectedRev = options?.expectedRevision ?? currentDoc.revision;
            if (currentDoc.revision !== expectedRev) {
              throw new BuillyTransactionError(
                'REVISION_CONFLICT',
                `Revision conflict archiving organization "${orgId}".`,
                { operationId, details: { resourceId: orgId, expectedRevision: expectedRev, actualRevision: currentDoc.revision } }
              );
            }
            nextRevision = currentDoc.revision + 1;
            await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: org.drive_folder_id,
              fileName: ORGANIZATION_MANIFEST_FILENAME,
              payload: {
                ...currentDoc,
                status: 'archived',
                revision: nextRevision,
                last_operation_id: operationId,
                updated_at: nowIso,
              },
              knownFileId: manifestFileId,
              expectedRevision: expectedRev,
              expectedEtag: meta.etag,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: orgId,
                resource_type: 'organization_manifest',
                org_id: orgId,
                schema_version: '1',
              },
            });
          }

          const nextOrgIdx: OrganizationsIndexDoc = {
            ...boot.organizationsIndex,
            organizations: (boot.organizationsIndex.organizations || []).map((entry) =>
              entry.organization_id === orgId
                ? { ...entry, status: 'archived', revision: nextRevision, updated_at: nowIso }
                : entry
            ),
            revision: (boot.organizationsIndex.revision || 1) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: boot.systemFolderId,
            fileName: ORGANIZATIONS_INDEX_FILENAME,
            payload: nextOrgIdx as unknown as Record<string, unknown>,
            knownFileId: boot.organizationsIndexFileId,
            expectedRevision: boot.organizationsIndex.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${org.owner_id}:organizations_index`,
              resource_type: 'organizations_index',
              schema_version: '1',
            },
          });
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        organization: { ...org, status: 'archived' as const, canonical_revision: nextRevision, updated_at: nowIso },
      };
    },
    async updateProjection() {
      await env.DB.prepare(
        `UPDATE organizations
         SET status = 'archived', canonical_revision = ?, last_operation_id = ?, updated_at = ?
         WHERE org_id = ?`
      )
        .bind(nextRevision, operationId, nowIso, orgId)
        .run();
    },
  });
}

export async function deleteOrganization(
  env: WorkerEnv,
  session: VerifiedSession,
  orgId: string,
  input: { confirmPermanentDelete?: boolean; operationId?: string }
) {
  if (!input.confirmPermanentDelete) {
    throw new HierarchyServiceError(
      'Permanent deletion requires confirmPermanentDelete: true.',
      400,
      'CONFIRMATION_REQUIRED'
    );
  }
  const { org } = await requireOrgMembership(env.DB, orgId, session.ownerId, ['owner'], {
    allowArchived: true,
  });
  if (org.status !== 'archived') {
    throw new HierarchyServiceError(
      'Archive the Organization before permanently deleting it.',
      409,
      'ARCHIVE_REQUIRED_BEFORE_DELETE'
    );
  }

  const remainingProjects = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ?`
  )
    .bind(orgId)
    .first<{ cnt: number }>();
  if (Number(remainingProjects?.cnt || 0) > 0) {
    throw new HierarchyServiceError(
      'Delete all Projects inside this Organization before permanently deleting it.',
      409,
      'ORGANIZATION_HAS_PROJECTS'
    );
  }

  const operationId = input.operationId?.trim() || generateOperationId('op_org_del');
  const accessToken = await requireGoogleWriteAccess(env, org.owner_id || session.ownerId, operationId);
  const nowIso = new Date().toISOString();

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'DELETE_ORGANIZATION',
    ownerId: session.ownerId,
    scopeKey: `account:${session.ownerId}`,
    payloadForHash: { op: 'delete_org', orgId },
    target: { organization_id: orgId },
    accessToken,
    repairResourceType: 'organization',
    repairResourceId: orgId,
    steps: [
      {
        key: 'trash_verified_org_folder_and_update_indexes',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, org.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          if (org.drive_folder_id) {
            // Strictly verify folder belongs inside Builly/Organizations before trashing
            await verifyDriveParent(
              ctx.accessToken,
              org.drive_folder_id,
              boot.organizationsFolderId,
              operationId
            );
            await driveFetchWithRetry(
              `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(org.drive_folder_id)}`,
              ctx.accessToken,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trashed: true }),
              },
              { operationId }
            );
          }

          const nextOrgIds = (boot.accountManifest.organization_ids || []).filter((id) => id !== orgId);
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: boot.systemFolderId,
            fileName: ACCOUNT_MANIFEST_FILENAME,
            payload: {
              ...boot.accountManifest,
              organization_ids: nextOrgIds,
              revision: (boot.accountManifest.revision || 1) + 1,
              last_operation_id: operationId,
              updated_at: nowIso,
            },
            knownFileId: boot.accountManifestFileId,
            expectedRevision: boot.accountManifest.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: session.ownerId,
              resource_type: 'account_manifest',
              schema_version: '1',
            },
          });

          const nextOrgIdx: OrganizationsIndexDoc = {
            ...boot.organizationsIndex,
            organizations: (boot.organizationsIndex.organizations || []).filter(
              (o) => o.organization_id !== orgId
            ),
            revision: (boot.organizationsIndex.revision || 1) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: boot.systemFolderId,
            fileName: ORGANIZATIONS_INDEX_FILENAME,
            payload: nextOrgIdx as unknown as Record<string, unknown>,
            knownFileId: boot.organizationsIndexFileId,
            expectedRevision: boot.organizationsIndex.revision,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${org.owner_id}:organizations_index`,
              resource_type: 'organizations_index',
              schema_version: '1',
            },
          });
        },
      },
    ],
    buildResult() {
      return { ok: true, deletedOrgId: orgId };
    },
    async updateProjection() {
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM workspace_resources WHERE org_id = ?`).bind(orgId),
        env.DB.prepare(`DELETE FROM organizations WHERE org_id = ? AND owner_id = ?`).bind(
          orgId,
          org.owner_id
        ),
      ]);
    },
  });
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
    operationId?: string;
  }
) {
  const operationId =
    (input.operationId || input.operationKey || '').trim() || generateOperationId('op_prj');
  const { org } = await requireOrgMembership(env.DB, orgId, session.ownerId, ['owner', 'admin', 'editor']);
  const accessToken = await requireGoogleWriteAccess(env, org.owner_id || session.ownerId, operationId);

  const name = (input.name || '').trim();
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError(
      'Project name must be 2–80 characters.',
      400,
      'INVALID_PROJECT_NAME'
    );
  }

  // Server-side 10-project limit (active + archived both count!)
  const projectCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ? AND status IN ('active', 'archived')`
  )
    .bind(orgId)
    .first<{ cnt: number }>();
  if (Number(projectCountRow?.cnt || 0) >= 10) {
    throw new HierarchyServiceError(
      'Project limit reached (maximum 10 Projects per Organization, including archived). Permanently delete an archived Project before creating a new one.',
      409,
      'PROJECT_LIMIT_REACHED'
    );
  }

  const projectId = makeId('prj');
  const projectSlug = await ensureUniqueProjectSlug(env.DB, orgId, name);
  const nowIso = new Date().toISOString();
  const description = (input.description || '').trim();
  const enabledList = Array.from(
    new Set<ProjectModuleKey>(
      input.enabledModules && input.enabledModules.length > 0
        ? input.enabledModules
        : ALL_PROJECT_MODULES
    )
  );
  const enabledSet = new Set<ProjectModuleKey>(enabledList);

  const modules: ProjectModuleRecord[] = ALL_PROJECT_MODULES.map((m) => ({
    id: `mod_${projectId}_${m}`,
    project_id: projectId,
    module_key: m,
    enabled: enabledSet.has(m) ? 1 : 0,
    config_json: '{}',
    updated_at: nowIso,
  }));

  let bootRef!: Awaited<ReturnType<typeof bootstrapAccountDrive>>;
  let orgFolderId = org.drive_folder_id || '';
  let orgProjectsFolderId = '';
  let projectFolderId = '';
  let configRootId = '';
  let configDraftId = '';
  let configPublishedId = '';
  let sitesFolderId = '';
  let dataRootId = '';
  let dataCmsId = '';
  let dataInboxId = '';
  let assetsRootId = '';
  let exportsRootId = '';
  let projectManifestFileId = '';

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'CREATE_PROJECT',
    ownerId: session.ownerId,
    scopeKey: `org:${orgId}`,
    payloadForHash: {
      op: 'create_project',
      orgId,
      name,
      description,
      enabledModules: [...enabledList].sort(),
    },
    target: { organization_id: orgId, project_id: projectId },
    accessToken,
    repairResourceType: 'project',
    repairResourceId: projectId,
    steps: [
      {
        key: 'verify_org_and_limit',
        async run(ctx) {
          bootRef = await bootstrapAccountDrive(env, ctx.accessToken, org.owner_id || session.ownerId, {
            operationId,
          });
          ctx.setOperationsFolderId(bootRef.operationsFolderId);

          if (!orgFolderId) {
            const ensuredOrg = await ensureMarkerFolder(ctx.accessToken, {
              parentId: bootRef.organizationsFolderId,
              name: orgId,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: orgId,
                resource_type: 'org_root',
                org_id: orgId,
                schema_version: '1',
              },
            });
            orgFolderId = ensuredOrg.folder.id;
          }

          const projectsF = await ensureMarkerFolder(ctx.accessToken, {
            parentId: orgFolderId,
            name: 'Projects',
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${orgId}:projects`,
              resource_type: 'org_projects_folder',
              org_id: orgId,
              schema_version: '1',
            },
          });
          orgProjectsFolderId = projectsF.folder.id;

          const idxFiles = await findDriveChildren(ctx.accessToken, {
            parentId: orgFolderId,
            name: PROJECTS_INDEX_FILENAME,
            operationId,
          });
          if (idxFiles[0]) {
            const { data: pIdx } = await readDriveJsonWithConcurrency<OrganizationProjectsIndexDoc>(
              ctx.accessToken,
              idxFiles[0].id,
              operationId
            );
            const activeOrArchived = (pIdx.projects || []).filter((p) => p.status !== 'deleted');
            if (activeOrArchived.length >= 10) {
              throw new HierarchyServiceError(
                'Project limit reached (maximum 10 Projects per Organization, including archived).',
                409,
                'PROJECT_LIMIT_REACHED'
              );
            }
          }

          return { resource_id: orgId, drive_file_id: orgFolderId };
        },
      },
      {
        key: 'create_project_folders',
        async run(ctx) {
          const pRoot = await ensureMarkerFolder(ctx.accessToken, {
            parentId: orgProjectsFolderId,
            name: projectId,
            knownFolderId: ctx.getDiscoveredId('projectFolderId'),
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: projectId,
              resource_type: 'project_root',
              org_id: orgId,
              project_id: projectId,
              schema_version: '1',
            },
          });
          projectFolderId = pRoot.folder.id;
          ctx.setDiscoveredId('projectFolderId', projectFolderId);

          configRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Config',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config`,
                resource_type: 'config_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          configDraftId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: configRootId,
              name: 'Draft',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config_draft`,
                resource_type: 'config_draft',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          configPublishedId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: configRootId,
              name: 'Published',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config_published`,
                resource_type: 'config_published',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          sitesFolderId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: configRootId,
              name: 'Sites',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config_sites`,
                resource_type: 'config_sites',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          dataRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Data',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:data`,
                resource_type: 'data_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          dataCmsId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: dataRootId,
              name: 'CMS',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:data_cms`,
                resource_type: 'data_cms',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          dataInboxId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: dataRootId,
              name: 'Inbox',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:data_inbox`,
                resource_type: 'data_inbox',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          assetsRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Assets',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:assets`,
                resource_type: 'assets_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;
          exportsRootId = (
            await ensureMarkerFolder(ctx.accessToken, {
              parentId: projectFolderId,
              name: 'Exports',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:exports`,
                resource_type: 'exports_root',
                project_id: projectId,
                schema_version: '1',
              },
            })
          ).folder.id;

          return {
            resource_id: projectId,
            drive_file_id: projectFolderId,
            parent_id: orgProjectsFolderId,
          };
        },
        async verifyCompleted(ctx) {
          const id = ctx.getDiscoveredId('projectFolderId');
          if (!id) return false;
          await verifyDriveParent(ctx.accessToken, id, orgProjectsFolderId, operationId);
          projectFolderId = id;
          return true;
        },
      },
      {
        key: 'write_project_manifests',
        async run(ctx) {
          const projectDoc: ProjectManifestDoc = {
            schema_version: 1,
            project_id: projectId,
            organization_id: orgId,
            name,
            slug: projectSlug,
            description,
            status: 'active',
            folder_id: projectFolderId,
            config_folder_id: configRootId,
            config_draft_folder_id: configDraftId,
            config_published_folder_id: configPublishedId,
            sites_folder_id: sitesFolderId,
            data_folder_id: dataRootId,
            data_cms_folder_id: dataCmsId,
            data_inbox_folder_id: dataInboxId,
            assets_folder_id: assetsRootId,
            exports_folder_id: exportsRootId,
            enabled_module_keys: enabledList,
            revision: 1,
            last_operation_id: operationId,
            created_at: nowIso,
            updated_at: nowIso,
          };
          const savedMan = await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: projectFolderId,
            fileName: PROJECT_MANIFEST_FILENAME,
            payload: projectDoc as unknown as Record<string, unknown>,
            knownFileId: ctx.getDiscoveredId('projectManifestFileId'),
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: projectId,
              resource_type: 'project_manifest',
              org_id: orgId,
              project_id: projectId,
              schema_version: '1',
            },
          });
          projectManifestFileId = savedMan.fileId;
          ctx.setDiscoveredId('projectManifestFileId', projectManifestFileId);

          const modDoc: ProjectModulesManifestDoc = {
            schema_version: 1,
            project_id: projectId,
            modules: Object.fromEntries(
              ALL_PROJECT_MODULES.map((m) => [m, { enabled: enabledSet.has(m) }])
            ),
            revision: 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: configRootId,
            fileName: PROJECT_MODULES_FILENAME,
            payload: modDoc as unknown as Record<string, unknown>,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${projectId}:modules`,
              resource_type: 'project_modules',
              project_id: projectId,
              schema_version: '1',
            },
          });

          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: configRootId,
            fileName: PROJECT_CONFIG_FILENAME,
            payload: {
              schema_version: 1,
              project_id: projectId,
              organization_id: orgId,
              revision: 1,
              last_operation_id: operationId,
              updated_at: nowIso,
            },
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${projectId}:config_doc`,
              resource_type: 'project_config',
              project_id: projectId,
              schema_version: '1',
            },
          });

          return { resource_id: projectId, drive_file_id: projectManifestFileId, parent_id: projectFolderId };
        },
      },
      {
        key: 'update_projects_index_and_registry',
        async run(ctx) {
          const idxMatches = await findDriveChildren(ctx.accessToken, {
            parentId: orgFolderId,
            name: PROJECTS_INDEX_FILENAME,
            operationId,
          });
          let currentIdx: OrganizationProjectsIndexDoc = {
            schema_version: 1,
            organization_id: orgId,
            projects: [],
            revision: 0,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          let idxEtag: string | undefined;
          let idxFileId: string | undefined;
          if (idxMatches[0]) {
            idxFileId = idxMatches[0].id;
            const read = await readDriveJsonWithConcurrency<OrganizationProjectsIndexDoc>(
              ctx.accessToken,
              idxFileId,
              operationId
            );
            currentIdx = read.data;
            idxEtag = read.meta.etag;
          }

          const nextIdx: OrganizationProjectsIndexDoc = {
            schema_version: 1,
            organization_id: orgId,
            projects: [
              ...(currentIdx.projects || []).filter((p) => p.project_id !== projectId),
              {
                project_id: projectId,
                name,
                slug: projectSlug,
                status: 'active',
                folder_id: projectFolderId,
                manifest_file_id: projectManifestFileId,
                revision: 1,
                updated_at: nowIso,
              },
            ],
            revision: (currentIdx.revision || 0) + 1,
            last_operation_id: operationId,
            updated_at: nowIso,
          };
          await writeCanonicalDriveJson(ctx.accessToken, {
            parentId: orgFolderId,
            fileName: PROJECTS_INDEX_FILENAME,
            payload: nextIdx as unknown as Record<string, unknown>,
            knownFileId: idxFileId,
            expectedRevision: idxFileId ? currentIdx.revision : undefined,
            expectedEtag: idxEtag,
            operationId,
            appProperties: {
              operation_id: operationId,
              resource_id: `${orgId}:projects_index`,
              resource_type: 'projects_index',
              org_id: orgId,
              schema_version: '1',
            },
          });

          await upsertCanonicalResourceRegistryEntry(ctx.accessToken, {
            systemFolderId: bootRef.systemFolderId,
            registryFileId: bootRef.resourceRegistryFileId,
            ownerAccountId: org.owner_id || session.ownerId,
            operationId,
            entry: {
              resource_id: `wres_${projectId}_root`,
              owner_type: 'project',
              owner_id: org.owner_id || session.ownerId,
              org_id: orgId,
              project_id: projectId,
              site_id: null,
              resource_type: 'project_root',
              resource_key: 'default',
              drive_file_id: projectFolderId,
              spreadsheet_id: '',
              parent_folder_id: orgProjectsFolderId,
              title: name,
              mime_type: DRIVE_FOLDER_MIME,
              schema_version: 1,
              status: 'active',
            },
          });
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        project: {
          project_id: projectId,
          org_id: orgId,
          owner_id: org.owner_id,
          name,
          project_slug: projectSlug,
          description,
          drive_folder_id: projectFolderId,
          status: 'active' as const,
          canonical_revision: 1,
          last_operation_id: operationId,
          drive_manifest_file_id: projectManifestFileId,
          created_at: nowIso,
          updated_at: nowIso,
        },
        modules,
      };
    },
    async updateProjection() {
      const statements: D1PreparedStatement[] = [
        env.DB.prepare(`PRAGMA foreign_keys = ON`),
        env.DB.prepare(
          `INSERT INTO projects (
             project_id, org_id, owner_id, name, project_slug, description, drive_folder_id, status,
             canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, 'synced', ?, ?, ?, ?)`
        ).bind(
          projectId,
          orgId,
          org.owner_id,
          name,
          projectSlug,
          description,
          projectFolderId,
          nowIso,
          operationId,
          projectManifestFileId,
          nowIso,
          nowIso
        ),
        ...modules.map((m) =>
          env.DB.prepare(
            `INSERT INTO project_modules (id, project_id, module_key, enabled, config_json, updated_at)
             VALUES (?, ?, ?, ?, '{}', ?)`
          ).bind(m.id, projectId, m.module_key, m.enabled, nowIso)
        ),
      ];

      const folderRows: Array<[string, string, string, string]> = [
        ['project_root', projectFolderId, orgProjectsFolderId, projectId],
        ['config_root', configRootId, projectFolderId, 'Config'],
        ['config_draft', configDraftId, configRootId, 'Draft'],
        ['config_published', configPublishedId, configRootId, 'Published'],
        ['config_sites', sitesFolderId, configRootId, 'Sites'],
        ['data_root', dataRootId, projectFolderId, 'Data'],
        ['data_cms', dataCmsId, dataRootId, 'CMS'],
        ['data_inbox', dataInboxId, dataRootId, 'Inbox'],
        ['assets_root', assetsRootId, projectFolderId, 'Assets'],
        ['exports_root', exportsRootId, projectFolderId, 'Exports'],
      ];
      for (const [kind, fId, parentId, title] of folderRows) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO workspace_resources (
               resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
               drive_file_id, spreadsheet_id, parent_folder_id, title, status, created_at, updated_at
             ) VALUES (?, ?, ?, ?, NULL, ?, 'default', ?, '', ?, ?, 'active', ?, ?)
             ON CONFLICT(org_id, project_id, resource_kind, resource_key) DO UPDATE SET
               drive_file_id = excluded.drive_file_id,
               parent_folder_id = excluded.parent_folder_id,
               updated_at = excluded.updated_at`
          ).bind(makeId('wres'), org.owner_id, orgId, projectId, kind, fId, parentId, title, nowIso, nowIso)
        );
      }

      await env.DB.batch(statements);
    },
  });
}

export async function updateProject(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  input: { name?: string; description?: string; expectedRevision?: number; operationId?: string }
) {
  const { project } = await requireProjectAccess(
    env.DB,
    projectId,
    session.ownerId,
    ['owner', 'admin', 'editor'],
    { allowArchived: true }
  );
  const operationId = input.operationId?.trim() || generateOperationId('op_prj_upd');
  const accessToken = await requireGoogleWriteAccess(env, project.owner_id || session.ownerId, operationId);

  const name = input.name !== undefined ? input.name.trim() : project.name;
  if (name.length < 2 || name.length > 80) {
    throw new HierarchyServiceError(
      'Project name must be 2–80 characters.',
      400,
      'INVALID_PROJECT_NAME'
    );
  }
  const description =
    input.description !== undefined ? input.description.trim() : project.description;
  const nowIso = new Date().toISOString();
  let nextRevision = (project.canonical_revision || 1) + 1;
  let manifestFileId = project.drive_manifest_file_id || '';

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'UPDATE_PROJECT',
    ownerId: session.ownerId,
    scopeKey: `project:${projectId}`,
    payloadForHash: { op: 'update_project', projectId, name, description, expectedRevision: input.expectedRevision ?? null },
    target: { organization_id: project.org_id, project_id: projectId },
    accessToken,
    repairResourceType: 'project',
    repairResourceId: projectId,
    steps: [
      {
        key: 'update_project_manifest',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, project.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          if (project.drive_folder_id) {
            const matches = await findDriveChildren(ctx.accessToken, {
              parentId: project.drive_folder_id,
              name: PROJECT_MANIFEST_FILENAME,
              operationId,
            });
            manifestFileId = manifestFileId || matches[0]?.id || '';
            if (manifestFileId) {
              const { data: currentDoc, meta } = await readDriveJsonWithConcurrency<ProjectManifestDoc>(
                ctx.accessToken,
                manifestFileId,
                operationId
              );
              const expectedRev = input.expectedRevision ?? currentDoc.revision;
              if (currentDoc.revision !== expectedRev) {
                throw new BuillyTransactionError(
                  'REVISION_CONFLICT',
                  `Revision conflict on project "${projectId}": expected ${expectedRev}, found ${currentDoc.revision}.`,
                  {
                    operationId,
                    details: {
                      resourceId: projectId,
                      expectedRevision: expectedRev,
                      actualRevision: currentDoc.revision,
                    },
                  }
                );
              }
              nextRevision = currentDoc.revision + 1;
              await writeCanonicalDriveJson(ctx.accessToken, {
                parentId: project.drive_folder_id,
                fileName: PROJECT_MANIFEST_FILENAME,
                payload: {
                  ...currentDoc,
                  name,
                  description,
                  revision: nextRevision,
                  last_operation_id: operationId,
                  updated_at: nowIso,
                },
                knownFileId: manifestFileId,
                expectedRevision: expectedRev,
                expectedEtag: meta.etag,
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: projectId,
                  resource_type: 'project_manifest',
                  org_id: project.org_id,
                  project_id: projectId,
                  schema_version: '1',
                },
              });
            }
          }
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        project: {
          ...project,
          name,
          description,
          canonical_revision: nextRevision,
          last_operation_id: operationId,
          drive_manifest_file_id: manifestFileId,
          updated_at: nowIso,
        },
      };
    },
    async updateProjection() {
      await env.DB.prepare(
        `UPDATE projects
         SET name = ?, description = ?, canonical_revision = ?, projected_at = ?, projection_status = 'synced',
             last_operation_id = ?, drive_manifest_file_id = ?, updated_at = ?
         WHERE project_id = ?`
      )
        .bind(name, description, nextRevision, nowIso, operationId, manifestFileId, nowIso, projectId)
        .run();
    },
  });
}

export async function archiveProject(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  options?: { expectedRevision?: number; operationId?: string }
) {
  const { project } = await requireProjectAccess(env.DB, projectId, session.ownerId, ['owner', 'admin'], {
    allowArchived: true,
  });
  const operationId = options?.operationId?.trim() || generateOperationId('op_prj_arch');
  const accessToken = await requireGoogleWriteAccess(env, project.owner_id || session.ownerId, operationId);
  const nowIso = new Date().toISOString();
  let nextRevision = (project.canonical_revision || 1) + 1;

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'ARCHIVE_PROJECT',
    ownerId: session.ownerId,
    scopeKey: `org:${project.org_id}`,
    payloadForHash: { op: 'archive_project', projectId, expectedRevision: options?.expectedRevision ?? null },
    target: { organization_id: project.org_id, project_id: projectId },
    accessToken,
    repairResourceType: 'project',
    repairResourceId: projectId,
    steps: [
      {
        key: 'archive_project_manifest',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, project.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          if (project.drive_folder_id) {
            const matches = await findDriveChildren(ctx.accessToken, {
              parentId: project.drive_folder_id,
              name: PROJECT_MANIFEST_FILENAME,
              operationId,
            });
            const mId = project.drive_manifest_file_id || matches[0]?.id || '';
            if (mId) {
              const { data: currentDoc, meta } = await readDriveJsonWithConcurrency<ProjectManifestDoc>(
                ctx.accessToken,
                mId,
                operationId
              );
              const expectedRev = options?.expectedRevision ?? currentDoc.revision;
              if (currentDoc.revision !== expectedRev) {
                throw new BuillyTransactionError(
                  'REVISION_CONFLICT',
                  `Revision conflict archiving project "${projectId}".`,
                  { operationId, details: { resourceId: projectId, expectedRevision: expectedRev, actualRevision: currentDoc.revision } }
                );
              }
              nextRevision = currentDoc.revision + 1;
              await writeCanonicalDriveJson(ctx.accessToken, {
                parentId: project.drive_folder_id,
                fileName: PROJECT_MANIFEST_FILENAME,
                payload: {
                  ...currentDoc,
                  status: 'archived',
                  revision: nextRevision,
                  last_operation_id: operationId,
                  updated_at: nowIso,
                },
                knownFileId: mId,
                expectedRevision: expectedRev,
                expectedEtag: meta.etag,
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: projectId,
                  resource_type: 'project_manifest',
                  org_id: project.org_id,
                  project_id: projectId,
                  schema_version: '1',
                },
              });
            }
          }
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        project: { ...project, status: 'archived' as const, canonical_revision: nextRevision, updated_at: nowIso },
      };
    },
    async updateProjection() {
      await env.DB.prepare(
        `UPDATE projects SET status = 'archived', canonical_revision = ?, last_operation_id = ?, updated_at = ? WHERE project_id = ?`
      )
        .bind(nextRevision, operationId, nowIso, projectId)
        .run();
    },
  });
}

export async function deleteProject(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  input: { confirmPermanentDelete?: boolean; operationId?: string }
) {
  if (!input.confirmPermanentDelete) {
    throw new HierarchyServiceError(
      'Permanent deletion requires confirmPermanentDelete: true.',
      400,
      'CONFIRMATION_REQUIRED'
    );
  }
  const { project } = await requireProjectAccess(env.DB, projectId, session.ownerId, ['owner', 'admin'], {
    allowArchived: true,
  });
  if (project.status !== 'archived') {
    throw new HierarchyServiceError(
      'Archive the Project before permanently deleting it.',
      409,
      'ARCHIVE_REQUIRED_BEFORE_DELETE'
    );
  }
  const pubSites = await env.DB.prepare(
    `SELECT COUNT(*) AS cnt FROM site_registry WHERE project_id = ? AND status = 'published'`
  )
    .bind(projectId)
    .first<{ cnt: number }>();
  if (Number(pubSites?.cnt || 0) > 0) {
    throw new HierarchyServiceError(
      'Unpublish or suspend active Sites inside this Project before permanent deletion.',
      409,
      'PROJECT_HAS_PUBLISHED_SITES'
    );
  }

  const operationId = input.operationId?.trim() || generateOperationId('op_prj_del');
  const accessToken = await requireGoogleWriteAccess(env, project.owner_id || session.ownerId, operationId);
  const nowIso = new Date().toISOString();

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'DELETE_PROJECT',
    ownerId: session.ownerId,
    scopeKey: `org:${project.org_id}`,
    payloadForHash: { op: 'delete_project', projectId },
    target: { organization_id: project.org_id, project_id: projectId },
    accessToken,
    repairResourceType: 'project',
    repairResourceId: projectId,
    steps: [
      {
        key: 'trash_verified_project_folder_and_update_index',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, project.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          const orgRow = await env.DB.prepare(`SELECT drive_folder_id FROM organizations WHERE org_id = ?`)
            .bind(project.org_id)
            .first<{ drive_folder_id: string }>();

          if (project.drive_folder_id && orgRow?.drive_folder_id) {
            const orgChildren = await findDriveChildren(ctx.accessToken, {
              parentId: orgRow.drive_folder_id,
              name: 'Projects',
              operationId,
            });
            const orgProjectsFolderId = orgChildren[0]?.id || '';
            if (orgProjectsFolderId) {
              await verifyDriveParent(
                ctx.accessToken,
                project.drive_folder_id,
                orgProjectsFolderId,
                operationId
              );
              await driveFetchWithRetry(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(project.drive_folder_id)}`,
                ctx.accessToken,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ trashed: true }),
                },
                { operationId }
              );
            }

            const idxMatches = await findDriveChildren(ctx.accessToken, {
              parentId: orgRow.drive_folder_id,
              name: PROJECTS_INDEX_FILENAME,
              operationId,
            });
            if (idxMatches[0]) {
              const { data: pIdx, meta } = await readDriveJsonWithConcurrency<OrganizationProjectsIndexDoc>(
                ctx.accessToken,
                idxMatches[0].id,
                operationId
              );
              await writeCanonicalDriveJson(ctx.accessToken, {
                parentId: orgRow.drive_folder_id,
                fileName: PROJECTS_INDEX_FILENAME,
                payload: {
                  ...pIdx,
                  projects: (pIdx.projects || []).filter((p) => p.project_id !== projectId),
                  revision: (pIdx.revision || 1) + 1,
                  last_operation_id: operationId,
                  updated_at: nowIso,
                },
                knownFileId: idxMatches[0].id,
                expectedRevision: pIdx.revision,
                expectedEtag: meta.etag,
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: `${project.org_id}:projects_index`,
                  resource_type: 'projects_index',
                  org_id: project.org_id,
                  schema_version: '1',
                },
              });
            }
          }
        },
      },
    ],
    buildResult() {
      return { ok: true, deletedProjectId: projectId };
    },
    async updateProjection() {
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM workspace_resources WHERE project_id = ?`).bind(projectId),
        env.DB.prepare(`DELETE FROM site_registry WHERE project_id = ?`).bind(projectId),
        env.DB.prepare(`DELETE FROM projects WHERE project_id = ?`).bind(projectId),
      ]);
    },
  });
}

export async function updateProjectModules(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  modules: Array<{ moduleKey: ProjectModuleKey; enabled: boolean }>,
  options?: { expectedRevision?: number; operationId?: string }
) {
  const { project } = await requireProjectAccess(env.DB, projectId, session.ownerId, ['owner', 'admin']);
  const validMods = modules.filter((m) => ALL_PROJECT_MODULES.includes(m.moduleKey));
  if (validMods.length === 0) {
    throw new HierarchyServiceError('No valid modules specified.', 400, 'INVALID_MODULES');
  }

  const operationId = options?.operationId?.trim() || generateOperationId('op_mod');
  const accessToken = await requireGoogleWriteAccess(env, project.owner_id || session.ownerId, operationId);
  const nowIso = new Date().toISOString();

  let updatedModuleRows: ProjectModuleRecord[] = [];
  let nextRevision = 1;

  const res = await runSagaWithJournal(env, {
    operationId,
    operationType: 'UPDATE_PROJECT_MODULES',
    ownerId: session.ownerId,
    scopeKey: `project:${projectId}`,
    payloadForHash: { op: 'update_modules', projectId, modules: validMods, expectedRevision: options?.expectedRevision ?? null },
    target: { organization_id: project.org_id, project_id: projectId },
    accessToken,
    repairResourceType: 'project',
    repairResourceId: projectId,
    steps: [
      {
        key: 'update_drive_modules_manifest',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, project.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          if (project.drive_folder_id) {
            const cfgChildren = await findDriveChildren(ctx.accessToken, {
              parentId: project.drive_folder_id,
              name: 'Config',
              operationId,
            });
            const configFolderId = cfgChildren[0]?.id || '';
            if (configFolderId) {
              const modFiles = await findDriveChildren(ctx.accessToken, {
                parentId: configFolderId,
                name: PROJECT_MODULES_FILENAME,
                operationId,
              });
              let currentModDoc: ProjectModulesManifestDoc | null = null;
              let currentEtag: string | undefined;
              if (modFiles[0]) {
                const read = await readDriveJsonWithConcurrency<ProjectModulesManifestDoc>(
                  ctx.accessToken,
                  modFiles[0].id,
                  operationId
                );
                currentModDoc = read.data;
                currentEtag = read.meta.etag;
              }
              if (currentModDoc && options?.expectedRevision !== undefined && currentModDoc.revision !== options.expectedRevision) {
                throw new BuillyTransactionError(
                  'REVISION_CONFLICT',
                  `Revision conflict on modules.json for project "${projectId}".`,
                  {
                    operationId,
                    details: {
                      resourceId: `${projectId}:modules`,
                      expectedRevision: options.expectedRevision,
                      actualRevision: currentModDoc.revision,
                    },
                  }
                );
              }

              const moduleMap: Record<string, { enabled: boolean; config_ref?: string }> = {
                ...(currentModDoc?.modules || {}),
              };
              for (const k of ALL_PROJECT_MODULES) {
                if (!moduleMap[k]) moduleMap[k] = { enabled: true };
              }
              for (const m of validMods) {
                moduleMap[m.moduleKey] = { ...moduleMap[m.moduleKey], enabled: Boolean(m.enabled) };
              }

              nextRevision = (currentModDoc?.revision || 0) + 1;
              await writeCanonicalDriveJson(ctx.accessToken, {
                parentId: configFolderId,
                fileName: PROJECT_MODULES_FILENAME,
                payload: {
                  schema_version: 1,
                  project_id: projectId,
                  modules: moduleMap,
                  revision: nextRevision,
                  last_operation_id: operationId,
                  updated_at: nowIso,
                },
                knownFileId: modFiles[0]?.id,
                expectedRevision: currentModDoc?.revision,
                expectedEtag: currentEtag,
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: `${projectId}:modules`,
                  resource_type: 'project_modules',
                  project_id: projectId,
                  schema_version: '1',
                },
              });
            }
          }
        },
      },
    ],
    buildResult() {
      return { ok: true, revision: nextRevision };
    },
    async updateProjection() {
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
      updatedModuleRows = rows.results || [];
    },
  });

  if (updatedModuleRows.length === 0) {
    const rows = await env.DB.prepare(`SELECT * FROM project_modules WHERE project_id = ?`)
      .bind(projectId)
      .all<ProjectModuleRecord>();
    updatedModuleRows = rows.results || [];
  }

  return { ...res, modules: updatedModuleRows };
}

export async function createSiteInProject(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  input: { siteName: string; siteSlug: string; operationKey?: string; operationId?: string }
) {
  const operationId =
    (input.operationId || input.operationKey || '').trim() || generateOperationId('op_site');
  const { project } = await requireProjectAccess(env.DB, projectId, session.ownerId, [
    'owner',
    'admin',
    'editor',
  ]);

  const accessToken = await requireGoogleWriteAccess(env, project.owner_id || session.ownerId, operationId);

  // Verify Website / Publishing capability is enabled on this Project
  const modRows = await env.DB.prepare(`SELECT * FROM project_modules WHERE project_id = ?`)
    .bind(projectId)
    .all<ProjectModuleRecord>();
  const pubMod = (modRows.results || []).find((m) => m.module_key === 'publishing');
  if (pubMod && pubMod.enabled === 0) {
    throw new HierarchyServiceError(
      'Publishing / Site capability must be enabled on this Project before creating a Site.',
      403,
      'SITE_CAPABILITY_DISABLED'
    );
  }

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

  const existingSite = await env.DB.prepare(`SELECT site_id FROM sites WHERE site_slug = ? LIMIT 1`)
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
  let siteFolderId = '';
  let siteManifestFileId = '';
  let siteConfigFileId = '';
  let publishedFolderId = '';

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'CREATE_SITE',
    ownerId: session.ownerId,
    scopeKey: `site:${siteId}`,
    payloadForHash: { op: 'create_site', projectId, siteName, siteSlug: slugCheck.normalized },
    target: { organization_id: project.org_id, project_id: projectId, site_id: siteId },
    accessToken,
    repairResourceType: 'site',
    repairResourceId: siteId,
    steps: [
      {
        key: 'create_site_folder_and_manifests',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, project.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          let configSitesFolderId = '';
          if (project.drive_folder_id) {
            const cfgFolder = await ensureMarkerFolder(ctx.accessToken, {
              parentId: project.drive_folder_id,
              name: 'Config',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config`,
                resource_type: 'config_root',
                project_id: projectId,
                schema_version: '1',
              },
            });
            const sitesF = await ensureMarkerFolder(ctx.accessToken, {
              parentId: cfgFolder.folder.id,
              name: 'Sites',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:config_sites`,
                resource_type: 'config_sites',
                project_id: projectId,
                schema_version: '1',
              },
            });
            configSitesFolderId = sitesF.folder.id;

            const thisSiteF = await ensureMarkerFolder(ctx.accessToken, {
              parentId: configSitesFolderId,
              name: siteId,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: siteId,
                resource_type: 'site_folder',
                site_id: siteId,
                project_id: projectId,
                schema_version: '1',
              },
            });
            siteFolderId = thisSiteF.folder.id;

            const pubF = await ensureMarkerFolder(ctx.accessToken, {
              parentId: siteFolderId,
              name: 'Published',
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${siteId}:published`,
                resource_type: 'site_published_folder',
                site_id: siteId,
                schema_version: '1',
              },
            });
            publishedFolderId = pubF.folder.id;

            const savedCfg = await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: siteFolderId,
              fileName: SITE_CONFIG_FILENAME,
              payload: {
                schema_version: 1,
                site_id: siteId,
                project_id: projectId,
                site_slug: slugCheck.normalized,
                site_name: siteName,
                revision: 1,
                last_operation_id: operationId,
                updated_at: nowIso,
              },
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${siteId}:site_config`,
                resource_type: 'site_config',
                site_id: siteId,
                schema_version: '1',
              },
            });
            siteConfigFileId = savedCfg.fileId;

            const siteManifest: SiteManifestDoc = {
              schema_version: 1,
              site_id: siteId,
              project_id: projectId,
              organization_id: project.org_id,
              site_slug: slugCheck.normalized,
              site_name: siteName,
              custom_domain: null,
              status: 'draft',
              active_publish_version_id: null,
              active_build_id: '',
              site_config_file_id: siteConfigFileId,
              published_folder_id: publishedFolderId,
              folder_id: siteFolderId,
              revision: 1,
              last_operation_id: operationId,
              created_at: nowIso,
              updated_at: nowIso,
            };
            const savedMan = await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: siteFolderId,
              fileName: SITE_MANIFEST_FILENAME,
              payload: siteManifest as unknown as Record<string, unknown>,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: siteId,
                resource_type: 'site_manifest',
                site_id: siteId,
                schema_version: '1',
              },
            });
            siteManifestFileId = savedMan.fileId;

            await upsertCanonicalResourceRegistryEntry(ctx.accessToken, {
              systemFolderId: boot.systemFolderId,
              registryFileId: boot.resourceRegistryFileId,
              ownerAccountId: project.owner_id,
              operationId,
              entry: {
                resource_id: `wres_${siteId}`,
                owner_type: 'site',
                owner_id: project.owner_id,
                org_id: project.org_id,
                project_id: projectId,
                site_id: siteId,
                resource_type: 'site_manifest',
                resource_key: siteId,
                drive_file_id: siteManifestFileId,
                spreadsheet_id: '',
                parent_folder_id: siteFolderId,
                title: siteName,
                mime_type: 'application/json',
                schema_version: 1,
                status: 'active',
              },
            });
          }
        },
      },
    ],
    buildResult() {
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
        drive_config_folder_id: siteFolderId,
        canonical_revision: 1,
        last_operation_id: operationId,
        drive_manifest_file_id: siteManifestFileId,
        created_at: nowIso,
        updated_at: nowIso,
      };
      return { ok: true, site };
    },
    async updateProjection() {
      await env.DB.batch([
        env.DB.prepare(`PRAGMA foreign_keys = ON`),
        env.DB.prepare(
          `INSERT INTO sites (
             site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
             status, active_publish_version, active_build_id, drive_config_folder_id,
             canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'draft', '', '', ?, 1, ?, 'synced', ?, ?, ?, ?)`
        ).bind(
          siteId,
          projectId,
          project.org_id,
          project.owner_id,
          slugCheck.normalized,
          siteName,
          siteFolderId,
          nowIso,
          operationId,
          siteManifestFileId,
          nowIso,
          nowIso
        ),
      ]);
    },
  });
}

export async function updateSiteInProject(
  env: WorkerEnv,
  session: VerifiedSession,
  siteId: string,
  input: { siteName?: string; siteSlug?: string; expectedRevision?: number; operationId?: string }
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
    throw new HierarchyServiceError('Site not found or you do not have access.', 403, 'SITE_FORBIDDEN');
  }
  if (!['owner', 'admin', 'editor'].includes(row.member_role)) {
    throw new HierarchyServiceError('Insufficient permissions to update Site.', 403, 'INSUFFICIENT_ROLE');
  }

  const operationId = input.operationId?.trim() || generateOperationId('op_site_upd');
  const accessToken = await requireGoogleWriteAccess(env, row.owner_id || session.ownerId, operationId);

  let nextSlug = row.site_slug;
  if (input.siteSlug !== undefined) {
    const slugCheck = validateSiteSlug(input.siteSlug);
    if (!slugCheck.valid) {
      throw new HierarchyServiceError(
        slugCheck.error || 'Invalid site slug.',
        400,
        slugCheck.code || 'RESERVED_SITE_SLUG'
      );
    }
    const dupSite = await env.DB.prepare(
      `SELECT site_id FROM sites WHERE site_slug = ? AND site_id != ? LIMIT 1`
    )
      .bind(slugCheck.normalized, siteId)
      .first<{ site_id: string }>();
    const dupReg = await env.DB.prepare(
      `SELECT site_id FROM site_registry WHERE site_slug = ? AND site_id != ? LIMIT 1`
    )
      .bind(slugCheck.normalized, siteId)
      .first<{ site_id: string }>();
    if (dupSite || dupReg) {
      throw new HierarchyServiceError(
        `Site slug "/${slugCheck.normalized}" is already in use.`,
        409,
        'SITE_SLUG_CONFLICT'
      );
    }
    nextSlug = slugCheck.normalized;
  }

  const nextName = input.siteName !== undefined ? input.siteName.trim() : row.site_name;
  if (!nextName || nextName.length > 80) {
    throw new HierarchyServiceError('Site name must be 1–80 characters.', 400, 'INVALID_SITE_NAME');
  }

  const nowIso = new Date().toISOString();
  let nextRevision = (row.canonical_revision || 1) + 1;

  return runSagaWithJournal(env, {
    operationId,
    operationType: 'UPDATE_SITE',
    ownerId: session.ownerId,
    scopeKey: `site:${siteId}`,
    payloadForHash: { op: 'update_site', siteId, nextName, nextSlug, expectedRevision: input.expectedRevision ?? null },
    target: { organization_id: row.org_id, project_id: row.project_id, site_id: siteId },
    accessToken,
    repairResourceType: 'site',
    repairResourceId: siteId,
    steps: [
      {
        key: 'update_site_manifest',
        async run(ctx) {
          const boot = await bootstrapAccountDrive(env, ctx.accessToken, row.owner_id, { operationId });
          ctx.setOperationsFolderId(boot.operationsFolderId);

          if (row.drive_config_folder_id) {
            const matches = await findDriveChildren(ctx.accessToken, {
              parentId: row.drive_config_folder_id,
              name: SITE_MANIFEST_FILENAME,
              operationId,
            });
            const mId = row.drive_manifest_file_id || matches[0]?.id || '';
            if (mId) {
              const { data: currentDoc, meta } = await readDriveJsonWithConcurrency<SiteManifestDoc>(
                ctx.accessToken,
                mId,
                operationId
              );
              const expectedRev = input.expectedRevision ?? currentDoc.revision;
              if (currentDoc.revision !== expectedRev) {
                throw new BuillyTransactionError(
                  'REVISION_CONFLICT',
                  `Revision conflict on site "${siteId}": expected ${expectedRev}, found ${currentDoc.revision}.`,
                  {
                    operationId,
                    details: {
                      resourceId: siteId,
                      expectedRevision: expectedRev,
                      actualRevision: currentDoc.revision,
                    },
                  }
                );
              }
              nextRevision = currentDoc.revision + 1;
              await writeCanonicalDriveJson(ctx.accessToken, {
                parentId: row.drive_config_folder_id,
                fileName: SITE_MANIFEST_FILENAME,
                payload: {
                  ...currentDoc,
                  site_name: nextName,
                  site_slug: nextSlug,
                  revision: nextRevision,
                  last_operation_id: operationId,
                  updated_at: nowIso,
                },
                knownFileId: mId,
                expectedRevision: expectedRev,
                expectedEtag: meta.etag,
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: siteId,
                  resource_type: 'site_manifest',
                  site_id: siteId,
                  schema_version: '1',
                },
              });
            }
          }
        },
      },
    ],
    buildResult() {
      return {
        ok: true,
        site: {
          ...row,
          site_name: nextName,
          site_slug: nextSlug,
          canonical_revision: nextRevision,
          last_operation_id: operationId,
          updated_at: nowIso,
        },
      };
    },
    async updateProjection() {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE sites
           SET site_name = ?, site_slug = ?, canonical_revision = ?, projected_at = ?, projection_status = 'synced',
               last_operation_id = ?, updated_at = ?
           WHERE site_id = ?`
        ).bind(nextName, nextSlug, nextRevision, nowIso, operationId, nowIso, siteId),
        env.DB.prepare(
          `UPDATE site_registry SET site_name = ?, site_slug = ?, canonical_revision = ?, last_operation_id = ?, updated_at = ? WHERE site_id = ? AND owner_id = ?`
        ).bind(nextName, nextSlug, nextRevision, operationId, nowIso, siteId, row.owner_id),
      ]);
    },
  });
}
