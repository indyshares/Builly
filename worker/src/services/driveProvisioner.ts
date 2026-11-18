import { VerifiedSession, WorkerEnv } from '../types';
import { mintOwnerGoogleAccessToken } from './googleTokenVault';
import {
  HierarchyServiceError,
  OrganizationRecord,
  requireProjectAccess,
  WorkspaceResourceRecord,
} from './workspaceHierarchyService';

export type ProjectDriveFolderKind =
  | 'project_root'
  | 'config_root'
  | 'config_draft'
  | 'config_published'
  | 'data_root'
  | 'data_cms'
  | 'data_inbox'
  | 'assets_root'
  | 'exports_root';

export interface ProjectDriveTreeResult {
  rootFolderId: string;
  orgFolderId: string;
  projectFolderId: string;
  folders: Record<ProjectDriveFolderKind, string>;
  resources: WorkspaceResourceRecord[];
  createdFoldersCount: number;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function driveJson<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new HierarchyServiceError(
      `Google Drive API error (${res.status}): ${txt.slice(0, 180)}`,
      res.status === 401 || res.status === 403 ? res.status : 502,
      res.status === 401 ? 'WORKSPACE_REAUTH_REQUIRED' : 'DRIVE_API_ERROR'
    );
  }
  return (await res.json()) as T;
}

async function verifyFolderExists(accessToken: string, folderId: string): Promise<boolean> {
  if (!folderId) return false;
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        folderId
      )}?fields=id,trashed,mimeType`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { id?: string; trashed?: boolean; mimeType?: string };
    return Boolean(data.id && !data.trashed && data.mimeType === FOLDER_MIME);
  } catch {
    return false;
  }
}

export async function ensureFolderSegment(
  accessToken: string,
  parentId: string | null,
  name: string
): Promise<{ id: string; created: boolean }> {
  const escaped = name.replace(/'/g, "\\'");
  const parentFilter = parentId ? `'${parentId}' in parents and ` : `'root' in parents and `;
  const q = encodeURIComponent(
    `${parentFilter}name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`
  );
  const found = await driveJson<{ files?: Array<{ id: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`,
    accessToken
  );
  if (found.files?.[0]?.id) {
    return { id: found.files[0].id, created: false };
  }

  const created = await driveJson<{ id: string }>(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    }
  );
  return { id: created.id, created: true };
}

function makeResourceId(): string {
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
  return `wres_${Date.now().toString(36)}_${hex}`;
}

