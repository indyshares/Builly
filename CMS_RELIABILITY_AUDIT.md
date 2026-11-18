# Builly CMS Reliability, Workspace Sync & Security Audit

**Phase:** Phase 0 — Audit Only (Read-Only Code & Architecture Inspection)  
**Status:** Complete — Awaiting Owner Approval before Phase 1 Implementation  
**Governing Specs:** `CMS_RELIABILITY_AND_DATA_MANAGEMENT_SPEC.md`, `GOOGLE_WORKSPACE_SYNC_SPEC.md`, `SHEET_STRUCTURE_MIGRATION_PLAN.md`  
**Companion Deliverable:** `/SHEET_STRUCTURE_INVENTORY.md`

---

## Baseline Test & Build Verification (Observed)

| Check Command | Scope | Result | Notes |
|---|---|---|---|
| `npx vitest run` | Existing unit & integration tests | **Passed (6 test files, 23 tests)** | `PropertyInspector.test.tsx` (1), `CssUnitInput.test.tsx` (6), `authBoundary.test.ts` (6), `BuillyMadeWithBadge.test.tsx` (3), `routes.test.ts` (3), `builderRegression.test.ts` (4). Warning in `vite.config.ts:11` (`__dirname` in ESM). |
| `npx tsc --noEmit` | Full TypeScript typecheck | **Passed (0 errors)** | Verified clean baseline prior to any edits. |
| `npm run lint` | Project lint script (`tsc --noEmit`) | **Passed (0 errors)** | Runs `tsc --noEmit` per `package.json`. |

---

## Section A — Root-Cause Trace: `"Title is required."` & `"Project Title is required."` Bugs (Plus Related Validation Defects)

### 1. Exact End-to-End Execution Trace (`Post` and `Project`)

Both `Post` and `Project` fail immediately when creating a new record in the CMS Workspace UI, even after typing a title:

1. **Content Type Schema (`src/data/cmsDefaults.ts`)**:
   - Built-in `post`: `titleFieldKey: 'title'`, field[0] has `key: 'title'`, `label: 'Title'`, `required: true`.
   - Built-in `project`: `titleFieldKey: 'title'`, field[0] has `key: 'title'`, `label: 'Project Title'`, `required: true`.
2. **UI State & Input Binding (`src/components/cms/CmsRecordEditor.tsx`)**:
   - Line `25`: Local React state holds `const [title, setTitle] = useState(record?.title || '');`.
   - Lines `28–31`: Custom field values live in a **separate** React state object `const [fields, setFields] = useState<Record<string, unknown>>(...)`.
   - Lines `138–144`: The visible top Title `<input>` binds exclusively to `value={title}` and `onChange={(e) => setTitle(e.target.value)}`. It **never** calls `setFields` to mirror the value into `fields.title` (or `fields[contentType.titleFieldKey]`).
   - Line `240`: Custom Fields loop filters out `'title'` and `'slug'`:
     ```tsx
     .filter((f) => f.key !== 'title' && f.key !== 'slug')
     ```
     So the required `title` field (`Title` for `post`, `Project Title` for `project`) is hidden from the Custom Fields section and has no binding to `fields.title`.
   - Lines `34–44`: `handleFieldChange` has dead code (`if (key === 'title' && ...)` at line `36`) that can never trigger for `post`/`project` because `key === 'title'` is filtered out at line `240`.
3. **Submit Handler (`CmsRecordEditor.tsx:46–86`, `handleSave`)**:
   - Lines `53–69`: Constructs `candidate: CmsContentRecord` with `title: title.trim() || String(fields[contentType.titleFieldKey] || ...) || 'Untitled Record'`, **but passes `fields` unmodified (`fields: { ...fields }`)** without populating `fields[contentType.titleFieldKey]` (`fields.title`) from `title`.
   - Line `71`: Calls `validateCmsRecord(contentType, candidate, existingRecords)`.
