# Migration & Acceptance Plan

## Phase 0 — Audit only
Inspect actual existing application:
- Builder document schema and save/load service
- publish/preview/runtime routes
- current Cloudflare deployment and routing
- existing CMS/Inbox services and spreadsheet registry
- Drive folder/file IDs and parent relationships
- Supabase Auth, Database and Storage usage
- current source export or generated code implementation
- cache behavior and invalidation

Produce an audit with exact file paths, service calls, storage locations, current data flows and gaps. Do not modify code or production data.

## Phase 1 — Shared Runtime foundation
- Implement site resolution using trusted registry.
- Add shared Runtime entry and route handling.
- Keep existing Builder intact.
- Support one test site in staging first.
- Load immutable published config snapshot.
- Render a small verified component set before expanding coverage.

## Phase 2 — Configuration contract
- Map existing Builder schema to Runtime schema.
- Define schema version and component registry.
- Add validation and compatibility checks.
- Keep draft and published snapshots separate.
- Do not replace the existing Builder model without migration proof.

## Phase 3 — Data services
- Separate Sheets by dataset/content type.
- Migrate combined workbook only after mapping/backup/staging verification.
- Resolve data sources through backend registry.
- Implement public CMS query allowlists and private owner CMS APIs.
- Implement protected form submission to Inbox datasets.

## Phase 4 — Publish and cache
- Immutable snapshot publication.
- Atomic active pointer switch after validation.
- Versioned cache and invalidation.
- Rollback to previous publish snapshot.

## Phase 5 — Source export
- Generate downloadable ZIP on explicit owner action.
- Verify export does not become a runtime dependency.
- Verify no secrets/private Inbox content included.

## Phase 6 — Security, performance and regression
Test:
- multi-site isolation
- host/path resolution
- unpublished draft never public
- public CMS field allowlist
- private Inbox denial
- form destination cannot be overridden by browser
- cache invalidation after publish/content update
- unsupported component handling
- responsive rendering
- large page/config performance
- API quota and Sheets latency
- retry/idempotency
- source export completeness and secret scanning
- Builder editing/save/load regression
- CMS/Inbox CRUD regression
- Preview/Publish/History/Rollback regression

## Acceptance criteria
- All published sites use one shared Runtime deployment.
- Runtime selects site by trusted host/path registry.
- Runtime reads published JSON snapshots, not draft documents.
- Runtime renders page design, theme, responsive rules and supported components.
- Runtime fetches only the required public CMS datasets.
- Visitors cannot access Inbox/private Sheets/Drive resources.
- Forms write only to server-configured Inbox destinations.
- CMS and Inbox datasets are partitioned into separate spreadsheets.
- Supabase Auth remains identity/session only; Supabase DB/Storage are not canonical site data stores.
- Source HTML/CSS/JS ZIP is generated only when user requests download.
- Published site works even when no source export has ever been generated.
