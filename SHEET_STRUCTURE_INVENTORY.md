# Builly Google Sheet & Drive Storage Structure Inventory & Migration Plan

**Phase:** Phase 0 — Audit Only (Read-Only Assessment)  
**Status:** Awaiting Owner Approval (Zero live Sheets, Drive files, or application code modified)  
**Governing Specs:** `SHEET_STRUCTURE_MIGRATION_PLAN.md`, `CMS_RELIABILITY_AND_DATA_MANAGEMENT_SPEC.md`, `GOOGLE_WORKSPACE_SYNC_SPEC.md`

---

## 1. Executive Summary

Builly currently stores and reads portfolio, CMS, release history, and form submission data across **three overlapping persistence surfaces**:
1. **Browser `localStorage` Site & Workspace State** (`src/services/storageService.ts`, `src/data/initialSite.ts`) — acts as the de facto runtime source of truth even when Google Workspace is connected.
2. **Primary Google Spreadsheet (`Builly Portfolio` / `PORTFOLIO_SHEET_SCHEMA`)** (`src/services/googleWorkspaceApi.ts:12–148`) — defines **13 core tabs** for portfolio content, release registry, and Unified Inbox.
3. **CMS Sheets & Drive Extension (`cmsWorkspaceAdapter.ts`)** (`src/services/cms/cmsWorkspaceAdapter.ts:198–397`) — appends **7 CMS registry tabs** + **N per-content-type record tabs** (8 built-in + custom types = 15+ extra tabs in the same spreadsheet) plus Drive JSON files (`/CMS/cms-manifest.json` and `/CMS/RichContent/<docId>.json`), while the **Cloudflare Worker D1 database** (`worker/migrations/0001_workspace_oauth.sql`) currently stores only OAuth states and encrypted Google tokens.

Key structural hazards identified during audit:
- **Duplicate `title` column** inside `CMS_REC_POST`, `CMS_REC_PROJECT`, and custom types (`cmsWorkspaceAdapter.ts:338, 346`), causing header/key collisions on pull (`rowMap['title']`).
- **Dual Portfolio vs CMS data split** (`PROJECTS` vs `CMS_REC_PROJECT`, plus `PROFILE`/`SKILLS`/`EXPERIENCE`/`EDUCATION` outside CMS).
- **Destructive clear-and-overwrite writes** (`batchClear` over `'A:ZZ'` in `cmsWorkspaceAdapter.ts:508–520` and `'A1:Z1000'` in `googleWorkspaceApi.ts:766–777`) combined with a silent `A1:Z500` read cap (`googleWorkspaceApi.ts:484`), risking data loss on partial failures or sheets > 500 rows.
- **`USER_ENTERED` formula-injection exposure** in `googleWorkspaceApi.ts:595, 682, 809` (`saveTabsToSpreadsheet`, `createPortfolioSpreadsheet`, `initializeMissingTabsInSpreadsheet`).
- **Silent error swallowing and stale/disconnected tabs**: `VersionHistory`, `InboxRegistry`, `InboxCategories`, `InboxNotes`, and `InboxActivity` are updated in client state (`App.tsx`) but not reliably persisted to live Google Sheets via backend authority; `pullCmsFromGoogleWorkspace` silently catches and ignores Sheets read failures (`cmsWorkspaceAdapter.ts:781–783`).

---

## 2. Current Spreadsheet, Tab, Column & Drive Artifact Inventory

### 2.1 Primary Spreadsheet Tabs (`PORTFOLIO_SHEET_SCHEMA` in `src/services/googleWorkspaceApi.ts:12–148`)

Spreadsheet discovery/creation: `googleWorkspaceApi.ts:624–686` (`createPortfolioSpreadsheet`) and `src/data/initialSite.ts:5–250` (`DEFAULT_TABS` demo seed).

