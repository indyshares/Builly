import { requireSession } from '../middleware/requireSession';
import { ensureProjectDriveTree } from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import {
  normalizeSlug,
  purgeSiteRuntimeCache,
  scrubSnapshotForVisitor,
  validateSiteSlug,
} from '../services/siteRegistryService';
import {
  HierarchyServiceError,
  requireOrgMembership,
  requireProjectAccess,
} from '../services/workspaceHierarchyService';
import { WorkerEnv } from '../types';

interface PublishRequestBody {
  siteId: string;
  siteSlug: string;
  siteName?: string;
  orgId?: string;
  projectId?: string;
  customDomain?: string | null;
  commitMessage?: string;
  driveFolderId?: string;
  snapshot: Record<string, unknown> & {
    schemaVersion?: number;
    runtimeMinVersion?: string;
    buildId?: string;
    publishVersion?: string;
    integrityHash?: string;
    pages?: Record<string, unknown>;
    routes?: Record<string, string>;
  };
  manifest?: Record<string, unknown>;
  formDestinations?: Array<{
    formId: string;
    formName: string;
    categoryId: string;
    destinationSpreadsheetId: string;
    destinationWorksheetName: string;
    inboxRegistrySpreadsheetId?: string;
    fieldMappings?: Record<string, string>;
    status: string;
  }>;
  datasetResources?: Array<{
    resourceId: string;
    domainKind: 'cms' | 'inbox' | 'system';
    datasetKey: string;
    spreadsheetId: string;
    worksheetName: string;
    schemaVersion?: number;
  }>;
}

async function driveJson<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Drive API ${res.status}: ${txt.slice(0, 180)}`);
  }
  return res.json() as Promise<T>;
}

async function ensureFolderSegment(
  accessToken: string,
  parentId: string | null,
  name: string
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const parentFilter = parentId ? `'${parentId}' in parents and ` : `'root' in parents and `;
  const q = encodeURIComponent(
    `${parentFilter}name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const found = await driveJson<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    accessToken
  );
  if (found.files?.[0]?.id) return found.files[0].id;

  const created = await driveJson<{ id: string }>(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    }
  );
  return created.id;
}

async function ensurePublishedBuildFolder(
  accessToken: string,
  rootFolderId: string | undefined,
  siteSlug: string,
  buildId: string
): Promise<{ rootId: string; buildFolderId: string }> {
  const rootId = rootFolderId || (await ensureFolderSegment(accessToken, null, 'Builly'));
  const sitesId = await ensureFolderSegment(accessToken, rootId, 'Sites');
  const siteId = await ensureFolderSegment(accessToken, sitesId, siteSlug);
  const configId = await ensureFolderSegment(accessToken, siteId, 'Config');
  const pubId = await ensureFolderSegment(accessToken, configId, 'Published');
  const buildFolderId = await ensureFolderSegment(accessToken, pubId, buildId);
  return { rootId, buildFolderId };
}

async function uploadJsonToFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  payload: unknown
): Promise<string> {
  const escaped = fileName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${escaped}' and trashed = false`
  );
  const existing = await driveJson<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    accessToken
  );
  const fileId = existing.files?.[0]?.id;
  const metadata = fileId
    ? { name: fileName }
    : { name: fileName, mimeType: 'application/json', parents: [folderId] };
  const boundary = `builly_pub_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(payload)}\r\n--${boundary}--`;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

  const saved = await driveJson<{ id: string }>(url, accessToken, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return saved.id;
}

