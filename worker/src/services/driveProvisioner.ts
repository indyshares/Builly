import { VerifiedSession, WorkerEnv } from '../types';
import {
  DRIVE_FOLDER_MIME,
  driveFetchWithRetry,
  driveJsonChecked,
  ensureMarkerFolder,
  findBuillyRootCandidates,
  findDriveChildren,
  getDriveFileMeta,
  readDriveJsonWithConcurrency,
  verifyDriveParent,
  writeCanonicalDriveJson,
} from './driveCanonicalClient';
import { mintOwnerGoogleAccessToken } from './googleTokenVault';
import { generateOperationId } from './operationJournalService';
import { BuillyTransactionError } from './transactionErrors';
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
  | 'config_sites'
  | 'data_root'
  | 'data_cms'
  | 'data_inbox'
  | 'assets_root'
  | 'exports_root';

export interface ProjectDriveTreeResult {
  rootFolderId: string;
  organizationsFolderId: string;
  orgFolderId: string;
  orgProjectsFolderId: string;
  projectFolderId: string;
  folders: Record<ProjectDriveFolderKind, string>;
  resources: WorkspaceResourceRecord[];
  createdFoldersCount: number;
}

export async function driveJson<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  return driveJsonChecked<T>(url, accessToken, init);
}

async function verifyFolderExists(accessToken: string, folderId: string): Promise<boolean> {
  if (!folderId) return false;
  try {
    const meta = await getDriveFileMeta(accessToken, folderId);
    return Boolean(meta.id && !meta.trashed && meta.mimeType === DRIVE_FOLDER_MIME);
  } catch (err) {
    if (err instanceof BuillyTransactionError && err.code === 'DRIVE_PERMISSION_DENIED') {
      throw err;
    }
    return false;
  }
}