| Tab Name | Purpose | Current Columns | Key / ID Mechanism | Read / Write Mode & Consumers | Structural Risks |
|---|---|---|---|---|---|
| `META` | Global portfolio site metadata | `key`, `value` | `key` string | `googleWorkspaceApi.ts` (`readSpreadsheetTabs` `A1:Z500`, `saveTabsToSpreadsheet` `batchClear A1:Z1000` + `USER_ENTERED`); `SheetsEditorModal.tsx` | No `site_id` or `owner_account_id`; `USER_ENTERED` unescaped |
| `PROFILE` | Hero/about profile fields | `id`, `fullName`, `headline`, `subheadline`, `about`, `location`, `email`, `avatarUrl` | `id` | Same as `META`; `ElementRenderer.tsx`, `compilerService.ts` | Separated from CMS; `USER_ENTERED` unescaped |
| `PROJECTS` | Legacy portfolio projects table | `id`, `title`, `category`, `summary`, `year`, `imageUrl`, `liveUrl`, `featured` | `id` | Same as `META`; overlaps with `CMS_REC_PROJECT` | Dual source of truth alongside `CMS_REC_PROJECT` |
| `SKILLS` | Skills list | `id`, `name`, `level`, `category` | `id` | Same as `META` | Legacy table not linked to CMS |
| `EXPERIENCE` | Career timeline | `id`, `company`, `role`, `period`, `description` | `id` | Same as `META` | Legacy table not linked to CMS |
| `EDUCATION` | Academic history | `id`, `institution`, `degree`, `period`, `details` | `id` | Same as `META` | Legacy table not linked to CMS |
| `SOCIAL_LINKS` | Social links | `id`, `platform`, `label`, `url` | `id` | Same as `META` | Legacy table not linked to CMS |
| `VersionHistory` | Immutable release & rollback registry | `version_id`, `site_id`, `version_number`, `release_name`, `description`, `build_id`, `artifact_url`, `snapshot_id`, `manifest_url`, `artifact_hash`, `status`, `is_active`, `created_at`, `created_by`, `deleted_at`, `deleted_by` | `version_id` | Mutated in memory via `syncVersionHistoryTab` (`App.tsx:2840–2907`) and read by `PublishModal.tsx` | **Not automatically persisted to live Google Sheets** on release/rename/soft-delete unless user triggers `saveTabsToSpreadsheet` |
| `InboxRegistry` | Unified form submission inbox | `submission_id`, `owner_account_id`, `site_id`, `form_id`, `form_name`, `category_id`, `category_name`, `page_id`, `page_title`, `submitted_at`, `status`, `summary_title`, `summary_subtitle`, `payload_json`, `destination_type`, `destination_spreadsheet_id`, `destination_worksheet_id`, `destination_row_ref`, `sync_status`, `sync_error`, `attachment_refs_json`, `updated_at` | `submission_id` | Appended in client `App.tsx:3141–3238`; displayed in `CmsInboxView.tsx`; `CmsWorkspaceModal.tsx` | Only persists to live Sheet if owner GIS token happens to be in browser memory; errors caught/swallowed (`App.tsx:3235`); **cannot work for anonymous public visitors** |
| `InboxCategories` | Inbox triage categories | `category_id`, `name`, `slug`, `color`, `is_system`, `created_at` | `category_id` | `App.tsx`, `CmsInboxView.tsx` | Lacks `site_id`; client edits in `CmsInboxView` are never pushed to Sheets automatically |
| `InboxNotes` | Internal admin notes per submission | `note_id`, `submission_id`, `author_id`, `author_name`, `note`, `created_at` | `note_id` | `App.tsx:3241–3259`, `CmsInboxView.tsx` | Lacks `site_id` / `owner_account_id`; edits stay in `localStorage` only; hardcoded `'owner'` / `'Studio Owner'` in `CmsInboxView.tsx:467–468` |
| `InboxActivity` | Submission status/note audit trail | `activity_id`, `submission_id`, `action`, `actor_id`, `actor_name`, `detail`, `created_at` | `activity_id` | `App.tsx:3241–3259`, `CmsInboxView.tsx` | Lacks `site_id`; only kept in client state unless manual Sheets save occurs |
| `CONTACT_SUBMISSIONS` | Default contact form worksheet | `id`, `name`, `email`, `message`, `submittedAt`, `status` | `id` | `App.tsx:3141–3238`, `initialSite.ts` | Uses legacy `id`/`submittedAt`; written via `USER_ENTERED` if triggered via `saveTabsToSpreadsheet` |

### 2.2 Dynamic CMS Tabs (`src/services/cms/cmsWorkspaceAdapter.ts:198–397`)

Created and overwritten by `syncCmsToGoogleWorkspace` (`cmsWorkspaceAdapter.ts:487–556`) and read by `pullCmsFromGoogleWorkspace` (`cmsWorkspaceAdapter.ts:561–826`). Uses `valueInputOption: 'RAW'` and `escapeSheetFormulaCell()` on CMS writes, **but executes destructive `batchClear` over `'A:ZZ'` before `batchUpdate` (`cmsWorkspaceAdapter.ts:508–520`)**.

