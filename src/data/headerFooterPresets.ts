import {
  ElementNavLinkItem,
  ElementNode,
  HeaderFooterPresetDef,
  RegionType,
} from '../types/builder';

const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const DEFAULT_NAV_LINKS: ElementNavLinkItem[] = [
  { id: 'nl_home', label: 'Home', url: '/' },
  { id: 'nl_about', label: 'About', url: '/about' },
  {
    id: 'nl_proj',
    label: 'Projects',
    url: '/projects',
    children: [
      { id: 'nl_proj_all', label: 'All Case Studies', url: '/projects', description: 'Complete archive' },
      { id: 'nl_proj_sys', label: 'Design Systems', url: '/projects', description: 'Component architecture' },
    ],
  },
  { id: 'nl_srv', label: 'Services', url: '/services' },
];

function makeLogo(idPrefix: string, text = 'Alex Rivera', color = 'var(--color-heading)'): ElementNode {
  return {
    id: uid(idPrefix),
    type: 'logo',
    name: 'Brand Logo',
    tag: 'a',
    content: {
      logoMode: 'icon-text',
      logoIconName: 'Layers',
      logoText: text,
      url: '/',
    },
    styles: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: 'var(--font-display)',
      fontSize: '18px',
      fontWeight: '700',
      textColor: color,
    },
  };
}

function makeNavBar(opts: {
  idPrefix: string;
  presetId?: string;
  navVariant?: string;
  mobileNavVariant?: 'drawer' | 'fullscreen' | 'off-canvas' | 'bottom' | 'compact';
  ctaLabel?: string;
  ctaUrl?: string;
  links?: ElementNavLinkItem[];
  textColor?: string;
  logoText?: string;
  navSource?: 'manual' | 'site-pages';
}): ElementNode {
  return {
    id: uid(opts.idPrefix),
    type: 'navbar',
    name: 'Primary Navigation',
    tag: 'nav',
    presetId: opts.presetId,
    presetVersion: opts.presetId ? 1 : undefined,
    isCustomized: false,
    content: {
      logoText: opts.logoText ?? 'Alex Rivera',
      url: '/',
      navSource: opts.navSource ?? 'manual',
      navVariant: opts.navVariant || 'split',
      submenuTrigger: 'click',
      mobileMenuEnabled: true,
      mobileNavVariant: opts.mobileNavVariant || 'drawer',
      drawerSide: 'right',
      ctaLabel: opts.ctaLabel,
      ctaUrl: opts.ctaUrl || '/contact',
      navLinks: JSON.parse(JSON.stringify(opts.links || DEFAULT_NAV_LINKS)),
    },
    styles: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      ...(opts.textColor ? { textColor: opts.textColor } : {}),
    },
  };
}

function makeNavMenu(opts: {
  idPrefix: string;
  name: string;
  presetId: string;
  navVariant: string;
  links?: ElementNavLinkItem[];
  direction?: 'row' | 'column';
  gap?: string;
  mobileNavVariant?: 'drawer' | 'fullscreen' | 'off-canvas' | 'bottom' | 'compact';
  submenuTrigger?: 'click' | 'click-hover';
}): ElementNode {
  return {
    id: uid(opts.idPrefix),
    type: 'nav-menu',
    name: opts.name,
    tag: 'nav',
    presetId: opts.presetId,
    presetVersion: 1,
    isCustomized: false,
    content: {
      navSource: 'manual',
      navVariant: opts.navVariant,
      submenuTrigger: opts.submenuTrigger || 'click',
      mobileMenuEnabled: true,
      mobileNavVariant: opts.mobileNavVariant || 'drawer',
      drawerSide: 'right',
      navLinks: JSON.parse(JSON.stringify(opts.links || DEFAULT_NAV_LINKS)),
    },
    styles: {
      display: 'flex',
      flexDirection: opts.direction || 'row',
      flexWrap: 'wrap',
      alignItems: opts.direction === 'column' ? 'flex-start' : 'center',
      gap: opts.gap || '20px',
    },
  };
}

