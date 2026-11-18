# Builly Google Workspace Sync Specification

**Version:** 1.0  
**Scope:** Google Drive folder selection/import and Google Sheets sync.

---

## 1. Core rule

**Never scan or sync an unspecified Drive/Spreadsheet scope.**

All Drive and Sheets actions must be bound to a resource the user explicitly selected or previously authorized and can inspect.

The UI must always show:
- Connected Google account (safe display identity)
- Selected Drive folder or Spreadsheet
- Selected worksheet/tab where relevant
- Direction of operation
- Scope/count where available
- Current status
- Last result and timestamp

---

## 2. Google Drive import

### 2.1 Folder selection flow

1. Confirm Workspace connection.
2. User opens folder picker.
3. Backend lists only folders accessible to the connected Google account and permitted by granted OAuth scopes.
4. User navigates folder tree or selects a folder.
5. UI shows selected folder name and breadcrumb/path.
6. User confirms import scope.
7. Backend stores selected folder ID and account binding in Builly registry.
8. User starts import.
9. Backend imports only files in the selected folder; include descendants only if the user explicitly chooses "include subfolders".
10. Show discovered/imported/skipped/failed counts and details.

### 2.2 Folder scope rules

- No default to entire Drive.
- No implicit root-folder scan.
- No fuzzy name search across all Drive as a substitute for a selected folder.
- Folder ID is the canonical identifier; folder name/path is display metadata.
- Revalidate that selected folder is still accessible before every import.
- If access is revoked or folder deleted, stop and explain.
- If importing from subfolders, make this explicit in UI.
- Do not follow shortcuts outside the selected scope without an explicit policy and user confirmation.
- Prevent path traversal concepts; rely on Drive IDs and parent relationships.
- Store Google account subject/connection ID with the folder registry to prevent using another account's folder ID.

### 2.3 Folder picker UX

Display:
- My Drive
- Shared drives only if supported and authorized
- Folder name
- Parent breadcrumb
- Modified date / item count where available
- Selected folder summary
- Include subfolders checkbox, default off
- Confirm selection button
- Loading, empty, permission-denied and network-error states

### 2.4 Import safety

- Allowlist supported file types.
- Enforce size limits.
- Validate MIME type from provider metadata and inspect content where appropriate.
- Treat imported content as untrusted.
- Do not execute scripts/macros.
- Do not render HTML/Markdown without sanitization.
- Deduplicate using provider file ID + version/modified metadata.
- Keep an import manifest with file IDs, outcomes and timestamps.
- Provide preview of files to be imported before execution where practical.

---

## 3. Google Sheets sync

### 3.1 Clarify the two operations

The UI currently exposes labels similar to:
- "ซิงค์กับ Google Sheets"
- "ซิงค์ไปยัง Google Sheets"

These labels are ambiguous. Replace with explicit directional language and descriptions.

Recommended:
- **Import from Google Sheets** — read data from selected Spreadsheet/Worksheet into Builly CMS.
- **Export / Sync to Google Sheets** — write Builly CMS data to selected Spreadsheet/Worksheet.

If the existing "Sync CMS with Google Sheets" is bidirectional, do not preserve ambiguity. Define explicit conflict rules and show both directions separately, or use a dedicated two-way sync setup with clear source-of-truth and conflict policy.

### 3.2 Connection setup

For each connection, show:
- Google account
- Spreadsheet name
- Spreadsheet ID masked/secondary
- Worksheet/tab
- Data direction
- Content Type mapping
- Last sync time
- Last status
- Connection status

User must choose or confirm the exact spreadsheet and worksheet. Never silently select an arbitrary first spreadsheet.

### 3.3 Mapping configuration

Before sync:
- Map each CMS `field_key` to a worksheet header/column.
- Show unmapped required fields.
- Show type mismatch warnings.
- Show duplicate header warnings.
- Show what happens to columns not mapped.
- Preview sample rows.
- Confirm import/export direction.
- Do not auto-create or rename columns without user confirmation.
- Do not overwrite unmapped columns.

### 3.4 Sync preview

Before first sync and before a destructive/full sync, show:
- Source and destination
- Direction
- Record count
- New records
- Updated records
- Skipped records
- Potential conflicts
- Potential duplicates
- Columns/fields affected
- Whether existing destination data will be overwritten

