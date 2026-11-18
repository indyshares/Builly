import { ENV_CONFIG } from '../../config/env';
import {
  CompleteOnboardingInput,
  CompleteOnboardingResponse,
  ConsoleBootstrapResponse,
  LegacyMigrationCleanupResult,
  LegacyMigrationExecuteInput,
  LegacyMigrationExecuteResult,
  LegacyMigrationPlan,
  OnboardingInspectionResult,
  OnboardingLocalContext,
  OrganizationRecord,
  ProjectDriveFileEntry,
  ProjectDriveFolderKind,
  ProjectDriveProvisionResponse,
  ProjectModuleKey,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
} from '../../types/workspace';
import { MediaAsset } from '../../types/builder';
import {
  CmsDocument,
  CmsFormDefinition,
  InboxActivity,
  InboxCategory,
  InboxNote,
  InboxSubmission,
} from '../../types/cms';
import { WorkerApiError } from '../workspace-connection/workspaceApiClient';

const STORAGE_KEY_SITE = 'indyshares_portfolio_site_v2';
const STORAGE_KEY_WORKSPACE = 'indyshares_google_workspace_v2';

function buildWorkerUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!ENV_CONFIG.workerApiUrl) {
    return normalizedPath;
  }
  return `${ENV_CONFIG.workerApiUrl}${normalizedPath}`;
}

export function createOperationKey(prefix = 'op'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Read-only inspection of browser local draft / workspace pointers for onboarding discovery.
 * Never mutates localStorage and never extracts or transmits OAuth credentials.
 */
export function extractLocalOnboardingContext(): OnboardingLocalContext | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }

  const ctx: OnboardingLocalContext = {};
  let hasMeaningfulData = false;

  try {
    const rawSite = window.localStorage.getItem(STORAGE_KEY_SITE);
    if (rawSite) {
      const parsed = JSON.parse(rawSite) as {
        id?: string;
        name?: string;
        portfolioSlug?: string;
        pages?: unknown[];
      };
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.id === 'string' && parsed.id.trim()) {
          ctx.siteId = parsed.id.trim();
        }
        if (typeof parsed.name === 'string' && parsed.name.trim()) {
          ctx.siteName = parsed.name.trim();
          hasMeaningfulData = true;
        }
        if (typeof parsed.portfolioSlug === 'string' && parsed.portfolioSlug.trim()) {
          ctx.portfolioSlug = parsed.portfolioSlug.trim().toLowerCase();
          hasMeaningfulData = true;
        }
        if (Array.isArray(parsed.pages)) {
          ctx.pageCount = parsed.pages.length;
          ctx.hasCustomPages = parsed.pages.length > 0;
        }
      }
    }
  } catch {
    // Ignore malformed local draft JSON
  }

  try {
    const rawWs = window.localStorage.getItem(STORAGE_KEY_WORKSPACE);
    if (rawWs) {
      const parsed = JSON.parse(rawWs) as {
        isDemoMode?: boolean;
        spreadsheetLinked?: boolean;
        spreadsheet?: { id?: string; name?: string; url?: string };
        driveFolder?: { id?: string; verified?: boolean };
      };
      if (parsed && typeof parsed === 'object' && !parsed.isDemoMode) {
        const sheetId = parsed.spreadsheet?.id?.trim() || '';
        const sheetUrl = parsed.spreadsheet?.url || '';
        const isLegacyMock =
          sheetId === 'sheet_db_7749129' || sheetUrl.includes('portfolio-canonical-db');

        if (!isLegacyMock && parsed.spreadsheetLinked && sheetId) {
          ctx.spreadsheetId = sheetId;
          if (parsed.spreadsheet?.name?.trim()) {
            ctx.spreadsheetName = parsed.spreadsheet.name.trim();
          }
          hasMeaningfulData = true;
        }

        const driveId = parsed.driveFolder?.id?.trim() || '';
        if (driveId && driveId !== 'drv_builly_root_01') {
          ctx.driveFolderId = driveId;
          hasMeaningfulData = true;
        }
      }
    }
  } catch {
    // Ignore malformed workspace JSON
  }

  return hasMeaningfulData ? ctx : null;
}

