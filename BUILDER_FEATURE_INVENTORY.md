# Builly Visual Builder — Complete Feature Inventory (`BUILDER_FEATURE_INVENTORY.md`)

This inventory catalogs every existing feature, screen, component, action, menu, button, input, dialog, panel, service, API, and integration in Builly, based on a rigorous code audit of the codebase.

---

## A. Builder Workspace & Multi-Page Navigation
- **Workspace Entry & Initialization**: Initialized from local storage (`storageService.loadSite()`) or Google Drive multi-page registry, with Supabase Auth identity integration (`AuthProvider`, `BuillyOwnerIdentity`).
- **Site & Portfolio Slug**: Project naming and portfolio slug configuration (`portfolioSlug`).
- **Page Management Panel (`PageManagementPanel.tsx`)**:
  - Page listing, sorting (`sortPagesForTree`), nesting/hierarchy (parent-child relationship).
  - Page creation (`PageCreationModal.tsx`): Blank, Template, or Duplicate with slug validation (`validatePageSlug`), reserved slug blocklist (`builly`, `indyshares`, `api`, etc.), and home designation (`isHome`).
  - Page deletion (`PageDeleteConfirmModal.tsx`): Home page protection, child reparenting/promotion/deletion options, published state checks.
  - Page duplication, renaming, visibility toggle (`published`, `draft`, `unpublished`, `archived`), and nav visibility.
- **Header & Footer Region Management**:
  - Global vs. local vs. none region modes for headers and footers (`resolvePageSlotComponent`).
  - Responsive visibility (`RegionResponsiveVisibility`: desktop, tablet, mobile).
  - Region preset library (`RegionPresetPanel.tsx`).
- **Workspace Layout & Dock Controls**:
  - Left Sidebar (`LeftSidebar.tsx`): Tabs for Elements, Navigator, Pages, Themes, Media, Code, and Versions (Releases).
  - Right Property Inspector (`PropertyInspector.tsx`): Contextual property editing for selected elements.
  - Focus Mode (`isFocusMode`): Distraction-free full-canvas editing hiding sidebars.
  - Canvas Resizing & Viewport modes (`desktop`, `tablet`, `mobile`).
  - Zoom controls, Undo / Redo history stack.
  - Keyboard shortcuts (Delete, Escape, Ctrl+Z, Ctrl+Y, etc.).
  - Multi-page navigation breadcrumbs and route switching.

## B. Visual Canvas & Freeform Layout Engine
- **Canvas (`Canvas.tsx`)**: Interactive rendering surface with drag-and-drop insertion, hover highlights, selection bounding boxes, and drag drop placement feedback (`BuilderDragContext`).
- **Tree Operations (`treeCommandService.ts`)**:
  - Element insertion, movement, reparenting, and depth-first validation.
  - Prevention of circular parent nesting (moving a container into its own descendant).
  - Tree cloning with new IDs (`cloneElementTreeWithNewIds`).