// ---------------------------------------------------------------------------
// HEADER PRESETS (Covers Standard, Minimal, Portfolio/Creator, Agency/Business,
// Editorial/Content, Overlay/Hero, Mobile-first, Commerce-style shell)
// ---------------------------------------------------------------------------
export const HEADER_PRESETS: HeaderFooterPresetDef[] = [
  {
    presetId: 'hdr_std_portfolio',
    presetVersion: 1,
    regionType: 'header',
    category: 'Standard',
    name: 'Standard Portfolio Header',
    description: 'Logo on left, inline navigation links, mobile drawer toggle, and primary CTA.',
    tags: ['standard', 'logo', 'cta', 'responsive'],
    requiredSlots: ['navigation'],
    optionalSlots: ['logo', 'cta'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_std'),
      type: 'container',
      name: 'Standard Portfolio Header',
      tag: 'header',
      presetId: 'hdr_std_portfolio',
      presetVersion: 1,
      isCustomized: false,
      content: {
        stickyMode: 'sticky',
        containerWidthMode: 'contained',
      },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingTop: '14px',
        paddingBottom: '14px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-border)',
      },
      children: [
        makeNavBar({
          idPrefix: 'hdr_std_nav',
          presetId: 'nav_split',
          navVariant: 'split',
          ctaLabel: 'Get in Touch',
          ctaUrl: '/contact',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_std_centered',
    presetVersion: 1,
    regionType: 'header',
    category: 'Standard',
    name: 'Centered Brand & Split Navigation',
    description: 'Centered studio wordmark stacked cleanly with centered horizontal page links.',
    tags: ['centered', 'balanced', 'studio'],
    requiredSlots: ['logo', 'navigation'],
    optionalSlots: ['tagline'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_ctr'),
      type: 'container',
      name: 'Centered Header',
      tag: 'header',
      presetId: 'hdr_std_centered',
      presetVersion: 1,
      isCustomized: false,
      content: { stickyMode: 'static', containerWidthMode: 'contained' },
      styles: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        width: '100%',
        paddingTop: '18px',
        paddingBottom: '16px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-border)',
      },
      children: [
        makeLogo('hdr_ctr_logo', 'Alex Rivera Studio'),
        makeNavMenu({
          idPrefix: 'hdr_ctr_menu',
          name: 'Centered Links',
          presetId: 'nav_centered',
          navVariant: 'centered',
          gap: '24px',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_min_editorial',
    presetVersion: 1,
    regionType: 'header',
    category: 'Minimal',
    name: 'Minimal Studio Bar',
    description: 'Generous whitespace, crisp wordmark, and 3 essential links without clutter.',
    tags: ['minimal', 'clean', 'whitespace'],
    requiredSlots: ['logo', 'navigation'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_min'),
      type: 'container',
      name: 'Minimal Studio Header',
      tag: 'header',
      presetId: 'hdr_min_editorial',
      presetVersion: 1,
      isCustomized: false,
      content: { stickyMode: 'static', containerWidthMode: 'contained' },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingTop: '18px',
        paddingBottom: '18px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-background)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-divider)',
      },
      children: [
        makeLogo('hdr_min_logo', 'Alex Rivera'),
        makeNavMenu({
          idPrefix: 'hdr_min_menu',
          name: 'Minimal Links',
          presetId: 'nav_horizontal_inline',
          navVariant: 'horizontal-inline',
          links: [
            { id: 'ml_1', label: 'Work', url: '/projects' },
            { id: 'ml_2', label: 'About', url: '/about' },
            { id: 'ml_3', label: 'Contact', url: '/contact' },
          ],
          gap: '20px',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_creator_avatar',
    presetVersion: 1,
    regionType: 'header',
    category: 'Portfolio & Creator',
    name: 'Creator Bio & Availability Bar',
    description: 'Highlights creator role alongside direct portfolio navigation and inquiry button.',
    tags: ['creator', 'portfolio', 'bio', 'cta'],
    requiredSlots: ['logo', 'navigation'],
    optionalSlots: ['status', 'cta'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_crt'),
      type: 'container',
      name: 'Creator Header',
      tag: 'header',
      presetId: 'hdr_creator_avatar',
      presetVersion: 1,
      isCustomized: false,
      content: {
        stickyMode: 'sticky',
        announcementText: 'Available for Q3 Design Systems & Product Architecture Collaborations',
        announcementUrl: '/contact',
      },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingTop: '14px',
        paddingBottom: '14px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-border)',
      },
      children: [
        makeNavBar({
          idPrefix: 'hdr_crt_nav',
          presetId: 'nav_split',
          navVariant: 'split',
          ctaLabel: 'Book Intro Call',
          ctaUrl: '/contact',
          logoText: 'Alex Rivera · Principal Designer',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_agency_utility',
    presetVersion: 1,
    regionType: 'header',
    category: 'Agency & Business',
    name: 'Agency Utility + Mega Menu Header',
    description: 'Announcement bar above a structured multi-dropdown navigation bar with dual action.',
    tags: ['agency', 'utility-bar', 'dropdown', 'business'],
    requiredSlots: ['navigation'],
    optionalSlots: ['announcement', 'cta'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_agy'),
      type: 'container',
      name: 'Agency Utility Header',
      tag: 'header',
      presetId: 'hdr_agency_utility',
      presetVersion: 1,
      isCustomized: false,
      content: {
        stickyMode: 'sticky',
        announcementText: 'New Case Study: Scaling Multi-Brand Design Systems →',
        announcementUrl: '/projects',
      },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingTop: '14px',
        paddingBottom: '14px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-border)',
      },
      children: [
        makeNavBar({
          idPrefix: 'hdr_agy_nav',
          presetId: 'nav_mega_menu',
          navVariant: 'mega-menu',
          ctaLabel: 'Start Project',
          ctaUrl: '/contact',
          logoText: 'Northstar Studio',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_editorial_masthead',
    presetVersion: 1,
    regionType: 'header',
    category: 'Editorial & Content',
    name: 'Editorial Masthead Header',
    description: 'Typography-forward publication header with issue tagline and clean category navigation.',
    tags: ['editorial', 'publication', 'serif', 'masthead'],
    requiredSlots: ['logo', 'navigation'],
    optionalSlots: ['tagline'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_edt'),
      type: 'container',
      name: 'Editorial Masthead',
      tag: 'header',
      presetId: 'hdr_editorial_masthead',
      presetVersion: 1,
      isCustomized: false,
      content: { stickyMode: 'static' },
      styles: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        paddingTop: '22px',
        paddingBottom: '16px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-background)',
        borderBottomWidth: '2px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-heading)',
      },
      children: [
        {
          id: uid('hdr_edt_title'),
          type: 'heading',
          name: 'Publication Masthead',
          tag: 'h2',
          content: { text: 'THE ARCHIVE · ALEX RIVERA', headingLevel: 'h2' },
          styles: {
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: '700',
            letterSpacing: '0.06em',
            textColor: 'var(--color-heading)',
            textAlign: 'center',
          },
        },
        makeNavMenu({
          idPrefix: 'hdr_edt_menu',
          name: 'Editorial Sections',
          presetId: 'nav_tab_style',
          navVariant: 'tab-style',
          gap: '16px',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_overlay_hero',
    presetVersion: 1,
    regionType: 'header',
    category: 'Overlay & Hero',
    name: 'Transparent Overlay / Glass Header',
    description: 'Frosted translucent bar designed to sit seamlessly over bold hero imagery.',
    tags: ['overlay', 'transparent', 'glass', 'hero'],
    requiredSlots: ['navigation'],
    optionalSlots: ['cta'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_ovl'),
      type: 'container',
      name: 'Overlay Glass Header',
      tag: 'header',
      presetId: 'hdr_overlay_hero',
      presetVersion: 1,
      isCustomized: false,
      content: {
        stickyMode: 'sticky',
        transparentOverHero: true,
        scrolledBackgroundColor: 'var(--color-surface)',
      },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingTop: '14px',
        paddingBottom: '14px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'rgba(255, 255, 255, 0.78)',
        backdropFilter: 'blur(12px)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-border)',
      },
      children: [
        makeNavBar({
          idPrefix: 'hdr_ovl_nav',
          presetId: 'nav_horizontal_inline',
          navVariant: 'horizontal-inline',
          ctaLabel: 'Hire Me',
          ctaUrl: '/contact',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_mobile_compact',
    presetVersion: 1,
    regionType: 'header',
    category: 'Mobile-First',
    name: 'Mobile-First Compact Bar',
    description: 'Compact touch-friendly header paired with a full-screen mobile navigation drawer.',
    tags: ['mobile', 'compact', 'drawer', 'touch'],
    requiredSlots: ['navigation'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('hdr_mob'),
      type: 'container',
      name: 'Mobile-First Compact Header',
      tag: 'header',
      presetId: 'hdr_mobile_compact',
      presetVersion: 1,
      isCustomized: false,
      content: { stickyMode: 'sticky' },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingTop: '10px',
        paddingBottom: '10px',
        paddingLeft: '16px',
        paddingRight: '16px',
        backgroundColor: 'var(--color-surface)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-border)',
      },
      children: [
        makeNavBar({
          idPrefix: 'hdr_mob_nav',
          presetId: 'nav_fullscreen_mobile',
          navVariant: 'horizontal-inline',
          mobileNavVariant: 'fullscreen',
          ctaLabel: 'Contact',
          ctaUrl: '/contact',
        }),
      ],
    }),
  },
  {
    presetId: 'hdr_commerce_shell',
    presetVersion: 1,
    regionType: 'header',
    category: 'Commerce Shell',
    name: 'Commerce-Style Utility Shell (Visual)',
    description: 'Visual search & catalog utility shell without live checkout or cart backend.',
    tags: ['commerce-shell', 'search', 'utility', 'placeholder'],
    requiredSlots: ['navigation'],
    optionalSlots: ['search', 'account'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    isVisualPlaceholder: true,
    placeholderNotice:
      'Visual layout shell only: search and account indicators are design placeholders without e-commerce cart/checkout functionality.',
    buildRootNode: () => ({
      id: uid('hdr_com'),
      type: 'container',
      name: 'Commerce-Style Visual Header',
      tag: 'header',
      presetId: 'hdr_commerce_shell',
      presetVersion: 1,
      isCustomized: false,
      content: {
        stickyMode: 'sticky',
        showSearchBox: true,
        showAccountUtility: true,
        isVisualPlaceholderShell: true,
        placeholderNotice:
          'Visual utility shell only (no live store search or checkout backend).',
      },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        paddingTop: '12px',
        paddingBottom: '12px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--color-border)',
      },
      children: [
        makeNavBar({
          idPrefix: 'hdr_com_nav',
          presetId: 'nav_split',
          navVariant: 'split',
          logoText: 'Indy Editions',
          ctaLabel: 'Inquire',
          ctaUrl: '/contact',
        }),
      ],
    }),
  },
];

// ---------------------------------------------------------------------------
// NAVIGATION PRESETS (All 16 Navigation Patterns)
// ---------------------------------------------------------------------------
export const NAVIGATION_PRESETS: HeaderFooterPresetDef[] = [
  {
    presetId: 'nav_horizontal_inline',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Horizontal',
    name: 'Horizontal Inline',
    description: 'Clean single-row horizontal navigation links with active page emphasis.',
    tags: ['horizontal', 'inline', 'clean'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_hzl',
        name: 'Horizontal Inline Nav',
        presetId: 'nav_horizontal_inline',
        navVariant: 'horizontal-inline',
      }),
  },
  {
    presetId: 'nav_centered',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Horizontal',
    name: 'Centered Navigation',
    description: 'Evenly spaced navigation links centered across the header width.',
    tags: ['centered', 'editorial'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      ...makeNavMenu({
        idPrefix: 'nav_ctr',
        name: 'Centered Navigation',
        presetId: 'nav_centered',
        navVariant: 'centered',
        gap: '26px',
      }),
      styles: {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '26px',
      },
    }),
  },
  {
    presetId: 'nav_split',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Horizontal',
    name: 'Split Brand + Links + CTA',
    description: 'Wordmark on the left, links centered/right, and a prominent action button.',
    tags: ['split', 'navbar', 'cta'],
    requiredSlots: ['brand', 'links'],
    optionalSlots: ['cta'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavBar({
        idPrefix: 'nav_spt',
        presetId: 'nav_split',
        navVariant: 'split',
        ctaLabel: 'Get in Touch',
      }),
  },
  {
    presetId: 'nav_dropdown',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Dropdown & Mega',
    name: 'Dropdown Menu',
    description: 'Top-level links with keyboard-accessible single-level dropdown submenus.',
    tags: ['dropdown', 'submenu', 'accessible'],
    requiredSlots: ['links'],
    optionalSlots: ['sublinks'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_drp',
        name: 'Dropdown Navigation',
        presetId: 'nav_dropdown',
        navVariant: 'dropdown',
      }),
  },
  {
    presetId: 'nav_multi_dropdown',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Dropdown & Mega',
    name: 'Multi-Level Dropdown',
    description: 'Nested parent/child dropdown hierarchy for deep documentation or work archives.',
    tags: ['nested', 'multi-level', 'dropdown'],
    requiredSlots: ['links'],
    optionalSlots: ['sublinks'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_mdrp',
        name: 'Multi-Level Dropdown',
        presetId: 'nav_multi_dropdown',
        navVariant: 'multi-dropdown',
        links: [
          { id: 'ml_h', label: 'Home', url: '/' },
          {
            id: 'ml_w',
            label: 'Work',
            url: '/projects',
            children: [
              {
                id: 'ml_w1',
                label: 'Product Design',
                url: '/projects',
                children: [
                  { id: 'ml_w1a', label: 'B2B Platforms', url: '/projects' },
                  { id: 'ml_w1b', label: 'Mobile Apps', url: '/projects' },
                ],
              },
              { id: 'ml_w2', label: 'Design Systems', url: '/projects' },
            ],
          },
          { id: 'ml_s', label: 'Services', url: '/services' },
          { id: 'ml_c', label: 'Contact', url: '/contact' },
        ],
      }),
  },
  {
    presetId: 'nav_mega_menu',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Dropdown & Mega',
    name: 'Mega Menu Panel',
    description: 'Rich structured submenu panel with link descriptions for complex portfolios.',
    tags: ['mega-menu', 'descriptions', 'structured'],
    requiredSlots: ['links'],
    optionalSlots: ['descriptions'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_mega',
        name: 'Mega Menu Navigation',
        presetId: 'nav_mega_menu',
        navVariant: 'mega-menu',
      }),
  },
  {
    presetId: 'nav_full_mega',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Dropdown & Mega',
    name: 'Full-Width Mega Menu',
    description: 'Wide multi-column mega menu showcase spanning the container width.',
    tags: ['full-width', 'mega-menu', 'agency'],
    requiredSlots: ['links'],
    optionalSlots: ['descriptions'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_fmega',
        name: 'Full-Width Mega Menu',
        presetId: 'nav_full_mega',
        navVariant: 'full-mega',
      }),
  },
  {
    presetId: 'nav_vertical_sidebar',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Vertical & Compact',
    name: 'Vertical Sidebar Rail',
    description: 'Stacked vertical navigation list suitable for studio sidebars or footer columns.',
    tags: ['vertical', 'sidebar', 'rail'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_vsb',
        name: 'Vertical Sidebar Nav',
        presetId: 'nav_vertical_sidebar',
        navVariant: 'vertical-sidebar',
        direction: 'column',
        gap: '10px',
      }),
  },
  {
    presetId: 'nav_compact_icon',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Vertical & Compact',
    name: 'Compact Icon Navigation',
    description: 'Space-efficient links with crisp iconography for compact toolbars or headers.',
    tags: ['compact', 'icon', 'minimal'],
    requiredSlots: ['links'],
    optionalSlots: ['icons'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_ico',
        name: 'Compact Icon Nav',
        presetId: 'nav_compact_icon',
        navVariant: 'compact-icon',
        links: [
          { id: 'ic_1', label: 'Home', url: '/', iconName: 'Home' },
          { id: 'ic_2', label: 'Work', url: '/projects', iconName: 'Briefcase' },
          { id: 'ic_3', label: 'About', url: '/about', iconName: 'User' },
          { id: 'ic_4', label: 'Contact', url: '/contact', iconName: 'Mail' },
        ],
        gap: '14px',
      }),
  },
  {
    presetId: 'nav_breadcrumb',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Vertical & Compact',
    name: 'Breadcrumb Trail',
    description: 'Contextual hierarchical trail for detail pages and nested case study routes.',
    tags: ['breadcrumb', 'hierarchy', 'trail'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_brd',
        name: 'Breadcrumb Nav',
        presetId: 'nav_breadcrumb',
        navVariant: 'breadcrumb',
        links: [
          { id: 'br_1', label: 'Home', url: '/' },
          { id: 'br_2', label: 'Projects', url: '/projects' },
          { id: 'br_3', label: 'Case Study', url: '/projects' },
        ],
        gap: '8px',
      }),
  },
  {
    presetId: 'nav_mobile_drawer',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Mobile Patterns',
    name: 'Mobile Slide Drawer',
    description: 'Standard desktop links collapsing cleanly into a touch-friendly slide drawer.',
    tags: ['mobile', 'drawer', 'responsive'],
    requiredSlots: ['links'],
    optionalSlots: ['cta'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavBar({
        idPrefix: 'nav_mdrw',
        presetId: 'nav_mobile_drawer',
        navVariant: 'split',
        mobileNavVariant: 'drawer',
        ctaLabel: 'Contact',
      }),
  },
  {
    presetId: 'nav_fullscreen_mobile',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Mobile Patterns',
    name: 'Full-Screen Mobile Overlay',
    description: 'Dramatic full-viewport mobile overlay menu with Escape close and focus safety.',
    tags: ['fullscreen', 'mobile', 'overlay'],
    requiredSlots: ['links'],
    optionalSlots: ['cta'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavBar({
        idPrefix: 'nav_fsm',
        presetId: 'nav_fullscreen_mobile',
        navVariant: 'horizontal-inline',
        mobileNavVariant: 'fullscreen',
        ctaLabel: 'Get in Touch',
      }),
  },
  {
    presetId: 'nav_off_canvas',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Mobile Patterns',
    name: 'Off-Canvas Side Panel',
    description: 'Compact hamburger trigger opening an anchored off-canvas menu panel on mobile/tablet.',
    tags: ['off-canvas', 'side-panel', 'mobile'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavBar({
        idPrefix: 'nav_ofc',
        presetId: 'nav_off_canvas',
        navVariant: 'horizontal-inline',
        mobileNavVariant: 'off-canvas',
      }),
  },
  {
    presetId: 'nav_bottom_mobile',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Mobile Patterns',
    name: 'Bottom Mobile Dock Bar',
    description: 'Thumb-reachable mobile bottom navigation bar with icons and concise labels.',
    tags: ['bottom-nav', 'mobile', 'thumb-zone'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_btm',
        name: 'Bottom Mobile Nav',
        presetId: 'nav_bottom_mobile',
        navVariant: 'bottom-mobile',
        mobileNavVariant: 'bottom',
        links: [
          { id: 'bm_1', label: 'Home', url: '/', iconName: 'Home' },
          { id: 'bm_2', label: 'Work', url: '/projects', iconName: 'Briefcase' },
          { id: 'bm_3', label: 'About', url: '/about', iconName: 'User' },
          { id: 'bm_4', label: 'Contact', url: '/contact', iconName: 'Mail' },
        ],
      }),
  },
  {
    presetId: 'nav_tab_style',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Scroll & Tabs',
    name: 'Tab-Style Segmented Nav',
    description: 'High-clarity active underline/tab bar for section switching or portfolio areas.',
    tags: ['tabs', 'active-indicator', 'editorial'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_tab',
        name: 'Tab-Style Nav',
        presetId: 'nav_tab_style',
        navVariant: 'tab-style',
        gap: '12px',
      }),
  },
  {
    presetId: 'nav_scrollable_horizontal',
    presetVersion: 1,
    regionType: 'navigation',
    category: 'Scroll & Tabs',
    name: 'Scrollable Horizontal Strip',
    description: 'Horizontally scrollable single-line menu strip on narrow viewports with zero wrapping.',
    tags: ['scrollable', 'horizontal', 'strip'],
    requiredSlots: ['links'],
    optionalSlots: [],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () =>
      makeNavMenu({
        idPrefix: 'nav_scr',
        name: 'Scrollable Horizontal Nav',
        presetId: 'nav_scrollable_horizontal',
        navVariant: 'scrollable-horizontal',
        gap: '16px',
      }),
  },
];

// ---------------------------------------------------------------------------
// FOOTER PRESETS (Covers Simple, Standard, Portfolio, Business/Agency,
// Editorial, Creative, Compact/Utility, Advanced)
// ---------------------------------------------------------------------------
export const FOOTER_PRESETS: HeaderFooterPresetDef[] = [
  {
    presetId: 'ftr_simple_copy',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Simple',
    name: 'Simple Brand & Dynamic Copyright',
    description: 'Single clean row with brand wordmark, copyright using {year}, and social links.',
    tags: ['simple', 'minimal', 'copyright'],
    requiredSlots: ['copyright'],
    optionalSlots: ['brand', 'social'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('ftr_smp'),
      type: 'container',
      name: 'Simple Footer',
      tag: 'footer',
      presetId: 'ftr_simple_copy',
      presetVersion: 1,
      isCustomized: false,
      styles: {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        width: '100%',
        paddingTop: '24px',
        paddingBottom: '24px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-border)',
      },
      children: [
        {
          id: uid('ftr_smp_copy'),
          type: 'text',
          name: 'Copyright Notice',
          tag: 'p',
          content: { text: '© {year} Alex Rivera · All rights reserved.' },
          styles: { fontSize: '13px', textColor: 'var(--color-text-muted)' },
        },
        {
          id: uid('ftr_smp_soc'),
          type: 'social-links',
          name: 'Footer Social',
          content: {
            navLinks: [
              { id: 'fs_1', label: 'GitHub', url: 'https://github.com', iconName: 'Github', targetBlank: true },
              { id: 'fs_2', label: 'LinkedIn', url: 'https://linkedin.com', iconName: 'Linkedin', targetBlank: true },
              { id: 'fs_3', label: 'Email', url: 'mailto:hello@example.com', iconName: 'Mail' },
            ],
          },
          styles: { display: 'flex', flexDirection: 'row', gap: '10px', alignItems: 'center' },
        },
      ],
    }),
  },
  {
    presetId: 'ftr_standard_3col',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Standard',
    name: 'Standard Portfolio Footer',
    description: 'Balanced 3-zone footer with logo, navigation links, social icons, and {year} copyright.',
    tags: ['standard', 'navigation', 'social'],
    requiredSlots: ['brand', 'links', 'copyright'],
    optionalSlots: ['social'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('ftr_std'),
      type: 'container',
      name: 'Standard Portfolio Footer',
      tag: 'footer',
      presetId: 'ftr_standard_3col',
      presetVersion: 1,
      isCustomized: false,
      content: { showBackToTop: true },
      styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        width: '100%',
        paddingTop: '36px',
        paddingBottom: '36px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-border)',
      },
      children: [
        {
          id: uid('ftr_std_row'),
          type: 'flex-row',
          name: 'Footer Columns',
          tag: 'div',
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            width: '100%',
          },
          children: [
            makeLogo('ftr_std_brand', 'Alex Rivera Studio'),
            makeNavMenu({
              idPrefix: 'ftr_std_links',
              name: 'Footer Links',
              presetId: 'nav_horizontal_inline',
              navVariant: 'horizontal-inline',
            }),
            {
              id: uid('ftr_std_social'),
              type: 'social-links',
              name: 'Footer Social',
              content: {
                navLinks: [
                  { id: 'fs_1', label: 'GitHub', url: 'https://github.com', iconName: 'Github', targetBlank: true },
                  { id: 'fs_2', label: 'LinkedIn', url: 'https://linkedin.com', iconName: 'Linkedin', targetBlank: true },
                  { id: 'fs_3', label: 'Email', url: 'mailto:hello@example.com', iconName: 'Mail' },
                ],
              },
              styles: { display: 'flex', flexDirection: 'row', gap: '10px', alignItems: 'center' },
            },
          ],
        },
        {
          id: uid('ftr_std_copy'),
          type: 'text',
          name: 'Copyright Notice',
          tag: 'p',
          content: { text: '© {year} Alex Rivera · Built with user-owned Google Workspace data.' },
          styles: { fontSize: '12px', textColor: 'var(--color-text-muted)' },
        },
      ],
    }),
  },
  {
    presetId: 'ftr_portfolio_cta',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Portfolio',
    name: 'Portfolio Availability CTA Footer',
    description: 'Direct project inquiry headline and button above sitemap links and copyright.',
    tags: ['portfolio', 'cta', 'inquiry'],
    requiredSlots: ['cta', 'copyright'],
    optionalSlots: ['links', 'social'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('ftr_pf'),
      type: 'container',
      name: 'Portfolio CTA Footer',
      tag: 'footer',
      presetId: 'ftr_portfolio_cta',
      presetVersion: 1,
      isCustomized: false,
      content: { showBackToTop: true },
      styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        width: '100%',
        paddingTop: '44px',
        paddingBottom: '32px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface-alt)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-border)',
      },
      children: [
        {
          id: uid('ftr_pf_top'),
          type: 'flex-row',
          name: 'Collaboration Callout',
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            width: '100%',
            paddingBottom: '20px',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--color-divider)',
          },
          children: [
            {
              id: uid('ftr_pf_h'),
              type: 'heading',
              name: 'Footer Headline',
              tag: 'h3',
              content: { text: 'Have an ambitious product or system in mind?', headingLevel: 'h3' },
              styles: {
                fontFamily: 'var(--font-display)',
                fontSize: '20px',
                fontWeight: '700',
                textColor: 'var(--color-heading)',
              },
            },
            {
              id: uid('ftr_pf_btn'),
              type: 'button',
              name: 'Footer CTA Button',
              content: { text: 'Start a Conversation', url: '/contact' },
              styles: {
                display: 'inline-block',
                paddingTop: '10px',
                paddingBottom: '10px',
                paddingLeft: '20px',
                paddingRight: '20px',
                backgroundColor: 'var(--color-button-primary-bg)',
                textColor: 'var(--color-button-primary-text)',
                borderRadius: 'var(--theme-radius)',
                fontSize: '13px',
                fontWeight: '600',
              },
            },
          ],
        },
        {
          id: uid('ftr_pf_bot'),
          type: 'flex-row',
          name: 'Footer Meta Row',
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            width: '100%',
          },
          children: [
            {
              id: uid('ftr_pf_copy'),
              type: 'text',
              name: 'Copyright',
              tag: 'p',
              content: { text: '© {year} Alex Rivera · San Francisco & Remote' },
              styles: { fontSize: '12px', textColor: 'var(--color-text-muted)' },
            },
            makeNavMenu({
              idPrefix: 'ftr_pf_links',
              name: 'Footer Nav',
              presetId: 'nav_horizontal_inline',
              navVariant: 'horizontal-inline',
            }),
          ],
        },
      ],
    }),
  },
  {
    presetId: 'ftr_agency_4col',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Business & Agency',
    name: 'Agency Multi-Column Sitemap Footer',
    description: 'Multi-column directory grid with mobile accordion support and studio description.',
    tags: ['agency', 'columns', 'sitemap', 'accordion'],
    requiredSlots: ['brand', 'columns', 'copyright'],
    optionalSlots: ['newsletter'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('ftr_agy'),
      type: 'container',
      name: 'Agency Multi-Column Footer',
      tag: 'footer',
      presetId: 'ftr_agency_4col',
      presetVersion: 1,
      isCustomized: false,
      content: { mobileAccordionColumns: true, showBackToTop: true },
      styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
        width: '100%',
        paddingTop: '44px',
        paddingBottom: '32px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-border)',
      },
      children: [
        {
          id: uid('ftr_agy_grid'),
          type: 'grid-container',
          name: 'Footer Directory Grid',
          styles: {
            display: 'grid',
            gridColumns: 'repeat(3, minmax(0, 1fr))',
            gap: '24px',
            width: '100%',
          },
          children: [
            {
              id: uid('ftr_agy_col1'),
              type: 'stack',
              name: 'Studio Summary Column',
              styles: { display: 'flex', flexDirection: 'column', gap: '8px' },
              children: [
                makeLogo('ftr_agy_logo', 'Northstar Studio'),
                {
                  id: uid('ftr_agy_desc'),
                  type: 'text',
                  name: 'Studio Summary',
                  content: { text: 'Designing resilient web systems, brand architectures, and creator tools.' },
                  styles: { fontSize: '13px', textColor: 'var(--color-text-muted)', lineHeight: '1.6' },
                },
              ],
            },
            {
              id: uid('ftr_agy_col2'),
              type: 'stack',
              name: 'Navigation Column',
              styles: { display: 'flex', flexDirection: 'column', gap: '8px' },
              children: [
                {
                  id: uid('ftr_agy_c2h'),
                  type: 'text',
                  name: 'Column Heading',
                  content: { text: 'Explore' },
                  styles: { fontSize: '12px', fontWeight: '700', textColor: 'var(--color-heading)' },
                },
                makeNavMenu({
                  idPrefix: 'ftr_agy_c2nav',
                  name: 'Explore Links',
                  presetId: 'nav_vertical_sidebar',
                  navVariant: 'vertical-sidebar',
                  direction: 'column',
                  gap: '6px',
                }),
              ],
            },
            {
              id: uid('ftr_agy_col3'),
              type: 'stack',
              name: 'Connect Column',
              styles: { display: 'flex', flexDirection: 'column', gap: '8px' },
              children: [
                {
                  id: uid('ftr_agy_c3h'),
                  type: 'text',
                  name: 'Column Heading',
                  content: { text: 'Connect' },
                  styles: { fontSize: '12px', fontWeight: '700', textColor: 'var(--color-heading)' },
                },
                {
                  id: uid('ftr_agy_c3soc'),
                  type: 'social-links',
                  name: 'Social Channels',
                  content: {
                    navLinks: [
                      { id: 'ag_s1', label: 'GitHub', url: 'https://github.com', iconName: 'Github', targetBlank: true },
                      { id: 'ag_s2', label: 'LinkedIn', url: 'https://linkedin.com', iconName: 'Linkedin', targetBlank: true },
                      { id: 'ag_s3', label: 'Email', url: 'mailto:hello@example.com', iconName: 'Mail' },
                    ],
                  },
                  styles: { display: 'flex', flexDirection: 'row', gap: '10px', alignItems: 'center' },
                },
              ],
            },
          ],
        },
        {
          id: uid('ftr_agy_copy'),
          type: 'text',
          name: 'Copyright Notice',
          content: { text: '© {year} Northstar Studio. Independent Google Workspace Portfolio.' },
          styles: { fontSize: '12px', textColor: 'var(--color-text-muted)' },
        },
      ],
    }),
  },
  {
    presetId: 'ftr_editorial_digest',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Editorial',
    name: 'Editorial Colophon Footer',
    description: 'Publication colophon with serif masthead, archive index, and clean divider rule.',
    tags: ['editorial', 'colophon', 'publication'],
    requiredSlots: ['colophon', 'copyright'],
    optionalSlots: ['links'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('ftr_edt'),
      type: 'container',
      name: 'Editorial Colophon Footer',
      tag: 'footer',
      presetId: 'ftr_editorial_digest',
      presetVersion: 1,
      isCustomized: false,
      styles: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        width: '100%',
        paddingTop: '36px',
        paddingBottom: '36px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-background)',
        borderTopWidth: '2px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-heading)',
      },
      children: [
        {
          id: uid('ftr_edt_h'),
          type: 'heading',
          name: 'Colophon Title',
          tag: 'h3',
          content: { text: 'THE ARCHIVE · EDITION {year}', headingLevel: 'h3' },
          styles: {
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: '700',
            textColor: 'var(--color-heading)',
            textAlign: 'center',
          },
        },
        makeNavMenu({
          idPrefix: 'ftr_edt_nav',
          name: 'Archive Links',
          presetId: 'nav_centered',
          navVariant: 'centered',
          gap: '20px',
        }),
        {
          id: uid('ftr_edt_copy'),
          type: 'text',
          name: 'Colophon Note',
          content: { text: 'Published independently · © {year} Alex Rivera' },
          styles: { fontSize: '12px', textColor: 'var(--color-text-muted)', textAlign: 'center' },
        },
      ],
    }),
  },
  {
    presetId: 'ftr_creative_bold',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Creative',
    name: 'High-Contrast Creative Footer',
    description: 'Deep dark surface contrast footer with large signature headline and bright CTA.',
    tags: ['creative', 'dark', 'high-contrast'],
    requiredSlots: ['headline', 'copyright'],
    optionalSlots: ['social'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('ftr_crt'),
      type: 'container',
      name: 'Creative Dark Footer',
      tag: 'footer',
      presetId: 'ftr_creative_bold',
      presetVersion: 1,
      isCustomized: false,
      content: { showBackToTop: true },
      styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        width: '100%',
        paddingTop: '48px',
        paddingBottom: '36px',
        paddingLeft: '28px',
        paddingRight: '28px',
        backgroundColor: '#0f172a',
        textColor: '#f8fafc',
      },
      children: [
        {
          id: uid('ftr_crt_h'),
          type: 'heading',
          name: 'Signature Statement',
          tag: 'h2',
          content: { text: "Let's build something enduring.", headingLevel: 'h2' },
          styles: {
            fontFamily: 'var(--font-display)',
            fontSize: '28px',
            fontWeight: '700',
            textColor: '#ffffff',
          },
        },
        {
          id: uid('ftr_crt_row'),
          type: 'flex-row',
          name: 'Bottom Bar',
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            paddingTop: '16px',
            borderTopWidth: '1px',
            borderTopStyle: 'solid',
            borderTopColor: 'rgba(255,255,255,0.14)',
          },
          children: [
            {
              id: uid('ftr_crt_copy'),
              type: 'text',
              name: 'Copyright',
              content: { text: '© {year} Alex Rivera Studio' },
              styles: { fontSize: '12px', textColor: '#94a3b8' },
            },
            {
              id: uid('ftr_crt_btn'),
              type: 'button',
              name: 'Contact Action',
              content: { text: 'hello@alexrivera.me', url: '/contact' },
              styles: {
                display: 'inline-block',
                paddingTop: '8px',
                paddingBottom: '8px',
                paddingLeft: '16px',
                paddingRight: '16px',
                backgroundColor: '#ffffff',
                textColor: '#0f172a',
                borderRadius: 'var(--theme-radius)',
                fontSize: '12px',
                fontWeight: '600',
              },
            },
          ],
        },
      ],
    }),
  },
  {
    presetId: 'ftr_compact_utility',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Compact & Utility',
    name: 'Compact Utility Strip + Back to Top',
    description: 'Low-profile single-bar utility footer with page links and scroll-to-top anchor.',
    tags: ['compact', 'utility', 'minimal'],
    requiredSlots: ['copyright'],
    optionalSlots: ['back-to-top'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    buildRootNode: () => ({
      id: uid('ftr_cmp'),
      type: 'container',
      name: 'Compact Utility Footer',
      tag: 'footer',
      presetId: 'ftr_compact_utility',
      presetVersion: 1,
      isCustomized: false,
      content: { showBackToTop: true },
      styles: {
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        width: '100%',
        paddingTop: '18px',
        paddingBottom: '18px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-border)',
      },
      children: [
        {
          id: uid('ftr_cmp_copy'),
          type: 'text',
          name: 'Copyright',
          content: { text: '© {year} Portfolio · Independent Creator Site' },
          styles: { fontSize: '12px', textColor: 'var(--color-text-muted)' },
        },
        makeNavMenu({
          idPrefix: 'ftr_cmp_nav',
          name: 'Utility Links',
          presetId: 'nav_horizontal_inline',
          navVariant: 'horizontal-inline',
          links: [
            { id: 'cl_1', label: 'Home', url: '/' },
            { id: 'cl_2', label: 'Contact', url: '/contact' },
          ],
          gap: '16px',
        }),
      ],
    }),
  },
  {
    presetId: 'ftr_advanced_accordion',
    presetVersion: 1,
    regionType: 'footer',
    category: 'Advanced',
    name: 'Advanced Accordion + Newsletter Shell',
    description: 'Comprehensive structured footer with newsletter signup shell and mobile accordion.',
    tags: ['advanced', 'accordion', 'newsletter', 'columns'],
    requiredSlots: ['brand', 'links', 'copyright'],
    optionalSlots: ['newsletter'],
    responsiveDefaults: { desktop: true, tablet: true, mobile: true },
    isVisualPlaceholder: true,
    placeholderNotice:
      'Newsletter input is a visual layout placeholder unless connected to an external form endpoint.',
    buildRootNode: () => ({
      id: uid('ftr_adv'),
      type: 'container',
      name: 'Advanced Accordion Footer',
      tag: 'footer',
      presetId: 'ftr_advanced_accordion',
      presetVersion: 1,
      isCustomized: false,
      content: {
        mobileAccordionColumns: true,
        showBackToTop: true,
        newsletterPlaceholder: 'you@domain.com',
        newsletterButtonLabel: 'Subscribe',
        isVisualPlaceholderShell: true,
        placeholderNotice:
          'Newsletter field is a visual placeholder shell unless wired to a form action.',
      },
      styles: {
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        width: '100%',
        paddingTop: '44px',
        paddingBottom: '32px',
        paddingLeft: '24px',
        paddingRight: '24px',
        backgroundColor: 'var(--color-surface)',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--color-border)',
      },
      children: [
        {
          id: uid('ftr_adv_row'),
          type: 'flex-row',
          name: 'Top Columns',
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '24px',
            width: '100%',
          },
          children: [
            makeLogo('ftr_adv_logo', 'Alex Rivera Studio'),
            makeNavMenu({
              idPrefix: 'ftr_adv_nav',
              name: 'Sitemap Navigation',
              presetId: 'nav_horizontal_inline',
              navVariant: 'horizontal-inline',
            }),
          ],
        },
        {
          id: uid('ftr_adv_copy'),
          type: 'text',
          name: 'Copyright',
          content: { text: '© {year} Alex Rivera Studio · All rights reserved.' },
          styles: { fontSize: '12px', textColor: 'var(--color-text-muted)' },
        },
      ],
    }),
  },
];