export async function handleOwnerPublishSite(
  request: Request,
  env: WorkerEnv,
  rawSiteSlug: string
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const slugCheck = validateSiteSlug(rawSiteSlug);
  const siteSlug = slugCheck.normalized || normalizeSlug(rawSiteSlug);
  if (!siteSlug) {
    return Response.json({ error: 'Invalid site slug.', code: 'INVALID_SITE_SLUG' }, { status: 400 });
  }

  let body: PublishRequestBody;
  try {
    body = (await request.json()) as PublishRequestBody;
  } catch {
    return Response.json({ error: 'Invalid JSON publish payload.' }, { status: 400 });
  }

  if (!body.snapshot || !body.snapshot.buildId || !body.snapshot.publishVersion || !body.snapshot.pages) {
    return Response.json(
      { error: 'Published snapshot must include buildId, publishVersion, and compiled pages.' },
      { status: 400 }
    );
  }

  const schemaVersion = Number(body.snapshot.schemaVersion ?? 1);
  if (schemaVersion > 1) {
    return Response.json(
      { error: `Published snapshot schemaVersion ${schemaVersion} is not supported by Shared Runtime v1.` },
      { status: 422 }
    );
  }

  // Enforce slug ownership check across both site_registry and hierarchy sites
  const existingSite = await env.DB.prepare(
    `SELECT site_id, owner_id, org_id, project_id FROM site_registry WHERE site_slug = ?`
  )
    .bind(siteSlug)
    .first<{ site_id: string; owner_id: string; org_id: string | null; project_id: string | null }>();

  const existingHierarchySite = await env.DB.prepare(
    `SELECT site_id, owner_id, org_id, project_id FROM sites WHERE site_slug = ? LIMIT 1`
  )
    .bind(siteSlug)
    .first<{ site_id: string; owner_id: string; org_id: string; project_id: string }>();

  if (!existingSite && !existingHierarchySite && !slugCheck.valid) {
    return Response.json(
      { error: slugCheck.error || 'Invalid or reserved site slug.', code: slugCheck.code || 'RESERVED_SITE_SLUG' },
      { status: 400 }
    );
  }

  if (
    (existingSite && existingSite.owner_id !== session.ownerId) ||
    (existingHierarchySite && existingHierarchySite.owner_id !== session.ownerId)
  ) {
    return Response.json(
      { error: 'Site slug is owned by another Builly account.', code: 'SITE_SLUG_CONFLICT' },
      { status: 403 }
    );
  }

  let verifiedOrgId: string | null = existingHierarchySite?.org_id || existingSite?.org_id || null;
  let verifiedProjectId: string | null = existingHierarchySite?.project_id || existingSite?.project_id || null;

  if (body.projectId) {
    try {
      const access = await requireProjectAccess(env.DB, body.projectId, session.ownerId, [
        'owner',
        'admin',
        'editor',
      ]);
      verifiedOrgId = access.project.org_id;
      verifiedProjectId = access.project.project_id;
    } catch (err) {
      if (err instanceof HierarchyServiceError) {
        return Response.json({ error: err.message, code: err.code }, { status: err.status });
      }
      throw err;
    }
  } else if (body.orgId) {
    try {
      const access = await requireOrgMembership(env.DB, body.orgId, session.ownerId, [
        'owner',
        'admin',
        'editor',
      ]);
      verifiedOrgId = access.org.org_id;
    } catch (err) {
      if (err instanceof HierarchyServiceError) {
        return Response.json({ error: err.message, code: err.code }, { status: err.status });
      }
      throw err;
    }
  }

  // Always scrub any accidental private fields before persisting runtime-config.json
  const cleanSnapshot = scrubSnapshotForVisitor(body.snapshot);
  const siteId = body.siteId || existingSite?.site_id || existingHierarchySite?.site_id || `site_${siteSlug}`;
  const buildId = String(body.snapshot.buildId);
  const publishVersion = String(body.snapshot.publishVersion);
  const integrityHash = String(body.snapshot.integrityHash || '');

  try {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);

    // 1. Write immutable runtime-config.json + publish-manifest.json in owner's Google Drive
    let rootId = '';
    let buildFolderId = '';
    if (verifiedProjectId) {
      const tree = await ensureProjectDriveTree(env, session, verifiedProjectId);
      rootId = tree.rootFolderId;
      buildFolderId = await ensureFolderSegment(accessToken, tree.folders.config_published, buildId);
    } else {
      const legacy = await ensurePublishedBuildFolder(
        accessToken,
        body.driveFolderId,
        siteSlug,
        buildId
      );
      rootId = legacy.rootId;
      buildFolderId = legacy.buildFolderId;
    }

    const runtimeConfigDriveFileId = await uploadJsonToFolder(
      accessToken,
      buildFolderId,
      'runtime-config.json',
      cleanSnapshot
    );

    const manifestPayload = {
      ...(body.manifest || {}),
      siteId,
      siteSlug,
      buildId,
      publishVersion,
      integrityHash,
      schemaVersion,
      runtimeConfigDriveFileId,
      publishedAt: new Date().toISOString(),
    };

    const manifestDriveFileId = await uploadJsonToFolder(
      accessToken,
      buildFolderId,
      'publish-manifest.json',
      manifestPayload
    );

    // 2. Verify Drive readback before updating active pointer
    const verifyRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(runtimeConfigDriveFileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!verifyRes.ok) {
      return Response.json(
        { error: 'Published snapshot verification failed on Google Drive readback.' },
        { status: 502 }
      );
    }

    const nowIso = new Date().toISOString();

    // 3. Record release history + atomically switch active publish pointer
    await env.DB.prepare(
      `INSERT INTO site_release_history (
         id, site_id, site_slug, owner_id, publish_version, build_id,
         runtime_config_drive_file_id, publish_manifest_drive_file_id, integrity_hash,
         schema_version, commit_message, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        `rel_${siteId}_${buildId}`,
        siteId,
        siteSlug,
        session.ownerId,
        publishVersion,
        buildId,
        runtimeConfigDriveFileId,
        manifestDriveFileId,
        integrityHash,
        schemaVersion,
        body.commitMessage || '',
        nowIso
      )
      .run();

    const customDomainNormalized = body.customDomain ? body.customDomain.trim().toLowerCase() : null;
    const resolvedSiteName = body.siteName || siteSlug;

    await env.DB.prepare(
      `INSERT INTO site_registry (
         site_id, site_slug, custom_domain, owner_id, org_id, project_id, site_name, status,
         active_publish_version, active_build_id,
         publish_manifest_drive_file_id, runtime_config_drive_file_id,
         integrity_hash, schema_version, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(site_id) DO UPDATE SET
         site_slug = excluded.site_slug,
         custom_domain = excluded.custom_domain,
         org_id = COALESCE(excluded.org_id, site_registry.org_id),
         project_id = COALESCE(excluded.project_id, site_registry.project_id),
         site_name = excluded.site_name,
         status = 'published',
         active_publish_version = excluded.active_publish_version,
         active_build_id = excluded.active_build_id,
         publish_manifest_drive_file_id = excluded.publish_manifest_drive_file_id,
         runtime_config_drive_file_id = excluded.runtime_config_drive_file_id,
         integrity_hash = excluded.integrity_hash,
         schema_version = excluded.schema_version,
         updated_at = excluded.updated_at`
    )
      .bind(
        siteId,
        siteSlug,
        customDomainNormalized,
        session.ownerId,
        verifiedOrgId,
        verifiedProjectId,
        resolvedSiteName,
        publishVersion,
        buildId,
        manifestDriveFileId,
        runtimeConfigDriveFileId,
        integrityHash,
        schemaVersion,
        nowIso
      )
      .run();

    // Sync matching hierarchy site row (non-destructive if no hierarchy site row exists yet)
    await env.DB.prepare(
      `UPDATE sites
       SET site_name = ?,
           site_slug = ?,
           custom_domain = ?,
           status = 'published',
           active_publish_version = ?,
           active_build_id = ?,
           updated_at = ?
       WHERE site_id = ? AND owner_id = ?`
    )
      .bind(
        resolvedSiteName,
        siteSlug,
        customDomainNormalized,
        publishVersion,
        buildId,
        nowIso,
        siteId,
        session.ownerId
      )
      .run();

    // 4. Register trusted server-side dataset resources & form Inbox destinations
    if (Array.isArray(body.datasetResources)) {
      for (const resItem of body.datasetResources) {
        if (!resItem.spreadsheetId || !resItem.datasetKey) continue;
        await env.DB.prepare(
          `INSERT INTO site_dataset_resources (
             resource_id, site_id, owner_id, domain_kind, dataset_key,
             spreadsheet_id, worksheet_name, schema_version, status, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
           ON CONFLICT(resource_id) DO UPDATE SET
             spreadsheet_id = excluded.spreadsheet_id,
             worksheet_name = excluded.worksheet_name,
             status = 'active',
             updated_at = excluded.updated_at`
        )
          .bind(
            `${siteId}_${resItem.resourceId}`,
            siteId,
            session.ownerId,
            resItem.domainKind,
            resItem.datasetKey,
            resItem.spreadsheetId,
            resItem.worksheetName,
            resItem.schemaVersion ?? 1,
            nowIso
          )
          .run();
      }
    }

    if (Array.isArray(body.formDestinations)) {
      for (const fd of body.formDestinations) {
        if (!fd.formId || !fd.destinationSpreadsheetId) continue;
        await env.DB.prepare(
          `INSERT INTO site_form_destinations (
             id, site_id, form_id, owner_id, form_name, category_id,
             destination_spreadsheet_id, destination_worksheet_name,
             inbox_registry_spreadsheet_id, field_mappings_json, status, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(site_id, form_id) DO UPDATE SET
             form_name = excluded.form_name,
             category_id = excluded.category_id,
             destination_spreadsheet_id = excluded.destination_spreadsheet_id,
             destination_worksheet_name = excluded.destination_worksheet_name,
             inbox_registry_spreadsheet_id = excluded.inbox_registry_spreadsheet_id,
             field_mappings_json = excluded.field_mappings_json,
             status = excluded.status,
             updated_at = excluded.updated_at`
        )
          .bind(
            `fdest_${siteId}_${fd.formId}`,
            siteId,
            fd.formId,
            session.ownerId,
            fd.formName || 'Contact Form',
            fd.categoryId || 'cat_inquiry',
            fd.destinationSpreadsheetId,
            fd.destinationWorksheetName || 'CONTACT_SUBMISSIONS',
            fd.inboxRegistrySpreadsheetId || fd.destinationSpreadsheetId,
            JSON.stringify(fd.fieldMappings || {}),
            fd.status || 'active',
            nowIso
          )
          .run();
      }
    }

    await purgeSiteRuntimeCache(request.url, siteSlug);

    return Response.json({
      ok: true,
      siteId,
      siteSlug,
      publishVersion,
      buildId,
      driveFolderId: rootId,
      runtimeConfigDriveFileId,
      manifestDriveFileId,
      integrityHash,
      publicPath: `/${siteSlug}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed.';
    const status = message === 'WORKSPACE_REAUTH_REQUIRED' ? 401 : 502;
    return Response.json({ error: message }, { status });
  }
}

export async function handleOwnerRollbackSite(
  request: Request,
  env: WorkerEnv,
  rawSiteSlug: string
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const siteSlug = normalizeSlug(rawSiteSlug);
  const body = (await request.json().catch(() => ({}))) as { targetVersion?: string };
  if (!siteSlug || !body.targetVersion) {
    return Response.json({ error: 'Missing siteSlug or targetVersion.' }, { status: 400 });
  }

  const target = await env.DB.prepare(
    `SELECT * FROM site_release_history
     WHERE site_slug = ? AND owner_id = ? AND publish_version = ?
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(siteSlug, session.ownerId, body.targetVersion)
    .first<{
      site_id: string;
      publish_version: string;
      build_id: string;
      runtime_config_drive_file_id: string;
      publish_manifest_drive_file_id: string;
      integrity_hash: string;
      schema_version: number;
    }>();

  if (!target) {
    return Response.json(
      { error: `Release "${body.targetVersion}" was not found in server release history.` },
      { status: 404 }
    );
  }

  try {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, session.ownerId);
    const checkRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        target.runtime_config_drive_file_id
      )}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!checkRes.ok) {
      return Response.json({ error: 'Target release snapshot is missing in Google Drive.' }, { status: 410 });
    }

    const rollbackAt = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE site_registry
       SET active_publish_version = ?,
           active_build_id = ?,
           runtime_config_drive_file_id = ?,
           publish_manifest_drive_file_id = ?,
           integrity_hash = ?,
           schema_version = ?,
           status = 'published',
           updated_at = ?
       WHERE site_id = ? AND owner_id = ?`
    )
      .bind(
        target.publish_version,
        target.build_id,
        target.runtime_config_drive_file_id,
        target.publish_manifest_drive_file_id,
        target.integrity_hash,
        target.schema_version,
        rollbackAt,
        target.site_id,
        session.ownerId
      )
      .run();

    await env.DB.prepare(
      `UPDATE sites
       SET active_publish_version = ?,
           active_build_id = ?,
           status = 'published',
           updated_at = ?
       WHERE site_id = ? AND owner_id = ?`
    )
      .bind(
        target.publish_version,
        target.build_id,
        rollbackAt,
        target.site_id,
        session.ownerId
      )
      .run();

    await purgeSiteRuntimeCache(request.url, siteSlug);

    return Response.json({
      ok: true,
      siteSlug,
      activePublishVersion: target.publish_version,
      buildId: target.build_id,
      runtimeConfigDriveFileId: target.runtime_config_drive_file_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rollback failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}
