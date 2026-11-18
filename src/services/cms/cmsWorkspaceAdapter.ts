import {
  CmsContentRecord,
  CmsDocument,
  CmsRichContentDoc,
} from '../../types/cms';
import { ensurePortfolioDriveFolder } from '../drivePageRegistryService';
import { GoogleWorkspaceApiError } from '../googleWorkspaceApi';
import { escapeSheetFormulaCell, unescapeSheetFormulaCell } from './cmsValidation';
import { invalidateCmsQueryCache } from './cmsQueryEngine';

const CMS_MANIFEST_FILENAME = 'cms-manifest.json';

// Serialized write lock prevents concurrent Google Sheets/Drive write races
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueCmsWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => undefined);
  return next;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wsFetchWithRetry(
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
      await sleep(450 * Math.pow(2, attempt) + Math.floor(Math.random() * 150));
      return wsFetchWithRetry(url, accessToken, init, attempt + 1);
    }
    throw new GoogleWorkspaceApiError(
      'RATE_LIMITED',
      'Google Workspace API is temporarily rate-limited. Retry in a moment.',
      res.status
    );
  }

  if (res.status === 401) {
    throw new GoogleWorkspaceApiError(
      'REAUTH_REQUIRED',
      'Google Workspace session expired. Please reconnect your account.',
      401
    );
  }

  if (res.status === 403) {
    throw new GoogleWorkspaceApiError(
      'PERMISSION_DENIED',
      'Insufficient Google Drive/Sheets permission to sync CMS data.',
      403
    );
  }

  if (!res.ok) {
    throw new GoogleWorkspaceApiError(
      'API_ERROR',
      `Google Workspace CMS API request failed with status ${res.status}.`,
      res.status
    );
  }

  return res;
}

async function ensureSubfolder(
  accessToken: string,
  parentFolderId: string,
  folderName: string,
  knownFolderId?: string
): Promise<string> {
  if (knownFolderId) {
    try {
      const checkRes = await wsFetchWithRetry(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          knownFolderId
        )}?fields=id,trashed`,
        accessToken
      );
      const check = (await checkRes.json()) as { id?: string; trashed?: boolean };
      if (check.id && !check.trashed) return check.id;
    } catch {
      // Search or create below
    }
  }

  const escaped = folderName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${parentFolderId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const findRes = await wsFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    accessToken
  );
  const found = (await findRes.json()) as { files?: { id: string }[] };
  if (found.files?.[0]?.id) return found.files[0].id;

  const createRes = await wsFetchWithRetry(
    'https://www.googleapis.com/drive/v3/files',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    }
  );
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function findDriveFileByName(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<string | null> {
  const escaped = fileName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${escaped}' and trashed = false`
  );
  const res = await wsFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    accessToken
  );
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id || null;
}

