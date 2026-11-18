# Builly Shared Runtime Architecture — Phase 0 Audit Report

**Audit Date:** 2026-11-17  
**Mode:** Phase 0 — Read-Only Codebase & Storage Audit (Zero code or production data modified)  
**Target:** Shared Runtime (Model A) on Cloudflare with Google Drive JSON Config/Assets, Partitioned Google Sheets (CMS / Inbox / System), On-Demand Source Export, and Supabase Auth-Only Identity

---

## 1. Executive Summary

The existing Builly application already enforces **Supabase Auth-only identity** (zero Supabase Database or Storage calls) and models an authentic multi-page Visual Builder, responsive CSS compiler, CMS query engine, and Google Workspace integration. However, **published websites do not yet run on a real Cloudflare Shared Runtime**:

1. **"Published Live Site" is currently an in-app Builder modal** (`PublicSiteModal.tsx`) reading `localStorage` (`SiteDocument` / `site.releases[]`), not a public Cloudflare route serving visitors.
2. **`compilerService.compileRelease()` creates fake Drive/Sheets IDs** (`drv_art_*`, `sheet_snap_*`, `manifest_*`) purely in memory / `localStorage` — no immutable published JSON snapshot is uploaded to Google Drive or registered on Cloudflare.
3. **Security & Privacy Leak in `BuildRelease.cmsSnapshot`:** `compileRelease()` filters `cms.records` to `published`, **but copies `site.cms` wholesale** (`forms` including `destination.spreadsheetId`, `inboxSubmissions`, `inboxNotes`, `inboxActivities`, `operationalLogs`). Exposing this snapshot to a public runtime would leak private Inbox submissions, notes, and private Spreadsheet IDs.
4. **Monolithic Google Spreadsheet:** All Portfolio data, VersionHistory, Inbox tables (`InboxRegistry`, `InboxCategories`, `InboxNotes`, `InboxActivity`, `CONTACT_SUBMISSIONS`), and all `CMS_CONTENT_TYPES` / `CMS_REC_*` tabs currently live in **one combined workbook** (`googleWorkspaceApi.ts` + `cmsWorkspaceAdapter.ts`), rather than partitioned spreadsheets (`Builly/Data/CMS/{site}/`, `Builly/Data/Inbox/{site}/`, `Builly/Data/System/`).
5. **Cloudflare Worker (`worker/`) is currently an OAuth/metadata proxy only** (`/api/health`, `/api/workspace/status`, `/api/google/oauth/*`, `/api/drive/file`, `/api/sheets/meta`). It has no public site resolver, no snapshot repository/cache, no public CMS query endpoint, and no public form submission endpoint.
6. **Live Google Drive Inspection:** Cannot inspect live user Drive folders/files from this local sandbox because no `.env` / live Google OAuth refresh token or authenticated Workspace session exists here. All Drive/Sheets findings below come directly from verified codebase inspection.

---

## 2. Exact Code Path Traces

### 2.1 Builder Document State, Schema & Save/Load
* **Root Types:** `src/types/builder.ts`
  * `SiteDocument` (`portfolioSlug`, `pages[]`, `activePageId`, `globalComponents`, `libraryItems`, `assets`, `themeConfig`, `cms`, `releases[]`, `activeReleaseVersion`, `pageRegistryRevision`, `pageRegistryDriveFileId`).
  * `PageDocument` (`id`, `name`, `slug`, `parentPageId`, `isHome`, `navigation`, `status`, `layout: { header, footer }`, SEO fields `title`/`description`/`noIndex`, `revision`, `driveFileId`, `customCss`, `customJs`, `rootElement: ElementNode`).
  * `ElementNode` (`id`, `type`, `name`, `tag`, `content`, `styles`, `responsiveStyles?: { tablet, mobile }`, `pseudoStyles`, `responsivePseudoStyles`, `advanced`, `dynamicBinding`, `componentRef`, `children`).
* **Local Persistence:** `src/services/storageService.ts`
  * Canonical draft saves synchronously to browser `localStorage` under `indyshares_portfolio_site_v2` (`saveSiteDraft`, line 12 / `loadSiteDraft`).
  * Google Workspace connection metadata/tabs cache saves under `indyshares_google_workspace_v2` (tokens stripped; OAuth access token stays in-memory/worker session).
