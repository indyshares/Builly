import { describe, expect, it } from 'vitest';
import { INITIAL_SITE } from '../../data/initialSite';
import { ElementNode, SiteDocument } from '../../types/builder';
import { validatePageSlug, createPageDocument } from '../pageService';
import { executeTreeMove } from '../treeCommandService';
import { resolveStylesForBreakpoint } from '../responsiveStyleModel';
import { executeCmsQuery } from '../cms/cmsQueryEngine';
import { migrateSiteCms } from '../cms/cmsService';
import { migrateSiteComponentsAndLayout } from '../componentLibraryService';

describe('Builly Visual Builder End-to-End Acceptance Tests', () => {
  it('validates page creation, slug checking, and reserved route blocking', () => {
    const site = migrateSiteComponentsAndLayout(INITIAL_SITE);
    const slugCheck = validatePageSlug('portfolio-2026', site.pages);
    expect(slugCheck.valid).toBe(true);
    expect(slugCheck.fullPath).toBe('/portfolio-2026');

    const resApi = validatePageSlug('api', site.pages);
    expect(resApi.valid).toBe(false);

    const newPage = createPageDocument({
      siteName: 'Test Site',
      name: 'Portfolio 2026',
      slugInput: 'portfolio-2026',
      method: 'blank',
      pages: site.pages,
    });
    expect(newPage.slug).toBe('/portfolio-2026');
    expect(newPage.name).toBe('Portfolio 2026');
  });

  it('executes tree move commands correctly and prevents circular moves', () => {
    const rootNode: ElementNode = {
      id: 'root',
      type: 'container',
      name: 'Root Container',
      styles: { display: 'flex' },
      children: [
        {
          id: 'child_1',
          type: 'container',
          name: 'Child 1',
          styles: {},
          children: [
            {
              id: 'heading_1',
              type: 'heading',
              name: 'Heading',
              content: { text: 'Test', headingLevel: 'h2' },
              styles: {},
            },
          ],
        },
      ],
    };

    const moved = executeTreeMove(rootNode, ['heading_1'], 'root', 0);
    expect(moved.children?.some((c) => c.id === 'heading_1')).toBe(true);
  });

  it('resolves responsive style overrides correctly for desktop, tablet, and mobile breakpoints', () => {
    const node: ElementNode = {
      id: 'resp_elem',
      type: 'container',
      name: 'Responsive Box',
      styles: { padding: '32px', width: '100%' },
      responsiveStyles: {
        tablet: { padding: '24px' },
        mobile: { padding: '16px', width: 'auto' },
      },
    };

    const desktopStyles = resolveStylesForBreakpoint(node, 'desktop');
    const tabletStyles = resolveStylesForBreakpoint(node, 'tablet');
    const mobileStyles = resolveStylesForBreakpoint(node, 'mobile');

    expect(desktopStyles.padding).toBe('32px');
    expect(tabletStyles.padding).toBe('24px');
    expect(tabletStyles.width).toBe('100%'); // inherited from desktop
    expect(mobileStyles.padding).toBe('16px');
    expect(mobileStyles.width).toBe('auto');
  });

  it('queries CMS records correctly in editor vs public build modes', () => {
    const site = migrateSiteCms(migrateSiteComponentsAndLayout(INITIAL_SITE));
    const cms = site.cms!;

    const postTypeId = cms.contentTypes.find((ct) => ct.slug === 'posts')?.id || 'post';

    const editorRes = executeCmsQuery(
      cms,
      { contentTypeId: postTypeId, statusFilter: 'all_non_trash' },
      { mode: 'editor' }
    );
    expect(editorRes.records.length).toBeGreaterThan(0);

    const publicRes = executeCmsQuery(
      cms,
      { contentTypeId: postTypeId, statusFilter: 'published_only' },
      { mode: 'public_build' }
    );
    expect(publicRes.records.every((r) => r.status === 'published')).toBe(true);
  });

  it('preserves owner Inbox submissions and form definitions during site version rollback', () => {
    const site = migrateSiteCms(migrateSiteComponentsAndLayout(INITIAL_SITE));
    const sampleInboxSub = {
      inbox_item_id: 'inb_test_1',
      submission_id: 'sub_test_1',
      site_id: site.id,
      form_id: 'form_contact',
      form_name_snapshot: 'Contact',
      category_id: 'cat_inquiry',
      destination_worksheet_id: 'Submissions',
      read_status: 'unread' as const,
      starred: false,
      archived: false,
      spam_status: 'ham' as const,
      submitted_at: new Date().toISOString(),
      source_page: '/',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      fields: { message: 'Important client note' },
    };

    const siteWithInbox: SiteDocument = {
      ...site,
      cms: {
        ...site.cms!,
        inboxSubmissions: [sampleInboxSub],
      },
      releases: [
        {
          version: 'v1.0.0',
          version_number: 'v1.0.0',
          build_id: 'bld_1',
          timestamp: new Date().toISOString(),
          status: 'Active',
          is_active: true,
          commitMessage: 'Initial release',
          pageCount: 1,
          compiledPages: {},
          publishedRoutes: [
            {
              pageId: 'page_home',
              name: 'Home',
              fullPath: '/',
              navLabel: 'Home',
              navVisible: true,
              isHome: true,
              order: 0,
              title: 'Home',
            },
          ],
          artifactSize: '15 KB',
          driveFileId: 'local_stage_1',
          cmsSnapshot: {
            ...site.cms!,
            inboxSubmissions: [],
          },
        },
      ],
    };

    const targetCms = siteWithInbox.releases[0].cmsSnapshot!;
    const preservedCms = {
      ...targetCms,
      inboxSubmissions: siteWithInbox.cms?.inboxSubmissions || [],
      forms: siteWithInbox.cms?.forms || [],
    };

    expect(preservedCms.inboxSubmissions.length).toBe(1);
    expect(preservedCms.inboxSubmissions[0].submission_id).toBe('sub_test_1');
  });
});
