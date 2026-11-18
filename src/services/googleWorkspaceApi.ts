import { SheetsTab } from '../types/builder';
import { ENV_CONFIG } from '../config/env';
import { escapeSheetFormulaCell, unescapeSheetFormulaCell } from './cms/cmsValidation';

export interface PortfolioTabSchema {
  name: string;
  description: string;
  columns: string[];
}

export const SCHEMA_VERSION = ENV_CONFIG.schemaVersion;

export const PORTFOLIO_SHEET_SCHEMA: PortfolioTabSchema[] = [
  {
    name: 'META',
    description: 'Spreadsheet schema version, portfolio ID, and initialization metadata',
    columns: ['key', 'value', 'updatedAt'],
  },
  {
    name: 'PROFILE',
    description: 'Primary owner personal branding and biography',
    columns: ['id', 'name', 'title', 'bio', 'location', 'email', 'availableForWork', 'heroKicker'],
  },
  {
    name: 'PROJECTS',
    description: 'Curated portfolio works and case studies',
    columns: ['id', 'title', 'category', 'year', 'description', 'thumbnail', 'link', 'featured'],
  },
  {
    name: 'SKILLS',
    description: 'Technical competencies, design tools, and frameworks',
    columns: ['id', 'name', 'category', 'proficiency', 'icon'],
  },
  {
    name: 'EXPERIENCE',
    description: 'Professional career timeline and milestones',
    columns: ['id', 'company', 'role', 'period', 'description'],
  },
  {
    name: 'EDUCATION',
    description: 'Academic background and certifications',
    columns: ['id', 'institution', 'degree', 'period', 'description'],
  },
  {
    name: 'SOCIAL_LINKS',
    description: 'External verified profiles and contact handles',
    columns: ['id', 'platform', 'url', 'handle'],
  },
  {
    name: 'VersionHistory',
    description: 'Builly version management system registry and release metadata',
    columns: [
      'version_id',
      'site_id',
      'version_number',
      'release_name',
      'description',
      'build_id',
      'artifact_url',
      'snapshot_id',
      'manifest_url',
      'artifact_hash',
      'status',
      'is_active',
      'created_at',
      'created_by',
      'deleted_at',
      'deleted_by',
    ],
  },
  {
    name: 'InboxRegistry',
    description: 'Central registry aggregating all website form submissions',
    columns: [
      'inbox_item_id',
      'submission_id',
      'owner_account_id',
      'site_id',
      'form_id',
      'form_name_snapshot',
      'category_id',
      'destination_data_source_id',
      'destination_spreadsheet_id',
      'destination_worksheet_id',
      'read_status',
      'read_at',
      'starred',
      'archived',
      'spam_status',
      'submitted_at',
      'source_page',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'InboxCategories',
    description: 'Inbox inquiry categories and tags',
    columns: [
      'category_id',
      'owner_account_id',
      'site_id',
      'name',
      'description',
      'color',
      'is_default',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'InboxNotes',
    description: 'Private internal notes on form submissions',
    columns: [
      'note_id',
      'inbox_item_id',
      'author_id',
      'note_content',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'InboxActivity',
    description: 'Audit history and activity log for submission actions',
    columns: [
      'activity_id',
      'inbox_item_id',
      'action',
      'previous_value',
      'new_value',
      'actor_id',
      'created_at',
    ],
  },
  {
    name: 'CONTACT_SUBMISSIONS',
    description: 'Destination worksheet for general contact inquiry form submissions',
    columns: [
      'submission_id',
      'submitted_at',
      'full_name',
      'email',
      'phone',
      'message',
      'source_page',
    ],
  },
];

export type GoogleApiErrorCode =
  | 'REAUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'INVALID_FILE_TYPE'
  | 'READ_ONLY'
  | 'RATE_LIMITED'
  | 'API_ERROR';

export class GoogleWorkspaceApiError extends Error {
  code: GoogleApiErrorCode;
  status?: number;

  constructor(code: GoogleApiErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GoogleWorkspaceApiError';
    this.code = code;
    this.status = status;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function googleFetchWithRetry(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  attempt = 0
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    if (attempt < 2) {
      const backoffMs = 450 * Math.pow(2, attempt) + Math.floor(Math.random() * 180);
      await sleep(backoffMs);
      return googleFetchWithRetry(url, accessToken, init, attempt + 1);
    }
    throw new GoogleWorkspaceApiError(
      'RATE_LIMITED',
      'Google Sheets API is temporarily busy or rate-limited. Please wait a moment and retry.',
      res.status
    );
  }

  if (res.status === 401) {
    throw new GoogleWorkspaceApiError(
      'REAUTH_REQUIRED',
      'Your Google Workspace session expired or was revoked. Please reconnect Google to continue.',
      401
    );
  }

  if (res.status === 403) {
    throw new GoogleWorkspaceApiError(
      'PERMISSION_DENIED',
      'Insufficient Google permissions to access this spreadsheet.',
      403
    );
  }

  if (res.status === 404) {
    throw new GoogleWorkspaceApiError(
      'NOT_FOUND',
      'The selected Google Spreadsheet could not be found. It may have been deleted or moved.',
      404
    );
  }

  if (!res.ok) {
    throw new GoogleWorkspaceApiError(
      'API_ERROR',
      `Google Workspace API request failed with status ${res.status}.`,
      res.status
    );
  }

  return res;
}

// --- Google Picker API Loader & Invocation ---

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let gapiLoaderPromise: Promise<void> | null = null;

function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Picker is only available in the browser.'));
  }

  if (window.google?.picker) {
    return Promise.resolve();
  }

  if (gapiLoaderPromise) return gapiLoaderPromise;

  gapiLoaderPromise = new Promise<void>((resolve, reject) => {
    const initPickerModule = () => {
      if (!window.gapi?.load) {
        reject(new Error('Google API script loaded without gapi.load.'));
        return;
      }
      window.gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => reject(new Error('Failed to load Google Picker widget.')),
      });
    };

    if (window.gapi?.load) {
      initPickerModule();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]'
    );
    if (existing) {
      existing.addEventListener('load', initPickerModule, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Picker script.')),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = initPickerModule;
    script.onerror = () => {
      gapiLoaderPromise = null;
      reject(new Error('Unable to load Google Picker API script. Check network access.'));
    };
    document.head.appendChild(script);
  });

  return gapiLoaderPromise;
}

export interface PickerSelectionResult {
  cancelled: boolean;
  fileId?: string;
  name?: string;
  mimeType?: string;
  url?: string;
}

export async function openGoogleSpreadsheetPicker(
  accessToken: string
): Promise<PickerSelectionResult> {
  await loadGooglePickerApi();

  return new Promise<PickerSelectionResult>((resolve, reject) => {
    try {
      const pickerOrigin =
        window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
          ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
          : window.location.origin;

      const googleObj = window.google;
      if (!googleObj?.picker) {
        reject(new Error('Google Picker failed to initialize.'));
        return;
      }

      const docsView = new googleObj.picker.DocsView(googleObj.picker.ViewId.SPREADSHEETS)
        .setMimeTypes('application/vnd.google-apps.spreadsheet')
        .setIncludeFolders(false);

      const picker = new googleObj.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(accessToken)
        .setOrigin(pickerOrigin)
        .setTitle('Select Portfolio Google Spreadsheet')
        .setCallback((data: any) => {
          if (data.action === googleObj.picker.Action.PICKED) {
            const file = data.docs?.[0];
            if (!file?.id) {
              resolve({ cancelled: true });
              return;
            }
            resolve({
              cancelled: false,
              fileId: file.id,
              name: file.name,
              mimeType: file.mimeType,
              url: file.url,
            });
          } else if (data.action === googleObj.picker.Action.CANCEL) {
            resolve({ cancelled: true });
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}

export function extractSpreadsheetIdFromInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;
  const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) return trimmed;
  return null;
}

export interface VerifiedSpreadsheetInfo {
  id: string;
  name: string;
  url: string;
  canEdit: boolean;
  existingTabTitles: string[];
  missingSchemaTabs: string[];
  schemaVersion: string;
}

export async function verifySpreadsheetAccess(
  accessToken: string,
  spreadsheetId: string
): Promise<VerifiedSpreadsheetInfo> {
  const driveRes = await googleFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      spreadsheetId
    )}?fields=id,name,mimeType,trashed,webViewLink,capabilities(canEdit)&supportsAllDrives=true`,
    accessToken
  );
  const driveFile = await driveRes.json();

  if (driveFile.trashed) {
    throw new GoogleWorkspaceApiError(
      'NOT_FOUND',
      'This Google Spreadsheet is in the Trash. Restore it or select another spreadsheet.'
    );
  }

  if (driveFile.mimeType !== 'application/vnd.google-apps.spreadsheet') {
    throw new GoogleWorkspaceApiError(
      'INVALID_FILE_TYPE',
      'The selected file is not a Google Spreadsheet. Please select a Google Sheets file.'
    );
  }

  const canEdit = Boolean(driveFile.capabilities?.canEdit);
  if (!canEdit) {
    throw new GoogleWorkspaceApiError(
      'READ_ONLY',
      `You only have read-only access to "${driveFile.name}". Select a spreadsheet you can edit to sync portfolio changes.`
    );
  }

  const sheetMetaRes = await googleFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(title,sheetId)`,
    accessToken
  );
  const sheetMeta = await sheetMetaRes.json();

  const existingTabTitles: string[] = (sheetMeta.sheets || [])
    .map((s: any) => s?.properties?.title)
    .filter(Boolean);

  const missingSchemaTabs = PORTFOLIO_SHEET_SCHEMA.map((s) => s.name).filter(
    (reqName) => !existingTabTitles.includes(reqName)
  );

  return {
    id: sheetMeta.spreadsheetId || spreadsheetId,
    name: sheetMeta.properties?.title || driveFile.name || 'Portfolio Spreadsheet',
    url:
      sheetMeta.spreadsheetUrl ||
      driveFile.webViewLink ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    canEdit,
    existingTabTitles,
    missingSchemaTabs,
    schemaVersion: SCHEMA_VERSION,
  };
}

function escapeSheetTitleForA1(title: string): string {
  const safe = title.replace(/'/g, "''");
  return `'${safe}'`;
}

export async function readSpreadsheetTabs(
  accessToken: string,
  spreadsheetId: string
): Promise<{ tabs: SheetsTab[]; totalRecords: number; readAt: string }> {
  const metaRes = await googleFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=sheets.properties(title,sheetId)`,
    accessToken
  );
  const meta = await metaRes.json();
  const sheetTitles: string[] = (meta.sheets || [])
    .map((s: any) => s?.properties?.title)
    .filter(Boolean);

  if (sheetTitles.length === 0) {
    return {
      tabs: [],
      totalRecords: 0,
      readAt: new Date().toLocaleTimeString(),
    };
  }

  const rangeParams = sheetTitles
    .map((t) => `ranges=${encodeURIComponent(`${escapeSheetTitleForA1(t)}!A:ZZ`)}`)
    .join('&');

  const batchRes = await googleFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchGet?${rangeParams}&majorDimension=ROWS`,
    accessToken
  );
  const batchData = await batchRes.json();
  const valueRanges: any[] = batchData.valueRanges || [];

  let totalRecords = 0;
  const tabs: SheetsTab[] = sheetTitles.map((title, idx) => {
    const schemaDef = PORTFOLIO_SHEET_SCHEMA.find((s) => s.name === title);
    const values: any[][] = valueRanges[idx]?.values || [];
    const headerRow: string[] =
      values[0] && values[0].length > 0
        ? values[0].map((c: any) => String(c).trim()).filter(Boolean)
        : schemaDef?.columns || ['id', 'value'];

    const dataRows = values.slice(1).filter((r) => r.some((cell) => String(cell ?? '').trim() !== ''));

    const rows: Record<string, any>[] = dataRows.map((rowArr, rIdx) => {
      const record: Record<string, any> = {};
      headerRow.forEach((col, cIdx) => {
        record[col] = rowArr[cIdx] !== undefined ? unescapeSheetFormulaCell(rowArr[cIdx]) : '';
      });
      if (headerRow.includes('id') && !record.id) {
        record.id = `${title.toLowerCase()}_row_${rIdx + 1}`;
      }
      return record;
    });

    totalRecords += rows.length;

    return {
      name: title,
      description:
        schemaDef?.description || `Google Sheets tab "${title}" (${rows.length} rows)`,
      columns: headerRow,
      rows,
    };
  });

  return {
    tabs,
    totalRecords,
    readAt: new Date().toLocaleTimeString(),
  };
}

export async function initializeMissingTabsInSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  portfolioName: string,
  portfolioId: string
): Promise<{ addedTabs: string[] }> {
  const info = await verifySpreadsheetAccess(accessToken, spreadsheetId);
  const missing = info.missingSchemaTabs;

  if (missing.length === 0) {
    return { addedTabs: [] };
  }

  // 1. Add missing tabs in a single batchUpdate
  await googleFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: missing.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      }),
    }
  );

  // 2. Write headers (and META metadata if META was newly added) in a single values:batchUpdate
  const now = new Date().toISOString();
  const valueUpdates = missing.map((title) => {
    const schema = PORTFOLIO_SHEET_SCHEMA.find((s) => s.name === title)!;
    const rows: any[][] = [schema.columns];
    if (title === 'META') {
      rows.push(['schema_version', escapeSheetFormulaCell(SCHEMA_VERSION), now]);
      rows.push(['portfolio_id', escapeSheetFormulaCell(portfolioId), now]);
      rows.push(['portfolio_name', escapeSheetFormulaCell(portfolioName), now]);
    }
    return {
      range: `${escapeSheetTitleForA1(title)}!A1`,
      majorDimension: 'ROWS',
      values: rows,
    };
  });

  await googleFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: valueUpdates,
      }),
    }
  );

  return { addedTabs: missing };
}