Require explicit confirmation when overwrite or destructive effects are possible.

### 3.5 Conflict policy

Define a documented policy per connection:
- Source of truth (CMS or Google Sheet)
- Match key (stable record ID; never row number)
- Update behavior
- Delete behavior (default: no automatic delete propagation)
- Conflict handling (skip, prefer source, or manual review)

Default safe behavior:
- No delete propagation.
- No blind overwrite.
- If both sides changed since last sync, mark conflict and require configured policy/manual resolution.
- Use stable IDs stored in a dedicated column or registry mapping.
- Never use row number as record identity.

---

## 4. Sync operation state machine

Every import/export/sync operation must have a durable job record.

Suggested states:
- `idle`
- `validating`
- `queued`
- `running`
- `succeeded`
- `completed_with_warnings`
- `failed`
- `cancel_requested`
- `cancelled`
- `needs_attention`

Transitions must be validated server-side. UI must not invent state based on button click.

### 4.1 Job record

Suggested fields:
- `job_id`
- `owner_account_id`
- `site_id`
- `connection_id`
- `operation_type`
- `direction`
- `source_resource_id`
- `destination_resource_id`
- `scope_json` (validated, non-secret)
- `status`
- `progress_current`
- `progress_total`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`
- `result_summary`
- `error_code`
- `retryable`
- `idempotency_key`
- `requested_by`

Do not store OAuth tokens or secrets in job records.

### 4.2 UX states

| State | UI |
|---|---|
| Not connected | Explain connection required; connect action |
| Connected, no folder/sheet selected | Prompt user to select resource |
| Ready | Show exact source, destination and operation |
| Validating | Spinner + "Checking access and mapping" |
| Queued | Queued status and job ID/reference |
| Running | Progress if reliable; otherwise indeterminate progress |
| Succeeded | Success toast + durable last-sync record |
| Warnings | Warning summary with skipped/conflict count |
| Failed | Error toast + persistent failure details + retry guidance |
| Needs attention | Explain conflict/permission/schema action needed |
| Cancelled | Confirm cancellation and partial effects, if any |

### 4.3 Toast and activity log

Use toast for immediate feedback:
- Started
- Completed
- Completed with warnings
- Failed
- Cancelled

Use persistent Sync Activity for history:
- Who started it
- When
- Direction
- Exact source/destination
- Status
- Counts
- Error summary
- Retry action where safe

A toast is not a substitute for persistent operation history.

### 4.4 Progress accuracy

- Show numeric progress only if backend can report reliable progress.
- Otherwise show indeterminate progress and stage label.
- Never fake 0–100% animation.
- Poll or subscribe to backend job status.
- On page reload, restore active/recent job state from backend.

### 4.5 Retry and cancellation

- Retry only retryable failures.
- Reuse idempotency strategy to avoid duplicate records.
- Cancellation must be cooperative and report partial completion.
- Do not label a partially completed operation "cancelled successfully" without explaining completed writes.

---

## 5. API and authorization rules

All Google API operations must pass through trusted backend services.

- Browser sends selected `connection_id` and registered resource IDs, not arbitrary raw Google IDs as authority.
- Backend resolves IDs against authenticated owner and connection.
- Re-check ownership and current provider access before action.
- Enforce allowed operation and scope.
- Use server-side OAuth token storage.
- Never expose refresh tokens to client.
- Do not trust client-supplied folder parent, spreadsheet title, worksheet title or owner ID.
- Apply request size limits and rate limits.
- Validate Google API responses and handle pagination.
- Do not leak provider error details or tokens.

---

## 6. Acceptance criteria

- [ ] Drive import cannot run until a folder is selected.
- [ ] Selected folder and scope are visible before import.
- [ ] Import never reads outside selected folder scope.
- [ ] Subfolder inclusion is explicit and defaults off.
- [ ] Folder access is revalidated before each job.
- [ ] Sheets import/export always identifies exact Spreadsheet and Worksheet.
- [ ] Direction is unambiguous.
- [ ] Field mapping preview is available.
- [ ] No arbitrary spreadsheet is selected automatically.
- [ ] Operation status is based on backend job state.
- [ ] Success, warning and failure states are visible.
- [ ] Sync Activity persists after page reload.
- [ ] Retry does not create duplicate records.
- [ ] No delete propagation by default.
- [ ] Cross-account access is denied.