* **Google Drive Draft Registry:** `src/services/drivePageRegistryService.ts` + `src/App.tsx` (`executeDriveSync` line 2742, `executeDriveLoad` line 2786)
  * Root folder name resolved via `ENV_CONFIG.driveFolderName` (`src/config/env.ts:50`, default `'Builly'`).
  * Flat Drive layout today: `<Builly>/indyshares-pages-registry.json` + `<Builly>/page-<pageId>.json` per page.
  * Optimistic concurrency check via `pageRegistryRevision` (`DriveConcurrencyError`).
  * **Gap vs Target:** Target `Builly/Sites/{site-slug}/Config/Draft/` hierarchy (`site.config.json`, `pages/*.json`, `theme.json`, `components.json`, `cms-bindings.json`, `forms.json`) does not exist yet; current sync is manual and flat inside `/Builly/`.

### 2.2 Component Registry, Responsive Styles & CSS Compilation
* **Element Catalog:** `src/data/elementRegistry.ts` defines ~47 element types across 8 families (`layout`, `basic`, `media`, `navigation`, `forms`, `portfolio`, `dynamic`, `advanced`), plus `HEADER_ROOT` / `FOOTER_ROOT` / region wrappers.
  * Dynamic CMS widgets: `post-grid`, `post-list`, `post-carousel`, `post-slider`, `slide-carousel`, `custom-carousel`, `media-carousel`, `taxonomy-list`, `taxonomy-filter`, `content-counter`, `cms-pagination`, `related-content`, `dynamic-text`, `dynamic-image`, `dynamic-link`, `dynamic-icon`, `repeater`.
  * Legacy/Embed risk nodes: `html-embed` (`content.htmlCode`) and `PageDocument.customCss` / `PageDocument.customJs`. Note: `cssCompiler.ts:132–219` (`extractEmbeddedHtmlAndCss`, `buildIsolatedEmbedSrcDoc`) isolates `<style>`/`<script>` inside sandboxed `<iframe sandbox="allow-scripts allow-forms">` in Editor/Preview, but **Shared Runtime contract strictly forbids executing arbitrary JS (`customJs` / inline scripts) from published JSON config**.
* **Global Components & Layouts:** `src/services/componentLibraryService.ts`
  * `resolvePageSlotComponent(page, site, 'header' | 'footer')` implements canonical resolution (`none` | `local` | `global` + `enabled` + `responsiveVisibility`).
  * `libraryItems` supports `independent` and `linked` component instances (`componentRef.mode === 'linked'`).
* **Responsive Cascade:** `src/config/breakpoints.ts` & `src/services/responsiveStyleModel.ts`
  * Desktop-first cascade: Desktop (base `1024px+`) -> Tablet (`768px–1023px`) -> Mobile (`<=767px`), for both default and pseudo-states (`hover`, `focus`, `focus-visible`, `active`, `disabled`).
* **CSS Compiler:** `src/services/cssCompiler.ts`
  * Compiles scoped site/page CSS (`.portfolio-site-surface`), CSS theme variables (`--color-*`, `--font-*`, `--theme-radius`), and responsive `@media` queries deterministically from `SiteDocument` + `PageDocument`.
* **Renderer:** `src/components/builder/ElementRenderer.tsx` + `src/components/builder/CmsDynamicWidgets.tsx`
  * Shared React renderer currently used for **both** Builder Canvas (`isEditor=true`) and `PublicSiteModal` (`isEditor=false`).
  * **Gap:** `ElementRenderer.tsx` currently imports Builder drag-and-drop (`BuilderDragContext`, `treeCommandService`) and Lucide editor chrome alongside runtime rendering. For Cloudflare Shared Runtime, public rendering should either cleanly tree-shake/split editor-only drag/toolbar dependencies from the runtime renderer or share a pure runtime rendering core.

### 2.3 Routing, Preview vs Publish, and Rollback
* **Client Router:** `src/utils/routes.ts` & `src/AppRouter.tsx`
  * Only recognizes `'landing'` (`/`), `'login'` (`/login`), `'auth-callback'` (`/auth/callback`), `'workspace'` (`/workspace`), and `'builder'` (`/builder`, `/editor`, `/app`).
  * Any unknown path falls back to `'landing'` (`src/utils/routes.ts:47`).
  * **No public site route** (e.g., `/{site-slug}/*` on `builly.indyshares.com` or custom hostname dispatch) exists anywhere in `src/` or `worker/`.
