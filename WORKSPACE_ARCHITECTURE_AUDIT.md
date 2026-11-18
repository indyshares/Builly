# Builly Workspace Architecture — Phase 0 Audit & Gap Report

> **Audit Mode**: Read-only codebase inspection + local unit test verification (`vitest run`).  
> **Non-Destructive Guarantee**: Zero source files, schemas, routes, OAuth scopes, or user/production records were modified during this audit.  
> **Honesty & Evidence Policy**: Every claim below cites verified files, symbols, and outputs observed directly in this workspace. Remote runtime states (live Supabase Auth project, live Cloudflare Worker/D1 deployment, live Google Drive folder contents) cannot be queried from this sandbox and are marked `UNKNOWN`.

---

## 1. Current Architecture Diagram

```text
+-----------------------------------------------------------------------------------+
| Browser SPA (React 19 + Vite + Tailwind + i18next EN/TH)                          |
|                                                                                   |
|  Routes (src/utils/routes.ts, src/AppRouter.tsx):                                 |
|   - /                          -> LandingPage (CTA -> /builder or /workspace)     |
|   - /login, /auth/callback     -> LoginPage (Supabase PKCE Google Sign-In)        |
|   - /workspace                 -> WorkspaceConnectPage (Worker OAuth Connect UI)  |
|   - /builder, /editor, /app    -> App (Monolithic Visual Builder + Modals)        |
|       |-- CmsWorkspaceModal    -> CMS + Forms + Inbox inside Builder ONLY         |
|       |-- AssetLibraryPanel    -> Assets inside Builder Left Sidebar ONLY         |
|       |-- PublishModal         -> Shared Runtime Publish / Rollback               |
|       |-- ExportModal          -> On-demand ZIP/JSON/HTML Source Export           |
|   - /{site_slug}/*, /s/{slug}/*-> PublicSiteRuntimePage (Shared Runtime Renderer) |
|                                                                                   |
|  Browser Persistence & Tokens:                                                    |
|   - localStorage['indyshares_portfolio_site_v2']     -> Single SiteDocument JSON  |
|   - localStorage['indyshares_google_workspace_v2']   -> Workspace UI/tab metadata |
|   - Memory-only GIS Access Token (googleAuthService) -> Direct Browser Google API |
+-----------------------+-----------------------------------+-----------------------+
                        |                                   |
      Supabase JWT      |                                   | GIS Bearer Token (in-memory)
      (Identity Only)   v                                   v
+---------------------------------------+     +-------------------------------------+
| Supabase Auth (@supabase/supabase-js) |     | Google Drive & Sheets REST APIs     |
| - Identity/Session ONLY               |     | (Called directly by Browser SPA &    |
| - 0 Postgres tables / 0 Storage used  |     |  by Cloudflare Worker server-side)  |
+---------------------------------------+     +-------------------------------------+
                        |                                   ^
      HTTPS Bearer JWT  |                                   | Minted Server Access Token
                        v                                   |
+-----------------------------------------------------------------------------------+
| Cloudflare Worker (worker/src/index.ts) + Cloudflare D1 + Cloudflare Cache        |
|                                                                                   |
|  Migrations:                                                                      |
|   - 0001_workspace_oauth.sql        -> oauth_states, workspace_credentials (AES)  |
|   - 0002_shared_runtime_registry.sql-> site_registry, site_release_history,       |
|                                        site_dataset_resources,                    |
|                                        site_form_destinations,                    |
|                                        form_submission_idempotency,               |
|                                        runtime_rate_limits                        |
|  Endpoints:                                                                       |
|   - /api/workspace/status, /api/google/oauth/{start,callback,disconnect}          |
|   - /api/drive/file (GET meta), /api/sheets/meta (GET meta)                       |
|   - /api/owner/sites/:slug/{publish,rollback}                                     |
|   - /api/public/sites/* (resolve, runtime, cms/query, forms/:id/submit, assets)   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Route Inventory & Compatibility Notes

Verified in `src/utils/routes.ts` (`resolveAppRouteKind`, `resolvePublicSiteFromPath`, `getCurrentRouteState`) and `src/AppRouter.tsx` (`RouterContent`):

| Route Pattern | Kind | Target Component | Auth Requirement | Target Compatibility Notes |
|---|---|---|---|---|
| `/` | `landing` | `LandingPage` (`src/pages/LandingPage.tsx`) | Public | **PARTIAL**: Primary CTA calls `onNavigate('/builder')` when authenticated (`LandingPage.tsx:90`) or `signInWithGoogle('/workspace')` when signed out (`LandingPage.tsx:100`). Target requires landing primary entry to lead to **Console** (`/console`). |
| `/?page=...`, `/?builder=...`, `/?tab=...` | `builder` | `App` (`src/App.tsx`) | `isConfigured ? authenticated : localPreview` | Legacy deep-link query support (`routes.ts:114-118`). Keep backward-compatible redirect/alias to default Project Builder. |
| `/login` | `login` | `LoginPage` (`mode="login"`) | Public | `returnTo` defaults to `'/workspace'` (`AppRouter.tsx:35`, `LoginPage.tsx:48`). Should default post-login `returnTo` to `'/console'`. |
| `/auth/callback` | `auth-callback` | `LoginPage` (`mode="callback"`) | Public | Exchanging Supabase PKCE code (`completeAuthCallback`). Compatible; preserves `consumePendingReturnTo()`. |
| `/workspace`, `/connect-workspace` | `workspace` | `WorkspaceConnectPage` | Authenticated owner | Account-level Google Workspace OAuth setup (`AppRouter.tsx:57-90`). Needs compatibility alias or integration into Console / Account Settings / Org Workspace Settings. |
| `/builder`, `/editor`, `/app` (+ subpaths) | `builder` | `App` (Visual Builder) | Authenticated (or unconfigured local draft) | Unscoped single-site Builder (`AppRouter.tsx:92-168`). Target requires project-scoped Builder route (e.g., `/console/organizations/:orgId/projects/:projectId/builder`), while keeping `/builder` as a backward-compatible alias redirecting/opening the active default project. |
| `/{site_slug}/*` | `public-site` | `PublicSiteRuntimePage` | Public | Reserved first segments (`RESERVED_FIRST_SEGMENTS` in `routes.ts:22-33`) block `/login`, `/auth`, `/workspace`, `/connect-workspace`, `/builder`, `/editor`, `/app`, `/api`, `/assets`, `/static`. **CRITICAL**: `'console'`, `'orgs'`, `'organizations'`, `'projects'`, `'cms'`, `'inbox'`, `'settings'` are **NOT** in `RESERVED_FIRST_SEGMENTS` yet and would currently be misrouted as a public site slug! |
| `/s/{site_slug}/*` | `public-site` | `PublicSiteRuntimePage` | Public | Explicit staging prefix (`routes.ts:61-67`). Fully compatible. |
| `/console` & module routes (`/cms`, `/inbox`, `/assets`, `/publishing`, `/versions`, `/settings`, `/team`, etc.) | — | **Does not exist** | — | **MISSING**: No Console, Organization management, Project Dashboard, or standalone module routes exist. |

---

## 3. Current Entity & Data Model Inventory

Verified in `src/types/builder.ts`, `src/types/cms.ts`, `worker/migrations/*.sql`:

| Entity | Where Defined | Key Fields & Responsibilities | Architectural Assessment vs Target |
|---|---|---|---|
| `BuillyOwnerIdentity` | `src/features/identity/authService.ts` | `ownerId` (Supabase `user.id`), `email`, `displayName`, `avatarUrl`, `provider` | Maps cleanly to **`Account`**, though no persisted Account profile/preferences record exists in DB or Drive yet. |
| `Organization` / `OrganizationMember` | — | **Not implemented** | **MISSING**: No `Organization`, `org_slug`, `role`, `drive_root_folder_id`, or `workspace_oauth` link to orgs. |
| `Project` / `ProjectModule` | — | **Not implemented** | **MISSING**: No `Project` entity separate from `SiteDocument`. No module enablement registry (`builder`, `cms`, `inbox`, `assets`, `publishing`, `versions`, `settings`, etc.). |
| `SiteDocument` | `src/types/builder.ts:831-856` | Monolithic root object holding: `id`, `name`, `portfolioSlug`, `activeThemeId`, `themeConfig`, `globalComponents`, `libraryItems`, `pages`, `savedBlocks`, **`mediaAssets`**, **`releases`**, **`cms`** (`CmsDocument`) | **INCOMPATIBLE**: Conflates Site, Project, CMS workspace, Inbox, Media Assets, and Release History into one `SiteDocument` persisted in one `localStorage` key (`indyshares_portfolio_site_v2`). |
| `PageDocument` & `ElementNode` | `src/types/builder.ts` | Visual page tree, responsive overrides, SEO metadata, `driveFileId`, `revision` | Compatible as Builder/Site page config inside a Project's Builder/Site scope. |
| `CmsDocument` | `src/types/cms.ts:284-303` | `contentTypes`, `records`, `taxonomies`, `terms`, `relationships`, `richDocs`, `migrationLog`, `operationalLogs`, `storageHealth`, `settings`, PLUS **`forms`**, **`inboxSubmissions`**, **`inboxCategories`**, **`inboxNotes`**, **`inboxActivities`** | **PARTIAL / COUPLED**: Clean structured CMS schema (`cmsService.ts`), but **bundled inside `SiteDocument.cms`** and also owns Inbox records & forms instead of treating Project CMS and Project Inbox as sibling Project modules sharing canonical services. |
| `MediaAsset` | `src/types/builder.ts:761-781` | `id`, `name`, `url` (frequently inline Base64 `data:` URI in localStorage!), `category`, `svgSanitized`, `driveFileId`, `driveFolder` | **PARTIAL**: Stored inside `SiteDocument.mediaAssets` rather than a Project Asset registry. |
| `BuildRelease` | `src/types/builder.ts:715-750` | `version`, `build_id`, `status`, `driveFileId`, `manifestDriveFileId`, `compiledPages`, `runtimeSnapshotJson` | **PARTIAL**: Attached to `SiteDocument.releases`; should belong to the Site / Publishing & Version History module attached to a Project. |
| Worker D1 `workspace_credentials` | `worker/migrations/0001_workspace_oauth.sql:16-28` | Keyed by `owner_id PRIMARY KEY` (`google_subject`, `google_email`, encrypted refresh token, `granted_scopes`, `status`) | **PARTIAL**: Bound strictly to 1:1 `owner_id`, not `organization_id` (cannot support per-Organization workspace connections or team RBAC cleanly without migration). |
| Worker D1 `site_registry`, `site_release_history`, `site_dataset_resources`, `site_form_destinations` | `worker/migrations/0002_shared_runtime_registry.sql:5-71` | Keyed by `site_id` / `site_slug` + `owner_id`. Tracks active published snapshot pointers, dataset spreadsheet IDs (`cms` / `inbox` / `system`), form destinations | **PARTIAL**: Good non-canonical pointer design for Shared Runtime, but lacks `organization_id` and `project_id` foreign columns and lacks `organizations`, `projects`, `project_modules`, `sites` separation. |

---

## 4. Current Supabase & Firebase Responsibilities and Usage

Verified via codebase-wide search (`grep` across `src/`, `worker/`, `package.json`, `.`) and direct inspection of `src/features/identity/*`, `src/config/env.ts`, `worker/src/middleware/requireSession.ts`:

- **Firebase Usage**: **ZERO**. No `firebase` or `@firebase/*` dependencies in `package.json`, no `firebase-applet-config.json`, zero references to Firestore/Firebase Auth anywhere in `src/` or `worker/`. (Safe to consider Firebase non-existent; no Firebase migration needed.)
- **Supabase Usage**: **Authentication / Identity ONLY** (`@supabase/supabase-js` `^2.119.0`).
  - Frontend (`src/features/identity/supabaseClient.ts`, `authService.ts`, `AuthContext.tsx`): Uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` for PKCE Google Sign-In, session restore, `onAuthStateChange`, and `signOut`. Produces `BuillyOwnerIdentity` and `session.access_token`.
  - Backend Worker (`worker/src/middleware/requireSession.ts:7-75`): Verifies Bearer JWT via `GET ${SUPABASE_URL}/auth/v1/user` to obtain authoritative `ownerId` (`user.id`) and `email`.
  - **Supabase Database & Storage**: **ZERO usage**. No Supabase SQL schema, no PostgREST queries (`supabase.from(...)`), no Supabase Storage (`supabase.storage`) anywhere in the repo.
- **Note on Backend Registry Store**: Cloudflare D1 (`env.DB`) currently serves as the Worker's relational metadata/pointer store (`0001_workspace_oauth.sql` & `0002_shared_runtime_registry.sql`), while Supabase Auth provides user identity. Target specs allow Account/Org/Project/Module metadata in Supabase DB or D1 while keeping Google Drive/Sheets canonical for user content, config, CMS, Inbox, and assets.

---

## 5. Current Google OAuth, Drive & Sheets Flows and Token Handling

Verified across `src/features/workspace-connection/workspaceApiClient.ts`, `worker/src/routes/googleOAuth.ts`, `worker/src/services/googleTokenVault.ts`, `src/services/googleAuthService.ts`, and `src/App.tsx`:

There are **two separate, disconnected Google Workspace OAuth mechanisms** in the codebase right now:

1. **Server-Side Worker OAuth Vault (`worker/src/routes/googleOAuth.ts`, `workspaceApiClient.ts`) — SECURE**
   - Triggered from `/workspace` (`WorkspaceConnectPage.tsx`).
   - Browser calls `POST /api/google/oauth/start` with Supabase Bearer JWT.
   - Worker generates PKCE (`code_verifier`, `S256`) + CSRF `state_hash` stored in D1 `oauth_states`.
   - Google redirects to Worker `/api/google/oauth/callback`; Worker exchanges code for `refresh_token`, encrypts with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) into D1 `workspace_credentials` keyed by `owner_id`, and redirects to `/workspace?workspace=connected`.
   - **Token safety**: OAuth `access_token` and `refresh_token` are **never returned to the browser** (`getSafeWorkspaceStatus` returns only email/displayName/avatar/scopes).
   - **Usage limitation**: Worker currently only uses `mintOwnerGoogleAccessToken()` for `/api/drive/file`, `/api/sheets/meta`, `/api/owner/sites/:slug/publish`, `/api/owner/sites/:slug/rollback`, `/api/public/sites/:slug/runtime`, `/api/public/sites/:slug/cms/query`, `/api/public/sites/:slug/forms/:formId/submit`, and `/api/public/sites/:slug/assets/:assetId`.

2. **Client-Side GIS Implicit Token Flow (`src/services/googleAuthService.ts`) — IN-MEMORY BROWSER TOKEN**
   - Used inside `App.tsx` Builder (Google Setup modal, Drive page sync, CMS sync/pull, Sheets sync/read/create, Asset Drive upload, `partitionedWorkspaceService.ts`).
   - Uses Google Identity Services `initTokenClient()` (`signInWithGoogleWorkspace()`). Token lives in module-scoped RAM (`cachedAccessToken`) with expiry timer; never stored in `localStorage`.
   - **Architectural Gap**:
     - If an owner connects Google Workspace via the Worker on `/workspace` (`workspaceApiClient`), **Builder's client-side Drive/Sheets/CMS sync functions (`getGoogleAccessToken()`) STILL show disconnected** unless the user ALSO runs the client-side GIS popup flow!
     - Conversely, `publishSiteToSharedRuntime` (`src/services/runtime/publishRuntimeClient.ts`) uses the **client GIS token** to upload `runtime-config.json` & `publish-manifest.json` from the browser to Drive OR passes `snapshot` to Worker `POST /api/owner/sites/:slug/publish` (which requires the Worker `workspace_credentials` refresh token).
     - Calling Google Drive/Sheets directly from browser with `accessToken` violates the target principle that **all Workspace Drive/Sheets mutations should move server-side (or behind Worker proxy)** bound to Org/Account OAuth Vault without exposing OAuth tokens to the browser.

3. **OAuth Scopes (`src/config/env.ts:1-5`, `worker/wrangler.toml:6`)**:
   - Currently: `spreadsheets`, `drive.file`, `drive.metadata.readonly`.
   - Safe & minimal (`drive.file` restricts access to app-created/picked files; never `drive` full-scan).

---

## 6. Current Folder/Resource Provisioning & Duplicate-Prevention Behavior

Verified in `src/services/drivePageRegistryService.ts`, `src/services/cms/cmsWorkspaceAdapter.ts`, `src/services/partitionedWorkspaceService.ts`, `src/services/googleWorkspaceApi.ts`, `worker/src/routes/ownerPublish.ts`:

- **Drive Root Folder**: Configured by `ENV_CONFIG.driveFolderName` (`"Builly"` in `.env.example`, though `registryFileName` is still `'indyshares-pages-registry.json'`).
- **Three Competing Folder Layouts Currently Exist**:
  1. **Legacy Page Registry (`drivePageRegistryService.ts:249-328`)**: Places `indyshares-pages-registry.json` + `page-{id}.json` directly inside root folder `Builly/`.
  2. **Legacy CMS Adapter (`cmsWorkspaceAdapter.ts:443-475`)**: Creates `Builly/CMS/cms-manifest.json` and `Builly/CMS/RichContent/{docId}.json`, plus uploads assets (`assetService.ts:450`) to `Builly/Assets/{Images|Logos|Icons|...}/`.
  3. **Shared Runtime & Partitioned Service (`partitionedWorkspaceService.ts:409-556`, `ownerPublish.ts:94-107`)**: Creates:
     - `Builly/Sites/{siteSlug}/Config/Draft/` (`site.config.json`, `theme.json`, `components.json`, `cms-bindings.json`, `forms.json`, `pages/*.json`)
     - `Builly/Sites/{siteSlug}/Config/Published/{buildId}/` (`runtime-config.json`, `publish-manifest.json`)
     - `Builly/Data/CMS/{siteSlug}/` (per-type spreadsheets)
     - `Builly/Data/Inbox/{siteSlug}/` (Inbox spreadsheets)
     - `Builly/Data/System/` (`Sites`, `SheetResources`, `SyncJobs`)
- **Gap vs Target Hierarchy (`Builly/{Organization}/{Project}/...`)**: **NONE** of the 3 layouts support `{Organization}/{Project}` folders (`Builly/{OrganizationSlug}/{ProjectSlug}/Config|Data/CMS|Data/Inbox|Assets|Exports`).
- **Duplicate Prevention**:
  - `ensureFolderPath` / `ensureSubfolder` / `ensureFolderSegment` check `'parentId' in parents and name = '...' and trashed = false` before creating folders, and `findFileInFolder` checks filename before creating files.
  - **Weaknesses**:
    1. Root lookup (`ensurePortfolioDriveFolder`, `ensureFolderSegment(null, 'Builly')`) searches globally by name without storing a persisted canonical `drive_root_folder_id` on Organization/Project in D1/DB — if a user renames the folder or has two `"Builly"` folders, lookup is non-deterministic.
    2. `partitionedWorkspaceService.ts:565` searches `spreadsheetTitle` by display name rather than persisted `spreadsheet_id` in `site_dataset_resources` (`0002_shared_runtime_registry.sql`).
    3. `googleWorkspaceApi.ts:615` creates spreadsheets at Drive root (`https://sheets.googleapis.com/v4/spreadsheets`) without specifying parent folder (`addParents` is only attempted best-effort in `partitionedWorkspaceService.ts:583`).
    4. Concurrent browser writes in `cmsWorkspaceAdapter.ts` use a local in-memory `writeQueue`, which protects single-tab races only — no server-side distributed lock or per-resource idempotency key for Drive provisioning.

---

## 7. Current CMS Implementation & Standalone Availability

Verified in `src/components/cms/CmsWorkspaceModal.tsx`, `src/services/cms/*`, `src/App.tsx`:

- **Standalone CMS**: **DOES NOT EXIST**. `CmsWorkspaceModal.tsx` is a full-screen modal rendered inside `App.tsx` (`Builder`), opened only via Builder toolbar/left-rail triggers.
- **Shared Service Layer Readiness**:
  - **GOOD**: Business logic is already modularly extracted into `src/services/cms/`:
    - `cmsService.ts` (pure functions on `CmsDocument`: CRUD content types, fields, records, taxonomies, terms, relationships, slug uniqueness, schema migrations)
    - `cmsValidation.ts` (canonical field/title validation, formula injection escaping, rich HTML sanitization)
    - `cmsQueryEngine.ts` (filtering, sorting, relation expansion, cache invalidation)
    - `cmsWorkspaceAdapter.ts` (Drive `CMS/` manifest + RichContent + Google Sheets sync/pull)
  - **GAP**: Because `CmsWorkspaceModal` receives `siteCms` and `onUpdateCms` props directly from `App.tsx`'s `SiteDocument` React state (`localStorage`), there is no standalone CMS repository/hook capable of loading/saving a Project's CMS independently of opening Visual Builder. Both future standalone `/console/.../cms` and Builder CMS drawer must read/write through one unified Project CMS service/adapter.

---

## 8. Current Inbox & Assets Implementation

- **Inbox (`src/components/cms/CmsInboxView.tsx`, `src/types/cms.ts:358-412`, `worker/src/routes/publicRuntime.ts`)**:
  - **UI**: Lives exclusively as the `'inbox'` tab inside `CmsWorkspaceModal` (inside Builder). Supports status filtering (`all`, `unread`, `read`, `starred`, `archived`, `spam`), categories, internal notes, activity timeline, form definitions.
  - **Gap**: No standalone `/inbox` Project module route. Public form submissions handled by Worker (`handlePublicFormSubmit`) write to Google Sheets (`site_form_destinations` -> Inbox Sheets) and D1 idempotency (`form_submission_idempotency`), **whereas Builder UI (`CmsInboxView`) only reads/updates `siteCms.inboxSubmissions` stored inside `SiteDocument.cms` JSON** — meaning public live submissions stored in Google Sheets do NOT automatically hydrate into `CmsInboxView` without an explicit pull/Worker Inbox API!
- **Assets (`src/components/builder/AssetLibraryPanel.tsx`, `src/services/assetService.ts`)**:
  - **UI**: Lives exclusively in Builder's Left Sidebar `'media'` panel (`AssetLibraryPanel`). Supports file upload, category filters (`images`, `logos`, `icons`, `video-audio`, `fonts`, `documents`), SVG sanitization, metadata edit, Lucide curated icon set, and vector candidate generator.
  - **Storage Gap**: `processAndSaveUploadedAsset` embeds uploaded files as `data:` base64 URLs directly inside `SiteDocument.mediaAssets` (bloating `localStorage`, hitting 5–10MB browser quota easily!) and only optionally uploads to Google Drive `/Builly/Assets/{Category}` if a client GIS token is active (`assetService.ts:421-431`). No Worker Drive upload/list/delete endpoint exists for Project Assets, and no standalone Project `/assets` module exists.

---

## 9. Current Publishing, Runtime & Source Export Behavior

Verified in `src/components/modals/PublishModal.tsx`, `src/services/runtime/*`, `src/pages/PublicSiteRuntimePage.tsx`, `worker/src/routes/ownerPublish.ts`, `worker/src/routes/publicRuntime.ts`, `src/services/sourceExportService.ts`:

- **Shared Runtime Publishing (`COMPLIANT` at Site level; `PARTIAL` at Project/Org level)**:
  - `publishSiteToSharedRuntime` compiles active pages into `PublishedRuntimeSnapshot` + `PublishManifest`, strips private fields (`scrubSnapshotForVisitor` both client & Worker-side), uploads immutable build JSON to Drive `Builly/Sites/{slug}/Config/Published/{buildId}/`, updates D1 `site_registry` & `site_release_history`, syncs `site_dataset_resources` & `site_form_destinations`, and purges CF Cache (`purgeSiteRuntimeCache`).
  - Supports instant rollback (`handleOwnerRollbackSite` -> D1 pointer flip + cache purge).
  - Supports Visitor Shared Runtime (`PublicSiteRuntimePage.tsx`) rendering compiled pages, global header/footer, themes, public CMS queries (`/api/public/sites/:slug/cms/query`), public form submits (`/api/public/sites/:slug/forms/:formId/submit`), and safe asset proxy (`/api/public/sites/:slug/assets/:assetId`).
- **Source Export (`COMPLIANT`)**:
  - `ExportModal.tsx` + `sourceExportService.ts` generate on-demand HTML/CSS/ZIP packages (`generateSiteSourceZip`) & JSON backups. Completely decoupled from live site publishing & Shared Runtime.
  - **Minor Gap**: Exports are client-side download only; not archived to `Builly/{Org}/{Project}/Exports/` in Drive, and no standalone Publishing / Version History Project module UI exists outside Builder modals (`PublishModal`, Releases tab).

---

## 10. Current Tests & Deployment Setup

- **Test Suite (Verified Live Run)**:
  - Command: `npm test` (`vitest run`) executed on current codebase -> **8 test files, 34 tests passed (exit code 0)**:
    1. `src/services/__tests__/sharedRuntime.test.ts` (6 tests)
    2. `src/components/builder/__tests__/CssUnitInput.test.tsx` (6 tests)
    3. `src/components/builder/__tests__/PropertyInspector.test.tsx` (1 test)
    4. `src/features/__tests__/authBoundary.test.ts` (6 tests)
    5. `src/services/__tests__/builderAcceptance.test.ts` (5 tests)
    6. `src/components/common/__tests__/BuillyMadeWithBadge.test.tsx` (3 tests)
    7. `src/services/__tests__/builderRegression.test.ts` (4 tests)
    8. `src/utils/__tests__/routes.test.ts` (3 tests)
  - **Testing Gaps**: Zero tests for Cloudflare Worker (`worker/src/*`), zero tests for `cmsService`/`cmsWorkspaceAdapter` end-to-end, zero tests for Organization/Project workspace routing/permissions (since those don't exist yet).
- **Build & Deployment Config**:
  - Frontend SPA: `package.json` (`vite --port=3000`, `vite build`, `tsc --noEmit` via `npm run lint`). Note: `express` is in dependencies for optional serving, no `server.ts` present.
  - Backend Runtime: `worker/wrangler.toml` (`builly-workspace-worker`, compatibility date `2026-10-01`) + `worker/package.json` (`wrangler dev`, `wrangler deploy`, `tsc --noEmit`). D1 binding (`DB`) & secrets (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`) are commented templates in `wrangler.toml`.
  - i18n: `src/i18n/index.ts` loads `src/locales/en.json` and `src/locales/th.json` (both verified present & active across Landing, Login, Workspace, Builder, CMS).

---

## 11. Risks, Unknowns & Data Migration Hazards

1. **Monolithic Single-Site `localStorage` Key (`indyshares_portfolio_site_v2`)**: Switching users or adding multi-Project support can overwrite or leak drafts across projects/accounts if drafts aren't namespaced by `accountId/orgId/projectId` and backed by Drive Draft files.
2. **Dual OAuth Disconnect**: Moving Builder, CMS, Inbox, and Assets to server-proxied Worker Google APIs requires a working deployed Worker (`VITE_WORKER_API_URL`) + D1 `workspace_credentials`. In local preview or unconfigured environments without Worker, we must fail honestly or clearly separate local preview mode from Drive-backed mode without breaking current unconfigured preview capability (`allowUnconfiguredLocalPreview`).
3. **Route Slug Collisions (`/{site_slug}`)**: Adding `/console` (and `/orgs`, `/projects`, `/cms`, etc.) without immediately adding them to `RESERVED_FIRST_SEGMENTS` (`src/utils/routes.ts`) will route `/console` to `PublicSiteRuntimePage` (`siteSlug="console"`). Conversely, if any existing user already published a site with slug `console`, it would conflict cleanly only if reserved.
4. **Drive Folder Layout Migration Hazard**: Existing users may already have files in legacy root `Builly/` (`indyshares-pages-registry.json`, `CMS/`) or `Builly/Sites/{slug}/`. Migrating directly by deleting or moving folders risks breaking active `runtime_config_drive_file_id` pointers in D1 `site_registry`! Legacy folders must remain intact and readable while new Projects provision `Builly/{OrgSlug}/{ProjectSlug}/...` and existing Sites support non-destructive adoption/mapping.
5. **1:1 `owner_id` OAuth Binding vs Organization Workspace**: `workspace_credentials` (`0001_workspace_oauth.sql`) uses `owner_id TEXT PRIMARY KEY`. Supporting shared/multiple Organizations where each Org can have its own connected Google Workspace (or inherit Owner's default connection) requires schema evolution without breaking existing single-owner rows.
6. **`UNKNOWN` Live Environment States**:
   - Whether live Cloudflare Worker + D1 (`0001`, `0002`) is deployed in user's Cloudflare account and whether `site_registry` already contains live published sites: **UNKNOWN**.
   - Contents/IDs of any live Google Drive `Builly/` folder in the owner's Google account: **UNKNOWN**.
   - Whether `VITE_SUPABASE_URL` / `VITE_WORKER_API_URL` are populated in the target hosting environment: **UNKNOWN**.

---

## 12. Gap Matrix Against Target Workspace Architecture

| Target Requirement | Status | Verified Codebase Evidence | Required Evolution |
|---|---|---|---|
| **Hierarchy: Account → Organization → Project → Modules** | `MISSING` | `SiteDocument` (`src/types/builder.ts:831`) is the only root entity; no `Organization`, `Project`, or `ProjectModule` models exist. | Introduce `Organization`, `OrganizationMember`, `Project`, `ProjectModule`, and optional `Site` (attached 0..1 or 0..N to Project). |
| **Project ≠ Site separation** | `INCOMPATIBLE` | `SiteDocument` owns `portfolioSlug`, `pages`, `cms`, `mediaAssets`, `releases`. Non-site projects cannot exist. | Decouple `Project` (workspace identity + enabled modules + Drive folder) from `Site` (optional public web capability + slug + domain + releases). |
| **Landing Page primary CTA → Console** | `INCOMPATIBLE` | `LandingPage.tsx:90,100,204` routes to `/builder` (auth) or `/workspace` (anon login returnTo). | Update Landing primary CTA & post-login default `returnTo` to `/console`; keep secondary/deep-link compatibility. |
| **Console (Manage Organizations & Projects)** | `MISSING` | `AppRouter.tsx` & `routes.ts` have zero `/console` routes or Org/Project CRUD UI. | Build `/console` + `/console/organizations/:orgId` + `/console/projects/:projectId` with calm, spacious Workspace UX & EN/TH i18n. |
| **Project Dashboard (Module Launcher & Overview)** | `MISSING` | No Project overview page exists; `App.tsx` opens straight into 3-pane Visual Builder. | Build Project Dashboard with quick status cards and launchers for enabled modules (Builder, CMS, Inbox, Assets, Publishing, Versions, Settings). |
| **Builder Direct Launch** | `PARTIAL` | `/builder` opens `App.tsx` directly (`AppRouter.tsx:151`), but only for a single global `SiteDocument`. | Scope Builder to `/console/organizations/:orgId/projects/:projectId/builder`; keep `/builder` alias opening active/default project. |
| **Standalone CMS Module (without opening Builder)** | `MISSING` | `CmsWorkspaceModal.tsx` only renders inside `App.tsx` Builder. | Create standalone Project CMS page backed by shared `cmsService` + Worker/Project CMS repository. |
| **Shared CMS Service between Standalone & Builder** | `PARTIAL` | `src/services/cms/cmsService.ts` & `cmsWorkspaceAdapter.ts` are cleanly decoupled pure services, but state lives inside `App.tsx` `SiteDocument`. | Extract a Project-scoped CMS store/repository hook consumed identically by both standalone CMS UI and Builder's contextual CMS drawer/inspector. |
| **Standalone Inbox Module + Real Backend Read/Write** | `PARTIAL` | `CmsInboxView.tsx` exists inside Builder modal (`SiteDocument.cms.inboxSubmissions`), while `worker/.../publicRuntime.ts` appends visitor submissions directly to Google Sheets. | Build standalone Project Inbox route + Worker authenticated Inbox read/triage endpoints (`list`, `mark read`, `star`, `archive`, `notes`, `categories`) reading/writing Inbox Sheets so visitor submissions appear in Console & Builder. |
| **Standalone Assets Module + Drive Upload/Registry** | `PARTIAL` | `AssetLibraryPanel.tsx` exists inside Builder sidebar; `assetService.ts` stores data-URIs in `localStorage` + best-effort browser GIS upload. | Build standalone Project Assets route + Worker authenticated Asset endpoints (`upload`, `list`, `delete`, metadata) persisting into Project `Assets/` Drive folder instead of bloating `localStorage`. |
| **Publishing & Version History Modules** | `PARTIAL` | `PublishModal.tsx` + Releases panel live inside Builder; Worker `ownerPublish.ts` handles publish/rollback & D1 `site_registry`/`site_release_history`. | Add Project Publishing & Version History standalone views reusing `publishRuntimeClient.ts` + Worker endpoints; list releases from D1/Drive. |
| **Project & Org Settings + Team/RBAC Readiness** | `MISSING` | Only single `owner_id` checks (`requireSession.ts`); no Org settings, module toggle UI, or member roles table. | Add `organizations`, `organization_members` (owner/admin/editor/viewer roles), `projects`, `project_modules`, `sites` in D1 (or Supabase DB) and Org/Project Settings UI. |
| **Unified Server-Side Google OAuth & Zero Browser Token Exposure** | `PARTIAL` | Worker OAuth vault (`0001_workspace_oauth.sql`) is encrypted & server-only, **but** Builder Drive/CMS/Sheets/Assets still rely on browser GIS in-memory `accessToken` (`googleAuthService.ts`). | Route Owner Drive/Sheets/CMS/Inbox/Asset/Draft operations through authenticated Cloudflare Worker APIs using Org/Owner encrypted vault tokens; deprecate client GIS token requirement for connected workspaces. |
| **Drive Folder Hierarchy (`Builly/{Org}/{Project}/...`) & Idempotent Provisioning** | `PARTIAL` | `partitionedWorkspaceService.ts` provisions `Builly/Sites/{slug}/Config/Draft|Published` & `Builly/Data/CMS|Inbox/{slug}`; legacy paths in `Builly/` & `Builly/CMS/`. | Evolve Drive provisioner to `Builly/{OrgSlug}/{ProjectSlug}/{Config,Data/CMS,Data/Inbox,Assets,Exports}` with persisted folder/file IDs in registry to avoid duplicate creation; preserve legacy paths safely. |
| **Supabase Identity-Only / Zero Firebase** | `COMPLIANT` | Zero Firebase anywhere. Supabase used solely for Auth (`AuthContext.tsx`, `requireSession.ts`). | Maintain Supabase Auth; keep user config/CMS/Inbox/Assets in Google Drive & Sheets. |
| **Shared Runtime Visitor Isolation & On-Demand Source Export** | `COMPLIANT` | `scrubSnapshotForVisitor`, `publicRuntime.ts`, `PublicSiteRuntimePage.tsx`, `sourceExportService.ts` verified by `sharedRuntime.test.ts` & `authBoundary.test.ts`. | Scope D1 `site_registry` / `site_dataset_resources` with `org_id` & `project_id` while preserving public `/{site_slug}` and `/s/{site_slug}` URLs. |
| **Bilingual i18n (EN/TH)** | `COMPLIANT` | `src/i18n/index.ts`, `en.json`, `th.json` active across all pages. | All new Console, Org, Project Dashboard, and Module views must include full `en.json` & `th.json` translations. |

---

## 13. Phased Implementation Plan

### Phase 1 — Backend Workspace Data Model, RBAC & Route Reservation (Foundation)
- **Scope**: Add `organizations`, `organization_members`, `projects`, `project_modules`, `sites` (linking `project_id` <-> `site_id`), and `workspace_resources` (canonical Drive folder IDs & Spreadsheet IDs) to Cloudflare D1 migration `0003_workspace_hierarchy.sql`, while keeping existing `0001` & `0002` tables intact. Implement idempotent bootstrap of a user's default Personal Organization + migrated default Project on first authenticated Console/Worker call. Reserve `/console` and module top-level segments in `src/utils/routes.ts`.
- **Exact Files**: `worker/migrations/0003_workspace_hierarchy.sql` (new), `worker/src/services/workspaceHierarchyService.ts` (new), `worker/src/routes/consoleApi.ts` (new), `worker/src/index.ts`, `src/types/workspace.ts` (new), `src/utils/routes.ts`, `src/utils/__tests__/routes.test.ts`.
- **Data / Schema Impact**: Purely additive SQL tables & nullable `org_id`/`project_id` columns or sidecar link tables so existing `site_registry` rows remain 100% functional.
- **Risks**: Route collision with reserved slugs -> mitigated via unit tests in `routes.test.ts` and keeping `/s/{slug}` safe fallback.
- **Tests**: Route precedence tests; Worker unit tests for Org/Project CRUD, membership authorization, and auto-bootstrap of existing owner sites.
- **Rollback**: Revert migration `0003` / feature flag Console endpoints; legacy `/builder` and `/{site_slug}` continue working unchanged.

### Phase 2 — Server-Side Google Workspace Proxy & `{Org}/{Project}` Drive Provisioning
- **Scope**: Extend Worker OAuth & Drive/Sheets proxy so Builder, CMS, Inbox, Assets, and Publishing can execute Drive/Sheets operations server-side via encrypted vault tokens without needing browser GIS popups. Allow linking `workspace_credentials` to `organization_id` (falling back cleanly to `owner_id` legacy vault row). Add idempotent `Builly/{OrgSlug}/{ProjectSlug}/` folder tree provisioning (`Config/Draft`, `Config/Published`, `Data/CMS`, `Data/Inbox`, `Assets`, `Exports`) backed by persisted `workspace_resources` folder IDs.
- **Exact Files**: `worker/src/services/googleTokenVault.ts`, `worker/src/services/driveProvisioner.ts` (new), `worker/src/routes/googleOAuth.ts`, `worker/src/routes/drive.ts`, `worker/src/routes/sheets.ts`, `worker/src/index.ts`, `src/features/workspace-connection/workspaceApiClient.ts`.
- **Data / Schema Impact**: Stores Drive folder/spreadsheet IDs in `workspace_resources`; zero mutation of existing legacy `Builly/Sites/*` folders unless explicit Project migration/adoption is triggered.
- **Risks**: Existing users with legacy `Builly/` or `Builly/Sites/{slug}/` -> resolved via non-destructive "Attach/Adopt existing Site & Sheet" mapper rather than moving/deleting files.
- **Tests**: Mocked Google API tests verifying duplicate folder prevention, org/owner authorization checks, and zero token leakage in responses.
- **Rollback**: Client falls back to existing `/workspace` status & client adapter if `0003` endpoints are absent.

### Phase 3 — Landing CTA → Console Shell, Organization Management & Project Dashboard
- **Scope**: Update `LandingPage.tsx` primary CTA & `LoginPage.tsx` default `returnTo` to `/console`. Build Console shell (`/console`, `/console/orgs/:orgId`), Organization switcher/creator/settings, Project list/creator (choosing starter modules, e.g., Website + CMS vs Headless CMS / Internal Portal), and Project Dashboard (`/console/orgs/:orgId/projects/:projectId`) showing enabled modules, Site status (if attached), Workspace sync health, and quick actions.
- **Exact Files**: `src/pages/LandingPage.tsx`, `src/pages/LoginPage.tsx`, `src/pages/ConsolePage.tsx` (new), `src/pages/ProjectDashboardPage.tsx` (new), `src/components/console/*` (new), `src/AppRouter.tsx`, `src/locales/en.json`, `src/locales/th.json`.
- **Data / Schema Impact**: Introduces namespaced draft cache (`builly_project_draft:{projectId}`) with one-time safe import prompt/migration from legacy `indyshares_portfolio_site_v2`.
- **Risks**: Breaking muscle-memory bookmarks to `/builder` -> preserve `/builder` as alias opening the active/default project inside Builder with breadcrumb back to Project Dashboard.
- **Tests**: Router/navigation tests + component tests verifying Landing CTA -> `/console`, Auth guard on `/console/*`, Org/Project switching, and EN/TH rendering.
- **Rollback**: Restore `LandingPage.tsx` CTA target & keep `/builder` direct mount.

### Phase 4 — Decouple Project CMS & Standalone CMS Module (Shared Repository)
- **Scope**: Extract a unified `useProjectCms` / `cmsRepository.ts` service layer so both `/console/orgs/:orgId/projects/:projectId/cms` (standalone CMS module) and Builder's contextual CMS drawer (`CmsWorkspaceModal` / Inspector binding) mutate the exact same Project CMS state and persist to the Project's Drive CMS folder + Sheets via Worker proxy (with safe local cache when offline/unconfigured).
- **Exact Files**: `src/services/cms/cmsRepository.ts` (new), `src/pages/modules/ProjectCmsPage.tsx` (new), `src/components/cms/CmsWorkspaceModal.tsx`, `src/App.tsx`, `worker/src/routes/projectCms.ts` (new).
- **Data / Schema Impact**: Same `CmsDocument` schema; records cleanly scoped by `projectId` instead of `SiteDocument`.
- **Risks**: State divergence if Builder keeps stale in-memory copy of CMS -> solved by making `cmsRepository` single source of truth shared via context/store between Builder and standalone module.
- **Tests**: Shared repository tests verifying create/edit/publish in standalone CMS immediately reflects in Builder bindings and vice versa, plus Title/slug validation regression checks.
- **Rollback**: Keep `CmsWorkspaceModal` props adapter backward-compatible with `SiteDocument.cms`.

### Phase 5 — Standalone Inbox, Assets, Publishing & Version History Modules
- **Scope**: Build standalone routes inside Project workspace:
  - `/inbox`: Reads/updates Inbox Sheets + D1 `form_submission_idempotency` via Worker authenticated `/api/owner/projects/:projectId/inbox/*` routes (bridging the current gap between live public submissions and Builder Inbox UI!).
  - `/assets`: Uploads/lists/deletes Project `MediaAsset` files directly to `Builly/{Org}/{Project}/Assets/{Category}` via Worker Drive upload proxy, replacing Base64 `localStorage` bloat with Drive file pointers / safe proxy URLs.
  - `/publishing` & `/versions`: Standalone site attach/create (if Project doesn't have a Site yet), slug/custom-domain settings, Publish, Rollback, and On-Demand Source Export (with optional save to `Builly/{Org}/{Project}/Exports/`).
  - `/settings`: Project metadata, enabled modules toggles, Workspace Drive folder inspector, and Danger Zone (with confirmation dialogs).
- **Exact Files**: `src/pages/modules/ProjectInboxPage.tsx`, `ProjectAssetsPage.tsx`, `ProjectPublishingPage.tsx`, `ProjectVersionsPage.tsx`, `ProjectSettingsPage.tsx`, `worker/src/routes/projectInbox.ts`, `worker/src/routes/projectAssets.ts`, `src/components/builder/AssetLibraryPanel.tsx`, `src/components/cms/CmsInboxView.tsx`, `src/components/modals/PublishModal.tsx`.
- **Tests**: Unit & integration tests for Inbox triage round-trip, SVG/binary asset validation + Drive proxy permissions, Site attach + publish/rollback without breaking projects that disable Site/Publishing.
- **Rollback**: Standalone routes remain additive; Builder modals continue functioning via shared services.

### Phase 6 — Non-Destructive Legacy Workspace Migration Wizard & Full Verification
- **Scope**: Add an opt-in Workspace Migration / Adoption utility in Console & Project Settings for existing users with legacy `Builly/` or `Builly/Sites/{slug}/` resources: inventories existing Drive folders/Sheets, backs up before any structural change, maps legacy Site/CMS/Inbox spreadsheets into the Project's `workspace_resources`, and verifies `npm test`, `npm run lint`, `npm run build`, and `worker` `tsc --noEmit`.
- **Exact Files**: `src/components/console/LegacyMigrationModal.tsx` (new), `docs/SETUP_AND_MIGRATION.md`, full E2E acceptance test suite.

---

## 14. Questions Requiring Owner Decision Before Phase 1 Implementation

1. **Metadata Database for Organizations, Projects & Module Registry**:
   - Currently Supabase is **Auth-only** (zero Postgres tables) while the Cloudflare Worker already uses **Cloudflare D1** (`0001_workspace_oauth.sql`, `0002_shared_runtime_registry.sql`).
   - **Decision Needed**: Should `organizations`, `organization_members`, `projects`, `project_modules`, `sites`, and `workspace_resources` live in **Cloudflare D1** alongside `site_registry` and `workspace_credentials` (simplest, 1 backend, 1 auth boundary, zero extra DB secrets), OR do you specifically want those tables in **Supabase Postgres** (requiring Worker `SUPABASE_SERVICE_ROLE_KEY` or RLS policies)?

2. **Google Workspace OAuth Ownership Scope (Account vs Organization)**:
   - Currently `workspace_credentials` in D1 (`0001_workspace_oauth.sql`) is keyed 1:1 by `owner_id`.
   - **Decision Needed**: Should a Google Workspace Drive/Sheets connection belong to an **Organization** (so different orgs can use different Google Workspace drives, e.g., Personal vs Agency Client Drive, with owner-only reconnect controls), OR stay **per-Builly Account** with folder separation per Organization inside the owner's single Drive?

3. **Default Personal Organization & Legacy Draft Auto-Migration UX**:
   - When an existing user signs in after this upgrade, they have no Organization or Project row yet (and may have a single site in `localStorage` / `Builly/Sites/{slug}`).
   - **Decision Needed**: Should first login to `/console` **silently auto-create** a default `"Personal"` Organization and `"My Workspace"` Project (importing any existing local/Drive site non-destructively), OR show an **explicit 1-step onboarding screen** letting the user name their Organization and first Project before entering Console?

4. **Public Site Slug Safety for Reserved Console Routes**:
   - We must reserve `/console` (and likely `/orgs`, `/projects`) in `src/utils/routes.ts` so they don't collide with `/{site_slug}`.
   - **Decision Needed**: Confirm reserving `console` (and keeping `/s/{site_slug}` always unaffected), and confirm whether legacy `/builder` and `/workspace` URLs should remain active aliases opening the active Project Builder / Workspace Connect page.
