import { VerifiedSession, WorkerEnv } from '../types';
import {
  findBuillyRootCandidates,
  findDriveChildren,
  readDriveJsonWithConcurrency,
} from './driveCanonicalClient';
import {
  ACCOUNT_MANIFEST_FILENAME,
  AccountManifestDoc,
  ORGANIZATION_MANIFEST_FILENAME,
  OrganizationManifestDoc,
  ORGANIZATIONS_INDEX_FILENAME,
  OrganizationProjectsIndexDoc,
  OrganizationsIndexDoc,
  PROJECT_MANIFEST_FILENAME,
  PROJECT_MODULES_FILENAME,
  ProjectManifestDoc,
  ProjectModulesManifestDoc,
  PROJECTS_INDEX_FILENAME,
  RESOURCE_REGISTRY_FILENAME,
  ResourceRegistryDoc,
  SITE_MANIFEST_FILENAME,
  SiteManifestDoc,
} from './driveManifestService';
import { mintOwnerGoogleAccessToken } from './googleTokenVault';
import { scrubSnapshotForVisitor } from './siteRegistryService';
import { BuillyTransactionError } from './transactionErrors';

export interface ProjectionRepairItem {
  repair_id: string;
  owner_id: string;
  resource_type: string;
  resource_id: string;
  operation_id: string;
  canonical_revision: number;
  drive_file_id: string;
  payload_json: string;
  attempts: number;
  status: 'pending' | 'reconciling' | 'completed' | 'failed';
  last_error: string;
  created_at: string;
  updated_at: string;
}

export async function listPendingProjectionRepairs(
  db: D1Database,
  ownerId: string
): Promise<ProjectionRepairItem[]> {
  try {
    const res = await db
      .prepare(
        `SELECT * FROM projection_repair_queue
         WHERE owner_id = ? AND status IN ('pending', 'failed')
         ORDER BY created_at ASC LIMIT 50`
      )
      .bind(ownerId)
      .all<ProjectionRepairItem>();
    return res.results || [];
  } catch {
    return [];
  }
}

export async function processProjectionRepairQueue(
  env: WorkerEnv,
  session: VerifiedSession
): Promise<{ processed: number; completed: number; failed: number }> {
  const pending = await listPendingProjectionRepairs(env.DB, session.ownerId);
  if (pending.length === 0) {
    return { processed: 0, completed: 0, failed: 0 };
  }

  // Trigger a clean rebuild from canonical Drive manifests to bring all D1 rows in sync
  await rebuildD1FromDrive(env, session);

  const nowIso = new Date().toISOString();
  let completed = 0;
  for (const item of pending) {
    await env.DB.prepare(
      `UPDATE projection_repair_queue
       SET status = 'completed', attempts = attempts + 1, last_error = '', updated_at = ?
       WHERE repair_id = ? AND owner_id = ?`
    )
      .bind(nowIso, item.repair_id, session.ownerId)
      .run();
    completed += 1;
  }

  return { processed: pending.length, completed, failed: 0 };
}

export interface D1RebuildSummary {
  ok: true;
  rootFolderId: string;
  organizationsRebuilt: number;
  projectsRebuilt: number;
  sitesRebuilt: number;
  publishedArtifactsRebuilt: number;
  resourcesRebuilt: number;
  rebuiltAt: string;
}

/**
 * Full D1 Operational & Runtime Index rebuild from canonical My Drive/Builly manifests & Published snapshots.
 * Safe to invoke after partial projection failure or D1 row loss.
 */
