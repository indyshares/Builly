import { buildConsoleApiUrl } from '../../config/apiConfig';
import { ENV_CONFIG } from '../../config/env';

export interface SafeWorkspaceAccount {
  email: string;
  displayName: string;
  avatarUrl: string;
  googleSubject: string;
}

export type WorkspaceConnectionPhase =
  | 'idle'
  | 'loading'
  | 'worker_unconfigured'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'needs_reauth'
  | 'error';

export interface WorkspaceSafeStatus {
  workerAvailable: boolean;
  connected: boolean;
  needsReauth: boolean;
  ownerId: string | null;
  account: SafeWorkspaceAccount | null;
  grantedScopes: string[];
  updatedAt: string | null;
  errorCode?: string;
  message?: string;
}

export interface WorkerApiErrorExtra {
  operationId?: string;
  retryable?: boolean;
  projectionStatus?: string;
  details?: Record<string, unknown>;
}

export class WorkerApiError extends Error {
  status: number;
  code: string;
  operationId?: string;
  retryable?: boolean;
  projectionStatus?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 500,
    code = 'WORKER_ERROR',
    extra?: WorkerApiErrorExtra
  ) {
    super(message);
    this.name = 'WorkerApiError';
    this.status = status;
    this.code = code;
    this.operationId = extra?.operationId;
    this.retryable = extra?.retryable;
    this.projectionStatus = extra?.projectionStatus;
    this.details = extra?.details;
  }
}

function buildWorkerUrl(path: string): string {
  return buildConsoleApiUrl(path);
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new WorkerApiError(
      'Cloudflare Worker API endpoint is not deployed at this origin. Deploy /worker and set VITE_WORKER_API_URL.',
      res.status || 503,
      'WORKER_UNAVAILABLE'
    );
  }
  return (await res.json()) as T;
}

