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

const ASSETS_MANIFEST_FILENAME = 'assets-manifest.json';
const MAX_ASSET_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'font/woff',
  'font/woff2',
  'application/pdf',
]);

const CATEGORY_FOLDER_LABELS: Record<string, string> = {
  images: 'Images',
  logos: 'Logos',
  icons: 'Icons',
  'video-audio': 'Media',
  fonts: 'Fonts',
  documents: 'Documents',
  other: 'Other',
};

export interface StoredAssetManifestEntry {
  id: string;
  name: string;
  size: string;
  bytes?: number;
  type: string;
  mimeType: string;
  category: string;
  dimensions?: { width: number; height: number };
  altText?: string;
  svgSanitized?: boolean;
  svgMarkup?: string;
  sourceOrigin?: string;
  licenseNote?: string;
  tags?: string[];
  driveFileId: string;
  driveFolder: string;
  createdAt: string;
  updatedAt?: string;
}

function mapAssetError(err: unknown): Response {
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const code = err instanceof Error ? err.message : 'PROJECT_ASSETS_ERROR';
  const status = code === 'WORKSPACE_REAUTH_REQUIRED' ? 401 : 500;
  return Response.json(
    {
      error:
        code === 'WORKSPACE_REAUTH_REQUIRED'
          ? 'Google Workspace connection or reauthorization is required.'
          : err instanceof Error
          ? err.message
          : 'Project Asset operation failed.',
      code,
    },
    { status }
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeSvgServer(rawSvg: string): { valid: boolean; sanitized?: string; error?: string } {
  const trimmed = (rawSvg || '').trim();
  if (!trimmed) return { valid: false, error: 'SVG markup is empty.' };
  if (trimmed.length > 512 * 1024) {
    return { valid: false, error: 'SVG exceeds the 512 KB safety limit.' };
  }
  const withoutProlog = trimmed
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .trim();

  if (!/<svg[\s>]/i.test(withoutProlog)) {
    return { valid: false, error: 'SVG must contain a valid <svg> root element.' };
  }
  if (/<script\b/i.test(withoutProlog) || /<foreignObject\b/i.test(withoutProlog)) {
    return { valid: false, error: 'SVG rejected: active script or foreignObject tags are disallowed.' };
  }
  if (/javascript\s*:|vbscript\s*:|data\s*:\s*text\/html/i.test(withoutProlog)) {
    return { valid: false, error: 'SVG rejected: unsafe scriptable URI schemes are disallowed.' };
  }
  if (/(?:xlink:)?href\s*=\s*["']\s*https?:/i.test(withoutProlog)) {
    return { valid: false, error: 'SVG rejected: external HTTP href references are disallowed.' };
  }
  const cleaned = withoutProlog
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();
  return { valid: true, sanitized: cleaned };
}

function decodeBase64ToUint8(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function readManifestFromDrive(
  accessToken: string,
  assetsRootFolderId: string,
  existingManifestFileId?: string
): Promise<{ fileId: string; entries: StoredAssetManifestEntry[] }> {
  let manifestFileId = existingManifestFileId || '';
  if (!manifestFileId && assetsRootFolderId) {
    const files = await listFilesInFolder(accessToken, assetsRootFolderId);
    const found = files.find((f) => f.name === ASSETS_MANIFEST_FILENAME);
    if (found?.id) manifestFileId = found.id;
  }

  if (!manifestFileId) {
    return { fileId: '', entries: [] };
  }

  try {
    const data = (await readJsonFileById(accessToken, manifestFileId)) as {
      assets?: StoredAssetManifestEntry[];
    };
    return {
      fileId: manifestFileId,
      entries: Array.isArray(data?.assets) ? data.assets : [],
    };
  } catch {
    return { fileId: manifestFileId, entries: [] };
  }
}

export async function handleListProjectAssets(
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

    const resourceRows = await env.DB.prepare(
      `SELECT resource_kind, drive_file_id, title
       FROM workspace_resources
       WHERE project_id = ? AND status = 'active'
         AND resource_kind IN ('assets_root', 'assets_manifest')`
    )
      .bind(projectId)
      .all<{ resource_kind: string; drive_file_id: string; title: string }>();

    const resources = resourceRows.results || [];
    const assetsRootId = resources.find((r) => r.resource_kind === 'assets_root')?.drive_file_id || '';
    const manifestId = resources.find((r) => r.resource_kind === 'assets_manifest')?.drive_file_id || '';

    let accessToken: string;
    try {
      const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
      accessToken = minted.accessToken;
    } catch {
      return Response.json({
        ok: true,
        projectId,
        workspaceConnected: false,
        folderId: assetsRootId,
        manifestFileId: manifestId,
        assets: [],
      });
    }

    const manifest = assetsRootId
      ? await readManifestFromDrive(accessToken, assetsRootId, manifestId)
      : { fileId: manifestId, entries: [] };

    return Response.json({
      ok: true,
      projectId,
      workspaceConnected: true,
      folderId: assetsRootId,
      manifestFileId: manifest.fileId,
      assets: manifest.entries,
    });
  } catch (err) {
    return mapAssetError(err);
  }
}

export async function handleUploadProjectAsset(
  request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    mimeType?: string;
    category?: string;
    altText?: string;
    licenseNote?: string;
    sourceOrigin?: string;
    tags?: string[];
    dimensions?: { width: number; height: number };
    base64Data?: string;
    svgMarkup?: string;
  };

  const fileName = (body.name || '').trim();
  const mimeType = (body.mimeType || '').trim().toLowerCase();

  if (!fileName || fileName.length > 180) {
    return Response.json(
      { error: 'Valid asset file name is required.', code: 'INVALID_ASSET_NAME' },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return Response.json(
      {
        error: `Unsupported MIME type "${mimeType || 'unknown'}".`,
        code: 'UNSUPPORTED_ASSET_TYPE',
      },
      { status: 400 }
    );
  }

  let fileBytes: Uint8Array;
  let sanitizedSvg: string | undefined;

  if (mimeType === 'image/svg+xml') {
    const rawSvg =
      body.svgMarkup ||
      (body.base64Data ? new TextDecoder().decode(decodeBase64ToUint8(body.base64Data)) : '');
    const check = sanitizeSvgServer(rawSvg);
    if (!check.valid || !check.sanitized) {
      return Response.json(
        { error: check.error || 'SVG failed security validation.', code: 'UNSAFE_SVG_REJECTED' },
        { status: 400 }
      );
    }
    sanitizedSvg = check.sanitized;
    fileBytes = new TextEncoder().encode(sanitizedSvg);
  } else {
    if (!body.base64Data) {
      return Response.json(
        { error: 'Binary asset base64Data payload is required.', code: 'MISSING_ASSET_DATA' },
        { status: 400 }
      );
    }
    try {
      fileBytes = decodeBase64ToUint8(body.base64Data);
    } catch {
      return Response.json(
        { error: 'Malformed base64 asset data.', code: 'INVALID_ASSET_DATA' },
        { status: 400 }
      );
    }
  }

  if (fileBytes.byteLength === 0) {
    return Response.json({ error: 'Cannot upload an empty asset.' }, { status: 400 });
  }
  if (fileBytes.byteLength > MAX_ASSET_BYTES) {
    return Response.json(
      { error: 'Asset exceeds 10 MB upload limit.', code: 'ASSET_TOO_LARGE' },
      { status: 413 }
    );
  }

  try {
    const access = await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
    ]);
    const orgRow = await env.DB.prepare(
      `SELECT org_slug FROM organizations WHERE org_id = ? LIMIT 1`
    )
      .bind(access.project.org_id)
      .first<{ org_slug: string }>();
    const orgSlug = orgRow?.org_slug || access.project.org_id;

    const tree = await ensureProjectDriveTree(env, session, projectId);
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);

    const categoryKey = CATEGORY_FOLDER_LABELS[body.category || ''] ? String(body.category) : 'other';
    const categoryFolderLabel = CATEGORY_FOLDER_LABELS[categoryKey] || 'Other';

    const categoryFolder = await ensureFolderSegment(
      accessToken,
      tree.folders.assets_root,
      categoryFolderLabel
    );

    const boundary = `builly_ast_${Date.now().toString(36)}`;
    const metadata = {
      name: fileName,
      mimeType,
      parents: [categoryFolder.id],
    };

    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata
      )}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const multipartBody = new Uint8Array(head.length + fileBytes.length + tail.length);
    multipartBody.set(head, 0);
    multipartBody.set(fileBytes, head.length);
    multipartBody.set(tail, head.length + fileBytes.length);

    const uploaded = await driveJson<{ id: string; name?: string }>(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipartBody,
      }
    );

    const nowIso = new Date().toISOString();
    const assetId = `ast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: StoredAssetManifestEntry = {
      id: assetId,
      name: fileName,
      size: formatBytes(fileBytes.byteLength),
      bytes: fileBytes.byteLength,
      type: mimeType.split('/')[0] || 'file',
      mimeType,
      category: categoryKey,
      dimensions: body.dimensions,
      altText: body.altText?.trim() || fileName.replace(/\.[^.]+$/, ''),
      svgSanitized: mimeType === 'image/svg+xml',
      svgMarkup: sanitizedSvg,
      sourceOrigin: body.sourceOrigin || 'upload',
      licenseNote: body.licenseNote?.trim() || 'User uploaded (verify usage rights)',
      tags: Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : [categoryKey],
      driveFileId: uploaded.id,
      driveFolder: `/Builly/${orgSlug}/${access.project.project_slug}/Assets/${categoryFolderLabel}`,
      createdAt: nowIso.slice(0, 10),
      updatedAt: nowIso,
    };

    const existingManifest = await readManifestFromDrive(accessToken, tree.folders.assets_root);
    const nextEntries = [entry, ...existingManifest.entries.filter((a) => a.id !== entry.id)];
    const savedManifest = await writeJsonFileInFolder(
      accessToken,
      tree.folders.assets_root,
      ASSETS_MANIFEST_FILENAME,
      {
        schemaVersion: 1,
        projectId,
        updatedAt: nowIso,
        assets: nextEntries,
      }
    );

    await upsertWorkspaceResource(env.DB, {
      ownerId: access.project.owner_id,
      orgId: access.project.org_id,
      projectId,
      resourceKind: 'assets_manifest',
      resourceKey: 'default',
      driveFileId: savedManifest.fileId,
      parentFolderId: tree.folders.assets_root,
      title: ASSETS_MANIFEST_FILENAME,
    });

    const contentUrl = sanitizedSvg
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizedSvg)}`
      : `/api/console/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(
          uploaded.id
        )}/content`;

    return Response.json(
      {
        ok: true,
        projectId,
        folderId: tree.folders.assets_root,
        manifestFileId: savedManifest.fileId,
        asset: {
          ...entry,
          url: contentUrl,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return mapAssetError(err);
  }
}

export async function handleDeleteProjectAsset(
  _request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  assetIdOrDriveId: string
): Promise<Response> {
  try {
    const access = await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
    ]);
    const tree = await ensureProjectDriveTree(env, session, projectId);
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);

    const existingManifest = await readManifestFromDrive(accessToken, tree.folders.assets_root);
    const target = existingManifest.entries.find(
      (a) => a.id === assetIdOrDriveId || a.driveFileId === assetIdOrDriveId
    );

    if (
      target?.driveFileId &&
      !target.driveFileId.startsWith('local_') &&
      !target.driveFileId.startsWith('drv_agent_')
    ) {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(target.driveFileId)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trashed: true }),
        }
      ).catch(() => undefined);
    }

    const nowIso = new Date().toISOString();
    const remaining = existingManifest.entries.filter(
      (a) => a.id !== assetIdOrDriveId && a.driveFileId !== assetIdOrDriveId
    );

    const savedManifest = await writeJsonFileInFolder(
      accessToken,
      tree.folders.assets_root,
      ASSETS_MANIFEST_FILENAME,
      {
        schemaVersion: 1,
        projectId,
        updatedAt: nowIso,
        assets: remaining,
      }
    );

    await upsertWorkspaceResource(env.DB, {
      ownerId: access.project.owner_id,
      orgId: access.project.org_id,
      projectId,
      resourceKind: 'assets_manifest',
      resourceKey: 'default',
      driveFileId: savedManifest.fileId,
      parentFolderId: tree.folders.assets_root,
      title: ASSETS_MANIFEST_FILENAME,
    });

    return Response.json({
      ok: true,
      projectId,
      deletedId: assetIdOrDriveId,
      manifestFileId: savedManifest.fileId,
    });
  } catch (err) {
    return mapAssetError(err);
  }
}

