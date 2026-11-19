import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLockDO } from '../do/WorkspaceLockDO';
import { handleConsoleApiRequest } from '../routes/consoleApi';
import { handleOwnerPublishSite } from '../routes/ownerPublish';
import { handleGetProjectCms, handleSaveProjectCms } from '../routes/projectCms';
import { handlePublicCmsQuery, handlePublicGetRuntimeSnapshot } from '../routes/publicRuntime';
import { handleSheetsReadValues } from '../routes/sheets';
import { bootstrapAccountDrive } from '../services/driveManifestService';
import { ensureMarkerFolder, writeCanonicalDriveJson } from '../services/driveCanonicalClient';
import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import {
  clearInMemoryLocksForTest,
  expireInMemoryLockForTest,
  withMutationLock,
} from '../services/mutationLockService';
import {
  OperationJournalRecord,
  readDriveOperationJournal,
  runSagaWithJournal,
  writeDriveOperationJournal,
} from '../services/operationJournalService';
import {
  processProjectionRepairQueue,
  rebuildD1FromDrive,
  recoverOperationFromDrive,
} from '../services/projectionRepairService';
import { BuillyTransactionError } from '../services/transactionErrors';
import {
  archiveOrganization,
  archiveProject,
  createOrganization,
  createProject,
  createSiteInProject,
  deleteOrganization,
  deleteProject,
  updateOrganization,
  updateProject,
} from '../services/workspaceHierarchyService';
import { VerifiedSession, WorkerEnv } from '../types';
import {
  createInMemoryMockD1,
  createStatefulGoogleAndAuthFetchMock,
  createTestEnv,
  seedConnectedCredential,
} from './testHelpers';

const ALICE: VerifiedSession = { ownerId: 'user_alice', email: 'alice@studio.com' };

