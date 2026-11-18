# Builly Visual Builder UX/UI Redesign — Codebase Audit (`REDESIGN_AUDIT.md`)

**Phase:** Phase 0 / Step 1 — Audit Only (Zero application source code modified)  
**Design Direction:** Calm Professional Creative IDE  
**Specs Audited Against:** `BUILDER_UX_UI_SPEC.md`, `BUILDER_DESIGN_SYSTEM.md`, `REDESIGN_IMPLEMENTATION_PLAN.md`

---

## 1. Executive Summary

The Builly Visual Builder is a full-featured React 19 + TypeScript + Tailwind CSS v4 application (`@tailwindcss/vite` `^4.3.3`) with a mature underlying engine (`SiteDocument`, `ElementNode` tree across Header / Page / Footer regions, responsive cascade in `responsiveStyleModel.ts`, CSS compilation in `cssCompiler.ts`, Google Drive/Sheets Workspace sync, Unified CMS & Form Inbox, and Version History/Preview/Rollback).

However, the workspace UI suffers from severe **width starvation, border/card nesting, hardcoded visual density, and broken numeric input ergonomics**:
- **Numeric input clipping root cause:** `PropertyInspector` is locked at `w-80 lg:w-[340px]` (320–340px). Nested padding leaves **266–286px** inside `CollapsibleStyleGroup`. Multi-column grids (`grid-cols-2`, `grid-cols-3`, `grid-cols-4`) shrink `CssUnitInput` cells to **~58–139px**, while its native `<select>` unit picker contains long keyword options (`min-content`, `max-content`, `fit-content`), forcing the browser to size the `<select>` to **~95–110px** and squeezing the `<input type="number">` (plus native spinner arrows) down to **~0–25px**.
- **Intermediate input & state bugs:** `CssUnitInput` writes directly on every `onChange` without local draft state, causing empty `""` or partial states (`"-"`, `"1."`) to delete keys or fail `parseNumericUnit`; `handleUnitChange` rewrites empty values to `"0"` and reinterprets `"100px"` directly as `"100%"`; `TransformSection` stores local state (`tx`, `ty`, `sx`, `sy`, etc.) that never syncs when switching elements; and `EffectsFiltersSection` shadows / numeric fields coerce empty input to `0`.
- **Localization gap:** While `HeaderToolbar`, `LeftSidebar`, `ElementLibraryPanel`, `PageManagementPanel`, `AssetLibraryPanel`, `ThemePanel`, and `RegionPresetPanel` use `react-i18next` (`en`/`th`), `PropertyInspector` and all `src/components/builder/property-editor/*` subcomponents are **almost entirely hardcoded in English**, and `index.html` / `src/index.css` do not load a Thai-tuned UI typeface (`Noto Sans Thai` / `IBM Plex Sans Thai`).

---

## 2. Current Workspace Component Map & Layout Structure

### 2.1 Root & Workspace Shell
- **Entry & Auth Gate:** `/src/App.tsx` renders the builder workspace (`BuilderAppProps`, exported as default `App`), wrapped by `/src/features/identity/` & landing routing.
- **Root Container (`/src/App.tsx:3582`):** `w-full h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden font-sans`.
- **Viewport Mode Detection (`/src/config/breakpoints.ts:42-82`):** `useEditorViewport()` derives `editorViewportMode`:
  - `desktop`: `width >= 1024`
  - `tablet`: `768 <= width < 1024`
  - `mobile`: `width < 768`
  - Strictly decoupled from website preview `deviceMode` (`desktop: 1280px`, `tablet: 768px`, `mobile: 375px` in `BREAKPOINTS`).

### 2.2 Workspace Regions & Current Dimensions

| Region | File Path & Component | Desktop Dimensions | Tablet / Mobile Behavior | State & Persistence |
|---|---|---|---|---|
| **Top Toolbar** | `/src/components/builder/HeaderToolbar.tsx` (`HeaderToolbar`) | `h-14` (56px), full width; 14+ controls on right side | `h-14` tablet / `h-13` (52px) mobile; hamburger toggles left drawer | Controlled props from `App.tsx` |
| **Left Library Panel** | `/src/components/builder/LeftSidebar.tsx` (`LeftSidebar`) | Fixed `w-80` (**320px**), `border-r border-slate-200`, 8-tab strip | Tablet: `w-[340px] max-w-[85vw]` overlay drawer (`z-40`); Mobile: `inset-0 z-30` full-screen sheet | `isDesktopLeftOpen` (`useState(true)` in `App.tsx:185`), **not persisted** |
| **Central Canvas** | `/src/components/builder/Canvas.tsx` (`Canvas`) | `flex-1` remaining width (`calc(100vw - 640..660px)`), `bg-slate-100/80`; top breadcrumb/zoom bar `min-h-[40px]` | Always mounted underneath drawers/sheets to preserve scroll position | Local `manualZoom` (`100`), `fitToScreen` (`true`); **no Focus Mode** |
| **Right Property Inspector** | `/src/components/builder/PropertyInspector.tsx` (`PropertyInspector`) | Fixed `w-80 lg:w-[340px]` (**320px / 340px**), `border-l border-slate-200` (`w-80` when `element === null`) | Tablet: `w-[360px] max-w-[85vw]` overlay drawer (`z-40`); Mobile: `inset-0 z-30` full-screen sheet | `isDesktopRightOpen` (`useState(true)` in `App.tsx:186`), **not persisted** |
| **Mobile Bottom Nav** | `/src/components/builder/MobileBottomNav.tsx` (`MobileBottomNav`, `MobileMoreSheet`) | Hidden | Mobile only (`!isPreviewMode`): Elements, Layers, Properties, More | `overlayPanel` (`'none'` default on tablet/mobile) |