export async function handleGetProjectAssetContent(
  _request: Request,
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  driveFileId: string
): Promise<Response> {
  try {
    await requireProjectAccess(env.DB, projectId, session.ownerId, [
      'owner',
      'admin',
      'editor',
      'viewer',
    ]);

    const resourceRows = await env.DB.prepare(
      `SELECT resource_kind, drive_file_id FROM workspace_resources
       WHERE project_id = ? AND status = 'active'
         AND resource_kind IN ('assets_root', 'assets_manifest')`
    )
      .bind(projectId)
      .all<{ resource_kind: string; drive_file_id: string }>();

    const assetsRootId =
      (resourceRows.results || []).find((r) => r.resource_kind === 'assets_root')?.drive_file_id || '';
    const manifestId =
      (resourceRows.results || []).find((r) => r.resource_kind === 'assets_manifest')?.drive_file_id || '';

    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const manifest = assetsRootId
      ? await readManifestFromDrive(accessToken, assetsRootId, manifestId)
      : { fileId: '', entries: [] };

    const matched = manifest.entries.find((a) => a.driveFileId === driveFileId);
    if (!matched) {
      return Response.json(
        { error: 'Asset does not belong to this Project asset manifest.', code: 'FORBIDDEN_ASSET' },
        { status: 403 }
      );
    }

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!driveRes.ok) {
      return Response.json({ error: 'Unable to fetch asset bytes from Drive.' }, { status: driveRes.status });
    }

    const headers = new Headers();
    headers.set(
      'Content-Type',
      matched.mimeType || driveRes.headers.get('Content-Type') || 'application/octet-stream'
    );
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, max-age=300');
    if (matched.mimeType === 'image/svg+xml') {
      headers.set('Content-Security-Policy', 'sandbox');
    }

    return new Response(driveRes.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    return mapAssetError(err);
  }
}