4. **Validator (`src/services/cms/cmsValidation.ts:270–350`, `validateCmsRecord`)**:
   - Lines `291–300`: Iterates over `contentType.fields`. For every field with `f.required === true` (including `f.key === 'title'`), it inspects **only** `const val = record.fields[f.key]`, ignoring `record.title`!
   - When `val === undefined || val === ''`: sets `fieldErrors['title'] = "${f.label} is required."` -> **`"Title is required."`** for `post` (`f.label = 'Title'`) and **`"Project Title is required."`** for `project` (`f.label = 'Project Title'`).
5. **UI Error Mapping (`CmsRecordEditor.tsx:72–77`)**:
   - `Object.values(validation.fieldErrors)` is flattened into `errors: string[]` (`setErrors(...)`) and rendered only in a top alert banner (`lines 125–132`) with no per-field error highlighting.

### 2. Additional Validation, Schema & Persistence Bugs Discovered Along the Same Path

| # | Defect | Exact File & Line | Impact |
|---|---|---|---|
| A1 | **Dual Title Inputs for Non-`'title'` `titleFieldKey` Types** | `CmsRecordEditor.tsx:138, 240`; `cmsDefaults.ts` (`testimonial` -> `author_name`, `team_member` -> `full_name`, `slide` -> `headline`, `faq` -> `question`) | Top `title` box updates `record.title`, while line `240` only filters `'title'`—so a second input renders for `author_name`/`full_name`/`headline`/`question`, confusing authors and failing validation if they type only in the top box. |
| A2 | **Thai / Unicode Title Produces Empty Slug Error** | `CmsRecordEditor.tsx:48–51`; `cmsValidation.ts:276–280` | `sanitizeCmsSlug` strips `[^a-z0-9]+`. If a user enters a Thai title (e.g., `"โปรเจกต์ใหม่"`) and leaves Slug empty, `finalSlug` evaluates to `""`, failing `validateCmsRecord` with `"Record URL slug is required."` (note: `ensureUniqueRecordSlug` in `cmsValidation.ts:77` has a `'item'` fallback, but `CmsRecordEditor.tsx` does not call it!). |
| A3 | **Editor Bypasses `saveCmsRecord()`** | `CmsWorkspaceModal.tsx:101–111`; `cmsService.ts:117–244` | `CmsWorkspaceModal.handleSaveRecord` splices `CmsRecordEditor` output directly into `siteCms.records` instead of calling `saveCmsRecord()`. This bypasses `sanitizeRichHtml()`, `richDocs` extraction, `publishedAt` setting, `operationalLogs`, `invalidateCmsQueryCache()` (partially avoided), and `revision` checks. |
| A4 | **Number Field Coerces Blank Input to `0`** | `CmsRecordEditor.tsx:269` | `handleFieldChange(field.key, parseFloat(e.target.value) || 0)` prevents clearing an optional numeric field and masks missing required numbers (bypassing required check with `0`). |
| A5 | **Content Type Builder Schema Protection & Versioning Bug** | `CmsContentTypeBuilder.tsx:166, 183, 297` | Hardcodes protection against deleting/renaming `f.key !== 'title' && f.key !== 'slug'` instead of `currentType.titleFieldKey`; records `toVersion: schemaVersion + 1` in `migrationLog` (line `166`) **without actually incrementing `updatedType.schemaVersion`**. |
| A6 | **No Backend Validation Authority** | `worker/src/routes/sheets.ts`, `cmsWorkspaceAdapter.ts` | Validation runs solely in browser React code. Server Worker endpoints do not validate payloads against Content Type schemas. |

---

## Section B — Sheet Structure Audit Summary