function makeJsonReq(path: string, method: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: {
      Authorization: 'Bearer token_alice',
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Drive-First Transaction & Recovery Acceptance Suite (T1–T14)', () => {
  let mockD1: ReturnType<typeof createInMemoryMockD1>;
  let googleMock: ReturnType<typeof createStatefulGoogleAndAuthFetchMock>;
  let env: WorkerEnv;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    clearInMemoryLocksForTest();
    mockD1 = createInMemoryMockD1();
    googleMock = createStatefulGoogleAndAuthFetchMock({ ownerA: ALICE });
    globalThis.fetch = googleMock.fetch;
    env = createTestEnv(mockD1.db);
    await seedConnectedCredential(mockD1, env, ALICE);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    clearInMemoryLocksForTest();
  });

  it('T1: submits the same operation 5 times -> creates 1 resource and returns the exact same ID without duplicate Drive folders', async () => {
    const opId = 'op_t1_create_org_same';
    const results = [];
    for (let i = 0; i < 5; i++) {
      const res = await handleConsoleApiRequest(
        makeJsonReq(
          '/api/console/organizations',
          'POST',
          { name: 'Studio Alpha', operationId: opId },
          { 'Idempotency-Key': opId }
        ),
        env,
        '/api/console/organizations'
      );
      expect([200, 201]).toContain(res!.status);
      results.push((await res!.json()) as { organization: { org_id: string }; deduplicated: boolean });
    }

    const firstOrgId = results[0].organization.org_id;
    expect(results[0].deduplicated).toBe(false);
    for (let i = 1; i < 5; i++) {
      expect(results[i].organization.org_id).toBe(firstOrgId);
      expect(results[i].deduplicated).toBe(true);
    }

    expect(mockD1.tables.organizations).toHaveLength(1);
    const orgFolders = Array.from(googleMock.driveFiles.values()).filter(
      (f) => !f.trashed && f.appProperties?.resource_type === 'org_root'
    );
    expect(orgFolders).toHaveLength(1);
  });

  it('T2: reuses same operationId/Idempotency-Key with a different payload -> fails with 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const opId = 'op_t2_mismatch';
    const res1 = await handleConsoleApiRequest(
      makeJsonReq('/api/console/organizations', 'POST', {
        name: 'First Studio',
        operationId: opId,
      }),
      env,
      '/api/console/organizations'
    );
    expect(res1!.status).toBe(201);

    const res2 = await handleConsoleApiRequest(
      makeJsonReq('/api/console/organizations', 'POST', {
        name: 'Completely Different Studio',
        operationId: opId,
      }),
      env,
      '/api/console/organizations'
    );
    expect(res2!.status).toBe(409);
    const body2 = (await res2!.json()) as { code: string };
    expect(body2.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(mockD1.tables.organizations).toHaveLength(1);
  });

  it('T3: simulated Drive 503 after creating folder -> retries and reuses existing folder via appProperties without duplicates', async () => {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, ALICE.ownerId);
    const boot = await bootstrapAccountDrive(env, accessToken, ALICE.ownerId, {
      operationId: 'op_t3_boot',
    });

    // Case A: folder created on Drive on attempt 1 before Drive returns 503 -> bounded retry finds it by resource_id marker
    const createdInsideFaultIds: string[] = [];
    googleMock.addFaultRule({
      remaining: 1,
      status: 503,
      match: (url, method, bodyText) =>
        url.startsWith('https://www.googleapis.com/drive/v3/files?') &&
        method === 'POST' &&
        bodyText.includes('org_t3_res'),
      sideEffectBeforeFail: ({ bodyText }) => {
        const parsed = JSON.parse(bodyText) as {
          name: string;
          parents?: string[];
          appProperties?: Record<string, string>;
        };
        const createdId = googleMock.createFolderDirect({
          name: parsed.name,
          parentId: parsed.parents?.[0] || boot.organizationsFolderId,
          appProperties: parsed.appProperties,
        });
        createdInsideFaultIds.push(createdId);
      },
    });

    const folderCallsBefore = googleMock.stats.driveFolderCreateCalls;
    const ensuredA = await ensureMarkerFolder(accessToken, {
      parentId: boot.organizationsFolderId,
      name: 'org_t3_res',
      operationId: 'op_t3_case_a',
      appProperties: {
        operation_id: 'op_t3_case_a',
        resource_id: 'org_t3_res',
        resource_type: 'org_root',
      },
    });

    expect(ensuredA.folder.id).toBe(createdInsideFaultIds[0]);
    expect(ensuredA.created).toBe(false);
    expect(googleMock.stats.driveFolderCreateCalls).toBe(folderCallsBefore);

    // Case B: retries exhausted (3 consecutive 503s before caller gives up, then delayed Drive materialization lands)
    // -> caller receives DRIVE_TRANSIENT_ERROR, then explicit caller retry discovers and reuses same folder cleanly
    googleMock.addFaultRule({
      remaining: 3,
      status: 503,
      match: (url, method, bodyText) =>
        url.startsWith('https://www.googleapis.com/drive/v3/files?') &&
        method === 'POST' &&
        bodyText.includes('org_t3_exhausted'),
    });

    await expect(
      ensureMarkerFolder(accessToken, {
        parentId: boot.organizationsFolderId,
        name: 'org_t3_exhausted',
        operationId: 'op_t3_case_b',
        appProperties: {
          operation_id: 'op_t3_case_b',
          resource_id: 'org_t3_exhausted',
          resource_type: 'org_root',
        },
      })
    ).rejects.toThrow(/unavailable|Failed to create/i);

    const delayedFolderId = googleMock.createFolderDirect({
      name: 'org_t3_exhausted',
      parentId: boot.organizationsFolderId,
      appProperties: {
        operation_id: 'op_t3_case_b',
        resource_id: 'org_t3_exhausted',
        resource_type: 'org_root',
      },
    });
    const exhaustedIds = [delayedFolderId];

    const recovered = await ensureMarkerFolder(accessToken, {
      parentId: boot.organizationsFolderId,
      name: 'org_t3_exhausted',
      operationId: 'op_t3_case_b',
      appProperties: {
        operation_id: 'op_t3_case_b',
        resource_id: 'org_t3_exhausted',
        resource_type: 'org_root',
      },
    });
    expect(recovered.folder.id).toBe(exhaustedIds[0]);
    expect(recovered.created).toBe(false);
    const matchingFolders = Array.from(googleMock.driveFiles.values()).filter(
      (f) => f.appProperties?.resource_id === 'org_t3_exhausted' && !f.trashed
    );
    expect(matchingFolders).toHaveLength(1);
  });

  it('T4: simulated worker crash mid-saga after step 2 -> retry reads journal, skips steps 1–2, completes step 3', async () => {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, ALICE.ownerId);
    const boot = await bootstrapAccountDrive(env, accessToken, ALICE.ownerId, {
      operationId: 'op_t4_boot',
    });

    let step1Runs = 0;
    let step2Runs = 0;
    let step3Runs = 0;
    let projectionUpdated = 0;
    let shouldCrashStep3 = true;

    const runMultiStepSaga = () =>
      runSagaWithJournal(env, {
        operationId: 'op_t4_crash_resume',
        operationType: 'TEST_MULTI_STEP',
        ownerId: ALICE.ownerId,
        scopeKey: `account:${ALICE.ownerId}`,
        payloadForHash: { task: 't4_saga' },
        target: { project_id: 'prj_t4' },
        accessToken,
        initialOperationsFolderId: boot.operationsFolderId,
        repairResourceType: 'project',
        repairResourceId: 'prj_t4',
        steps: [
          {
            key: 'step_1',
            async run(ctx) {
              step1Runs += 1;
              ctx.setDiscoveredId('step1_id', 'val_1');
              return { resource_id: 'res_1' };
            },
          },
          {
            key: 'step_2',
            async run(ctx) {
              step2Runs += 1;
              ctx.setDiscoveredId('step2_id', 'val_2');
              return { resource_id: 'res_2' };
            },
          },
          {
            key: 'step_3',
            async run() {
              step3Runs += 1;
              if (shouldCrashStep3) {
                throw new BuillyTransactionError('DRIVE_TRANSIENT_ERROR', 'Simulated crash at step 3', {
                  operationId: 'op_t4_crash_resume',
                  retryable: true,
                });
              }
              return { resource_id: 'res_3' };
            },
          },
        ],
        buildResult(ctx) {
          return {
            ok: true,
            s1: ctx.getDiscoveredId('step1_id'),
            s2: ctx.getDiscoveredId('step2_id'),
          };
        },
        async updateProjection() {
          projectionUpdated += 1;
        },
      });

    await expect(runMultiStepSaga()).rejects.toMatchObject({ code: 'DRIVE_TRANSIENT_ERROR' });
    expect(step1Runs).toBe(1);
    expect(step2Runs).toBe(1);
    expect(step3Runs).toBe(1);
    expect(projectionUpdated).toBe(0);

    // Journal persisted on Drive with steps 1 & 2 completed and step 3 failed
    const midJournal = await readDriveOperationJournal(
      accessToken,
      boot.operationsFolderId,
      'op_t4_crash_resume'
    );
    expect(midJournal).not.toBeNull();
    expect(midJournal!.journal.steps.find((s) => s.key === 'step_1')?.status).toBe('completed');
    expect(midJournal!.journal.steps.find((s) => s.key === 'step_2')?.status).toBe('completed');
    expect(midJournal!.journal.steps.find((s) => s.key === 'step_3')?.status).toBe('failed');

    // Resume on fresh worker invocation
    shouldCrashStep3 = false;
    const resumed = await runMultiStepSaga();
    expect(resumed.ok).toBe(true);
    expect(resumed.s1).toBe('val_1');
    expect(resumed.s2).toBe('val_2');
    expect(step1Runs).toBe(1); // skipped!
    expect(step2Runs).toBe(1); // skipped!
    expect(step3Runs).toBe(2); // retried step 3 only!
    expect(projectionUpdated).toBe(1);
  });

  it('T5: simulated Drive failure writing Operation Journal after Drive stored it -> discovers and reuses existing journal without duplicate', async () => {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, ALICE.ownerId);
    const boot = await bootstrapAccountDrive(env, accessToken, ALICE.ownerId, {
      operationId: 'op_t5_boot',
    });

    const journalDoc: OperationJournalRecord = {
      schema_version: 1,
      operation_id: 'op_t5_journal_timeout',
      operation_type: 'TEST_JOURNAL',
      account_id: ALICE.ownerId,
      scope_key: `account:${ALICE.ownerId}`,
      payload_hash: 'sha256:abc',
      status: 'in_progress',
      target: {},
      steps: [],
      discovered_ids: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let createdJournalId = '';
    googleMock.addFaultRule({
      remaining: 3, // exhaust write retry loop -> triggers DRIVE_TRANSIENT_ERROR fallback in writeDriveOperationJournal
      status: 503,
      match: (url, method, bodyText) =>
        url.startsWith('https://www.googleapis.com/upload/drive/v3/files') &&
        method === 'POST' &&
        bodyText.includes('op_t5_journal_timeout.json'),
      sideEffectBeforeFail: () => {
        if (!createdJournalId) {
          createdJournalId = googleMock.createFileDirect({
            name: 'op_t5_journal_timeout.json',
            parentId: boot.operationsFolderId,
            content: JSON.stringify(journalDoc, null, 2),
            appProperties: {
              operation_id: 'op_t5_journal_timeout',
              resource_id: 'op_t5_journal_timeout',
              resource_type: 'operation_journal',
              schema_version: '1',
            },
          });
        }
      },
    });

    const recoveredFileId = await writeDriveOperationJournal(
      accessToken,
      boot.operationsFolderId,
      journalDoc
    );
    expect(recoveredFileId).toBe(createdJournalId);

    const journalFiles = Array.from(googleMock.driveFiles.values()).filter(
      (f) => f.appProperties?.operation_id === 'op_t5_journal_timeout' && !f.trashed
    );
    expect(journalFiles).toHaveLength(1);
  });

  it('T6: missing Drive Operation Journal -> recoverOperationFromDrive reconstructs from appProperties.operation_id markers and halts cleanly on duplicates', async () => {
    const orgRes = await createOrganization(env, ALICE, {
      name: 'Marked Org',
      operationId: 'op_t6_org',
    });
    const orgId = orgRes.organization.org_id;

    // Delete the Drive Operation Journal file + clear operations_projection in D1
    for (const [id, file] of googleMock.driveFiles.entries()) {
      if (
        file.appProperties?.resource_type === 'operation_journal' &&
        file.appProperties?.operation_id === 'op_t6_org'
      ) {
        googleMock.driveFiles.delete(id);
      }
    }
    const opProjIdx = mockD1.tables.operationsProjection.findIndex(
      (o) => o.operation_id === 'op_t6_org'
    );
    if (opProjIdx >= 0) mockD1.tables.operationsProjection.splice(opProjIdx, 1);

    const recovery = await recoverOperationFromDrive(env, ALICE, 'op_t6_org');
    expect(recovery.ok).toBe(true);
    expect(recovery.recovered).toBe(true);
    expect(recovery.reconstructedFromMarkers).toBe(true);
    expect(recovery.discoveredResourcesCount).toBeGreaterThanOrEqual(1);
    expect(mockD1.tables.organizations.some((o) => o.org_id === orgId)).toBe(true);

    // Duplicate resource markers with the same operation_id must halt in NEEDS_RECONCILIATION
    const { accessToken } = await mintOwnerGoogleAccessToken(env, ALICE.ownerId);
    const boot = await bootstrapAccountDrive(env, accessToken, ALICE.ownerId);
    googleMock.createFolderDirect({
      name: `${orgId}_duplicate`,
      parentId: boot.organizationsFolderId,
      appProperties: {
        operation_id: 'op_t6_org',
        resource_id: orgId,
        resource_type: 'org_root',
      },
    });
    for (const [id, file] of googleMock.driveFiles.entries()) {
      if (
        file.appProperties?.resource_type === 'operation_journal' &&
        file.appProperties?.operation_id === 'op_t6_org'
      ) {
        googleMock.driveFiles.delete(id);
      }
    }

    await expect(recoverOperationFromDrive(env, ALICE, 'op_t6_org')).rejects.toMatchObject({
      code: 'NEEDS_RECONCILIATION',
      status: 409,
    });
  });

  it('T7: concurrent updates with identical expectedRevision -> one succeeds and one fails with 409 REVISION_CONFLICT', async () => {
    const created = await createOrganization(env, ALICE, {
      name: 'Concurrent Studio',
      operationId: 'op_t7_create',
    });
    const orgId = created.organization.org_id;

    const [r1, r2] = await Promise.allSettled([
      updateOrganization(env, ALICE, orgId, {
        name: 'Studio Update A',
        expectedRevision: 1,
        operationId: 'op_t7_upd_a',
      }),
      updateOrganization(env, ALICE, orgId, {
        name: 'Studio Update B',
        expectedRevision: 1,
        operationId: 'op_t7_upd_b',
      }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BuillyTransactionError);
    expect((rejected[0].reason as BuillyTransactionError).code).toBe('REVISION_CONFLICT');
    expect((rejected[0].reason as BuillyTransactionError).status).toBe(409);
  });

  it('T8: external Drive edit detected via revision/ETag (If-Match 412) -> fails 409 REVISION_CONFLICT without overwriting external edit', async () => {
    const created = await createOrganization(env, ALICE, {
      name: 'Original Studio',
      operationId: 'op_t8_create',
    });
    const orgId = created.organization.org_id;
    const manifestFileId = created.organization.drive_manifest_file_id!;

    // Scenario 1: External user edited organization.json directly in Drive (bumped revision & content)
    googleMock.tamperDriveJson(manifestFileId, (doc) => ({
      ...doc,
      name: 'Externally Edited Studio',
      revision: 9,
      external_note: 'keep-me',
    }));

    await expect(
      updateOrganization(env, ALICE, orgId, {
        name: 'Should Not Overwrite',
        expectedRevision: 1,
        operationId: 'op_t8_overwrite_attempt',
      })
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      status: 409,
    });

    // Verify external edit was preserved intact in Drive
    const rawFile = googleMock.driveFiles.get(manifestFileId);
    const savedDoc = JSON.parse(rawFile!.content!) as Record<string, unknown>;
    expect(savedDoc.name).toBe('Externally Edited Studio');
    expect(savedDoc.external_note).toBe('keep-me');

    // Scenario 2: Direct ETag mismatch (HTTP 412 If-Match) when ETag changes between read and write
    const prj = await createProject(env, ALICE, orgId, {
      name: 'ETag Project',
      operationId: 'op_t8_prj',
    });
    const { accessToken } = await mintOwnerGoogleAccessToken(env, ALICE.ownerId);
    const staleEtag = googleMock.driveFiles.get(prj.project.drive_manifest_file_id!)!.etag;
    googleMock.tamperDriveJson(prj.project.drive_manifest_file_id!, (doc) => ({
      ...doc,
      name: 'External ETag Edit',
    }));

    await expect(
      writeCanonicalDriveJson(accessToken, {
        parentId: prj.project.drive_folder_id,
        fileName: 'project.json',
        payload: { project_id: prj.project.project_id, revision: 2 },
        knownFileId: prj.project.drive_manifest_file_id,
        expectedEtag: staleEtag,
        operationId: 'op_t8_etag_write',
        appProperties: {
          operation_id: 'op_t8_etag_write',
          resource_id: prj.project.project_id,
          resource_type: 'project_manifest',
        },
      })
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      status: 409,
    });
  });

  it('T9: D1 projection failure after Drive commit -> returns canonicalCommitted + PROJECTION_REPAIR_PENDING, then repair queue restores D1', async () => {
    const orgRes = await createOrganization(env, ALICE, {
      name: 'Repair Studio',
      operationId: 'op_t9_org',
    });
    const orgId = orgRes.organization.org_id;

    // Inject D1 failure specifically when inserting project projection
    mockD1.failNextStatementMatching(/INSERT INTO projects/, 'D1_PROJECTION_OUTAGE', 1);

    const prjRes = await createProject(env, ALICE, orgId, {
      name: 'Project Unprojected',
      operationId: 'op_t9_prj',
    });

    expect(prjRes.canonicalCommitted).toBe(true);
    expect(prjRes.projectionStatus).toBe('PROJECTION_REPAIR_PENDING');
    expect(mockD1.tables.projects.some((p) => p.project_id === prjRes.project.project_id)).toBe(false);
    expect(mockD1.tables.projectionRepairQueue).toHaveLength(1);
    expect(mockD1.tables.projectionRepairQueue[0].status).toBe('pending');
    expect(mockD1.tables.projectionRepairQueue[0].operation_id).toBe('op_t9_prj');

    // Run projection repair worker
    const repairResult = await processProjectionRepairQueue(env, ALICE);
    expect(repairResult.completed).toBe(1);
    expect(mockD1.tables.projects.some((p) => p.project_id === prjRes.project.project_id)).toBe(true);
    expect(mockD1.tables.projectionRepairQueue[0].status).toBe('completed');
  });

  it('T10: wiping D1 derived tables -> rebuildD1FromDrive restores Orgs, Projects, Modules, Sites, site_registry, and public artifacts', async () => {
    const orgRes = await createOrganization(env, ALICE, {
      name: 'Canonical Org',
      operationId: 'op_t10_org',
    });
    const prjRes = await createProject(env, ALICE, orgRes.organization.org_id, {
      name: 'Canonical Project',
      enabledModules: ['builder', 'cms', 'publishing'],
      operationId: 'op_t10_prj',
    });
    const siteRes = await createSiteInProject(env, ALICE, prjRes.project.project_id, {
      siteName: 'Rebuild Site',
      siteSlug: 'rebuild-site',
      operationId: 'op_t10_site',
    });

    const pubRes = await handleOwnerPublishSite(
      makeJsonReq('/api/sites/rebuild-site/publish', 'POST', {
        siteId: siteRes.site.site_id,
        projectId: prjRes.project.project_id,
        siteName: 'Rebuild Site',
        operationId: 'op_t10_pub',
        snapshot: {
          siteId: siteRes.site.site_id,
          siteSlug: 'rebuild-site',
          buildId: 'bld_t10',
          publishVersion: 'ver_t10',
          integrityHash: 'sha256_t10',
          pages: [{ id: 'home', path: '/', title: 'Home' }],
          ownerId: ALICE.ownerId,
          spreadsheetId: 'secret_ss',
        },
      }),
      env,
      'rebuild-site'
    );
    expect(pubRes.status).toBe(200);

    // Wipe derived D1 tables completely (preserving only encrypted OAuth credentials)
    mockD1.tables.organizations.length = 0;
    mockD1.tables.members.length = 0;
    mockD1.tables.projects.length = 0;
    mockD1.tables.projectModules.length = 0;
    mockD1.tables.sites.length = 0;
    mockD1.tables.siteRegistry.length = 0;
    mockD1.tables.publicRuntimeArtifacts.length = 0;
    mockD1.tables.resources.length = 0;

    const rebuild = await rebuildD1FromDrive(env, ALICE);
    expect(rebuild.ok).toBe(true);
    expect(rebuild.organizationsRebuilt).toBe(1);
    expect(rebuild.projectsRebuilt).toBe(1);
    expect(rebuild.sitesRebuilt).toBe(1);
    expect(rebuild.publishedArtifactsRebuilt).toBe(1);

    expect(mockD1.tables.organizations[0].org_id).toBe(orgRes.organization.org_id);
    expect(mockD1.tables.projects[0].project_id).toBe(prjRes.project.project_id);
    expect(mockD1.tables.sites[0].site_id).toBe(siteRes.site.site_id);
    expect(mockD1.tables.siteRegistry[0].active_publish_version).toBe('ver_t10');
    const restoredSnap = JSON.parse(mockD1.tables.publicRuntimeArtifacts[0].snapshot_json) as Record<
      string,
      unknown
    >;
    expect(restoredSnap.ownerId).toBeUndefined();
    expect(restoredSnap.spreadsheetId).toBeUndefined();
  });

  it('T11: wrong parent_id (PARENT_MISMATCH) & duplicate Drive candidates (DUPLICATE_RESOURCE_CANDIDATES) -> stops safely in needs_reconciliation without trashing', async () => {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, ALICE.ownerId);
    const boot = await bootstrapAccountDrive(env, accessToken, ALICE.ownerId, {
      operationId: 'op_t11_boot',
    });

    // Case A: unrelated folder outside Builly/Organizations
    const unrelatedParent = googleMock.createFolderDirect({ name: 'Elsewhere', parentId: 'root' });
    const strayOrgFolder = googleMock.createFolderDirect({
      name: 'stray_org',
      parentId: unrelatedParent,
    });

    const badOrg = await createOrganization(env, ALICE, {
      name: 'Org Wrong Parent',
      operationId: 'op_t11_org',
    });
    await archiveOrganization(env, ALICE, badOrg.organization.org_id, {
      operationId: 'op_t11_arch',
    });
    // Point D1 drive_folder_id at stray folder outside Builly/Organizations
    mockD1.tables.organizations.find((o) => o.org_id === badOrg.organization.org_id)!.drive_folder_id =
      strayOrgFolder;

    await expect(
      deleteOrganization(env, ALICE, badOrg.organization.org_id, {
        confirmPermanentDelete: true,
        operationId: 'op_t11_del',
      })
    ).rejects.toMatchObject({
      code: 'PARENT_MISMATCH',
      status: 409,
    });
    expect(googleMock.driveFiles.get(strayOrgFolder)!.trashed).toBe(false);

    // Case B: duplicate resource candidates with same resource_id
    googleMock.createFolderDirect({
      name: 'dup_folder_1',
      parentId: boot.organizationsFolderId,
      appProperties: { resource_id: 'dup_res_t11' },
    });
    googleMock.createFolderDirect({
      name: 'dup_folder_2',
      parentId: boot.organizationsFolderId,
      appProperties: { resource_id: 'dup_res_t11' },
    });

    await expect(
      runSagaWithJournal(env, {
        operationId: 'op_t11_dup_saga',
        operationType: 'TEST_DUP_CANDIDATE',
        ownerId: ALICE.ownerId,
        scopeKey: `account:${ALICE.ownerId}`,
        payloadForHash: { dup: true },
        target: {},
        accessToken,
        initialOperationsFolderId: boot.operationsFolderId,
        repairResourceType: 'organization',
        repairResourceId: 'dup_res_t11',
        steps: [
          {
            key: 'find_dup',
            async run(ctx) {
              await ensureMarkerFolder(ctx.accessToken, {
                parentId: boot.organizationsFolderId,
                name: 'dup_folder_1',
                operationId: ctx.operationId,
                appProperties: { resource_id: 'dup_res_t11' },
              });
            },
          },
        ],
        buildResult: () => ({ ok: true }),
        updateProjection: async () => undefined,
      })
    ).rejects.toMatchObject({
      code: 'DUPLICATE_RESOURCE_CANDIDATES',
      status: 409,
    });

    const journalEntry = mockD1.tables.operationsProjection.find(
      (o) => o.operation_id === 'op_t11_dup_saga'
    );
    expect(journalEntry?.status).toBe('needs_reconciliation');
  });

  it('T12: OAuth outage -> writes rejected 503 WRITE_DISABLED_OAUTH_UNAVAILABLE, cached reads return stale/lastSyncedAt, uncached reads return 503', async () => {
    const orgRes = await createOrganization(env, ALICE, {
      name: 'Outage Studio',
      operationId: 'op_t12_org',
    });
    const prjRes = await createProject(env, ALICE, orgRes.organization.org_id, {
      name: 'Cached Project',
      operationId: 'op_t12_prj',
    });

    // Save CMS while connected to populate cache
    const saveCmsRes = await handleSaveProjectCms(
      makeJsonReq(`/api/console/projects/${prjRes.project.project_id}/cms/save`, 'POST', {
        operationId: 'op_t12_cms_save',
        document: {
          schemaVersion: 1,
          contentTypes: [{ id: 'posts', name: 'Posts', fields: [] }],
          records: [{ recordId: 'rec_1', contentTypeId: 'posts', title: 'Cached Post', slug: 'cached' }],
        },
      }),
      env,
      ALICE,
      prjRes.project.project_id
    );
    expect(saveCmsRes.status).toBe(200);

    // Warm bootstrap cache
    const bootResOnline = await handleConsoleApiRequest(
      makeJsonReq('/api/console/bootstrap', 'GET'),
      env,
      '/api/console/bootstrap'
    );
    expect(bootResOnline!.status).toBe(200);

    // Trigger OAuth outage (needs_reauth)
    mockD1.tables.credentials[0].status = 'needs_reauth';

    // 1. Write must be blocked with 503 WRITE_DISABLED_OAUTH_UNAVAILABLE
    const blockedWrite = await handleConsoleApiRequest(
      makeJsonReq('/api/console/organizations', 'POST', { name: 'Blocked Org' }),
      env,
      '/api/console/organizations'
    );
    expect(blockedWrite!.status).toBe(503);
    const blockedBody = (await blockedWrite!.json()) as { code: string };
    expect(blockedBody.code).toBe('WRITE_DISABLED_OAUTH_UNAVAILABLE');

    // 2. Cached CMS read -> returns HTTP 200 readOnly: true, stale: true, lastSyncedAt
    const cachedCmsRes = await handleGetProjectCms(
      makeJsonReq(`/api/console/projects/${prjRes.project.project_id}/cms`, 'GET'),
      env,
      ALICE,
      prjRes.project.project_id
    );
    expect(cachedCmsRes.status).toBe(200);
    const cachedCmsBody = (await cachedCmsRes.json()) as {
      readOnly: boolean;
      stale: boolean;
      workspaceConnected: boolean;
      lastSyncedAt: string;
      document: { records: unknown[] };
    };
    expect(cachedCmsBody.workspaceConnected).toBe(false);
    expect(cachedCmsBody.readOnly).toBe(true);
    expect(cachedCmsBody.stale).toBe(true);
    expect(cachedCmsBody.lastSyncedAt).toBeTruthy();
    expect(cachedCmsBody.document.records).toHaveLength(1);

    // 3. Cached bootstrap read -> returns readOnly: true, stale: true
    const cachedBootRes = await handleConsoleApiRequest(
      makeJsonReq('/api/console/bootstrap', 'GET'),
      env,
      '/api/console/bootstrap'
    );
    const cachedBoot = (await cachedBootRes!.json()) as {
      readOnly: boolean;
      stale: boolean;
      organizations: unknown[];
    };
    expect(cachedBoot.readOnly).toBe(true);
    expect(cachedBoot.stale).toBe(true);
    expect(cachedBoot.organizations).toHaveLength(1);

    // 4. Uncached CMS read -> returns 503 unavailable (never claims empty dataset!)
    mockD1.tables.managementCache.length = 0;
    const missCmsRes = await handleGetProjectCms(
      makeJsonReq(`/api/console/projects/${prjRes.project.project_id}/cms`, 'GET'),
      env,
      ALICE,
      prjRes.project.project_id
    );
    expect(missCmsRes.status).toBe(503);
    const missCmsBody = (await missCmsRes.json()) as { unavailable: boolean; code: string };
    expect(missCmsBody.unavailable).toBe(true);
    expect(missCmsBody.code).toBe('WRITE_DISABLED_OAUTH_UNAVAILABLE');
  });

  it('T13: expired Durable Object lock lease -> new worker acquires higher monotonic fencingToken while stale worker fails LOCK_OWNERSHIP_LOST', async () => {
    // 1. Direct Durable Object instance verification
    const storageMap = new Map<string, unknown>();
    const doInstance = new WorkspaceLockDO({
      storage: {
        async get<T>(key: string) {
          return storageMap.get(key) as T | undefined;
        },
        async put<T>(key: string, value: T) {
          storageMap.set(key, value);
        },
      },
    });

    const acq1 = await doInstance.fetch(
      new Request('https://do.internal/acquire', {
        method: 'POST',
        body: JSON.stringify({ scopeKey: 'org:1', operationId: 'op_w1', leaseMs: 5000 }),
      })
    );
    const lock1 = (await acq1.json()) as { lock: { fencingToken: number } };
    expect(lock1.lock.fencingToken).toBe(1);

    // Verify stale fencing token after release or new owner fails 409 LOCK_OWNERSHIP_LOST
    const acqContended = await doInstance.fetch(
      new Request('https://do.internal/acquire', {
        method: 'POST',
        body: JSON.stringify({ scopeKey: 'org:1', operationId: 'op_w2', leaseMs: 5000 }),
      })
    );
    expect(acqContended.status).toBe(409);

    // 2. Mutation lock coordinator lease expiration & fencing token recovery
    let staleWorkerErrorCode = '';
    await withMutationLock(
      env,
      { scopeKey: 'org:t13_expire', operationId: 'op_stale' },
      async (staleHandle) => {
        expect(staleHandle.fencingToken).toBe(1);

        // Simulate worker freeze past lease expiry
        expireInMemoryLockForTest('org:t13_expire');

        await withMutationLock(
          env,
          { scopeKey: 'org:t13_expire', operationId: 'op_fresh' },
          async (freshHandle) => {
            expect(freshHandle.fencingToken).toBeGreaterThan(staleHandle.fencingToken);
          }
        );

        try {
          await staleHandle.verify();
        } catch (err) {
          staleWorkerErrorCode = err instanceof BuillyTransactionError ? err.code : '';
        }
      }
    );

    expect(staleWorkerErrorCode).toBe('LOCK_OWNERSHIP_LOST');
  });

  it('T14: completed operation retried -> returns recorded result immediately without re-executing Drive side effects', async () => {
    const opId = 'op_t14_completed_once';
    const r1 = await createOrganization(env, ALICE, {
      name: 'Completed Studio',
      operationId: opId,
    });
    expect(r1.deduplicated).toBe(false);

    const driveCallsAfterFirst = {
      folders: googleMock.stats.driveFolderCreateCalls,
      uploads: googleMock.stats.driveUploadCalls,
    };

    const r2 = await createOrganization(env, ALICE, {
      name: 'Completed Studio',
      operationId: opId,
    });
    expect(r2.deduplicated).toBe(true);
    expect(r2.organization.org_id).toBe(r1.organization.org_id);
    expect(googleMock.stats.driveFolderCreateCalls).toBe(driveCallsAfterFirst.folders);
    expect(googleMock.stats.driveUploadCalls).toBe(driveCallsAfterFirst.uploads);
  });

  it('Enforces archived-inclusive 10-Org & 10-Project quotas, archive-before-delete, permanent deletion freeing quota, and Project != Site', async () => {
    const createdOrgIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await createOrganization(env, ALICE, {
        name: `Org ${i + 1}`,
        operationId: `op_quota_org_${i}`,
      });
      createdOrgIds.push(r.organization.org_id);
    }

    // Archiving Org 1 still keeps count at 10
    await archiveOrganization(env, ALICE, createdOrgIds[0], { operationId: 'op_arch_org_0' });
    await expect(
      createOrganization(env, ALICE, { name: 'Org 11 Blocked', operationId: 'op_quota_org_11' })
    ).rejects.toMatchObject({ code: 'ORG_LIMIT_REACHED', status: 409 });

    // Deleting active Org 2 without archiving first must fail
    await expect(
      deleteOrganization(env, ALICE, createdOrgIds[1], {
        confirmPermanentDelete: true,
        operationId: 'op_del_active_org',
      })
    ).rejects.toMatchObject({ code: 'ARCHIVE_REQUIRED_BEFORE_DELETE', status: 409 });

    // Permanently deleting archived Org 1 frees quota slot for Org 11
    await deleteOrganization(env, ALICE, createdOrgIds[0], {
      confirmPermanentDelete: true,
      operationId: 'op_del_arch_org_0',
    });
    const org11 = await createOrganization(env, ALICE, {
      name: 'Org 11 Allowed',
      operationId: 'op_quota_org_11_ok',
    });
    expect(org11.ok).toBe(true);

    // 10 Projects per Organization (archived counts) + Project creation does not create a Site
    const targetOrgId = createdOrgIds[1];
    const createdProjectIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const p = await createProject(env, ALICE, targetOrgId, {
        name: `Project ${i + 1}`,
        operationId: `op_quota_prj_${i}`,
      });
      createdProjectIds.push(p.project.project_id);
    }
    expect(mockD1.tables.sites).toHaveLength(0);

    await archiveProject(env, ALICE, createdProjectIds[0], { operationId: 'op_arch_prj_0' });
    await expect(
      createProject(env, ALICE, targetOrgId, {
        name: 'Project 11 Blocked',
        operationId: 'op_quota_prj_11',
      })
    ).rejects.toMatchObject({ code: 'PROJECT_LIMIT_REACHED', status: 409 });

    await expect(
      deleteProject(env, ALICE, createdProjectIds[1], {
        confirmPermanentDelete: true,
        operationId: 'op_del_active_prj',
      })
    ).rejects.toMatchObject({ code: 'ARCHIVE_REQUIRED_BEFORE_DELETE', status: 409 });

    await deleteProject(env, ALICE, createdProjectIds[0], {
      confirmPermanentDelete: true,
      operationId: 'op_del_arch_prj_0',
    });
    const prj11 = await createProject(env, ALICE, targetOrgId, {
      name: 'Project 11 Allowed',
      operationId: 'op_quota_prj_11_ok',
    });
    expect(prj11.ok).toBe(true);
  });

  it('Creates one Google Spreadsheet per used dataset only and rejects unregistered spreadsheetId with 403 FORBIDDEN_SPREADSHEET_ACCESS', async () => {
    const orgRes = await createOrganization(env, ALICE, {
      name: 'Sheets Studio',
      operationId: 'op_ss_org',
    });
    const prjRes = await createProject(env, ALICE, orgRes.organization.org_id, {
      name: 'Sheets Project',
      operationId: 'op_ss_prj',
    });

    const saveRes = await handleSaveProjectCms(
      makeJsonReq(`/api/console/projects/${prjRes.project.project_id}/cms/save`, 'POST', {
        operationId: 'op_ss_save',
        syncSheets: true,
        document: {
          schemaVersion: 1,
          contentTypes: [{ id: 'articles', name: 'Articles', fields: [] }],
          records: [{ recordId: 'r1', contentTypeId: 'articles', title: 'Hello' }],
        },
        tables: [
          { title: 'ITEMS_articles', headers: ['recordId', 'title'], rows: [['r1', 'Hello']] },
          { title: 'ITEMS_empty_unused', headers: ['recordId'], rows: [] },
        ],
      }),
      env,
      ALICE,
      prjRes.project.project_id
    );
    expect(saveRes.status).toBe(200);
    const saveBody = (await saveRes.json()) as { datasetSpreadsheets: Record<string, string> };
    expect(googleMock.stats.sheetsCreateCalls).toBe(1);
    expect(saveBody.datasetSpreadsheets.ITEMS_articles).toBeTruthy();
    expect(saveBody.datasetSpreadsheets.ITEMS_empty_unused).toBeUndefined();

    // Reject client reading an arbitrary/unregistered spreadsheetId
    const rogueRead = await handleSheetsReadValues(
      makeJsonReq('/api/sheets/values/read', 'POST', {
        projectId: prjRes.project.project_id,
        spreadsheetId: 'unregistered_arbitrary_ss_999',
        ranges: ['Sheet1!A1:B2'],
      }),
      env
    );
    expect(rogueRead.status).toBe(403);
    const rogueBody = (await rogueRead.json()) as { code: string };
    expect(rogueBody.code).toBe('FORBIDDEN_SPREADSHEET_ACCESS');
  });

  it('Serves published public Site runtime & CMS queries without owner OAuth and strips private fields', async () => {
    const orgRes = await createOrganization(env, ALICE, {
      name: 'Runtime Org',
      operationId: 'op_rt_org',
    });
    const prjRes = await createProject(env, ALICE, orgRes.organization.org_id, {
      name: 'Runtime Project',
      operationId: 'op_rt_prj',
    });
    const siteRes = await createSiteInProject(env, ALICE, prjRes.project.project_id, {
      siteName: 'Public Studio',
      siteSlug: 'public-studio',
      operationId: 'op_rt_site',
    });

    const pubRes = await handleOwnerPublishSite(
      makeJsonReq('/api/sites/public-studio/publish', 'POST', {
        siteId: siteRes.site.site_id,
        projectId: prjRes.project.project_id,
        siteName: 'Public Studio',
        operationId: 'op_rt_pub',
        snapshot: {
          siteId: siteRes.site.site_id,
          siteSlug: 'public-studio',
          buildId: 'bld_rt_1',
          publishVersion: 'ver_rt_1',
          integrityHash: 'sha256_rt',
          pages: [{ id: 'home', path: '/', title: 'Home' }],
          ownerId: ALICE.ownerId,
          spreadsheetId: 'private_sheet_id',
          inboxSubmissions: [{ id: 'secret_inbox_item' }],
          publicCms: {
            forms: [{ id: 'secret_form_config' }],
            contentTypes: [
              {
                id: 'works',
                enabled: true,
                publiclyPublishable: true,
                fields: [
                  { key: 'summary', publiclyExposed: true },
                  { key: 'internalCost', publiclyExposed: false },
                ],
              },
            ],
            records: [
              {
                recordId: 'w1',
                contentTypeId: 'works',
                status: 'published',
                title: 'Visible Work',
                slug: 'visible-work',
                fields: { summary: 'Public summary', internalCost: '$5000' },
              },
              {
                recordId: 'w2',
                contentTypeId: 'works',
                status: 'draft',
                title: 'Secret Draft Work',
                slug: 'secret-draft',
                fields: { summary: 'Hidden' },
              },
            ],
          },
        },
      }),
      env,
      'public-studio'
    );
    expect(pubRes.status).toBe(200);

    // Delete owner OAuth credential completely + reset OAuth call counter
    mockD1.tables.credentials.length = 0;
    const oauthBeforePublic = googleMock.stats.oauthTokenCalls;

    const rtRes = await handlePublicGetRuntimeSnapshot(
      new Request('https://worker.example/api/public/sites/public-studio/runtime'),
      env,
      'public-studio'
    );
    expect(rtRes.status).toBe(200);
    const rtBody = (await rtRes.json()) as {
      snapshot: {
        ownerId?: string;
        spreadsheetId?: string;
        inboxSubmissions?: unknown;
        publicCms: { forms?: unknown; records: Array<{ recordId: string }> };
      };
    };
    expect(rtBody.snapshot.ownerId).toBeUndefined();
    expect(rtBody.snapshot.spreadsheetId).toBeUndefined();
    expect(rtBody.snapshot.inboxSubmissions).toBeUndefined();
    expect(rtBody.snapshot.publicCms.forms).toBeUndefined();
    expect(rtBody.snapshot.publicCms.records.map((r) => r.recordId)).toEqual(['w1']);

    const cmsRes = await handlePublicCmsQuery(
      new Request('https://worker.example/api/public/sites/public-studio/cms/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentTypeId: 'works' }),
      }),
      env,
      'public-studio'
    );
    expect(cmsRes.status).toBe(200);
    const cmsBody = (await cmsRes.json()) as {
      records: Array<{ recordId: string; fields: Record<string, unknown> }>;
    };
    expect(cmsBody.records).toHaveLength(1);
    expect(cmsBody.records[0].fields.summary).toBe('Public summary');
    expect(cmsBody.records[0].fields.internalCost).toBeUndefined();
    expect(googleMock.stats.oauthTokenCalls).toBe(oauthBeforePublic);

    // Client query trying to inject spreadsheetId / ownerId must be rejected 403
    const forbiddenQuery = await handlePublicCmsQuery(
      new Request('https://worker.example/api/public/sites/public-studio/cms/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentTypeId: 'works', spreadsheetId: 'hijack_ss' }),
      }),
      env,
      'public-studio'
    );
    expect(forbiddenQuery.status).toBe(403);
    const fqBody = (await forbiddenQuery.json()) as { code: string };
    expect(fqBody.code).toBe('FORBIDDEN_QUERY_PARAM');
  });
});