**Key Structural Gaps vs Spec:**
1. Left panel (`320px`) is **too wide** (spec target: `260–290px`), stealing width from Canvas and Inspector.
2. Right Inspector (`320–340px`, and even `320px` in empty state) is **too narrow** (spec target: `350–390px`).
3. Side panels cannot be user-resized, collapse state is not saved in UI preferences, and there is no single-action **Focus Mode** to hide both sidebars cleanly.
4. `HeaderToolbar` packs site meta, page selector, language switcher, device preview, undo/redo, preview, save, workspace/sheets/CMS/export, publish, and account button into a single row with ad-hoc button styles (`#6C2CEB` appears only on Account button at `HeaderToolbar.tsx:458`).

---

## 3. Left Panel Audit (`LeftSidebar.tsx` & Sub-panels)

**Container (`/src/components/builder/LeftSidebar.tsx:987-1080`):**
- Tab strip renders 8 tabs (`elements`, `navigator`, `pages`, `themes`, `sheets`, `media`, `code`, `releases`) in a horizontal scrollable strip (`overflow-x-auto`) with icon-only buttons (`min-h-[38px] min-w-[38px]`) on desktop.
- Body padding: `p-4 pb-12` (16px horizontal padding -> 288px inner width inside 320px sidebar).

**Sub-panel Inventory:**
1. **`ElementLibraryPanel` (`/src/components/builder/ElementLibraryPanel.tsx`, 789 lines):**
   - 3 sub-tabs: Elements (`ELEMENT_REGISTRY`), Built-in Templates, My Library.
   - Search bar + Family filter chips (`all`, layout, typography, media, etc.) + Insertion placement selector (`before-selected`, `after-selected`, `into-selected`, `first-child`, `end-of-page`) + Favorites & Recent strips.
   - Cards show full multi-line descriptions, type badges, favorite button, and drag handle simultaneously -> high visual noise.
   - Supports click-to-insert and drag-and-drop (`useBuilderDrag()`).
2. **Navigator / Layers (`LeftSidebar.tsx:1083-1431`):**
   - Tree across 3 regions: Header slot (global/local/none card), Page Content (`activePage.rootElement`), Footer slot card.
   - Multi-select siblings (`Shift/Ctrl/Cmd`-click) with Up/Down batch move.
   - Selected node expands an inline action box (`up`, `down`, `top`, `bottom`, `out`, `move to`, `duplicate`, `hide/show`, `lock/unlock`, `delete`, insertion target pills, move-into-container `<select>`). Very tall when expanded.
3. **`PageManagementPanel` (`/src/components/builder/PageManagementPanel.tsx`, 1812 lines):**
   - Multi-page tree with search, drag-reorder, status badges, portfolio slug editor, Google Drive registry sync/load, and a drill-down Page Settings view (`general`, `layout`, `seo`, `advanced`).
4. **`ThemePanel` (`/src/components/builder/ThemePanel.tsx`, 612 lines):**
   - `presets` / `customize` sub-tabs, active theme summary card, custom theme saver, color token override rows (`ColorTokenRow`), WCAG contrast audit.
5. **Sheets (`LeftSidebar.tsx:1488-1741`):**
   - Unified CMS CTA card + Google Workspace sync/reconnect/demo status cards + tab switcher + read-only 3-column table preview.
6. **`AssetLibraryPanel` (`/src/components/builder/AssetLibraryPanel.tsx`, 453 lines):**
   - Upload button, Vector Brand Studio toggle, search, category pills, inspected asset metadata card, 2-col asset grid.
7. **Custom Code (`LeftSidebar.tsx:1757-1919`):**
   - Scoped (`site`, `page`, `element`), theme mode toggle, dark `<textarea>` CSS/JS editors, CSS variable chips, `validateCustomCss` errors/warnings.
8. **Releases (`LeftSidebar.tsx:1922-2080`):**
   - `active` / `trash` sub-tabs, release cards with Preview, Rollback, Rename, Edit Description, Delete, Restore.
   - **Risk / Defect noted:** Rename & Edit Description (`LeftSidebar.tsx:2033, 2044`) currently call `window.prompt()`, which triggers browser-blocking dialogs discouraged inside iframes (`environment_constraints` / UX defect).

---

## 4. Canvas & Selection Architecture Audit (`/src/components/builder/Canvas.tsx`)

- **Top Canvas Bar (`Canvas.tsx`, `min-h-[40px]`):** Displays breadcrumb trail for `selectedId` (supports dropping dragged elements onto ancestor breadcrumbs via `handleBreadcrumbDrop`) and zoom controls (`fitToScreen` toggle + manual zoom `-`/`+`/`100%`).
- **Viewport Scaling (`Canvas.tsx:221-253`):** `ResizeObserver` tracks `surfaceRef.current.clientWidth`; calculates `usableWidth = Math.max(240, availableWidth - horizontalPad)` (`48px` desktop/tablet, `24px` mobile) and `computedScale = fitToScreen ? Math.min(1, usableWidth / targetPreviewWidth) : manualZoom / 100`.
- **Site CSS Isolation (`Canvas.tsx:315-320`, `/src/index.css:13-37`):**
  - `compilePreviewPageCss(page, site, deviceMode, { isEditor: !isPreviewMode, reduceMotion })` compiles element styles, responsive overrides, pseudo-states, and custom CSS.
  - `.portfolio-theme` and `.portfolio-site-surface` scope theme tokens (`--color-*`, `--font-*`).
  - `[data-indy-editor-chrome]` resets typography inside canvas element toolbars/overlays (`12px`, `Plus Jakarta Sans`, `#0f172a`).
