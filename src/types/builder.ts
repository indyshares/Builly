import {
  CarouselConfig,
  CmsCollectionQuery,
  CmsDocument,
  CmsGeneratedRoute,
} from './cms';

export type DeviceMode = 'desktop' | 'tablet' | 'mobile';

export type ElementFamily =
  | 'layout'
  | 'basic'
  | 'media'
  | 'navigation'
  | 'forms'
  | 'portfolio'
  | 'dynamic'
  | 'advanced';

export interface DynamicBinding {
  enabled: boolean;
  source: 'sheets' | 'cms' | 'context';
  tab?: string; // Sheets tab e.g. 'PROJECTS' or CMS contentTypeId e.g. 'project'
  field: string; // e.g. 'title', 'category', 'thumbnail', 'description', or relation dot-path
  contentTypeId?: string;
  recordId?: string; // specific record or current repeater/page context
  relationFieldKey?: string;
}

export type EditorPanelType =
  | 'none'
  | 'elements'
  | 'navigator'
  | 'pages'
  | 'themes'
  | 'sheets'
  | 'cms'
  | 'media'
  | 'code'
  | 'releases'
  | 'properties'
  | 'more';

export type InsertionPlacement =
  | 'before-selected'
  | 'after-selected'
  | 'into-selected'
  | 'first-child'
  | 'append-root';

export type DropPosition = 'before' | 'after' | 'inside-first' | 'inside-last';

export type TreeMoveOperation =
  | 'reorder'
  | 'move-before'
  | 'move-after'
  | 'move-inside'
  | 'move-out';

export interface TreeMoveCommand {
  nodeIds: string[];
  destinationParentId: string;
  destinationIndex: number;
  operation: TreeMoveOperation;
  expectedDocumentRevision?: number;
}

export interface TreeInsertCommand {
  node: ElementNode;
  elementType: string;
  parentId: string;
  index: number;
  placement: 'before' | 'after' | 'first-child' | 'last-child';
  expectedDocumentRevision?: number;
}

export type PseudoStateKey =
  | 'default'
  | 'hover'
  | 'focus'
  | 'focus-visible'
  | 'active'
  | 'disabled';

export type NonDefaultPseudoState = Exclude<PseudoStateKey, 'default'>;

export interface ElementStyles {
  // Layout & Display
  display?:
    | 'block'
    | 'inline'
    | 'inline-block'
    | 'flex'
    | 'inline-flex'
    | 'grid'
    | 'inline-grid'
    | 'flow-root'
    | 'none'
    | string;
  boxSizing?: 'border-box' | 'content-box' | string;
  aspectRatio?: string;
  columnCount?: string;
  columnWidth?: string;
  columnRule?: string;
  contain?: string;
  contentVisibility?: string;

  // Flex Container
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse' | string;
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse' | string;
  justifyContent?: string;
  alignItems?: string;
  alignContent?: string;
  gap?: string;
  rowGap?: string;
  columnGap?: string;

  // Flex & Grid Item
  alignSelf?: string;
  justifySelf?: string;
  placeSelf?: string;
  order?: string;
  flexGrow?: string;
  flexShrink?: string;
  flexBasis?: string;
  flex?: string;

  // Grid Container & Item Placement
  gridColumns?: string; // canonical mapped to CSS grid-template-columns
  gridTemplateRows?: string;
  gridTemplateAreas?: string;
  gridAutoFlow?: string;
  gridAutoColumns?: string;
  gridAutoRows?: string;
  justifyItems?: string;
  placeItems?: string;
  placeContent?: string;
  gridColumn?: string;
  gridRow?: string;
  gridColumnStart?: string;
  gridColumnEnd?: string;
  gridRowStart?: string;
  gridRowEnd?: string;

  // Sizing & Logical Dimensions
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  height?: string;
  minHeight?: string;
  maxHeight?: string;
  inlineSize?: string;
  minInlineSize?: string;
  maxInlineSize?: string;
  blockSize?: string;
  minBlockSize?: string;
  maxBlockSize?: string;

  // Spacing (4-side, shorthand, and logical)
  margin?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginInline?: string;
  marginBlock?: string;
  padding?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  paddingInline?: string;
  paddingBlock?: string;

