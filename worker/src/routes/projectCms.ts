import {
  driveFetchWithRetry,
  verifyDriveParent,
} from '../services/driveCanonicalClient';
import {
  bootstrapAccountDrive,
  upsertCanonicalResourceRegistryEntry,
} from '../services/driveManifestService';
import {
  driveJson,
  ensureFolderSegment,
  ensureProjectDriveTree,
  listFilesInFolder,
  readDriveJsonWithConcurrency,
  readJsonFileById,
  upsertWorkspaceResource,
  writeJsonFileInFolder,
} from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import { readManagementCache, writeManagementCache } from '../services/managementCacheService';
import { withMutationLock } from '../services/mutationLockService';
import { generateOperationId } from '../services/operationJournalService';
import { BuillyTransactionError } from '../services/transactionErrors';
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
  revision?: number;
  cmsRevision?: number;
  projectId?: string;
  lastOperationId?: string;
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
  if (err instanceof BuillyTransactionError) {
    return Response.json(err.toSafeJson(), { status: err.status });
  }
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'PROJECT_CMS_ERROR';
  const isOauthOutage = code === 'WORKSPACE_REAUTH_REQUIRED';
  return Response.json(
    {
      error: isOauthOutage
        ? 'Google Workspace connection is unavailable or expired.'
        : err instanceof Error
        ? err.message
        : 'Project CMS operation failed.',
      code: isOauthOutage ? 'WRITE_DISABLED_OAUTH_UNAVAILABLE' : code,
    },
    { status: isOauthOutage ? 503 : 500 }
  );
}

/**
 * Maintains ONE Google Spreadsheet per used/existing CMS dataset under Data/CMS/.
 * Never creates empty unused dataset spreadsheets unless already provisioned or populated.
 */