- **Selection:** Clicking an element calls `handleSelectElementFromCanvas` (`App.tsx:3296`), updating `selectedId` (and opening `overlayPanel = 'properties'` on tablet). Note: Desktop Canvas has no Focus Mode toggle to hide sidebars.

---

## 5. Right Property Inspector Audit (`/src/components/builder/PropertyInspector.tsx`)

### 5.1 Header & Status Bars (`PropertyInspector.tsx:456-557`)
- **Element Header:** Shows `element.name` (`text-xs font-bold`), metadata `element.type · breakpoint · in parentElement.name` (`text-[11px] font-mono`), and 3 icon buttons (`Save as Component`, `Duplicate`, `Delete`) + mobile `Done` button.
- **Status Banners:** Global Shared Component banner (`editingRegionLabel.startsWith('Global')`) and Linked Instance banner (`Detach to Local`).
- **Primary Tabs (`grid-cols-4`):** `content`, `style`, `responsive`, `advanced` (hardcoded English labels, CSS `capitalize`).

### 5.2 Tab Contents & Property Grouping
1. **Content Tab (`lines 562-2473`):**
   - `Dynamic Data Binding` card (`cms` / `sheets` toggle + selectors).
   - Element-specific editors for `heading`, `text`/`rich-text`/`label`/`blockquote`/`code`, `button`/`link`/`anchor-link`/`tooltip`, `icon`, `logo`, `header`/`footer` region options, `navbar`/`nav-menu`/`breadcrumbs`/`pagination`/`social-links`, `image`/`background-media`, `video`, `audio`, `embed`, `map`, `svg-graphic`, `form` (`FormCmsInspectorSection.tsx`), `modal-box`, `text-input`/`textarea`/`select`/`checkbox`/`radio-group`/`toggle`, structured collections (`list`, `image-gallery`, `tabs`, `accordion`, `profile-card`, `skills-matrix`, `experience`, `education`, `timeline`, `testimonials`, `chart`), `data-table`, `repeater`, `html-embed`.
2. **Style Tab (`lines 2476-2653`):**
   - Optional `RegionPresetPanel` (when `header`, `footer`, `navbar`, or `nav-menu` is selected).
   - `BreakpointBanner` (nested bordered card) + `PseudoStateBar` (6 chips: `Default`, `:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled`) + `StyleSearchBar`.
   - 9 `CollapsibleStyleGroup` accordions:
     1. **Layout** (`LayoutSection`, `defaultOpen: true`)
     2. **Alignment** (`AlignmentSection`, `defaultOpen: true`)
     3. **Sizing** (`SizingSection`, `defaultOpen: Boolean(styleSearch)`)
     4. **Spacing & Box Model** (`BoxModelEditor`, `defaultOpen: Boolean(styleSearch)`)
     5. **Typography** (`TypographySection`, `defaultOpen` for heading/text/button or search)
     6. **Background** (`BackgroundSection`, `defaultOpen: Boolean(styleSearch)`)
     7. **Border & Outline** (`BorderOutlineSection`, `defaultOpen: Boolean(styleSearch)`)
     8. **Effects & Filters** (`EffectsFiltersSection`, `defaultOpen: Boolean(styleSearch)`)
     9. **Overflow & Media Fit** (`OverflowMediaSection`, `defaultOpen: Boolean(styleSearch)`)
3. **Responsive Tab (`lines 2656-2856`):**
   - `BreakpointBanner` + `Copy from Desktop/Tablet` card + Visibility checkboxes (`hideOnDesktop`, `hideOnTablet`, `hideOnMobile`) + Responsive Layout & Stacking (`display`, `order`, `gridColumn`, `gridRow`, `width`, `gap`, `fontSize`, `paddingInline`).
4. **Advanced Tab (`lines 2859-3165`):**
   - `PseudoStateBar` + `StyleSearchBar` + Accordions: `Positioning & Stacking`, `Transform`, `Transition & Animation`, `Logical Sizing, RTL & Interaction`, `Custom CSS & Preserved Declarations`, `HTML, Accessibility & Motion Preset`.

### 5.3 Structural & Visual Clutter Findings in Property Inspector
- **Local-only Accordion State (`CssUnitInput.tsx:341`):** `CollapsibleStyleGroup` uses `const [open, setOpen] = useState(defaultOpen)`. Toggling or opening a section is lost whenever the component unmounts (e.g., switching tabs or selecting `null`). Also, `defaultOpen` props only apply on first mount unless keyed.
- **Excessive Card & Border Nesting:** `PropertyInspector` wraps sections in `border border-slate-200 rounded-lg bg-white` (`CollapsibleStyleGroup`), inside which `BreakpointBanner`, `FormCmsInspectorSection`, `Gradient Layer`, `Box Shadow`, `CSS Filter`, `Block Flow Guidance`, etc. add a *second* `bg-slate-50 border border-slate-200 rounded-lg` box, and shadow layers/repeater items add a *third* nested bordered box.
- **Competing Technical Metadata (`CssUnitInput.tsx:45-52`):** `FieldHeader` prints `cssProp` (`text-[9px] font-mono text-slate-400`) inline next to every field label on `sm+` viewports, stealing horizontal label space (causing label truncation alongside the `fx` button and `Override` / `from desktop` badges).
- **Hardcoded English Strings:** `PropertyInspector.tsx` and all `src/components/builder/property-editor/*` files (except `RegionPresetPanel.tsx`) do **not** call `useTranslation()`, breaking the bilingual Thai/English requirement.