  // Typography
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  fontStretch?: string;
  lineHeight?: string;
  letterSpacing?: string;
  wordSpacing?: string;
  textAlign?: 'start' | 'end' | 'left' | 'right' | 'center' | 'justify' | string;
  textAlignLast?: string;
  verticalAlign?: string;
  textIndent?: string;
  textTransform?: string;
  textColor?: string;
  textDecorationLine?: string;
  textDecorationStyle?: string;
  textDecorationColor?: string;
  textDecorationThickness?: string;
  textUnderlineOffset?: string;
  textShadow?: string;
  whiteSpace?: string;
  overflowWrap?: string;
  wordBreak?: string;
  hyphens?: string;
  lineClamp?: string;
  direction?: 'ltr' | 'rtl' | string;
  writingMode?: string;

  // Background
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundGradient?: string;
  backgroundLayers?: string;
  backgroundSize?: 'cover' | 'contain' | 'auto' | string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundAttachment?: string;
  backgroundOrigin?: string;
  backgroundClip?: string;
  backgroundBlendMode?: string;

  // Border, Radius & Outline
  borderWidth?: string;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted' | 'double' | string;
  borderColor?: string;
  borderTopWidth?: string;
  borderTopStyle?: string;
  borderTopColor?: string;
  borderRightWidth?: string;
  borderRightStyle?: string;
  borderRightColor?: string;
  borderBottomWidth?: string;
  borderBottomStyle?: string;
  borderBottomColor?: string;
  borderLeftWidth?: string;
  borderLeftStyle?: string;
  borderLeftColor?: string;
  borderInlineWidth?: string;
  borderInlineStyle?: string;
  borderInlineColor?: string;
  borderBlockWidth?: string;
  borderBlockStyle?: string;
  borderBlockColor?: string;
  borderRadius?: string;
  borderTopLeftRadius?: string;
  borderTopRightRadius?: string;
  borderBottomRightRadius?: string;
  borderBottomLeftRadius?: string;
  outlineWidth?: string;
  outlineStyle?: string;
  outlineColor?: string;
  outlineOffset?: string;

  // Effects & Filters
  boxShadow?: string;
  opacity?: string;
  filter?: string;
  backdropFilter?: string;
  mixBlendMode?: string;
  isolation?: string;
  clipPath?: string;

  // Overflow, Scroll & Media Fit
  overflow?: string;
  overflowX?: string;
  overflowY?: string;
  overscrollBehavior?: string;
  scrollBehavior?: string;
  scrollSnapType?: string;
  scrollSnapAlign?: string;
  scrollSnapStop?: string;
  resize?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down' | string;
  objectPosition?: string;

  // Positioning & Stacking
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky' | string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  inset?: string;
  insetInline?: string;
  insetBlock?: string;
  zIndex?: string;

  // Transform
  transform?: string;
  transformOrigin?: string;
  transformBox?: string;
  perspective?: string;

  // Transition & Animation
  transition?: string;
  transitionProperty?: string;
  transitionDuration?: string;
  transitionDelay?: string;
  transitionTimingFunction?: string;
  animation?: string;
  animationName?: string;
  animationDuration?: string;
  animationDelay?: string;
  animationTimingFunction?: string;
  animationIterationCount?: string;
  animationDirection?: string;
  animationFillMode?: string;
  animationPlayState?: string;

  // Cursor & Interaction
  cursor?: string;
  pointerEvents?: string;
  userSelect?: string;

  // Lossless raw/custom CSS declarations (unknown properties, --vars, etc.)
  rawDeclarations?: Record<string, string>;
}

export interface ElementAdvanced {
  customClasses?: string;
  customCss?: string;
  animation?: 'none' | 'fade-in' | 'slide-up' | 'scale-in';
  hideOnDesktop?: boolean;
  hideOnTablet?: boolean;
  hideOnMobile?: boolean;
  htmlId?: string;
  ariaLabel?: string;
  role?: string;
}

export type PseudoStylesMap = Partial<Record<NonDefaultPseudoState, Partial<ElementStyles>>>;

export interface ElementNavLinkItem {
  id: string;
  label: string;
  url: string;
  iconName?: string;
  targetBlank?: boolean;
  badge?: string;
  description?: string;
  children?: ElementNavLinkItem[];
}

export interface ElementStructuredItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  meta?: string;
  imageSrc?: string;
  url?: string;
  value?: number;
}

export interface LinkedComponentRef {
  definitionId: string;
  revision: number;
  mode: 'linked' | 'detached';
}