Full column-by-column inventory, mapping table, and staged migration plan are documented in **`/SHEET_STRUCTURE_INVENTORY.md`**. Critical findings:
- **Duplicate `'title'` column** in `CMS_REC_POST`, `CMS_REC_PROJECT`, and custom types (`cmsWorkspaceAdapter.ts:338, 346`), causing `rowMap['title']` overwrite collisions on pull (`line 699`).
- **Missing multi-tenant / soft-delete columns** (`site_id`, `owner_account_id`, `trashedAt`, `deleted_by`) across `CMS_REC_*` and `InboxNotes`/`InboxActivity`/`InboxCategories`.
- **Silent read truncation & destructive clears**: `readSpreadsheetTabs` (`googleWorkspaceApi.ts:484`) caps reads at `A1:Z500`, while `saveTabsToSpreadsheet` (`771`) clears `A1:Z1000` and `syncCmsToGoogleWorkspace` (`cmsWorkspaceAdapter.ts:512`) blindly executes `values:batchClear` over `'A:ZZ'` before `batchUpdate`.
- **Live Sheet Drift**: `VersionHistory`, `InboxNotes`, `InboxActivity`, `InboxCategories`, and `InboxRegistry` edits in UI state (`App.tsx:2840–2907, 3141–3259`) are not reliably persisted to live Google Sheets via backend APIs.

---

## Section C — CMS Management & Data Operations Audit

Inspecting `src/components/cms/CmsWorkspaceModal.tsx`, `src/components/cms/CmsInboxView.tsx`, and `src/services/cms/cmsService.ts`:

1. **Hard Delete Instead of Soft Delete / Trash / Restore**:
   - `cmsService.ts` already implements `transitionCmsRecordStatus` (`line 246`), `duplicateCmsRecord` (`line 292`), `findIncomingRecordReferences` (`line 356`), `deleteCmsRecordPermanently` (`line 372`), and `bulkActionCmsRecords` (`line 428`).
   - **None of these are wired in `CmsWorkspaceModal.tsx`**: `handleDeleteRecord` (`lines 114–120`) and `handleBulkDelete` (`lines 136–142`) permanently splice records out of `siteCms.records` in-place, bypassing relation reference checks, `richDocs` cleanup, Trash recovery, and audit logging.
2. **Broken Bulk Selection & Missing Record Operations**:
   - `CmsWorkspaceModal.tsx:70` declares `selectedRecordIds`, and `line 355` renders a "Delete Selected" button, **but zero row checkboxes exist in the records table (`lines 370–435`)**, making bulk actions unreachable.
   - Missing Trash tab/filter restoration flow ("Restore to Draft" vs "Permanent Delete" with confirmation).
   - Missing Sorting (e.g., Updated At, Title, Created At, Sort Order) and Pagination / page-size controls.
3. **Missing Scoped "Clear All Data" Flow**:
   - No Clear All Data workflow exists for clearing records (site/type/trash scope), inbox submissions, or cache with explicit confirmation, dry-run impact count, `SyncJob` progress, or audit event logging.
4. **Static Overview & Missing Workspace Sections**:
   - Overview tab (`CmsWorkspaceModal.tsx:232–257`) renders only 3 static numeric counts (`Content Types`, `Total Records`, `Taxonomies`) with no operational workspace status, active Google account/folder/spreadsheet connection summary, last sync timestamp, or failed job alerts.
   - Missing dedicated management views for **Data Sources**, **Google Drive Folders**, **Google Sheets Connections**, **Drive Import**, **Sync Activity (`SyncJobs`)**, and **Audit Log**.
5. **Inbox UX & Persistence Gaps (`CmsInboxView.tsx`, `App.tsx`)**:
   - Uses blocking browser `window.confirm(...)` (`CmsInboxView.tsx:260, 401`).
   - Hardcodes `actor_id: 'owner'` and `actor_name: 'Studio Owner'` (`CmsInboxView.tsx:467–468`) instead of authenticated user identity.
   - `App.tsx:3162–3238` records submissions locally using hardcoded fallbacks `'demo_sheets'`, `'demo_spreadsheet'`, `'owner_local'` and attempts a browser GIS write only if an in-memory token exists, swallowing errors silently at `line 3235`.

---

## Section D — Google Drive & Sheets Workflow Audit

Inspecting `worker/src/*`, `src/services/googleAuthService.ts`, `src/services/googleWorkspaceApi.ts`, `src/services/drivePageRegistryService.ts`, `src/services/assetService.ts`, `src/components/modals/GoogleSetupModal.tsx`, `src/components/sheets/SheetsEditorModal.tsx`, `src/features/workspace-connection/*`:

1. **Disconnected Dual Google Integration (Worker Vault vs Browser GIS)**:
   - `/worker` implements clean Supabase JWT verification (`requireSession.ts`), D1 PKCE/state (`oauthState.ts`), and encrypted refresh tokens (`googleTokenVault.ts`), **but exposes only 2 minimal read-only endpoints**: `GET /api/drive/file` (`worker/src/routes/drive.ts`) and `GET /api/sheets/meta` (`worker/src/routes/sheets.ts`).
   - All actual builder operations (Drive folder search/creation, Page registry JSON sync, Asset uploads, CMS sync/pull, Sheets read/write, Form submission writes) still execute **directly from the browser** to `https://www.googleapis.com/...` using a GIS popup token (`googleAuthService.ts`).
2. **Global Drive Scan & Missing Folder Picker**:
   - `GoogleSetupModal.tsx:897–920` displays a static "Drive Folders" tab with zero interactive folder browsing or selection.
   - `drivePageRegistryService.ts:102–113` and `googleWorkspaceApi.ts:691–702` execute `q = "name = 'Builly' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"` across the user's **entire accessible Google Drive** whenever `existingFolderId` is absent or inaccessible. Both `cmsWorkspaceAdapter.ts:411, 588` and `assetService.ts:334` invoke `ensurePortfolioDriveFolder` unconditionally.
   - Switching Google accounts (`App.tsx:2371`) resets `workspace.spreadsheet` while leaving `site.cms.storageHealth.cmsFolderDriveId` / `manifestDriveFileId` cached in `localStorage` from the previous account.
3. **Missing Drive File Import Workflow**:
   - No explicit user-driven folder browser + file selector exists for importing Drive documents/assets into CMS records or Assets (missing MIME/size allowlist, duplicate `drive_file_id` detection, file preview, include-subfolders toggle, and import manifest `SyncJob` tracking).
4. **Ambiguous Sheets Sync & Silent Failures**:
   - `CmsWorkspaceModal.tsx` offers `"Sync CMS with Google Sheets"` (overwrites Sheets + Drive via `batchClear`) and `"Pull from Google Workspace"` (overwrites local records—unless Sheets fails, where `cmsWorkspaceAdapter.ts:781–783` **swallows the error silently**, or if Sheet returns 0 rows at `line 778`, where deletions are ignored!).
   - No **Import from Google Sheets** (read headers -> column mapping UI -> validation preview -> dry-run -> conflict rule `skip | overwrite | create_copy`) vs **Export / Sync to Google Sheets** (create or select spreadsheet/worksheet -> explicit column mapping -> upsert by `recordId` without blind `batchClear`).
   - No persistent `SyncJob` state machine (`idle -> validating -> queued -> running -> succeeded | completed_with_warnings | failed | needs_attention | cancelled`), idempotency keys, or retry/backoff handling.
5. **Fake Build Progress**:
   - `PublishModal.tsx:81–103` chains 4 hardcoded `setTimeout(..., 500)` steps to simulate async server compilation before synchronously calling local `compilerService.compileRelease()`, and does not confirm live Sheet persistence of `VersionHistory`.

---

## Section E — Security Audit (Ranked by Severity)

### CRITICAL
1. **Unverified Client-Supplied Resource IDs & Missing Server-Side Ownership Authority**
   - **Evidence**: `worker/src/routes/drive.ts`, `worker/src/routes/sheets.ts`, `googleWorkspaceApi.ts`, `cmsWorkspaceAdapter.ts`, `storageService.ts`.
   - **Risk**: Worker `/api/drive/file?fileId=...` and `/api/sheets/meta?spreadsheetId=...` pass any client-supplied `fileId`/`spreadsheetId` to Google APIs using the authenticated user's token without checking a server-side `(owner_id, site_id, google_subject)` resource registry. Simultaneously, `site.id`, `ownerId`, and form `destination_spreadsheet_id` live only in browser `localStorage` rather than a server database, so public form submissions (`App.tsx:3085–3259`) cannot authenticate securely to write to the site owner's Google Sheet.
   - **Remediation**: Move `sites`, `workspace_resources`, `data_sources`, `sync_jobs`, and `audit_events` into Worker D1; validate ownership and explicit `workspace_resources` binding on every Drive/Sheets route; add a dedicated server-side public form submission route (`/api/public/forms/:formId/submit`) that resolves verified `data_sources` + owner refresh token strictly on the Worker (with rate limiting & field allowlist).