async function upsertDriveJsonFile(
  accessToken: string,
  params: {
    fileId?: string | null;
    folderId: string;
    name: string;
    payload: unknown;
  }
): Promise<string> {
  const metadata = params.fileId
    ? { name: params.name }
    : {
        name: params.name,
        mimeType: 'application/json',
        parents: [params.folderId],
      };

  const boundary = `indy_cms_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(params.payload, null, 2)}\r\n` +
    `--${boundary}--`;

  const url = params.fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        params.fileId
      )}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

  const res = await wsFetchWithRetry(url, accessToken, {
    method: params.fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function readDriveJsonFile<T>(accessToken: string, fileId: string): Promise<T> {
  const res = await wsFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken
  );
  return res.json();
}

export const CMS_REC_SYSTEM_COLUMNS = [
  'record_id',
  'site_id',
  'owner_account_id',
  'status',
  'slug',
  'title',
  'created_at',
  'updated_at',
  'published_at',
  'trashed_at',
  'deleted_by',
  'revision',
  'schema_version',
  'sort_order',
  'rich_content_ref',
] as const;

const CMS_REC_SYSTEM_COL_SET = new Set<string>(CMS_REC_SYSTEM_COLUMNS);

export function buildCmsSheetTables(
  cms: CmsDocument,
  scope?: { siteId?: string; ownerAccountId?: string }
): {
  title: string;
  headers: string[];
  rows: string[][];
}[] {
  const siteId = scope?.siteId || '';
  const ownerAccountId = scope?.ownerAccountId || '';
  const tables: { title: string; headers: string[]; rows: string[][] }[] = [];

  // 1. CMS_CONTENT_TYPES
  tables.push({
    title: 'CMS_CONTENT_TYPES',
    headers: [
      'id',
      'site_id',
      'slug',
      'singular_label',
      'plural_label',
      'is_built_in',
      'enabled',
      'routable',
      'route_base_path',
      'schema_version',
      'sheet_table_id',
      'updated_at',
    ],
    rows: cms.contentTypes.map((ct) => [
      ct.id,
      siteId,
      ct.slug,
      escapeSheetFormulaCell(ct.singularLabel),
      escapeSheetFormulaCell(ct.pluralLabel),
      String(ct.isBuiltIn),
      String(ct.enabled),
      String(ct.routable),
      ct.routeBasePath,
      String(ct.schemaVersion),
      ct.sheetTableId,
      ct.updatedAt,
    ]),
  });

  // 2. CMS_TAXONOMIES
  tables.push({
    title: 'CMS_TAXONOMIES',
    headers: ['id', 'site_id', 'key', 'label', 'hierarchical', 'content_type_ids', 'archive_base_path'],
    rows: cms.taxonomies.map((t) => [
      t.id,
      siteId,
      t.key,
      escapeSheetFormulaCell(t.label),
      String(t.hierarchical),
      t.contentTypeIds.join(','),
      t.archiveBasePath || '',
    ]),
  });

  // 3. CMS_TERMS
  tables.push({
    title: 'CMS_TERMS',
    headers: ['term_id', 'site_id', 'taxonomy_id', 'name', 'slug', 'parent_term_id', 'sort_order'],
    rows: cms.terms.map((tm) => [
      tm.termId,
      siteId,
      tm.taxonomyId,
      escapeSheetFormulaCell(tm.name),
      tm.slug,
      tm.parentTermId || '',
      String(tm.sortOrder),
    ]),
  });

  // 4. CMS_RECORD_TERMS
  const termMappings: string[][] = [];
  cms.records.forEach((rec) => {
    Object.entries(rec.termIdsByTaxonomy || {}).forEach(([taxId, termIds]) => {
      termIds.forEach((termId) => {
        termMappings.push([rec.recordId, rec.contentTypeId, taxId, termId]);
      });
    });
  });
  tables.push({
    title: 'CMS_RECORD_TERMS',
    headers: ['record_id', 'content_type_id', 'taxonomy_id', 'term_id'],
    rows: termMappings,
  });

  // 5. CMS_RELATIONSHIPS
  tables.push({
    title: 'CMS_RELATIONSHIPS',
    headers: [
      'id',
      'site_id',
      'name',
      'source_type_id',
      'field_key',
      'target_type_id',
      'cardinality',
      'on_delete',
    ],
    rows: cms.relationships.map((rel) => [
      rel.id,
      siteId,
      escapeSheetFormulaCell(rel.name),
      rel.sourceTypeId,
      rel.fieldKey,
      rel.targetTypeId,
      rel.cardinality,
      rel.onDelete,
    ]),
  });

  // 6. CMS_RECORD_RELATIONS
  const relRows: string[][] = [];
  cms.records.forEach((rec) => {
    Object.entries(rec.relationIdsByField || {}).forEach(([fieldKey, targetIds]) => {
      targetIds.forEach((tid, idx) => {
        relRows.push([rec.recordId, rec.contentTypeId, fieldKey, tid, String(idx)]);
      });
    });
  });
  tables.push({
    title: 'CMS_RECORD_RELATIONS',
    headers: ['source_record_id', 'source_type_id', 'field_key', 'target_record_id', 'sort_order'],
    rows: relRows,
  });

  // 7. CMS_MIGRATION_LOG
  tables.push({
    title: 'CMS_MIGRATION_LOG',
    headers: ['id', 'site_id', 'timestamp', 'content_type_id', 'from_version', 'to_version', 'summary'],
    rows: (cms.migrationLog || []).slice(0, 100).map((m) => [
      m.id,
      siteId,
      m.timestamp,
      m.contentTypeId,
      String(m.fromVersion),
      String(m.toVersion),
      escapeSheetFormulaCell(m.summary),
    ]),
  });

  // 8. Per-Content-Type Record Tables keyed strictly by unique field.key (never duplicate system columns like 'title' or 'slug')
  cms.contentTypes.forEach((ct) => {
    const seenKeys = new Set<string>(CMS_REC_SYSTEM_COL_SET);
    const customFields = ct.fields.filter((f) => {
      if (seenKeys.has(f.key)) return false;
      seenKeys.add(f.key);
      return true;
    });
    const customFieldKeys = customFields.map((f) => f.key);

    const headers = [...CMS_REC_SYSTEM_COLUMNS, ...customFieldKeys];

    const typeRecords = cms.records.filter((r) => r.contentTypeId === ct.id);
    const rows = typeRecords.map((rec) => {
      const refSummary = Object.entries(rec.richContentRefs || {})
        .map(([fk, docId]) => `${fk}:${cms.richDocs[docId]?.driveFileId || docId}`)
        .join(';');

      const canonicalTitle =
        rec.title ||
        String(rec.fields?.[ct.titleFieldKey] ?? rec.fields?.title ?? '');

      const baseCols = [
        rec.recordId,
        siteId,
        ownerAccountId,
        rec.status,
        rec.slug,
        escapeSheetFormulaCell(canonicalTitle),
        rec.createdAt,
        rec.updatedAt,
        rec.publishedAt || '',
        rec.trashedAt || '',
        '',
        String(rec.revision),
        String(rec.schemaVersion),
        String(rec.sortOrder),
        refSummary,
      ];

      const fieldCols = customFields.map((f) => {
        if (f.type === 'rich_text') {
          const raw = String(rec.fields[f.key] ?? '').replace(/<[^>]+>/g, ' ').trim();
          return escapeSheetFormulaCell(raw.slice(0, 240));
        }
        if (f.type === 'relation') {
          return (rec.relationIdsByField[f.key] || []).join(',');
        }
        const rawVal = rec.fields[f.key];
        if (rawVal === undefined || rawVal === null) return '';
        if (Array.isArray(rawVal) || typeof rawVal === 'object') {
          return escapeSheetFormulaCell(JSON.stringify(rawVal));
        }
        return escapeSheetFormulaCell(String(rawVal));
      });

      return [...baseCols, ...fieldCols];
    });

    tables.push({
      title: ct.sheetTableId || `CMS_REC_${ct.id.toUpperCase()}`,
      headers,
      rows,
    });
  });

  return tables;
}

export async function syncCmsToGoogleWorkspace(params: {
  accessToken: string;
  cms: CmsDocument;
  driveFolderId?: string;
  spreadsheetId?: string;
  siteId?: string;
  ownerAccountId?: string;
}): Promise<{
  cms: CmsDocument;
  driveFolderId: string;
  tabsSynced: string[];
}> {
  return enqueueCmsWrite(async () => {
    const { accessToken, cms, spreadsheetId, siteId, ownerAccountId } = params;
    const rootFolderId = await ensurePortfolioDriveFolder(accessToken, params.driveFolderId);
    const cmsFolderId = await ensureSubfolder(
      accessToken,
      rootFolderId,
      'CMS',
      cms.storageHealth.cmsFolderDriveId
    );
    const richFolderId = await ensureSubfolder(
      accessToken,
      cmsFolderId,
      'RichContent',
      cms.storageHealth.richContentFolderDriveId
    );

    // 1. Persist RichContent JSON docs in Drive (/CMS/RichContent)
    const nextRichDocs: Record<string, CmsRichContentDoc> = { ...(cms.richDocs || {}) };
    for (const [docId, doc] of Object.entries(nextRichDocs)) {
      const fileName = `${docId}.json`;
      const existingFileId =
        doc.driveFileId || (await findDriveFileByName(accessToken, richFolderId, fileName));
      const savedId = await upsertDriveJsonFile(accessToken, {
        fileId: existingFileId,
        folderId: richFolderId,
        name: fileName,
        payload: doc,
      });
      nextRichDocs[docId] = { ...doc, driveFileId: savedId };
    }

    // 2. Persist canonical CMS Manifest in Drive (/CMS/cms-manifest.json)
    const existingManifestId =
      cms.storageHealth.manifestDriveFileId ||
      (await findDriveFileByName(accessToken, cmsFolderId, CMS_MANIFEST_FILENAME));

    const manifestPayload = {
      schemaVersion: cms.schemaVersion,
      cmsRevision: cms.revision,
      siteId: siteId || '',
      updatedAt: new Date().toISOString(),
      contentTypes: cms.contentTypes,
      taxonomies: cms.taxonomies,
      terms: cms.terms,
      relationships: cms.relationships,
      settings: cms.settings,
      migrationLog: cms.migrationLog,
      richDocsIndex: Object.values(nextRichDocs).map((d) => ({
        docId: d.docId,
        recordId: d.recordId,
        fieldKey: d.fieldKey,
        driveFileId: d.driveFileId,
      })),
    };

    const manifestFileId = await upsertDriveJsonFile(accessToken, {
      fileId: existingManifestId,
      folderId: cmsFolderId,
      name: CMS_MANIFEST_FILENAME,
      payload: manifestPayload,
    });

    // 3. Batch-ensure & safely write structured tables BEFORE clearing any trailing rows
    const tabsSynced: string[] = [];
    if (spreadsheetId) {
      const tables = buildCmsSheetTables(
        { ...cms, richDocs: nextRichDocs },
        { siteId, ownerAccountId }
      );
      const metaRes = await wsFetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}?fields=sheets.properties.title`,
        accessToken
      );
      const meta = (await metaRes.json()) as {
        sheets?: { properties?: { title?: string } }[];
      };
      const existingTitles = new Set(
        (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[]
      );

      const addRequests = tables
        .filter((t) => !existingTitles.has(t.title))
        .map((t) => ({
          addSheet: { properties: { title: t.title, gridProperties: { frozenRowCount: 1 } } },
        }));

      if (addRequests.length > 0) {
        await wsFetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}:batchUpdate`,
          accessToken,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requests: addRequests }),
          }
        );
      }

      // Write updated headers + rows first so transient errors never wipe existing spreadsheet data
      await wsFetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            valueInputOption: 'RAW',
            data: tables.map((t) => ({
              range: `'${t.title.replace(/'/g, "''")}'!A1`,
              values: [t.headers, ...t.rows],
            })),
          }),
        }
      );

      // Clear only trailing stale rows below the newly written table bounds
      const trailingRanges = tables.map(
        (t) => `'${t.title.replace(/'/g, "''")}'!A${t.rows.length + 2}:ZZ`
      );
      if (trailingRanges.length > 0) {
        await wsFetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            spreadsheetId
          )}/values:batchClear`,
          accessToken,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ranges: trailingRanges }),
          }
        ).catch(() => undefined);
      }

      tables.forEach((t) => tabsSynced.push(t.title));
    }

    const nowIso = new Date().toISOString();
    const updatedCms: CmsDocument = {
      ...cms,
      richDocs: nextRichDocs,
      storageHealth: {
        cmsFolderDriveId: cmsFolderId,
        richContentFolderDriveId: richFolderId,
        manifestDriveFileId: manifestFileId,
        lastCmsSyncAt: nowIso,
        lastCmsPullAt: cms.storageHealth.lastCmsPullAt,
        syncStatus: 'synced',
        lastError: null,
        syncedTabNames: tabsSynced,
      },
      operationalLogs: [
        {
          id: `oplog_${Date.now().toString(36)}`,
          timestamp: nowIso,
          level: 'info' as const,
          action: 'workspace_cms_sync',
          detail: `Synced CMS manifest to Drive and ${tabsSynced.length} table(s) to Google Sheets.`,
        },
        ...(cms.operationalLogs || []),
      ].slice(0, 60),
    };

    return {
      cms: updatedCms,
      driveFolderId: rootFolderId,
      tabsSynced,
    };
  });
}

export async function pullCmsFromGoogleWorkspace(params: {
  accessToken: string;
  currentCms: CmsDocument;
  driveFolderId?: string;
  spreadsheetId?: string;
}): Promise<{
  found: boolean;
  cms: CmsDocument;
  recordsRead: number;
}> {
  const { accessToken, currentCms, spreadsheetId } = params;
  const rootFolderId = await ensurePortfolioDriveFolder(accessToken, params.driveFolderId);
  const cmsFolderId = await ensureSubfolder(
    accessToken,
    rootFolderId,
    'CMS',
    currentCms.storageHealth.cmsFolderDriveId
  );

  const manifestFileId =
    currentCms.storageHealth.manifestDriveFileId ||
    (await findDriveFileByName(accessToken, cmsFolderId, CMS_MANIFEST_FILENAME));

  if (!manifestFileId) {
    return { found: false, cms: currentCms, recordsRead: 0 };
  }

  const manifest = await readDriveJsonFile<{
    schemaVersion?: number;
    cmsRevision?: number;
    contentTypes?: CmsDocument['contentTypes'];
    taxonomies?: CmsDocument['taxonomies'];
    terms?: CmsDocument['terms'];
    relationships?: CmsDocument['relationships'];
    settings?: CmsDocument['settings'];
    migrationLog?: CmsDocument['migrationLog'];
    richDocsIndex?: { docId: string; driveFileId?: string }[];
  }>(accessToken, manifestFileId);

  const nextContentTypes = manifest.contentTypes || currentCms.contentTypes;
  const nextRichDocs: Record<string, CmsRichContentDoc> = { ...(currentCms.richDocs || {}) };

  if (manifest.richDocsIndex) {
    for (const entry of manifest.richDocsIndex) {
      if (entry.driveFileId) {
        try {
          const doc = await readDriveJsonFile<CmsRichContentDoc>(accessToken, entry.driveFileId);
          nextRichDocs[doc.docId] = { ...doc, driveFileId: entry.driveFileId };
        } catch {
          // Keep existing local rich doc if single Drive read fails
        }
      }
    }
  }

  let pulledRecords: CmsContentRecord[] = currentCms.records;
  if (spreadsheetId && nextContentTypes.length > 0) {
    const ranges = [
      `'CMS_RECORD_TERMS'!A:Z`,
      `'CMS_RECORD_RELATIONS'!A:Z`,
      ...nextContentTypes.map((ct) => `'${ct.sheetTableId}'!A:ZZ`),
    ];
    const queryStr = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');

    try {
      const batchRes = await wsFetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values:batchGet?${queryStr}`,
        accessToken
      );
      const batchData = (await batchRes.json()) as {
        valueRanges?: { range?: string; values?: string[][] }[];
      };

      const valueRanges = batchData.valueRanges || [];
      const termsByRecord: Record<string, Record<string, string[]>> = {};
      const relsByRecord: Record<string, Record<string, string[]>> = {};

      const termSheetRows = valueRanges[0]?.values || [];
      termSheetRows.slice(1).forEach(([recId, _ctId, taxId, termId]) => {
        if (!recId || !taxId || !termId) return;
        if (!termsByRecord[recId]) termsByRecord[recId] = {};
        if (!termsByRecord[recId][taxId]) termsByRecord[recId][taxId] = [];
        if (!termsByRecord[recId][taxId].includes(termId)) {
          termsByRecord[recId][taxId].push(termId);
        }
      });

      const relSheetRows = valueRanges[1]?.values || [];
      relSheetRows.slice(1).forEach(([srcRecId, _ctId, fieldKey, targetId]) => {
        if (!srcRecId || !fieldKey || !targetId) return;
        if (!relsByRecord[srcRecId]) relsByRecord[srcRecId] = {};
        if (!relsByRecord[srcRecId][fieldKey]) relsByRecord[srcRecId][fieldKey] = [];
        if (!relsByRecord[srcRecId][fieldKey].includes(targetId)) {
          relsByRecord[srcRecId][fieldKey].push(targetId);
        }
      });

      const systemSet = new Set([
        'record_id',
        'status',
        'slug',
        'title',
        'created_at',
        'updated_at',
        'published_at',
        'trashed_at',
        'revision',
        'schema_version',
        'sort_order',
        'rich_content_ref',
      ]);
      const reconstructed: CmsContentRecord[] = [];
      nextContentTypes.forEach((ct, idx) => {
        const sheetRows = valueRanges[2 + idx]?.values || [];
        if (sheetRows.length < 2) return;
        const headers = sheetRows[0].map((h) => String(h).trim());
        const fieldDefByKey = new Map(ct.fields.map((f) => [f.key, f]));

        sheetRows.slice(1).forEach((row) => {
          const rowMap: Record<string, string> = {};
          headers.forEach((h, colIdx) => {
            const cellVal = unescapeSheetFormulaCell(row[colIdx] ?? '');
            // Preserve first non-empty value if legacy sheet had duplicate header columns (e.g. 'title')
            if (rowMap[h] === undefined || (rowMap[h] === '' && cellVal !== '')) {
              rowMap[h] = cellVal;
            }
          });
          const recordId = rowMap.record_id;
          if (!recordId) return;

          const fields: Record<string, unknown> = {};
          const richContentRefs: Record<string, string> = {};

          if (rowMap.rich_content_ref) {
            rowMap.rich_content_ref.split(';').forEach((pair) => {
              const [fk, idOrRef] = pair.split(':');
              if (fk && idOrRef) {
                const matchedDoc = Object.values(nextRichDocs).find(
                  (d) => d.docId === idOrRef || d.driveFileId === idOrRef
                );
                if (matchedDoc) {
                  richContentRefs[fk] = matchedDoc.docId;
                  fields[fk] = matchedDoc.content;
                }
              }
            });
          }

          headers.forEach((colKey) => {
            if (systemSet.has(colKey)) return;
            const rawVal = rowMap[colKey];
            const fDef = fieldDefByKey.get(colKey);
            if (fDef?.type === 'rich_text' && fields[colKey]) return;
            if (fDef?.type === 'boolean') {
              fields[colKey] = rawVal === 'true';
            } else if (fDef?.type === 'number' || fDef?.type === 'currency') {
              fields[colKey] = rawVal === '' ? '' : Number(rawVal);
            } else if (
              (fDef?.type === 'multi_select' ||
                fDef?.type === 'gallery' ||
                fDef?.type === 'repeater_group' ||
                fDef?.type === 'json') &&
              rawVal
            ) {
              try {
                fields[colKey] = JSON.parse(rawVal);
              } catch {
                fields[colKey] = rawVal;
              }
            } else {
              fields[colKey] = rawVal;
            }
          });

          const canonicalTitle =
            rowMap.title || String(fields[ct.titleFieldKey] || fields.title || 'Untitled');
          if (ct.titleFieldKey && !fields[ct.titleFieldKey]) {
            fields[ct.titleFieldKey] = canonicalTitle;
          }
          if (ct.fields.some((f) => f.key === 'title') && !fields.title) {
            fields.title = canonicalTitle;
          }

          const rawStatus = rowMap.status;
          const status =
            rawStatus === 'published' ||
            rawStatus === 'draft' ||
            rawStatus === 'archived' ||
            rawStatus === 'trash'
              ? rawStatus
              : 'draft';

          reconstructed.push({
            recordId,
            contentTypeId: ct.id,
            status,
            slug: rowMap.slug || recordId,
            title: canonicalTitle,
            fields,
            richContentRefs,
            termIdsByTaxonomy: termsByRecord[recordId] || {},
            relationIdsByField: relsByRecord[recordId] || {},
            revision: parseInt(rowMap.revision || '1', 10) || 1,
            schemaVersion: parseInt(rowMap.schema_version || String(ct.schemaVersion), 10) || 1,
            sortOrder: parseInt(rowMap.sort_order || '0', 10) || 0,
            createdAt: rowMap.created_at || new Date().toISOString(),
            updatedAt: rowMap.updated_at || new Date().toISOString(),
            publishedAt: rowMap.published_at || undefined,
            trashedAt: rowMap.trashed_at || undefined,
          });
        });
      });

      if (reconstructed.length > 0) {
        pulledRecords = reconstructed;
      }
    } catch (err) {
      if (
        err instanceof GoogleWorkspaceApiError &&
        (err.code === 'REAUTH_REQUIRED' ||
          err.code === 'PERMISSION_DENIED' ||
          err.code === 'NOT_FOUND' ||
          err.code === 'RATE_LIMITED')
      ) {
        throw err;
      }
      // Keep current records only when Sheets CMS tabs have not been initialized yet (400 range missing)
      if (err instanceof GoogleWorkspaceApiError && err.status && err.status >= 500) {
        throw err;
      }
    }
  }

  invalidateCmsQueryCache();
  const nowIso = new Date().toISOString();
  const nextCms: CmsDocument = {
    ...currentCms,
    schemaVersion: manifest.schemaVersion ?? currentCms.schemaVersion,
    revision: Math.max(currentCms.revision + 1, manifest.cmsRevision ?? 1),
    contentTypes: nextContentTypes,
    taxonomies: manifest.taxonomies || currentCms.taxonomies,
    terms: manifest.terms || currentCms.terms,
    relationships: manifest.relationships || currentCms.relationships,
    settings: manifest.settings || currentCms.settings,
    migrationLog: manifest.migrationLog || currentCms.migrationLog,
    richDocs: nextRichDocs,
    records: pulledRecords,
    storageHealth: {
      ...currentCms.storageHealth,
      cmsFolderDriveId: cmsFolderId,
      manifestDriveFileId: manifestFileId,
      lastCmsPullAt: nowIso,
      syncStatus: 'synced',
      lastError: null,
    },
    operationalLogs: [
      {
        id: `oplog_${Date.now().toString(36)}`,
        timestamp: nowIso,
        level: 'info' as const,
        action: 'workspace_cms_pull',
        detail: `Pulled CMS manifest and ${pulledRecords.length} record(s) from Google Workspace.`,
      },
      ...(currentCms.operationalLogs || []),
    ].slice(0, 60),
  };

  return {
    found: true,
    cms: nextCms,
    recordsRead: pulledRecords.length,
  };
}