export interface ElementNode {
  id: string;
  type: string;
  name: string;
  tag?: string;
  styleSchemaVersion?: number;
  presetId?: string;
  presetVersion?: number;
  isCustomized?: boolean;
  componentRef?: LinkedComponentRef;
  content?: {
    text?: string;
    headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    url?: string;
    targetBlank?: boolean;
    buttonVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
    imageSrc?: string;
    imageAlt?: string;
    caption?: string;
    aspectRatio?: '16:9' | '4:3' | '1:1' | 'auto';
    objectFit?: 'cover' | 'contain' | 'fill';
    // Icon element properties
    iconName?: string;
    iconSet?: 'lucide' | 'custom-svg';
    iconSize?: string;
    iconStrokeWidth?: number;
    iconColor?: string;
    iconBgColor?: string;
    svgMarkup?: string;
    // Logo element properties
    logoMode?: 'image' | 'text' | 'icon-text';
    logoAssetId?: string;
    logoLightSrc?: string;
    logoDarkSrc?: string;
    logoText?: string;
    logoTagline?: string;
    logoIconName?: string;
    // Media & Embed
    videoUrl?: string;
    videoPoster?: string;
    audioUrl?: string;
    audioTitle?: string;
    embedUrl?: string;
    htmlCode?: string;
    embedThemeMode?: 'follow-theme' | 'independent';
    codeLanguage?: string;
    lottieUrl?: string;
    // Navigation
    navLinks?: ElementNavLinkItem[];
    navSource?: 'manual' | 'site-pages';
    navVariant?: string;
    submenuTrigger?: 'click' | 'click-hover';
    mobileMenuEnabled?: boolean;
    mobileNavVariant?: 'drawer' | 'fullscreen' | 'off-canvas' | 'bottom' | 'compact';
    drawerSide?: 'left' | 'right';
    ctaLabel?: string;
    ctaUrl?: string;
    // Header & Footer Region Options
    announcementText?: string;
    announcementUrl?: string;
    stickyMode?: 'static' | 'sticky' | 'fixed';
    transparentOverHero?: boolean;
    containerWidthMode?: 'contained' | 'full-bleed';
    showSearchBox?: boolean;
    showBackToTop?: boolean;
    mobileAccordionColumns?: boolean;
    newsletterPlaceholder?: string;
    newsletterButtonLabel?: string;
    isVisualPlaceholderShell?: boolean;
    placeholderNotice?: string;
    // Forms & interactive controls
    fieldName?: string;
    fieldLabel?: string;
    placeholder?: string;
    inputType?: 'text' | 'email' | 'url' | 'tel' | 'number';
    required?: boolean;
    checked?: boolean;
    options?: string[];
    modalTriggerLabel?: string;
    modalTitle?: string;
    tooltipText?: string;
    // Structured collections (List, Gallery, Tabs, Accordion, Timeline, Testimonials, Chart, Table)
    items?: ElementStructuredItem[];
    orderedList?: boolean;
    tableColumns?: string[];
    tableRows?: string[][];
    // Repeater & CMS Collection configuration
    repeaterSource?: 'sheets' | 'cms';
    repeaterCollection?: string; // 'PROJECTS' | 'SKILLS' | 'EXPERIENCE' or CMS contentTypeId
    repeaterLimit?: number;
    repeaterSortBy?: string;
    repeaterOrder?: 'asc' | 'desc';
    repeaterEmptyText?: string;
    cmsQuery?: CmsCollectionQuery;
    carouselConfig?: CarouselConfig;
    dynamicLinkTarget?: 'record-detail' | 'field-url' | 'custom';
    taxonomyId?: string;
    targetElementId?: string; // For taxonomy-filter / cms-pagination targeting a collection widget
    formId?: string; // References CmsFormDefinition.formId for connected CMS forms
  };
  dynamicBinding?: DynamicBinding;
  styles: ElementStyles;
  responsiveStyles?: {
    tablet?: Partial<ElementStyles>;
    mobile?: Partial<ElementStyles>;
  };
  pseudoStyles?: PseudoStylesMap;
  responsivePseudoStyles?: {
    tablet?: PseudoStylesMap;
    mobile?: PseudoStylesMap;
  };
  advanced?: ElementAdvanced;
  children?: ElementNode[];
  htmlId?: string;
  locked?: boolean;
  hidden?: boolean;
}

export type PageStatus = 'draft' | 'published' | 'unpublished' | 'archived';

export interface PageNavigationConfig {
  visible: boolean;
  label?: string;
  order: number;
}

export type LayoutMode = 'global' | 'local' | 'none';
export type RegionMode = LayoutMode;
export type RegionType = 'header' | 'navigation' | 'footer';

export interface RegionResponsiveVisibility {
  desktop: boolean;
  tablet: boolean;
  mobile: boolean;
}