export const workspaceApiClient = {
  /**
   * Fetches non-sensitive Workspace connection status bound to the verified Builly owner session.
   * Never returns OAuth access tokens or refresh tokens.
   */
  async getStatus(supabaseAccessToken: string): Promise<WorkspaceSafeStatus> {
    if (!supabaseAccessToken) {
      throw new WorkerApiError('Missing Builly owner session token.', 401, 'UNAUTHORIZED');
    }

    let res: Response;
    try {
      res = await fetch(buildWorkerUrl('/api/workspace/status'), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
          Accept: 'application/json',
        },
      });
    } catch {
      return {
        workerAvailable: false,
        connected: false,
        needsReauth: false,
        ownerId: null,
        account: null,
        grantedScopes: [],
        updatedAt: null,
        errorCode: 'WORKER_UNREACHABLE',
        message: ENV_CONFIG.isWorkerConfigured
          ? `Could not reach Cloudflare Worker at ${ENV_CONFIG.workerApiUrl}.`
          : 'Cloudflare Worker API URL is not configured (VITE_WORKER_API_URL).',
      };
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        workerAvailable: false,
        connected: false,
        needsReauth: false,
        ownerId: null,
        account: null,
        grantedScopes: [],
        updatedAt: null,
        errorCode: 'WORKER_UNAVAILABLE',
        message: ENV_CONFIG.isWorkerConfigured
          ? `Expected JSON from Worker at ${ENV_CONFIG.workerApiUrl}, received ${res.status}.`
          : 'Cloudflare Worker backend is not configured yet. Set VITE_WORKER_API_URL to connect server-side Workspace OAuth.',
      };
    }

    const payload = (await res.json()) as Partial<WorkspaceSafeStatus> & {
      error?: string;
      code?: string;
    };

    if (!res.ok) {
      throw new WorkerApiError(
        payload.error || payload.message || `Workspace status failed (${res.status})`,
        res.status,
        payload.code || 'STATUS_FAILED'
      );
    }

    return {
      workerAvailable: true,
      connected: Boolean(payload.connected),
      needsReauth: Boolean(payload.needsReauth),
      ownerId: payload.ownerId || null,
      account: payload.account || null,
      grantedScopes: Array.isArray(payload.grantedScopes) ? payload.grantedScopes : [],
      updatedAt: payload.updatedAt || null,
      errorCode: payload.errorCode,
      message: payload.message,
    };
  },

  /**
   * Requests a single-use CSRF-protected Google Workspace OAuth authorization URL from the Worker.
   */
  async startGoogleWorkspaceOAuth(
    supabaseAccessToken: string,
    options?: { returnTo?: string; forceConsent?: boolean }
  ): Promise<{ authorizeUrl: string }> {
    const res = await fetch(buildWorkerUrl('/api/google/oauth/start'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        returnTo: options?.returnTo || '/workspace',
        forceConsent: Boolean(options?.forceConsent),
      }),
    });

    const data = await parseJsonSafe<{ authorizeUrl?: string; error?: string; code?: string }>(res);
    if (!res.ok || !data.authorizeUrl) {
      throw new WorkerApiError(
        data.error || 'Could not start Google Workspace authorization.',
        res.status,
        data.code || 'OAUTH_START_FAILED'
      );
    }
    return { authorizeUrl: data.authorizeUrl };
  },

  /**
   * Disconnects the verified Builly owner's Google Workspace grant on the Worker (without signing out of Builly).
   */
  async disconnect(supabaseAccessToken: string): Promise<void> {
    const res = await fetch(buildWorkerUrl('/api/google/oauth/disconnect'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAccessToken}`,
        Accept: 'application/json',
      },
    });
    const data = await parseJsonSafe<{ ok?: boolean; error?: string; code?: string }>(res);
    if (!res.ok) {
      throw new WorkerApiError(
        data.error || 'Failed to disconnect Google Workspace.',
        res.status,
        data.code || 'DISCONNECT_FAILED'
      );
    }
  },

  async verifyDriveFile(
    supabaseAccessToken: string,
    fileId: string
  ): Promise<{ file: { id: string; name: string; mimeType: string } }> {
    const res = await fetch(
      buildWorkerUrl(`/api/drive/file?fileId=${encodeURIComponent(fileId)}`),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
          Accept: 'application/json',
        },
      }
    );
    const data = await parseJsonSafe<{
      file?: { id: string; name: string; mimeType: string };
      error?: string;
      code?: string;
    }>(res);
    if (!res.ok || !data.file) {
      throw new WorkerApiError(
        data.error || 'Unable to verify Drive file.',
        res.status,
        data.code || 'DRIVE_VERIFY_FAILED'
      );
    }
    return { file: data.file };
  },

  async readSpreadsheetMeta(
    supabaseAccessToken: string,
    spreadsheetId: string
  ): Promise<{
    spreadsheet: {
      spreadsheetId: string;
      spreadsheetUrl?: string;
      properties?: { title?: string };
      sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
    };
  }> {
    const res = await fetch(
      buildWorkerUrl(`/api/sheets/meta?spreadsheetId=${encodeURIComponent(spreadsheetId)}`),
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
          Accept: 'application/json',
        },
      }
    );
    const data = await parseJsonSafe<{
      spreadsheet?: {
        spreadsheetId: string;
        spreadsheetUrl?: string;
        properties?: { title?: string };
        sheets?: Array<{ properties?: { title?: string; sheetId?: number } }>;
      };
      error?: string;
      code?: string;
    }>(res);
    if (!res.ok || !data.spreadsheet) {
      throw new WorkerApiError(
        data.error || 'Unable to read spreadsheet metadata.',
        res.status,
        data.code || 'SHEETS_META_FAILED'
      );
    }
    return { spreadsheet: data.spreadsheet };
  },

  async readSheetValues(
    supabaseAccessToken: string,
    params: { spreadsheetId: string; ranges: string[]; projectId?: string }
  ): Promise<{ valueRanges?: Array<{ range: string; values?: unknown[][] }> }> {
    const res = await fetch(buildWorkerUrl('/api/sheets/values/read'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafe<{
      ok?: boolean;
      valueRanges?: Array<{ range: string; values?: unknown[][] }>;
      error?: string;
      code?: string;
    }>(res);
    if (!res.ok) {
      throw new WorkerApiError(
        data.error || 'Unable to read Sheet values.',
        res.status,
        data.code || 'SHEETS_READ_FAILED'
      );
    }
    return { valueRanges: data.valueRanges || [] };
  },

  async writeSheetValues(
    supabaseAccessToken: string,
    params: {
      spreadsheetId: string;
      data: Array<{ range: string; values: unknown[][] }>;
      valueInputOption?: 'RAW' | 'USER_ENTERED';
      projectId?: string;
    }
  ): Promise<{ ok: boolean; totalUpdatedRows?: number }> {
    const res = await fetch(buildWorkerUrl('/api/sheets/values/write'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafe<{
      ok?: boolean;
      totalUpdatedRows?: number;
      error?: string;
      code?: string;
    }>(res);
    if (!res.ok) {
      throw new WorkerApiError(
        data.error || 'Unable to write Sheet values.',
        res.status,
        data.code || 'SHEETS_WRITE_FAILED'
      );
    }
    return { ok: true, totalUpdatedRows: data.totalUpdatedRows };
  },

  async appendSheetValues(
    supabaseAccessToken: string,
    params: {
      spreadsheetId: string;
      range: string;
      values: unknown[][];
      valueInputOption?: 'RAW' | 'USER_ENTERED';
      projectId?: string;
    }
  ): Promise<{ ok: boolean }> {
    const res = await fetch(buildWorkerUrl('/api/sheets/values/append'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafe<{ ok?: boolean; error?: string; code?: string }>(res);
    if (!res.ok) {
      throw new WorkerApiError(
        data.error || 'Unable to append Sheet rows.',
        res.status,
        data.code || 'SHEETS_APPEND_FAILED'
      );
    }
    return { ok: true };
  },

  async ensureProjectSpreadsheet(
    supabaseAccessToken: string,
    params: {
      projectId?: string;
      siteId?: string;
      domainKind: 'cms' | 'inbox' | 'system';
      datasetKey: string;
      title: string;
      tabs: string[];
    }
  ): Promise<{
    ok: boolean;
    created: boolean;
    spreadsheetId: string;
    spreadsheetUrl: string;
    title: string;
    folderId: string;
  }> {
    const res = await fetch(buildWorkerUrl('/api/sheets/spreadsheets/ensure'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafe<{
      ok?: boolean;
      created?: boolean;
      spreadsheetId?: string;
      spreadsheetUrl?: string;
      title?: string;
      folderId?: string;
      error?: string;
      code?: string;
    }>(res);
    if (!res.ok || !data.spreadsheetId) {
      throw new WorkerApiError(
        data.error || 'Unable to provision spreadsheet.',
        res.status,
        data.code || 'SHEETS_PROVISION_FAILED'
      );
    }
    return {
      ok: true,
      created: Boolean(data.created),
      spreadsheetId: data.spreadsheetId,
      spreadsheetUrl: data.spreadsheetUrl || '',
      title: data.title || params.title,
      folderId: data.folderId || '',
    };
  },
};
