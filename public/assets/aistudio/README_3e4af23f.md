# Builly — Shared Runtime Architecture Pack

**Decision:** Shared Runtime for all published Builly websites.

Builly is a config-driven website builder:
- Users design websites in the existing Visual Builder.
- Builder saves editable page/document configuration as JSON in Google Drive.
- All published sites use one shared Builly Runtime on Cloudflare.
- Runtime resolves the site, loads its published configuration, renders the design, and retrieves only the required CMS data through trusted backend services.
- Forms submit to the configured Inbox dataset.
- HTML/CSS/JS source export is generated only when the user requests a download. It is not required for the published website to run.
- Supabase Auth is for Builly identity/session only. Supabase Database/Storage are not canonical storage for site config, CMS, Inbox, assets or source exports.

## Documents
1. `docs/SHARED_RUNTIME_SYSTEM_ARCHITECTURE.md`
2. `docs/CONFIG_SCHEMA_AND_RENDERING_CONTRACT.md`
3. `docs/DATA_STORAGE_AND_SPREADSHEET_PARTITIONING.md`
4. `docs/PUBLISH_RUNTIME_CACHE_AND_SECURITY.md`
5. `docs/SOURCE_EXPORT_AND_DOWNLOAD.md`
6. `docs/MIGRATION_AND_ACCEPTANCE_PLAN.md`
7. `prompts/GOOGLE_AI_STUDIO_SHARED_RUNTIME_MASTER_PROMPT.md`

## Implementation rule
Start with codebase and Drive audit. Do not rewrite the existing Builder, CMS, Inbox or publish flow blindly. Do not access GitHub. Do not migrate or delete production data until the owner approves an evidence-based migration plan.