export const ALL_REGION_PRESETS: HeaderFooterPresetDef[] = [
  ...HEADER_PRESETS,
  ...NAVIGATION_PRESETS,
  ...FOOTER_PRESETS,
];

export function getPresetsForRegion(regionType: RegionType): HeaderFooterPresetDef[] {
  if (regionType === 'header') return HEADER_PRESETS;
  if (regionType === 'navigation') return NAVIGATION_PRESETS;
  return FOOTER_PRESETS;
}

export function findPresetById(presetId?: string): HeaderFooterPresetDef | undefined {
  if (!presetId) return undefined;
  return ALL_REGION_PRESETS.find((p) => p.presetId === presetId);
}

function countTreeNodes(node: ElementNode): number {
  return 1 + (node.children?.reduce((acc, c) => acc + countTreeNodes(c), 0) || 0);
}

function extractBrandAndLinks(node: ElementNode): {
  logoText?: string;
  navLinks?: ElementNavLinkItem[];
  ctaLabel?: string;
  ctaUrl?: string;
} {
  let logoText: string | undefined;
  let navLinks: ElementNavLinkItem[] | undefined;
  let ctaLabel: string | undefined;
  let ctaUrl: string | undefined;

  const walk = (n: ElementNode) => {
    if ((n.type === 'logo' || n.type === 'navbar') && n.content?.logoText && !logoText) {
      logoText = n.content.logoText;
    }
    if ((n.type === 'navbar' || n.type === 'nav-menu') && n.content?.navLinks?.length && !navLinks) {
      navLinks = JSON.parse(JSON.stringify(n.content.navLinks));
    }
    if (n.type === 'navbar' && n.content?.ctaLabel && !ctaLabel) {
      ctaLabel = n.content.ctaLabel;
      ctaUrl = n.content.ctaUrl;
    }
    n.children?.forEach(walk);
  };
  walk(node);
  return { logoText, navLinks, ctaLabel, ctaUrl };
}