async function requestConsoleJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  operationKey?: string
): Promise<T> {
  if (!accessToken) {
    throw new WorkerApiError('Missing Builly owner session token.', 401, 'UNAUTHORIZED');
  }

  let res: Response;
  try {
    res = await fetch(buildWorkerUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(operationKey ? { 'Idempotency-Key': operationKey } : {}),
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new WorkerApiError(
      ENV_CONFIG.isWorkerConfigured
        ? `Could not reach Builly Worker API at ${ENV_CONFIG.workerApiUrl}.`
        : 'Cloudflare Worker API URL is not configured (VITE_WORKER_API_URL).',
      503,
      'WORKER_UNREACHABLE'
    );
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new WorkerApiError(
      ENV_CONFIG.isWorkerConfigured
        ? `Expected JSON response from Worker at ${ENV_CONFIG.workerApiUrl}, received ${res.status}.`
        : 'Cloudflare Worker backend is not deployed at this origin. Deploy /worker and set VITE_WORKER_API_URL.',
      res.status || 503,
      'WORKER_UNAVAILABLE'
    );
  }

  const payload = (await res.json()) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw new WorkerApiError(
      payload.error || `Console API request failed (${res.status}).`,
      res.status,
      payload.code || 'CONSOLE_API_ERROR'
    );
  }

  return payload;
}

