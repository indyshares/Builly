import {
  driveFetchWithRetry,
  verifyDriveParent,
} from '../services/driveCanonicalClient';
import {
  bootstrapAccountDrive,
  upsertCanonicalResourceRegistryEntry,
} from '../services/driveManifestService';
import {
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

const INBOX_STATE_FILENAME = 'inbox-state.json';

interface InboxSheetTableInput {
  title: string;
  headers: string[];
  rows: string[][];
}

interface RemoteSheetSubmission {
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
}

function mapInboxError(err: unknown): Response {
  if (err instanceof BuillyTransactionError) {
    return Response.json(err.toSafeJson(), { status: err.status });
  }
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'PROJECT_INBOX_ERROR';
  const isOauthOutage = code === 'WORKSPACE_REAUTH_REQUIRED';
  return Response.json(
    {
      error: isOauthOutage
        ? 'Google Workspace connection is unavailable or expired.'
        : err instanceof Error
        ? err.message
        : 'Project Inbox operation failed.',
      code: isOauthOutage ? 'WRITE_DISABLED_OAUTH_UNAVAILABLE' : code,
    },
    { status: isOauthOutage ? 503 : 500 }
  );
}

/**
 * Maintains ONE Google Spreadsheet per used/existing Inbox dataset under Data/Inbox/.
 * Never creates empty unused dataset spreadsheets unless already provisioned or populated.
 */
async function ensureAndSyncInboxDatasets(params: {
  env: WorkerEnv;
  accessToken: string;
  ownerId: string;
  orgId: string;
  projectId: string;
  projectName: string;
  dataInboxFolderId: string;
  tables: InboxSheetTableInput[];
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
    dataInboxFolderId,
    tables,
    operationId,
  } = params;

  const existingRows = await env.DB.prepare(
    `SELECT resource_key, spreadsheet_id, title FROM workspace_resources
     WHERE project_id = ? AND resource_kind IN ('inbox_sheet', 'inbox_spreadsheet') AND status = 'active'
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

  let bootSystemFolderId = '';
  let bootRegistryFileId = '';
  try {
    const boot = await bootstrapAccountDrive(env, accessToken, ownerId, { operationId });
    bootSystemFolderId = boot.systemFolderId;
    bootRegistryFileId = boot.resourceRegistryFileId;
  } catch {
    // Non-fatal in minimal test mocks
  }

  const datasetSpreadsheets: Record<string, string> = {};
  const tabsSynced: string[] = [];
  let primarySpreadsheetId = '';

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

    const ssTitle = `${projectName} — Inbox ${datasetKey}`;
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
          `Could not create project Inbox dataset spreadsheet (${createRes.status}): ${txt.slice(0, 160)}`,
          502,
          'SHEETS_CREATE_FAILED'
        );
      }
      const created = (await createRes.json()) as { spreadsheetId: string };
      spreadsheetId = created.spreadsheetId;

      if (dataInboxFolderId && spreadsheetId) {
        await driveFetchWithRetry(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            spreadsheetId
          )}?addParents=${encodeURIComponent(dataInboxFolderId)}&fields=id,parents,appProperties`,
          accessToken,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appProperties: {
                operation_id: operationId,
                resource_id: `${projectId}:inbox:${datasetKey}`,
                resource_type: 'inbox_sheet',
                dataset_key: datasetKey,
                org_id: orgId,
                project_id: projectId,
                schema_version: '1',
              },
            }),
          },
          { operationId }
        );
        await verifyDriveParent(accessToken, spreadsheetId, dataInboxFolderId, operationId).catch(
          () => undefined
        );
      }

      await upsertWorkspaceResource(env.DB, {
        ownerId,
        orgId,
        projectId,
        resourceKind: 'inbox_sheet',
        resourceKey: datasetKey,
        driveFileId: spreadsheetId,
        spreadsheetId,
        parentFolderId: dataInboxFolderId,
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
            resource_id: `wres_${projectId}_inbox_${datasetKey}`,
            owner_type: 'project',
            owner_id: ownerId,
            org_id: orgId,
            project_id: projectId,
            site_id: null,
            resource_type: 'inbox_sheet',
            resource_key: datasetKey,
            drive_file_id: spreadsheetId,
            spreadsheet_id: spreadsheetId,
            parent_folder_id: dataInboxFolderId,
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
        `Failed to update Inbox Sheets values (${writeRes.status}): ${txt.slice(0, 160)}`,
        502,
        'SHEETS_WRITE_FAILED'
      );
    }

    if (!primarySpreadsheetId) primarySpreadsheetId = spreadsheetId;
    datasetSpreadsheets[datasetKey] = spreadsheetId;
    tabsSynced.push(datasetKey);
  }

  return { spreadsheetId: primarySpreadsheetId, datasetSpreadsheets, tabsSynced };
}

