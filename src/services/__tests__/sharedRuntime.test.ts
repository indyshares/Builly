import { describe, expect, it } from 'vitest';
import { INITIAL_GOOGLE_WORKSPACE, INITIAL_SITE } from '../../data/initialSite';
import { ElementNode, SiteDocument } from '../../types/builder';
import { resolveAppRouteKind, resolvePublicSiteFromPath } from '../../utils/routes';
import { compilerService, getDefaultPublishPageIds } from '../compilerService';
import { migrateSiteComponentsAndLayout } from '../componentLibraryService';
import { migrateSiteCms } from '../cms/cmsService';
import { buildPartitionPlan } from '../partitionedWorkspaceService';
import { validateRuntimeNodeTree } from '../runtime/componentRuntimeRegistry';
import {
  buildPublishedRuntimeSnapshot,
  stripSecretsFromPublishedSnapshot,
  validateRuntimeSnapshotCompatibility,
} from '../runtime/publishedSnapshotContract';
import { generateSiteSourceZip } from '../sourceExportService';

function createRichTestSite(): SiteDocument {
  const migrated = migrateSiteCms(migrateSiteComponentsAndLayout(INITIAL_SITE));
  const cms = migrated.cms!;

  // Add realistic sensitive owner data that must NEVER leak publicly
  const baseCt = cms.contentTypes[0];
  const ctWithPrivateField = {
    ...baseCt,
    fields: [
      ...baseCt.fields,
      {
        fieldId: 'fld_secret_notes',
        key: 'internalCost',
        label: 'Internal Cost',
        type: 'short_text' as const,
        group: 'Details',
        order: 99,
        schemaVersion: 1,
        required: false,
        isSystem: false,
        publiclyExposed: false,
      },
    ],
  };

  const disabledCt = {
    ...cms.contentTypes[1],
    id: 'ct_disabled_type',
    name: 'Disabled Collection',
    slug: 'disabled-collection',
    enabled: false,
    publiclyPublishable: false,
  };

  return {
    ...migrated,
    portfolioSlug: 'studio-nova',
    mediaAssets: [
      {
        id: 'asset_logo_1',
        name: 'studio-mark',
        category: 'logos',
        type: 'image',
        mimeType: 'image/png',
        size: '1 KB',
        driveFileId: 'local_asset_logo_1',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        dimensions: { width: 1, height: 1 },
        createdAt: new Date().toISOString(),
      },
    ],
    cms: {
      ...cms,
      contentTypes: [ctWithPrivateField, ...cms.contentTypes.slice(1), disabledCt],
      records: [
        {
          recordId: 'rec_pub_1',
          contentTypeId: ctWithPrivateField.id,
          slug: 'published-work',
          title: 'Public Case Study',
          status: 'published',
          fields: {
            title: 'Public Case Study',
            internalCost: 'CONFIDENTIAL_9999_USD',
          },
          richContentRefs: {},
          termIdsByTaxonomy: {},
          relationIdsByField: {},
          revision: 1,
          schemaVersion: 1,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        },
        {
          recordId: 'rec_draft_1',
          contentTypeId: ctWithPrivateField.id,
          slug: 'secret-draft-work',
          title: 'UNPUBLISHED_SECRET_DRAFT',
          status: 'draft',
          fields: {
            title: 'UNPUBLISHED_SECRET_DRAFT',
            internalCost: 'CONFIDENTIAL_DRAFT_ONLY',
          },
          richContentRefs: {},
          termIdsByTaxonomy: {},
          relationIdsByField: {},
          revision: 1,
          schemaVersion: 1,
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        },
      ],
      forms: [
        {
          formId: 'form_contact',
          name: 'Contact Us',
          categoryId: 'cat_inquiry',
          status: 'active',
          fields: [
            {
              fieldId: 'ff_email',
              key: 'email',
              label: 'Email',
              type: 'email',
              required: true,
              order: 0,
            },
          ],
          destination: {
            dataSourceType: 'google_sheets',
            spreadsheetId: '1SECRET_OWNER_SPREADSHEET_ID_XYZ',
            worksheetName: 'Submissions',
          },
          fieldMappings: { email: 'SenderEmail' },
          settings: {
            submitButtonText: 'Send',
            successAction: 'message',
            successMessage: 'Sent!',
          },
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      inboxSubmissions: [
        {
          inbox_item_id: 'inb_private_1',
          submission_id: 'sub_private_1',
          site_id: migrated.id,
          form_id: 'form_contact',
          form_name_snapshot: 'Contact Us',
          category_id: 'cat_inquiry',
          destination_worksheet_id: 'Submissions',
          read_status: 'unread',
          starred: false,
          archived: false,
          spam_status: 'ham',
          submitted_at: '2026-01-05T10:00:00Z',
          source_page: '/',
          created_at: '2026-01-05T10:00:00Z',
          updated_at: '2026-01-05T10:00:00Z',
          fields: {
            email: 'alice-private@example.com',
            budget: '$250k',
          },
        },
      ],
      inboxNotes: [
        {
          note_id: 'note_1',
          inbox_item_id: 'inb_private_1',
          author_id: 'owner_1',
          author_name: 'Owner',
          note_content: 'INTERNAL_OWNER_NOTE_DO_NOT_LEAK',
          created_at: '2026-01-05T11:00:00Z',
          updated_at: '2026-01-05T11:00:00Z',
        },
      ],
      inboxActivities: [
        {
          activity_id: 'act_1',
          inbox_item_id: 'inb_private_1',
          action: 'created',
          actor_id: 'system',
          created_at: '2026-01-05T10:00:00Z',
        },
      ],
    },
  };
}

describe('Builly Shared Runtime Architecture', () => {
  it('resolves public site routes cleanly while preserving reserved builder/auth routes', () => {
    expect(resolveAppRouteKind('/')).toBe('landing');
    expect(resolveAppRouteKind('/login')).toBe('login');
    expect(resolveAppRouteKind('/auth/callback')).toBe('auth-callback');
    expect(resolveAppRouteKind('/workspace')).toBe('workspace');
    expect(resolveAppRouteKind('/builder')).toBe('builder');
    expect(resolveAppRouteKind('/editor/page_1')).toBe('builder');

    expect(resolveAppRouteKind('/studio-nova')).toBe('public-site');
    expect(resolvePublicSiteFromPath('/studio-nova')).toEqual({
      siteSlug: 'studio-nova',
      sitePagePath: '/',
    });
    expect(resolvePublicSiteFromPath('/studio-nova/projects/alpha')).toEqual({
      siteSlug: 'studio-nova',
      sitePagePath: '/projects/alpha',
    });
    expect(resolvePublicSiteFromPath('/s/studio-nova/about')).toEqual({
      siteSlug: 'studio-nova',
      sitePagePath: '/about',
    });
    expect(resolvePublicSiteFromPath('/api/public/sites/studio-nova/runtime')).toBeNull();
  });

  it('scrubs all Inbox submissions, notes, private Spreadsheet IDs, private fields, and draft CMS records from published snapshots', () => {
    const site = createRichTestSite();
    const release = compilerService.compileRelease(
      site,
      INITIAL_GOOGLE_WORKSPACE,
      'Release v1',
      getDefaultPublishPageIds(site)
    );
    expect(release.driveFileId).toMatch(/^local_stage_/);
    expect(release.driveFileId).not.toMatch(/^drv_art_/);

    const snapshot = buildPublishedRuntimeSnapshot({
      site,
      release,
      workspace: INITIAL_GOOGLE_WORKSPACE,
    });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('1SECRET_OWNER_SPREADSHEET_ID_XYZ');
    expect(serialized).not.toContain('alice-private@example.com');
    expect(serialized).not.toContain('INTERNAL_OWNER_NOTE_DO_NOT_LEAK');
    expect(serialized).not.toContain('UNPUBLISHED_SECRET_DRAFT');
    expect(serialized).not.toContain('CONFIDENTIAL_9999_USD');
    expect(serialized).not.toContain('inboxSubmissions');
    expect(serialized).not.toContain('inboxNotes');
    expect(serialized).not.toContain('inboxActivities');
    expect(snapshot.publicCms?.records.some((r) => r.recordId === 'rec_pub_1')).toBe(true);
    expect(snapshot.publicCms?.records.some((r) => r.recordId === 'rec_draft_1')).toBe(false);
    expect(snapshot.publicForms['form_contact']).toBeDefined();
    expect((snapshot.publicForms['form_contact'] as unknown as Record<string, unknown>).destination).toBeUndefined();

    // Also verify defensive scrubber strips stray injected keys
    const polluted = {
      ...snapshot,
      ownerId: 'user_secret_123',
      inboxSubmissions: [{ secret: true }],
      spreadsheetId: 'sheet_secret',
    };
    const cleaned = stripSecretsFromPublishedSnapshot(polluted);
    const cleanedStr = JSON.stringify(cleaned);
    expect(cleanedStr).not.toContain('user_secret_123');
    expect(cleanedStr).not.toContain('sheet_secret');
    expect(cleanedStr).not.toContain('inboxSubmissions');
  });

  it('hardens component trees against javascript: URLs, dangerous data URLs, and unknown node types', () => {
    const unsafeTree: ElementNode = {
      id: 'root_test',
      type: 'container',
      name: 'Root',
      styles: {},
      children: [
        {
          id: 'btn_xss',
          type: 'button',
          name: 'Bad Button',
          styles: {},
          content: {
            text: 'Click',
            url: 'javascript:alert(1)',
          },
        },
        {
          id: 'img_xss',
          type: 'image',
          name: 'Bad Image',
          styles: {},
          content: {
            imageSrc: 'data:text/html,<script>alert(1)</script>',
          },
        },
        {
          id: 'unknown_future_widget',
          type: 'custom-future-widget' as unknown as ElementNode['type'],
          name: 'Future Widget',
          styles: {},
          content: {},
        },
      ],
    };

    const report = validateRuntimeNodeTree(unsafeTree);
    const sanitizedBtn = report.sanitizedTree.children?.[0];
    const sanitizedImg = report.sanitizedTree.children?.[1];
    expect(sanitizedBtn?.content?.url).toBe('#');
    expect(sanitizedImg?.content?.imageSrc).toBe('');
    expect(report.unsupportedTypes).toContain('custom-future-widget');
  });

  it('enforces schemaVersion and runtimeMinVersion compatibility checks', () => {
    expect(
      validateRuntimeSnapshotCompatibility({ schemaVersion: 1, runtimeMinVersion: '1.0.0' })
    ).toEqual({ compatible: true });

    const futureSchema = validateRuntimeSnapshotCompatibility({
      schemaVersion: 99,
      runtimeMinVersion: '1.0.0',
    });
    expect(futureSchema.compatible).toBe(false);

    const futureRuntime = validateRuntimeSnapshotCompatibility({
      schemaVersion: 1,
      runtimeMinVersion: '2.1.0',
    });
    expect(futureRuntime.compatible).toBe(false);
  });

  it('partitions CMS, Inbox, and System into separate spreadsheets and skips disabled CMS types', () => {
    const site = createRichTestSite();
    const plan = buildPartitionPlan(site, site.cms);

    expect(plan.siteSlug).toBe('studio-nova');
    expect(plan.skippedDisabledContentTypes).toContain('ct_disabled_type');
    expect(plan.cmsDatasets.some((d) => d.datasetKey === 'cms_ct_disabled_type')).toBe(false);
    expect(plan.cmsDatasets.every((d) => d.domain === 'cms')).toBe(true);
    expect(plan.inboxDatasets.map((d) => d.datasetKey)).toEqual([
      'inbox_submissions',
      'inbox_submission_fields',
      'inbox_categories',
      'inbox_notes',
      'inbox_activity',
    ]);
    expect(plan.systemDatasets.map((d) => d.datasetKey)).toEqual([
      'system_sites',
      'system_sheet_resources',
      'system_sync_jobs',
    ]);
  });

  it('generates a clean, valid on-demand multi-page ZIP export with zero secrets', () => {
    const site = createRichTestSite();
    const zipResult = generateSiteSourceZip({
      site,
      workspace: INITIAL_GOOGLE_WORKSPACE,
      includeDraftPages: false,
    });

    expect(zipResult.fileName).toMatch(/^studio-nova-.*-source\.zip$/);
    // PK\x03\x04 local file header magic bytes
    expect(zipResult.zipBytes[0]).toBe(0x50);
    expect(zipResult.zipBytes[1]).toBe(0x4b);
    expect(zipResult.zipBytes[2]).toBe(0x03);
    expect(zipResult.zipBytes[3]).toBe(0x04);

    expect(zipResult.filePaths).toContain('README.md');
    expect(zipResult.filePaths).toContain('index.html');
    expect(zipResult.filePaths).toContain('styles/reset.css');
    expect(zipResult.filePaths).toContain('styles/variables.css');
    expect(zipResult.filePaths).toContain('styles/global.css');
    expect(zipResult.filePaths).toContain('scripts/main.js');
    expect(zipResult.filePaths).toContain('export-manifest.json');
    expect(zipResult.filePaths.some((p) => p.startsWith('pages/') && p.endsWith('.html'))).toBe(true);
    expect(zipResult.filePaths.some((p) => p.startsWith('assets/') && p.endsWith('.png'))).toBe(true);

    // Inspect decoded ZIP text for any leaked secrets
    const decodedZipText = new TextDecoder().decode(zipResult.zipBytes);
    expect(decodedZipText).not.toContain('1SECRET_OWNER_SPREADSHEET_ID_XYZ');
    expect(decodedZipText).not.toContain('alice-private@example.com');
    expect(decodedZipText).not.toContain('INTERNAL_OWNER_NOTE_DO_NOT_LEAK');
    expect(decodedZipText).not.toContain('UNPUBLISHED_SECRET_DRAFT');
    expect(decodedZipText).not.toContain('CONFIDENTIAL_9999_USD');
  });
});
