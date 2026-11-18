import { requireSession } from '../middleware/requireSession';
import {
  driveJson,
  ensureProjectDriveTree,
  listFilesInFolder,
  ProjectDriveFolderKind,
  readJsonFileById,
  writeJsonFileInFolder,
} from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import {
  HierarchyServiceError,
  requireProjectAccess,
} from '../services/workspaceHierarchyService';
import { WorkerEnv } from '../types';

const ALLOWED_FOLDER_KINDS: ReadonlySet<ProjectDriveFolderKind> = new Set([
  'project_root',
  'config_root',
  'config_draft',
  'config_published',
  'data_root',
  'data_cms',
  'data_inbox',
  'assets_root',
  'exports_root',
]);

function mapError(err: unknown): Response {
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'DRIVE_ERROR';
  const status = code === 'WORKSPACE_REAUTH_REQUIRED' ? 401 : 500;
  return Response.json(
    {
      error:
        code === 'WORKSPACE_REAUTH_REQUIRED'
          ? 'Google Workspace reauthorization required.'
          : err instanceof Error
          ? err.message
          : 'Drive request failed.',
      code,
    },
    { status }
  );
}

export async function handleDriveVerifyFile(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const url = new URL(request.url);
  const fileId = url.searchParams.get('fileId')?.trim();
  if (!fileId) {
    return Response.json({ error: 'Missing fileId parameter.' }, { status: 400 });
  }

  try {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}?fields=id,name,mimeType,capabilities(canEdit,canShare)`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!metaRes.ok) {
      return Response.json(
        { error: 'Unable to access Drive file for this Builly owner.', code: 'DRIVE_ACCESS_DENIED' },
        { status: metaRes.status }
      );
    }
    const meta = await metaRes.json();
    return Response.json({ file: meta });
  } catch (err) {
    return mapError(err);
  }
}

export async function handleProvisionProjectDrive(
  request: Request,
  env: WorkerEnv,
  projectId: string
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  try {
    const body = (await request.json().catch(() => ({}))) as { verifyRemote?: boolean };
    const result = await ensureProjectDriveTree(env, session, projectId, {
      verifyRemote: Boolean(body.verifyRemote),
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return mapError(err);
  }
}

export async function handleListProjectDriveFiles(
  request: Request,
  env: WorkerEnv,
  projectId: string
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const url = new URL(request.url);
  const folderKind = (url.searchParams.get('folderKind') || 'project_root') as ProjectDriveFolderKind;
  if (!ALLOWED_FOLDER_KINDS.has(folderKind)) {
    return Response.json({ error: 'Invalid folderKind parameter.', code: 'INVALID_FOLDER_KIND' }, { status: 400 });
  }

  try {
    await requireProjectAccess(env.DB, projectId, session.ownerId, ['owner', 'admin', 'editor', 'viewer']);
    const folderRow = await env.DB.prepare(
      `SELECT drive_file_id FROM workspace_resources
       WHERE project_id = ? AND resource_kind = ? AND resource_key = 'default' AND status = 'active'
       LIMIT 1`
    )
      .bind(projectId, folderKind)
      .first<{ drive_file_id: string }>();

    if (!folderRow?.drive_file_id) {
      return Response.json(
        {
          error: 'Project Drive folders are not provisioned yet.',
          code: 'DRIVE_NOT_PROVISIONED',
          folderKind,
        },
        { status: 409 }
      );
    }

    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const files = await listFilesInFolder(accessToken, folderRow.drive_file_id);
    return Response.json({
      ok: true,
      projectId,
      folderKind,
      folderId: folderRow.drive_file_id,
      files,
    });
  } catch (err) {
    return mapError(err);
  }
}

export async function handleReadProjectDriveJson(
  request: Request,
  env: WorkerEnv,
  projectId: string
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const url = new URL(request.url);
  const fileId = url.searchParams.get('fileId')?.trim();
  const folderKind = (url.searchParams.get('folderKind') || 'config_draft') as ProjectDriveFolderKind;
  const fileName = url.searchParams.get('fileName')?.trim();

  try {
    await requireProjectAccess(env.DB, projectId, session.ownerId, ['owner', 'admin', 'editor', 'viewer']);
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);

    const projectFolderRows = await env.DB.prepare(
      `SELECT drive_file_id, resource_kind FROM workspace_resources
       WHERE project_id = ? AND drive_file_id != '' AND status = 'active'`
    )
      .bind(projectId)
      .all<{ drive_file_id: string; resource_kind: string }>();

    const allowedFolderIds = new Set((projectFolderRows.results || []).map((r) => r.drive_file_id));

    if (fileId) {
      // Verify file belongs to a provisioned folder of this project (prevents arbitrary Drive reads)
      const meta = await driveJson<{ id: string; name: string; parents?: string[]; trashed?: boolean }>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          fileId
        )}?fields=id,name,parents,trashed`,
        accessToken
      );
      if (meta.trashed || !meta.parents?.some((p) => allowedFolderIds.has(p))) {
        return Response.json(
          { error: 'Requested file does not belong to this Project.', code: 'DRIVE_SCOPE_FORBIDDEN' },
          { status: 403 }
        );
      }
      const data = await readJsonFileById(accessToken, meta.id);
      return Response.json({ ok: true, fileId: meta.id, name: meta.name, data });
    }

    if (!ALLOWED_FOLDER_KINDS.has(folderKind) || !fileName || fileName.includes('/')) {
      return Response.json({ error: 'Provide either fileId or valid folderKind and fileName.' }, { status: 400 });
    }

    const folderRow = (projectFolderRows.results || []).find((r) => r.resource_kind === folderKind);
    if (!folderRow?.drive_file_id) {
      return Response.json(
        { error: 'Project Drive folder is not provisioned yet.', code: 'DRIVE_NOT_PROVISIONED' },
        { status: 409 }
      );
    }

    const files = await listFilesInFolder(accessToken, folderRow.drive_file_id);
    const match = files.find((f) => f.name === fileName);
    if (!match) {
      return Response.json({ error: `File "${fileName}" not found.`, code: 'DRIVE_FILE_NOT_FOUND' }, { status: 404 });
    }

    const data = await readJsonFileById(accessToken, match.id);
    return Response.json({ ok: true, fileId: match.id, name: match.name, data });
  } catch (err) {
    return mapError(err);
  }
}