export async function handleGetProjectInbox(
  _request: Request,
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

    const sitesRows = await env.DB.prepare(
      `SELECT site_id, site_slug, site_name, status FROM sites WHERE project_id = ?`
    )
      .bind(projectId)
      .all<{ site_id: string; site_slug: string; site_name: string; status: string }>();

    const projectSites = sitesRows.results || [];
    const siteIds = projectSites.map((s) => s.site_id);

    const destinations: Array<{
      id: string;
      site_id: string;
      form_id: string;
      form_name: string;
      category_id: string;
      destination_spreadsheet_id: string;
      destination_worksheet_name: string;
      inbox_registry_spreadsheet_id: string;
      status: string;
      updated_at: string;
    }> = [];

    const deliveryLogs: Array<{
      idempotency_key: string;
      site_id: string;
      form_id: string;
      submission_id: string;
      inbox_item_id: string;
      status: string;
      error_detail: string;
      created_at: string;
    }> = [];

    for (const sId of siteIds) {
      const destRows = await env.DB.prepare(
        `SELECT id, site_id, form_id, form_name, category_id, destination_spreadsheet_id,
                destination_worksheet_name, inbox_registry_spreadsheet_id, status, updated_at
         FROM site_form_destinations
         WHERE site_id = ?`
      )
        .bind(sId)
        .all<(typeof destinations)[number]>();
      destinations.push(...(destRows.results || []));

      const idempRows = await env.DB.prepare(
        `SELECT idempotency_key, site_id, form_id, submission_id, inbox_item_id,
                status, error_detail, created_at
         FROM form_submission_idempotency
         WHERE site_id = ?
         ORDER BY created_at DESC LIMIT 50`
      )
        .bind(sId)
        .all<(typeof deliveryLogs)[number]>();
      deliveryLogs.push(...(idempRows.results || []));
    }

    const resourceRows = await env.DB.prepare(
      `SELECT resource_kind, resource_key, drive_file_id, spreadsheet_id, title
       FROM workspace_resources
       WHERE project_id = ? AND status = 'active'
         AND resource_kind IN ('data_inbox', 'inbox_state', 'inbox_sheet', 'inbox_spreadsheet')`
    )
      .bind(projectId)
      .all<{
        resource_kind: string;
        resource_key: string;
        drive_file_id: string;
        spreadsheet_id: string;
        title: string;
      }>();

    const resources = resourceRows.results || [];
    const dataInboxFolderId =
      resources.find((r) => r.resource_kind === 'data_inbox')?.drive_file_id || '';
    const stateRow = resources.find((r) => r.resource_kind === 'inbox_state');
    const sheetRows = resources.filter(
      (r) => r.resource_kind === 'inbox_sheet' || r.resource_kind === 'inbox_spreadsheet'
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
        stateFileId?: string;
        spreadsheetId?: string;
        datasetSpreadsheets?: Record<string, string>;
        savedState?: Record<string, unknown> | null;
        remoteSubmissions?: RemoteSheetSubmission[];
      }>(env.DB, {
        ownerId: ownerAccountId,
        resourceType: 'inbox_state',
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
          folderId: dataInboxFolderId,
          stateFileId: cached.payload.stateFileId || stateRow?.drive_file_id || '',
          spreadsheetId: cached.payload.spreadsheetId || primarySpreadsheetId,
          datasetSpreadsheets: cached.payload.datasetSpreadsheets || datasetSpreadsheets,
          sites: projectSites,
          destinations,
          deliveryLogs,
          savedState: cached.payload.savedState || null,
          remoteSubmissions: cached.payload.remoteSubmissions || [],
        });
      }

      return Response.json(
        {
          ok: false,
          projectId,
          workspaceConnected: false,
          readOnly: true,
          unavailable: true,
          error: 'Google Workspace connection is unavailable and no cached Inbox snapshot exists.',
          code: 'WRITE_DISABLED_OAUTH_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    let stateFileId = stateRow?.drive_file_id || '';
    if (!stateFileId && dataInboxFolderId) {
      const files = await listFilesInFolder(accessToken, dataInboxFolderId);
      const found = files.find((f) => f.name === INBOX_STATE_FILENAME);
      if (found?.id) stateFileId = found.id;
    }

    let savedState: Record<string, unknown> | null = null;
    if (stateFileId) {
      try {
        savedState = (await readJsonFileById(accessToken, stateFileId)) as Record<string, unknown>;
      } catch {
        savedState = null;
      }
    }

    // Read visitor submissions recorded in Google Sheets for active form destinations
    const remoteSubmissions: RemoteSheetSubmission[] = [];
    for (const dest of destinations) {
      if (!dest.destination_spreadsheet_id || dest.status !== 'active') continue;
      const wsName = dest.destination_worksheet_name || 'CONTACT_SUBMISSIONS';
      const range = encodeURIComponent(`'${wsName.replace(/'/g, "''")}'!A1:G200`);
      try {
        const res = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            dest.destination_spreadsheet_id
          )}/values/${range}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) continue;
        const json = (await res.json()) as { values?: string[][] };
        const rows = json.values || [];
        const startIdx =
          rows[0]?.[0]?.toLowerCase().includes('submission') ||
          rows[0]?.[0]?.toLowerCase() === 'id'
            ? 1
            : 0;

        for (let i = startIdx; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !row[0]) continue;
          const submissionId = String(row[0]).trim();
          if (!submissionId) continue;

          const rawMessage = String(row[5] || '');
          let fields: Record<string, unknown> = {
            full_name: String(row[2] || ''),
            email: String(row[3] || ''),
            phone: String(row[4] || ''),
            message: rawMessage,
          };
          if (rawMessage.startsWith('{') && rawMessage.endsWith('}')) {
            try {
              const parsed = JSON.parse(rawMessage) as Record<string, unknown>;
              if (parsed && typeof parsed === 'object') {
                fields = { ...parsed, ...fields, message: parsed.message ?? rawMessage };
              }
            } catch {
              // Keep raw string
            }
          }

          const matchedDelivery = deliveryLogs.find((d) => d.submission_id === submissionId);
          remoteSubmissions.push({
            inbox_item_id: matchedDelivery?.inbox_item_id || `inb_sheet_${submissionId}`,
            submission_id: submissionId,
            site_id: dest.site_id,
            form_id: dest.form_id,
            form_name_snapshot: dest.form_name || 'Contact Form',
            category_id: dest.category_id || 'cat_inquiry',
            destination_spreadsheet_id: dest.destination_spreadsheet_id,
            destination_worksheet_id: wsName,
            submitted_at: String(row[1] || new Date().toISOString()),
            source_page: String(row[6] || '/'),
            fields,
          });
        }
      } catch {
        // Continue cleanly if one spreadsheet is temporarily unavailable
      }
    }

    const syncedCache = await writeManagementCache(env.DB, {
      ownerId: ownerAccountId,
      resourceType: 'inbox_state',
      resourceId: projectId,
      canonicalRevision: Number((savedState as { revision?: number } | null)?.revision ?? 1),
      payload: {
        stateFileId,
        spreadsheetId: primarySpreadsheetId,
        datasetSpreadsheets,
        savedState,
        remoteSubmissions,
      },
      ttlSeconds: 3600,
    }).catch(() => null);

    return Response.json({
      ok: true,
      projectId,
      workspaceConnected: true,
      readOnly: false,
      stale: false,
      lastSyncedAt: syncedCache?.lastSyncedAt || new Date().toISOString(),
      folderId: dataInboxFolderId,
      stateFileId,
      spreadsheetId: primarySpreadsheetId,
      datasetSpreadsheets,
      sites: projectSites,
      destinations,
      deliveryLogs,
      savedState,
      remoteSubmissions,
    });
  } catch (err) {
    return mapInboxError(err);
  }
}

