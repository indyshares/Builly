# Security and Data Integrity

## 1. Identity and consent

- Supabase Auth is Builly identity/session only.
- Google Workspace OAuth is a separate explicit consent for Drive/Sheets access.
- A signed-in Builly user is not automatically authorized to access Google Drive.
- Store refresh tokens encrypted server-side.
- Never expose refresh tokens, client secrets, or privileged API credentials to browser code or localStorage.
- Support revoked/expired consent with clear reconnect and retry UX.

## 2. Tenant isolation

Every authenticated operation must verify:
1. Valid Account session.
2. Organization ownership or membership.
3. Project belongs to the selected Organization.
4. User has permission for the operation.
5. Requested module is enabled.
6. Resource belongs to the authorized Project/Organization.

Never rely on hidden buttons or client-side IDs for security.

## 3. Public/private boundary

Public Runtime may expose only:
- Published configuration.
- Explicitly public CMS fields and records.
- Public assets.
- Public form definitions necessary to render a form.

Never expose:
- Inbox submissions.
- Private CMS fields.
- Drive folder/file IDs unless intentionally public and safe.
- OAuth credentials.
- Internal resource registry.
- Draft configuration.
- Owner/team management metadata.

## 4. Form submission safety

- Browser sends a known `form_id` and payload.
- Backend resolves the destination from trusted configuration.
- Browser cannot choose spreadsheet ID, worksheet ID, Project ID, or arbitrary write destination.
- Validate field names, types, lengths, required fields, spam/rate limits, and allowed origin/site.
- Return minimal public responses; do not leak internal storage errors.

## 5. Reliability and idempotency

Use idempotency for:
- Organization/Project provisioning.
- Drive folder creation.
- Spreadsheet creation.
- Sync jobs.
- Publish operations.
- Export jobs.

For multi-step Drive/Sheets operations:
- Record operation ID and intended resource mapping.
- Verify resource existence and parent placement before creating.
- On retry, reuse existing resources.
- Reconcile partial failures.
- Avoid duplicate files after timeouts.

## 6. Google API performance

- Batch reads/writes.
- Read ranges once, process in memory, write in batches.
- Use pagination.
- Bound concurrency.
- Apply retry/backoff for transient failures and quota responses.
- Avoid Drive-wide scans.
- Cache non-sensitive metadata carefully.

## 7. Audit and recovery

Record important events:
- Organization/Project create/archive/delete.
- Google connection changes.
- Module enablement changes.
- CMS destructive changes where appropriate.
- Form destination changes.
- Publish/rollback.
- Export generation.

Use soft delete where recovery matters. Hard delete requires explicit confirmation and dependency checks.