export async function rebuildD1FromDrive(
  env: WorkerEnv,
  session: VerifiedSession,
  options?: { selectedRootFolderId?: string }
): Promise<D1RebuildSummary> {
  let accessToken: string;
  try {
    const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
    accessToken = minted.accessToken;
  } catch {
    throw new BuillyTransactionError(
      'WRITE_DISABLED_OAUTH_UNAVAILABLE',
      'Google Workspace connection is required to rebuild D1 index from canonical Drive state.',
      { retryable: false }
    );
  }

  let rootFolderId = options?.selectedRootFolderId?.trim() || '';
  if (!rootFolderId) {
    const candidates = await findBuillyRootCandidates(accessToken);
    if (candidates.length > 1) {
      throw new BuillyTransactionError(
        'DUPLICATE_RESOURCE_CANDIDATES',
        'Multiple "Builly" root folders found in Drive; cannot automatically rebuild D1 without root selection.',
        {
          details: {
            needsReconciliation: true,
            candidates: candidates.map((c) => ({ id: c.id, name: c.name, parents: c.parents })),
          },
        }
      );
    }
    if (candidates.length === 0) {
      const nowIso = new Date().toISOString();
      return {
        ok: true,
        rootFolderId: '',
        organizationsRebuilt: 0,
        projectsRebuilt: 0,
        sitesRebuilt: 0,
        publishedArtifactsRebuilt: 0,
        resourcesRebuilt: 0,
        rebuiltAt: nowIso,
      };
    }
    rootFolderId = candidates[0].id;
  }

  const rootChildren = await findDriveChildren(accessToken, { parentId: rootFolderId });
  const systemFolder = rootChildren.find((f) => f.name === 'System');
  const orgsFolder = rootChildren.find((f) => f.name === 'Organizations');

  if (!systemFolder) {
    throw new BuillyTransactionError(
      'RESOURCE_NOT_FOUND',
      'Canonical Builly/System folder not found in Google Drive.',
      { details: { resourceId: rootFolderId } }
    );
  }

  const sysChildren = await findDriveChildren(accessToken, { parentId: systemFolder.id });
  const accountManifestMeta = sysChildren.find((f) => f.name === ACCOUNT_MANIFEST_FILENAME);
  const orgsIndexMeta = sysChildren.find((f) => f.name === ORGANIZATIONS_INDEX_FILENAME);
  const resourceRegistryMeta = sysChildren.find((f) => f.name === RESOURCE_REGISTRY_FILENAME);

  const accountManifest = accountManifestMeta
    ? (
        await readDriveJsonWithConcurrency<AccountManifestDoc>(
          accessToken,
          accountManifestMeta.id
        )
      ).data
    : null;

  const orgsIndex = orgsIndexMeta
    ? (
        await readDriveJsonWithConcurrency<OrganizationsIndexDoc>(
          accessToken,
          orgsIndexMeta.id
        )
      ).data
    : null;

  const resourceRegistry = resourceRegistryMeta
    ? (
        await readDriveJsonWithConcurrency<ResourceRegistryDoc>(
          accessToken,
          resourceRegistryMeta.id
        )
      ).data
    : null;

  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`PRAGMA foreign_keys = ON`),
    env.DB.prepare(`DELETE FROM organizations WHERE owner_id = ?`).bind(session.ownerId),
    env.DB.prepare(`DELETE FROM site_registry WHERE owner_id = ?`).bind(session.ownerId),
    env.DB.prepare(`DELETE FROM workspace_resources WHERE owner_id = ?`).bind(session.ownerId),
  ];

  // Record root/system workspace resource projections
  statements.push(
    env.DB.prepare(
      `INSERT INTO workspace_resources (
         resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
         drive_file_id, spreadsheet_id, parent_folder_id, title, status,
         canonical_revision, last_operation_id, created_at, updated_at
       ) VALUES (?, ?, 'account', NULL, NULL, 'builly_root', 'default', ?, '', 'root', 'Builly', 'active', ?, ?, ?, ?)`
    ).bind(
      `wres_root_${session.ownerId}`,
      session.ownerId,
      rootFolderId,
      accountManifest?.revision || 1,
      accountManifest?.last_operation_id || '',
      accountManifest?.created_at || nowIso,
      nowIso
    )
  );

  let organizationsRebuilt = 0;
  let projectsRebuilt = 0;
  let sitesRebuilt = 0;
  let publishedArtifactsRebuilt = 0;
  let resourcesRebuilt = 1;

  // Determine canonical organization folders to read
  const orgEntries: Array<{ folderId: string; orgId?: string }> = [];
  if (orgsIndex?.organizations?.length) {
    for (const entry of orgsIndex.organizations) {
      if (entry.status !== 'deleted' && entry.folder_id) {
        orgEntries.push({ folderId: entry.folder_id, orgId: entry.organization_id });
      }
    }
  } else if (orgsFolder) {
    const orgFolders = await findDriveChildren(accessToken, { parentId: orgsFolder.id });
    for (const f of orgFolders) {
      orgEntries.push({ folderId: f.id });
    }
  }

  for (const orgEntry of orgEntries) {
    const orgFiles = await findDriveChildren(accessToken, { parentId: orgEntry.folderId });
    const orgManifestMeta = orgFiles.find((f) => f.name === ORGANIZATION_MANIFEST_FILENAME);
    if (!orgManifestMeta) continue;

    const { data: orgManifest } = await readDriveJsonWithConcurrency<OrganizationManifestDoc>(
      accessToken,
      orgManifestMeta.id
    );
    if (!orgManifest || orgManifest.status === 'deleted') continue;

    const orgStatus = orgManifest.status === 'archived' ? 'archived' : 'active';
    organizationsRebuilt += 1;

    statements.push(
      env.DB.prepare(
        `INSERT INTO organizations (
           org_id, owner_id, name, org_slug, drive_folder_id, status,
           canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?)`
      ).bind(
        orgManifest.organization_id,
        session.ownerId,
        orgManifest.name,
        orgManifest.slug || orgManifest.organization_id,
        orgManifest.folder_id,
        orgStatus,
        orgManifest.revision || 1,
        nowIso,
        orgManifest.last_operation_id || '',
        orgManifestMeta.id,
        orgManifest.created_at || nowIso,
        orgManifest.updated_at || nowIso
      )
    );

    statements.push(
      env.DB.prepare(
        `INSERT INTO organization_members (member_id, org_id, user_id, email, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)`
      ).bind(
        `mem_${orgManifest.organization_id}_${session.ownerId}`,
        orgManifest.organization_id,
        session.ownerId,
        session.email || '',
        orgManifest.created_at || nowIso,
        nowIso
      )
    );

    const projectsIndexMeta = orgFiles.find((f) => f.name === PROJECTS_INDEX_FILENAME);
    const projectsIndex = projectsIndexMeta
      ? (
          await readDriveJsonWithConcurrency<OrganizationProjectsIndexDoc>(
            accessToken,
            projectsIndexMeta.id
          )
        ).data
      : null;

    const projectFoldersToRead: Array<{ folderId: string }> = [];
    if (projectsIndex?.projects?.length) {
      for (const p of projectsIndex.projects) {
        if (p.status !== 'deleted' && p.folder_id) {
          projectFoldersToRead.push({ folderId: p.folder_id });
        }
      }
    } else if (orgManifest.projects_folder_id) {
      const pFolders = await findDriveChildren(accessToken, {
        parentId: orgManifest.projects_folder_id,
      });
      for (const pf of pFolders) {
        projectFoldersToRead.push({ folderId: pf.id });
      }
    }

    for (const projEntry of projectFoldersToRead) {
      const projFiles = await findDriveChildren(accessToken, { parentId: projEntry.folderId });
      const projManifestMeta = projFiles.find((f) => f.name === PROJECT_MANIFEST_FILENAME);
      if (!projManifestMeta) continue;

      const { data: projManifest } = await readDriveJsonWithConcurrency<ProjectManifestDoc>(
        accessToken,
        projManifestMeta.id
      );
      if (!projManifest || projManifest.status === 'deleted') continue;

      const projStatus = projManifest.status === 'archived' ? 'archived' : 'active';
      projectsRebuilt += 1;

      statements.push(
        env.DB.prepare(
          `INSERT INTO projects (
             project_id, org_id, owner_id, name, project_slug, description, drive_folder_id, status,
             canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?)`
        ).bind(
          projManifest.project_id,
          orgManifest.organization_id,
          session.ownerId,
          projManifest.name,
          projManifest.slug || projManifest.project_id,
          projManifest.description || '',
          projManifest.folder_id,
          projStatus,
          projManifest.revision || 1,
          nowIso,
          projManifest.last_operation_id || '',
          projManifestMeta.id,
          projManifest.created_at || nowIso,
          projManifest.updated_at || nowIso
        )
      );

      // Restore modules.json
      const configChildren = projManifest.config_folder_id
        ? await findDriveChildren(accessToken, { parentId: projManifest.config_folder_id })
        : [];
      const modulesMeta = configChildren.find((f) => f.name === PROJECT_MODULES_FILENAME);
      let modulesDoc: ProjectModulesManifestDoc | null = null;
      if (modulesMeta) {
        modulesDoc = (
          await readDriveJsonWithConcurrency<ProjectModulesManifestDoc>(
            accessToken,
            modulesMeta.id
          )
        ).data;
      }

      const modEntries = modulesDoc?.modules
        ? Object.entries(modulesDoc.modules)
        : (projManifest.enabled_module_keys || []).map((k) => [k, { enabled: true }] as const);

      for (const [modKey, modState] of modEntries) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO project_modules (id, project_id, module_key, enabled, config_json, updated_at)
             VALUES (?, ?, ?, ?, '{}', ?)`
          ).bind(
            `mod_${projManifest.project_id}_${modKey}`,
            projManifest.project_id,
            modKey,
            modState.enabled ? 1 : 0,
            modulesDoc?.updated_at || nowIso
          )
        );
      }

      // Restore Sites under Config/Sites/{site_id}/
      const sitesParentId =
        projManifest.sites_folder_id ||
        configChildren.find((f) => f.name === 'Sites')?.id ||
        '';

      if (sitesParentId) {
        const siteFolders = await findDriveChildren(accessToken, { parentId: sitesParentId });
        for (const sf of siteFolders) {
          const sFiles = await findDriveChildren(accessToken, { parentId: sf.id });
          const siteMeta = sFiles.find((f) => f.name === SITE_MANIFEST_FILENAME);
          if (!siteMeta) continue;
          const { data: siteManifest } = await readDriveJsonWithConcurrency<SiteManifestDoc>(
            accessToken,
            siteMeta.id
          );
          if (!siteManifest || siteManifest.status === 'archived') continue;

          sitesRebuilt += 1;
          statements.push(
            env.DB.prepare(
              `INSERT INTO sites (
                 site_id, project_id, org_id, owner_id, site_slug, site_name, custom_domain,
                 status, active_publish_version, active_build_id, drive_config_folder_id,
                 canonical_revision, projected_at, projection_status, last_operation_id, drive_manifest_file_id,
                 created_at, updated_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?, ?)`
            ).bind(
              siteManifest.site_id,
              projManifest.project_id,
              orgManifest.organization_id,
              session.ownerId,
              siteManifest.site_slug,
              siteManifest.site_name || siteManifest.site_slug,
              siteManifest.custom_domain || null,
              siteManifest.status === 'published'
                ? 'published'
                : siteManifest.status === 'suspended'
                ? 'suspended'
                : 'draft',
              siteManifest.active_publish_version_id || '',
              siteManifest.active_build_id || '',
              siteManifest.folder_id || sf.id,
              siteManifest.revision || 1,
              nowIso,
              siteManifest.last_operation_id || '',
              siteMeta.id,
              siteManifest.created_at || nowIso,
              siteManifest.updated_at || nowIso
            )
          );

          if (siteManifest.status === 'published' && siteManifest.active_publish_version_id) {
            const pubFolderId =
              siteManifest.published_folder_id ||
              sFiles.find((f) => f.name === 'Published')?.id ||
              '';
            let snapshotFileId = '';
            let manifestFileId = '';
            let integrityHash = '';

            if (pubFolderId) {
              const pubFiles = await findDriveChildren(accessToken, { parentId: pubFolderId });
              const versionJsonFile = pubFiles.find(
                (f) => f.name === `${siteManifest.active_publish_version_id}.json`
              );
              const runtimeCfgFile = pubFiles.find((f) => f.name === 'runtime-config.json');
              const pubManFile = pubFiles.find((f) => f.name === 'publish-manifest.json');
              const chosenSnapFile = versionJsonFile || runtimeCfgFile;
              if (chosenSnapFile) {
                snapshotFileId = chosenSnapFile.id;
                const { data: snapData } = await readDriveJsonWithConcurrency<Record<string, unknown>>(
                  accessToken,
                  chosenSnapFile.id
                );
                const cleanSnap = scrubSnapshotForVisitor(snapData);
                integrityHash = String(cleanSnap.integrityHash || '');
                publishedArtifactsRebuilt += 1;

                statements.push(
                  env.DB.prepare(
                    `INSERT INTO public_runtime_artifacts (
                       site_id, publish_version, build_id, integrity_hash, snapshot_json, drive_file_id, indexed_at
                     ) VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(site_id, publish_version) DO UPDATE SET
                       snapshot_json = excluded.snapshot_json,
                       drive_file_id = excluded.drive_file_id,
                       indexed_at = excluded.indexed_at`
                  ).bind(
                    siteManifest.site_id,
                    siteManifest.active_publish_version_id,
                    siteManifest.active_build_id || String(cleanSnap.buildId || ''),
                    integrityHash,
                    JSON.stringify(cleanSnap),
                    chosenSnapFile.id,
                    nowIso
                  )
                );
              }
              manifestFileId = pubManFile?.id || siteMeta.id;
            }

            statements.push(
              env.DB.prepare(
                `INSERT INTO site_registry (
                   site_id, site_slug, custom_domain, owner_id, org_id, project_id, site_name,
                   status, active_publish_version, active_build_id,
                   publish_manifest_drive_file_id, runtime_config_drive_file_id,
                   integrity_hash, schema_version,
                   canonical_revision, indexed_at, last_verified_at, projection_status, last_operation_id,
                   updated_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, 1, ?, ?, ?, 'synced', ?, ?)`
              ).bind(
                siteManifest.site_id,
                siteManifest.site_slug,
                siteManifest.custom_domain || null,
                session.ownerId,
                orgManifest.organization_id,
                projManifest.project_id,
                siteManifest.site_name || siteManifest.site_slug,
                siteManifest.active_publish_version_id,
                siteManifest.active_build_id || '',
                manifestFileId,
                snapshotFileId,
                integrityHash,
                siteManifest.revision || 1,
                nowIso,
                nowIso,
                siteManifest.last_operation_id || '',
                nowIso
              )
            );
          }
        }
      }
    }
  }

  // Restore registered Drive & Spreadsheet resources from canonical System/resource-registry.json
  if (resourceRegistry?.resources?.length) {
    for (const r of resourceRegistry.resources) {
      if (r.status === 'deleted') continue;
      resourcesRebuilt += 1;
      statements.push(
        env.DB.prepare(
          `INSERT OR REPLACE INTO workspace_resources (
             resource_id, owner_id, org_id, project_id, site_id, resource_kind, resource_key,
             drive_file_id, spreadsheet_id, parent_folder_id, title, status,
             canonical_revision, last_operation_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          r.resource_id,
          session.ownerId,
          r.org_id,
          r.project_id,
          r.site_id,
          r.resource_type,
          r.resource_key,
          r.drive_file_id,
          r.spreadsheet_id,
          r.parent_folder_id,
          r.title,
          r.status === 'archived' ? 'archived' : r.status === 'legacy' ? 'legacy' : 'active',
          r.revision || 1,
          resourceRegistry.last_operation_id || '',
          r.updated_at || nowIso,
          nowIso
        )
      );
    }
  }

  await env.DB.batch(statements);

  return {
    ok: true,
    rootFolderId,
    organizationsRebuilt,
    projectsRebuilt,
    sitesRebuilt,
    publishedArtifactsRebuilt,
    resourcesRebuilt,
    rebuiltAt: nowIso,
  };
}

