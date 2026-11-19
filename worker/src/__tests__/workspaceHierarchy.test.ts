import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleConsoleApiRequest } from '../routes/consoleApi';
import {
  handleSheetsEnsureSpreadsheet,
  handleSheetsReadValues,
  handleSheetsWriteValues,
} from '../routes/sheets';
import { ensureProjectDriveTree } from '../services/driveProvisioner';
import { clearInMemoryLocksForTest } from '../services/mutationLockService';
import { validateSiteSlug } from '../services/siteRegistryService';
import {
  ALL_PROJECT_MODULES,
  completeOnboarding,
  createOrganization,
  createProject,
  createSiteInProject,
  getConsoleBootstrap,
  HierarchyServiceError,
  inspectOnboardingState,
  OrganizationRecord,
  ProjectRecord,
  SiteRecord,
  updateProjectModules,
  updateSiteInProject,
} from '../services/workspaceHierarchyService';
import { VerifiedSession } from '../types';
import {
  createInMemoryMockD1,
  createStatefulGoogleAndAuthFetchMock,
  createTestEnv,
  seedConnectedCredential,
} from './testHelpers';

describe('Workspace Hierarchy Service & Console API (Phase 1)', () => {
  const ownerA: VerifiedSession = { ownerId: 'user_alice', email: 'alice@studio.com' };
  const ownerB: VerifiedSession = { ownerId: 'user_bob', email: 'bob@agency.com' };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearInMemoryLocksForTest();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects all reserved system slugs in validateSiteSlug', () => {
    for (const reserved of ['console', 'orgs', 'projects', 'builder', 'workspace', 's', 'api']) {
      const check = validateSiteSlug(reserved);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('RESERVED_SITE_SLUG');
    }
    expect(validateSiteSlug('studio-alpha').valid).toBe(true);
  });

  it('inspects unattached legacy D1 sites and reports ambiguities without mutating state', async () => {
    const mock = createInMemoryMockD1();
    mock.tables.siteRegistry.push(
      {
        site_id: 'site_one',
        site_slug: 'alpha-works',
        custom_domain: null,
        owner_id: ownerA.ownerId,
        org_id: null,
        project_id: null,
        site_name: 'Alpha Works',
        status: 'published',
        active_publish_version: 'v1',
        active_build_id: 'b1',
        publish_manifest_drive_file_id: 'm1',
        runtime_config_drive_file_id: 'r1',
        integrity_hash: 'h1',
        schema_version: 1,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        site_id: 'site_two',
        site_slug: 'beta-works',
        custom_domain: null,
        owner_id: ownerA.ownerId,
        org_id: null,
        project_id: null,
        site_name: 'Beta Works',
        status: 'published',
        active_publish_version: 'v2',
        active_build_id: 'b2',
        publish_manifest_drive_file_id: 'm2',
        runtime_config_drive_file_id: 'r2',
        integrity_hash: 'h2',
        schema_version: 1,
        updated_at: '2026-01-02T00:00:00.000Z',
      }
    );

    const env = createTestEnv(mock.db);
    const bootstrapBefore = await getConsoleBootstrap(env, ownerA);
    expect(bootstrapBefore.needsOnboarding).toBe(true);
    expect(bootstrapBefore.unattachedLegacySites).toHaveLength(2);

    const inspection = await inspectOnboardingState(env, ownerA, {
      portfolioSlug: 'different-local-draft',
      siteName: 'Local Draft Site',
    });

    expect(inspection.requiresUserConfirmation).toBe(true);
    expect(inspection.ambiguities.map((a) => a.code)).toContain('MULTIPLE_LEGACY_SITES');
    expect(inspection.ambiguities.map((a) => a.code)).toContain('LOCAL_AND_REMOTE_SLUG_MISMATCH');
    expect(mock.tables.organizations).toHaveLength(0);
    expect(mock.tables.siteRegistry.every((s) => s.project_id === null)).toBe(true);
  });

  it('completes onboarding atomically, attaches legacy sites safely, and deduplicates retries via Idempotency-Key', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({ ownerA, ownerB });
    globalThis.fetch = googleMock.fetch;

    mock.tables.siteRegistry.push({
      site_id: 'site_legacy_1',
      site_slug: 'alice-portfolio',
      custom_domain: null,
      owner_id: ownerA.ownerId,
      org_id: null,
      project_id: null,
      site_name: 'Alice Portfolio',
      status: 'published',
      active_publish_version: 'v3',
      active_build_id: 'b3',
      publish_manifest_drive_file_id: 'm3',
      runtime_config_drive_file_id: 'r3',
      integrity_hash: 'h3',
      schema_version: 1,
      updated_at: '2026-01-03T00:00:00.000Z',
    });

    const first = await completeOnboarding(env, ownerA, {
      operationKey: 'onboard_key_1',
      organizationName: 'Alice Design Lab',
      projectName: 'Flagship Brand',
      attachSiteIds: ['site_legacy_1'],
    });

    expect(first.deduplicated).toBe(false);
    expect((first as { attachedSitesCount: number }).attachedSitesCount).toBe(1);
    expect(mock.tables.organizations).toHaveLength(1);
    expect(mock.tables.projects).toHaveLength(1);
    expect(mock.tables.projectModules).toHaveLength(ALL_PROJECT_MODULES.length);
    expect(mock.tables.siteRegistry[0].org_id).toBe(
      (first as { organization: OrganizationRecord }).organization.org_id
    );
    expect(mock.tables.siteRegistry[0].project_id).toBe(
      (first as { project: ProjectRecord }).project.project_id
    );
    expect(mock.tables.sites).toHaveLength(1);
    expect(mock.tables.sites[0].site_slug).toBe('alice-portfolio');
    expect(mock.tables.sites[0].status).toBe('published');

    const folderCallsAfterFirst = googleMock.stats.driveFolderCreateCalls;

    // Retry with same operationKey must deduplicate without creating duplicate Org/Project/Folders
    const retry = await completeOnboarding(env, ownerA, {
      operationKey: 'onboard_key_1',
      organizationName: 'Alice Design Lab',
      projectName: 'Flagship Brand',
      attachSiteIds: ['site_legacy_1'],
    });

    expect(retry.deduplicated).toBe(true);
    expect(mock.tables.organizations).toHaveLength(1);
    expect(mock.tables.projects).toHaveLength(1);
    expect(googleMock.stats.driveFolderCreateCalls).toBe(folderCallsAfterFirst);
  });

  it('enforces RBAC cross-tenant isolation, module toggles, and reserved/duplicate site slug guards', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    await seedConnectedCredential(mock, env, ownerB);
    const googleMock = createStatefulGoogleAndAuthFetchMock({ ownerA, ownerB });
    globalThis.fetch = googleMock.fetch;

    const orgRes = await createOrganization(env, ownerA, { name: 'Studio A', operationKey: 'org_1' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;

    const projRes = await createProject(env, ownerA, orgId, {
      name: 'Client Portal',
      operationKey: 'prj_1',
    });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    // Cross-account user B cannot create a project or site or toggle modules in Org A
    await expect(
      createProject(env, ownerB, orgId, { name: 'Hijack Project' })
    ).rejects.toBeInstanceOf(HierarchyServiceError);

    await expect(
      updateProjectModules(env, ownerB, projectId, [{ moduleKey: 'cms', enabled: false }])
    ).rejects.toThrow(/do not have access/i);

    // Owner A toggles CMS module off
    const modUpdate = await updateProjectModules(env, ownerA, projectId, [
      { moduleKey: 'cms', enabled: false },
    ]);
    const cmsMod = modUpdate.modules.find((m) => m.module_key === 'cms');
    expect(cmsMod?.enabled).toBe(0);

    // Reserved slug rejected on Site create
    await expect(
      createSiteInProject(env, ownerA, projectId, { siteName: 'Console', siteSlug: 'console' })
    ).rejects.toThrow(/reserved/i);

    // Valid Site creation succeeds
    const createdSite = await createSiteInProject(env, ownerA, projectId, {
      siteName: 'Client Microsite',
      siteSlug: 'client-microsite',
    });
    const siteId = (createdSite as { site: SiteRecord }).site.site_id;

    // Duplicate slug rejected across accounts
    const orgB = await createOrganization(env, ownerB, { name: 'Agency B' });
    const projB = await createProject(
      env,
      ownerB,
      (orgB as { organization: OrganizationRecord }).organization.org_id,
      { name: 'B Site' }
    );
    await expect(
      createSiteInProject(
        env,
        ownerB,
        (projB as { project: ProjectRecord }).project.project_id,
        { siteName: 'Copycat', siteSlug: 'client-microsite' }
      )
    ).rejects.toThrow(/already in use/i);

    // Reserved slug rejected on Site rename
    await expect(updateSiteInProject(env, ownerA, siteId, { siteSlug: 'orgs' })).rejects.toThrow(
      /reserved/i
    );
  });

  it('handles HTTP /api/console/bootstrap and /api/console/organizations authentication via handleConsoleApiRequest', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({ ownerA, ownerB });
    globalThis.fetch = googleMock.fetch;

    const unauthRes = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/bootstrap'),
      env,
      '/api/console/bootstrap'
    );
    expect(unauthRes?.status).toBe(401);

    const bootRes = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/bootstrap', {
        headers: { Authorization: 'Bearer alice_jwt' },
      }),
      env,
      '/api/console/bootstrap'
    );
    expect(bootRes?.status).toBe(200);
    const bootJson = (await bootRes?.json()) as { needsOnboarding: boolean };
    expect(bootJson.needsOnboarding).toBe(true);

    const createOrgRes = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/organizations', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer alice_jwt',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'http_org_1',
        },
        body: JSON.stringify({ name: 'HTTP Org' }),
      }),
      env,
      '/api/console/organizations'
    );
    expect(createOrgRes?.status).toBe(201);
  });
});