---

## 6. Complete Numeric Input Inventory & Root Cause Analysis

### 6.1 Exact Root Cause of Clipped / Invisible Numeric Values (Sizing & Style Fields)

Inspecting `/src/components/builder/property-editor/CssUnitInput.tsx` and its callers reveals **four compounding defects**:

1. **Severe Width Starvation (`58px–139px` total field width):**
   - Desktop `PropertyInspector` is `320px` (`w-80`) or `340px` (`lg:w-[340px]`).
   - Tab body padding (`p-3.5` = `28px`) + `CollapsibleStyleGroup` padding (`p-3` = `24px`) + card border (`2px`) = **`54px` overhead**, leaving **`266px`–`286px` usable inner width**.
   - In `grid-cols-2 gap-2` (`SizingSection`, `BoxModelEditor`, `TypographySection`, `BorderOutlineSection`, `Responsive`, `Advanced`): each field gets **`129px`–`139px`**.
   - In `grid-cols-3 gap-1.5` (`AlignmentSection` gap/rowGap/columnGap & flexGrow/Shrink/Basis; `PositioningSection` inset/insetInline/insetBlock; `BorderOutlineSection` outlineWidth/Style/Offset): each field gets **`85px`–`91px`**.
   - In `grid-cols-4 gap-1` (`EffectsFiltersSection` shadow `x/y/blur/spread`; `TransformSection` Rotate/ScaleX/ScaleY/SkewX; `AlignmentSection` `gridColumnStart/End/RowStart/RowEnd`): each field gets **`58px`–`68px`**.
2. **Native `<select>` Unit Picker Eats the Input (`CssUnitInput.tsx:188-224`):**
   - Inside `<div className="flex items-stretch border ...">`, the `<select>` contains `<option>` values from `units` + `keywords`.
   - For `SizingSection` (`StyleSections.tsx:303, 315`), `keywords` includes **`'min-content'`, `'max-content'`, `'fit-content'`**. Native `<select>` elements automatically expand to fit their longest `<option>` string (`~95–110px`).
   - With `px-2` (`16px`) padding and `<input type="number">` native spinner arrows (`~16–18px`), a `129px` field minus `100px` `<select>` minus `34px` leaves **~0px to -5px for typed digits**! Even in `px`-only fields (`select` ~`52px`), only **~43–53px** remain for digits (3–4 characters max).
3. **Sub-target Height & Typography (`CssUnitInput.tsx:117, 203`):**
   - Desktop `CssUnitInput` uses `h-8 text-xs` (**32px height, 12px font**), below the spec target of **38–42px height** and **14px minimum font**.
   - `BoxModelEditor` diagram cells (`BoxModelEditor.tsx:112`) are `w-12 h-6 text-[10px]` (**48px × 24px, 10px font**), clipping values like `120px` or `-16px`.
4. **Controlled Value, Typing Interruption & Unit-Change Semantics Defects:**
   - **No intermediate draft state (`CssUnitInput.tsx:111-126`):** Typing `""` immediately calls `onChange('')` -> `setStylesForBreakpoint` (`responsiveStyleModel.ts:157`) **deletes the property key** from styles. Typing partial numbers (`"1."`, `"-"`) into `<input type="number">` yields `""` in `e.target.value` on browsers, erasing the property mid-keystroke; `parseNumericUnit` (`styleValidator.ts`) only matches `/^(-?\d*\.?\d+)([a-z%]*)$/i`.
   - **Silent unit value injection (`CssUnitInput.tsx:134-135`):** `handleUnitChange` computes `const baseNum = parsed.isNumeric && parsed.number !== '' ? parsed.number : '0'`, injecting `'0px'` when switching units on an empty field and turning `'100px'` directly into `'100%'` without explicit unit conversion/preservation rules.
   - **Stale local state in `TransformSection` (`AdvancedStyleSections.tsx:230-237`):** `tx, ty, tz, rot, sx, sy, skewX` are initialized once with `useState('0px')`/`useState('1')` and never reset/parsed when `element.id`, `deviceMode`, `pseudoState`, or `rawTransform` changes.
   - **Premature zero coercion (`StyleSections.tsx:1663`, `PropertyInspector.tsx:1008, 2186, 2341`, `FormCmsInspectorSection.tsx:1077`):** `Number(e.target.value) || 0` or `parseInt(..., 10) || fallback` forces empty fields immediately to `0` or a fallback integer while typing.

### 6.2 Exhaustive Numeric Input Inventory

