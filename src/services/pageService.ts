import {
  ElementNode,
  PageDocument,
  PageStatus,
  PublishedRouteEntry,
  SiteDocument,
} from '../types/builder';

export const RESERVED_PAGE_SLUGS = new Set([
  'api',
  'admin',
  'auth',
  'login',
  'logout',
  '_next',
  'assets',
  'static',
  'sitemap.xml',
  'robots.txt',
  'indyshares',
  'builly',
  'editor',
  'preview',
  'well-known',
]);

export type PageCreationMethod = 'blank' | 'template' | 'duplicate';

export interface PageTemplateOption {
  id: string;
  name: string;
  description: string;
  defaultPageName: string;
  buildRoot: (pageName: string) => ElementNode;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

export function cloneElementTreeWithNewIds(node: ElementNode): ElementNode {
  const cloned: ElementNode = JSON.parse(JSON.stringify(node));
  const assignIds = (item: ElementNode) => {
    item.id = makeId('el');
    item.children?.forEach(assignIds);
  };
  assignIds(cloned);
  return cloned;
}

function createEmptyPageRoot(pageName: string): ElementNode {
  return {
    id: makeId('root'),
    type: 'container',
    name: `${pageName} Root`,
    tag: 'div',
    styles: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      maxWidth: 'var(--theme-max-width)',
      marginLeft: 'auto',
      marginRight: 'auto',
      paddingTop: '40px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
      gap: '32px',
    },
    children: [],
  };
}

