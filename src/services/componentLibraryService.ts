import {
  DeviceMode,
  ElementNode,
  GlobalComponentsConfig,
  HeaderFooterComponentDef,
  LayoutMode,
  LibraryItem,
  LibraryItemType,
  PageDocument,
  PageLayoutConfig,
  PageLayoutSlot,
  RegionResponsiveVisibility,
  SiteDocument,
} from '../types/builder';
import {
  BUILDER_ENGINE_VERSION,
  BUILT_IN_LIBRARY_ITEMS,
  COMPONENT_SCHEMA_VERSION,
  DEFAULT_COMPACT_FOOTER_DEF,
  DEFAULT_GLOBAL_FOOTER_DEF,
  DEFAULT_GLOBAL_HEADER_DEF,
  DEFAULT_MINIMAL_HEADER_DEF,
} from '../data/builtInLibrary';
import { cloneElementTreeWithNewIds } from './pageService';

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const DEFAULT_REGION_VISIBILITY: RegionResponsiveVisibility = {
  desktop: true,
  tablet: true,
  mobile: true,
};

export function normalizeRegionVisibility(
  vis?: Partial<RegionResponsiveVisibility> | null
): RegionResponsiveVisibility {
  return {
    desktop: vis?.desktop !== false,
    tablet: vis?.tablet !== false,
    mobile: vis?.mobile !== false,
  };
}

export function isRegionVisibleOnDevice(
  vis: RegionResponsiveVisibility | undefined,
  deviceMode: DeviceMode
): boolean {
  if (!vis) return true;
  if (deviceMode === 'desktop') return vis.desktop !== false;
  if (deviceMode === 'tablet') return vis.tablet !== false;
  return vis.mobile !== false;
}

export function createDefaultGlobalComponents(): GlobalComponentsConfig {
  const hdrMain = {
    ...JSON.parse(JSON.stringify(DEFAULT_GLOBAL_HEADER_DEF)),
    enabled: true,
    presetId: 'hdr_std_portfolio',
    presetVersion: 1,
    isCustomized: false,
    responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
  };
  const hdrMin = {
    ...JSON.parse(JSON.stringify(DEFAULT_MINIMAL_HEADER_DEF)),
    enabled: true,
    presetId: 'hdr_min_editorial',
    presetVersion: 1,
    isCustomized: false,
    responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
  };
  const ftrMain = {
    ...JSON.parse(JSON.stringify(DEFAULT_GLOBAL_FOOTER_DEF)),
    enabled: true,
    presetId: 'ftr_standard_3col',
    presetVersion: 1,
    isCustomized: false,
    responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
  };
  const ftrCmp = {
    ...JSON.parse(JSON.stringify(DEFAULT_COMPACT_FOOTER_DEF)),
    enabled: true,
    presetId: 'ftr_compact_utility',
    presetVersion: 1,
    isCustomized: false,
    responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
  };

  return {
    headers: [hdrMain, hdrMin],
    activeHeaderId: hdrMain.componentId,
    footers: [ftrMain, ftrCmp],
    activeFooterId: ftrMain.componentId,
  };
}

export function createDefaultPageLayout(): PageLayoutConfig {
  return {
    header: {
      mode: 'global',
      enabled: true,
      globalComponentId: null,
      localComponentId: null,
      localComponent: null,
      responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
    },
    footer: {
      mode: 'global',
      enabled: true,
      globalComponentId: null,
      localComponentId: null,
      localComponent: null,
      responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
    },
  };
}

function normalizePageSlot(slot?: PageLayoutSlot | null): PageLayoutSlot {
  if (!slot) {
    return {
      mode: 'global',
      enabled: true,
      globalComponentId: null,
      localComponentId: null,
      localComponent: null,
      responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
    };
  }
  return {
    mode: slot.mode || 'global',
    enabled: slot.enabled !== false,
    globalComponentId: slot.globalComponentId ?? null,
    localComponentId: slot.localComponentId ?? null,
    localComponent: slot.localComponent
      ? {
          ...slot.localComponent,
          enabled: slot.localComponent.enabled !== false,
          responsiveVisibility: normalizeRegionVisibility(slot.localComponent.responsiveVisibility),
        }
      : null,
    responsiveVisibility: normalizeRegionVisibility(slot.responsiveVisibility),
  };
}

/**
 * Ensures any legacy SiteDocument has valid globalComponents, libraryItems,
 * and per-page header/footer layout defaults (Global by default).
 */