| Tab Name | Purpose | Current Columns | Key / ID | Structural Risks |
|---|---|---|---|---|
| `CMS_CONTENT_TYPES` | Schema definitions | `id`, `slug`, `singularLabel`, `pluralLabel`, `description`, `icon`, `isBuiltIn`, `routable`, `routePrefix`, `titleFieldKey`, `schemaVersion`, `fieldsJson`, `createdAt`, `updatedAt` | `id` | No `site_id` or `owner_account_id`; `fieldsJson` stores full array in one cell |
| `CMS_TAXONOMIES` | Taxonomy definitions | `id`, `slug`, `singularLabel`, `pluralLabel`, `hierarchical`, `contentTypeIdsJson` | `id` | No `site_id` |
| `CMS_TERMS` | Taxonomy terms | `id`, `taxonomyId`, `name`, `slug`, `parentId`, `description`, `order` | `id` | No `site_id` |
| `CMS_RECORD_TERMS` | Normalized Record ↔ Term join rows | `recordId`, `taxonomyId`, `termId` | Composite (`recordId`, `taxonomyId`, `termId`) | Rebuilt only for active `cms.records` |
| `CMS_RELATIONSHIPS` | Content Type relationship definitions | `id`, `key`, `label`, `sourceTypeId`, `targetTypeId`, `cardinality`, `inverseLabel` | `id` | No `site_id` |
| `CMS_RECORD_RELATIONS` | Normalized Record ↔ Record links | `sourceRecordId`, `fieldKey`, `targetRecordId` | Composite | Silent orphan risk if target deleted outside `deleteCmsRecordPermanently` |
| `CMS_MIGRATION_LOG` | Schema evolution audit log | `id`, `contentTypeId`, `fromVersion`, `toVersion`, `timestamp`, `summary` | `id` | `schemaVersion` is not bumped in `CmsContentTypeBuilder.tsx:166–180` |
| `CMS_REC_<TYPE>` (built-ins: `CMS_REC_POST`, `CMS_REC_PROJECT`, `CMS_REC_SERVICE`, `CMS_REC_TESTIMONIAL`, `CMS_REC_TEAM_MEMBER`, `CMS_REC_EVENT`, `CMS_REC_SLIDE`, `CMS_REC_FAQ`, plus custom `CMS_REC_*`) | Records per Content Type | Base (8 cols): `recordId`, `status`, `slug`, `title`, `revision`, `schemaVersion`, `sortOrder`, `updatedAt` + **all `ct.fields` keys** + `richContentRefsJson`, `termIdsJson`, `relationIdsJson`, `createdAt`, `publishedAt` | `recordId` | **1. Duplicate `'title'` column** on `post`, `project`, and custom types (since base adds `'title'` at line 338 AND `ct.fields` maps `'title'` again at line 346). **2. Missing `trashedAt`, `deleted_at`, `deleted_by`, `site_id`, `owner_account_id`.** **3. Pull uses `rowMap[fk]` (`cmsWorkspaceAdapter.ts:699`), overwriting on duplicate headers, and ignores Sheets read failures (`781–783`).** |

### 2.3 Google Drive Artifacts (`cmsWorkspaceAdapter.ts`, `drivePageRegistryService.ts`, `assetService.ts`)

| Artifact / Folder | Location | Consumer / Producer | Structural & Reliability Risks |
|---|---|---|---|
| Portfolio Root Folder (`Builly`) | `workspace.driveFolder.id` or Drive query `name = 'Builly' and trashed = false` | `drivePageRegistryService.ts:102–113`, `googleWorkspaceApi.ts:691–702`, `assetService.ts:334` | **Implicit global Drive scan**: attaches to any accessible folder named `Builly` if stored ID is missing/unverified |
| `<Root>/CMS/cms-manifest.json` | Drive JSON blob (`CmsDocument` metadata, forms, inbox, settings) | `cmsWorkspaceAdapter.ts:446–482, 608–620` | Contains `forms`, `inboxSubmissions`, `inboxCategories`, `settings`, etc. (Sheets and Drive hold separate copies of CMS metadata without conflict resolution) |
| `<Root>/CMS/RichContent/<docId>.json` | Per-rich-field Drive JSON file | `cmsWorkspaceAdapter.ts:461–478, 636–661` | Cleared/recreated; relies on `site.cms.storageHealth.cmsFolderDriveId` cached in `localStorage` |
| `<Root>/Pages/...` & `<Root>/Assets/...` | Page drafts & uploaded media assets | `drivePageRegistryService.ts`, `assetService.ts` | Client-side GIS bearer token calls directly from browser |