| Component & File | Lines | Fields & Layout Grid | Control Type / Size | Issues Identified |
|---|---|---|---|---|
| **Shared `CssUnitInput`** (`property-editor/CssUnitInput.tsx`) | `94-235` | Used across Style, Spacing, Typography, Border, Responsive, Advanced | `<input type="number\|text">` + `<select>`, `h-8 text-xs` (32px, 12px) desktop; `min-h-[40px] text-xs` overlay | Native `<select>` auto-sizes to `'fit-content'`/`'min-content'` (~100px); native number spinners eat ~18px; no draft string state; `""` deletes key; unit switch writes `'0'` or silently keeps scalar across `px`↔`%` |
| **Sizing** (`StyleSections.tsx`) | `307-380` | `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` (`grid-cols-2 gap-2`) | 6× `CssUnitInput` with `keywords: ['auto', 'min-content', 'max-content', 'fit-content']` | **Worst offender:** `129–139px` column width minus `fit-content` `<select>` (~100px) leaves near-zero digit width |
| **Box Model Diagram & Inputs** (`BoxModelEditor.tsx`) | `103-118`, `263-312`, `348-399` | Diagram: 8× `<input type="text">` (`margin*`, `padding*`); Precision: 4× `padding*` (`grid-cols-2`), 4× logical (`grid-cols-2`) | Diagram: `w-12 h-6 text-[10px]`; Precision: `CssUnitInput` | Diagram cells only `48×24px` at `10px` font; precision `4-side` mode only renders Padding (`Margin` 4-side inputs are missing outside the tiny diagram or shorthand) |
| **Layout** (`StyleSections.tsx`) | `256-266` | `columnWidth` (`grid-cols-2`) | `CssUnitInput` (`h-8 text-xs`) | `columnCount` uses raw `<input type="text">` while `columnWidth` uses `CssUnitInput` |
| **Typography** (`StyleSections.tsx`) | `492-560`, `700-727`, `806-813`, `862-888` | `fontSize` (full), `lineHeight` (full), `letterSpacing` (full), `wordSpacing` (`grid-cols-2`), `textIndent` (`grid-cols-2`), `lineClamp` (`grid-cols-2`), `textDecorationThickness` (`grid-cols-2`), `textUnderlineOffset` (`grid-cols-2`) | 7× `CssUnitInput`; 1× `<input type="number">` (`lineClamp`, `h-8 text-xs`) | `textDecorationThickness` has `'from-font'` keyword widening `<select>`; `lineClamp` raw number input lacks unit/unset semantics |
| **Background Gradient** (`StyleSections.tsx`) | `1022-1065` | `gradAngle` (`0–360`, `grid-cols-2`), `stop.pos` (`0–100`, flex `w-16 h-7`) | Raw `<input type="number">` (`h-8` / `h-7`) | `Number(e.target.value) || 0` forces empty input to `0`; local-only `gradAngle`/`stops` state not hydrated from existing `backgroundGradient` |
| **Border & Outline** (`StyleSections.tsx`) | `1310-1486` | `borderWidth` (`grid-cols-2`), `borderRadius` (full or `grid-cols-2` 4-corners), `outlineWidth`, `outlineOffset` (`grid-cols-3 gap-1.5`) | 7× `CssUnitInput` | `outlineWidth` & `outlineOffset` inside `grid-cols-3` get only **~85–91px** total width |
| **Effects & Shadow** (`StyleSections.tsx`) | `1591-1598`, `1653-1671` | `opacity` (`range` + `w-16 h-8` `type="number"`); Shadow layers `x/y/blur/spread` (`grid-cols-4 gap-1`) | Raw `<input type="number">` (`text-xs` / `text-[11px]`) | Shadow `grid-cols-4` gives **~58px** per box; `Number(e.target.value) || 0` coerces empty typing to `0`; `shadowLayers`/`filterVals` not synced from existing CSS on element switch |
| **Alignment & Flex/Grid** (`AlignmentSection.tsx`) | `485-520`, `901-938`, `1036-1115`, `1297-1305` | Flex/Grid `gap`, `rowGap`, `columnGap` (`grid-cols-3 gap-1.5`); Flex `order` (`grid-cols-2`), `flexGrow`, `flexShrink`, `flexBasis` (`grid-cols-3 gap-1.5`); Grid `order` (`grid-cols-2`) | 7× `CssUnitInput`; 4× `<input type="number">` (`order`, `flexGrow`, `flexShrink`) | `gap`/`rowGap`/`colGap` and `flexGrow`/`flexShrink`/`flexBasis` in **`grid-cols-3`** (`~85–91px` width) severely clip `CssUnitInput` |
| **Positioning** (`AdvancedStyleSections.tsx`) | `99-106`, `130-212` | `zIndex` (`grid-cols-2`), `top`/`right`/`bottom`/`left` (`grid-cols-2`), `inset`/`insetInline`/`insetBlock` (`grid-cols-3 gap-1.5`) | 1× `<input type="number">`; 7× `CssUnitInput` | `inset`/`insetInline`/`insetBlock` in **`grid-cols-3`** (`~85–91px` width) |
| **Transform & Transition** (`AdvancedStyleSections.tsx`) | `290-328`, `369`, `446-545` | `scaleX`, `scaleY` (`grid-cols-4 gap-1.5`, `h-8 text-xs`); `perspective`, `transitionDuration`, `transitionDelay`, `animationDuration` | 2× `<input type="number">`; 4× `CssUnitInput` | `Rotate/ScaleX/ScaleY/SkewX` in **`grid-cols-4`** (`~60px`); stale local `useState` never syncs with selected element; raw text inputs `tx/ty/tz` in `grid-cols-3` |
| **PropertyInspector Content/Responsive/Adv** (`PropertyInspector.tsx`) | `1002`, `2178`, `2336`, `2757`, `2810-2842`, `2931-2942` | `iconStrokeWidth`, chart/skill `items[].value`, `repeaterLimit`, Responsive `order`, `width`/`gap`/`fontSize`/`paddingInline` (`grid-cols-2`), Adv `inlineSize`/`blockSize` (`grid-cols-2`) | 4× `<input type="number">`; 6× `CssUnitInput` | `iconStrokeWidth`, `items[].value`, `repeaterLimit` coerce empty string via `|| 2` / `|| 0` / `|| 6` |
| **Form CMS Inspector** (`FormCmsInspectorSection.tsx`) | `1070` | `maxFileSizeMb` | `<input type="number">` (`w-24 text-xs`) | `parseInt(e.target.value, 10) || 10` coerces empty typing to `10` |