export const PAGE_TEMPLATES: PageTemplateOption[] = [
  {
    id: 'about',
    name: 'About & Biography',
    description: 'Editorial headline, bio story, and core values inheriting the active site theme.',
    defaultPageName: 'About',
    buildRoot: (pageName: string) => ({
      ...createEmptyPageRoot(pageName),
      children: [
        {
          id: makeId('sec'),
          type: 'container',
          name: 'About Intro',
          tag: 'section',
          styles: {
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxWidth: '720px',
          },
          children: [
            {
              id: makeId('h1'),
              type: 'heading',
              name: 'About Headline',
              tag: 'h1',
              content: {
                text: 'Background, practice, and perspective.',
                headingLevel: 'h1',
              },
              styles: {
                fontFamily: 'var(--font-display)',
                fontSize: '40px',
                fontWeight: '700',
                lineHeight: '1.15',
                textColor: 'var(--color-heading)',
              },
            },
            {
              id: makeId('txt'),
              type: 'text',
              name: 'About Story',
              content: {
                text: 'Introduce your background, areas of focus, and how you approach collaborations or projects.',
              },
              styles: {
                fontSize: '16px',
                lineHeight: '1.65',
                textColor: 'var(--color-text-muted)',
              },
            },
          ],
        },
      ],
    }),
  },
  {
    id: 'projects',
    name: 'Projects & Case Studies',
    description: 'Header + dynamic Google Sheets PROJECTS repeater grid styled with site tokens.',
    defaultPageName: 'Projects',
    buildRoot: (pageName: string) => ({
      ...createEmptyPageRoot(pageName),
      children: [
        {
          id: makeId('hdr'),
          type: 'container',
          name: 'Projects Header',
          tag: 'section',
          styles: { display: 'flex', flexDirection: 'column', gap: '12px' },
          children: [
            {
              id: makeId('h1'),
              type: 'heading',
              name: 'Projects Title',
              tag: 'h1',
              content: { text: 'Selected Case Studies', headingLevel: 'h1' },
              styles: {
                fontFamily: 'var(--font-display)',
                fontSize: '40px',
                fontWeight: '700',
                textColor: 'var(--color-heading)',
              },
            },
            {
              id: makeId('sub'),
              type: 'text',
              name: 'Projects Intro',
              content: {
                text: 'Work items automatically stay in sync with your Google Sheets PROJECTS tab.',
              },
              styles: { fontSize: '16px', textColor: 'var(--color-text-muted)' },
            },
          ],
        },
        {
          id: makeId('rep'),
          type: 'repeater',
          name: 'Projects Grid Repeater',
          content: {
            repeaterCollection: 'PROJECTS',
            repeaterLimit: 6,
            repeaterSortBy: 'year',
            repeaterOrder: 'desc',
          },
          styles: {
            display: 'grid',
            gridColumns: '1fr 1fr',
            gap: '24px',
            width: '100%',
          },
          children: [
            {
              id: makeId('card'),
              type: 'container',
              name: 'Project Card',
              styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                paddingTop: '20px',
                paddingBottom: '20px',
                paddingLeft: '20px',
                paddingRight: '20px',
                backgroundColor: 'var(--color-surface)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              },
              children: [
                {
                  id: makeId('c_title'),
                  type: 'heading',
                  name: 'Project Title',
                  tag: 'h3',
                  dynamicBinding: {
                    enabled: true,
                    source: 'sheets',
                    tab: 'PROJECTS',
                    field: 'title',
                  },
                  content: { text: 'Project Title', headingLevel: 'h3' },
                  styles: {
                    fontFamily: 'var(--font-display)',
                    fontSize: '20px',
                    fontWeight: '700',
                    textColor: 'var(--color-heading)',
                  },
                },
                {
                  id: makeId('c_desc'),
                  type: 'text',
                  name: 'Project Summary',
                  dynamicBinding: {
                    enabled: true,
                    source: 'sheets',
                    tab: 'PROJECTS',
                    field: 'description',
                  },
                  content: { text: 'Project summary bound from Google Sheets.' },
                  styles: {
                    fontSize: '14px',
                    lineHeight: '1.5',
                    textColor: 'var(--color-text-muted)',
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  },
  {
    id: 'services',
    name: 'Services & Capabilities',
    description: 'Two-column offerings layout with clear deliverables and CTA button.',
    defaultPageName: 'Services',
    buildRoot: (pageName: string) => ({
      ...createEmptyPageRoot(pageName),
      children: [
        {
          id: makeId('srv_hdr'),
          type: 'heading',
          name: 'Services Headline',
          tag: 'h1',
          content: { text: 'Services & Advisory', headingLevel: 'h1' },
          styles: {
            fontFamily: 'var(--font-display)',
            fontSize: '40px',
            fontWeight: '700',
            textColor: 'var(--color-heading)',
          },
        },
        {
          id: makeId('srv_grid'),
          type: 'grid-2col',
          name: 'Services Grid',
          styles: {
            display: 'grid',
            gridColumns: '1fr 1fr',
            gap: '24px',
            width: '100%',
          },
          children: [
            {
              id: makeId('srv_1'),
              type: 'container',
              name: 'Service Column 1',
              styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingTop: '24px',
                paddingBottom: '24px',
                paddingLeft: '24px',
                paddingRight: '24px',
                backgroundColor: 'var(--color-surface)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              },
              children: [
                {
                  id: makeId('srv_1_h'),
                  type: 'heading',
                  name: 'Service Title 1',
                  tag: 'h3',
                  content: { text: '01. Product & Systems Design', headingLevel: 'h3' },
                  styles: {
                    fontFamily: 'var(--font-display)',
                    fontSize: '20px',
                    fontWeight: '700',
                    textColor: 'var(--color-heading)',
                  },
                },
                {
                  id: makeId('srv_1_p'),
                  type: 'text',
                  name: 'Service Description 1',
                  content: {
                    text: 'End-to-end interface architecture, design tokens, and responsive component systems.',
                  },
                  styles: { fontSize: '14px', lineHeight: '1.6', textColor: 'var(--color-text-muted)' },
                },
              ],
            },
            {
              id: makeId('srv_2'),
              type: 'container',
              name: 'Service Column 2',
              styles: {
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                paddingTop: '24px',
                paddingBottom: '24px',
                paddingLeft: '24px',
                paddingRight: '24px',
                backgroundColor: 'var(--color-surface)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              },
              children: [
                {
                  id: makeId('srv_2_h'),
                  type: 'heading',
                  name: 'Service Title 2',
                  tag: 'h3',
                  content: { text: '02. Technical Prototyping', headingLevel: 'h3' },
                  styles: {
                    fontFamily: 'var(--font-display)',
                    fontSize: '20px',
                    fontWeight: '700',
                    textColor: 'var(--color-heading)',
                  },
                },
                {
                  id: makeId('srv_2_p'),
                  type: 'text',
                  name: 'Service Description 2',
                  content: {
                    text: 'Rapid interactive web builds backed by clean documentation and measurable performance.',
                  },
                  styles: { fontSize: '14px', lineHeight: '1.6', textColor: 'var(--color-text-muted)' },
                },
              ],
            },
          ],
        },
      ],
    }),
  },
  {
    id: 'contact',
    name: 'Contact & Inquiry',
    description: 'Focused contact page with headline, availability note, and direct action button.',
    defaultPageName: 'Contact',
    buildRoot: (pageName: string) => ({
      ...createEmptyPageRoot(pageName),
      children: [
        {
          id: makeId('cnt_box'),
          type: 'container',
          name: 'Contact Card',
          tag: 'section',
          styles: {
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            paddingTop: '36px',
            paddingBottom: '36px',
            paddingLeft: '32px',
            paddingRight: '32px',
            backgroundColor: 'var(--color-surface)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--color-border)',
            borderRadius: 'var(--theme-radius)',
          },
          children: [
            {
              id: makeId('cnt_h1'),
              type: 'heading',
              name: 'Contact Heading',
              tag: 'h1',
              content: { text: 'Get in Touch', headingLevel: 'h1' },
              styles: {
                fontFamily: 'var(--font-display)',
                fontSize: '36px',
                fontWeight: '700',
                textColor: 'var(--color-heading)',
              },
            },
            {
              id: makeId('cnt_p'),
              type: 'text',
              name: 'Contact Copy',
              content: {
                text: 'Available for selected advisory engagements, design architecture sprints, and full-product builds.',
              },
              styles: { fontSize: '16px', lineHeight: '1.6', textColor: 'var(--color-text-muted)' },
            },
            {
              id: makeId('cnt_btn'),
              type: 'button',
              name: 'Contact Action',
              content: { text: 'Send Email Inquiry', url: 'mailto:hello@example.com' },
              styles: {
                alignItems: 'center',
                backgroundColor: 'var(--color-button-primary-bg)',
                textColor: 'var(--color-button-primary-text)',
                paddingTop: '12px',
                paddingBottom: '12px',
                paddingLeft: '24px',
                paddingRight: '24px',
                borderRadius: 'var(--theme-radius)',
                fontWeight: '600',
                fontSize: '14px',
              },
            },
          ],
        },
      ],
    }),
  },
];

export function normalizePageSlugSegment(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned;
}

export function normalizePageSlug(raw: string, isHome = false): string {
  if (isHome) return '/';
  const segment = normalizePageSlugSegment(raw);
  return segment ? `/${segment}` : '/';
}

export function wouldCreateParentCycle(
  pageId: string,
  candidateParentId: string | null | undefined,
  pages: PageDocument[]
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === pageId) return true;
  const visited = new Set<string>([pageId]);
  let cursor: string | null | undefined = candidateParentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const parent = pages.find((p) => p.id === cursor);
    cursor = parent?.parentPageId || null;
  }
  return false;
}

export function resolvePageFullPath(page: PageDocument, pages: PageDocument[]): string {
  if (page.isHome || page.slug === '/') return '/';
  const selfSeg = normalizePageSlugSegment(page.slug) || normalizePageSlugSegment(page.name) || page.id;

  if (!page.parentPageId || wouldCreateParentCycle(page.id, page.parentPageId, pages)) {
    return `/${selfSeg}`;
  }

  const segments: string[] = [selfSeg];
  const seen = new Set<string>([page.id]);
  let parentId: string | null | undefined = page.parentPageId;

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = pages.find((p) => p.id === parentId);
    if (!parent) break;
    if (!parent.isHome && parent.slug !== '/') {
      const pSeg = normalizePageSlugSegment(parent.slug);
      if (pSeg) segments.unshift(pSeg);
    }
    parentId = parent.parentPageId;
  }

  return `/${segments.join('/')}`;
}

export function resolvePublicPortfolioUrl(portfolioSlug: string, fullPath: string): string {
  const base = `https://builly.me/${portfolioSlug}`;
  if (!fullPath || fullPath === '/') return base;
  return `${base}${fullPath.startsWith('/') ? fullPath : `/${fullPath}`}`;
}

export interface SlugValidationResult {
  valid: boolean;
  normalized: string;
  fullPath: string;
  error?: string;
}

export function validatePageSlug(
  rawSlug: string,
  pages: PageDocument[],
  currentPageId?: string,
  parentPageId?: string | null,
  isHome = false
): SlugValidationResult {
  if (isHome) {
    return { valid: true, normalized: '/', fullPath: '/' };
  }

  const segment = normalizePageSlugSegment(rawSlug);
  if (!segment) {
    return {
      valid: false,
      normalized: '',
      fullPath: '',
      error: 'URL slug is required (letters, numbers, and hyphens).',
    };
  }

  if (RESERVED_PAGE_SLUGS.has(segment)) {
    return {
      valid: false,
      normalized: `/${segment}`,
      fullPath: `/${segment}`,
      error: `"/${segment}" is a reserved platform route.`,
    };
  }

  const normalized = `/${segment}`;
  const tempPage: PageDocument = {
    id: currentPageId || '__candidate__',
    name: segment,
    slug: normalized,
    parentPageId: parentPageId || null,
    isHome: false,
    title: '',
    description: '',
    lastModified: '',
    rootElement: { id: 'tmp', type: 'container', name: 'tmp', styles: {} },
  };
  const simulatedPages = currentPageId
    ? pages.map((p) => (p.id === currentPageId ? { ...p, slug: normalized, parentPageId: parentPageId || null } : p))
    : [...pages, tempPage];

  const candidatePath = resolvePageFullPath(
    simulatedPages.find((p) => p.id === tempPage.id) || tempPage,
    simulatedPages
  );

  const conflict = pages.find(
    (p) => p.id !== currentPageId && resolvePageFullPath(p, pages) === candidatePath
  );
  if (conflict) {
    return {
      valid: false,
      normalized,
      fullPath: candidatePath,
      error: `Route "${candidatePath}" conflicts with "${conflict.name}".`,
    };
  }

  return {
    valid: true,
    normalized,
    fullPath: candidatePath,
  };
}

export function generateUniquePageSlug(
  rawNameOrSlug: string,
  pages: PageDocument[],
  parentPageId?: string | null,
  isHome = false
): string {
  if (isHome) return '/';
  const baseSegment = normalizePageSlugSegment(rawNameOrSlug) || 'page';
  const safeBase = RESERVED_PAGE_SLUGS.has(baseSegment) ? `${baseSegment}-page` : baseSegment;

  let candidate = `/${safeBase}`;
  let suffix = 2;
  while (!validatePageSlug(candidate, pages, undefined, parentPageId, false).valid) {
    candidate = `/${safeBase}-${suffix}`;
    suffix++;
  }
  return candidate;
}

export function sortPagesForTree(pages: PageDocument[]): PageDocument[] {
  return [...pages].sort((a, b) => {
    const orderA = a.navigation?.order ?? 999;
    const orderB = b.navigation?.order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

export function normalizePageOrders(pages: PageDocument[]): PageDocument[] {
  return pages.map((p, idx) => ({
    ...p,
    navigation: {
      visible: p.navigation?.visible ?? true,
      label: p.navigation?.label || p.name,
      order: idx,
    },
  }));
}

export function migrateSitePages(site: SiteDocument): SiteDocument {
  const rawPages = Array.isArray(site.pages) ? site.pages : [];
  if (rawPages.length === 0) {
    return {
      ...site,
      pageRegistryRevision: site.pageRegistryRevision ?? 1,
      siteThemeRevision: site.siteThemeRevision ?? 1,
      pages: [],
      activePageId: '',
    };
  }

  // Ensure strictly ONE Home page
  let foundHome = false;
  const candidateHomeIdx = rawPages.findIndex((p) => p.isHome) !== -1
    ? rawPages.findIndex((p) => p.isHome)
    : rawPages.findIndex((p) => p.slug === '/') !== -1
    ? rawPages.findIndex((p) => p.slug === '/')
    : 0;

  const sorted = sortPagesForTree(rawPages);
  const migratedPages: PageDocument[] = sorted.map((p, idx) => {
    const isDesignatedHome = rawPages[candidateHomeIdx]?.id === p.id && !foundHome;
    if (isDesignatedHome) foundHome = true;

    const cleanSlug = isDesignatedHome
      ? '/'
      : normalizePageSlug(p.slug === '/' ? p.name : p.slug, false);

    return {
      ...p,
      isHome: isDesignatedHome,
      slug: cleanSlug,
      parentPageId: isDesignatedHome ? null : p.parentPageId || null,
      status: (p.status || 'published') as PageStatus,
      navigation: {
        visible: p.navigation?.visible ?? true,
        label: p.navigation?.label || p.name,
        order: idx,
      },
      revision: p.revision ?? 1,
      createdAt: p.createdAt || p.lastModified || new Date().toISOString(),
    };
  });

  const activeExists = migratedPages.some((p) => p.id === site.activePageId);

  return {
    ...site,
    pageRegistryRevision: site.pageRegistryRevision ?? 1,
    siteThemeRevision: site.siteThemeRevision ?? 1,
    pages: migratedPages,
    activePageId: activeExists ? site.activePageId : migratedPages[0].id,
  };
}

export function createPageDocument(params: {
  siteName: string;
  pages: PageDocument[];
  name: string;
  slugInput: string;
  method: PageCreationMethod;
  templateId?: string;
  sourcePageId?: string;
  parentPageId?: string | null;
  showInNavigation?: boolean;
  forceHome?: boolean;
}): PageDocument {
  const nowIso = new Date().toISOString();
  const stamp = nowIso.replace('T', ' ').substring(0, 16);
  const isHome = Boolean(params.forceHome || params.pages.length === 0);
  const cleanName = params.name.trim() || (isHome ? 'Home' : 'Untitled Page');
  const validSlugCheck = validatePageSlug(
    params.slugInput,
    params.pages,
    undefined,
    isHome ? null : params.parentPageId,
    isHome
  );
  const finalSlug = validSlugCheck.valid
    ? validSlugCheck.normalized
    : generateUniquePageSlug(cleanName, params.pages, params.parentPageId, isHome);

  let rootElement: ElementNode;
  let customCss = '';
  let customJs = '';

  if (params.method === 'duplicate' && params.sourcePageId) {
    const src = params.pages.find((p) => p.id === params.sourcePageId);
    rootElement = src
      ? cloneElementTreeWithNewIds(src.rootElement)
      : createEmptyPageRoot(cleanName);
    rootElement.name = `${cleanName} Root`;
    customCss = src?.customCss || '';
    customJs = src?.customJs || '';
  } else if (params.method === 'template' && params.templateId) {
    const tpl = PAGE_TEMPLATES.find((t) => t.id === params.templateId);
    rootElement = tpl ? tpl.buildRoot(cleanName) : createEmptyPageRoot(cleanName);
  } else {
    rootElement = createEmptyPageRoot(cleanName);
  }

  return {
    id: makeId('page'),
    name: cleanName,
    slug: finalSlug,
    parentPageId: isHome ? null : params.parentPageId || null,
    isHome,
    navigation: {
      visible: params.showInNavigation ?? true,
      label: cleanName,
      order: params.pages.length,
    },
    status: 'draft',
    layout: {
      header: { mode: 'global', localComponentId: null, localComponent: null },
      footer: { mode: 'global', localComponentId: null, localComponent: null },
    },
    title: `${cleanName} — ${params.siteName}`,
    description: '',
    noIndex: false,
    revision: 1,
    createdAt: nowIso,
    lastModified: stamp,
    customCss,
    customJs,
    rootElement,
  };
}

export function buildSiteNavigation(
  pages: PageDocument[],
  options: { includeDrafts?: boolean } = {}
): PublishedRouteEntry[] {
  const { includeDrafts = false } = options;
  const ordered = sortPagesForTree(pages);

  const eligible = ordered.filter((p) => {
    if (p.navigation?.visible === false) return false;
    const status = p.status || 'published';
    if (status === 'unpublished' || status === 'archived') return false;
    if (!includeDrafts && status === 'draft') return false;
    return true;
  });

  const eligibleIds = new Set(eligible.map((p) => p.id));

  return eligible.map((p, idx) => ({
    pageId: p.id,
    name: p.name,
    fullPath: resolvePageFullPath(p, pages),
    navLabel: p.navigation?.label || p.name,
    navVisible: p.navigation?.visible !== false,
    parentPageId: p.parentPageId && eligibleIds.has(p.parentPageId) ? p.parentPageId : null,
    isHome: Boolean(p.isHome),
    order: p.navigation?.order ?? idx,
    title: p.title,
    noIndex: p.noIndex,
  }));
}

export function buildSitemapXml(
  portfolioSlug: string,
  routes: PublishedRouteEntry[]
): string {
  const urls = routes
    .filter((r) => !r.noIndex)
    .map((r) => {
      const loc = resolvePublicPortfolioUrl(portfolioSlug, r.fullPath);
      const priority = r.isHome ? '1.0' : r.parentPageId ? '0.6' : '0.8';
      return `  <url>\n    <loc>${loc}</loc>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}
