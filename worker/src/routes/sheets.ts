import { requireSession } from '../middleware/requireSession';
import {
  driveFetchWithRetry,
  verifyDriveParent,
} from '../services/driveCanonicalClient';
import { bootstrapAccountDrive, upsertCanonicalResourceRegistryEntry } from '../services/driveManifestService';
import { ensureProjectDriveTree, upsertWorkspaceResource } from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import { withMutationLock } from '../services/mutationLockService';
import { generateOperationId } from '../services/operationJournalService';
import { BuillyTransactionError } from '../services/transactionErrors';
import {
  HierarchyServiceError,
  requireProjectAccess,
} from '../services/workspaceHierarchyService';
import { WorkerEnv } from '../types';

function mapSheetsError(err: unknown): Response {
  if (err instanceof BuillyTransactionError) {
    return Response.json(err.toSafeJson(), { status: err.status });
  }
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'SHEETS_ERROR';
  const isOauthOutage = code === 'WORKSPACE_REAUTH_REQUIRED';
  return Response.json(
    {
      error: isOauthOutage
        ? 'Google Workspace connection is unavailable or expired.'
        : err instanceof Error
        ? err.message
        : 'Google Sheets operation failed.',
      code: isOauthOutage ? 'WRITE_DISABLED_OAUTH_UNAVAILABLE' : code,
    },
    { status: isOauthOutage ? 503 : 500 }
  );
}

/**
 * Rejects arbitrary client-supplied spreadsheetId values that are not registered
 * to an authorized workspace_resources, site_dataset_resources, or site_form_destinations row.
 */