export async function ensureFolderSegment(
  accessToken: string,
  parentId: string | null,
  name: string,
  options?: {
    operationId?: string;
    resourceId?: string;
    resourceType?: string;
    knownFolderId?: string;
  }
): Promise<{ id: string; created: boolean }> {
  const effectiveParentId = parentId || 'root';
  const res = await ensureMarkerFolder(accessToken, {
    parentId: effectiveParentId,
    name,
    knownFolderId: options?.knownFolderId,
    operationId: options?.operationId,
    appProperties: {
      ...(options?.operationId ? { operation_id: options.operationId } : {}),
      ...(options?.resourceId ? { resource_id: options.resourceId } : {}),
      ...(options?.resourceType ? { resource_type: options.resourceType } : {}),
      schema_version: '1',
    },
  });
  return { id: res.folder.id, created: res.created };
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
    canonicalRevision?: number;
    lastOperationId?: string;
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const status = params.status || 'active';

  if (params.projectId) {
    await db
      .prepare(
        `INSERT INTO workspace_resources (
           resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
           drive_file_id, spreadsheet_id, parent_folder_id, title, status,
           canonical_revision, last_operation_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_id, project_id, resource_kind, resource_key) DO UPDATE SET
           drive_file_id = CASE WHEN excluded.drive_file_id != '' THEN excluded.drive_file_id ELSE workspace_resources.drive_file_id END,
           spreadsheet_id = CASE WHEN excluded.spreadsheet_id != '' THEN excluded.spreadsheet_id ELSE workspace_resources.spreadsheet_id END,
           parent_folder_id = CASE WHEN excluded.parent_folder_id != '' THEN excluded.parent_folder_id ELSE workspace_resources.parent_folder_id END,
           title = excluded.title,
           status = excluded.status,
           canonical_revision = excluded.canonical_revision,
           last_operation_id = excluded.last_operation_id,
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
        params.canonicalRevision ?? 1,
        params.lastOperationId || '',
        nowIso,
        nowIso
      )
      .run();
    return;
  }

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
             canonical_revision = ?,
             last_operation_id = ?,
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
        params.canonicalRevision ?? 1,
        params.lastOperationId || '',
        nowIso,
        existing.resource_id
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO workspace_resources (
           resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
           drive_file_id, spreadsheet_id, parent_folder_id, title, status,
           canonical_revision, last_operation_id, created_at, updated_at
         ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        params.canonicalRevision ?? 1,
        params.lastOperationId || '',
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
 * Idempotently provisions and verifies the canonical Drive folder hierarchy:
 *   My Drive/Builly/Organizations/{org_id}/Projects/{project_id}/{Config/{Draft,Published,Sites}, Data/{CMS,Inbox}, Assets, Exports}
 * Reuses persisted Drive IDs safely (including legacy Builly/{org_slug}/{project_slug} trees already bound by folder_id)
 * and verifies actual parent folder IDs + rejects duplicate folder candidates.
 */
export async function ensureProjectDriveTree(
  env: WorkerEnv,
  session: VerifiedSession,
  projectId: string,
  options?: { verifyRemote?: boolean; operationId?: string; accessTokenOverride?: string }
): Promise<ProjectDriveTreeResult> {
  const operationId = options?.operationId || generateOperationId('op_drv');
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

  let accessToken = options?.accessTokenOverride || '';
  if (!accessToken) {
    try {
      const minted = await mintOwnerGoogleAccessToken(env, org.owner_id || session.ownerId);
      accessToken = minted.accessToken;
    } catch {
      throw new BuillyTransactionError(
        'WRITE_DISABLED_OAUTH_UNAVAILABLE',
        'Google Workspace connection is unavailable. Writes are disabled until you reconnect.',
        { operationId, status: 401, retryable: false }
      );
    }
  }

  let createdFoldersCount = 0;

  // 1. Resolve or create Builly root using trusted marker discovery (never pick files[0] on duplicates)
  const existingRootRow = await env.DB.prepare(
    `SELECT drive_file_id FROM workspace_resources
     WHERE owner_id = ? AND resource_kind = 'builly_root' AND resource_key = 'default'
     LIMIT 1`
  )
    .bind(org.owner_id)
    .first<{ drive_file_id: string }>();

  let rootFolderId = existingRootRow?.drive_file_id || '';
  if (rootFolderId && !(await verifyFolderExists(accessToken, rootFolderId))) {
    rootFolderId = '';
  }

  if (!rootFolderId) {
    const candidates = await findBuillyRootCandidates(accessToken, operationId);
    if (candidates.length > 1) {
      throw new BuillyTransactionError(
        'DUPLICATE_RESOURCE_CANDIDATES',
        'Multiple "Builly" root folders found in Drive. Confirm which root folder to use.',
        {
          operationId,
          details: {
            needsReconciliation: true,
            candidates: candidates.map((c) => ({ id: c.id, name: c.name, parents: c.parents })),
          },
        }
      );
    }
    if (candidates.length === 1) {
      rootFolderId = candidates[0].id;
    } else {
      const createdRoot = await ensureMarkerFolder(accessToken, {
        parentId: 'root',
        name: 'Builly',
        operationId,
        appProperties: {
          builly_root: 'true',
          operation_id: operationId,
          resource_id: org.owner_id,
          resource_type: 'builly_root',
          schema_version: '1',
        },
      });
      rootFolderId = createdRoot.folder.id;
      if (createdRoot.created) createdFoldersCount += 1;
    }

    await upsertWorkspaceResource(env.DB, {
      ownerId: org.owner_id,
      orgId: org.org_id,
      projectId: null,
      resourceKind: 'builly_root',
      resourceKey: 'default',
      driveFileId: rootFolderId,
      title: 'Builly',
      lastOperationId: operationId,
    });
  }

  // 2. Resolve or create Organizations/ container under Builly root
  const existingOrgsContainer = await env.DB.prepare(
    `SELECT drive_file_id FROM workspace_resources
     WHERE owner_id = ? AND resource_kind = 'organizations_folder' AND resource_key = 'default'
     LIMIT 1`
  )
    .bind(org.owner_id)
    .first<{ drive_file_id: string }>();

  const orgsContainer = await ensureMarkerFolder(accessToken, {
    parentId: rootFolderId,
    name: 'Organizations',
    knownFolderId: existingOrgsContainer?.drive_file_id || undefined,
    operationId,
    appProperties: {
      operation_id: operationId,
      resource_id: `${org.owner_id}:organizations`,
      resource_type: 'organizations_folder',
      schema_version: '1',
    },
  });
  if (orgsContainer.created) createdFoldersCount += 1;
  await upsertWorkspaceResource(env.DB, {
    ownerId: org.owner_id,
    orgId: org.org_id,
    projectId: null,
    resourceKind: 'organizations_folder',
    resourceKey: 'default',
    driveFileId: orgsContainer.folder.id,
    parentFolderId: rootFolderId,
    title: 'Organizations',
    lastOperationId: operationId,
  });

  // 3. Resolve or create Organization folder: Organizations/{org_id}
  const existingOrgRow = await env.DB.prepare(
    `SELECT drive_file_id FROM workspace_resources
     WHERE org_id = ? AND project_id IS NULL AND resource_kind = 'org_root' AND resource_key = 'default'
     LIMIT 1`
  )
    .bind(org.org_id)
    .first<{ drive_file_id: string }>();

  let orgFolderId = existingOrgRow?.drive_file_id || org.drive_folder_id || '';
  if (orgFolderId && !(await verifyFolderExists(accessToken, orgFolderId))) {
    orgFolderId = '';
  }
  if (!orgFolderId) {
    const ensuredOrg = await ensureMarkerFolder(accessToken, {
      parentId: orgsContainer.folder.id,
      name: org.org_id,
      operationId,
      appProperties: {
        operation_id: operationId,
        resource_id: org.org_id,
        resource_type: 'org_root',
        org_id: org.org_id,
        schema_version: '1',
      },
    });
    orgFolderId = ensuredOrg.folder.id;
    if (ensuredOrg.created) createdFoldersCount += 1;
    await upsertWorkspaceResource(env.DB, {
      ownerId: org.owner_id,
      orgId: org.org_id,
      projectId: null,
      resourceKind: 'org_root',
      resourceKey: 'default',
      driveFileId: orgFolderId,
      parentFolderId: orgsContainer.folder.id,
      title: org.org_id,
      lastOperationId: operationId,
    });
    await env.DB.prepare(
      `UPDATE organizations SET drive_folder_id = ?, updated_at = ? WHERE org_id = ?`
    )
      .bind(orgFolderId, new Date().toISOString(), org.org_id)
      .run();
  }

  // 4. Ensure Projects/ container inside Organization folder
  const orgProjectsFolder = await ensureMarkerFolder(accessToken, {
    parentId: orgFolderId,
    name: 'Projects',
    operationId,
    appProperties: {
      operation_id: operationId,
      resource_id: `${org.org_id}:projects`,
      resource_type: 'org_projects_folder',
      org_id: org.org_id,
      schema_version: '1',
    },
  });
  if (orgProjectsFolder.created) createdFoldersCount += 1;

  // 5. Load cached project resources so subsequent calls reuse persisted Drive IDs safely
  const existingProjResources = await readProjectWorkspaceResources(env.DB, projectId);
  const byKind = new Map<string, WorkspaceResourceRecord>();
  for (const r of existingProjResources) {
    if (r.resource_key === 'default' && r.drive_file_id) {
      byKind.set(r.resource_kind, r);
    }
  }

  const cachedProjRoot = byKind.get('project_root')?.drive_file_id || project.drive_folder_id;
  if (cachedProjRoot && !(await verifyFolderExists(accessToken, cachedProjRoot))) {
    byKind.clear();
  }

  const resolveProjectFolder = async (
    kind: ProjectDriveFolderKind,
    parentId: string,
    folderName: string,
    resourceKeyId: string
  ): Promise<string> => {
    const cached = byKind.get(kind);
    if (cached?.drive_file_id) {
      if (!options?.verifyRemote) {
        return cached.drive_file_id;
      }
      const verified = await verifyDriveParent(
        accessToken,
        cached.drive_file_id,
        parentId,
        operationId
      ).catch((err) => {
        if (err instanceof BuillyTransactionError && err.code === 'PARENT_MISMATCH') {
          throw err;
        }
        return null;
      });
      if (verified) return verified.id;
    }

    const ensured = await ensureMarkerFolder(accessToken, {
      parentId,
      name: folderName,
      operationId,
      appProperties: {
        operation_id: operationId,
        resource_id: resourceKeyId,
        resource_type: kind,
        org_id: org.org_id,
        project_id: project.project_id,
        schema_version: '1',
      },
    });
    if (ensured.created) createdFoldersCount += 1;

    await upsertWorkspaceResource(env.DB, {
      ownerId: project.owner_id,
      orgId: project.org_id,
      projectId: project.project_id,
      resourceKind: kind,
      resourceKey: 'default',
      driveFileId: ensured.folder.id,
      parentFolderId: parentId,
      title: folderName,
      lastOperationId: operationId,
    });
    return ensured.folder.id;
  };

  // Use project.project_id under Organizations/{org_id}/Projects/ for newly provisioned project root
  const projectFolderId =
    byKind.get('project_root')?.drive_file_id ||
    (project.drive_folder_id && (await verifyFolderExists(accessToken, project.drive_folder_id))
      ? project.drive_folder_id
      : await resolveProjectFolder(
          'project_root',
          orgProjectsFolder.folder.id,
          project.project_id,
          project.project_id
        ));

  if (!byKind.get('project_root')?.drive_file_id) {
    await upsertWorkspaceResource(env.DB, {
      ownerId: project.owner_id,
      orgId: project.org_id,
      projectId: project.project_id,
      resourceKind: 'project_root',
      resourceKey: 'default',
      driveFileId: projectFolderId,
      parentFolderId: orgProjectsFolder.folder.id,
      title: project.project_id,
      lastOperationId: operationId,
    });
  }

  if (project.drive_folder_id !== projectFolderId) {
    await env.DB.prepare(`UPDATE projects SET drive_folder_id = ?, updated_at = ? WHERE project_id = ?`)
      .bind(projectFolderId, new Date().toISOString(), projectId)
      .run();
  }

  const configRootId = await resolveProjectFolder(
    'config_root',
    projectFolderId,
    'Config',
    `${projectId}:config`
  );
  const configDraftId = await resolveProjectFolder(
    'config_draft',
    configRootId,
    'Draft',
    `${projectId}:config_draft`
  );
  const configPublishedId = await resolveProjectFolder(
    'config_published',
    configRootId,
    'Published',
    `${projectId}:config_published`
  );
  const configSitesId = await resolveProjectFolder(
    'config_sites',
    configRootId,
    'Sites',
    `${projectId}:config_sites`
  );
  const dataRootId = await resolveProjectFolder(
    'data_root',
    projectFolderId,
    'Data',
    `${projectId}:data`
  );
  const dataCmsId = await resolveProjectFolder(
    'data_cms',
    dataRootId,
    'CMS',
    `${projectId}:data_cms`
  );
  const dataInboxId = await resolveProjectFolder(
    'data_inbox',
    dataRootId,
    'Inbox',
    `${projectId}:data_inbox`
  );
  const assetsRootId = await resolveProjectFolder(
    'assets_root',
    projectFolderId,
    'Assets',
    `${projectId}:assets`
  );
  const exportsRootId = await resolveProjectFolder(
    'exports_root',
    projectFolderId,
    'Exports',
    `${projectId}:exports`
  );

  const updatedResources = await readProjectWorkspaceResources(env.DB, projectId);

  return {
    rootFolderId,
    organizationsFolderId: orgsContainer.folder.id,
    orgFolderId,
    orgProjectsFolderId: orgProjectsFolder.folder.id,
    projectFolderId,
    folders: {
      project_root: projectFolderId,
      config_root: configRootId,
      config_draft: configDraftId,
      config_published: configPublishedId,
      config_sites: configSitesId,
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
  Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string; parents?: string[] }>
> {
  const children = await findDriveChildren(accessToken, { parentId: folderId });
  return children.map((c) => ({
    id: c.id,
    name: c.name,
    mimeType: c.mimeType,
    modifiedTime: c.modifiedTime,
    parents: c.parents,
  }));
}

export async function readJsonFileById(accessToken: string, fileId: string): Promise<unknown> {
  const res = await driveFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken
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
  payload: unknown,
  options?: {
    operationId?: string;
    resourceId?: string;
    resourceType?: string;
    knownFileId?: string;
    expectedRevision?: number;
    expectedEtag?: string;
  }
): Promise<{ fileId: string; name: string; modifiedTime?: string }> {
  const saved = await writeCanonicalDriveJson(accessToken, {
    parentId: folderId,
    fileName,
    payload: payload as Record<string, unknown>,
    knownFileId: options?.knownFileId,
    expectedRevision: options?.expectedRevision,
    expectedEtag: options?.expectedEtag,
    operationId: options?.operationId,
    appProperties: {
      ...(options?.operationId ? { operation_id: options.operationId } : {}),
      ...(options?.resourceId ? { resource_id: options.resourceId } : {}),
      ...(options?.resourceType ? { resource_type: options.resourceType } : {}),
      schema_version: '1',
    },
  });

  return {
    fileId: saved.fileId,
    name: saved.name,
    modifiedTime: saved.meta.modifiedTime,
  };
}

export { verifyDriveParent, readDriveJsonWithConcurrency };