export interface HeaderFooterPresetDef {
  presetId: string;
  presetVersion: number;
  regionType: RegionType;
  category: string;
  name: string;
  description: string;
  tags: string[];
  requiredSlots: string[];
  optionalSlots: string[];
  responsiveDefaults: RegionResponsiveVisibility;
  isVisualPlaceholder?: boolean;
  placeholderNotice?: string;
  buildRootNode: () => ElementNode;
}

export interface HeaderFooterComponentDef {
  schemaVersion: number;
  componentId: string;
  componentType: 'header' | 'footer';
  name: string;
  description?: string;
  revision: number;
  engineVersion: string;
  enabled?: boolean;
  presetId?: string;
  presetVersion?: number;
  isCustomized?: boolean;
  responsiveVisibility?: RegionResponsiveVisibility;
  rootElement: ElementNode;
  createdAt: string;
  updatedAt: string;
}

export interface PageLayoutSlot {
  mode: LayoutMode;
  enabled?: boolean;
  globalComponentId?: string | null;
  localComponentId?: string | null;
  localComponent?: HeaderFooterComponentDef | null;
  responsiveVisibility?: RegionResponsiveVisibility;
}

export interface PageLayoutConfig {
  header: PageLayoutSlot;
  footer: PageLayoutSlot;
}

export interface PageDocument {
  id: string; // Permanent stable pageId independent of name/slug/order
  name: string;
  slug: string; // '/' for Home, '/about', '/projects', '/project-one'
  parentPageId?: string | null;
  isHome?: boolean;
  navigation?: PageNavigationConfig;
  status?: PageStatus;
  layout?: PageLayoutConfig;
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  noIndex?: boolean;
  pageKind?: 'standard' | 'cms-archive' | 'cms-single' | 'taxonomy-archive';
  cmsTemplateTypeId?: string;
  cmsTemplateTaxonomyId?: string;
  redirectFromSlugs?: string[];
  revision?: number;
  driveFileId?: string;
  createdAt?: string;
  rootElement: ElementNode;
  customCss?: string;
  customCssThemeMode?: 'follow-theme' | 'independent';
  customJs?: string;
  lastModified: string;
}

export interface SemanticThemeColors {
  primary: string;
  primaryHover: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textInverse: string;
  heading: string;
  border: string;
  divider: string;
  link: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonSecondaryBg: string;
  focusRing: string;
}

export interface SiteThemeConfig {
  schemaVersion: number;
  themeId: string;
  themeVersion: number;
  colorOverrides: Partial<SemanticThemeColors>;
  updatedAt: string;
}

export interface ThemeTokens {
  id: string;
  name: string;
  version: number;
  category: string;
  isCustom?: boolean;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  colors: {
    canvas: string;
    surface: string;
    surfaceSubtle: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    accentHover: string;
    accentForeground: string;
    border: string;
  };
  semantic: SemanticThemeColors;
  borderRadius: string; // '0px' | '6px' | '12px' | '20px'
  containerMaxWidth: string; // '1200px' | '1320px' | '1440px'
}

export interface SheetsTab {
  name: string;
  description: string;
  columns: string[];
  rows: Record<string, any>[];
}

export type WorkspaceConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'needs_reauth'
  | 'error'
  | 'disconnected';

export type WorkspaceSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface WorkspaceSyncSummary {
  operation: 'refresh' | 'save' | 'initialize' | 'create' | 'link';
  recordsRead?: number;
  recordsWritten?: number;
  timestamp: string;
}

export interface GoogleWorkspaceState {
  isDemoMode: boolean;
  connectionStatus: WorkspaceConnectionStatus;
  connected: boolean;
  userEmail: string;
  accountName: string;
  avatarUrl: string;
  googleSubject?: string;
  grantedScopes?: string[];
  mode: 'auto' | 'existing';
  connectionHealth: 'healthy' | 'degraded' | 'disconnected';
  lastSynced: string;
  lastReadAt?: string;
  lastWriteAt?: string;
  syncStatus: WorkspaceSyncStatus;
  syncError?: string | null;
  lastSyncSummary?: WorkspaceSyncSummary;
  spreadsheetLinked: boolean;
  spreadsheetCanEdit?: boolean;
  schemaVersion?: string;
  missingSchemaTabs?: string[];
  driveFolder: {
    id: string;
    name: string;
    path: string;
    verified?: boolean;
    subfolders: { name: string; id: string; count: number }[];
  };
  spreadsheet: {
    id: string;
    name: string;
    url: string;
    tabs: SheetsTab[];
  };
}