async function verifySpreadsheetOwnershipForUser(
  db: D1Database,
  ownerId: string,
  spreadsheetId: string,
  projectId?: string
): Promise<{ resourceOwnerId: string }> {
  if (projectId) {
    const access = await requireProjectAccess(db, projectId, ownerId, [
      'owner',
      'admin',
      'editor',
      'viewer',
    ]);
    const resRow = await db
      .prepare(
        `SELECT owner_id FROM workspace_resources
         WHERE project_id = ? AND (spreadsheet_id = ? OR drive_file_id = ?) AND status != 'archived'
         LIMIT 1`
      )
      .bind(projectId, spreadsheetId, spreadsheetId)
      .first<{ owner_id: string }>();

    if (resRow) {
      return { resourceOwnerId: access.project.owner_id || resRow.owner_id };
    }

    const siteDestRow = await db
      .prepare(
        `SELECT sfd.owner_id
         FROM site_form_destinations sfd
         INNER JOIN sites s ON s.site_id = sfd.site_id
         WHERE s.project_id = ?
           AND (sfd.destination_spreadsheet_id = ? OR sfd.inbox_registry_spreadsheet_id = ?)
         LIMIT 1`
      )
      .bind(projectId, spreadsheetId, spreadsheetId)
      .first<{ owner_id: string }>();

    if (siteDestRow) {
      return { resourceOwnerId: access.project.owner_id || siteDestRow.owner_id };
    }

    throw new BuillyTransactionError(
      'FORBIDDEN_SPREADSHEET_ACCESS',
      'Spreadsheet is not registered to this authorized Project.',
      { status: 403, details: { resourceId: spreadsheetId } }
    );
  }

  const ownedResource = await db
    .prepare(
      `SELECT wr.owner_id
       FROM workspace_resources wr
       LEFT JOIN organization_members m ON m.org_id = wr.org_id AND m.user_id = ? AND m.status = 'active'
       WHERE (wr.spreadsheet_id = ? OR wr.drive_file_id = ?)
         AND (wr.owner_id = ? OR m.user_id IS NOT NULL)
         AND wr.status != 'archived'
       LIMIT 1`
    )
    .bind(ownerId, spreadsheetId, spreadsheetId, ownerId)
    .first<{ owner_id: string }>();

  if (ownedResource) {
    return { resourceOwnerId: ownedResource.owner_id || ownerId };
  }

  const datasetRow = await db
    .prepare(
      `SELECT owner_id FROM site_dataset_resources
       WHERE owner_id = ? AND spreadsheet_id = ? AND status = 'active' LIMIT 1`
    )
    .bind(ownerId, spreadsheetId)
    .first<{ owner_id: string }>();
  if (datasetRow) {
    return { resourceOwnerId: datasetRow.owner_id };
  }

  const formRow = await db
    .prepare(
      `SELECT owner_id FROM site_form_destinations
       WHERE owner_id = ? AND (destination_spreadsheet_id = ? OR inbox_registry_spreadsheet_id = ?)
       LIMIT 1`
    )
    .bind(ownerId, spreadsheetId, spreadsheetId)
    .first<{ owner_id: string }>();
  if (formRow) {
    return { resourceOwnerId: formRow.owner_id };
  }

  throw new BuillyTransactionError(
    'FORBIDDEN_SPREADSHEET_ACCESS',
    'Arbitrary client-supplied spreadsheetId is not permitted. Register datasets through your Project first.',
    { status: 403, details: { resourceId: spreadsheetId } }
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
  const projectId = url.searchParams.get('projectId')?.trim() || undefined;
  if (!spreadsheetId) {
    return Response.json({ error: 'Missing spreadsheetId parameter.' }, { status: 400 });
  }

  try {
    const { resourceOwnerId } = await verifySpreadsheetOwnershipForUser(
      env.DB,
      session.ownerId,
      spreadsheetId,
      projectId
    );
    const { accessToken } = await mintOwnerGoogleAccessToken(env, resourceOwnerId);
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
    const { resourceOwnerId } = await verifySpreadsheetOwnershipForUser(
      env.DB,
      session.ownerId,
      spreadsheetId,
      body.projectId
    );
    const { accessToken } = await mintOwnerGoogleAccessToken(env, resourceOwnerId);
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
    const { resourceOwnerId } = await verifySpreadsheetOwnershipForUser(
      env.DB,
      session.ownerId,
      spreadsheetId,
      body.projectId
    );
    const { accessToken } = await mintOwnerGoogleAccessToken(env, resourceOwnerId);
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
    const { resourceOwnerId } = await verifySpreadsheetOwnershipForUser(
      env.DB,
      session.ownerId,
      spreadsheetId,
      body.projectId
    );
    const { accessToken } = await mintOwnerGoogleAccessToken(env, resourceOwnerId);
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
    operationId?: string;
  };

  const operationId =
    body.operationId?.trim() ||
    request.headers.get('Idempotency-Key')?.trim() ||
    generateOperationId('op_sheet');
  const domainKind = body.domainKind || 'cms';
  const datasetKey = (body.datasetKey || 'default').trim();
  const title = (body.title || `Builly ${domainKind.toUpperCase()} — ${datasetKey}`).trim();
  const tabs = Array.isArray(body.tabs) && body.tabs.length > 0 ? body.tabs : [datasetKey || 'ITEMS'];

  try {
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
      resourceOwnerId = access.project.owner_id || session.ownerId;
    }

    const { accessToken } = await mintOwnerGoogleAccessToken(env, resourceOwnerId);
    const scopeKey = body.projectId ? `project:${body.projectId}` : `account:${session.ownerId}`;

    return await withMutationLock(env, { scopeKey, operationId }, async () => {
      const canonicalKind = `${domainKind}_sheet`;
      const legacyKind = `${domainKind}_spreadsheet`;

      if (body.projectId) {
        const existingRes = await env.DB.prepare(
          `SELECT spreadsheet_id, parent_folder_id, title FROM workspace_resources
           WHERE project_id = ? AND resource_kind IN (?, ?) AND resource_key = ? AND status = 'active'
           LIMIT 1`
        )
          .bind(body.projectId, canonicalKind, legacyKind, datasetKey)
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
              datasetKey,
            });
          }
        }

        const tree = await ensureProjectDriveTree(env, session, body.projectId, {
          operationId,
          accessTokenOverride: accessToken,
        });
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
          {
            error: `Could not create spreadsheet (${createdRes.status}): ${txt.slice(0, 160)}`,
            code: 'SHEETS_CREATE_FAILED',
          },
          { status: 502 }
        );
      }

      const created = (await createdRes.json()) as {
        spreadsheetId: string;
        spreadsheetUrl?: string;
        properties?: { title?: string };
      };

      if (targetFolderId && created.spreadsheetId) {
        await driveFetchWithRetry(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            created.spreadsheetId
          )}?addParents=${encodeURIComponent(targetFolderId)}&fields=id,parents,appProperties`,
          accessToken,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appProperties: {
                operation_id: operationId,
                resource_id: body.projectId ? `${body.projectId}:${domainKind}:${datasetKey}` : datasetKey,
                resource_type: canonicalKind,
                dataset_key: datasetKey,
                ...(body.projectId ? { project_id: body.projectId } : {}),
                ...(orgId ? { org_id: orgId } : {}),
                schema_version: '1',
              },
            }),
          },
          { operationId }
        );
        await verifyDriveParent(accessToken, created.spreadsheetId, targetFolderId, operationId).catch(
          () => undefined
        );
      }

      if (body.projectId && orgId && created.spreadsheetId) {
        await upsertWorkspaceResource(env.DB, {
          ownerId: resourceOwnerId,
          orgId,
          projectId: body.projectId,
          siteId: body.siteId || null,
          resourceKind: canonicalKind,
          resourceKey: datasetKey,
          driveFileId: created.spreadsheetId,
          spreadsheetId: created.spreadsheetId,
          parentFolderId: targetFolderId,
          title: created.properties?.title || title,
          lastOperationId: operationId,
        });

        try {
          const boot = await bootstrapAccountDrive(env, accessToken, resourceOwnerId, { operationId });
          await upsertCanonicalResourceRegistryEntry(accessToken, {
            systemFolderId: boot.systemFolderId,
            registryFileId: boot.resourceRegistryFileId,
            ownerAccountId: resourceOwnerId,
            operationId,
            entry: {
              resource_id: `wres_${body.projectId}_${canonicalKind}_${datasetKey}`,
              owner_type: 'project',
              owner_id: resourceOwnerId,
              org_id: orgId,
              project_id: body.projectId,
              site_id: body.siteId || null,
              resource_type: canonicalKind,
              resource_key: datasetKey,
              drive_file_id: created.spreadsheetId,
              spreadsheet_id: created.spreadsheetId,
              parent_folder_id: targetFolderId,
              title: created.properties?.title || title,
              mime_type: 'application/vnd.google-apps.spreadsheet',
              schema_version: 1,
              status: 'active',
            },
          });
        } catch {
          // Non-fatal if canonical system registry update cannot run in partial mock
        }
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
          datasetKey,
        },
        { status: 201 }
      );
    });
  } catch (err) {
    return mapSheetsError(err);
  }
}
