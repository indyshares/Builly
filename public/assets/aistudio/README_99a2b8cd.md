# Builly Final Drive-First Architecture

Confirmed: Google Drive My Drive/Builly is canonical for user business/workspace data; Google Sheets holds structured CMS/Inbox datasets; Cloudflare D1 Site Registry is a derived, rebuildable runtime index; one Google connection per Builly Account; OAuth outage means read-only cache; Supabase Auth is identity only; Cloudflare Workers provide backend and shared Runtime.

Files:
- docs/FINAL_ARCHITECTURE.md
- docs/DRIVE_DATA_MODEL.md
- docs/PROVISIONING_AND_LIFECYCLE.md
- docs/CACHE_AND_RUNTIME_INDEX.md
- docs/SECURITY_AND_FAILURE_MODES.md
- schemas/*.schema.json
- prompts/GOOGLE_AI_STUDIO_IMPLEMENTATION_PROMPT.md

This is a target design, not proof of current implementation. Audit existing D1, OAuth, Drive, publishing and routes before migration.

## Added in this revision

- `docs/TRANSACTION_AND_RECOVERY.md` — normative Saga, revision, idempotency, locking, journal, recovery, projection repair, and acceptance-test specification.
- Existing architecture, data model, provisioning, cache/runtime, security, and Google AI Studio implementation prompt updated to reference and enforce the consistency model.