### HIGH
2. **Spreadsheet Formula / CSV Injection (`USER_ENTERED` Without Escaping)**
   - **Evidence**: `googleWorkspaceApi.ts:595` (`createPortfolioSpreadsheet`), `682` (`initializeMissingTabsInSpreadsheet`), `809` (`saveTabsToSpreadsheet`); `SheetsEditorModal.tsx`.
   - **Risk**: Writes use `valueInputOption: 'USER_ENTERED'` on raw strings without `escapeSheetFormulaCell()`. Malicious values starting with `=`, `+`, `-`, `@`, `\t`, or `\r` (e.g., from form submissions or untrusted edits saved via `SheetsEditorModal`) execute spreadsheet formulas when opened.
   - **Remediation**: Enforce `valueInputOption: 'RAW'` and centralized `escapeSheetFormulaCell()` on all Sheets write endpoints on the Worker and client adapters.

3. **Worker CORS Wildcard/Origin-Reflection Fallback & OAuth Redirect Trust**
   - **Evidence**: `worker/src/index.ts:19–25` (`resolveAllowedOrigin` returns `reqOrigin` if `ALLOWED_FRONTEND_ORIGINS` is empty); `worker/src/routes/googleOAuth.ts:16–22`.
   - **Risk**: When `ALLOWED_FRONTEND_ORIGINS` is unset or misconfigured in any environment, any arbitrary origin is echoed in `Access-Control-Allow-Origin` and stored as `redirect_origin` in `oauth_states` (`googleOAuth.ts`), allowing cross-origin credentialed/bearer calls or callback redirect abuse.
   - **Remediation**: Fail closed when `ALLOWED_FRONTEND_ORIGINS` is empty (allowlist strict explicit origins only, e.g., configured production origin + localhost dev origins) and validate `redirect_origin` against the exact allowlist before storing in `oauth_states` and before redirecting.

4. **Browser OAuth Access Token Exposure & Direct Google API Calls**
   - **Evidence**: `src/services/googleAuthService.ts:41, 209–345`, `googleWorkspaceApi.ts`, `drivePageRegistryService.ts`, `cmsWorkspaceAdapter.ts`, `assetService.ts`.
   - **Risk**: Although `/worker` stores refresh tokens encrypted in D1, the active Builder/CMS runtime still acquires Google access tokens directly in browser JS (`google.accounts.oauth2.initTokenClient`) and monkeypatches `window.open` (`googleAuthService.ts:330`), expanding token exposure surface to XSS and browser extensions and violating `GOOGLE_WORKSPACE_SYNC_SPEC.md` §5.
   - **Remediation**: Route all Drive, Sheets, CMS Sync, Asset upload, and Form submission operations through authenticated Worker `/api/*` endpoints; deprecate browser GIS token usage as the primary workspace path.

5. **XSS / Unsafe HTML & Unvalidated Redirect Surfaces**
   - **Evidence**:
     - `src/components/builder/ElementRenderer.tsx:2163`: `window.location.href = cmsFormDef.settings.redirectUrl` without protocol check (`javascript:` URL injection).
     - `src/services/cms/cmsValidation.ts:43–50` (`sanitizeRichHtml`): Regex-only sanitizer (`<script>` and naive `\son\w+=`), vulnerable to `<svg onload=...>`, `<img/onerror=...>`, `<object>`, `<embed>`, `<math>`, or `href="javascript:..."` if rendered as HTML.
     - `src/components/modals/PublicSiteModal.tsx:337` & `src/components/builder/Canvas.tsx:611`: `dangerouslySetInnerHTML={{ __html: compiledCss }}`; while `scopeCustomCss` checks balanced delimiters, a CSS string containing `</style><script>` inside comments or strings could break out of `<style>` if unescaped.
   - **Remediation**: Restrict `redirectUrl` strictly to `http:`, `https:`, or relative `/` paths; upgrade `sanitizeRichHtml` to strict DOM/allowlist sanitization (tags + attributes + `http/https/mailto` URLs); escape `</style` sequences in compiled CSS output before injection.