import { withMutationLock } from './mutationLockService';
import {
  mirrorOperationToD1,
  OperationJournalRecord,
  readDriveOperationJournal,
  readOperationFromD1,
  reconstructOperationFromDriveMarkers,
  writeDriveOperationJournal,
} from './operationJournalService';
import { bootstrapAccountDrive } from './driveManifestService';

export interface OperationRecoveryResult {
  ok: true;
  operationId: string;
  recovered: boolean;
  reconstructedFromMarkers: boolean;
  status: OperationJournalRecord['status'];
  discoveredResourcesCount: number;
  journal: OperationJournalRecord;
  rebuildSummary?: D1RebuildSummary;
}

/**
 * Forward recovery routine implementing docs/TRANSACTION_AND_RECOVERY.md Section 8:
 * 1. Authenticates & acquires a fresh Durable Object lease (recovering expired worker leases).
 * 2. Reads Drive Operation Journal (System/Operations/{opId}.json) or reconstructs from
 *    Drive appProperties.operation_id markers when journal is missing/incomplete.
 * 3. Stops safely in needs_reconciliation if duplicate/ambiguous candidates exist.
 * 4. Verifies parent relationships, finalizes reconstructed/resumed journal state,
 *    and rebuilds derived D1 operational projections from canonical Drive state.
 */