async function ensureAndSyncCmsDatasets(params: {
  env: WorkerEnv;
  accessToken: string;
  ownerId: string;
  orgId: string;
  projectId: string;
  projectName: string;
  dataCmsFolderId: string;
  titlePrefix: string;
  tables: CmsSheetTableInput[];
  operationId: string;
}): Promise<{
  spreadsheetId: string;
  datasetSpreadsheets: Record<string, string>;
  tabsSynced: string[];
}> {
  const {
    env,
    accessToken,
    ownerId,
    orgId,
    projectId,
    projectName,
    dataCmsFolderId,
    tables,
    operationId,
  } = params;

  const existingRows = await env.DB.prepare(
    `SELECT resource_key, spreadsheet_id, title FROM workspace_resources
     WHERE project_id = ? AND resource_kind IN ('cms_sheet', 'cms_spreadsheet') AND status = 'active'
     ORDER BY created_at ASC`
  )
    .bind(projectId)
    .all<{ resource_key: string; spreadsheet_id: string; title: string }>();

  const existingByKey = new Map<string, string>();
  for (const row of existingRows.results || []) {
    if (row.resource_key && row.spreadsheet_id) {
      existingByKey.set(row.resource_key, row.spreadsheet_id);
    }
  }

  const datasetSpreadsheets: Record<string, string> = {};
  const tabsSynced: string[] = [];
  let primarySpreadsheetId = '';

  let bootSystemFolderId = '';
  let bootRegistryFileId = '';
  try {
    const boot = await bootstrapAccountDrive(env, accessToken, ownerId, { operationId });
    bootSystemFolderId = boot.systemFolderId;
    bootRegistryFileId = boot.resourceRegistryFileId;
  } catch {
    // Non-fatal in minimal test mocks
  }

  for (const table of tables) {
    const datasetKey = (table.title || '').trim();
    if (!datasetKey) continue;

    // Create only enabled/used datasets (rows present OR already provisioned)
    let spreadsheetId = existingByKey.get(datasetKey) || '';
    if (!spreadsheetId && (!Array.isArray(table.rows) || table.rows.length === 0)) {
      continue;
    }

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
        const tabSet = new Set((meta.sheets || []).map((s) => s.properties?.title || ''));
        if (!tabSet.has(datasetKey)) {
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
                requests: [
                  { addSheet: { properties: { title: datasetKey, gridProperties: { frozenRowCount: 1 } } } },
                ],
              }),
            }
          );
        }
      } else {
        spreadsheetId = '';
      }
    }

    const ssTitle = `${projectName} — CMS ${datasetKey}`;
    if (!spreadsheetId) {
      const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { title: ssTitle },
          sheets: [{ properties: { title: datasetKey, gridProperties: { frozenRowCount: 1 } } }],
        }),
      });
      if (!createRes.ok) {
        const txt = await createRes.text().catch(() => '');
        throw new HierarchyServiceError(
          `Could not create project CMS dataset spreadsheet (${createRes.status}): ${txt.slice(0, 160)}`,
          502,
          'SHEETS_CREATE_FAILED'
        );
      }
      const created = (await createRes.json()) as { spreadsheetId: string };
      spreadsheetId = created.spreadsheetId;

      if (dataCmsFolderId && spreadsheetId) {
        await driveFetchWithRetry(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            spreadsheetId
          )}?addParents=${encodeURIComponent(dataCmsFolderId)}&fields=id,parents,appProperties`,
          accessToken,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:cms:${datasetKey}`,
                resource_type: 'cms_sheet',
                dataset_key: datasetKey,
                org_id: orgId,
                project_id: projectId,
                schema_version: '1',
              },
            }),
          },
          { operationId }
        );
        await verifyDriveParent(accessToken, spreadsheetId, dataCmsFolderId, operationId).catch(
          () => undefined
        );
      }

      await upsertWorkspaceResource(env.DB, {
        ownerId,
        orgId,
        projectId,
        resourceKind: 'cms_sheet',
        resourceKey: datasetKey,
        driveFileId: spreadsheetId,
        spreadsheetId,
        parentFolderId: dataCmsFolderId,
        title: ssTitle,
        lastOperationId: operationId,
      });

      if (bootSystemFolderId) {
        await upsertCanonicalResourceRegistryEntry(accessToken, {
          systemFolderId: bootSystemFolderId,
          registryFileId: bootRegistryFileId || undefined,
          ownerAccountId: ownerId,
          operationId,
          entry: {
            resource_id: `wres_${projectId}_cms_${datasetKey}`,
            owner_type: 'project',
            owner_id: ownerId,
            org_id: orgId,
            project_id: projectId,
            site_id: null,
            resource_type: 'cms_sheet',
            resource_key: datasetKey,
            drive_file_id: spreadsheetId,
            spreadsheet_id: spreadsheetId,
            parent_folder_id: dataCmsFolderId,
            title: ssTitle,
            mime_type: 'application/vnd.google-apps.spreadsheet',
            schema_version: 1,
            status: 'active',
          },
        }).catch(() => undefined);
      }
    }

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
          data: [
            {
              range: `'${datasetKey.replace(/'/g, "''")}'!A1`,
              values: [table.headers, ...table.rows],
            },
          ],
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
        body: JSON.stringify({
          ranges: [`'${datasetKey.replace(/'/g, "''")}'!A${table.rows.length + 2}:ZZ`],
        }),
      }
    ).catch(() => undefined);

    if (!primarySpreadsheetId) primarySpreadsheetId = spreadsheetId;
    datasetSpreadsheets[datasetKey] = spreadsheetId;
    tabsSynced.push(datasetKey);
  }

  return { spreadsheetId: primarySpreadsheetId, datasetSpreadsheets, tabsSynced };
}