---

## 7. Design Tokens, Fonts, Tailwind & CSS Architecture

- **Tailwind Setup (`/package.json`, `/src/index.css:1`):**
  - Uses Tailwind CSS v4 via `@tailwindcss/vite` (`^4.3.3`) and `@import "tailwindcss";` in `/src/index.css`. There is **no `tailwind.config.*`**.
  - Custom tokens can be defined directly via CSS custom properties (`:root { --builder-canvas-bg: ... }`) and/or Tailwind v4 `@theme` inside `/src/index.css` without breaking site themes.
- **Current Ad-hoc Color Usage:**
  - Builder chrome mixes `slate-*`, `blue-600`, `indigo-600`, `purple-700`, `emerald-600`, `amber-*` inline utility classes.
  - `#6C2CEB` (`--builder-primary` in `BUILDER_DESIGN_SYSTEM.md`) is already used on the Builly Account CTA in `/src/components/builder/HeaderToolbar.tsx:458` (`bg-[#6C2CEB] hover:bg-[#5B20D0]`), providing an existing brand anchor for unifying `--builder-primary`.
- **Fonts & Thai/English Rendering (`/index.html:18`, `/src/index.css:7`):**
  - `index.html` loads Google Fonts: `Plus Jakarta Sans`, `Outfit`, `Playfair Display`, `JetBrains Mono`.
  - `body` and `[data-indy-editor-chrome]` use `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.
  - **Finding:** `Plus Jakarta Sans` has Latin/Vietnamese glyphs only — **no Thai Unicode subset (`U+0E00–U+0E7F`)**. On Thai UI strings (`th.json`), every label/button/heading falls back to the OS system Thai font (`Sarabun`/`Leelawadee UI`/`Thonburi`/`Noto Sans Thai` depending on OS), causing inconsistent baseline metrics, tight line-heights on `text-[10px]`–`text-xs` labels with Thai tone marks (สระบน/วรรณยุกต์), and visual mismatch between Latin and Thai text. Adding a clean Thai UI font (`Noto Sans Thai` or `IBM Plex Sans Thai`) in the Builder UI stack and testing `line-height` with `12px–14px` Thai labels is recommended in Phase 1.
- **Website vs Builder Isolation:**
  - Website preview and exported output use `.portfolio-theme` (`--color-*`, `--font-*`, `--theme-radius`) and `.portfolio-site-surface`. Any `--builder-*` tokens introduced must be strictly distinct from `--color-*` / `--font-*` so public site rendering and embedded HTML sandboxes (`[data-indy-embed-theme="follow"]`) are never affected.

---

## 8. State Management, Undo/Redo, Responsive Model & Persistence Flow

### 8.1 Property Update & Undo/Redo Flow (`src/App.tsx:235-242, 356-558`)
- **History State:** `history = { past: SiteDocument[], future: SiteDocument[] }`, capped at the last 26 states (`prev.past.slice(-25)`).
- **Mutator Entry:** `PropertyInspector` calls `onUpdateElement(updatedNode)` -> `App.tsx:handleUpdateElement` (`lines 535-558`).
- **Coalescing Mechanism (`lines 537-555`):**
  - Uses `lastPropertyEditRef` (`{ elementId, ts }`).
  - If `elementId` matches and `Date.now() - prev.ts < 550`ms, `shouldCoalesce = true` -> `transformOwningTree(..., coalesce=true)` calls `setSite(nextSite)` **without** `pushState(nextSite)`!
  - **Important Behavioral Nuance:** On the *first* keystroke (gap `>= 550ms`), `pushState` records the pre-edit snapshot in `history.past`. Subsequent rapid keystrokes within `550ms` mutate `site` in-place via `setSite` without flooding `history.past` — **meaning Undo works smoothly as long as keystrokes stay <550ms apart, but pausing >550ms between digits or editing different properties still pushes intermediate entries**, and there is currently no explicit `onCommit` (blur/Enter) boundary in `CssUnitInput`. Also note: `transformOwningTree` deep-clones the owning tree via `JSON.parse(JSON.stringify(...))` on every call!
- **CMS Form Update Flow (`App.tsx:3034-3046`):**
  - `FormCmsInspectorSection` updates form definitions via `onUpdateCms` (`handleUpdateCmsByFn`), which **bypasses `pushState` undo/redo** and immediately calls `storageService.saveSiteDraft(next)`.

### 8.2 Responsive Breakpoint Cascade (`src/services/responsiveStyleModel.ts`)
- **Storage Shape:**
  - Desktop (Base) + default state -> `node.styles`
  - Tablet / Mobile overrides -> `node.responsiveStyles.tablet` / `node.responsiveStyles.mobile`
  - Pseudo-states (`hover`, `focus`, `focus-visible`, `active`, `disabled`) -> `node.pseudoStyles[pseudo]` and `node.responsivePseudoStyles[bp][pseudo]`
  - Raw preserved declarations -> `node.rawStyles` / `node.responsiveRawStyles`
- **Resolution (`getStyleSource`):** Mobile inherits from Tablet -> Desktop; Tablet inherits from Desktop; setting value to `''` or `undefined` in `setStylesForBreakpoint` **deletes the key**.
- **Critical Constraint:** Redesigning `CssUnitInput` and `PropertyInspector` must preserve exact `setStylesForBreakpoint`, `resetStyleForBreakpoint`, `copyBreakpointStyles`, and `rawStyles` semantics.

### 8.3 Save / Autosave / Persistence Flow (`src/services/storageService.ts`, `src/App.tsx`)
- **Draft Storage:** `localStorage` under `indyshares_portfolio_site_v2` and `indyshares_google_workspace_v2`.
- **Save Behavior:**
  - **No automatic timer-based autosave exists for visual element/style edits** (`handleSaveDraft` in `App.tsx:383-390` is triggered manually via Toolbar Save button or `Ctrl/Cmd+S`, setting `hasUnsavedChanges = false`).
  - **Exception:** `handleUpdateCms` / `handleUpdateCmsByFn` (`App.tsx:3026, 3040`) immediately calls `storageService.saveSiteDraft(next)` on CMS/Form edits, and `persistWorkspace` immediately writes `STORAGE_KEY_WORKSPACE`.
  - **Cloud Sync:** Multi-page Google Drive sync (`syncSitePagesToGoogleDrive` with concurrency revision check), Google Sheets (`saveTabsToSpreadsheet`), VersionHistory tab (`syncVersionHistoryTab`), and Publish snapshots are explicit user/modal actions.
- **Schema Migration Safety:** `storageService.loadSite()` runs `migrateSiteCms(migrateSiteComponentsAndLayout(migrateSiteToThemeConfig(migrateSitePages(parsed))))`. UI preferences (panel open/closed, panel widths, accordion states) **must be stored separately** (e.g. a dedicated `builly_builder_ui_prefs` localStorage key) and never injected into `SiteDocument`.

---

## 9. Reusable Shared Components & Services Already Present

These existing modules should be refined/reused rather than replaced:
- **Property Style Engine (Preserve intact):**
  - `/src/services/responsiveStyleModel.ts` (`getStyleSource`, `setStylesForBreakpoint`, `resetStyleForBreakpoint`, `resetStyleGroupForBreakpoint`, `copyBreakpointStyles`, `countBreakpointOverrides`)
  - `/src/services/styleValidator.ts` (`parseNumericUnit`, `validateStyleValue`, `validateCustomCss`, `STANDARD_LENGTH_UNITS`, `ANGLE_UNITS`, `DURATION_UNITS`)
  - `/src/services/propertyCatalog.ts` (`getElementLayoutContext`, `STYLE_SECTIONS_METADATA`, `sectionMatchesSearch`)
- **UI Primitives to Evolve (in `/src/components/builder/property-editor/CssUnitInput.tsx`):**
  - `CssUnitInput` (evolve to solve width starvation, unit dropdown sizing, 38–42px height, 14px font, intermediate string draft state, and explicit unit conversion/handling)
  - `FieldHeader` (simplify visual noise; keep reset-to-inherited button & optional secondary CSS hint)
  - `ColorTokenInput` (already cleanly handles theme tokens + color picker + reset)
  - `CollapsibleStyleGroup` (upgrade to calm headerless-border / persisted accordion state)
- **Icons & Localization:**
  - `lucide-react` (`^0.546.0`), `CuratedIcon` (`/src/components/builder/CuratedIcon.tsx`), `react-i18next` (`^18.0.1`) via `/src/i18n/index.ts` and `/src/locales/{en,th}.json`.

---

## 10. Baseline Verification Results

Exact commands run from `/app/applet` prior to any edits:

1. **Typecheck / Lint (`npm run lint` -> `tsc --noEmit`):**
   - **Exit code:** `0` (0 errors, clean pass).
2. **Unit & Component Tests (`npm test` -> `vitest run`):**
   - **Exit code:** `0`
   - **Result:** `5 passed (5)` test files, `17 passed (17)` tests (`Duration 2.36s`):
     - `src/features/__tests__/authBoundary.test.ts` (6 tests)
     - `src/components/builder/__tests__/PropertyInspector.test.tsx` (1 test — verifies StrictMode render stability & zero React hook-order errors across `null`, `heading`, `header`, `nav-menu`, `footer` transitions!)
     - `src/components/common/__tests__/BuillyMadeWithBadge.test.tsx` (3 tests)
     - `src/services/__tests__/builderRegression.test.ts` (4 tests)
     - `src/utils/__tests__/routes.test.ts` (3 tests)
3. **Production Build (`npm run build` -> `vite build`):**
   - **Exit code:** `0` (`built in 1.65s`, `1808 modules transformed`, outputs in `dist/`).
   - **Build-time warnings observed:**
     - `vite.config.ts:11:27` uses `__dirname` (Vite native config loader warning).
     - Main JS bundle chunk `dist/assets/index-XdslUfZN.js` is `2,296.37 kB` (>500 kB chunk size warning).

---

## 11. Risks, Dependencies & Constraints

1. **React Hook Order Sensitivity (`PropertyInspector.test.tsx`):**
   - `PropertyInspector.tsx` and `CmsWorkspaceModal.tsx` have previously hit React Hook-order issues when toggling between `null` and selected elements (`PropertyInspector.tsx:197` returns early after hooks `useState` / `useMemo`, but `BreakpointBanner`, `PseudoStateBar`, `StyleSearchBar` are inline render functions that must **never** call hooks conditionally). Keep all new hooks above early returns and never put hooks inside inline render helpers.
2. **i18n Coverage & Test Compatibility:**
   - Adding `useTranslation()` to `PropertyInspector` requires checking `PropertyInspector.test.tsx` (currently asserts `expect(html).toContain('No Element Selected')`, which passes under `DEFAULT_LANGUAGE = 'en'` if `en.json` preserves that string, or tests should wrap/verify both `'en'` and `'th'`).
   - All new inspector/numeric keys must be added symmetrically to **both** `/src/locales/en.json` and `/src/locales/th.json`.
3. **Typography Size vs Thai Script:**
   - Thai vowels/tone marks stack vertically; bumping labels to `12–13px` and inputs to `14px` with `min-h-[38px..40px]` and appropriate `line-height` prevents vertical clipping on Thai strings.
4. **Numeric Editing Undo & Validation Interactions:**
   - Switching `CssUnitInput` to maintain local draft state while typing (`"-"`, `"1."`, `""`) must ensure `onBlur` / `Enter` commits or reverts invalid syntax cleanly, and typing valid values continues to update Canvas live without flooding `history.past`.
   - Switching units (e.g. `100px` -> `%` vs `100px` -> `rem`) needs clear, non-destructive rules (e.g. keep numeric value only for compatible absolute/relative CSS lengths where intentional, or require explicit/safe handling when switching from empty/keyword/`auto` so `auto` -> `px` does not silently fabricate `0px` unless intended, or clears/prompts cleanly — never silently turning `100px` into `100%` without user clarity).
5. **`TransformSection` & `EffectsFiltersSection` Local State Desync:**
   - Fixing clipped fields inside `TransformSection` and `Box Shadow` builder should also fix their stale local state initialization so switching selected elements parses/syncs existing `transform` / `boxShadow` values accurately.
6. **`window.prompt` in Releases Tab (`LeftSidebar.tsx:2033, 2044`):**
   - Replace `window.prompt` inline or via lightweight inline edit in later polish phase if approved, since modal/browser prompts are discouraged in iframe environments.

---

## 12. Recommended Implementation Sequence (Step 3 Phases)

Following `REDESIGN_IMPLEMENTATION_PLAN.md`, work should proceed incrementally after Phase 0 audit approval:

1. **Phase 1 — Design Foundation:**
   - Define `--builder-*` tokens (`--builder-canvas-bg`, `--builder-panel-bg`, `--builder-surface-muted`, `--builder-text-*`, `--builder-border`, `--builder-primary: #6C2CEB`, `--builder-focus-ring`) in `/src/index.css` strictly scoped away from `.portfolio-theme`.
   - Load Thai-friendly UI font fallback (e.g. `Noto Sans Thai` / `IBM Plex Sans Thai`) in `/index.html` and add to builder font stack in `/src/index.css`.
   - Establish standard focus-visible ring, 4px spacing tokens, and input/button geometry (`38–42px` standard input height, `32–36px` compact/icon targets).