export interface ThemeSnapshot {
  themeId: string;
  themeVersion: number;
  themeName: string;
  colors: SemanticThemeColors;
  colorOverrides: Partial<SemanticThemeColors>;
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  borderRadius: string;
  containerMaxWidth: string;
  cssVariablesText: string;
}

export interface PublishedRouteEntry {
  pageId: string;
  name: string;
  fullPath: string;
  navLabel: string;
  navVisible: boolean;
  parentPageId?: string | null;
  isHome: boolean;
  order: number;
  title: string;
  noIndex?: boolean;
}

export interface GlobalComponentsConfig {
  headers: HeaderFooterComponentDef[];
  activeHeaderId: string | null;
  footers: HeaderFooterComponentDef[];
  activeFooterId: string | null;
}

export interface BuildRelease {
  version_id?: string;
  site_id?: string;
  version_number?: string;
  release_name?: string;
  description?: string;
  build_id?: string;
  artifact_url?: string;
  snapshot_id?: string;
  manifest_url?: string;
  artifact_hash?: string;
  status: 'Active' | 'Archived' | 'Deleted' | 'Deploying' | 'Failed' | 'active' | 'archived' | 'deleted';
  is_active?: boolean;
  created_at?: string;
  created_by?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;

  version: string;
  timestamp: string;
  commitMessage: string;
  pageCount: number;
  artifactSize: string;
  driveFileId: string;
  compiledPages: Record<string, string>; // fullPath -> static HTML / compiled JSON
  publishedRoutes?: PublishedRouteEntry[];
  sitemapXml?: string;
  pagesSnapshot?: PageDocument[];
  themeSnapshot?: ThemeSnapshot;
  globalComponentsSnapshot?: GlobalComponentsConfig;
  cmsSnapshot?: CmsDocument;
  cmsGeneratedRoutes?: CmsGeneratedRoute[];
  manifestDriveFileId?: string;
  publishTarget?: 'cloudflare_drive' | 'google_drive' | 'local_staging';
  runtimeSnapshotJson?: string;
}

export type AssetCategory =
  | 'images'
  | 'logos'
  | 'icons'
  | 'video-audio'
  | 'fonts'
  | 'documents'
  | 'other';

export interface MediaAsset {
  id: string;
  name: string;
  url: string;
  size: string;
  bytes?: number;
  type: string;
  mimeType?: string;
  category?: AssetCategory;
  dimensions?: { width: number; height: number };
  altText?: string;
  svgSanitized?: boolean;
  svgMarkup?: string;
  sourceOrigin?: 'upload' | 'starter' | 'agent-generated' | 'drive';
  licenseNote?: string;
  tags?: string[];
  driveFileId: string;
  driveFolder?: string;
  createdAt: string;
  updatedAt?: string;
}

export type LibraryItemType =
  | 'component'
  | 'section-template'
  | 'header-template'
  | 'navigation-template'
  | 'footer-template'
  | 'page-template'
  | 'site-template';

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  name: string;
  description: string;
  category: string;
  tags: string[];
  schemaVersion: number;
  engineVersion: string;
  revision: number;
  isBuiltIn?: boolean;
  supportsLinkedInstances?: boolean;
  rootNode?: ElementNode;
  headerSlotMode?: LayoutMode;
  footerSlotMode?: LayoutMode;
  createdAt: string;
  updatedAt: string;
}

export interface SavedBlock {
  id: string;
  name: string;
  category: string;
  element: ElementNode;
  createdAt: string;
}

export interface SharedHeaderConfig {
  enabled: boolean;
  brandText?: string;
  ctaLabel?: string;
  ctaPath?: string;
}

export interface ElementLibraryPrefs {
  favorites: string[];
  recent: string[];
}

export interface SiteDocument {
  id: string;
  name: string;
  portfolioSlug: string;
  activeThemeId: string;
  themeConfig?: SiteThemeConfig;
  customThemes?: ThemeTokens[];
  themeCustomizations?: Partial<ThemeTokens>;
  sharedHeader?: SharedHeaderConfig;
  globalComponents?: GlobalComponentsConfig;
  libraryItems?: LibraryItem[];
  elementPrefs?: ElementLibraryPrefs;
  globalCss?: string;
  globalCssThemeMode?: 'follow-theme' | 'independent';
  globalJs?: string;
  pages: PageDocument[];
  activePageId: string;
  pageRegistryRevision?: number;
  pageRegistryDriveFileId?: string;
  siteThemeRevision?: number;
  savedBlocks: SavedBlock[];
  mediaAssets: MediaAsset[];
  releases: BuildRelease[];
  activeReleaseVersion?: string;
  cms?: CmsDocument;
}
