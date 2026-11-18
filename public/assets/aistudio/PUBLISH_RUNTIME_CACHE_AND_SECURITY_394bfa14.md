# Publish, Runtime, Cache & Security

## 1. Publish lifecycle

1. User edits draft in Visual Builder.
2. Save draft config to Drive.
3. Publish request reaches trusted backend.
4. Backend validates required pages, components, assets, CMS bindings and forms.
5. Backend creates immutable published snapshot.
6. Backend verifies snapshot can be read and is compatible with shared Runtime.
7. Active publish pointer is updated only after validation succeeds.
8. Cloudflare cache is invalidated or versioned.
9. Publish status and version are recorded.
10. Previous published snapshot remains available for rollback.

Never let visitors read mutable draft config.

## 2. Runtime cache

Cache:
- site/host resolution (short TTL, invalidate on domain changes)
- published config by immutable version (longer TTL)
- public CMS query results (bounded TTL, invalidate on content publish/update)
- public asset metadata

Do not cache:
- private Inbox submissions for public access
- owner tokens
- private CMS fields
- authorization decisions across users without correct keying

Prefer immutable config URLs/IDs so config cache does not need unsafe stale overwrites. Cache invalidation must be tied to publish version or data revision.

## 3. Security boundaries

### Visitor access
- only published sites
- only public CMS fields
- only published records
- only public assets
- only form submission endpoint for configured forms

### Owner access
- authenticated Builly identity
- explicit Google Workspace authorization
- backend ownership checks for every Drive/Sheets resource
- granular actions and audit logs

### Never expose to visitor
- Google OAuth access/refresh tokens
- owner Drive folder IDs where not needed
- private Spreadsheet IDs or worksheet IDs
- Inbox records, notes, activity logs
- unpublished/draft CMS data
- internal schema/registry data not needed for rendering

## 4. Runtime hardening
- Treat config and CMS values as untrusted input.
- Sanitize rich text and allowlist HTML.
- Escape output by context.
- Prevent XSS, CSS injection and unsafe URL schemes.
- Never execute arbitrary JS from config.
- Restrict component types and property schemas.
- Validate route parameters and query filters.
- Rate-limit public form submissions.
- Add spam controls and request size limits.
- Use server-side idempotency keys.
- Prevent cross-site/cross-owner resource access.
- Use CSRF/origin protections where applicable.
- Keep OAuth tokens encrypted server-side.
- Do not put secrets in JSON published snapshots.

## 5. Form submission reliability

- Resolve form_id to server-configured destination.
- Validate fields against published form schema.
- Generate submission_id and idempotency key.
- Persist submission metadata and field values to their designated Inbox spreadsheets.
- Record operation state and recover partial writes.
- Return success only when required persistence is confirmed.
- Keep internal notes/activity private to authenticated owner roles.

## 6. Observability
Record:
- publish ID/version
- site ID
- runtime version
- config load outcome
- CMS query latency/outcome
- cache hit/miss
- form submission outcome
- error correlation ID

Never log tokens or full sensitive form payloads unnecessarily.
