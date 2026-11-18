import {
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
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'PROJECT_INBOX_ERROR';
  const status = code === 'WORKSPACE_REAUTH_REQUIRED' ? 401 : 500;
  return Response.json(
    {
      error:
        code === 'WORKSPACE_REAUTH_REQUIRED'
          ? 'Google Workspace connection or reauthorization is required.'
          : err instanceof Error
          ? err.message
          : 'Project Inbox operation failed.',
      code,
    },
    { status }
  );
}

async function ensureAndSyncInboxSpreadsheet(params: {
  db: D1Database;
  accessToken: string;
  ownerId: string;
  orgId: string;
  projectId: string;
  dataInboxFolderId: string;
  title: string;
  tables: InboxSheetTableInput[];
}): Promise<{ spreadsheetId: string; tabsSynced: string[] }> {
  const { db, accessToken, ownerId, orgId, projectId, dataInboxFolderId, title, tables } = params;

  const existing = await db
    .prepare(
      `SELECT spreadsheet_id FROM workspace_resources
       WHERE project_id = ? AND resource_kind = 'inbox_spreadsheet' AND status = 'active'
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
        sheets: (desiredTitles.length > 0 ? desiredTitles : ['INBOX_REGISTRY']).map((t) => ({
          properties: { title: t, gridProperties: { frozenRowCount: 1 } },
        })),
      }),
    });
    if (!createRes.ok) {
      const txt = await createRes.text().catch(() => '');
      throw new HierarchyServiceError(
        `Could not create project Inbox spreadsheet (${createRes.status}): ${txt.slice(0, 160)}`,
        502,
        'SHEETS_CREATE_FAILED'
      );
    }
    const created = (await createRes.json()) as { spreadsheetId: string };
    spreadsheetId = created.spreadsheetId;

    if (dataInboxFolderId && spreadsheetId) {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          spreadsheetId
        )}?addParents=${encodeURIComponent(dataInboxFolderId)}&fields=id`,
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
      resourceKind: 'inbox_spreadsheet',
      resourceKey: 'default',
      driveFileId: spreadsheetId,
      spreadsheetId,
      parentFolderId: dataInboxFolderId,
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
        `Failed to update Inbox Sheets values (${writeRes.status}): ${txt.slice(0, 160)}`,
        502,
        'SHEETS_WRITE_FAILED'
      );
    }
    tables.forEach((t) => tabsSynced.push(t.title));
  }

  return { spreadsheetId, tabsSynced };
}

export async function handleGetProjectInbox(
  _request: Request,
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
      `SELECT resource_kind, drive_file_id, spreadsheet_id, title
       FROM workspace_resources
       WHERE project_id = ? AND status = 'active'
         AND resource_kind IN ('data_inbox', 'inbox_state', 'inbox_spreadsheet')`
    )
      .bind(projectId)
      .all<{
        resource_kind: string;
        drive_file_id: string;
        spreadsheet_id: string;
        title: string;
      }>();

    const resources = resourceRows.results || [];
    const dataInboxFolderId =
      resources.find((r) => r.resource_kind === 'data_inbox')?.drive_file_id || '';
    const stateRow = resources.find((r) => r.resource_kind === 'inbox_state');
    const sheetRow = resources.find((r) => r.resource_kind === 'inbox_spreadsheet');

    let accessToken: string;
    try {
      const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
      accessToken = minted.accessToken;
    } catch {
      return Response.json({
        ok: true,
        projectId,
        workspaceConnected: false,
        folderId: dataInboxFolderId,
        stateFileId: stateRow?.drive_file_id || '',
        spreadsheetId: sheetRow?.spreadsheet_id || '',
        sites: projectSites,
        destinations,
        deliveryLogs,
        savedState: null,
        remoteSubmissions: [] as RemoteSheetSubmission[],
      });
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
        // Row format written by publicRuntime.ts:
        // [submissionId, nowIso, name, email, phone, messageOrJson, sourcePage]
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

    return Response.json({
      ok: true,
      projectId,
      workspaceConnected: true,
      folderId: dataInboxFolderId,
      stateFileId,
      spreadsheetId: sheetRow?.spreadsheet_id || '',
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
    inboxState?: {
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

  try {
    const access = await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
    ]);
    const tree = await ensureProjectDriveTree(env, session, projectId);
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);

    const dataInboxFolderId =
      tree.folders.data_inbox ||
      (await ensureFolderSegment(accessToken, tree.folders.data_root, 'Inbox')).id;

    const nowIso = new Date().toISOString();
    const statePayload = {
      schemaVersion: 1,
      projectId,
      updatedAt: nowIso,
      forms: Array.isArray(body.inboxState.forms) ? body.inboxState.forms : [],
      inboxCategories: Array.isArray(body.inboxState.inboxCategories)
        ? body.inboxState.inboxCategories
        : [],
      inboxSubmissions: Array.isArray(body.inboxState.inboxSubmissions)
        ? body.inboxState.inboxSubmissions
        : [],
      inboxNotes: Array.isArray(body.inboxState.inboxNotes) ? body.inboxState.inboxNotes : [],
      inboxActivities: Array.isArray(body.inboxState.inboxActivities)
        ? body.inboxState.inboxActivities
        : [],
    };

    const savedStateFile = await writeJsonFileInFolder(
      accessToken,
      dataInboxFolderId,
      INBOX_STATE_FILENAME,
      statePayload
    );

    await upsertWorkspaceResource(env.DB, {
      ownerId: access.project.owner_id,
      orgId: access.project.org_id,
      projectId,
      resourceKind: 'inbox_state',
      resourceKey: 'default',
      driveFileId: savedStateFile.fileId,
      parentFolderId: dataInboxFolderId,
      title: INBOX_STATE_FILENAME,
    });

    let spreadsheetId = '';
    let tabsSynced: string[] = [];
    if (body.syncSheets && Array.isArray(body.tables) && body.tables.length > 0) {
      const sheetRes = await ensureAndSyncInboxSpreadsheet({
        db: env.DB,
        accessToken,
        ownerId: access.project.owner_id,
        orgId: access.project.org_id,
        projectId,
        dataInboxFolderId,
        title: (body.title || `Builly Inbox — ${access.project.name}`).trim(),
        tables: body.tables,
      });
      spreadsheetId = sheetRes.spreadsheetId;
      tabsSynced = sheetRes.tabsSynced;
    }

    return Response.json({
      ok: true,
      projectId,
      folderId: dataInboxFolderId,
      stateFileId: savedStateFile.fileId,
      spreadsheetId,
      tabsSynced,
      syncedAt: nowIso,
    });
  } catch (err) {
    return mapInboxError(err);
  }
}