export const workspaceHierarchyClient = {
  getBootstrap(accessToken: string): Promise<ConsoleBootstrapResponse> {
    return requestConsoleJson<ConsoleBootstrapResponse>('/api/console/bootstrap', accessToken, {
      method: 'GET',
    });
  },

  inspectOnboarding(
    accessToken: string,
    localContext?: OnboardingLocalContext | null
  ): Promise<OnboardingInspectionResult> {
    return requestConsoleJson<OnboardingInspectionResult>(
      '/api/console/onboarding/inspect',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          localContext: localContext ?? extractLocalOnboardingContext(),
        }),
      }
    );
  },

  completeOnboarding(
    accessToken: string,
    input: CompleteOnboardingInput
  ): Promise<CompleteOnboardingResponse> {
    const opKey = input.operationKey || createOperationKey('onboard');
    return requestConsoleJson<CompleteOnboardingResponse>(
      '/api/console/onboarding/complete',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          operationKey: opKey,
        }),
      },
      opKey
    );
  },

  createOrganization(
    accessToken: string,
    input: { name: string; operationKey?: string }
  ): Promise<{ ok: boolean; deduplicated?: boolean; organization: OrganizationRecord }> {
    const opKey = input.operationKey || createOperationKey('org');
    return requestConsoleJson(
      '/api/console/organizations',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ name: input.name, operationKey: opKey }),
      },
      opKey
    );
  },

  updateOrganization(
    accessToken: string,
    orgId: string,
    input: { name: string }
  ): Promise<{ ok: boolean; organization: OrganizationRecord }> {
    return requestConsoleJson(
      `/api/console/organizations/${encodeURIComponent(orgId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },

  createProject(
    accessToken: string,
    orgId: string,
    input: {
      name: string;
      description?: string;
      enabledModules?: ProjectModuleKey[];
      operationKey?: string;
    }
  ): Promise<{
    ok: boolean;
    deduplicated?: boolean;
    project: ProjectRecord;
    modules: ProjectModuleRecord[];
  }> {
    const opKey = input.operationKey || createOperationKey('prj');
    return requestConsoleJson(
      `/api/console/organizations/${encodeURIComponent(orgId)}/projects`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...input, operationKey: opKey }),
      },
      opKey
    );
  },

  updateProject(
    accessToken: string,
    projectId: string,
    input: { name?: string; description?: string }
  ): Promise<{ ok: boolean; project: ProjectRecord }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },

  updateProjectModules(
    accessToken: string,
    projectId: string,
    modules: Array<{ moduleKey: ProjectModuleKey; enabled: boolean }>
  ): Promise<{ ok: boolean; modules: ProjectModuleRecord[] }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/modules`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ modules }),
      }
    );
  },

  createSiteInProject(
    accessToken: string,
    projectId: string,
    input: { siteName: string; siteSlug: string; operationKey?: string }
  ): Promise<{ ok: boolean; deduplicated?: boolean; site: SiteRecord }> {
    const opKey = input.operationKey || createOperationKey('site');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/sites`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...input, operationKey: opKey }),
      },
      opKey
    );
  },

  updateSiteInProject(
    accessToken: string,
    siteId: string,
    input: { siteName?: string; siteSlug?: string }
  ): Promise<{ ok: boolean; site: SiteRecord }> {
    return requestConsoleJson(
      `/api/console/sites/${encodeURIComponent(siteId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },

  provisionProjectDrive(
    accessToken: string,
    projectId: string,
    options?: { verifyRemote?: boolean }
  ): Promise<ProjectDriveProvisionResponse> {
    return requestConsoleJson<ProjectDriveProvisionResponse>(
      `/api/console/projects/${encodeURIComponent(projectId)}/drive/provision`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ verifyRemote: Boolean(options?.verifyRemote) }),
      }
    );
  },

  listProjectDriveFiles(
    accessToken: string,
    projectId: string,
    folderKind: ProjectDriveFolderKind = 'project_root'
  ): Promise<{
    ok: boolean;
    projectId: string;
    folderKind: ProjectDriveFolderKind;
    folderId: string;
    files: ProjectDriveFileEntry[];
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(
        projectId
      )}/drive/files?folderKind=${encodeURIComponent(folderKind)}`,
      accessToken,
      { method: 'GET' }
    );
  },

  readProjectDriveJson<T = unknown>(
    accessToken: string,
    projectId: string,
    params:
      | { fileId: string; folderKind?: never; fileName?: never }
      | { folderKind: ProjectDriveFolderKind; fileName: string; fileId?: never }
  ): Promise<{ ok: boolean; fileId: string; name: string; data: T }> {
    const qs =
      params.fileId !== undefined
        ? `fileId=${encodeURIComponent(params.fileId)}`
        : `folderKind=${encodeURIComponent(
            params.folderKind ?? 'project_root'
          )}&fileName=${encodeURIComponent(params.fileName ?? '')}`;
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/drive/json?${qs}`,
      accessToken,
      { method: 'GET' }
    );
  },

  writeProjectDriveJson(
    accessToken: string,
    projectId: string,
    params: {
      folderKind: ProjectDriveFolderKind;
      fileName: string;
      payload: unknown;
    }
  ): Promise<{
    ok: boolean;
    projectId: string;
    folderKind: ProjectDriveFolderKind;
    folderId: string;
    fileId: string;
    name: string;
    modifiedTime: string;
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/drive/json`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  getProjectCms(
    accessToken: string,
    projectId: string,
    options?: { includeDocument?: boolean }
  ): Promise<{
    ok: boolean;
    projectId: string;
    workspaceConnected: boolean;
    found: boolean;
    folderId: string;
    manifestFileId: string;
    spreadsheetId: string;
    document: Partial<CmsDocument> | null;
  }> {
    const includeDoc = options?.includeDocument === false ? '0' : '1';
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/cms?includeDocument=${includeDoc}`,
      accessToken,
      { method: 'GET' }
    );
  },

  saveProjectCms(
    accessToken: string,
    projectId: string,
    params: {
      document: CmsDocument;
      syncSheets?: boolean;
      title?: string;
      tables?: Array<{ title: string; headers: string[]; rows: string[][] }>;
    }
  ): Promise<{
    ok: boolean;
    projectId: string;
    folderId: string;
    richContentFolderId: string;
    manifestFileId: string;
    spreadsheetId: string;
    tabsSynced: string[];
    syncedAt: string;
    richDocs?: CmsDocument['richDocs'];
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/cms/save`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  getProjectInbox(
    accessToken: string,
    projectId: string
  ): Promise<{
    ok: boolean;
    projectId: string;
    workspaceConnected: boolean;
    folderId: string;
    stateFileId: string;
    spreadsheetId: string;
    sites: Array<{ site_id: string; site_slug: string; site_name: string; status: string }>;
    destinations: Array<{
      id: string;
      site_id: string;
      form_id: string;
      form_name: string;
      category_id: string;
      destination_spreadsheet_id: string;
      destination_worksheet_name: string;
      status: string;
      updated_at: string;
    }>;
    deliveryLogs: Array<{
      idempotency_key: string;
      site_id: string;
      form_id: string;
      submission_id: string;
      inbox_item_id: string;
      status: string;
      error_detail: string;
      created_at: string;
    }>;
    savedState: {
      inboxSubmissions?: InboxSubmission[];
      inboxCategories?: InboxCategory[];
      inboxNotes?: InboxNote[];
      inboxActivities?: InboxActivity[];
      forms?: CmsFormDefinition[];
    } | null;
    remoteSubmissions: Array<{
      inbox_item_id: string;
      submission_id: string;
      site_id: string;
      form_id: string;
      form_name_snapshot: string;
      category_id: string;
      destination_spreadsheet_id: string;
      destination_worksheet_id: string;
      submitted_at: string;
      source_page: string;
      fields: Record<string, unknown>;
    }>;
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/inbox`,
      accessToken,
      { method: 'GET' }
    );
  },

  syncProjectInbox(
    accessToken: string,
    projectId: string,
    params: {
      inboxState: {
        inboxSubmissions: InboxSubmission[];
        inboxCategories: InboxCategory[];
        inboxNotes: InboxNote[];
        inboxActivities: InboxActivity[];
        forms: CmsFormDefinition[];
      };
      syncSheets?: boolean;
      title?: string;
      tables?: Array<{ title: string; headers: string[]; rows: string[][] }>;
    }
  ): Promise<{
    ok: boolean;
    projectId: string;
    folderId: string;
    stateFileId: string;
    spreadsheetId: string;
    tabsSynced: string[];
    syncedAt: string;
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/inbox/sync`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  listProjectAssets(
    accessToken: string,
    projectId: string
  ): Promise<{
    ok: boolean;
    projectId: string;
    workspaceConnected: boolean;
    folderId: string;
    manifestFileId: string;
    assets: MediaAsset[];
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/assets`,
      accessToken,
      { method: 'GET' }
    );
  },

  uploadProjectAsset(
    accessToken: string,
    projectId: string,
    params: {
      name: string;
      mimeType: string;
      category: string;
      altText?: string;
      licenseNote?: string;
      sourceOrigin?: string;
      tags?: string[];
      dimensions?: { width: number; height: number };
      base64Data?: string;
      svgMarkup?: string;
    }
  ): Promise<{
    ok: boolean;
    projectId: string;
    folderId: string;
    manifestFileId: string;
    asset: MediaAsset;
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/assets/upload`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  deleteProjectAsset(
    accessToken: string,
    projectId: string,
    assetId: string
  ): Promise<{ ok: boolean; projectId: string; deletedId: string; manifestFileId: string }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
      accessToken,
      { method: 'DELETE' }
    );
  },

  listProjectReleases(
    accessToken: string,
    projectId: string
  ): Promise<{
    ok: boolean;
    projectId: string;
    sites: Array<{
      site_id: string;
      site_slug: string;
      site_name: string;
      status: string;
      active_publish_version: string;
      active_build_id: string;
    }>;
    releases: Array<{
      id: string;
      site_id: string;
      site_slug: string;
      owner_id: string;
      publish_version: string;
      build_id: string;
      runtime_config_drive_file_id: string;
      publish_manifest_drive_file_id: string;
      integrity_hash: string;
      schema_version: number;
      commit_message: string;
      created_at: string;
    }>;
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/releases`,
      accessToken,
      { method: 'GET' }
    );
  },

  saveProjectExportToDrive(
    accessToken: string,
    projectId: string,
    params: {
      fileName: string;
      manifest: Record<string, unknown>;
      snapshot?: Record<string, unknown>;
    }
  ): Promise<{
    ok: boolean;
    projectId: string;
    folderId: string;
    fileId: string;
    fileName: string;
    savedAt: string;
  }> {
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/exports`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    );
  },

  getMigrationPlan(
    accessToken: string,
    options?: { localContext?: OnboardingLocalContext | null; targetOrgId?: string }
  ): Promise<LegacyMigrationPlan> {
    return requestConsoleJson<LegacyMigrationPlan>('/api/console/migration/plan', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        localContext: options?.localContext ?? extractLocalOnboardingContext(),
        ...(options?.targetOrgId ? { targetOrgId: options.targetOrgId } : {}),
      }),
    });
  },

  executeMigration(
    accessToken: string,
    input: LegacyMigrationExecuteInput
  ): Promise<LegacyMigrationExecuteResult> {
    const opKey = input.operationKey || createOperationKey('mig');
    return requestConsoleJson<LegacyMigrationExecuteResult>(
      '/api/console/migration/execute',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...input, operationKey: opKey }),
      },
      opKey
    );
  },

  completeMigrationCleanup(
    accessToken: string,
    input: {
      operationKey?: string;
      targetOrgId: string;
      confirmOwnerReviewed: boolean;
      reconciliationPassed: boolean;
      archiveLegacyResourceIds?: string[];
    }
  ): Promise<LegacyMigrationCleanupResult> {
    const opKey = input.operationKey || createOperationKey('clean');
    return requestConsoleJson<LegacyMigrationCleanupResult>(
      '/api/console/migration/cleanup',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...input, operationKey: opKey }),
      },
      opKey
    );
  },
};
