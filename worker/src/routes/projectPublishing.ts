import {
  ensureProjectDriveTree,
  upsertWorkspaceResource,
  writeJsonFileInFolder,
} from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import {
  HierarchyServiceError,
  requireProjectAccess,
} from '../services/workspaceHierarchyService';
import { VerifiedSession, WorkerEnv } from '../types';

export interface ProjectReleaseHistoryRow {
  id: string;
  site_id: string;
  site_slug: string;
  owner_id: string;
  publish_version: string;
  build_id: string;
  runtime_config_drive_file_id: string;
  publish_manifest_drive_file_id: string;
  integrity_hash: string;
  schema_version: number;
  commit_message: string;
  created_at: string;
}

function mapPublishingError(err: unknown): Response {
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'PROJECT_PUBLISHING_ERROR';
  const status = code === 'WORKSPACE_REAUTH_REQUIRED' ? 401 : 500;
  return Response.json(
    {
      error:
        code === 'WORKSPACE_REAUTH_REQUIRED'
          ? 'Google Workspace connection or reauthorization is required.'
          : err instanceof Error
          ? err.message
          : 'Project publishing request failed.',
      code,
    },
    { status }
  );
}

export async function handleListProjectReleases(
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
      `SELECT site_id, site_slug, site_name, status, active_publish_version, active_build_id
       FROM sites WHERE project_id = ? ORDER BY created_at ASC`
    )
      .bind(projectId)
      .all<{
        site_id: string;
        site_slug: string;
        site_name: string;
        status: string;
        active_publish_version: string;
        active_build_id: string;
      }>();

    const projectSites = sitesRows.results || [];
    const releases: ProjectReleaseHistoryRow[] = [];

    for (const s of projectSites) {
      const relRows = await env.DB.prepare(
        `SELECT * FROM site_release_history WHERE site_id = ? ORDER BY created_at DESC LIMIT 30`
      )
        .bind(s.site_id)
        .all<ProjectReleaseHistoryRow>();
      releases.push(...(relRows.results || []));
    }

    releases.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    return Response.json({
      ok: true,
      projectId,
      sites: projectSites,
      releases,
    });
  } catch (err) {
    return mapPublishingError(err);
  }
}

export async function handleSaveProjectExport(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    fileName?: string;
    manifest?: Record<string, unknown>;
    snapshot?: Record<string, unknown>;
  };

  if (!body.manifest || typeof body.manifest !== 'object') {
    return Response.json(
      { error: 'Export manifest payload is required.', code: 'INVALID_EXPORT_PAYLOAD' },
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

    const safeFileName = (
      body.fileName ||
      `${access.project.project_slug}-export-${Date.now().toString(36)}.json`
    )
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 120);

    const saved = await writeJsonFileInFolder(accessToken, tree.folders.exports_root, safeFileName, {
      exportedAt: new Date().toISOString(),
      projectId,
      orgId: access.project.org_id,
      manifest: body.manifest,
      ...(body.snapshot ? { snapshot: body.snapshot } : {}),
    });

    await upsertWorkspaceResource(env.DB, {
      ownerId: access.project.owner_id,
      orgId: access.project.org_id,
      projectId,
      resourceKind: 'export_archive',
      resourceKey: safeFileName,
      driveFileId: saved.fileId,
      parentFolderId: tree.folders.exports_root,
      title: safeFileName,
    });

    return Response.json({
      ok: true,
      projectId,
      folderId: tree.folders.exports_root,
      fileId: saved.fileId,
      fileName: saved.name,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    return mapPublishingError(err);
  }
}