### 2.4 Backend Database Schema (`worker/migrations/0001_workspace_oauth.sql`)

| Table | Purpose | Columns | Notes |
|---|---|---|---|
| `oauth_states` | Short-lived CSRF/PKCE state | `state_hash`, `owner_id`, `code_verifier`, `redirect_origin`, `expires_at`, `used_at`, `created_at` | Clean server-side security pattern already in D1 |
| `google_workspace_connections` | Encrypted Google OAuth refresh token vault | `owner_id`, `google_subject`, `google_email`, `scopes`, `encrypted_refresh_token`, `token_version`, `connected_at`, `updated_at`, `revoked_at`, `last_refresh_at`, `last_error` | Refresh tokens live strictly on Worker D1, **but no `sites`, `data_sources`, `workspace_resources`, `sync_jobs`, or `audit_events` tables exist yet** |

---

## 3. Target Logical Data Model (Minimal, Safe, Dual-Plane Architecture)

Per `SHEET_STRUCTURE_MIGRATION_PLAN.md` §3 and `GOOGLE_WORKSPACE_SYNC_SPEC.md` §5, Builly should **not** proliferate redundant spreadsheets or store application auth/audit registries solely in editable spreadsheet cells. Instead, combine the **Worker D1 Authoritative Control Plane** with **Normalized User Google Sheet Tabs**:

### 3.1 Worker D1 Control-Plane Tables (New Migrations `0002_*`)
1. `sites` (`site_id`, `owner_id`, `name`, `domain`, `default_locale`, `created_at`, `updated_at`) — binds every site explicitly to its authenticated Supabase `owner_id`.
2. `workspace_resources` (`resource_id`, `owner_id`, `site_id`, `google_subject`, `resource_type` [`drive_folder` | `spreadsheet`], `google_file_id`, `display_name`, `verified_at`, `revoked_at`) — replaces arbitrary client-supplied `fileId`/`spreadsheetId` and global `name='Builly'` scans.
3. `data_sources` (`data_source_id`, `owner_id`, `site_id`, `source_type` [`google_sheet` | `drive_folder` | `cms_collection`], `spreadsheet_id`, `worksheet_title`, `content_type_id`, `field_mapping_json`, `import_rules_json`, `created_at`, `updated_at`) — explicit user-selected Folder/Spreadsheet/Worksheet connections.
4. `sync_jobs` (`job_id`, `owner_id`, `site_id`, `data_source_id`, `direction` [`import_from_sheet` | `export_to_sheet` | `drive_import` | `clear_all`], `status` [`idle` | `validating` | `queued` | `running` | `succeeded` | `completed_with_warnings` | `failed` | `needs_attention` | `cancelled`], `idempotency_key`, `total_items`, `processed_items`, `failed_items`, `warnings_json`, `error_summary`, `started_at`, `finished_at`).
5. `audit_events` (`event_id`, `owner_id`, `site_id`, `actor_id`, `action`, `target_type`, `target_id`, `metadata_json`, `created_at`).

### 3.2 Canonical Google Spreadsheet Structure (Existing Workbook, Normalized In-Place via Staged Migration)

Keep the user's single portfolio spreadsheet as the user-visible data store, applying targeted schema normalization rather than fragmenting into extra spreadsheets:
- **`CMS_REC_<TYPE>` Tabs (Canonical Records Tabs)**:
  - Fixed header order with **deduplicated field keys** (skip `f.key` if already in base headers `'recordId' | 'status' | 'slug' | 'title'`):
    - System columns: `recordId`, `site_id`, `owner_account_id`, `status`, `slug`, `title`, `revision`, `schemaVersion`, `sortOrder`, `createdAt`, `updatedAt`, `publishedAt`, `trashedAt`, `deleted_by`
    - Schema custom field columns: `...ct.fields.filter(f => !SYSTEM_COL_SET.has(f.key)).map(f => f.key)`
    - Relational/JSON link columns: `richContentRefsJson`, `termIdsJson`, `relationIdsJson`
- **`CMS_CONTENT_TYPES`, `CMS_TAXONOMIES`, `CMS_TERMS`, `CMS_RECORD_TERMS`, `CMS_RELATIONSHIPS`, `CMS_RECORD_RELATIONS`, `CMS_MIGRATION_LOG`**:
  - Retain current tab names and columns, adding `site_id` column (defaulting to current `site.id` during backfill) so multi-site workbooks never mix schemas or terms.