6. **Destructive Unbounded `batchClear` Before `batchUpdate` & Missing Rate Limiting**
   - **Evidence**: `cmsWorkspaceAdapter.ts:508–520` (`values:batchClear` `A:ZZ`), `googleWorkspaceApi.ts:766–777` (`values:batchClear` `A1:Z1000` after `A1:Z500` read cap), `worker/src/index.ts` (zero rate limiting).
   - **Risk**: Network/quota failure between clear and update deletes live user spreadsheet data; missing Worker rate limits allow abuse on OAuth, Sync, and public Form submission routes.
   - **Remediation**: Replace blind `batchClear` with staged tab writes or header-matched row upserts; remove `A1:Z500` read truncation; add per-user / per-IP rate limiting on Worker endpoints.

### MEDIUM
7. **Raw Upstream Google API Error Propagation & Cross-Account Cache Leakage**
   - **Evidence**: `googleWorkspaceApi.ts:214, 233`, `cmsWorkspaceAdapter.ts:72`, `App.tsx:2371`.
   - **Risk**: Raw upstream Google error messages (`body.error.message`) and `syncError` strings are surfaced directly to UI banners and `localStorage`; switching Google accounts fails to clear `site.cms.storageHealth` Drive IDs.
   - **Remediation**: Map Google API errors to structured, sanitized domain error codes on the Worker; store full correlation details server-side in `sync_jobs`/`audit_events`; scope cached storage health metadata by `(site_id, google_subject)` or move it to Worker D1.

8. **Client-Side Fake Async Progress**
   - **Evidence**: `src/components/modals/PublishModal.tsx:81–103`.
   - **Risk**: Hardcoded 500ms `setTimeout` steps simulate a server release pipeline and do not await actual Google Sheet `VersionHistory` persistence.
   - **Remediation**: Only report progress/completion from real backend/sync operations (`SyncJob` or release persistence confirmation).

### LOW
9. **Client-Side Hardcoded Placeholder Actor & Demo IDs in Production Paths**
   - **Evidence**: `CmsInboxView.tsx:467–468` (`'owner'`, `'Studio Owner'`), `App.tsx:3162–3164` (`'demo_sheets'`, `'demo_spreadsheet'`, `'owner_local'`).
   - **Risk**: Confuses multi-user audit attribution and masks unconfigured Workspace destinations.
   - **Remediation**: Populate actor identity strictly from verified Supabase session claims (`AuthContext` / Worker session) and require explicit configured `data_source` instead of silent demo fallbacks when not in Demo Mode.

---

## Section F — Phased Implementation Plan (Awaiting Approval)