export async function upsertWorkspaceResource(
  db: D1Database,
  params: {
    ownerId: string;
    orgId: string;
    projectId: string | null;
    siteId?: string | null;
    resourceKind: string;
    resourceKey: string;
    driveFileId?: string;
    spreadsheetId?: string;
    parentFolderId?: string;
    title: string;
    status?: 'active' | 'legacy' | 'archived';
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const status = params.status || 'active';

  if (params.projectId) {
    await db
      .prepare(
        `INSERT INTO workspace_resources (
           resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
           drive_file_id, spreadsheet_id, parent_folder_id, title, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id, project_id, resource_kind, resource_key) DO UPDATE SET
           drive_file_id = CASE WHEN excluded.drive_file_id != '' THEN excluded.drive_file_id ELSE workspace_resources.drive_file_id END,
           spreadsheet_id = CASE WHEN excluded.spreadsheet_id != '' THEN excluded.spreadsheet_id ELSE workspace_resources.spreadsheet_id END,
           parent_folder_id = CASE WHEN excluded.parent_folder_id != '' THEN excluded.parent_folder_id ELSE workspace_resources.parent_folder_id END,
           title = excluded.title,
           status = excluded.status,
           updated_at = excluded.updated_at`
      )
      .bind(
        makeResourceId(),
        params.ownerId,
        params.orgId,
        params.projectId,
        params.siteId || null,
        params.resourceKind,
        params.resourceKey,
        params.driveFileId || '',
        params.spreadsheetId || '',
        params.parentFolderId || '',
        params.title,
        status,
        nowIso,
        nowIso
      )
      .run();
    return;
  }

  // Handle org-level / root resources where project_id IS NULL (SQLite treats NULLs as distinct in UNIQUE)
  const existing = await db
    .prepare(
      `SELECT resource_id FROM workspace_resources
       WHERE org_id = ? AND project_id IS NULL AND resource_kind = ? AND resource_key = ?
       LIMIT 1`
    )
    .bind(params.orgId, params.resourceKind, params.resourceKey)
    .first<{ resource_id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE workspace_resources
         SET drive_file_id = CASE WHEN ? != '' THEN ? ELSE drive_file_id END,
             spreadsheet_id = CASE WHEN ? != '' THEN ? ELSE spreadsheet_id END,
             parent_folder_id = CASE WHEN ? != '' THEN ? ELSE parent_folder_id END,
             title = ?,
             status = ?,
             updated_at = ?
         WHERE resource_id = ?`
      )
      .bind(
        params.driveFileId || '',
        params.driveFileId || '',
        params.spreadsheetId || '',
        params.spreadsheetId || '',
        params.parentFolderId || '',
        params.parentFolderId || '',
        params.title,
        status,
        nowIso,
        existing.resource_id
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO workspace_resources (
           resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
           drive_file_id, spreadsheet_id, parent_folder_id, title, status, created_at, updated_at
         ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        makeResourceId(),
        params.ownerId,
        params.orgId,
        params.siteId || null,
        params.resourceKind,
        params.resourceKey,
        params.driveFileId || '',
        params.spreadsheetId || '',
        params.parentFolderId || '',
        params.title,
        status,
        nowIso,
        nowIso
      )
      .run();
  }
}

export async function readProjectWorkspaceResources(
  db: D1Database,
  projectId: string
): Promise<WorkspaceResourceRecord[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM workspace_resources WHERE project_id = ? AND status != 'archived' ORDER BY created_at ASC`
    )
    .bind(projectId)
    .all<WorkspaceResourceRecord>();
  return rows.results || [];
}

/**
 * Idempotently provisions and persists the isolated Drive folder hierarchy:
 *   Builly/{org_slug}/{project_slug}/{Config/{Draft,Published}, Data/{CMS,Inbox}, Assets, Exports}
 * Reuses persisted D1 workspace_resources IDs so duplicate folders are never created,
 * and never modifies or deletes legacy Builly/Sites/* folders.
 */
export async function ensureProjectDriveTree(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  options?: { verifyRemote?: boolean }
): Promise<ProjectDriveTreeResult> {
  const { project } = await requireProjectAccess(env.DB, projectId, session.ownerId, [
    'owner',
    'admin',
    'editor',
  ]);

  const org = await env.DB.prepare(`SELECT * FROM organizations WHERE org_id = ? LIMIT 1`)
    .bind(project.org_id)
    .first<OrganizationRecord>();

  if (!org) {
    throw new HierarchyServiceError('Parent organization not found.', 404, 'ORG_NOT_FOUND');
  }

  let accessToken: string;
  try {
    const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
    accessToken = minted.accessToken;
  } catch (err) {
    const code = err instanceof Error ? err.message : 'WORKSPACE_REAUTH_REQUIRED';
    throw new HierarchyServiceError(
      code === 'WORKSPACE_REAUTH_REQUIRED'
        ? 'Connect or re-authorize your Google Workspace account first.'
        : 'Unable to mint server-side Google Workspace access token.',
      401,
      code
    );
  }

  let createdFoldersCount = 0;

  // 1. Resolve or create Builly root folder (reusing adopted builly_root if present)
  const existingRootRow = await env.DB.prepare(
    `SELECT drive_file_id FROM workspace_resources
     WHERE org_id = ? AND project_id IS NULL AND resource_kind = 'builly_root' AND resource_key = 'default'
     LIMIT 1`
  )
    .bind(org.org_id)
    .first<{ drive_file_id: string }>();

  let rootFolderId = existingRootRow?.drive_file_id || '';
  if (rootFolderId) {
    const ok = await verifyFolderExists(accessToken, rootFolderId);
    if (!ok) rootFolderId = '';
  }
  if (!rootFolderId) {
    const ensured = await ensureFolderSegment(accessToken, null, 'Builly');
    rootFolderId = ensured.id;
    if (ensured.created) createdFoldersCount++;
    await upsertWorkspaceResource(env.DB, {
      ownerId: org.owner_id,
      orgId: org.org_id,
      projectId: null,
      resourceKind: 'builly_root',
      resourceKey: 'default',
      driveFileId: rootFolderId,
      title: 'Builly',
    });
  }

  // 2. Resolve or create Organization folder: Builly/{org_slug}
  const existingOrgRow = await env.DB.prepare(
    `SELECT drive_file_id FROM workspace_resources
     WHERE org_id = ? AND project_id IS NULL AND resource_kind = 'org_root' AND resource_key = 'default'
     LIMIT 1`
  )
    .bind(org.org_id)
    .first<{ drive_file_id: string }>();

  let orgFolderId = existingOrgRow?.drive_file_id || '';
  if (orgFolderId) {
    const ok = await verifyFolderExists(accessToken, orgFolderId);
    if (!ok) orgFolderId = '';
  }
  if (!orgFolderId) {
    const ensured = await ensureFolderSegment(accessToken, rootFolderId, org.org_slug);
    orgFolderId = ensured.id;
    if (ensured.created) createdFoldersCount++;
    await upsertWorkspaceResource(env.DB, {
      ownerId: org.owner_id,
      orgId: org.org_id,
      projectId: null,
      resourceKind: 'org_root',
      resourceKey: 'default',
      driveFileId: orgFolderId,
      parentFolderId: rootFolderId,
      title: org.org_slug,
    });
    await env.DB.prepare(
      `UPDATE organizations SET drive_folder_id = ?, updated_at = ? WHERE org_id = ?`
    )
      .bind(orgFolderId, new Date().toISOString(), org.org_id)
      .run();
  }

  // 3. Load cached project resources so subsequent calls avoid duplicate Drive lookups
  const existingProjResources = await readProjectWorkspaceResources(env.DB, projectId);
  const byKind = new Map<string, WorkspaceResourceRecord>();
  for (const r of existingProjResources) {
    if (r.resource_key === 'default' && r.drive_file_id) {
      byKind.set(r.resource_kind, r);
    }
  }

  const resolveProjectFolder = async (
    kind: ProjectDriveFolderKind,
    parentId: string,
    folderName: string
  ): Promise<string> => {
    const cached = byKind.get(kind);
    if (cached?.drive_file_id) {
      if (!options?.verifyRemote) {
        return cached.drive_file_id;
      }
      const ok = await verifyFolderExists(accessToken, cached.drive_file_id);
      if (ok) return cached.drive_file_id;
    }

    const ensured = await ensureFolderSegment(accessToken, parentId, folderName);
    if (ensured.created) createdFoldersCount++;
    await upsertWorkspaceResource(env.DB, {
      ownerId: project.owner_id,
      orgId: project.org_id,
      projectId: project.project_id,
      resourceKind: kind,
      resourceKey: 'default',
      driveFileId: ensured.id,
      parentFolderId: parentId,
      title: folderName,
    });
    return ensured.id;
  };

  // Check if cached project_root still exists in Drive when not doing full remote check
  const cachedProjRoot = byKind.get('project_root')?.drive_file_id || project.drive_folder_id;
  if (cachedProjRoot && !(await verifyFolderExists(accessToken, cachedProjRoot))) {
    byKind.clear();
  }

  const projectFolderId = await resolveProjectFolder('project_root', orgFolderId, project.project_slug);
  if (project.drive_folder_id !== projectFolderId) {
    await env.DB.prepare(`UPDATE projects SET drive_folder_id = ?, updated_at = ? WHERE project_id = ?`)
      .bind(projectFolderId, new Date().toISOString(), projectId)
      .run();
  }

  const configRootId = await resolveProjectFolder('config_root', projectFolderId, 'Config');
  const configDraftId = await resolveProjectFolder('config_draft', configRootId, 'Draft');
  const configPublishedId = await resolveProjectFolder('config_published', configRootId, 'Published');
  const dataRootId = await resolveProjectFolder('data_root', projectFolderId, 'Data');
  const dataCmsId = await resolveProjectFolder('data_cms', dataRootId, 'CMS');
  const dataInboxId = await resolveProjectFolder('data_inbox', dataRootId, 'Inbox');
  const assetsRootId = await resolveProjectFolder('assets_root', projectFolderId, 'Assets');
  const exportsRootId = await resolveProjectFolder('exports_root', projectFolderId, 'Exports');

  const updatedResources = await readProjectWorkspaceResources(env.DB, projectId);

  return {
    rootFolderId,
    orgFolderId,
    projectFolderId,
    folders: {
      project_root: projectFolderId,
      config_root: configRootId,
      config_draft: configDraftId,
      config_published: configPublishedId,
      data_root: dataRootId,
      data_cms: dataCmsId,
      data_inbox: dataInboxId,
      assets_root: assetsRootId,
      exports_root: exportsRootId,
    },
    resources: updatedResources,
    createdFoldersCount,
  };
}

export async function listFilesInFolder(
  accessToken: string,
  folderId: string
): Promise<
  Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }>
> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const data = await driveJson<{
    files?: Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }>;
  }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=modifiedTime%20desc&pageSize=100`,
    accessToken
  );
  return data.files || [];
}

export async function readJsonFileById(accessToken: string, fileId: string): Promise<unknown> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new HierarchyServiceError(
      `Unable to read Drive JSON file (${res.status}).`,
      res.status === 404 ? 404 : 502,
      'DRIVE_READ_FAILED'
    );
  }
  return res.json();
}

export async function writeJsonFileInFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  payload: unknown
): Promise<{ fileId: string; name: string; modifiedTime?: string }> {
  const escaped = fileName.replace(/'/g, "\\'");
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${escaped}' and trashed = false`);
  const existing = await driveJson<{ files?: Array<{ id: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=2`,
    accessToken
  );
  const existingId = existing.files?.[0]?.id;

  const metadata = existingId
    ? { name: fileName }
    : { name: fileName, mimeType: 'application/json', parents: [folderId] };
  const boundary = `builly_json_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(payload)}\r\n--${boundary}--`;

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        existingId
      )}?uploadType=multipart&fields=id,name,modifiedTime`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';

  const saved = await driveJson<{ id: string; name: string; modifiedTime?: string }>(
    url,
    accessToken,
    {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );

  return {
    fileId: saved.id,
    name: saved.name || fileName,
    modifiedTime: saved.modifiedTime,
  };
}
