import { requireSession } from '../middleware/requireSession';
import {
  driveFetchWithRetry,
  ensureMarkerFolder,
  findDriveChildren,
  readDriveJsonWithConcurrency,
  writeCanonicalDriveJson,
} from '../services/driveCanonicalClient';
import {
  bootstrapAccountDrive,
  SITE_MANIFEST_FILENAME,
  SiteManifestDoc,
  upsertCanonicalResourceRegistryEntry,
} from '../services/driveManifestService';
import { ensureProjectDriveTree } from '../services/driveProvisioner';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import { withMutationLock } from '../services/mutationLockService';
import {
  generateOperationId,
  runSagaWithJournal,
} from '../services/operationJournalService';
import {
  normalizeSlug,
  purgeSiteRuntimeCache,
  scrubSnapshotForVisitor,
  validateSiteSlug,
} from '../services/siteRegistryService';
import { BuillyTransactionError } from '../services/transactionErrors';
import {
  HierarchyServiceError,
  requireOrgMembership,
  requireProjectAccess,
} from '../services/workspaceHierarchyService';
import { WorkerEnv } from '../types';

interface PublishRequestBody {
  operationId?: string;
  expectedRevision?: number;
  expectedEtag?: string;
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

async function ensureLegacyPublishedBuildFolder(
  accessToken: string,
  rootFolderId: string | undefined,
  siteSlug: string,
  buildId: string,
  operationId: string
): Promise<{ rootId: string; buildFolderId: string }> {
  const rootId =
    rootFolderId ||
    (
      await ensureMarkerFolder(accessToken, {
        parentId: 'root',
        name: 'Builly',
        operationId,
        appProperties: { builly_root: 'true', resource_type: 'builly_root' },
      })
    ).folder.id;
  const sitesId = (
    await ensureMarkerFolder(accessToken, {
      parentId: rootId,
      name: 'Sites',
      operationId,
      appProperties: { resource_type: 'legacy_sites' },
    })
  ).folder.id;
  const siteFolderId = (
    await ensureMarkerFolder(accessToken, {
      parentId: sitesId,
      name: siteSlug,
      operationId,
      appProperties: { resource_type: 'legacy_site' },
    })
  ).folder.id;
  const configId = (
    await ensureMarkerFolder(accessToken, {
      parentId: siteFolderId,
      name: 'Config',
      operationId,
      appProperties: { resource_type: 'config_root' },
    })
  ).folder.id;
  const pubId = (
    await ensureMarkerFolder(accessToken, {
      parentId: configId,
      name: 'Published',
      operationId,
      appProperties: { resource_type: 'config_published' },
    })
  ).folder.id;
  const buildFolderId = (
    await ensureMarkerFolder(accessToken, {
      parentId: pubId,
      name: buildId,
      operationId,
      appProperties: { resource_type: 'publish_build' },
    })
  ).folder.id;
  return { rootId, buildFolderId };
}

function mapPublishError(err: unknown): Response {
  if (err instanceof BuillyTransactionError) {
    return Response.json(err.toSafeJson(), { status: err.status });
  }
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : 'Publish failed.';
  const isOauthOutage = message === 'WORKSPACE_REAUTH_REQUIRED';
  return Response.json(
    {
      error: isOauthOutage
        ? 'Google Workspace connection is unavailable or expired.'
        : message,
      code: isOauthOutage ? 'WRITE_DISABLED_OAUTH_UNAVAILABLE' : 'PUBLISH_FAILED',
    },
    { status: isOauthOutage ? 503 : 502 }
  );
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

  const operationId =
    body.operationId?.trim() ||
    request.headers.get('Idempotency-Key')?.trim() ||
    generateOperationId('op_pub');

  const existingSite = await env.DB.prepare(
    `SELECT site_id, owner_id, org_id, project_id FROM site_registry WHERE site_slug = ?`
  )
    .bind(siteSlug)
    .first<{ site_id: string; owner_id: string; org_id: string | null; project_id: string | null }>();

  const existingHierarchySite = await env.DB.prepare(
    `SELECT site_id, owner_id, org_id, project_id, drive_config_folder_id, canonical_revision
     FROM sites WHERE site_slug = ? LIMIT 1`
  )
    .bind(siteSlug)
    .first<{
      site_id: string;
      owner_id: string;
      org_id: string;
      project_id: string;
      drive_config_folder_id: string;
      canonical_revision: number;
    }>();

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
  let ownerAccountId = existingHierarchySite?.owner_id || existingSite?.owner_id || session.ownerId;

  if (body.projectId) {
    try {
      const access = await requireProjectAccess(env.DB, body.projectId, session.ownerId, [
        'owner',
        'admin',
        'editor',
      ]);
      verifiedOrgId = access.project.org_id;
      verifiedProjectId = access.project.project_id;
      ownerAccountId = access.project.owner_id || ownerAccountId;
    } catch (err) {
      return mapPublishError(err);
    }
  } else if (body.orgId) {
    try {
      const access = await requireOrgMembership(env.DB, body.orgId, session.ownerId, [
        'owner',
        'admin',
        'editor',
      ]);
      verifiedOrgId = access.org.org_id;
      ownerAccountId = access.org.owner_id || ownerAccountId;
    } catch (err) {
      return mapPublishError(err);
    }
  }

  if (verifiedProjectId) {
    const pubMod = await env.DB.prepare(
      `SELECT enabled FROM project_modules WHERE project_id = ? AND module_key = 'publishing' LIMIT 1`
    )
      .bind(verifiedProjectId)
      .first<{ enabled: number }>();
    if (pubMod && pubMod.enabled === 0) {
      return Response.json(
        {
          error: 'Publishing / Site capability must be enabled on this Project before publishing.',
          code: 'SITE_CAPABILITY_DISABLED',
        },
        { status: 403 }
      );
    }
  }

  let accessToken: string;
  try {
    const minted = await mintOwnerGoogleAccessToken(env, ownerAccountId);
    accessToken = minted.accessToken;
  } catch {
    return Response.json(
      {
        error: 'Google Workspace connection is unavailable. Publishing is disabled in read-only mode.',
        code: 'WRITE_DISABLED_OAUTH_UNAVAILABLE',
        retryable: false,
        operationId,
      },
      { status: 503 }
    );
  }

  // Always scrub any accidental private fields before persisting runtime snapshot
  const cleanSnapshot = scrubSnapshotForVisitor(body.snapshot);
  const siteId =
    body.siteId || existingSite?.site_id || existingHierarchySite?.site_id || `site_${siteSlug}`;
  const buildId = String(body.snapshot.buildId);
  const publishVersion = String(body.snapshot.publishVersion);
  const integrityHash = String(body.snapshot.integrityHash || '');
  const resolvedSiteName = body.siteName || siteSlug;
  const customDomainNormalized = body.customDomain ? body.customDomain.trim().toLowerCase() : null;
  const nowIso = new Date().toISOString();

  let rootId = '';
  let siteFolderId = existingHierarchySite?.drive_config_folder_id || '';
  let publishedFolderId = '';
  let runtimeConfigDriveFileId = '';
  let manifestDriveFileId = '';
  let nextSiteRevision = (existingHierarchySite?.canonical_revision || 0) + 1;

  try {
    const result = await runSagaWithJournal(env, {
      operationId,
      operationType: 'SITE_PUBLISH',
      ownerId: ownerAccountId,
      scopeKey: `site:${siteId}`,
      payloadForHash: {
        op: 'site_publish',
        siteId,
        siteSlug,
        publishVersion,
        buildId,
        integrityHash,
      },
      target: {
        organization_id: verifiedOrgId || undefined,
        project_id: verifiedProjectId || undefined,
        site_id: siteId,
      },
      accessToken,
      repairResourceType: 'site',
      repairResourceId: siteId,
      steps: [
        {
          key: 'ensure_published_target_folder',
          async run(ctx) {
            try {
              const boot = await bootstrapAccountDrive(env, ctx.accessToken, ownerAccountId, {
                operationId,
              });
              ctx.setOperationsFolderId(boot.operationsFolderId);
              rootId = boot.rootFolderId;
            } catch {
              // Non-fatal for standalone/legacy publish when System root isn't initialized yet
            }

            if (verifiedProjectId) {
              const tree = await ensureProjectDriveTree(env, session, verifiedProjectId, {
                operationId,
                accessTokenOverride: ctx.accessToken,
              });
              rootId = rootId || tree.rootFolderId;

              const siteFolder = await ensureMarkerFolder(ctx.accessToken, {
                parentId: tree.folders.config_sites,
                name: siteId,
                knownFolderId: siteFolderId || undefined,
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: siteId,
                  resource_type: 'site_folder',
                  site_id: siteId,
                  project_id: verifiedProjectId,
                  schema_version: '1',
                },
              });
              siteFolderId = siteFolder.folder.id;

              const pubF = await ensureMarkerFolder(ctx.accessToken, {
                parentId: siteFolderId,
                name: 'Published',
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: `${siteId}:published`,
                  resource_type: 'site_published_folder',
                  site_id: siteId,
                  project_id: verifiedProjectId,
                  schema_version: '1',
                },
              });
              publishedFolderId = pubF.folder.id;
            } else {
              const legacy = await ensureLegacyPublishedBuildFolder(
                ctx.accessToken,
                body.driveFolderId || rootId || undefined,
                siteSlug,
                buildId,
                operationId
              );
              rootId = rootId || legacy.rootId;
              publishedFolderId = legacy.buildFolderId;
            }

            return {
              resource_id: siteId,
              drive_file_id: publishedFolderId,
            };
          },
        },
        {
          key: 'write_immutable_snapshot_and_manifest',
          async run(ctx) {
            // Write immutable {publishVersion}.json + runtime-config.json inside Published/
            const versionedSnap = await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: publishedFolderId,
              fileName: `${publishVersion}.json`,
              payload: cleanSnapshot,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${siteId}:snapshot:${publishVersion}`,
                resource_type: 'published_snapshot',
                site_id: siteId,
                schema_version: '1',
              },
            });

            const runtimeSnap = await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: publishedFolderId,
              fileName: 'runtime-config.json',
              payload: cleanSnapshot,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${siteId}:runtime_config:${publishVersion}`,
                resource_type: 'published_runtime_config',
                site_id: siteId,
                schema_version: '1',
              },
            });
            runtimeConfigDriveFileId = versionedSnap.fileId || runtimeSnap.fileId;

            const manifestPayload = {
              ...(body.manifest || {}),
              siteId,
              siteSlug,
              buildId,
              publishVersion,
              integrityHash,
              schemaVersion,
              runtimeConfigDriveFileId,
              publishedAt: nowIso,
              lastOperationId: operationId,
            };
            const pubMan = await writeCanonicalDriveJson(ctx.accessToken, {
              parentId: publishedFolderId,
              fileName: 'publish-manifest.json',
              payload: manifestPayload as Record<string, unknown>,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: `${siteId}:publish_manifest:${publishVersion}`,
                resource_type: 'publish_manifest',
                site_id: siteId,
                schema_version: '1',
              },
            });
            manifestDriveFileId = pubMan.fileId;

            // Verify Drive readback before pointer flip
            const verifyRes = await driveFetchWithRetry(
              `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
                runtimeConfigDriveFileId
              )}?alt=media`,
              ctx.accessToken,
              {},
              { operationId }
            );
            if (!verifyRes.ok) {
              throw new BuillyTransactionError(
                'POSTCONDITION_FAILED',
                'Published snapshot verification failed on Google Drive readback.',
                { operationId, details: { resourceId: runtimeConfigDriveFileId } }
              );
            }

            if (siteFolderId && verifiedProjectId && verifiedOrgId) {
              const existingSiteFiles = await findDriveChildren(ctx.accessToken, {
                parentId: siteFolderId,
                name: SITE_MANIFEST_FILENAME,
                operationId,
              });
              let currentDoc: SiteManifestDoc | null = null;
              let siteEtag: string | undefined;
              if (existingSiteFiles[0]) {
                const read = await readDriveJsonWithConcurrency<SiteManifestDoc>(
                  ctx.accessToken,
                  existingSiteFiles[0].id,
                  operationId
                );
                currentDoc = read.data;
                siteEtag = read.meta.etag;
              }
              if (
                body.expectedRevision !== undefined &&
                currentDoc &&
                currentDoc.revision !== body.expectedRevision
              ) {
                throw new BuillyTransactionError(
                  'REVISION_CONFLICT',
                  `Site manifest revision conflict: expected ${body.expectedRevision}, found ${currentDoc.revision}.`,
                  {
                    operationId,
                    details: {
                      resourceId: siteId,
                      expectedRevision: body.expectedRevision,
                      actualRevision: currentDoc.revision,
                    },
                  }
                );
              }
              nextSiteRevision = (currentDoc?.revision || 0) + 1;
              const nextSiteDoc: SiteManifestDoc = {
                schema_version: 1,
                site_id: siteId,
                project_id: verifiedProjectId,
                organization_id: verifiedOrgId,
                site_slug: siteSlug,
                site_name: resolvedSiteName,
                custom_domain: customDomainNormalized,
                status: 'published',
                active_publish_version_id: publishVersion,
                active_build_id: buildId,
                site_config_file_id: currentDoc?.site_config_file_id || '',
                published_folder_id: publishedFolderId,
                folder_id: siteFolderId,
                revision: nextSiteRevision,
                last_operation_id: operationId,
                created_at: currentDoc?.created_at || nowIso,
                updated_at: nowIso,
              };
              const savedSiteMan = await writeCanonicalDriveJson(ctx.accessToken, {
                parentId: siteFolderId,
                fileName: SITE_MANIFEST_FILENAME,
                payload: nextSiteDoc as unknown as Record<string, unknown>,
                knownFileId: existingSiteFiles[0]?.id,
                expectedRevision: currentDoc?.revision,
                expectedEtag: siteEtag,
                operationId,
                appProperties: {
                  operation_id: operationId,
                  resource_id: siteId,
                  resource_type: 'site_manifest',
                  site_id: siteId,
                  schema_version: '1',
                },
              });

              try {
                const boot = await bootstrapAccountDrive(env, ctx.accessToken, ownerAccountId, {
                  operationId,
                });
                await upsertCanonicalResourceRegistryEntry(ctx.accessToken, {
                  systemFolderId: boot.systemFolderId,
                  registryFileId: boot.resourceRegistryFileId,
                  ownerAccountId,
                  operationId,
                  entry: {
                    resource_id: `wres_${siteId}_pub_${publishVersion}`,
                    owner_type: 'site',
                    owner_id: ownerAccountId,
                    org_id: verifiedOrgId,
                    project_id: verifiedProjectId,
                    site_id: siteId,
                    resource_type: 'published_snapshot',
                    resource_key: publishVersion,
                    drive_file_id: runtimeConfigDriveFileId,
                    spreadsheet_id: '',
                    parent_folder_id: publishedFolderId,
                    title: `${siteSlug} ${publishVersion}`,
                    mime_type: 'application/json',
                    schema_version: 1,
                    status: 'active',
                  },
                });
                void savedSiteMan;
              } catch {
                // Non-fatal in minimal Drive mocks
              }
            }

            return {
              resource_id: siteId,
              drive_file_id: runtimeConfigDriveFileId,
              parent_id: publishedFolderId,
            };
          },
        },
      ],
      buildResult() {
        return {
          ok: true,
          siteId,
          siteSlug,
          publishVersion,
          buildId,
          revision: nextSiteRevision,
          driveFolderId: rootId,
          runtimeConfigDriveFileId,
          manifestDriveFileId,
          integrityHash,
          publicPath: `/${siteSlug}`,
        };
      },
      async updateProjection() {
        const scrubbedJson = JSON.stringify(cleanSnapshot);

        await env.DB.prepare(
          `INSERT INTO public_runtime_artifacts (
             site_id, publish_version, build_id, integrity_hash, snapshot_json, drive_file_id, indexed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(site_id, publish_version) DO UPDATE SET
             build_id = excluded.build_id,
             integrity_hash = excluded.integrity_hash,
             snapshot_json = excluded.snapshot_json,
             drive_file_id = excluded.drive_file_id,
             indexed_at = excluded.indexed_at`
        )
          .bind(
            siteId,
            publishVersion,
            buildId,
            integrityHash,
            scrubbedJson,
            runtimeConfigDriveFileId,
            nowIso
          )
          .run();

        if (env.PUBLIC_ARTIFACTS) {
          await env.PUBLIC_ARTIFACTS.put(
            `sites/${siteId}/published/${publishVersion}.json`,
            scrubbedJson,
            {
              httpMetadata: {
                contentType: 'application/json',
                cacheControl: 'public, max-age=31536000, immutable',
              },
            }
          ).catch(() => undefined);
        }

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
            ownerAccountId,
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

        await env.DB.prepare(
          `INSERT INTO site_registry (
             site_id, site_slug, custom_domain, owner_id, org_id, project_id, site_name, status,
             active_publish_version, active_build_id,
             publish_manifest_drive_file_id, runtime_config_drive_file_id,
             integrity_hash, schema_version,
             canonical_revision, indexed_at, last_verified_at, projection_status, last_operation_id,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
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
             canonical_revision = excluded.canonical_revision,
             indexed_at = excluded.indexed_at,
             last_verified_at = excluded.last_verified_at,
             projection_status = 'synced',
             last_operation_id = excluded.last_operation_id,
             updated_at = excluded.updated_at`
        )
          .bind(
            siteId,
            siteSlug,
            customDomainNormalized,
            ownerAccountId,
            verifiedOrgId,
            verifiedProjectId,
            resolvedSiteName,
            publishVersion,
            buildId,
            manifestDriveFileId,
            runtimeConfigDriveFileId,
            integrityHash,
            schemaVersion,
            nextSiteRevision,
            nowIso,
            nowIso,
            operationId,
            nowIso
          )
          .run();

        await env.DB.prepare(
          `UPDATE sites
           SET site_name = ?,
               site_slug = ?,
               custom_domain = ?,
               status = 'published',
               active_publish_version = ?,
               active_build_id = ?,
               drive_config_folder_id = CASE WHEN ? != '' THEN ? ELSE drive_config_folder_id END,
               canonical_revision = ?,
               projected_at = ?,
               projection_status = 'synced',
               last_operation_id = ?,
               updated_at = ?
           WHERE site_id = ? AND owner_id = ?`
        )
          .bind(
            resolvedSiteName,
            siteSlug,
            customDomainNormalized,
            publishVersion,
            buildId,
            siteFolderId,
            siteFolderId,
            nextSiteRevision,
            nowIso,
            operationId,
            nowIso,
            siteId,
            ownerAccountId
          )
          .run();

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
                ownerAccountId,
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
                ownerAccountId,
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
      },
    });

    return Response.json(result);
  } catch (err) {
    return mapPublishError(err);
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
  const body = (await request.json().catch(() => ({}))) as {
    targetVersion?: string;
    operationId?: string;
  };
  if (!siteSlug || !body.targetVersion) {
    return Response.json({ error: 'Missing siteSlug or targetVersion.' }, { status: 400 });
  }

  const operationId =
    body.operationId?.trim() ||
    request.headers.get('Idempotency-Key')?.trim() ||
    generateOperationId('op_rollback');

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

  let accessToken: string;
  try {
    const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
    accessToken = minted.accessToken;
  } catch {
    return Response.json(
      {
        error: 'Google Workspace connection is unavailable. Rollback is disabled in read-only mode.',
        code: 'WRITE_DISABLED_OAUTH_UNAVAILABLE',
        retryable: false,
        operationId,
      },
      { status: 503 }
    );
  }

  try {
    return await withMutationLock(
      env,
      { scopeKey: `site:${target.site_id}`, operationId },
      async () => {
        const checkRes = await driveFetchWithRetry(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            target.runtime_config_drive_file_id
          )}?alt=media`,
          accessToken,
          {},
          { operationId }
        );
        if (!checkRes.ok) {
          return Response.json(
            { error: 'Target release snapshot is missing in Google Drive.' },
            { status: 410 }
          );
        }

        const rawSnap = (await checkRes.json()) as Record<string, unknown>;
        const cleanSnap = scrubSnapshotForVisitor(rawSnap);
        const rollbackAt = new Date().toISOString();

        const siteRow = await env.DB.prepare(
          `SELECT drive_config_folder_id FROM sites WHERE site_id = ? AND owner_id = ? LIMIT 1`
        )
          .bind(target.site_id, session.ownerId)
          .first<{ drive_config_folder_id: string }>();

        let nextSiteRev = 1;
        if (siteRow?.drive_config_folder_id) {
          const siteFiles = await findDriveChildren(accessToken, {
            parentId: siteRow.drive_config_folder_id,
            name: SITE_MANIFEST_FILENAME,
            operationId,
          }).catch(() => []);
          if (siteFiles[0]) {
            const { data: currentDoc, meta } = await readDriveJsonWithConcurrency<SiteManifestDoc>(
              accessToken,
              siteFiles[0].id,
              operationId
            );
            nextSiteRev = (currentDoc.revision || 0) + 1;
            await writeCanonicalDriveJson(accessToken, {
              parentId: siteRow.drive_config_folder_id,
              fileName: SITE_MANIFEST_FILENAME,
              payload: {
                ...currentDoc,
                status: 'published',
                active_publish_version_id: target.publish_version,
                active_build_id: target.build_id,
                revision: nextSiteRev,
                last_operation_id: operationId,
                updated_at: rollbackAt,
              },
              knownFileId: siteFiles[0].id,
              expectedRevision: currentDoc.revision,
              expectedEtag: meta.etag,
              operationId,
              appProperties: {
                operation_id: operationId,
                resource_id: target.site_id,
                resource_type: 'site_manifest',
                site_id: target.site_id,
                schema_version: '1',
              },
            });
          }
        }

        const scrubbedJson = JSON.stringify(cleanSnap);
        await env.DB.prepare(
          `INSERT INTO public_runtime_artifacts (
             site_id, publish_version, build_id, integrity_hash, snapshot_json, drive_file_id, indexed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(site_id, publish_version) DO UPDATE SET
             snapshot_json = excluded.snapshot_json,
             drive_file_id = excluded.drive_file_id,
             indexed_at = excluded.indexed_at`
        )
          .bind(
            target.site_id,
            target.publish_version,
            target.build_id,
            target.integrity_hash,
            scrubbedJson,
            target.runtime_config_drive_file_id,
            rollbackAt
          )
          .run();

        if (env.PUBLIC_ARTIFACTS) {
          await env.PUBLIC_ARTIFACTS.put(
            `sites/${target.site_id}/published/${target.publish_version}.json`,
            scrubbedJson,
            {
              httpMetadata: {
                contentType: 'application/json',
                cacheControl: 'public, max-age=31536000, immutable',
              },
            }
          ).catch(() => undefined);
        }

        await env.DB.prepare(
          `UPDATE site_registry
           SET active_publish_version = ?,
               active_build_id = ?,
               runtime_config_drive_file_id = ?,
               publish_manifest_drive_file_id = ?,
               integrity_hash = ?,
               schema_version = ?,
               status = 'published',
               canonical_revision = ?,
               indexed_at = ?,
               last_operation_id = ?,
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
            nextSiteRev,
            rollbackAt,
            operationId,
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
               canonical_revision = ?,
               last_operation_id = ?,
               updated_at = ?
           WHERE site_id = ? AND owner_id = ?`
        )
          .bind(
            target.publish_version,
            target.build_id,
            nextSiteRev,
            operationId,
            rollbackAt,
            target.site_id,
            session.ownerId
          )
          .run();

        await purgeSiteRuntimeCache(request.url, siteSlug);

        return Response.json({
          ok: true,
          operationId,
          siteSlug,
          activePublishVersion: target.publish_version,
          buildId: target.build_id,
          runtimeConfigDriveFileId: target.runtime_config_drive_file_id,
        });
      }
    );
  } catch (err) {
    return mapPublishError(err);
  }
}