- **`CMS_FORMS` (Optional / Recommended Sheet Backup Tab alongside Manifest)**:
  - `form_id`, `site_id`, `name`, `category_id`, `destination_type`, `destination_spreadsheet_id`, `destination_worksheet_id`, `field_mapping_json`, `status`, `updated_at` — mirrors `cms.forms` so public form submissions routed through the Worker can resolve form destinations server-side without relying on the owner's browser memory.
- **`VersionHistory`, `InboxRegistry`, `InboxCategories`, `InboxNotes`, `InboxActivity`**:
  - Add `site_id` to `InboxCategories`, `InboxNotes`, `InboxActivity` (already present on `VersionHistory` and `InboxRegistry`); enforce append/upsert writes through Worker APIs using `valueInputOption: 'RAW'` and `escapeSheetFormulaCell()`.
- **Legacy Portfolio Tabs (`META`, `PROFILE`, `PROJECTS`, `SKILLS`, `EXPERIENCE`, `EDUCATION`, `SOCIAL_LINKS`, `CONTACT_SUBMISSIONS`)**:
  - **Preserve 100% intact during migration** (do not delete; enforce `RAW` + `escapeSheetFormulaCell()` on writes and remove the 500-row `A1:Z500` read cap via dynamic range reads `A1:ZZ` / metadata row count). Optionally surface a non-destructive "Import Legacy `PROJECTS` into CMS Projects" helper in Phase 2/4.

---

## 4. Old-to-New Mapping Table

| Current Source | Current Column / Field | Target Location | Target Column / Field | Transformation Rule |
|---|---|---|---|---|
| `CMS_REC_POST` / `CMS_REC_PROJECT` | Base `title` + duplicate `title` from `fields` (`cmsWorkspaceAdapter.ts:338,346`) | Canonical `CMS_REC_<TYPE>` | Single `title` column | Merge non-empty `fields.title \|\| record.title` into canonical `title` and keep `fields[schema.titleFieldKey]` synchronized |
| `CMS_REC_<TYPE>` | *(missing)* | Canonical `CMS_REC_<TYPE>` | `site_id`, `owner_account_id` | Backfill from active `site.id` and verified `owner_id` |
| `CMS_REC_<TYPE>` | *(missing)* | Canonical `CMS_REC_<TYPE>` | `trashedAt`, `deleted_by` | Backfill `""` for active/published/draft/archived; ISO timestamp if `status === 'trash'` |
| `CMS_CONTENT_TYPES` | `schemaVersion`, `fieldsJson` | `CMS_CONTENT_TYPES` + `site_id` | `site_id`, `schemaVersion`, `fieldsJson` | Add `site_id`; increment `schemaVersion` whenever fields mutate |
| `PROJECTS` (legacy tab) | `id, title, category, summary, year, imageUrl, liveUrl, featured` | **Preserved** (`PROJECTS`); optional explicit import to `CMS_REC_PROJECT` | Mapped: `recordId` (`leg_proj_<id>`), `title`, `fields.summary`, `fields.year`, `fields.cover_image`, `fields.live_url`, `fields.featured` | Read-only safe import only if user opts in; never deletes `PROJECTS` |
| `VersionHistory` (client-only drift) | Client `workspace.spreadsheet.tabs` | Worker D1 + Live Sheet `VersionHistory` | Same 16 columns | Sync via Worker Sheets append/upsert on every release, rename, edit, delete, restore |
| `InboxNotes`, `InboxActivity`, `InboxCategories` | Client `cms.inbox*` + `Inbox*` tabs | Live Sheet `Inbox*` tabs + `site_id` | Existing columns + `site_id` | Backfill `site_id`; stop replacing missing values with `'demo_sheets'` / `'owner_local'` |
| `workspace.driveFolder` / `storageHealth.*` | `localStorage` unverified IDs | Worker D1 `workspace_resources` | `resource_id`, `owner_id`, `site_id`, `google_file_id` | Migrate existing user-confirmed folder/spreadsheet IDs into D1 on first authenticated session |

---

## 5. Duplication, Collision & Orphan Inventory

1. **Duplicate Header Bug (`CMS_REC_POST`, `CMS_REC_PROJECT`, Custom Types)**:
   - `cmsWorkspaceAdapter.ts:338` pushes `'title'`, then line 346 spreads `fieldKeys` which includes `'title'`. In Google Sheets, `values` writes two `'title'` columns (`D` and `I`), while `rowMap[hdr]` on line 699 overwrites the first `'title'` with the second (or leaves stale value if one cell was edited manually in Sheets).