export async function handleSyncProjectInbox(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    operationId?: string;
    expectedRevision?: number;
    expectedEtag?: string;
    inboxState?: {
      revision?: number;
      inboxSubmissions?: unknown[];
      inboxCategories?: unknown[];
      inboxNotes?: unknown[];
      inboxActivities?: unknown[];
      forms?: unknown[];
    };
    syncSheets?: boolean;
    title?: string;
    tables?: InboxSheetTableInput[];
  };

  if (!body.inboxState || typeof body.inboxState !== 'object') {
    return Response.json(
      { error: 'Valid inboxState payload is required.', code: 'INVALID_INBOX_STATE' },
      { status: 400 }
    );
  }

  const operationId =
    body.operationId?.trim() ||
    request.headers.get('Idempotency-Key')?.trim() ||
    generateOperationId('op_inb');
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
        'Google Workspace connection is unavailable. Inbox writes are disabled in read-only mode.',
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

        const dataInboxFolderId =
          tree.folders.data_inbox ||
          (
            await ensureFolderSegment(accessToken, tree.folders.data_root, 'Inbox', {
              operationId,
              resourceId: `${projectId}:data_inbox`,
              resourceType: 'data_inbox',
            })
          ).id;

        const existingStateRes = await env.DB.prepare(
          `SELECT drive_file_id FROM workspace_resources
           WHERE project_id = ? AND resource_kind = 'inbox_state' AND resource_key = 'default' AND status = 'active'
           LIMIT 1`
        )
          .bind(projectId)
          .first<{ drive_file_id: string }>();

        let knownStateId = existingStateRes?.drive_file_id || '';
        let currentRevision: number | undefined;
        let currentEtag: string | undefined = expectedEtag;

        if (knownStateId) {
          try {
            const read = await readDriveJsonWithConcurrency<{ revision?: number }>(
              accessToken,
              knownStateId,
              operationId
            );
            currentRevision = Number(read.data?.revision ?? 0);
            currentEtag = currentEtag || read.meta.etag;
          } catch {
            knownStateId = '';
          }
        }

        if (
          body.expectedRevision !== undefined &&
          currentRevision !== undefined &&
          currentRevision !== body.expectedRevision
        ) {
          throw new BuillyTransactionError(
            'REVISION_CONFLICT',
            `Inbox state revision conflict: expected ${body.expectedRevision}, found ${currentRevision}.`,
            {
              operationId,
              details: {
                resourceId: `${projectId}:inbox_state`,
                expectedRevision: body.expectedRevision,
                actualRevision: currentRevision,
              },
            }
          );
        }

        await lock.verify();

        const nowIso = new Date().toISOString();
        const nextRevision =
          currentRevision !== undefined
            ? currentRevision + 1
            : Number(body.inboxState!.revision || 1);

        const statePayload = {
          schemaVersion: 1,
          revision: nextRevision,
          projectId,
          lastOperationId: operationId,
          updatedAt: nowIso,
          forms: Array.isArray(body.inboxState!.forms) ? body.inboxState!.forms : [],
          inboxCategories: Array.isArray(body.inboxState!.inboxCategories)
            ? body.inboxState!.inboxCategories
            : [],
          inboxSubmissions: Array.isArray(body.inboxState!.inboxSubmissions)
            ? body.inboxState!.inboxSubmissions
            : [],
          inboxNotes: Array.isArray(body.inboxState!.inboxNotes) ? body.inboxState!.inboxNotes : [],
          inboxActivities: Array.isArray(body.inboxState!.inboxActivities)
            ? body.inboxState!.inboxActivities
            : [],
        };

        const savedStateFile = await writeJsonFileInFolder(
          accessToken,
          dataInboxFolderId,
          INBOX_STATE_FILENAME,
          statePayload,
          {
            operationId,
            resourceId: `${projectId}:inbox_state`,
            resourceType: 'inbox_state',
            knownFileId: knownStateId || undefined,
            expectedRevision: body.expectedRevision,
            expectedEtag: currentEtag,
          }
        );

        await upsertWorkspaceResource(env.DB, {
          ownerId: ownerAccountId,
          orgId: access.project.org_id,
          projectId,
          resourceKind: 'inbox_state',
          resourceKey: 'default',
          driveFileId: savedStateFile.fileId,
          parentFolderId: dataInboxFolderId,
          title: INBOX_STATE_FILENAME,
          canonicalRevision: nextRevision,
          lastOperationId: operationId,
        });

        let spreadsheetId = '';
        let datasetSpreadsheets: Record<string, string> = {};
        let tabsSynced: string[] = [];
        if (body.syncSheets && Array.isArray(body.tables) && body.tables.length > 0) {
          const sheetRes = await ensureAndSyncInboxDatasets({
            env,
            accessToken,
            ownerId: ownerAccountId,
            orgId: access.project.org_id,
            projectId,
            projectName: access.project.name,
            dataInboxFolderId,
            tables: body.tables,
            operationId,
          });
          spreadsheetId = sheetRes.spreadsheetId;
          datasetSpreadsheets = sheetRes.datasetSpreadsheets;
          tabsSynced = sheetRes.tabsSynced;
        }

        await writeManagementCache(env.DB, {
          ownerId: ownerAccountId,
          resourceType: 'inbox_state',
          resourceId: projectId,
          canonicalRevision: nextRevision,
          payload: {
            stateFileId: savedStateFile.fileId,
            spreadsheetId,
            datasetSpreadsheets,
            savedState: statePayload,
            remoteSubmissions: [],
          },
          ttlSeconds: 3600,
        }).catch(() => undefined);

        return Response.json({
          ok: true,
          operationId,
          revision: nextRevision,
          projectId,
          folderId: dataInboxFolderId,
          stateFileId: savedStateFile.fileId,
          spreadsheetId,
          datasetSpreadsheets,
          tabsSynced,
          syncedAt: nowIso,
        });
      }
    );
  } catch (err) {
    return mapInboxError(err);
  }
}
