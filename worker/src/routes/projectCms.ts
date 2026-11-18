import {
  driveJson,
  ensureFolderSegment,
  ensureProjectDriveTree,
  listFilesInFolder,
  readJsonFileById,
  upsertWorkspaceResource,
  writeJsonFileInFolder,
} from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import {
  HierarchyServiceError,
  requireProjectAccess,
} from '../services/workspaceHierarchyService';
import { VerifiedSession, WorkerEnv } from '../types';

const CMS_MANIFEST_FILENAME = 'cms-manifest.json';

interface CmsSheetTableInput {
  title: string;
  headers: string[];
  rows: string[][];
}

interface CmsManifestPayload {
  schemaVersion?: number;
  cmsRevision?: number;
  projectId?: string;
  updatedAt?: string;
  contentTypes?: unknown[];
  taxonomies?: unknown[];
  terms?: unknown[];
  relationships?: unknown[];
  records?: unknown[];
  forms?: unknown[];
  inboxCategories?: unknown[];
  settings?: Record<string, unknown>;
  migrationLog?: unknown[];
  richDocsIndex?: Array<{
    docId: string;
    recordId?: string;
    fieldKey?: string;
    driveFileId?: string;
  }>;
  richDocs?: Record<string, Record<string, unknown>>;
}

function mapCmsError(err: unknown): Response {
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'PROJECT_CMS_ERROR';
  const status = code === 'WORKSPACE_REAUTH_REQUIRED' ? 401 : 500;
  return Response.json(
    {
      error:
        code === 'WORKSPACE_REAUTH_REQUIRED'
          ? 'Google Workspace connection or reauthorization is required.'
          : err instanceof Error
          ? err.message
          : 'Project CMS operation failed.',
      code,
    },
    { status }
  );
}