2. **Duplicate Project Entities (`PROJECTS` vs `CMS_REC_PROJECT`)**:
   - Portfolio sites have seeded projects in `PROJECTS` (`initialSite.ts`) and CMS projects in `CMS_REC_PROJECT` (`cmsDefaults.ts`). Neither syncs to the other.
3. **Read-vs-Clear Range Asymmetry**:
   - `googleWorkspaceApi.ts:484` reads only `A1:Z500`, whereas `saveTabsToSpreadsheet` (`googleWorkspaceApi.ts:771`) clears `A1:Z1000` and `cmsWorkspaceAdapter.ts:512` clears `A:ZZ`. Any Sheet with >500 rows loaded through `readSpreadsheetTabs` and saved back loses rows 501–1000.
4. **Orphan & Dead-Reference Risks**:
   - Deleting a record via `CmsWorkspaceModal.tsx:114` (`handleDeleteRecord`) currently filters it out of `cms.records` without detaching `relationIdsByField` in other records or deleting `richDocs[docId]` (orphaning entries in `CMS_RECORD_RELATIONS` and `<Root>/CMS/RichContent/*.json`).
   - Re-linking or switching Google accounts (`App.tsx:2371`) resets `workspace.spreadsheet` but leaves `site.cms.storageHealth.cmsFolderDriveId` and `manifestDriveFileId` pointing to the previous Google account's Drive files!

---

## 6. Migration Risk Assessment

| Risk | Likelihood | Impact | Mitigation Before Execution |
|---|---|---|---|
| Data wipe from partial `batchClear` failure | High | Critical | Eliminate blind `batchClear` prior to write; write updated/Staging tabs first or use header-aware row updates / staging sheet copy before atomic swap |
| Breaking existing published Builder/Form/Sheet bindings | Medium | High | Preserve all legacy tab names (`PROJECTS`, `CONTACT_SUBMISSIONS`, `VersionHistory`, `InboxRegistry`, `CMS_REC_*`) and keep additive columns appended or header-mapped by name rather than column index |
| Losing manually edited spreadsheet rows (>500 rows) | Medium | High | Replace `A1:Z500` hardcoded range with unbounded `'TabName'!A:ZZ` or sheet `gridProperties.rowCount` before any backup/migration read |
| Cross-site or cross-account overwrite | High | Critical | Enforce `(owner_id, site_id, google_subject)` scoping in Worker D1 `workspace_resources` before reading/writing any Sheet |
| Formula execution / corruption (`=`, `+`, `-`, `@`) | High | High | Switch all `valueInputOption` calls from `'USER_ENTERED'` to `'RAW'` and normalize through `escapeSheetFormulaCell()` |

---

## 7. Staged Migration Plan (Not Executed — Requires Owner Approval)

Per `SHEET_STRUCTURE_MIGRATION_PLAN.md` §6–8, **no live Sheet mutations will occur until approved**. Proposed stages:

1. **Stage 1 — Pre-Migration Inventory & Immutable Backup**:
   - Read live workbook metadata and full-range tab values (`A:ZZ`, no 500-row cap) via Worker API.
   - Create an automatic timestamped backup copy of the entire spreadsheet in the user's selected Google Drive folder (`Builly-Backup-<siteId>-<ISO-date>`) plus export JSON snapshot stored with checksum in Drive/D1.
2. **Stage 2 — Staging Tab Validation**:
   - Create staging tabs (`__STAGING_CMS_REC_POST`, etc.) or test workbook copy.
   - Validate deduplicated headers (`title` appears once), column order, `site_id` backfill, row counts (zero row loss), and formula-safe escaping.
3. **Stage 3 — Explicit Owner Confirmation & Cutover**:
   - Present a non-destructive Migration Preview diff in Workspace Settings (showing old columns vs canonical columns, row counts matched, duplicate `title` cells reconciled).
   - Upon explicit owner confirmation, update headers/rows idempotently (keyed by `recordId` / `submission_id` / `version_id` — never row index).
4. **Stage 4 — Post-Migration Verification & Cleanup**:
   - Verify round-trip read/write fidelity (`CMS_REC_*`, `VersionHistory`, `InboxRegistry`) and verify existing site preview/publish renders identically.
   - Keep backup spreadsheet intact for rollback; drop only temporary `__STAGING_*` tabs after verification passes.

---

## 8. Approval Request

Please confirm if you approve this Sheet inventory, target model, and staged migration approach before any schema migration or live Google Sheet changes are implemented.