export async function recoverOperationFromDrive(
  env: WorkerEnv,
  session: VerifiedSession,
  operationId: string,
  options?: { selectedRootFolderId?: string }
): Promise<OperationRecoveryResult> {
  const cleanOpId = (operationId || '').trim();
  if (!cleanOpId) {
    throw new BuillyTransactionError('RESOURCE_NOT_FOUND', 'operationId is required for recovery.');
  }

  let accessToken: string;
  try {
    const minted = await mintOwnerGoogleAccessToken(env, session.ownerId);
    accessToken = minted.accessToken;
  } catch {
    throw new BuillyTransactionError(
      'WRITE_DISABLED_OAUTH_UNAVAILABLE',
      'Google Workspace connection is required to recover operations from Drive.',
      { operationId: cleanOpId, retryable: false }
    );
  }

  const d1Existing = await readOperationFromD1(env.DB, session.ownerId, cleanOpId);
  const scopeKey = d1Existing?.journal.scope_key || `account:${session.ownerId}`;

  return withMutationLock(
    env,
    { scopeKey, operationId: cleanOpId },
    async (lock) => {
      const boot = await bootstrapAccountDrive(env, accessToken, session.ownerId, {
        selectedRootFolderId: options?.selectedRootFolderId,
        operationId: cleanOpId,
      });

      const driveJournalRes = await readDriveOperationJournal(
        accessToken,
        boot.operationsFolderId,
        cleanOpId
      ).catch((err) => {
        if (err instanceof BuillyTransactionError && err.code === 'DUPLICATE_RESOURCE_CANDIDATES') {
          throw err;
        }
        return null;
      });

      const markers = await reconstructOperationFromDriveMarkers(
        accessToken,
        cleanOpId,
        boot.rootFolderId
      );

      let journal: OperationJournalRecord | null =
        driveJournalRes?.journal || d1Existing?.journal || null;
      let journalFileId = driveJournalRes?.fileId || d1Existing?.driveJournalFileId || '';
      const reconstructedFromMarkers = !driveJournalRes && markers.discoveredResources.length > 0;
      const nowIso = new Date().toISOString();

      if (markers.ambiguous) {
        const reconciledJournal: OperationJournalRecord = journal
          ? {
              ...journal,
              status: 'needs_reconciliation',
              error: {
                code: 'DUPLICATE_RESOURCE_CANDIDATES',
                message: markers.reason || 'Ambiguous duplicate Drive resources found during recovery.',
                retryable: false,
              },
              fencing_token: lock.fencingToken,
              updated_at: nowIso,
            }
          : {
              schema_version: 1,
              operation_id: cleanOpId,
              operation_type: 'RECOVERED_MARKER_OPERATION',
              account_id: session.ownerId,
              scope_key: scopeKey,
              payload_hash: 'reconstructed',
              status: 'needs_reconciliation',
              target: {},
              steps: [
                {
                  key: 'reconstruct_markers',
                  status: 'needs_reconciliation',
                  detail: markers.reason || 'Duplicate Drive candidates detected.',
                },
              ],
              discovered_ids: {},
              error: {
                code: 'DUPLICATE_RESOURCE_CANDIDATES',
                message: markers.reason || 'Ambiguous duplicate Drive resources found during recovery.',
                retryable: false,
              },
              fencing_token: lock.fencingToken,
              created_at: nowIso,
              updated_at: nowIso,
            };

        journalFileId = await writeDriveOperationJournal(
          accessToken,
          boot.operationsFolderId,
          reconciledJournal,
          journalFileId || undefined
        ).catch(() => journalFileId);
        await mirrorOperationToD1(env.DB, reconciledJournal, journalFileId, lock.expiresAt);

        throw new BuillyTransactionError(
          'NEEDS_RECONCILIATION',
          markers.reason || 'Ambiguous Drive candidates discovered during recovery.',
          {
            operationId: cleanOpId,
            details: {
              needsReconciliation: true,
              candidates: markers.discoveredResources.map((f) => ({
                id: f.id,
                name: f.name,
                parents: f.parents,
              })),
            },
          }
        );
      }

      if (!journal && markers.discoveredResources.length === 0) {
        throw new BuillyTransactionError(
          'RESOURCE_NOT_FOUND',
          `No Drive journal or stamped resources found for operation "${cleanOpId}".`,
          { operationId: cleanOpId }
        );
      }

      if (!journal) {
        journal = {
          schema_version: 1,
          operation_id: cleanOpId,
          operation_type: 'RECONSTRUCTED_FROM_MARKERS',
          account_id: session.ownerId,
          scope_key: scopeKey,
          payload_hash: 'reconstructed',
          status: 'in_progress',
          target: {},
          steps: markers.discoveredResources.map((resFile) => ({
            key: `discovered_${resFile.appProperties?.resource_type || resFile.id}`,
            status: 'completed',
            resource_id: resFile.appProperties?.resource_id || resFile.id,
            drive_file_id: resFile.id,
            parent_id: resFile.parents?.[0],
            verified_at: nowIso,
          })),
          discovered_ids: Object.fromEntries(
            markers.discoveredResources.map((f) => [
              f.appProperties?.resource_type || f.id,
              f.id,
            ])
          ),
          fencing_token: lock.fencingToken,
          created_at: nowIso,
          updated_at: nowIso,
        };
      }

      // Mark any steps whose Drive artifacts are already confirmed via markers as completed
      const markerByResourceId = new Map(
        markers.discoveredResources.map((f) => [f.appProperties?.resource_id || '', f])
      );
      for (const step of journal.steps) {
        if (step.status !== 'completed') {
          const matched =
            (step.resource_id && markerByResourceId.get(step.resource_id)) ||
            (step.drive_file_id && markers.discoveredResources.find((f) => f.id === step.drive_file_id));
          if (matched) {
            step.status = 'completed';
            step.drive_file_id = matched.id;
            step.parent_id = matched.parents?.[0] || step.parent_id;
            step.verified_at = nowIso;
          }
        }
      }

      journal.status = 'completed';
      journal.error = undefined;
      journal.fencing_token = lock.fencingToken;
      journal.updated_at = nowIso;

      journalFileId = await writeDriveOperationJournal(
        accessToken,
        boot.operationsFolderId,
        journal,
        journalFileId || undefined
      );
      await mirrorOperationToD1(env.DB, journal, journalFileId, lock.expiresAt);

      // Rebuild D1 projections and clear any pending repair queue items for this operation
      const rebuildSummary = await rebuildD1FromDrive(env, session, {
        selectedRootFolderId: boot.rootFolderId,
      });

      await env.DB.prepare(
        `UPDATE projection_repair_queue
         SET status = 'completed', last_error = '', updated_at = ?
         WHERE operation_id = ? AND owner_id = ?`
      )
        .bind(nowIso, cleanOpId, session.ownerId)
        .run()
        .catch(() => undefined);

      return {
        ok: true,
        operationId: cleanOpId,
        recovered: true,
        reconstructedFromMarkers,
        status: journal.status,
        discoveredResourcesCount: markers.discoveredResources.length,
        journal,
        rebuildSummary,
      };
    }
  );
}