export async function createPortfolioSpreadsheet(
  accessToken: string,
  portfolioName: string,
  portfolioId: string,
  starterTabs?: SheetsTab[]
): Promise<{
  id: string;
  name: string;
  url: string;
  tabs: SheetsTab[];
  totalRecords: number;
  driveFolderId?: string;
}> {
  const title = `Builly Portfolio — ${portfolioName || 'My Portfolio'}`;

  // 1. Create spreadsheet with all schema tabs
  const createRes = await googleFetchWithRetry(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title },
        sheets: PORTFOLIO_SHEET_SCHEMA.map((s) => ({
          properties: {
            title: s.name,
            gridProperties: { frozenRowCount: 1 },
          },
        })),
      }),
    }
  );

  const created = await createRes.json();
  const spreadsheetId: string = created.spreadsheetId;
  const spreadsheetUrl: string =
    created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 2. Populate headers, META tab, and optional starter template rows in one batchUpdate
  const now = new Date().toISOString();
  const data = PORTFOLIO_SHEET_SCHEMA.map((schema) => {
    const starter = starterTabs?.find((t) => t.name === schema.name);
    const values: any[][] = [schema.columns];

    if (schema.name === 'META') {
      values.push(['schema_version', escapeSheetFormulaCell(SCHEMA_VERSION), now]);
      values.push(['portfolio_id', escapeSheetFormulaCell(portfolioId), now]);
      values.push(['portfolio_name', escapeSheetFormulaCell(portfolioName), now]);
      values.push(['initialized_at', now, now]);
    } else if (starter && starter.rows.length > 0) {
      starter.rows.forEach((row, idx) => {
        values.push(
          schema.columns.map((col) =>
            col === 'id' && !row[col]
              ? `${schema.name.toLowerCase()}_${idx + 1}`
              : escapeSheetFormulaCell(row[col] ?? '')
          )
        );
      });
    }

    return {
      range: `${escapeSheetTitleForA1(schema.name)}!A1`,
      majorDimension: 'ROWS',
      values,
    };
  });

  await googleFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data,
      }),
    }
  );

  // 3. Best-effort check/create Drive folder for builder assets
  let driveFolderId: string | undefined;
  try {
    const escapedFolder = ENV_CONFIG.driveFolderName.replace(/'/g, "\\'");
    const folderQuery = encodeURIComponent(
      `name = '${escapedFolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );
    const listRes = await googleFetchWithRetry(
      `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)`,
      accessToken
    );
    const listJson = await listRes.json();
    if (listJson.files?.[0]?.id) {
      driveFolderId = listJson.files[0].id;
    } else {
      const createFolderRes = await googleFetchWithRetry(
        'https://www.googleapis.com/drive/v3/files',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: ENV_CONFIG.driveFolderName,
            mimeType: 'application/vnd.google-apps.folder',
          }),
        }
      );
      const folderJson = await createFolderRes.json();
      driveFolderId = folderJson.id;
    }
  } catch {
    // Non-blocking: Spreadsheet creation itself succeeded and is verified below.
  }

  // 4. Read back verified rows directly from Sheets API
  const readBack = await readSpreadsheetTabs(accessToken, spreadsheetId);

  return {
    id: spreadsheetId,
    name: title,
    url: spreadsheetUrl,
    tabs: readBack.tabs,
    totalRecords: readBack.totalRecords,
    driveFolderId,
  };
}

export async function saveTabsToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  tabs: SheetsTab[]
): Promise<{ recordsWritten: number; writeAt: string; spreadsheetUrl: string }> {
  const info = await verifySpreadsheetAccess(accessToken, spreadsheetId);

  // Ensure any tab edited in UI exists in the spreadsheet
  const missingInSheet = tabs
    .map((t) => t.name)
    .filter((name) => !info.existingTabTitles.includes(name));

  if (missingInSheet.length > 0) {
    await googleFetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: missingInSheet.map((title) => ({
            addSheet: {
              properties: { title, gridProperties: { frozenRowCount: 1 } },
            },
          })),
        }),
      }
    );
  }

  // Write headers + formula-safe rows BEFORE trimming surplus trailing rows so partial failures never wipe live sheets
  let recordsWritten = 0;
  const data = tabs.map((tab) => {
    const headerRow = tab.columns;
    const bodyRows = tab.rows.map((row, idx) => {
      recordsWritten++;
      return headerRow.map((col) => {
        if (col === 'id' && !row[col]) {
          return `${tab.name.toLowerCase()}_${Date.now()}_${idx}`;
        }
        return escapeSheetFormulaCell(row[col] ?? '');
      });
    });

    return {
      range: `${escapeSheetTitleForA1(tab.name)}!A1`,
      majorDimension: 'ROWS',
      values: [headerRow, ...bodyRows],
    };
  });

  await googleFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data,
      }),
    }
  );

  // Safely clear only trailing stale rows below the newly written range
  const trailingClearRanges = tabs.map((tab) => {
    const nextRowStart = tab.rows.length + 2;
    return `${escapeSheetTitleForA1(tab.name)}!A${nextRowStart}:ZZ`;
  });
  if (trailingClearRanges.length > 0) {
    await googleFetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchClear`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranges: trailingClearRanges }),
      }
    ).catch(() => undefined);
  }

  return {
    recordsWritten,
    writeAt: new Date().toLocaleTimeString(),
    spreadsheetUrl: info.url,
  };
}

export async function createSpreadsheetBackupCopy(
  accessToken: string,
  spreadsheetId: string,
  options?: { targetFolderId?: string; backupName?: string }
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const name =
    options?.backupName ||
    `Builly Backup — ${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const res = await googleFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      spreadsheetId
    )}/copy?fields=id,name,webViewLink`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        ...(options?.targetFolderId ? { parents: [options.targetFolderId] } : {}),
      }),
    }
  );
  return res.json();
}
