import { requireSession } from '../middleware/requireSession';
import { ensureProjectDriveTree, upsertWorkspaceResource } from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import {
  HierarchyServiceError,
  requireProjectAccess,
} from '../services/workspaceHierarchyService';
import { WorkerEnv } from '../types';

function mapSheetsError(err: unknown): Response {
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'SHEETS_ERROR';
  return Response.json(
    {
      error:
        code === 'WORKSPACE_REAUTH_REQUIRED'
          ? 'Google Workspace reauthorization required.'
          : err instanceof Error
          ? err.message
          : 'Google Sheets operation failed.',
      code,
    },
    { status: code === 'WORKSPACE_REAUTH_REQUIRED' ? 401 : 500 }
  );
}

export async function handleSheetsReadMeta(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const url = new URL(request.url);
  const spreadsheetId = url.searchParams.get('spreadsheetId')?.trim();
  if (!spreadsheetId) {
    return Response.json({ error: 'Missing spreadsheetId parameter.' }, { status: 400 });
  }

  try {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}?fields=spreadsheetId,spreadsheetUrl,properties(title),sheets(properties(title,sheetId))`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!sheetRes.ok) {
      return Response.json(
        { error: 'Unable to access spreadsheet for this Builly owner.', code: 'SHEETS_ACCESS_DENIED' },
        { status: sheetRes.status }
      );
    }
    const spreadsheet = await sheetRes.json();
    return Response.json({ spreadsheet });
  } catch (err) {
    return mapSheetsError(err);
  }
}

export async function handleSheetsReadValues(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    spreadsheetId?: string;
    ranges?: string[];
  };
  const spreadsheetId = (body.spreadsheetId || '').trim();
  const ranges = Array.isArray(body.ranges) ? body.ranges.filter(Boolean) : [];
  if (!spreadsheetId || ranges.length === 0) {
    return Response.json(
      { error: 'spreadsheetId and at least one range are required.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  try {
    if (body.projectId) {
      await requireProjectAccess(env.DB, body.projectId, session.ownerId, [
        'owner',
        'admin',
        'editor',
        'viewer',
      ]);
    }
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchGet?${qs}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return Response.json(
        { error: `Failed to read Sheet ranges (${res.status}): ${txt.slice(0, 160)}`, code: 'SHEETS_READ_FAILED' },
        { status: res.status === 401 || res.status === 403 || res.status === 404 ? res.status : 502 }
      );
    }
    const payload = await res.json();
    return Response.json({ ok: true, ...(payload as Record<string, unknown>) });
  } catch (err) {
    return mapSheetsError(err);
  }
}

export async function handleSheetsWriteValues(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    spreadsheetId?: string;
    valueInputOption?: 'RAW' | 'USER_ENTERED';
    data?: Array<{ range: string; values: unknown[][] }>;
  };
  const spreadsheetId = (body.spreadsheetId || '').trim();
  const data = Array.isArray(body.data) ? body.data : [];
  if (!spreadsheetId || data.length === 0) {
    return Response.json(
      { error: 'spreadsheetId and data ranges are required.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  try {
    if (body.projectId) {
      await requireProjectAccess(env.DB, body.projectId, session.ownerId, [
        'owner',
        'admin',
        'editor',
      ]);
    }
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const res = await fetch(
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
          valueInputOption: body.valueInputOption === 'USER_ENTERED' ? 'USER_ENTERED' : 'RAW',
          data,
        }),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return Response.json(
        { error: `Failed to write Sheet values (${res.status}): ${txt.slice(0, 160)}`, code: 'SHEETS_WRITE_FAILED' },
        { status: res.status === 401 || res.status === 403 || res.status === 404 ? res.status : 502 }
      );
    }
    const result = await res.json();
    return Response.json({ ok: true, ...(result as Record<string, unknown>) });
  } catch (err) {
    return mapSheetsError(err);
  }
}

export async function handleSheetsAppendValues(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    spreadsheetId?: string;
    range?: string;
    values?: unknown[][];
    valueInputOption?: 'RAW' | 'USER_ENTERED';
  };
  const spreadsheetId = (body.spreadsheetId || '').trim();
  const range = (body.range || '').trim();
  const values = Array.isArray(body.values) ? body.values : [];
  if (!spreadsheetId || !range || values.length === 0) {
    return Response.json(
      { error: 'spreadsheetId, range, and values are required.', code: 'INVALID_REQUEST' },
      { status: 400 }
    );
  }

  try {
    if (body.projectId) {
      await requireProjectAccess(env.DB, body.projectId, session.ownerId, [
        'owner',
        'admin',
        'editor',
      ]);
    }
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(range)}:append?valueInputOption=${
        body.valueInputOption === 'USER_ENTERED' ? 'USER_ENTERED' : 'RAW'
      }&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return Response.json(
        { error: `Failed to append Sheet rows (${res.status}): ${txt.slice(0, 160)}`, code: 'SHEETS_APPEND_FAILED' },
        { status: res.status === 401 || res.status === 403 || res.status === 404 ? res.status : 502 }
      );
    }
    const result = await res.json();
    return Response.json({ ok: true, ...(result as Record<string, unknown>) });
  } catch (err) {
    return mapSheetsError(err);
  }
}

export async function handleSheetsEnsureSpreadsheet(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    siteId?: string;
    domainKind?: 'cms' | 'inbox' | 'system';
    datasetKey?: string;
    title?: string;
    tabs?: string[];
  };

  const domainKind = body.domainKind || 'cms';
  const datasetKey = (body.datasetKey || 'default').trim();
  const title = (body.title || `Builly ${domainKind.toUpperCase()} — ${datasetKey}`).trim();
  const tabs = Array.isArray(body.tabs) && body.tabs.length > 0 ? body.tabs : ['ITEMS'];

  try {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    let targetFolderId = '';
    let orgId = '';
    let resourceOwnerId = session.ownerId;

    if (body.projectId) {
      const access = await requireProjectAccess(env.DB, body.projectId, session.ownerId, [
        'owner',
        'admin',
        'editor',
      ]);
      orgId = access.project.org_id;
      resourceOwnerId = access.project.owner_id;

      const existingRes = await env.DB.prepare(
        `SELECT spreadsheet_id, parent_folder_id, title FROM workspace_resources
         WHERE project_id = ? AND resource_kind = ? AND resource_key = ? AND status = 'active'
         LIMIT 1`
      )
        .bind(body.projectId, `${domainKind}_spreadsheet`, datasetKey)
        .first<{ spreadsheet_id: string; parent_folder_id: string; title: string }>();

      if (existingRes?.spreadsheet_id) {
        const metaCheck = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
            existingRes.spreadsheet_id
          )}?fields=spreadsheetId,spreadsheetUrl,properties(title),sheets(properties(title))`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (metaCheck.ok) {
          const meta = (await metaCheck.json()) as {
            spreadsheetId: string;
            spreadsheetUrl?: string;
            properties?: { title?: string };
            sheets?: Array<{ properties?: { title?: string } }>;
          };
          const existingTabNames = new Set(
            (meta.sheets || []).map((s) => s.properties?.title || '').filter(Boolean)
          );
          const missingTabs = tabs.filter((t) => !existingTabNames.has(t));
          if (missingTabs.length > 0) {
            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
                meta.spreadsheetId
              )}:batchUpdate`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  requests: missingTabs.map((t) => ({ addSheet: { properties: { title: t } } })),
                }),
              }
            );
          }
          return Response.json({
            ok: true,
            created: false,
            spreadsheetId: meta.spreadsheetId,
            spreadsheetUrl:
              meta.spreadsheetUrl ||
              `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`,
            title: meta.properties?.title || existingRes.title,
            folderId: existingRes.parent_folder_id,
          });
        }
      }

      const tree = await ensureProjectDriveTree(env, session, body.projectId);
      targetFolderId =
        domainKind === 'inbox'
          ? tree.folders.data_inbox
          : domainKind === 'cms'
          ? tree.folders.data_cms
          : tree.folders.data_root;
    }

    const createdRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
        sheets: tabs.map((t) => ({ properties: { title: t } })),
      }),
    });
    if (!createdRes.ok) {
      const txt = await createdRes.text().catch(() => '');
      return Response.json(
        { error: `Could not create spreadsheet (${createdRes.status}): ${txt.slice(0, 160)}`, code: 'SHEETS_CREATE_FAILED' },
        { status: 502 }
      );
    }

    const created = (await createdRes.json()) as {
      spreadsheetId: string;
      spreadsheetUrl?: string;
      properties?: { title?: string };
    };

    if (targetFolderId && created.spreadsheetId) {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          created.spreadsheetId
        )}?addParents=${encodeURIComponent(targetFolderId)}&fields=id,parents`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    }

    if (body.projectId && orgId && created.spreadsheetId) {
      await upsertWorkspaceResource(env.DB, {
        ownerId: resourceOwnerId,
        orgId,
        projectId: body.projectId,
        siteId: body.siteId || null,
        resourceKind: `${domainKind}_spreadsheet`,
        resourceKey: datasetKey,
        driveFileId: created.spreadsheetId,
        spreadsheetId: created.spreadsheetId,
        parentFolderId: targetFolderId,
        title: created.properties?.title || title,
      });
    }

    return Response.json(
      {
        ok: true,
        created: true,
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl:
          created.spreadsheetUrl ||
          `https://docs.google.com/spreadsheets/d/${created.spreadsheetId}/edit`,
        title: created.properties?.title || title,
        folderId: targetFolderId,
      },
      { status: 201 }
    );
  } catch (err) {
    return mapSheetsError(err);
  }
}