export interface SheetMigrationDiagnostic {
  tabName: string;
  existsInSheet: boolean;
  currentHeaders: string[];
  targetHeaders: string[];
  duplicateHeaders: string[];
  missingColumns: string[];
  existingRowCount: number;
  needsMigration: boolean;
}

export async function inspectCmsSheetMigration(params: {
  accessToken: string;
  spreadsheetId: string;
  cms: CmsDocument;
  siteId?: string;
  ownerAccountId?: string;
}): Promise<{
  diagnostics: SheetMigrationDiagnostic[];
  needsAnyMigration: boolean;
}> {
  const { accessToken, spreadsheetId, cms, siteId, ownerAccountId } = params;
  const targetTables = buildCmsSheetTables(cms, { siteId, ownerAccountId });

  const metaRes = await wsFetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=sheets.properties.title`,
    accessToken
  );
  const meta = (await metaRes.json()) as {
    sheets?: { properties?: { title?: string } }[];
  };
  const existingTitleSet = new Set(
    (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[]
  );

  const presentTabs = targetTables.filter((t) => existingTitleSet.has(t.title));
  const rowValuesByTab = new Map<string, string[][]>();

  if (presentTabs.length > 0) {
    const queryStr = presentTabs
      .map((t) => `ranges=${encodeURIComponent(`'${t.title.replace(/'/g, "''")}'!A:ZZ`)}`)
      .join('&');
    const batchRes = await wsFetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchGet?${queryStr}`,
      accessToken
    );
    const batchData = (await batchRes.json()) as {
      valueRanges?: { values?: string[][] }[];
    };
    presentTabs.forEach((tab, idx) => {
      rowValuesByTab.set(tab.title, batchData.valueRanges?.[idx]?.values || []);
    });
  }

  const diagnostics: SheetMigrationDiagnostic[] = targetTables.map((target) => {
    const existsInSheet = existingTitleSet.has(target.title);
    const values = rowValuesByTab.get(target.title) || [];
    const currentHeaders = (values[0] || []).map((c) => String(c).trim());
    const seen = new Set<string>();
    const duplicates: string[] = [];
    currentHeaders.forEach((h) => {
      if (!h) return;
      if (seen.has(h)) duplicates.push(h);
      seen.add(h);
    });
    const missingColumns = target.headers.filter((h) => !seen.has(h));
    const existingRowCount = Math.max(0, values.length - 1);

    return {
      tabName: target.title,
      existsInSheet,
      currentHeaders,
      targetHeaders: target.headers,
      duplicateHeaders: duplicates,
      missingColumns,
      existingRowCount,
      needsMigration: !existsInSheet || duplicates.length > 0 || missingColumns.length > 0,
    };
  });

  return {
    diagnostics,
    needsAnyMigration: diagnostics.some((d) => d.needsMigration),
  };
}