describe('Drive Provisioner & Server-Side Google Workspace Proxy (Phase 2)', () => {
  const ownerA: VerifiedSession = { ownerId: 'user_alice', email: 'alice@studio.com' };
  const ownerB: VerifiedSession = { ownerId: 'user_bob', email: 'bob@agency.com' };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearInMemoryLocksForTest();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('provisions Builly/Organizations/{org_id}/Projects/{project_id} folders idempotently and reuses persisted IDs without duplicates', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({ ownerA, ownerB });
    globalThis.fetch = googleMock.fetch;

    const orgRes = await createOrganization(env, ownerA, { name: 'Acme Studio' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, { name: 'Brand Portal' });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    const folderCallsAfterCreate = googleMock.stats.driveFolderCreateCalls;

    // Project already provisioned during createProject -> ensureProjectDriveTree reuses without creating duplicates
    const reuseRun = await ensureProjectDriveTree(env, ownerA, projectId);
    expect(reuseRun.createdFoldersCount).toBe(0);
    expect(reuseRun.folders.config_draft).toBeTruthy();
    expect(reuseRun.folders.data_cms).toBeTruthy();
    expect(reuseRun.folders.assets_root).toBeTruthy();
    expect(reuseRun.folders.exports_root).toBeTruthy();
    expect(googleMock.stats.driveFolderCreateCalls).toBe(folderCallsAfterCreate);

    // Unprovisioned legacy project row -> first ensureProjectDriveTree creates the 10 project folders, second reuses 100%
    const legacyProjId = 'prj_legacy_tree_test';
    mock.tables.projects.push({
      project_id: legacyProjId,
      org_id: orgId,
      owner_id: ownerA.ownerId,
      name: 'Legacy Unprovisioned',
      project_slug: 'legacy-unprovisioned',
      description: '',
      drive_folder_id: '',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    const firstLegacy = await ensureProjectDriveTree(env, ownerA, legacyProjId);
    expect(firstLegacy.createdFoldersCount).toBe(10);
    const folderCountAfterFirst = googleMock.stats.driveFolderCreateCalls;

    const secondLegacy = await ensureProjectDriveTree(env, ownerA, legacyProjId);
    expect(secondLegacy.createdFoldersCount).toBe(0);
    expect(googleMock.stats.driveFolderCreateCalls).toBe(folderCountAfterFirst);
    expect(secondLegacy.folders).toEqual(firstLegacy.folders);
  });

  it('enforces RBAC 403 and zero token exposure on /api/console/projects/:projectId/drive/* routes', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA, 'secret_google_refresh_token');
    const googleMock = createStatefulGoogleAndAuthFetchMock({
      ownerA,
      ownerB,
      oauthToken: 'TOP_SECRET_GOOGLE_ACCESS_TOKEN',
    });
    globalThis.fetch = googleMock.fetch;

    const orgRes = await createOrganization(env, ownerA, { name: 'Alpha Org' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, { name: 'Alpha Project' });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    // Seed a foreign file outside project folders
    const foreignFolderId = googleMock.createFolderDirect({ name: 'other_folder', parentId: 'root' });
    googleMock.createFileDirect({
      name: 'secret.json',
      parentId: foreignFolderId,
      content: JSON.stringify({ secret: true }),
    });
    const foreignFileId = Array.from(googleMock.driveFiles.values()).find(
      (f) => f.name === 'secret.json'
    )!.id;

    // Cross-account user Bob cannot provision Alice's Project Drive
    const bobRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/drive/provision`, {
        method: 'POST',
        headers: { Authorization: 'Bearer bob_jwt' },
      }),
      env,
      `/api/console/projects/${projectId}/drive/provision`
    );
    expect(bobRes?.status).toBe(403);

    // Owner Alice provisions and writes JSON draft inside Project folder
    const aliceWriteRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/drive/json`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer alice_jwt',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderKind: 'config_draft',
          fileName: 'site-draft.json',
          payload: { title: 'Draft 1' },
        }),
      }),
      env,
      `/api/console/projects/${projectId}/drive/json`
    );
    expect(aliceWriteRes?.status).toBe(200);
    const writeText = await aliceWriteRes!.text();
    expect(writeText).not.toContain('TOP_SECRET_GOOGLE_ACCESS_TOKEN');
    expect(writeText).not.toContain('secret_google_refresh_token');

    // Reading an arbitrary fileId outside the project's folders is blocked (403)
    const foreignReadRes = await handleConsoleApiRequest(
      new Request(
        `https://worker.example/api/console/projects/${projectId}/drive/json?fileId=${encodeURIComponent(foreignFileId)}`,
        {
          method: 'GET',
          headers: { Authorization: 'Bearer alice_jwt' },
        }
      ),
      env,
      `/api/console/projects/${projectId}/drive/json`
    );
    expect(foreignReadRes?.status).toBe(403);
  });

  it('proxies Google Sheets provisioning, reads, and writes server-side scoped by Project RBAC', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({
      ownerA,
      ownerB,
      oauthToken: 'SERVER_SHEETS_TOKEN',
    });
    globalThis.fetch = googleMock.fetch;

    const orgRes = await createOrganization(env, ownerA, { name: 'Sheets Org' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, { name: 'CMS Hub' });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    const ensure1 = await handleSheetsEnsureSpreadsheet(
      new Request('https://worker.example/api/sheets/spreadsheets/ensure', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          domainKind: 'cms',
          datasetKey: 'posts',
          title: 'CMS Posts',
          tabs: ['POSTS'],
        }),
      }),
      env
    );
    expect(ensure1.status).toBe(201);
    expect(googleMock.stats.sheetsCreateCalls).toBe(1);
    const ensureJson = (await ensure1.json()) as { spreadsheetId: string };
    const createdSheetId = ensureJson.spreadsheetId;

    // Seed initial row in mock sheet for read assertion
    googleMock.sheetsStore.get(createdSheetId)!.values['POSTS'] = [['id', 'Title']];

    // Repeat call reuses the registered spreadsheet without creating a duplicate
    const ensure2 = await handleSheetsEnsureSpreadsheet(
      new Request('https://worker.example/api/sheets/spreadsheets/ensure', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          domainKind: 'cms',
          datasetKey: 'posts',
          title: 'CMS Posts',
          tabs: ['POSTS'],
        }),
      }),
      env
    );
    expect(ensure2.status).toBe(200);
    expect(googleMock.stats.sheetsCreateCalls).toBe(1);

    const readRes = await handleSheetsReadValues(
      new Request('https://worker.example/api/sheets/values/read', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, spreadsheetId: createdSheetId, ranges: ['POSTS!A1:B2'] }),
      }),
      env
    );
    expect(readRes.status).toBe(200);
    const readText = await readRes.text();
    expect(readText).not.toContain('SERVER_SHEETS_TOKEN');

    const bobWriteRes = await handleSheetsWriteValues(
      new Request('https://worker.example/api/sheets/values/write', {
        method: 'POST',
        headers: { Authorization: 'Bearer bob_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          spreadsheetId: createdSheetId,
          data: [{ range: 'POSTS!A1', values: [['x']] }],
        }),
      }),
      env
    );
    expect(bobWriteRes.status).toBe(403);
  });

  it('Phase 4: enforces Project RBAC on GET/POST /api/console/projects/:projectId/cms, saves manifest to Data/CMS, and keeps OAuth secrets out of responses', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA, 'REFRESH_SECRET_ALICE_CMS');
    const googleMock = createStatefulGoogleAndAuthFetchMock({
      ownerA,
      ownerB,
      oauthToken: 'SERVER_CMS_ACCESS_TOKEN',
    });
    globalThis.fetch = googleMock.fetch;

    const orgRes = await createOrganization(env, ownerA, { name: 'CMS Org' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, {
      name: 'CMS Core Project',
    });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    // Unprivileged user Bob is rejected with 403
    const bobGet = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/cms`, {
        method: 'GET',
        headers: { Authorization: 'Bearer bob_jwt' },
      }),
      env,
      `/api/console/projects/${projectId}/cms`
    );
    expect(bobGet?.status).toBe(403);

    // Alice saves CMS manifest + Sheets tables to isolated Data/CMS folder
    const saveRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/cms/save`, {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: {
            schemaVersion: 1,
            revision: 4,
            contentTypes: [{ id: 'post', pluralLabel: 'Posts' }],
            records: [{ recordId: 'rec_1', title: 'Server Synced Post', slug: 'server-post' }],
            taxonomies: [],
            terms: [],
            relationships: [],
            richDocs: {},
          },
          syncSheets: true,
          title: 'Builly CMS — CMS Core Project',
          tables: [
            {
              title: 'CMS_REC_POST',
              headers: ['record_id', 'title'],
              rows: [['rec_1', 'Server Synced Post']],
            },
          ],
        }),
      }),
      env,
      `/api/console/projects/${projectId}/cms/save`
    );
    expect(saveRes?.status).toBe(200);
    const saveText = await saveRes!.text();
    expect(saveText).not.toContain('SERVER_CMS_ACCESS_TOKEN');
    expect(saveText).not.toContain('REFRESH_SECRET_ALICE_CMS');
    const saveJson = JSON.parse(saveText) as {
      manifestFileId: string;
      spreadsheetId: string;
      tabsSynced: string[];
    };
    expect(saveJson.manifestFileId).toBeTruthy();
    expect(saveJson.spreadsheetId).toBeTruthy();
    expect(saveJson.tabsSynced).toEqual(['CMS_REC_POST']);

    // Alice reads back saved Project CMS from Drive manifest
    const getRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/cms`, {
        method: 'GET',
        headers: { Authorization: 'Bearer alice_jwt' },
      }),
      env,
      `/api/console/projects/${projectId}/cms`
    );
    expect(getRes?.status).toBe(200);
    const getJson = (await getRes!.json()) as {
      found: boolean;
      document: { cmsRevision?: number; records?: Array<{ title: string }> };
    };
    expect(getJson.found).toBe(true);
    expect(getJson.document.records?.[0]?.title).toBe('Server Synced Post');
  });

  it('Phase 5: Project Inbox endpoints enforce RBAC, pull live Sheets submissions, and sync Inbox state without leaking tokens', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({
      ownerA,
      ownerB,
      oauthToken: 'SERVER_INBOX_ACCESS_TOKEN',
    });
    globalThis.fetch = googleMock.fetch;

    const orgRes = (await createOrganization(env, ownerA, { name: 'Inbox Org' })) as {
      organization: OrganizationRecord;
    };
    const projRes = (await createProject(env, ownerA, orgRes.organization.org_id, {
      name: 'Lead Capture App',
    })) as { project: ProjectRecord };
    const projectId = projRes.project.project_id;
    const siteRes = (await createSiteInProject(env, ownerA, projectId, {
      siteName: 'Lead Site',
      siteSlug: 'lead-capture-site',
    })) as { site: SiteRecord };

    mock.tables.formDestinations.push({
      id: 'dest_1',
      site_id: siteRes.site.site_id,
      form_id: 'contact_main',
      form_name: 'Contact Us',
      category_id: 'cat_inquiry',
      destination_spreadsheet_id: 'sheet_dest_leads_1',
      destination_worksheet_name: 'CONTACT_SUBMISSIONS',
      inbox_registry_spreadsheet_id: '',
      status: 'active',
      updated_at: '2026-04-02T00:00:00Z',
    });

    googleMock.sheetsStore.set('sheet_dest_leads_1', {
      spreadsheetId: 'sheet_dest_leads_1',
      title: 'Leads',
      sheets: ['CONTACT_SUBMISSIONS'],
      values: {
        CONTACT_SUBMISSIONS: [
          ['submission_id', 'submitted_at', 'name', 'email', 'phone', 'message', 'source_page'],
          ['sub_live_99', '2026-04-02T09:30:00Z', 'Suda', 'suda@example.com', '0812345678', 'Hello Builly!', '/contact'],
        ],
      },
    });

    const bobRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/inbox`, {
        method: 'GET',
        headers: { Authorization: 'Bearer bob_jwt' },
      }),
      env,
      `/api/console/projects/${projectId}/inbox`
    );
    expect(bobRes?.status).toBe(403);

    const syncRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/inbox/sync`, {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inboxState: {
            forms: [{ form_id: 'contact_main', name: 'Contact Us' }],
            inboxCategories: [],
            inboxSubmissions: [
              {
                inbox_item_id: 'inb_1',
                submission_id: 'sub_triaged_1',
                read_status: 'read',
                submitted_at: '2026-04-01T08:00:00Z',
              },
            ],
            inboxNotes: [],
            inboxActivities: [],
          },
          syncSheets: true,
          title: 'Builly Inbox — Lead Capture',
          tables: [{ title: 'INBOX_REGISTRY', headers: ['id'], rows: [['inb_1']] }],
        }),
      }),
      env,
      `/api/console/projects/${projectId}/inbox/sync`
    );
    expect(syncRes?.status).toBe(200);
    const syncText = await syncRes!.text();
    expect(syncText).not.toContain('SERVER_INBOX_ACCESS_TOKEN');
    const syncJson = JSON.parse(syncText) as { spreadsheetId: string; stateFileId: string };
    expect(syncJson.stateFileId).toBeTruthy();
    expect(syncJson.spreadsheetId).toBeTruthy();

    const getRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/inbox`, {
        method: 'GET',
        headers: { Authorization: 'Bearer alice_jwt' },
      }),
      env,
      `/api/console/projects/${projectId}/inbox`
    );
    expect(getRes?.status).toBe(200);
    const getJson = (await getRes!.json()) as {
      savedState: { inboxSubmissions: Array<{ submission_id: string }> };
      remoteSubmissions: Array<{ submission_id: string; fields: { full_name: string; email: string } }>;
    };
    expect(getJson.savedState.inboxSubmissions[0]?.submission_id).toBe('sub_triaged_1');
    expect(getJson.remoteSubmissions).toHaveLength(1);
    expect(getJson.remoteSubmissions[0]?.submission_id).toBe('sub_live_99');
    expect(getJson.remoteSubmissions[0]?.fields.email).toBe('suda@example.com');
  });

  it('Phase 5: Project Assets endpoints reject unsafe SVGs, upload clean SVGs into Drive category folders, and delete them cleanly', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({
      ownerA,
      ownerB,
      oauthToken: 'SERVER_ASSETS_ACCESS_TOKEN',
    });
    globalThis.fetch = googleMock.fetch;

    const orgRes = (await createOrganization(env, ownerA, { name: 'Assets Org' })) as {
      organization: OrganizationRecord;
    };
    const projRes = (await createProject(env, ownerA, orgRes.organization.org_id, {
      name: 'Brand Kit',
    })) as { project: ProjectRecord };
    const projectId = projRes.project.project_id;

    const unsafeRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/assets/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'xss.svg',
          mimeType: 'image/svg+xml',
          category: 'icons',
          svgMarkup: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        }),
      }),
      env,
      `/api/console/projects/${projectId}/assets/upload`
    );
    expect(unsafeRes?.status).toBe(400);
    const unsafeJson = (await unsafeRes!.json()) as { code: string };
    expect(unsafeJson.code).toBe('UNSAFE_SVG_REJECTED');

    const uploadRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/assets/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'spark.svg',
          mimeType: 'image/svg+xml',
          category: 'icons',
          svgMarkup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
        }),
      }),
      env,
      `/api/console/projects/${projectId}/assets/upload`
    );
    expect(uploadRes?.status).toBe(201);
    const uploadJson = (await uploadRes!.json()) as {
      asset: { id: string; driveFileId: string; driveFolder: string };
    };
    const uploadedDriveId = uploadJson.asset.driveFileId;
    expect(uploadedDriveId).toBeTruthy();
    expect(uploadJson.asset.driveFolder).toContain('/Assets/Icons');

    const delRes = await handleConsoleApiRequest(
      new Request(
        `https://worker.example/api/console/projects/${projectId}/assets/${uploadJson.asset.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: 'Bearer alice_jwt' },
        }
      ),
      env,
      `/api/console/projects/${projectId}/assets/${uploadJson.asset.id}`
    );
    expect(delRes?.status).toBe(200);
    expect(googleMock.driveFiles.get(uploadedDriveId)?.trashed).toBe(true);

    const assetsManifest = Array.from(googleMock.driveFiles.values()).find(
      (f) => f.name === 'assets-manifest.json'
    );
    expect(JSON.parse(assetsManifest?.content || '{}').assets).toHaveLength(0);
  });

  it('Phase 5: Project Publishing routes list project-scoped D1 release history and archive exports to Drive Exports/', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({
      ownerA,
      ownerB,
      oauthToken: 'SERVER_EXP_ACCESS_TOKEN',
    });
    globalThis.fetch = googleMock.fetch;

    const orgRes = (await createOrganization(env, ownerA, { name: 'Release Org' })) as {
      organization: OrganizationRecord;
    };
    const projRes = (await createProject(env, ownerA, orgRes.organization.org_id, {
      name: 'Marketing Hub',
    })) as { project: ProjectRecord };
    const projectId = projRes.project.project_id;
    const siteRes = (await createSiteInProject(env, ownerA, projectId, {
      siteName: 'Marketing Site',
      siteSlug: 'marketing-hub',
    })) as { site: SiteRecord };

    mock.tables.siteReleaseHistory.push({
      id: 'rel_hist_1',
      site_id: siteRes.site.site_id,
      site_slug: 'marketing-hub',
      owner_id: ownerA.ownerId,
      publish_version: 'v1.0.2',
      build_id: 'bld_2',
      runtime_config_drive_file_id: 'drv_snap_2',
      publish_manifest_drive_file_id: 'drv_man_2',
      integrity_hash: 'sha256_abc',
      schema_version: 2,
      commit_message: 'Hero typo fix',
      created_at: '2026-04-02T14:00:00Z',
    });

    const relRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/releases`, {
        method: 'GET',
        headers: { Authorization: 'Bearer alice_jwt' },
      }),
      env,
      `/api/console/projects/${projectId}/releases`
    );
    expect(relRes?.status).toBe(200);
    const relJson = (await relRes!.json()) as {
      releases: Array<{ publish_version: string; commit_message: string }>;
    };
    expect(relJson.releases).toHaveLength(1);
    expect(relJson.releases[0].publish_version).toBe('v1.0.2');

    const expRes = await handleConsoleApiRequest(
      new Request(`https://worker.example/api/console/projects/${projectId}/exports`, {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'marketing-hub-v1-export.json',
          manifest: { publishVersion: 'v1.0.2', siteSlug: 'marketing-hub' },
        }),
      }),
      env,
      `/api/console/projects/${projectId}/exports`
    );
    expect(expRes?.status).toBe(200);
    const expText = await expRes!.text();
    expect(expText).not.toContain('SERVER_EXP_ACCESS_TOKEN');
    const expJson = JSON.parse(expText) as { fileId: string; fileName: string };
    expect(expJson.fileId).toBeTruthy();
    expect(mock.tables.resources.some((r) => r.resource_kind === 'export_archive')).toBe(true);
  });

  it('enforces server-side limits of 10 Organizations per account and 10 Projects per Organization', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({ ownerA, ownerB });
    globalThis.fetch = googleMock.fetch;

    let firstOrgId = '';
    for (let i = 1; i <= 10; i++) {
      const res = (await createOrganization(env, ownerA, {
        name: `Org ${i}`,
      })) as { organization: OrganizationRecord };
      if (i === 1) firstOrgId = res.organization.org_id;
    }

    await expect(
      createOrganization(env, ownerA, { name: 'Org 11 Overflow' })
    ).rejects.toThrowError(/Organization limit reached/i);

    for (let p = 1; p <= 10; p++) {
      await createProject(env, ownerA, firstOrgId, { name: `Project ${p}` });
    }

    await expect(
      createProject(env, ownerA, firstOrgId, { name: 'Project 11 Overflow' })
    ).rejects.toThrowError(/Project limit reached/i);
  });

  it('Phase 6 Migration Plan, Non-Destructive Partitioned Execute, Reconciliation, and Owner-Confirmed Cleanup', async () => {
    const mock = createInMemoryMockD1();
    const env = createTestEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);
    const googleMock = createStatefulGoogleAndAuthFetchMock({
      ownerA,
      ownerB,
      oauthToken: 'SERVER_MIG_ACCESS_TOKEN',
    });
    globalThis.fetch = googleMock.fetch;

    const orgRes = (await createOrganization(env, ownerA, { name: 'Acme Studio' })) as {
      organization: OrganizationRecord;
    };
    const orgId = orgRes.organization.org_id;
    const projRes = (await createProject(env, ownerA, orgId, { name: 'Primary Brand' })) as {
      project: ProjectRecord;
    };
    const projectId = projRes.project.project_id;

    // Seed legacy file inside existing Builly root folder
    const buillyRootFile = Array.from(googleMock.driveFiles.values()).find(
      (f) => f.appProperties?.builly_root === 'true'
    )!;
    googleMock.createFileDirect({
      name: 'indyshares-pages-registry.json',
      parentId: buillyRootFile.id,
      content: JSON.stringify({ pages: [{ slug: 'home', title: 'Home' }] }),
    });

    // Seed unattached legacy site_registry & legacy combined spreadsheet resource
    mock.tables.siteRegistry.push({
      site_id: 'site_legacy_portfolio',
      site_slug: 'studio-work',
      custom_domain: null,
      owner_id: ownerA.ownerId,
      org_id: null,
      project_id: null,
      site_name: 'Studio Work',
      status: 'published',
      active_publish_version: 'v1.0.0',
      active_build_id: 'bld_old',
      publish_manifest_drive_file_id: 'drv_man_old',
      runtime_config_drive_file_id: 'drv_snap_old',
      integrity_hash: 'hash_old',
      schema_version: 1,
      updated_at: '2026-03-10T00:00:00Z',
    });

    mock.tables.resources.push({
      resource_id: 'wres_legacy_sheet_1',
      owner_id: ownerA.ownerId,
      org_id: orgId,
      project_id: null,
      site_id: null,
      resource_kind: 'legacy_sheet',
      resource_key: 'ss_legacy_combined_1',
      drive_file_id: 'ss_legacy_combined_1',
      spreadsheet_id: 'ss_legacy_combined_1',
      parent_folder_id: '',
      title: 'Legacy Combined Workbook',
      status: 'legacy',
      created_at: '2026-03-10T00:00:00Z',
      updated_at: '2026-03-10T00:00:00Z',
    });

    googleMock.sheetsStore.set('ss_legacy_combined_1', {
      spreadsheetId: 'ss_legacy_combined_1',
      title: 'Legacy Combined Workbook',
      sheets: ['POSTS', 'CONTACT_SUBMISSIONS'],
      values: {
        POSTS: [
          ['record_id', 'title', 'status'],
          ['rec_post_1', 'Launch Post', 'published'],
          ['rec_post_2', 'Second Post', 'draft'],
        ],
        CONTACT_SUBMISSIONS: [
          ['submission_id', 'email', 'message'],
          ['sub_1', 'client@example.com', 'Hello from legacy form'],
        ],
      },
    });

    // Step 1: Read-only Migration Plan
    const planRes = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/migration/plan', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetOrgId: orgId }),
      }),
      env,
      '/api/console/migration/plan'
    );
    expect(planRes?.status).toBe(200);
    const planJson = (await planRes!.json()) as {
      hasPendingMigration: boolean;
      unattachedSites: Array<{ siteId: string }>;
      spreadsheetPartitions: Array<{
        sourceSpreadsheetId: string;
        sourceTab: string;
        domain: 'cms' | 'inbox';
        targetDatasetKey: string;
      }>;
    };
    expect(planJson.hasPendingMigration).toBe(true);
    expect(planJson.unattachedSites).toHaveLength(1);
    expect(planJson.spreadsheetPartitions).toHaveLength(2);
    expect(planJson.spreadsheetPartitions.find((p) => p.sourceTab === 'POSTS')?.domain).toBe('cms');
    expect(
      planJson.spreadsheetPartitions.find((p) => p.sourceTab === 'CONTACT_SUBMISSIONS')?.domain
    ).toBe('inbox');

    // Step 2: Execute Idempotent Migration & Partitioning
    const execBody = {
      operationKey: 'mig_op_phase6_1',
      targetOrgId: orgId,
      strategy: 'attach_to_project',
      targetProjectId: projectId,
      attachSiteIds: ['site_legacy_portfolio'],
      partitionSpreadsheets: planJson.spreadsheetPartitions.map((p) => ({
        sourceSpreadsheetId: p.sourceSpreadsheetId,
        sourceTab: p.sourceTab,
        domain: p.domain,
        targetDatasetKey: p.targetDatasetKey,
      })),
      copyLegacyDriveConfigs: true,
    };
    const execRes = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/migration/execute', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify(execBody),
      }),
      env,
      '/api/console/migration/execute'
    );
    expect(execRes?.status).toBe(200);
    const execText = await execRes!.text();
    expect(execText).not.toContain('SERVER_MIG_ACCESS_TOKEN');
    const execJson = JSON.parse(execText) as {
      attachedSitesCount: number;
      partitionedDatasets: Array<{ datasetKey: string; rowCount: number }>;
      legacyBackupFiles: Array<{ backupFileName: string }>;
      reconciliation: { passed: boolean; checks: Array<{ status: string }> };
    };
    expect(execJson.attachedSitesCount).toBe(1);
    expect(execJson.partitionedDatasets).toHaveLength(2);
    expect(execJson.partitionedDatasets.find((d) => d.datasetKey === 'Posts')?.rowCount).toBe(2);
    expect(execJson.partitionedDatasets.find((d) => d.datasetKey === 'Submissions')?.rowCount).toBe(
      1
    );
    expect(execJson.legacyBackupFiles[0]?.backupFileName).toBe('legacy-pages-registry-backup.json');
    expect(execJson.reconciliation.passed).toBe(true);
    expect(mock.tables.siteRegistry[0].project_id).toBe(projectId);

    const sheetCountBeforeReplay = googleMock.stats.sheetsCreateCalls;

    // Step 2b: Idempotency replay does not duplicate writes
    const replayRes = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/migration/execute', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify(execBody),
      }),
      env,
      '/api/console/migration/execute'
    );
    const replayJson = (await replayRes!.json()) as { deduplicated: boolean };
    expect(replayJson.deduplicated).toBe(true);
    expect(googleMock.stats.sheetsCreateCalls).toBe(sheetCountBeforeReplay);

    // Step 3: Cleanup fails without explicit owner confirmation
    const badCleanup = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/migration/cleanup', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetOrgId: orgId,
          confirmOwnerReviewed: false,
          reconciliationPassed: true,
        }),
      }),
      env,
      '/api/console/migration/cleanup'
    );
    expect(badCleanup?.status).toBe(400);

    // Step 4: Confirmed Cleanup archives legacy D1 pointers safely
    const okCleanup = await handleConsoleApiRequest(
      new Request('https://worker.example/api/console/migration/cleanup', {
        method: 'POST',
        headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationKey: 'clean_op_phase6_1',
          targetOrgId: orgId,
          confirmOwnerReviewed: true,
          reconciliationPassed: true,
          archiveLegacyResourceIds: ['wres_legacy_sheet_1'],
        }),
      }),
      env,
      '/api/console/migration/cleanup'
    );
    expect(okCleanup?.status).toBe(200);
    const cleanJson = (await okCleanup!.json()) as {
      archivedResourcesCount: number;
      remainingLegacySitesCount: number;
      driveBackupsPreserved: boolean;
    };
    expect(cleanJson.archivedResourcesCount).toBe(1);
    expect(cleanJson.remainingLegacySitesCount).toBe(0);
    expect(cleanJson.driveBackupsPreserved).toBe(true);
    expect(
      mock.tables.resources.find((r) => r.resource_id === 'wres_legacy_sheet_1')?.status
    ).toBe('archived');
  });
});
