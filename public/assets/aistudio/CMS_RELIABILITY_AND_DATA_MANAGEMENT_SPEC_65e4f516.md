# Builly CMS Reliability & Data Management Specification

**Version:** 1.0  
**Status:** Proposed specification  
**Scope:** CMS Content Types, Posts, Projects, Google Workspace data management

---

## 1. Objectives

แก้ปัญหาความน่าเชื่อถือและการจัดการข้อมูลของ CMS ให้ผู้ใช้เข้าใจสถานะได้และควบคุมข้อมูลของตนเองได้ โดยไม่ทำให้ข้อมูลสูญหายหรือเปิดช่องให้ผู้ใช้เข้าถึงข้อมูลข้ามบัญชี

### Required outcomes

1. บันทึก Post/Project ได้เมื่อข้อมูล Title ถูกต้อง แม้ field mapping หรือ validation ภายในจะมีหลายชั้น
2. Error message ต้องชี้ field ที่ผิดจริง ไม่แสดง `Title is required` แบบคลุมเครือ
3. มี CMS Management สำหรับจัดการ records อย่างเป็นระบบ
4. รองรับ delete รายการ, bulk delete และ clear-all โดยมี safeguards
5. ผู้ใช้เห็นขั้นตอนและผลลัพธ์ของ Drive/Sheets operations
6. Drive import ทำงานเฉพาะ Folder ที่ user เลือกและอนุญาตเท่านั้น
7. Sheets sync มี source/target ที่ชัดเจน และไม่เขียนผิด Spreadsheet/Worksheet
8. มี audit trail และ recovery สำหรับงานที่ล้มเหลวบางส่วน

---

## 2. Bug: Title is required although Title is filled

### 2.1 Observed symptom

หน้าสร้าง Post และ Project แสดง validation error:
- `Title is required.`
- `Project Title is required.`

ขณะเดียวกันช่องชื่อรายการมีข้อความอยู่แล้ว

ภาพหน้าจอเพียงอย่างเดียวไม่สามารถยืนยัน root cause ได้ ต้อง trace end-to-end จาก UI form ถึง backend/data adapter

### 2.2 Required investigation

ตรวจสอบอย่างน้อย:

1. UI field binding: input value, state key, onChange
2. Form submit payload: key และ value ที่ส่งจริง
3. Content Type schema: title field key, label, required flag, field type
4. Field mapping ระหว่าง display label, API key และ Sheet header
5. Validation function: อ่าน key ใด, normalize ค่าอย่างไร
6. Create/update service: payload ถูก transform หรือ strip field หรือไม่
7. Sheet header matching: ใช้ stable field key หรือ display label
8. Thai/English labels และ legacy schema compatibility
9. Create flow กับ edit flow ใช้ validator คนละตัวหรือไม่
10. Error aggregation: server error ถูก map กลับ field อย่างไร

### 2.3 Likely failure classes to test (not assumed root causes)

- UI stores value under `title` แต่ validator อ่าน `post_title` หรือ `name`
- schema field key ไม่ตรงกับ form field key
- payload serializer ตัด key ที่ไม่อยู่ใน allowlist
- validation runs against stale state
- display label `Title` ถูกใช้เป็น key ในบางจุด แต่อีกจุดใช้ `title`
- hidden/system field mapping is inconsistent
- update/create code paths differ
- whitespace normalization or wrong value path causes empty value

### 2.4 Required design

Define one canonical mapping per Content Type:
- `field_key`: immutable machine key, e.g. `title`
- `label`: localized display label, e.g. `Title` / `ชื่อรายการ`
- `type`
- `required`
- `system_role`: optional semantic role such as `primary_title`, `slug`, `created_at`
- `default`
- `validation`

For existing content types, create a compatibility mapping. Do not rename sheet headers or mutate schema silently.

### 2.5 Validation contract

- Frontend validation improves UX but backend validation is authoritative.
- Both must validate the same canonical field keys and rules.
- Normalize strings consistently (trim leading/trailing whitespace) without altering meaningful internal whitespace.
- Treat `null`, `undefined`, empty string and whitespace-only string consistently for required text fields.
- A valid non-empty title must pass.
- Error response must include stable `field_key`, machine-readable `code`, and localized display message.
- Do not return only a generic string if field-level information is available.
- Log validation failure metadata without logging sensitive submitted content unnecessarily.