export interface PresetImpactSummary {
  currentElementCount: number;
  targetElementCount: number;
  preservedBrandText: string | null;
  preservedLinksCount: number;
  isDestructive: boolean;
  warningText: string;
}

export function analyzePresetImpact(
  currentRoot: ElementNode,
  targetPreset: HeaderFooterPresetDef
): PresetImpactSummary {
  const targetSample = targetPreset.buildRootNode();
  const currentCount = countTreeNodes(currentRoot);
  const targetCount = countTreeNodes(targetSample);
  const extracted = extractBrandAndLinks(currentRoot);
  const linksCount = extracted.navLinks?.length || 0;
  const isDestructive = currentCount > 1 || Boolean(currentRoot.isCustomized);

  return {
    currentElementCount: currentCount,
    targetElementCount: targetCount,
    preservedBrandText: extracted.logoText || null,
    preservedLinksCount: linksCount,
    isDestructive,
    warningText:
      targetPreset.regionType === 'navigation'
        ? `Applying "${targetPreset.name}" replaces the navigation structure (${currentCount} node${currentCount === 1 ? '' : 's'}) while keeping your navigation links${extracted.logoText ? ' and brand name' : ''}.`
        : `Applying "${targetPreset.name}" replaces the current ${targetPreset.regionType} layout (${currentCount} element${currentCount === 1 ? '' : 's'} -> ${targetCount}).${linksCount > 0 || extracted.logoText ? ' Compatible brand text and navigation links can be carried over.' : ''}`,
  };
}

