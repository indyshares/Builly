import { describe, expect, it } from 'vitest';
import { validatePageSlug } from '../pageService';
import {
  executeTreeMove,
  validateTreeInsert,
  validateTreeMove,
} from '../treeCommandService';
import {
  migrateSiteComponentsAndLayout,
  resolvePageSlotComponent,
} from '../componentLibraryService';
import { migrateSiteCms } from '../cms/cmsService';
import { INITIAL_SITE } from '../../data/initialSite';
import { ElementNode, SiteDocument } from '../../types/builder';

describe('Builder & CMS core regression invariants', () => {
  it('preserves initial multi-page site, global components, and CMS schemas', () => {
    const hydrated = migrateSiteCms(migrateSiteComponentsAndLayout(INITIAL_SITE));
    expect(hydrated.pages.length).toBeGreaterThanOrEqual(4);
    expect(hydrated.globalComponents?.headers.length).toBeGreaterThan(0);
    expect(hydrated.globalComponents?.footers.length).toBeGreaterThan(0);
    expect(hydrated.cms?.contentTypes.length).toBeGreaterThan(0);
  });

  it('uses Global Header on Home without legacy duplicate home_nav in INITIAL_SITE or migrated drafts', () => {
    const hydratedInitial = migrateSiteComponentsAndLayout(INITIAL_SITE);
    const homePage = hydratedInitial.pages.find((p) => p.id === 'page_home')!;
    expect(homePage.rootElement.children?.some((c) => c.id === 'home_nav')).toBe(false);

    const resolvedHeader = resolvePageSlotComponent(homePage, hydratedInitial, 'header');
    expect(resolvedHeader.effectiveEnabled).toBe(true);
    expect(resolvedHeader.component).not.toBeNull();

    const legacySiteWithDuplicateNav: SiteDocument = {
      ...INITIAL_SITE,
      pages: [
        {
          ...homePage,
          rootElement: {
            ...homePage.rootElement,
            children: [
              {
                id: 'home_nav',
                type: 'container',
                name: 'Navigation Bar',
                tag: 'header',
                styles: {},
                children: [],
              },
              ...(homePage.rootElement.children || []),
            ],
          },
        },
      ],
    };

    const migratedLegacy = migrateSiteComponentsAndLayout(legacySiteWithDuplicateNav);
    expect(migratedLegacy.pages[0].rootElement.children?.some((c) => c.id === 'home_nav')).toBe(
      false
    );
  });

  it('blocks reserved slugs including indyshares and builly', () => {
    const resBuilly = validatePageSlug('builly', INITIAL_SITE.pages);
    const resIndy = validatePageSlug('indyshares', INITIAL_SITE.pages);
    expect(resBuilly.valid).toBe(false);
    expect(resIndy.valid).toBe(false);

    const resValid = validatePageSlug('case-study-2026', INITIAL_SITE.pages);
    expect(resValid.valid).toBe(true);
    expect(resValid.normalized).toBe('/case-study-2026');
  });

  it('supports tree move/reparenting and rejects moving a container into its own descendant', () => {
    const root: ElementNode = {
      id: 'root',
      type: 'container',
      name: 'Page Root',
      styles: {},
      content: {},
      children: [
        {
          id: 'sec_a',
          type: 'container',
          name: 'Section A',
          styles: {},
          content: {},
          children: [
            {
              id: 'box_inner',
              type: 'container',
              name: 'Inner Box',
              styles: {},
              content: {},
              children: [],
            },
            {
              id: 'heading_1',
              type: 'heading',
              name: 'Heading',
              styles: {},
              content: { text: 'Hello' },
            },
          ],
        },
        {
          id: 'sec_b',
          type: 'container',
          name: 'Section B',
          styles: {},
          content: {},
          children: [],
        },
      ],
    };

    const site: SiteDocument = {
      ...INITIAL_SITE,
      pages: [
        {
          ...INITIAL_SITE.pages[0],
          rootElement: root,
        },
      ],
    };
    const activePage = site.pages[0];

    const moveCheck = validateTreeMove(site, activePage, {
      nodeIds: ['heading_1'],
      destinationParentId: 'sec_b',
      destinationIndex: 0,
    });
    expect(moveCheck.valid).toBe(true);

    const nextRoot = executeTreeMove(root, ['heading_1'], 'sec_b', 0);
    expect(nextRoot.children?.[1].children?.map((c) => c.id)).toEqual(['heading_1']);

    const selfNestCheck = validateTreeMove(site, activePage, {
      nodeIds: ['sec_a'],
      destinationParentId: 'box_inner',
      destinationIndex: 0,
    });
    expect(selfNestCheck.valid).toBe(false);

    const leafInsertCheck = validateTreeInsert(site, activePage, {
      elementType: 'text',
      destinationParentId: 'heading_1',
      destinationIndex: 0,
    });
    expect(leafInsertCheck.valid).toBe(false);
  });
});