export function migrateSiteComponentsAndLayout(site: SiteDocument): SiteDocument {
  const defaultGlobals = createDefaultGlobalComponents();
  const normalizeDef = (def: HeaderFooterComponentDef): HeaderFooterComponentDef => ({
    ...def,
    enabled: def.enabled !== false,
    responsiveVisibility: normalizeRegionVisibility(def.responsiveVisibility),
  });

  const globalComponents: GlobalComponentsConfig = site.globalComponents
    ? {
        headers:
          site.globalComponents.headers?.length > 0
            ? site.globalComponents.headers.map(normalizeDef)
            : defaultGlobals.headers,
        activeHeaderId:
          site.globalComponents.activeHeaderId ??
          site.globalComponents.headers?.[0]?.componentId ??
          defaultGlobals.activeHeaderId,
        footers:
          site.globalComponents.footers?.length > 0
            ? site.globalComponents.footers.map(normalizeDef)
            : defaultGlobals.footers,
        activeFooterId:
          site.globalComponents.activeFooterId ??
          site.globalComponents.footers?.[0]?.componentId ??
          defaultGlobals.activeFooterId,
      }
    : defaultGlobals;

  // Migrate legacy savedBlocks into libraryItems if libraryItems isn't populated yet
  let libraryItems: LibraryItem[] = Array.isArray(site.libraryItems) ? [...site.libraryItems] : [];
  if (libraryItems.length === 0 && Array.isArray(site.savedBlocks) && site.savedBlocks.length > 0) {
    libraryItems = site.savedBlocks.map((blk) => ({
      id: blk.id,
      type: 'section-template' as LibraryItemType,
      name: blk.name,
      description: `Migrated saved section (${blk.category})`,
      category: blk.category || 'Sections',
      tags: ['migrated'],
      schemaVersion: COMPONENT_SCHEMA_VERSION,
      engineVersion: BUILDER_ENGINE_VERSION,
      revision: 1,
      isBuiltIn: false,
      rootNode: blk.element,
      createdAt: blk.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  const pages = (site.pages || []).map((page) => {
    const normalizedLayout = page.layout
      ? {
          header: normalizePageSlot(page.layout.header),
          footer: normalizePageSlot(page.layout.footer),
        }
      : createDefaultPageLayout();

    const shouldStripLegacyInlineHeader =
      normalizedLayout.header.mode !== 'none' &&
      Array.isArray(page.rootElement?.children) &&
      page.rootElement.children.some((child) => child.id === 'home_nav');

    const rootElement = shouldStripLegacyInlineHeader
      ? {
          ...page.rootElement,
          children: page.rootElement.children!.filter((child) => child.id !== 'home_nav'),
        }
      : page.rootElement;

    return {
      ...page,
      rootElement,
      layout: normalizedLayout,
    };
  });

  return {
    ...site,
    globalComponents,
    libraryItems,
    elementPrefs: site.elementPrefs || { favorites: [], recent: [] },
    pages,
  };
}

export interface ResolvedHeaderFooter {
  slot: 'header' | 'footer';
  mode: LayoutMode;
  pageEnabled: boolean;
  siteGlobalEnabled: boolean;
  effectiveEnabled: boolean;
  responsiveVisibility: RegionResponsiveVisibility;
  /** The resolved component when `effectiveEnabled === true` (ready to render). */
  component: HeaderFooterComponentDef | null;
  /** The underlying configured definition even when disabled via override, preserving edits & layer visibility. */
  definition: HeaderFooterComponentDef | null;
  missingError?: string;
}

/**
 * Canonical HNF-001 resolution order:
 * 1. mode === 'none' -> omit
 * 2. Resolve Global (slot.globalComponentId or site.globalComponents active) or Local definition
 * 3. Apply site-level Global enabled state (for global mode)
 * 4. Apply page-level enabled override (never mutates shared Global component)
 * 5. Carry resolved responsiveVisibility (merged safely across page slot + component)
 */
export function resolvePageSlotComponent(
  page: PageDocument | null | undefined,
  site: SiteDocument,
  slot: 'header' | 'footer'
): ResolvedHeaderFooter {
  const layoutSlot = normalizePageSlot(page?.layout?.[slot]);
  const mode = layoutSlot.mode || 'global';
  const pageEnabled = layoutSlot.enabled !== false;

  if (mode === 'none') {
    return {
      slot,
      mode: 'none',
      pageEnabled,
      siteGlobalEnabled: true,
      effectiveEnabled: false,
      responsiveVisibility: normalizeRegionVisibility(layoutSlot.responsiveVisibility),
      component: null,
      definition: null,
    };
  }

  if (mode === 'local') {
    const def = layoutSlot.localComponent || null;
    if (!def) {
      return {
        slot,
        mode: 'local',
        pageEnabled,
        siteGlobalEnabled: true,
        effectiveEnabled: false,
        responsiveVisibility: normalizeRegionVisibility(layoutSlot.responsiveVisibility),
        component: null,
        definition: null,
        missingError: `Page "${page?.name || 'Untitled'}" uses Local ${slot} mode, but no local ${slot} component exists.`,
      };
    }
    const vis = normalizeRegionVisibility({
      desktop:
        layoutSlot.responsiveVisibility?.desktop !== false &&
        def.responsiveVisibility?.desktop !== false,
      tablet:
        layoutSlot.responsiveVisibility?.tablet !== false &&
        def.responsiveVisibility?.tablet !== false,
      mobile:
        layoutSlot.responsiveVisibility?.mobile !== false &&
        def.responsiveVisibility?.mobile !== false,
    });
    const effectiveEnabled = pageEnabled && def.enabled !== false;
    return {
      slot,
      mode: 'local',
      pageEnabled,
      siteGlobalEnabled: def.enabled !== false,
      effectiveEnabled,
      responsiveVisibility: vis,
      component: effectiveEnabled ? def : null,
      definition: def,
    };
  }

  // Global mode resolves deterministically from explicit globalComponentId or site active variant
  const gc = site.globalComponents;
  if (!gc) {
    return {
      slot,
      mode: 'global',
      pageEnabled,
      siteGlobalEnabled: false,
      effectiveEnabled: false,
      responsiveVisibility: normalizeRegionVisibility(layoutSlot.responsiveVisibility),
      component: null,
      definition: null,
      missingError: `Global ${slot} configuration is missing in Site Layout.`,
    };
  }

  const list = slot === 'header' ? gc.headers : gc.footers;
  const targetId = layoutSlot.globalComponentId || (slot === 'header' ? gc.activeHeaderId : gc.activeFooterId);
  const found = list.find((c) => c.componentId === targetId) || null;

  if (!found) {
    return {
      slot,
      mode: 'global',
      pageEnabled,
      siteGlobalEnabled: false,
      effectiveEnabled: false,
      responsiveVisibility: normalizeRegionVisibility(layoutSlot.responsiveVisibility),
      component: null,
      definition: null,
      missingError: `Page "${page?.name || 'Untitled'}" requires a Global ${slot}, but the referenced Global ${slot} was not found.`,
    };
  }

  const siteGlobalEnabled = found.enabled !== false;
  const vis = normalizeRegionVisibility({
    desktop:
      layoutSlot.responsiveVisibility?.desktop !== false &&
      found.responsiveVisibility?.desktop !== false,
    tablet:
      layoutSlot.responsiveVisibility?.tablet !== false &&
      found.responsiveVisibility?.tablet !== false,
    mobile:
      layoutSlot.responsiveVisibility?.mobile !== false &&
      found.responsiveVisibility?.mobile !== false,
  });
  const effectiveEnabled = siteGlobalEnabled && pageEnabled;

  return {
    slot,
    mode: 'global',
    pageEnabled,
    siteGlobalEnabled,
    effectiveEnabled,
    responsiveVisibility: vis,
    component: effectiveEnabled ? found : null,
    definition: found,
  };
}

export function getPagesReferencingGlobalComponent(
  site: SiteDocument,
  slot: 'header' | 'footer',
  componentId: string
): PageDocument[] {
  const activeId =
    slot === 'header'
      ? site.globalComponents?.activeHeaderId
      : site.globalComponents?.activeFooterId;
  return site.pages.filter((page) => {
    const slotCfg = page.layout?.[slot];
    const mode = slotCfg?.mode || 'global';
    if (mode !== 'global') return false;
    const effectiveRef = slotCfg?.globalComponentId || activeId;
    return effectiveRef === componentId;
  });
}

export function createBlankHeaderFooterDef(
  slot: 'header' | 'footer',
  name?: string
): HeaderFooterComponentDef {
  const now = new Date().toISOString();
  const root: ElementNode =
    slot === 'header'
      ? {
          id: uid('loc_hdr'),
          type: 'container',
          name: name || 'Local Header',
          tag: 'header',
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
            {
              id: uid('loc_logo'),
              type: 'logo',
              name: 'Brand Logo',
              tag: 'a',
              content: { logoMode: 'text', logoText: 'Portfolio', url: '/' },
              styles: {
                display: 'inline-flex',
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: '700',
                textColor: 'var(--color-heading)',
              },
            },
            {
              id: uid('loc_nav'),
              type: 'nav-menu',
              name: 'Navigation Links',
              tag: 'nav',
              content: {
                navSource: 'manual',
                navVariant: 'horizontal-inline',
                navLinks: [
                  { id: 'ln_1', label: 'Home', url: '/' },
                  { id: 'ln_2', label: 'Contact', url: '/contact' },
                ],
              },
              styles: { display: 'flex', flexDirection: 'row', gap: '18px' },
            },
          ],
        }
      : {
          id: uid('loc_ftr'),
          type: 'container',
          name: name || 'Local Footer',
          tag: 'footer',
          styles: {
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
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
              id: uid('loc_ftxt'),
              type: 'text',
              name: 'Footer Copy',
              content: { text: '© {year} Custom Page Footer' },
              styles: { fontSize: '13px', textColor: 'var(--color-text-muted)' },
            },
          ],
        };

  return {
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    componentId: uid(`local_${slot}`),
    componentType: slot,
    name: name || (slot === 'header' ? 'Local Header' : 'Local Footer'),
    revision: 1,
    engineVersion: BUILDER_ENGINE_VERSION,
    enabled: true,
    responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
    rootElement: root,
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneHeaderFooterAsLocal(
  source: HeaderFooterComponentDef,
  labelOverride?: string
): HeaderFooterComponentDef {
  const now = new Date().toISOString();
  return {
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    componentId: uid(`local_${source.componentType}`),
    componentType: source.componentType,
    name: labelOverride || `${source.name} (Local)`,
    description: source.description,
    revision: 1,
    engineVersion: BUILDER_ENGINE_VERSION,
    enabled: true,
    presetId: source.presetId,
    presetVersion: source.presetVersion,
    isCustomized: source.isCustomized,
    responsiveVisibility: normalizeRegionVisibility(source.responsiveVisibility),
    rootElement: cloneElementTreeWithNewIds(source.rootElement),
    createdAt: now,
    updatedAt: now,
  };
}

export function createLibraryItemFromNode(params: {
  type: LibraryItemType;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  node: ElementNode;
  supportsLinkedInstances?: boolean;
}): LibraryItem {
  const now = new Date().toISOString();
  const cloned = cloneElementTreeWithNewIds(params.node);
  return {
    id: uid('lib'),
    type: params.type,
    name: params.name.trim(),
    description: params.description?.trim() || `Saved ${params.type.replace('-', ' ')}`,
    category: params.category?.trim() || 'Custom',
    tags: params.tags || [],
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    engineVersion: BUILDER_ENGINE_VERSION,
    revision: 1,
    isBuiltIn: false,
    supportsLinkedInstances:
      params.type === 'component' ? params.supportsLinkedInstances !== false : false,
    rootNode: cloned,
    createdAt: now,
    updatedAt: now,
  };
}

export function instantiateLibraryItem(
  item: LibraryItem,
  mode: 'independent' | 'linked' = 'independent'
): ElementNode | null {
  if (!item.rootNode) return null;
  const instance = cloneElementTreeWithNewIds(item.rootNode);
  if (mode === 'linked' && item.type === 'component') {
    instance.componentRef = {
      definitionId: item.id,
      revision: item.revision,
      mode: 'linked',
    };
  } else {
    delete instance.componentRef;
  }
  return instance;
}

export function countLinkedInstancesInSite(site: SiteDocument, definitionId: string): number {
  let count = 0;
  const walk = (node: ElementNode) => {
    if (
      node.componentRef?.mode === 'linked' &&
      node.componentRef.definitionId === definitionId
    ) {
      count++;
    }
    node.children?.forEach(walk);
  };
  site.pages.forEach((p) => {
    walk(p.rootElement);
    if (p.layout?.header.localComponent) walk(p.layout.header.localComponent.rootElement);
    if (p.layout?.footer.localComponent) walk(p.layout.footer.localComponent.rootElement);
  });
  site.globalComponents?.headers.forEach((h) => walk(h.rootElement));
  site.globalComponents?.footers.forEach((f) => walk(f.rootElement));
  return count;
}

export function applyComponentRevisionToSite(
  site: SiteDocument,
  definition: LibraryItem
): SiteDocument {
  if (!definition.rootNode) return site;
  const templateRoot = definition.rootNode;

  const updateTree = (node: ElementNode): ElementNode => {
    if (
      node.componentRef?.mode === 'linked' &&
      node.componentRef.definitionId === definition.id
    ) {
      const refreshed = cloneElementTreeWithNewIds(templateRoot);
      refreshed.id = node.id;
      refreshed.componentRef = {
        definitionId: definition.id,
        revision: definition.revision,
        mode: 'linked',
      };
      return refreshed;
    }
    if (!node.children) return node;
    return { ...node, children: node.children.map(updateTree) };
  };

  return {
    ...site,
    pages: site.pages.map((p) => ({
      ...p,
      rootElement: updateTree(p.rootElement),
    })),
  };
}

export function getAllLibraryItems(site: SiteDocument): LibraryItem[] {
  return [...(site.libraryItems || []), ...BUILT_IN_LIBRARY_ITEMS];
}