export async function handleWriteProjectDriveJson(
  request: Request,
  env: WorkerEnv,
  projectId: string
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const body = (await request.json().catch(() => ({}))) as {
    folderKind?: ProjectDriveFolderKind;
    fileName?: string;
    payload?: unknown;
  };

  const folderKind = (body.folderKind || 'config_draft') as ProjectDriveFolderKind;
  const fileName = (body.fileName || '').trim();
  if (!ALLOWED_FOLDER_KINDS.has(folderKind)) {
    return Response.json({ error: 'Invalid folderKind.', code: 'INVALID_FOLDER_KIND' }, { status: 400 });
  }
  if (!fileName || fileName.includes('/') || fileName.includes('..') || !fileName.endsWith('.json')) {
    return Response.json(
      { error: 'fileName must be a safe .json filename without path separators.', code: 'INVALID_FILENAME' },
      { status: 400 }
    );
  }
  if (body.payload === undefined) {
    return Response.json({ error: 'Missing JSON payload.', code: 'MISSING_PAYLOAD' }, { status: 400 });
  }

  try {
    const tree = await ensureProjectDriveTree(env, session, projectId);
    const folderId = tree.folders[folderKind];
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const saved = await writeJsonFileInFolder(accessToken, folderId, fileName, body.payload);

    return Response.json({
      ok: true,
      projectId,
      folderKind,
      folderId,
      fileId: saved.fileId,
      name: saved.name,
      modifiedTime: saved.modifiedTime || new Date().toISOString(),
    });
  } catch (err) {
    return mapError(err);
  }
}