export function applyPresetToRootNode(
  existingRoot: ElementNode,
  preset: HeaderFooterPresetDef,
  preserveCompatibleContent = true
): ElementNode {
  const nextRoot = preset.buildRootNode();
  nextRoot.id = existingRoot.id;
  nextRoot.presetId = preset.presetId;
  nextRoot.presetVersion = preset.presetVersion;
  nextRoot.isCustomized = false;

  if (!preserveCompatibleContent) {
    return nextRoot;
  }

  const extracted = extractBrandAndLinks(existingRoot);

  const injectContent = (node: ElementNode): ElementNode => {
    const updatedContent = { ...(node.content || {}) };
    if (node.type === 'logo' && extracted.logoText) {
      updatedContent.logoText = extracted.logoText;
    }
    if (node.type === 'navbar') {
      if (extracted.logoText) updatedContent.logoText = extracted.logoText;
      if (extracted.navLinks) updatedContent.navLinks = JSON.parse(JSON.stringify(extracted.navLinks));
      if (extracted.ctaLabel) {
        updatedContent.ctaLabel = extracted.ctaLabel;
        updatedContent.ctaUrl = extracted.ctaUrl || updatedContent.ctaUrl;
      }
    }
    if (node.type === 'nav-menu' && extracted.navLinks) {
      updatedContent.navLinks = JSON.parse(JSON.stringify(extracted.navLinks));
    }
    return {
      ...node,
      content: updatedContent,
      children: node.children?.map(injectContent),
    };
  };

  return injectContent(nextRoot);
}