async function ensureAndSyncCmsSpreadsheet(params: {
  db: D1Database;
  accessToken: string;
  ownerId: string;
  orgId: string;
  projectId: string;
  dataCmsFolderId: string;
  title: string;
  tables: CmsSheetTableInput[];
}): Promise<{ spreadsheetId: string; tabsSynced: string[] }> {
  const { db, accessToken, ownerId, orgId, projectId, dataCmsFolderId, title, tables } = params;

  const existing = await db
    .prepare(
      `SELECT spreadsheet_id FROM workspace_resources
       WHERE project_id = ? AND resource_kind = 'cms_spreadsheet' AND status = 'active'
       ORDER BY created_at ASC LIMIT 1`
    )
    .bind(projectId)
    .first<{ spreadsheet_id: string }>();

  let spreadsheetId = existing?.spreadsheet_id || '';
  let existingTabs = new Set<string>();

  if (spreadsheetId) {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}?fields=spreadsheetId,sheets(properties(title))`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        sheets?: Array<{ properties?: { title?: string } }>;
      };
      existingTabs = new Set(
        (meta.sheets || []).map((s) => s.properties?.title || '').filter(Boolean)
      );
    } else {
      spreadsheetId = '';
    }
  }

  const desiredTitles = tables.map((t) => t.title).filter(Boolean);
  if (!spreadsheetId) {
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
        sheets: (desiredTitles.length > 0 ? desiredTitles : ['CMS_CONTENT_TYPES']).map((t) => ({
          properties: { title: t, gridProperties: { frozenRowCount: 1 } },
        })),
      }),
    });
    if (!createRes.ok) {
      const txt = await createRes.text().catch(() => '');
      throw new HierarchyServiceError(
        `Could not create project CMS spreadsheet (${createRes.status}): ${txt.slice(0, 160)}`,
        502,
        'SHEETS_CREATE_FAILED'
      );
    }
    const created = (await createRes.json()) as { spreadsheetId: string };
    spreadsheetId = created.spreadsheetId;

    if (dataCmsFolderId && spreadsheetId) {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          spreadsheetId
        )}?addParents=${encodeURIComponent(dataCmsFolderId)}&fields=id`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    }

    await upsertWorkspaceResource(db, {
      ownerId,
      orgId,
      projectId,
      resourceKind: 'cms_spreadsheet',
      resourceKey: 'default',
      driveFileId: spreadsheetId,
      spreadsheetId,
      parentFolderId: dataCmsFolderId,
      title,
    });
  } else {
    const missingTabs = desiredTitles.filter((t) => !existingTabs.has(t));
    if (missingTabs.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: missingTabs.map((t) => ({
              addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } },
            })),
          }),
        }
      );
    }
  }

  const tabsSynced: string[] = [];
  if (tables.length > 0 && spreadsheetId) {
    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: tables.map((table) => ({
            range: `'${table.title.replace(/'/g, "''")}'!A1`,
            values: [table.headers, ...table.rows],
          })),
        }),
      }
    );
    if (!writeRes.ok) {
      const txt = await writeRes.text().catch(() => '');
      throw new HierarchyServiceError(
        `Failed to update CMS Sheets values (${writeRes.status}): ${txt.slice(0, 160)}`,
        502,
        'SHEETS_WRITE_FAILED'
      );
    }

    const trailingRanges = tables.map(
      (table) => `'${table.title.replace(/'/g, "''")}'!A${table.rows.length + 2}:ZZ`
    );
    if (trailingRanges.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values:batchClear`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ranges: trailingRanges }),
        }
      ).catch(() => undefined);
    }

    tables.forEach((t) => tabsSynced.push(t.title));
  }

  return { spreadsheetId, tabsSynced };
}

export async function handleGetProjectCms(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string
): Promise<Response> {
  try {
    await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
      'viewer',
    ]);

    const resourceRows = await env.DB.prepare(
      `SELECT resource_kind, resource_key, drive_file_id, spreadsheet_id, parent_folder_id, title
       FROM workspace_resources
       WHERE project_id = ? AND status = 'active'
         AND resource_kind IN ('data_cms', 'cms_manifest', 'cms_spreadsheet')`
    )
      .bind(projectId)
      .all<{
        resource_kind: string;
        resource_key: string;
        drive_file_id: string;
        spreadsheet_id: string;
        parent_folder_id: string;
        title: string;
      }>();

    const resources = resourceRows.results || [];
    const dataCmsFolderId =
      resources.find((r) => r.resource_kind === 'data_cms')?.drive_file_id || '';
    const manifestRow = resources.find((r) => r.resource_kind === 'cms_manifest');
    const spreadsheetRow = resources.find((r) => r.resource_kind === 'cms_spreadsheet');

    let accessToken: string;
    try {
      const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
      accessToken = minted.accessToken;
    } catch {
      return Response.json({
        ok: true,
        projectId,
        workspaceConnected: false,
        found: false,
        folderId: dataCmsFolderId,
        manifestFileId: manifestRow?.drive_file_id || '',
        spreadsheetId: spreadsheetRow?.spreadsheet_id || '',
        document: null,
      });
    }

    const url = new URL(request.url);
    const includeDocument = url.searchParams.get('includeDocument') !== '0';

    let manifestFileId = manifestRow?.drive_file_id || '';
    if (!manifestFileId && dataCmsFolderId) {
      const files = await listFilesInFolder(accessToken, dataCmsFolderId);
      const foundFile = files.find((f) => f.name === CMS_MANIFEST_FILENAME);
      if (foundFile?.id) {
        manifestFileId = foundFile.id;
      }
    }

    if (!manifestFileId) {
      return Response.json({
        ok: true,
        projectId,
        workspaceConnected: true,
        found: false,
        folderId: dataCmsFolderId,
        manifestFileId: '',
        spreadsheetId: spreadsheetRow?.spreadsheet_id || '',
        document: null,
      });
    }

    if (!includeDocument) {
      return Response.json({
        ok: true,
        projectId,
        workspaceConnected: true,
        found: true,
        folderId: dataCmsFolderId,
        manifestFileId,
        spreadsheetId: spreadsheetRow?.spreadsheet_id || '',
        document: null,
      });
    }

    const manifest = (await readJsonFileById(accessToken, manifestFileId)) as CmsManifestPayload;
    const richDocs: Record<string, Record<string, unknown>> = {
      ...(manifest.richDocs || {}),
    };

    if (Array.isArray(manifest.richDocsIndex)) {
      for (const entry of manifest.richDocsIndex) {
        if (entry?.driveFileId && !richDocs[entry.docId]) {
          try {
            const doc = (await readJsonFileById(
              accessToken,
              entry.driveFileId
            )) as Record<string, unknown>;
            richDocs[entry.docId] = { ...doc, driveFileId: entry.driveFileId };
          } catch {
            // Preserve manifest entry cleanly if single rich-doc file is missing
          }
        }
      }
    }

    return Response.json({
      ok: true,
      projectId,
      workspaceConnected: true,
      found: true,
      folderId: dataCmsFolderId,
      manifestFileId,
      spreadsheetId: spreadsheetRow?.spreadsheet_id || '',
      document: {
        ...manifest,
        richDocs,
      },
    });
  } catch (err) {
    return mapCmsError(err);
  }
}

export async function handleSaveProjectCms(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    document?: {
      schemaVersion?: number;
      revision?: number;
      contentTypes?: unknown[];
      taxonomies?: unknown[];
      terms?: unknown[];
      relationships?: unknown[];
      records?: unknown[];
      forms?: unknown[];
      inboxCategories?: unknown[];
      settings?: Record<string, unknown>;
      migrationLog?: unknown[];
      richDocs?: Record<string, Record<string, unknown>>;
    };
    syncSheets?: boolean;
    title?: string;
    tables?: CmsSheetTableInput[];
  };

  if (
    !body.document ||
    typeof body.document !== 'object' ||
    !Array.isArray(body.document.contentTypes) ||
    !Array.isArray(body.document.records)
  ) {
    return Response.json(
      { error: 'Valid CMS document payload is required.', code: 'INVALID_CMS_DOCUMENT' },
      { status: 400 }
    );
  }

  try {
    const access = await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
    ]);
    const tree = await ensureProjectDriveTree(env, session, projectId);
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);

    const richFolder = await ensureFolderSegment(accessToken, tree.folders.data_cms, 'RichContent');
    const nextRichDocs: Record<string, Record<string, unknown>> = {
      ...(body.document.richDocs || {}),
    };

    for (const [docId, doc] of Object.entries(nextRichDocs)) {
      if (!doc || typeof doc !== 'object') continue;
      const savedDoc = await writeJsonFileInFolder(accessToken, richFolder.id, `${docId}.json`, doc);
      nextRichDocs[docId] = { ...doc, driveFileId: savedDoc.fileId };
    }

    const nowIso = new Date().toISOString();
    const manifestPayload: CmsManifestPayload = {
      schemaVersion: body.document.schemaVersion || 1,
      cmsRevision: body.document.revision || 1,
      projectId,
      updatedAt: nowIso,
      contentTypes: body.document.contentTypes,
      taxonomies: body.document.taxonomies || [],
      terms: body.document.terms || [],
      relationships: body.document.relationships || [],
      records: body.document.records,
      forms: body.document.forms || [],
      inboxCategories: body.document.inboxCategories || [],
      settings: body.document.settings || {},
      migrationLog: body.document.migrationLog || [],
      richDocsIndex: Object.entries(nextRichDocs).map(([docId, doc]) => ({
        docId,
        recordId: typeof doc.recordId === 'string' ? doc.recordId : undefined,
        fieldKey: typeof doc.fieldKey === 'string' ? doc.fieldKey : undefined,
        driveFileId: typeof doc.driveFileId === 'string' ? doc.driveFileId : undefined,
      })),
    };

    const savedManifest = await writeJsonFileInFolder(
      accessToken,
      tree.folders.data_cms,
      CMS_MANIFEST_FILENAME,
      manifestPayload
    );

    await upsertWorkspaceResource(env.DB, {
      ownerId: access.project.owner_id,
      orgId: access.project.org_id,
      projectId,
      resourceKind: 'cms_manifest',
      resourceKey: 'default',
      driveFileId: savedManifest.fileId,
      parentFolderId: tree.folders.data_cms,
      title: CMS_MANIFEST_FILENAME,
    });

    let spreadsheetId = '';
    let tabsSynced: string[] = [];
    if (body.syncSheets && Array.isArray(body.tables) && body.tables.length > 0) {
      const sheetRes = await ensureAndSyncCmsSpreadsheet({
        db: env.DB,
        accessToken,
        ownerId: access.project.owner_id,
        orgId: access.project.org_id,
        projectId,
        dataCmsFolderId: tree.folders.data_cms,
        title: (body.title || `Builly CMS — ${access.project.name}`).trim(),
        tables: body.tables,
      });
      spreadsheetId = sheetRes.spreadsheetId;
      tabsSynced = sheetRes.tabsSynced;
    }

    return Response.json({
      ok: true,
      projectId,
      folderId: tree.folders.data_cms,
      richContentFolderId: richFolder.id,
      manifestFileId: savedManifest.fileId,
      spreadsheetId,
      tabsSynced,
      syncedAt: nowIso,
      richDocs: nextRichDocs,
    });
  } catch (err) {
    return mapCmsError(err);
  }
}

export { driveJson };