* **Publish Flow:** `src/components/modals/PublishModal.tsx` -> `src/services/compilerService.ts:compileRelease()` -> `src/App.tsx:3935` (`onPublishSuccess`)
  * `PublishModal.tsx:81–103` runs **simulated** 500ms `setTimeout` progress steps, then calls `compileRelease()` synchronously in browser memory.
  * `compileRelease()` validates pages/navigation/CMS routes/relations (`validatePrePublish`), builds `compiledPages[fullPath]` (tree + headerTree + footerTree + compiledCss), `cmsGeneratedRoutes`, `sitemapXml`, and `cmsSnapshot`.
  * **CRITICAL GAP #1 (Fake Persistence):** `compileRelease()` assigns fabricated ID strings (`compilerService.ts:514–532`):
    * `artifact_url: "drv_art_${Date.now()}_${version}"`
    * `snapshot_id: "sheet_snap_${Date.now()}"`
    * `manifest_url: "manifest_${Date.now()}_${version}"`
    * Nothing is written to Drive (`Builly/Sites/{site}/Config/Published/build_xxxx/`) or registered on Cloudflare. Releases live only inside browser `localStorage` (`site.releases[]`) and optional client-side `VersionHistory` tab rows (`syncVersionHistoryTab`, `src/App.tsx:2840`).
  * **CRITICAL GAP #2 (Secret/Private Data Leak in `cmsSnapshot`):** `compilerService.ts:491–498` spreads `...site.cms`, only filtering `records` to `status === 'published'`:
    * `forms[]` retains `destination.spreadsheetId` & `driveFolderId`.
    * `inboxSubmissions[]`, `inboxNotes[]`, `inboxActivities[]`, `operationalLogs[]`, and unpublished field metadata (`publiclyExposed === false` isn't stripped inside `cmsSnapshot` unless `sanitizePublicRecord` is explicitly called per query) remain inside `BuildRelease.cmsSnapshot`.
* **Live Preview Modal:** `src/components/modals/PublicSiteModal.tsx`
  * Renders inside Builder modal using `site.releases.find(r => r.version === activeVersion)` or live draft (`previewDrafts` toggle at line 52). Visitors cannot access this externally.

### 2.4 CMS, Dynamic Queries & Form Submissions (Inbox)
* **CMS Schema & Query Engine:** `src/types/cms.ts`, `src/services/cms/cmsQueryEngine.ts`
  * Supports `contentTypes`, `fields` (with `publiclyExposed?: boolean`), `taxonomies`, `terms`, `relationships`, `richDocs`, `records`, and `forms`.
  * `cmsQueryEngine.ts:106` (`sanitizePublicRecord`) strips fields with `publiclyExposed === false` and enforces `published`-only status in `public_build` mode (`line 139`).
* **CMS Workspace Adapter:** `src/services/cms/cmsWorkspaceAdapter.ts`
  * Writes Drive files under `/Builly/CMS/cms-manifest.json` and `/Builly/CMS/RichContent/rich_<recordId>_<fieldKey>.json`.
  * Writes all CMS metadata & records as tabs inside the **single** `workspace.spreadsheet.id` (`CMS_CONTENT_TYPES`, `CMS_TAXONOMIES`, `CMS_TERMS`, `CMS_RELATIONSHIPS`, `CMS_RECORD_TERMS`, `CMS_RECORD_RELATIONS`, `CMS_SETTINGS`, plus `CMS_REC_<TYPE>` per content type).
* **Form Submission / Inbox Path:** `src/App.tsx:3085` (`handleFormSubmission`)
  * Currently assumes **owner context inside Builder/Preview** (`PublicSiteModal` passes `onSubmitForm={handleFormSubmission}`).
  * Updates `workspace.spreadsheet.tabs` locally (`CONTACT_SUBMISSIONS` + `InboxRegistry`), updates `site.cms.inboxSubmissions` & `inboxActivities` in `localStorage`, and performs a best-effort client-side `saveTabsToSpreadsheet(getGoogleAccessToken(), ...)` if the owner happens to be signed into Google.
  * **Gap:** A real public website visitor has **zero Google OAuth token** and must never touch `workspace.spreadsheet.id`. There is no backend `POST /api/public/sites/:slug/forms/:formId/submit` endpoint on Cloudflare Worker using encrypted owner credentials (`workspace_credentials` in D1) + rate limiting + idempotency + destination resolution.

### 2.5 Google Workspace, Spreadsheets & Drive Structure
* **Monolithic Workbook Schema:** `src/services/googleWorkspaceApi.ts:13–149` (`PORTFOLIO_SHEET_SCHEMA`)
  * Combines **Portfolio** (`META`, `PROFILE`, `PROJECTS`, `SKILLS`, `EXPERIENCE`, `EDUCATION`, `SOCIAL_LINKS`), **Releases** (`VersionHistory`), **Inbox** (`InboxRegistry`, `InboxCategories`, `InboxNotes`, `InboxActivity`, `CONTACT_SUBMISSIONS`), and via `cmsWorkspaceAdapter.ts` all **CMS** tabs (`CMS_*`) into **one Google Spreadsheet** (`Builly Portfolio`).
* **Asset Storage:** `src/services/assetService.ts:325–456`
  * Magic-byte inspection + SVG sanitization (`sanitizeSvgMarkup`).
  * When `accessToken` is present, uploads blobs to Google Drive `/Builly/Assets/{Images|Logos|Icons|Media|Fonts|Documents|Other}` and records `driveFileId`, **but** still stores `url` as inline base64 `data:` URI (`readFileAsDataUrl` at line 404) inside `SiteDocument.assets[]` and element nodes!
  * **Gap:** Base64 data URIs bloat JSON config snapshots and won't work cleanly with CDN caching; public runtime needs a safe Drive public asset proxy / URL resolver (`/api/public/sites/:siteSlug/assets/:assetId` or cacheable media route) that streams verified public site assets without exposing owner Drive tokens or non-site Drive files.
* **Drive Inspection Status (Honest Reporting):**
  * Codebase expects root folder `/<ENV_CONFIG.driveFolderName>` (`Builly`), flat page JSONs (`indyshares-pages-registry.json`, `page-*.json`), `/Builly/CMS/cms-manifest.json`, `/Builly/CMS/RichContent/*.json`, and `/Builly/Assets/<Category>/`.
  * **Actual live Google Drive / Sheets contents could NOT be inspected** in this audit because no live owner Google OAuth session, D1 `workspace_credentials`, or `.env` secrets exist in the local build sandbox.

### 2.6 Supabase Usage Verification
* Verified via codebase search (`grep` across `src/` and `worker/`):
  * `src/features/identity/` (`supabaseClient.ts`, `AuthContext.tsx`) and `worker/src/middleware/requireSession.ts` use Supabase **strictly for owner authentication/session verification** (`supabase.auth.getSession`, `getUser`, `signInWithOAuth`, `signOut`, `/auth/v1/user`).
  * **Zero** calls to `supabase.from(...)`, Supabase PostgreSQL, or `supabase.storage` exist anywhere in the repository. Owner Decision #9 is already respected.

### 2.7 Cloudflare Worker & Caching
* **Current Worker (`worker/src/index.ts`, `worker/wrangler.toml`, `worker/migrations/0001_workspace_oauth.sql`):**
  * Routes: `/api/health`, `/api/workspace/status`, `/api/google/oauth/start`, `/api/google/oauth/callback`, `/api/google/oauth/disconnect`, `/api/drive/file`, `/api/sheets/meta`.
  * D1 database (`DB`) stores **only** `oauth_states` and encrypted owner refresh tokens (`workspace_credentials`, AES-256-GCM via `googleTokenVault.ts`).
  * **Zero** Cloudflare Cache API (`caches.default`), KV, or public runtime routes exist yet.
  * **Note on Owner-to-Site Resolution for Public Requests:** Since visitors do not carry a Supabase Auth JWT, Shared Runtime must map incoming `hostname + siteSlug` -> `{ site_id, owner_id, active_publish_version, publish_manifest_drive_file_id, snapshot_drive_file_id, status }` in a trusted **Server-Side Site & Resource Registry** (e.g., `Builly/Data/System/` spreadsheets synced/cached in Cloudflare or a lightweight trusted lookup index) so the Worker knows **which `owner_id`'s encrypted refresh token in D1** to mint to read that site's **explicitly registered** Drive snapshot / CMS Sheets / Inbox Sheets — without ever scanning the owner's Drive or exposing tokens.

### 2.8 Source Export & Download
* **Implementation:** `src/components/modals/ExportModal.tsx`
  * Completely optional (`ExportModal` is independent of `PublishModal` / `PublicSiteModal`).
  * **Gaps vs Target (`SOURCE_EXPORT_AND_DOWNLOAD.md`):**
    * Currently exports **only the single active page** as one standalone `.html` file (`handleDownloadHtmlPackage`) or a raw `localStorage` JSON backup (`handleDownloadJson`), not a full multi-page ZIP (`index.html`, `pages/*.html`, `styles/`, `scripts/`, `assets/`, `export-manifest.json`).
    * `renderNodeToStaticHtml` (`lines 25–147`) handles only ~15 basic element types (`heading`, `text`, `rich-text`, `label`, `button/link/anchor-link`, `list`, `blockquote`, `code`, `logo`, `navbar/nav-menu/breadcrumbs/pagination/social-links`, `image`, `svg-graphic`, `html-embed`, `data-table`) and emits placeholder divs for CMS widgets (`data-indy-cms-widget`) without bundling forms, assets, or multi-page routing.

---

## 3. Target-vs-Current Gap & Risk Matrix

| Area | Target Architecture Requirement | Current Codebase State | Risk / Severity |
|---|---|---|---|
| **Runtime Hosting & Routing** | One shared Cloudflare Runtime serving all published sites (`builly.indyshares.com/{site-slug}` + future custom domains) | Only Builder/Landing SPA (`routes.ts`); published view is in-app modal (`PublicSiteModal`) | **Critical** — No live public websites exist |
| **Published Snapshot Persistence** | Immutable validated JSON snapshot saved to Drive (`Published/build_xxxx/`) + atomic active pointer switch | `compileRelease()` generates fake string IDs (`drv_art_*`, `sheet_snap_*`) in `localStorage` only | **Critical** — Publish does not persist remotely |
| **Draft vs Public Isolation** | Visitors only read immutable published snapshot; drafts never visible | `PublicSiteModal` has `previewDrafts` flag & reads mutable `SiteDocument` | **High** — Must strictly separate runtime loader |
| **Snapshot Secret / Inbox Stripping** | Snapshot excludes tokens, private Spreadsheet IDs, Inbox data, notes, private CMS fields | `BuildRelease.cmsSnapshot` copies entire `site.cms` (`inboxSubmissions`, `inboxNotes`, `forms[].destination.spreadsheetId`) | **Critical Security Leak** if snapshot is served to visitors |
| **Spreadsheet Partitioning** | Separate Spreadsheets under `Builly/Data/CMS/{site}/`, `Inbox/{site}/`, `System/` | One monolithic workbook (`PORTFOLIO_SHEET_SCHEMA` + `CMS_*` + `Inbox*`) | **High** — Scaling, quota, & blast-radius risk |
| **Public CMS Data API** | Worker loads only referenced public dataset via backend registry + field allowlist + cache | `cmsQueryEngine` runs client-side on full in-memory `SiteDocument.cms` | **High** — Cannot expose whole workbook/unpublished rows |
| **Public Form Submission** | Protected Worker endpoint resolves `formId` -> server destination, rate-limits, idempotency, writes Inbox Sheets | `handleFormSubmission` uses owner browser OAuth token & local tabs cache | **Critical** — Broken for anonymous public visitors |
| **Assets Delivery** | Drive assets served safely via public asset proxy / URL resolution (avoid bloated base64 in snapshots) | Base64 `data:` URLs embedded in `SiteDocument.assets[]` alongside Drive upload | **Medium** — Snapshot size & cache efficiency |
| **Runtime JS / Config Safety** | Declarative config only; never execute arbitrary JS from JSON (`eval`, `customJs`, unsafe HTML) | `PageDocument.customJs` exists on type; `html-embed` uses sandboxed iframe in preview | **High** — Enforce sanitization & strip arbitrary JS |
| **Cloudflare Caching & Invalidation** | Versioned immutable config cache + bounded TTL CMS cache invalidated on publish/update | Zero `caches.default` / cache headers in `worker/` | **Medium** — Quota & latency against Google APIs |
| **On-Demand Source Export** | Multi-page ZIP generated only on owner download request (never runtime dependency) | Single active page `.html` download (`ExportModal.tsx`) | **Low/Medium** — Deferred to Phase 5 |

---

## 4. Recommended Incremental Migration Strategy (Pending Owner Approval)

Following `MIGRATION_AND_ACCEPTANCE_PLAN.md`, work should proceed in guarded phases without breaking existing Builder editing, local drafts, CMS, or Inbox:

1. **Phase 1 — Shared Runtime Foundation & Trusted Registry (Staging-First):**
   * Extend `worker/` with a server-side **Site & Resource Registry** (mapping `siteSlug` / hostname -> `siteId`, `ownerId`, `activeVersion`, `publishedManifestDriveFileId`, `status`) backed by `Builly/Data/System/` (and short-TTL D1/Worker cache strictly as an ephemeral lookup cache or Drive-backed registry, respecting canonical storage boundaries).
   * Add public runtime API routes on Worker (`/api/public/sites/:siteSlug/runtime`, `/api/public/sites/:siteSlug/cms/query`, `/api/public/sites/:siteSlug/forms/:formId/submit`, `/api/public/sites/:siteSlug/assets/:assetId`).
   * Add a lightweight public Runtime entrypoint (`SiteRuntimePage` / route handler when path matches a published site slug or `?runtimeSite=` in staging) reusing a clean, editor-free rendering pipeline + `cssCompiler`.
2. **Phase 2 — Published Configuration Contract & Secret-Safe Sanitizer:**
   * Introduce an explicit `PublishedRuntimeSnapshot` schema (`schemaVersion`, `runtimeMinVersion`, `siteId`, `publishVersion`, `integrityHash`, `routes`, `pages`, `themeConfig`, `globalComponents`, sanitized `publicCmsConfig` without `inboxSubmissions`/`inboxNotes`/private fields/`spreadsheetId`, sanitized `publicForms` without `destination`).
   * Keep `SiteDocument` (Builder Editor model) completely intact; compile `PublishedRuntimeSnapshot` cleanly from `SiteDocument`.
3. **Phase 3 — Partitioned Sheets & Backend Data Services:**
   * Implement partition provisioning & migration tooling (with explicit dry-run inventory, backup, and staging verification before touching any production combined workbook) splitting `Builly/Data/CMS/{site}/`, `Builly/Data/Inbox/{site}/`, and `Builly/Data/System/`.
   * Route public CMS queries and public form submissions strictly through Worker backend registries with allowlists, rate limiting, and idempotency keys.
4. **Phase 4 — Immutable Drive Publish, Atomic Pointer Switch & Cloudflare Cache:**
   * Wire `PublishModal` to real backend/Drive upload (`Builly/Sites/{site-slug}/Config/Published/build_xxxx/runtime-config.json` + `publish-manifest.json`), verify readback & compatibility, atomically update active version pointer, invalidate Cloudflare caches, and support true rollback to previous `build_xxxx` Drive snapshots.
5. **Phase 5 — Multi-Page On-Demand Source Export ZIP:**
   * Upgrade `ExportModal` to generate a complete multi-page HTML/CSS/JS/assets ZIP on explicit owner request, excluding secrets/Inbox data.
6. **Phase 6 — Security, Performance & Regression Suite:**
   * Automated tests covering multi-site isolation, draft non-leakage, field allowlists, form destination tamper protection, cache invalidation, and full Builder/CMS regression.

---

## 5. Questions & Approval Gate

Before starting **Phase 1** design/implementation, please review and approve:
1. **Audit findings & gap matrix** above.
2. **Site Registry lookup design on Cloudflare:** To resolve `builly.indyshares.com/{site-slug}` -> `{ ownerId, publishManifestDriveFileId }` on anonymous visitor requests without scanning Drive or querying Supabase DB, is it approved for Cloudflare Worker to maintain a small runtime routing index (synced from `Builly/Data/System/Sites` + `SiteDomains` spreadsheets on publish/domain change and cached via Cloudflare Cache/KV)?
3. **Public URL pattern during staging & production:** Should staging/local preview resolve published sites at `/s/{site-slug}/*` (or `/{site-slug}/*` excluding reserved routes `/login`, `/workspace`, `/builder`, `/editor`, `/app`, `/api/*`), matching `builly.indyshares.com/{site-slug}`?
4. Confirm permission to proceed to **Phase 1 — Shared Runtime Foundation** (and verify if you want live Google Drive inspection run once an owner session is connected in staging).