- **Layout & Styling Models (`cssCompiler.ts`, `responsiveStyleModel.ts`, `PropertyInspector.tsx`)**:
  - Display modes: Block, Flex, Grid, Inline, None.
  - Flexbox container properties (`flexDirection`, `flexWrap`, `justifyContent`, `alignItems`, `gap`).
  - Grid container properties (`gridColumns`, `gridTemplateRows`, `gridAutoFlow`, `gap`).
  - Item sizing & alignment (`flexGrow`, `flexShrink`, `alignSelf`, `justifySelf`, `gridColumn`, `gridRow`).
  - Sizing (`width`, `minWidth`, `maxWidth`, `height`, `minHeight`, `maxHeight`).
  - Spacing (`margin`, `padding`, `marginInline`, `paddingInline`, etc.).
  - Typography (`fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `textAlign`, `textColor`, `textShadow`).
  - Backgrounds (Color, Gradients, Layered background images).
  - Borders, border-radius, shadows (`boxShadow`), outline.
  - Responsive styles (`responsiveStyles.tablet`, `responsiveStyles.mobile`).
  - Pseudo-states (`hover`, `focus`, `active`, `disabled`).
  - Advanced properties (`z-index`, position `absolute/sticky`, raw transforms, custom CSS, HTML ID, ARIA attributes).

## C. Element Library (`ElementLibraryPanel.tsx`, `elementRegistry.ts`)
1. **Layout & Container Elements**: Section, Container, Columns, Grid, Flex.
2. **Typography & Text Elements**: Heading (H1-H6), Text, Rich Text, Label, Blockquote, Code.
3. **Media & Assets**: Image, SVG Graphic, Video, Audio, Lottie, Embed.
4. **Interactive & Controls**: Button, Link, Anchor Link, Navbar, Nav Menu, Breadcrumbs, Pagination, Social Links, Tabs, Accordion.
5. **Forms & Inputs**: Form, Input, Textarea, Select, Checkbox, Radio.
6. **CMS & Structured Data**: Data Table, Post Grid, Post List, Post Carousel, Content Counter, CMS Pagination, Taxonomy Filter, Taxonomy List.

## D. Property Inspector (`PropertyInspector.tsx`, `property-editor/`)
- Content editor (text, URLs, links, target blank, badge labels).
- Typography editor (font family, size, weight, alignment, color).
- Sizing & Spacing editors (width, height, padding, margin with unit pickers px/rem/%/vw).
- Layout & Alignment grid/flex controls.
- Background & Border controls.
- CMS connection & dynamic binding controls (`DynamicBinding`).
- Form configuration bindings.
- Advanced attributes (HTML ID, ARIA roles, custom classes).

## E. Responsive Design & Breakpoints
- Breakpoints: Desktop (1440px+), Tablet (768px - 1023px), Mobile (<768px).
- Responsive breakpoint switcher in canvas & property inspector.
- Breakpoint-specific property overrides (inheriting desktop defaults unless overridden on tablet/mobile).
- Mobile navigation drawer / menu behavior.

## F. Themes & Design System (`ThemePanel.tsx`, `themeService.ts`, `themes.ts`)
- Preset themes (Modern Minimalist, Editorial Dark, Creative Studio, Vibrant SaaS, Corporate Clean, Luxury Serif, Warm Organic).
- Color palette overrides (canvas, surface, textPrimary, textSecondary, accent, border).
- Typography token selection (Display, Body, Mono).
- Border radius tokens (`0px`, `6px`, `12px`, `20px`).
- Theme CSS variable compilation (`buildThemeCssVariablesText`).

## G. Assets & Media (`AssetLibraryPanel.tsx`, `assetService.ts`)
- Google Drive folder integration (`Builly/Media/` or custom folder picker).
- Media listing, categories (`images`, `logos`, `icons`, `video-audio`, `fonts`, `documents`).
- Image upload, data-URI encoding, and SVG sanitization (`sanitizeSvgMarkup`).
- Asset selection for Image and Logo elements.

## H. CMS Integration (`CmsWorkspaceModal.tsx`, `CmsContentTypeBuilder.tsx`, `CmsRecordEditor.tsx`, `cmsQueryEngine.ts`)
- Content Type Schema builder (fields, types, required, publiclyExposed, sheetTableId).
- CMS Records manager (Draft, Published, Archived statuses, custom fields, slugs, titles).
- Taxonomies & Terms (hierarchical categories and flat tags).
- Relationships (one-to-one, one-to-many, many-to-many).
- Rich content docs.
- Public CMS sanitization (`buildSanitizedPublicCmsSnapshot` filtering `publiclyExposed !== false` and `published` records).

## I. Forms & Unified Inbox (`CmsInboxView.tsx`, `partitionedWorkspaceService.ts`)
- Form definitions (fields, destination sheet name, success message).
- Unified Inbox submissions tracking (Submissions, SubmissionFields, Categories, Notes, Activity).
- Read/unread, starred, archive, spam filtering.
- Internal owner notes and activity logs.

## J. Preview, Publish & Version History (`PublishModal.tsx`, `PublicSiteModal.tsx`, `compilerService.ts`, `partitionedWorkspaceService.ts`)
- Preflight validation (route checks, missing home page detection, link validation).
- Multi-page compilation (`compilerService.compileRelease`).
- Shared Runtime publication (`publishSiteToSharedRuntime` to Cloudflare Worker + Google Drive `Published/{buildId}/runtime-config.json`).
- Release version history, previewing past versions, and rolling back active version (`handleRollbackRelease`).

## K. Shared Runtime & Source Export (`sourceExportService.ts`, `PublicSiteRuntimePage.tsx`, Worker API)
- Visitor runtime loading (`loadPublicRuntimeSnapshot` resolving `/{site-slug}/*` and `/s/{site-slug}/*`).
- Visitor-facing safe rendering (`ElementRenderer` with `isEditor={false}`).
- On-demand multi-page static ZIP source export (`generateSiteSourceZip`) with pure-TS CRC-32 PKZIP archive builder (`createZipArchive`).

## L. Data Persistence & Google Workspace
- Local browser state persistence (`storageService.ts`).
- Google Workspace OAuth session (`googleAuthService.ts`).
- Google Sheets API sync (`googleWorkspaceApi.ts`).
- Partitioned Google Drive & Sheets layout (`partitionedWorkspaceService.ts`).
- Supabase Auth session identity (`AuthContext.tsx`).