2. **Phase 2 — Fix Numeric Inputs First (Highest Priority Defect):**
   - Redesign `/src/components/builder/property-editor/CssUnitInput.tsx` so `<input>` receives `flex-1 min-w-[90px]` (`14px` font, `38–40px` height) and unit control uses a compact fixed-width selector/trigger (`64–76px`, decoupled from longest keyword label like `fit-content`), hiding native `<input type="number">` spin buttons or using `inputMode="decimal"` text editing with arrow-key stepping.
   - Add stable local draft state + validation feedback + safe empty/`auto` handling + commit-on-blur/Enter + clean unit-change semantics.
   - Upgrade responsive multi-column rules in `SizingSection`, `BoxModelEditor`, `AlignmentSection`, `BorderOutlineSection`, `EffectsFiltersSection`, `AdvancedStyleSections` (switching `grid-cols-3` / `grid-cols-4` cramped `CssUnitInput` rows to `1` or `2` columns based on panel width, and expanding `BoxModelEditor` diagram cells + adding 4-side Margin inputs cleanly).
   - Add targeted unit/component tests for `CssUnitInput` (0, negative, decimals, large numbers, intermediate `"1."`/`"-"`, empty/unset/auto, unit switching, keyboard arrows, narrow width).
3. **Phase 3 — Right Property Inspector:**
   - Widen default desktop `PropertyInspector` to `360–380px` (within `350–390px` spec target, resizable/collapsible).
   - Redesign Element Header (clear title, element type badge, overflow/clean actions), Tab bar (`Content`, `Style`, `Responsive`, `Advanced` localized via `useTranslation()`), and `BreakpointBanner` / `PseudoStateBar` (removing nested cards).
   - Refactor `CollapsibleStyleGroup` to calm visual hierarchy (spacing + subtle dividers instead of heavy bordered boxes) with persisted accordion open state in UI preferences, and hide technical `cssProp` names as muted tooltip/secondary metadata instead of inline label competitors.
   - Localize `PropertyInspector.tsx` and all `property-editor/*` sections into `en.json` and `th.json`.
4. **Phase 4 — Left Library, Toolbar & Canvas Workspace:**
   - Narrow desktop `LeftSidebar` to `272–280px` (within `260–290px` spec target), add persisted panel collapse/expand + optional safe resize handle, and add **Focus Mode** toggle on Canvas/Toolbar to hide both sidebars cleanly without losing selection or canvas scroll.
   - Reorganize `ElementLibraryPanel` (prominent search, scannable category accordions, hover/focus card actions, tooltip/on-demand descriptions instead of constant multi-line walls of text).
   - Refine `HeaderToolbar` visual grouping (navigation/document vs device/view vs save/publish) and unify primary accent tokens.
5. **Phase 5 — Polish & Consistency:**
   - Align `PageManagementPanel`, `AssetLibraryPanel`, `ThemePanel`, `RegionPresetPanel`, `FormCmsInspectorSection`, `Releases` (replacing `window.prompt` inline), reduced-motion support, keyboard navigation, and full Thai/English text-fit check.
6. **Phase 6 — Full Regression & Release Verification:**
   - Re-run `npm run lint`, expanded `npm test`, `npm run build`, and verify every item in the Critical Regression Matrix in a live browser.
