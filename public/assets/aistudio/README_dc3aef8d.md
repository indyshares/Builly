# Builly Project Workspace Architecture Pack

This pack updates Builly's architecture around the confirmed product decision:

> A Project is a general product workspace. It is **not** synonymous with a Website.

A Project can enable multiple modules (Builder, CMS, Inbox, Assets, Publishing, Version History, etc.). These modules may have separate user experiences while sharing the same underlying services and data repositories.

## Documents

| File | Purpose |
|---|---|
| `docs/PRODUCT_AND_WORKSPACE_MODEL.md` | Product concepts, hierarchy, boundaries, and terminology |
| `docs/SYSTEM_ARCHITECTURE.md` | Control plane, data plane, shared services, and deployment architecture |
| `docs/PROJECT_MODULES_AND_UX.md` | Project Dashboard, module navigation, and module responsibilities |
| `docs/DATA_MODEL_AND_STORAGE.md` | Core entities, ownership, Google Drive/Sheets layout, and data rules |
| `docs/SITE_AND_SHARED_RUNTIME.md` | Website as an optional Project capability and shared Cloudflare Runtime |
| `docs/SECURITY_AND_DATA_INTEGRITY.md` | Tenant isolation, OAuth, authorization, publishing, and operational safeguards |
| `docs/MIGRATION_AND_ACCEPTANCE_PLAN.md` | Audit-first migration, phased implementation, and acceptance criteria |
| `prompts/GOOGLE_AI_STUDIO_WORKSPACE_ARCHITECTURE_PROMPT.md` | Master prompt for auditing and implementing the agreed direction |

## Confirmed decisions captured

- Account → Organization → Project → Modules.
- Project is a general workspace, not a Website.
- Builder and standalone CMS are separate UX entry points.
- Builder's in-context CMS capabilities and standalone CMS must use the same CMS service/repository and same records.
- Shared Runtime is used for published Sites on Cloudflare.
- A Site is a capability/entity under a Project; its public slug/domain belongs to the Site, not to the Project.
- Source export is on-demand and is not required to run a published Site.
- Google Drive/Sheets are the intended canonical home for project content/configuration datasets; Supabase may be used for identity and minimal control-plane metadata, subject to codebase audit and owner approval.
- Existing Firebase/Supabase integrations must not be removed until inventoried and migrated safely.

## Important implementation rule

These documents define the target architecture. They do **not** assert that the current codebase already follows it. The implementation agent must inspect the actual repository and report the gap before changing code.