export async function handleGetProjectCms(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string
): Promise<Response> {
  try {
    const access = await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
      'viewer',
    ]);
    const ownerAccountId = access.project.owner_id || session.ownerId;

    const resourceRows = await env.DB.prepare(
      `SELECT resource_kind, resource_key, drive_file_id, spreadsheet_id, parent_folder_id, title
       FROM workspace_resources
       WHERE project_id = ? AND status = 'active'
         AND resource_kind IN ('data_cms', 'cms_manifest', 'cms_sheet', 'cms_spreadsheet')`
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
    const sheetRows = resources.filter(
      (r) => r.resource_kind === 'cms_sheet' || r.resource_kind === 'cms_spreadsheet'
    );
    const datasetSpreadsheets: Record<string, string> = {};
    for (const sr of sheetRows) {
      if (sr.resource_key && sr.spreadsheet_id) {
        datasetSpreadsheets[sr.resource_key] = sr.spreadsheet_id;
      }
    }
    const primarySpreadsheetId = sheetRows[0]?.spreadsheet_id || '';

    let accessToken: string;
    try {
      const minted = await mintOwnerGoogleAccessToken(env, ownerAccountId);
      accessToken = minted.accessToken;
    } catch {
      const cached = await readManagementCache<{
        manifestFileId?: string;
        spreadsheetId?: string;
        datasetSpreadsheets?: Record<string, string>;
        document?: CmsManifestPayload;
      }>(env.DB, {
        ownerId: ownerAccountId,
        resourceType: 'cms_manifest',
        resourceId: projectId,
      });

      if (cached) {
        return Response.json({
          ok: true,
          projectId,
          workspaceConnected: false,
          readOnly: true,
          stale: true,
          lastSyncedAt: cached.lastSyncedAt,
          found: Boolean(cached.payload.document),
          folderId: dataCmsFolderId,
          manifestFileId: cached.payload.manifestFileId || manifestRow?.drive_file_id || '',
          spreadsheetId: cached.payload.spreadsheetId || primarySpreadsheetId,
          datasetSpreadsheets: cached.payload.datasetSpreadsheets || datasetSpreadsheets,
          document: cached.payload.document || null,
        });
      }

      return Response.json(
        {
          ok: false,
          projectId,
          workspaceConnected: false,
          readOnly: true,
          unavailable: true,
          error: 'Google Workspace connection is unavailable and no cached CMS snapshot exists.',
          code: 'WRITE_DISABLED_OAUTH_UNAVAILABLE',
        },
        { status: 503 }
      );
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
        readOnly: false,
        stale: false,
        found: false,
        folderId: dataCmsFolderId,
        manifestFileId: '',
        spreadsheetId: primarySpreadsheetId,
        datasetSpreadsheets,
        document: null,
      });
    }

    if (!includeDocument) {
      return Response.json({
        ok: true,
        projectId,
        workspaceConnected: true,
        readOnly: false,
        stale: false,
        found: true,
        folderId: dataCmsFolderId,
        manifestFileId,
        spreadsheetId: primarySpreadsheetId,
        datasetSpreadsheets,
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

    const fullDoc = { ...manifest, richDocs };
    const cachedSync = await writeManagementCache(env.DB, {
      ownerId: ownerAccountId,
      resourceType: 'cms_manifest',
      resourceId: projectId,
      canonicalRevision: Number(manifest.revision ?? manifest.cmsRevision ?? 1),
      payload: {
        manifestFileId,
        spreadsheetId: primarySpreadsheetId,
        datasetSpreadsheets,
        document: fullDoc,
      },
      ttlSeconds: 3600,
    }).catch(() => null);

    return Response.json({
      ok: true,
      projectId,
      workspaceConnected: true,
      readOnly: false,
      stale: false,
      lastSyncedAt: cachedSync?.lastSyncedAt || new Date().toISOString(),
      found: true,
      folderId: dataCmsFolderId,
      manifestFileId,
      spreadsheetId: primarySpreadsheetId,
      datasetSpreadsheets,
      document: fullDoc,
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
    operationId?: string;
    expectedRevision?: number;
    expectedEtag?: string;
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

  const operationId =
    body.operationId?.trim() ||
    request.headers.get('Idempotency-Key')?.trim() ||
    generateOperationId('op_cms');
  const expectedEtag = body.expectedEtag || request.headers.get('If-Match')?.trim() || undefined;

  try {
    const access = await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
    ]);
    const ownerAccountId = access.project.owner_id || session.ownerId;

    let accessToken: string;
    try {
      const minted = await mintOwnerGoogleAccessToken(env, ownerAccountId);
      accessToken = minted.accessToken;
    } catch {
      throw new BuillyTransactionError(
        'WRITE_DISABLED_OAUTH_UNAVAILABLE',
        'Google Workspace connection is unavailable. CMS saves are disabled in read-only mode.',
        { operationId, status: 503, retryable: false }
      );
    }

    return await withMutationLock(
      env,
      { scopeKey: `project:${projectId}`, operationId },
      async (lock) => {
        const tree = await ensureProjectDriveTree(env, session, projectId, {
          operationId,
          accessTokenOverride: accessToken,
        });

        let knownManifestId = '';
        let currentRevision: number | undefined;
        let currentEtag: string | undefined = expectedEtag;

        const manifestRow = await env.DB.prepare(
          `SELECT drive_file_id FROM workspace_resources
           WHERE project_id = ? AND resource_kind = 'cms_manifest' AND resource_key = 'default' AND status = 'active'
           LIMIT 1`
        )
          .bind(projectId)
          .first<{ drive_file_id: string }>();

        if (manifestRow?.drive_file_id) {
          knownManifestId = manifestRow.drive_file_id;
          try {
            const read = await readDriveJsonWithConcurrency<CmsManifestPayload>(
              accessToken,
              knownManifestId,
              operationId
            );
            currentRevision = Number(read.data?.revision ?? read.data?.cmsRevision ?? 0);
            currentEtag = currentEtag || read.meta.etag;
          } catch {
            // Fall through if deleted remotely
            knownManifestId = '';
          }
        }

        if (
          body.expectedRevision !== undefined &&
          currentRevision !== undefined &&
          currentRevision !== body.expectedRevision
        ) {
          throw new BuillyTransactionError(
            'REVISION_CONFLICT',
            `CMS manifest revision conflict: expected ${body.expectedRevision}, found ${currentRevision}.`,
            {
              operationId,
              details: {
                resourceId: `${projectId}:cms_manifest`,
                expectedRevision: body.expectedRevision,
                actualRevision: currentRevision,
              },
            }
          );
        }

        await lock.verify();

        const richFolder = await ensureFolderSegment(accessToken, tree.folders.data_cms, 'RichContent', {
          operationId,
          resourceId: `${projectId}:cms_rich_content`,
          resourceType: 'cms_rich_content_folder',
        });
        const nextRichDocs: Record<string, Record<string, unknown>> = {
          ...(body.document!.richDocs || {}),
        };

        for (const [docId, doc] of Object.entries(nextRichDocs)) {
          if (!doc || typeof doc !== 'object') continue;
          const savedDoc = await writeJsonFileInFolder(accessToken, richFolder.id, `${docId}.json`, doc, {
            operationId,
            resourceId: `${projectId}:cms_rich:${docId}`,
            resourceType: 'cms_rich_doc',
          });
          nextRichDocs[docId] = { ...doc, driveFileId: savedDoc.fileId };
        }

        const nowIso = new Date().toISOString();
        const nextRevision =
          currentRevision !== undefined
            ? currentRevision + 1
            : Number(body.document!.revision || 1);

        const manifestPayload: CmsManifestPayload = {
          schemaVersion: body.document!.schemaVersion || 1,
          revision: nextRevision,
          cmsRevision: nextRevision,
          projectId,
          lastOperationId: operationId,
          updatedAt: nowIso,
          contentTypes: body.document!.contentTypes,
          taxonomies: body.document!.taxonomies || [],
          terms: body.document!.terms || [],
          relationships: body.document!.relationships || [],
          records: body.document!.records,
          forms: body.document!.forms || [],
          inboxCategories: body.document!.inboxCategories || [],
          settings: body.document!.settings || {},
          migrationLog: body.document!.migrationLog || [],
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
          manifestPayload,
          {
            operationId,
            resourceId: `${projectId}:cms_manifest`,
            resourceType: 'cms_manifest',
            knownFileId: knownManifestId || undefined,
            expectedRevision: body.expectedRevision,
            expectedEtag: currentEtag,
          }
        );

        await upsertWorkspaceResource(env.DB, {
          ownerId: ownerAccountId,
          orgId: access.project.org_id,
          projectId,
          resourceKind: 'cms_manifest',
          resourceKey: 'default',
          driveFileId: savedManifest.fileId,
          parentFolderId: tree.folders.data_cms,
          title: CMS_MANIFEST_FILENAME,
          canonicalRevision: nextRevision,
          lastOperationId: operationId,
        });

        let spreadsheetId = '';
        let datasetSpreadsheets: Record<string, string> = {};
        let tabsSynced: string[] = [];
        if (body.syncSheets && Array.isArray(body.tables) && body.tables.length > 0) {
          const sheetRes = await ensureAndSyncCmsDatasets({
            env,
            accessToken,
            ownerId: ownerAccountId,
            orgId: access.project.org_id,
            projectId,
            projectName: access.project.name,
            dataCmsFolderId: tree.folders.data_cms,
            titlePrefix: (body.title || `Builly CMS — ${access.project.name}`).trim(),
            tables: body.tables,
            operationId,
          });
          spreadsheetId = sheetRes.spreadsheetId;
          datasetSpreadsheets = sheetRes.datasetSpreadsheets;
          tabsSynced = sheetRes.tabsSynced;
        }

        await writeManagementCache(env.DB, {
          ownerId: ownerAccountId,
          resourceType: 'cms_manifest',
          resourceId: projectId,
          canonicalRevision: nextRevision,
          payload: {
            manifestFileId: savedManifest.fileId,
            spreadsheetId,
            datasetSpreadsheets,
            document: { ...manifestPayload, richDocs: nextRichDocs },
          },
          ttlSeconds: 3600,
        }).catch(() => undefined);

        return Response.json({
          ok: true,
          operationId,
          revision: nextRevision,
          projectId,
          folderId: tree.folders.data_cms,
          richContentFolderId: richFolder.id,
          manifestFileId: savedManifest.fileId,
          spreadsheetId,
          datasetSpreadsheets,
          tabsSynced,
          syncedAt: nowIso,
          richDocs: nextRichDocs,
        });
      }
    );
  } catch (err) {
    return mapCmsError(err);
  }
}

export { driveJson };