| Phase | Scope & Deliverables | Exact Target Files |
|---|---|---|
| **Phase 1: Immediate Reliability & Validation Hotfixes** | Fix `Title is required.` / `Project Title is required.` across `post`, `project`, and all `titleFieldKey` schemas; fix Thai/Unicode blank-slug generation via `ensureUniqueRecordSlug`; route `CmsRecordEditor` saves through `saveCmsRecord()`; add inline field-level error highlighting; fix blank number->0 coercion and `CmsContentTypeBuilder` `schemaVersion` bump; harden `sanitizeRichHtml`, `redirectUrl` protocol check, `</style>` CSS escaping, and Worker CORS fail-closed check. | `src/components/cms/CmsRecordEditor.tsx`, `src/components/cms/CmsWorkspaceModal.tsx`, `src/components/cms/CmsContentTypeBuilder.tsx`, `src/services/cms/cmsValidation.ts`, `src/services/cms/cmsService.ts`, `src/services/cssCompiler.ts`, `src/components/builder/ElementRenderer.tsx`, `worker/src/index.ts`, `worker/src/routes/googleOAuth.ts` (+ comprehensive Vitest regression suite) |
| **Phase 2: Sheet Schema Stabilization & Staged Migration Tooling** | Fix duplicate `'title'` header in `cmsWorkspaceAdapter.ts`; add `site_id`, `owner_account_id`, `trashedAt`, `deleted_by` normalization; eliminate `A1:Z500` read cap and blind `batchClear` overwrite; enforce `RAW` + `escapeSheetFormulaCell` in `googleWorkspaceApi.ts`; implement non-destructive Backup + Staging validation + Migration Preview workflow (requires explicit owner run/confirmation). | `src/services/cms/cmsWorkspaceAdapter.ts`, `src/services/googleWorkspaceApi.ts`, `src/types/cms.ts`, `worker/src/routes/sheets.ts` |
| **Phase 3: Worker Backend Authority & Google Workspace Proxy** | Add D1 migration `0002_cms_workspace_resources.sql` (`sites`, `workspace_resources`, `data_sources`, `sync_jobs`, `audit_events`); add Worker routes for Drive folder listing (explicit picker only, no global Drive scan), Drive file metadata/import, Sheets read/upsert/append, CMS SyncJobs, VersionHistory/Inbox live Sheet sync, and rate-limited `/api/public/forms/:formId/submit`; update frontend `workspaceApiClient.ts` to call Worker instead of browser GIS where authenticated. | `worker/migrations/0002_cms_workspace_resources.sql`, `worker/src/routes/drive.ts`, `worker/src/routes/sheets.ts`, `worker/src/routes/sync.ts`, `worker/src/routes/publicForms.ts`, `worker/src/index.ts`, `src/features/workspace-connection/*`, `src/services/drivePageRegistryService.ts` |
| **Phase 4: CMS Management Workspace & Inbox Upgrades** | Wire `transitionCmsRecordStatus`, `duplicateCmsRecord`, `deleteCmsRecordPermanently`, `bulkActionCmsRecords` into `CmsWorkspaceModal.tsx`; add table checkboxes, sorting, pagination, Trash/Restore view, Clear All Data scoped flow with dry-run & audit log, Overview operational dashboard, Data Sources / Sync Activity / Audit tabs; replace `window.confirm` in `CmsInboxView.tsx` with accessible confirmation modal and live Sheet sync. | `src/components/cms/CmsWorkspaceModal.tsx`, `src/components/cms/CmsInboxView.tsx`, `src/components/cms/CmsSyncActivityView.tsx`, `src/components/cms/CmsClearDataModal.tsx`, `src/App.tsx` |
| **Phase 5: Drive Folder Picker, Drive Import & Bidirectional Sheets UI** | Replace static Drive Folders tab in `GoogleSetupModal.tsx` with interactive Folder Picker (binding `resource_id` in D1); build Drive File Import modal (allowlist, MIME/size check, deduplication, `includeSubfolders`, preview); split Sheets sync into explicit **Import from Google Sheets** (header-mapping + dry-run + conflict rule) and **Export / Sync to Google Sheets** (upsert by `recordId`); replace fake `setTimeout` progress in `PublishModal.tsx` with real release + `VersionHistory` sync status. | `src/components/modals/GoogleSetupModal.tsx`, `src/components/cms/DriveImportModal.tsx`, `src/components/cms/SheetsSyncWizardModal.tsx`, `src/components/sheets/SheetsEditorModal.tsx`, `src/components/modals/PublishModal.tsx` |
| **Phase 6: Security Hardening, E2E Verification & Regression Tests** | Verify all Vitest unit/integration tests, Worker security boundary tests (CORS, OAuth state, resource ownership, formula escaping, rate limiting), `tsc --noEmit`, `npm run lint`, and `npm run build` / `compile_applet`. | `src/**/*.test.ts(x)`, `worker/**/*.test.ts` |

---

## Stop Gate

Phase 0 audit is complete. **No application source files or user Google Sheets were modified.**  
Awaiting owner approval of `/SHEET_STRUCTURE_INVENTORY.md` and `/CMS_RELIABILITY_AUDIT.md` before beginning Phase 1.