Example logical response:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "fields": [
      {
        "field_key": "title",
        "code": "REQUIRED",
        "message": "Title is required."
      }
    ]
  }
}
```

This is a contract example, not a mandate to adopt this exact transport format if the current API has an established equivalent.

### 2.6 Acceptance tests

- Post title entered and saved successfully.
- Project title entered and saved successfully.
- Missing title is rejected and field is highlighted.
- Whitespace-only title is rejected.
- Existing records can be edited without changing title.
- Thai and English labels map to the same field key.
- Legacy content types remain readable.
- Invalid field mapping returns actionable diagnostics, not a false missing-title error.

---

## 3. CMS Management Workspace

The existing CMS workspace should become a real management interface, not only a connection/settings screen.

### 3.1 Navigation model

Recommended information architecture:

- Overview
- Content
  - Posts
  - Projects
  - Other Content Types
- Content Types & Schemas
- Categories & Tags
- Data Sources
- Google Workspace
  - Drive Folders
  - Sheets Connections
  - Sync Activity
- Data Management
  - Import / Export
  - Trash / Recovery
  - Maintenance
  - Audit Log

Preserve existing navigation and map it into this structure. Do not remove existing functionality.

### 3.2 Content list management

Each Content Type gets a table/list view with:
- Title / primary field
- Status
- Category / tags where applicable
- Updated time
- Created time
- Source data source / worksheet where useful
- Search
- Filters
- Sort
- Pagination
- Row selection
- Bulk actions

Actions:
- View
- Edit
- Duplicate (if supported)
- Delete
- Restore (if soft-deleted)
- Export selected records (if supported and safe)

### 3.3 Delete semantics

Use soft delete by default:
- Mark record as deleted/archived with `deleted_at`, `deleted_by`, and status metadata where the storage model permits.
- Exclude soft-deleted records from normal lists.
- Provide Trash with restore and permanent-delete controls.
- Permanent deletion requires stronger confirmation and explicit permission.
- Never permanently delete a record that is still referenced by a published site/build without impact analysis and an explicit policy.
- Bulk delete must show exact selection count and scope.

### 3.4 Clear all data

A "Clear all data" operation is high risk and must not be a casual button.

Required flow:
1. User chooses scope: current Content Type, selected Data Source, current Site, or entire Builly CMS workspace.
2. UI displays exact target name and estimated record count.
3. Explain what is deleted, what is retained, and whether restore is possible.
4. Require explicit confirmation; for workspace-wide operation require typing a confirmation phrase or equivalent deliberate confirmation.
5. Backend re-checks owner, permission, scope and dependencies.
6. Execute as a tracked job with progress and final report.
7. Write audit event.
8. If partial failure occurs, show which partitions succeeded/failed and provide recovery guidance.
9. Never interpret an empty/missing scope as "all data".
10. Do not delete Google Drive folders or entire spreadsheets as a side effect unless user explicitly selects that exact destructive action and confirms it separately.

### 3.5 CMS overview

Overview should show operational status, not decorative dashboard metrics:
- Workspace connection status
- Active Data Sources
- Last successful Drive import
- Last successful Sheets sync
- Failed/pending operations
- Recent content activity
- Actionable next step when setup is incomplete

---

## 4. Data ownership and access boundaries

- Every CMS resource must be associated with authenticated Builly owner/account.
- Every site-level resource must include `site_id`.
- Every data source must have explicit ownership and scope.
- Every API operation must authorize owner + resource relationship server-side.
- Never trust `owner_id`, `site_id`, `spreadsheet_id`, `worksheet_id` or folder IDs supplied by browser without checking registry and permissions.
- Prevent IDOR: user A cannot read, modify, delete or sync user B's content by changing request IDs.
- Public form submissions must only append to the published form's preconfigured destination.
- Internal CMS management endpoints require authenticated owner session.

---

## 5. Data model principles

Do not decide to replace all Sheet structures before audit.

Target principles:
- Stable IDs, never row numbers as permanent identifiers.
- Explicit schema version.
- Stable `field_key` separated from display label.
- Registry tables for Sites, Content Types, Data Sources, Drive Folders, Worksheets and Sync Jobs.
- Content records stored in a predictable, documented structure.
- Operation log for long-running sync/import/delete tasks.
- Soft-delete metadata and audit events.
- Idempotency key for retryable operations.
- Timestamps in consistent ISO-8601 UTC format, display localized in UI.
- Avoid duplicating full record payload in registries; store references and operational metadata.

Potential logical entities (map to current architecture before creating):
- `Sites`
- `ContentTypes`
- `ContentTypeFields`
- `DataSources`
- `DataSourceGrants` (if sharing is supported)
- `DriveFolderRegistry`
- `SheetResourceRegistry`
- `ContentRecords` or per-content-type worksheets
- `SyncJobs`
- `AuditEvents`
- `Trash` / deletion metadata

These are logical entities, not a mandate that every entity must become a separate worksheet. Minimize spreadsheet count and cross-sheet complexity.

---

## 6. Reliability and consistency

Google Sheets and Drive do not provide a cross-service transaction. Design operations as recoverable workflows:
- Validate all inputs before writing.
- Persist operation intent/job record before multi-step execution where feasible.
- Use idempotency keys.
- Record per-step state.
- Retry transient failures with bounded exponential backoff.
- Do not retry non-idempotent writes blindly.
- Reconcile partial success before retry.
- Surface partial failure clearly.
- Avoid duplicate records on retry.
- Batch reads/writes.
- Use LockService only if the architecture is Apps Script-based; for Cloudflare Worker architecture use an appropriate concurrency/idempotency mechanism.
- Do not claim success until required persistence is confirmed.

---

## 7. Security requirements

- OAuth tokens and refresh tokens must never be exposed to browser JavaScript, localStorage, logs or client error messages.
- Use least-privilege Google OAuth scopes.
- Restrict Drive operations to explicit user-selected folders and authorized descendants.
- Validate MIME type, size and file type on server.
- Sanitize imported content before rendering.
- Protect against CSV/formula injection when exporting to Sheets/CSV.
- Apply rate limits to public and authenticated endpoints as appropriate.
- CSRF protections where cookie-based auth is used.
- Validate origin/redirect URI and OAuth state/PKCE where applicable.
- Escape output to prevent stored XSS in CMS content.
- Do not expose raw provider errors or credentials.
- Audit destructive operations and permission changes.
- Keep secrets in server-side secret management.
- Encrypt sensitive tokens at rest.
- Define retention and recovery policies.

---

## 8. Acceptance criteria

- [ ] Filled Post Title saves successfully.
- [ ] Filled Project Title saves successfully.
- [ ] Required validation correctly rejects empty/whitespace title.
- [ ] UI and backend use canonical field keys.
- [ ] Content lists support search/filter/sort/pagination.
- [ ] Single and bulk soft delete work.
- [ ] Trash restore works where supported.
- [ ] Clear-all is scoped, deliberate, audited and recoverable where possible.
- [ ] CMS overview reports real operation status.
- [ ] Cross-account resource access is denied server-side.
- [ ] No token appears in browser storage or logs.
- [ ] Partial failures are visible and recoverable.
