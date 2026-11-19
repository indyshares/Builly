import { ApiConfigurationError, buildConsoleApiUrl } from '../../config/apiConfig';
import { ENV_CONFIG } from '../../config/env';
import {
  CompleteOnboardingInput,
  CompleteOnboardingResponse,
  ConsoleBootstrapResponse,
  D1RebuildSummary,
  DatasetSpreadsheetRef,
  LegacyMigrationCleanupResult,
  LegacyMigrationExecuteInput,
  LegacyMigrationExecuteResult,
  LegacyMigrationPlan,
  OnboardingInspectionResult,
  OnboardingLocalContext,
  OperationJournalRecord,
  OperationRecoveryResult,
  OrganizationRecord,
  ProjectionRepairRecord,
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

  let requestUrl: string;
  try {
    requestUrl = buildConsoleApiUrl(path);
  } catch (err) {
    const code = err instanceof ApiConfigurationError ? err.code : 'INVALID_API_CONFIGURATION';
    throw new WorkerApiError(
      err instanceof Error ? err.message : 'Invalid Console API configuration.',
      500,
      code
    );
  }

  const method = (init.method || 'GET').toUpperCase();
  if (import.meta.env.DEV) {
    console.debug('[ConsoleAPI]', method, requestUrl);
  }

  let res: Response;
  try {
    res = await fetch(requestUrl, {
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
    let targetOrigin = ENV_CONFIG.workerApiUrl || requestUrl;
    let isCrossOrigin = false;
    try {
      const parsed = new URL(requestUrl);
      targetOrigin = parsed.origin;
      isCrossOrigin =
        typeof window !== 'undefined' &&
        Boolean(window.location?.origin) &&
        parsed.origin !== window.location.origin;
    } catch {
      // Keep fallback label
    }

    throw new WorkerApiError(
      isCrossOrigin
        ? `Network or CORS failure reaching Builly Worker API at ${targetOrigin}. Verify the Worker is deployed and allows origin ${window.location.origin}.`
        : `Could not reach Builly Worker API at ${targetOrigin}.`,
      503,
      'WORKER_UNREACHABLE'
    );
  }

  const status = res.status;
  const contentType = res.headers.get('content-type') || '';
  const rawBody = await res.text();

  if (!contentType.toLowerCase().includes('application/json')) {
    let targetOrigin = ENV_CONFIG.workerApiUrl || requestUrl;
    try {
      targetOrigin = new URL(requestUrl).origin;
    } catch {
      // Ignore
    }

    if (status === 404) {
      throw new WorkerApiError(
        `Console API endpoint not found (404) at ${requestUrl}. Verify Worker route registration.`,
        404,
        'WORKER_ROUTE_NOT_FOUND'
      );
    }
    if (status === 401) {
      throw new WorkerApiError(
        `Authentication required or session expired (401) calling ${requestUrl}.`,
        401,
        'UNAUTHORIZED'
      );
    }
    if (status === 403) {
      throw new WorkerApiError(
        `Access forbidden (403) calling ${requestUrl}.`,
        403,
        'FORBIDDEN'
      );
    }
    if (status >= 500) {
      throw new WorkerApiError(
        `Worker server error (${status}) at ${requestUrl}.`,
        status,
        'WORKER_SERVER_ERROR'
      );
    }

    throw new WorkerApiError(
      `Expected JSON response from Worker at ${targetOrigin}, received ${status || 'unknown'} (${contentType || 'unknown content-type'}).`,
      status || 503,
      'WORKER_UNAVAILABLE'
    );
  }

  let payload: T & {
    error?: string;
    code?: string;
    operationId?: string;
    retryable?: boolean;
    projectionStatus?: string;
    details?: Record<string, unknown>;
  };

  try {
    payload = JSON.parse(rawBody) as T & {
      error?: string;
      code?: string;
      operationId?: string;
      retryable?: boolean;
      projectionStatus?: string;
      details?: Record<string, unknown>;
    };
  } catch {
    throw new WorkerApiError(
      `Malformed JSON response from Worker (${status}) at ${requestUrl}.`,
      status || 502,
      'INVALID_WORKER_JSON'
    );
  }

  if (!res.ok) {
    const defaultCode =
      status === 401
        ? 'UNAUTHORIZED'
        : status === 403
          ? 'FORBIDDEN'
          : status === 404
            ? 'RESOURCE_NOT_FOUND'
            : status >= 500
              ? 'WORKER_SERVER_ERROR'
              : 'CONSOLE_API_ERROR';

    throw new WorkerApiError(
      payload.error || `Console API request failed (${status}).`,
      status,
      payload.code || defaultCode,
      {
        operationId: payload.operationId,
        retryable: payload.retryable,
        projectionStatus: payload.projectionStatus,
        details: payload.details,
      }
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
    input: { name: string; expectedRevision?: number; operationId?: string }
  ): Promise<{ ok: boolean; deduplicated?: boolean; operationId?: string; organization: OrganizationRecord }> {
    const opKey = input.operationId || createOperationKey('org_upd');
    return requestConsoleJson(
      `/api/console/organizations/${encodeURIComponent(orgId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ ...input, operationId: opKey }),
      },
      opKey
    );
  },

  archiveOrganization(
    accessToken: string,
    orgId: string,
    input?: { expectedRevision?: number; operationId?: string }
  ): Promise<{ ok: boolean; operationId?: string; organization: OrganizationRecord }> {
    const opKey = input?.operationId || createOperationKey('org_arch');
    return requestConsoleJson(
      `/api/console/organizations/${encodeURIComponent(orgId)}/archive`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...(input || {}), operationId: opKey }),
      },
      opKey
    );
  },

  deleteOrganization(
    accessToken: string,
    orgId: string,
    input: { confirmPermanentDelete: boolean; operationId?: string }
  ): Promise<{ ok: boolean; operationId?: string; deletedOrgId: string }> {
    const opKey = input.operationId || createOperationKey('org_del');
    return requestConsoleJson(
      `/api/console/organizations/${encodeURIComponent(orgId)}`,
      accessToken,
      {
        method: 'DELETE',
        body: JSON.stringify({ confirmPermanentDelete: input.confirmPermanentDelete, operationId: opKey }),
      },
      opKey
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
    operationId?: string;
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
    input: { name?: string; description?: string; expectedRevision?: number; operationId?: string }
  ): Promise<{ ok: boolean; deduplicated?: boolean; operationId?: string; project: ProjectRecord }> {
    const opKey = input.operationId || createOperationKey('prj_upd');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ ...input, operationId: opKey }),
      },
      opKey
    );
  },

  archiveProject(
    accessToken: string,
    projectId: string,
    input?: { expectedRevision?: number; operationId?: string }
  ): Promise<{ ok: boolean; operationId?: string; project: ProjectRecord }> {
    const opKey = input?.operationId || createOperationKey('prj_arch');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/archive`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...(input || {}), operationId: opKey }),
      },
      opKey
    );
  },

  deleteProject(
    accessToken: string,
    projectId: string,
    input: { confirmPermanentDelete: boolean; operationId?: string }
  ): Promise<{ ok: boolean; operationId?: string; deletedProjectId: string }> {
    const opKey = input.operationId || createOperationKey('prj_del');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}`,
      accessToken,
      {
        method: 'DELETE',
        body: JSON.stringify({ confirmPermanentDelete: input.confirmPermanentDelete, operationId: opKey }),
      },
      opKey
    );
  },

  updateProjectModules(
    accessToken: string,
    projectId: string,
    modules: Array<{ moduleKey: ProjectModuleKey; enabled: boolean }>,
    options?: { expectedRevision?: number; operationId?: string }
  ): Promise<{ ok: boolean; operationId?: string; revision?: number; modules: ProjectModuleRecord[] }> {
    const opKey = options?.operationId || createOperationKey('mod');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/modules`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          modules,
          ...(options?.expectedRevision !== undefined ? { expectedRevision: options.expectedRevision } : {}),
          operationId: opKey,
        }),
      },
      opKey
    );
  },

  createSiteInProject(
    accessToken: string,
    projectId: string,
    input: { siteName: string; siteSlug: string; operationKey?: string }
  ): Promise<{ ok: boolean; deduplicated?: boolean; operationId?: string; site: SiteRecord }> {
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
    input: { siteName?: string; siteSlug?: string; expectedRevision?: number; operationId?: string }
  ): Promise<{ ok: boolean; operationId?: string; site: SiteRecord }> {
    const opKey = input.operationId || createOperationKey('site_upd');
    return requestConsoleJson(
      `/api/console/sites/${encodeURIComponent(siteId)}`,
      accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({ ...input, operationId: opKey }),
      },
      opKey
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
    readOnly?: boolean;
    stale?: boolean;
    unavailable?: boolean;
    lastSyncedAt?: string | null;
    found: boolean;
    folderId: string;
    manifestFileId: string;
    spreadsheetId: string;
    datasetSpreadsheets?: DatasetSpreadsheetRef[];
    revision?: number;
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
      operationId?: string;
      expectedRevision?: number;
      expectedEtag?: string;
      document: CmsDocument;
      syncSheets?: boolean;
      title?: string;
      tables?: Array<{ title: string; headers: string[]; rows: string[][] }>;
    }
  ): Promise<{
    ok: boolean;
    operationId?: string;
    revision?: number;
    projectId: string;
    folderId: string;
    richContentFolderId: string;
    manifestFileId: string;
    spreadsheetId: string;
    datasetSpreadsheets?: DatasetSpreadsheetRef[];
    tabsSynced: string[];
    syncedAt: string;
    richDocs?: CmsDocument['richDocs'];
  }> {
    const opKey = params.operationId || createOperationKey('cms');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/cms/save`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...params, operationId: opKey }),
      },
      opKey
    );
  },

  getProjectInbox(
    accessToken: string,
    projectId: string
  ): Promise<{
    ok: boolean;
    projectId: string;
    workspaceConnected: boolean;
    readOnly?: boolean;
    stale?: boolean;
    unavailable?: boolean;
    lastSyncedAt?: string | null;
    revision?: number;
    folderId: string;
    stateFileId: string;
    spreadsheetId: string;
    datasetSpreadsheets?: DatasetSpreadsheetRef[];
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
      operationId?: string;
      expectedRevision?: number;
      expectedEtag?: string;
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
    operationId?: string;
    revision?: number;
    projectId: string;
    folderId: string;
    stateFileId: string;
    spreadsheetId: string;
    datasetSpreadsheets?: DatasetSpreadsheetRef[];
    tabsSynced: string[];
    syncedAt: string;
  }> {
    const opKey = params.operationId || createOperationKey('inb');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/inbox/sync`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...params, operationId: opKey }),
      },
      opKey
    );
  },

  listProjectAssets(
    accessToken: string,
    projectId: string
  ): Promise<{
    ok: boolean;
    projectId: string;
    workspaceConnected: boolean;
    readOnly?: boolean;
    stale?: boolean;
    unavailable?: boolean;
    lastSyncedAt?: string | null;
    revision?: number;
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
      operationId?: string;
      expectedRevision?: number;
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
    operationId?: string;
    revision?: number;
    projectId: string;
    folderId: string;
    manifestFileId: string;
    asset: MediaAsset;
  }> {
    const opKey = params.operationId || createOperationKey('ast_up');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/assets/upload`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...params, operationId: opKey }),
      },
      opKey
    );
  },

  deleteProjectAsset(
    accessToken: string,
    projectId: string,
    assetId: string,
    options?: { expectedRevision?: number; operationId?: string }
  ): Promise<{ ok: boolean; operationId?: string; revision?: number; projectId: string; deletedId: string; manifestFileId: string }> {
    const opKey = options?.operationId || createOperationKey('ast_del');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`,
      accessToken,
      {
        method: 'DELETE',
        ...(options?.expectedRevision !== undefined
          ? { body: JSON.stringify({ expectedRevision: options.expectedRevision, operationId: opKey }) }
          : {}),
      },
      opKey
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
      operationId?: string;
      fileName: string;
      manifest: Record<string, unknown>;
      snapshot?: Record<string, unknown>;
    }
  ): Promise<{
    ok: boolean;
    operationId?: string;
    projectId: string;
    folderId: string;
    fileId: string;
    fileName: string;
    savedAt: string;
  }> {
    const opKey = params.operationId || createOperationKey('exp');
    return requestConsoleJson(
      `/api/console/projects/${encodeURIComponent(projectId)}/exports`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ ...params, operationId: opKey }),
      },
      opKey
    );
  },

  rebuildProjection(
    accessToken: string,
    options?: { selectedRootFolderId?: string; operationId?: string }
  ): Promise<D1RebuildSummary> {
    const opKey = options?.operationId || createOperationKey('rebuild');
    return requestConsoleJson<D1RebuildSummary>(
      '/api/console/rebuild-projection',
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(options?.selectedRootFolderId ? { selectedRootFolderId: options.selectedRootFolderId } : {}),
      },
      opKey
    );
  },

  listRepairQueue(
    accessToken: string
  ): Promise<{ ok: boolean; repairs: ProjectionRepairRecord[] }> {
    return requestConsoleJson('/api/console/repair-queue', accessToken, { method: 'GET' });
  },

  processRepairQueue(
    accessToken: string
  ): Promise<{ ok: boolean; processed: number; completed: number; failed: number }> {
    const opKey = createOperationKey('rep_proc');
    return requestConsoleJson(
      '/api/console/repair-queue/process',
      accessToken,
      { method: 'POST', body: JSON.stringify({}) },
      opKey
    );
  },

  listOperations(
    accessToken: string
  ): Promise<{ ok: boolean; operations: OperationJournalRecord[] }> {
    return requestConsoleJson('/api/console/operations', accessToken, { method: 'GET' });
  },

  getOperation(
    accessToken: string,
    operationId: string
  ): Promise<{ ok: boolean; operation: OperationJournalRecord }> {
    return requestConsoleJson(
      `/api/console/operations/${encodeURIComponent(operationId)}`,
      accessToken,
      { method: 'GET' }
    );
  },

  recoverOperation(
    accessToken: string,
    operationId: string,
    options?: { selectedRootFolderId?: string }
  ): Promise<OperationRecoveryResult> {
    return requestConsoleJson<OperationRecoveryResult>(
      `/api/console/operations/${encodeURIComponent(operationId)}/recover`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify(options?.selectedRootFolderId ? { selectedRootFolderId: options.selectedRootFolderId } : {}),
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
