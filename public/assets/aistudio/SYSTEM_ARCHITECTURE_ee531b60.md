# System Architecture

## 1. Architecture overview

Use a simple separation between the **control plane** (identity, tenancy, authorization, resource registry) and the **data plane** (Project configuration, CMS content, Inbox records, assets, and exports).

```text
Browser
  ├── Builly Console
  ├── Project Dashboard
  ├── Builder UI
  ├── Standalone CMS UI
  ├── Inbox UI
  └── Assets / Publishing UI
          │
          ▼
Builly trusted backend (Cloudflare Workers / supported server runtime)
  ├── Authentication & authorization
  ├── Organization / Project services
  ├── Module registry service
  ├── CMS service
  ├── Inbox service
  ├── Asset service
  ├── Publish service
  ├── Site registry / Runtime resolver
  └── Google Workspace integration
          │
          ├── Supabase Auth (identity/session)
          ├── Supabase DB (minimal control-plane metadata, if approved)
          └── Google Drive + Google Sheets (Project data plane)
```

The diagram is a target architecture, not a claim about the current implementation.

## 2. Control plane

Responsibilities:
- Resolve authenticated Account identity.
- Manage Organizations and Projects.
- Enforce membership and tenant boundaries.
- Track enabled modules.
- Maintain trusted mappings to Drive folders, Sheets files, Sites, domains, and published versions.
- Resolve public hostname/path to a Site.
- Store operational metadata needed for reliable routing and authorization.

Recommended placement:
- Supabase Auth for Builly identity/session.
- A small transactional database (Supabase Postgres is a candidate) for Account/Organization/Project metadata, membership, module registry, Site slug uniqueness, and resource pointers.
- Cloudflare cache may accelerate public registry reads, but cache is not the canonical registry.
- This placement is an architecture recommendation and must be reconciled with the current codebase and owner-approved storage policy before migration.

Do not put canonical CMS, Inbox, project configuration, or user assets into Supabase Storage/DB merely for convenience if the agreed target is Drive/Sheets.

## 3. Data plane

Intended canonical storage:
- Google Drive: folder/file ownership, configuration documents, asset files, exports.
- Google Sheets: structured datasets such as CMS records and Inbox submissions.
- Cloudflare: shared application/runtime execution and ephemeral caching.
- Supabase: identity plus only the minimum approved control-plane metadata.

Do not use browser localStorage as canonical storage. It may hold non-sensitive UI preferences and transient state only.

## 4. Shared backend services

Separate UX modules should call shared domain services. Do not create separate, duplicated data stores for Builder CMS and standalone CMS.

| Service | Primary responsibilities |
|---|---|
| OrganizationService | Organization CRUD, ownership, limits |
| ProjectService | Project CRUD, lifecycle, organization scope |
| ProjectModuleService | Module enablement and capability checks |
| DriveResourceService | Folder/file lookup, creation, parent verification |
| ProjectResourceRegistry | Map domain resources to Drive/Sheets identifiers |
| ConfigService | Draft config read/write and schema validation |
| CMSService | Content types, records, relationships, validation, pagination |
| InboxService | Form destinations, submissions, notes, categories, activity |
| AssetService | Asset metadata, upload, listing, access checks |
| PublishService | Snapshot creation, validation, activation, rollback |
| SiteResolver | Trusted host/path → Site/Project resolution |
| RuntimeDataService | Public, page-scoped data retrieval |
| ExportService | On-demand source ZIP generation |

Services should own business rules. UI components should not implement storage or authorization rules themselves.

## 5. Deployment model

- Cloudflare is the target hosting/runtime platform.
- Use Cloudflare Workers or the supported Cloudflare server runtime for trusted backend operations.
- Use one shared Builly Runtime deployment for all published Sites.
- Do not introduce a self-managed server unless a verified platform limitation requires it.
- Do not assume a local server is available in production.
- Keep secrets and OAuth refresh tokens server-side, encrypted at rest.

## 6. Request flow examples

### Authenticated Project module
1. Browser sends the authenticated session.
2. Backend validates the session.
3. Backend verifies Organization membership/ownership.
4. Backend verifies Project belongs to that Organization.
5. Backend checks module enabled and user authorized.
6. Domain service resolves resource IDs from trusted registry.
7. Service accesses the appropriate Drive/Sheets resource.
8. Backend returns only the permitted data.

### Public Site request
1. Browser requests `builly.indyshares.com/{site_slug}` or a verified custom domain.
2. Runtime resolves host/path using the trusted Site registry.
3. Runtime loads the active immutable publish snapshot.
4. Runtime fetches only public content required by the requested page.
5. Runtime renders through the allowlisted component registry.
6. Private Inbox data and owner-only resources are never exposed.

## 7. Performance and reliability

- Batch Google Sheets reads/writes.
- Read required ranges once, process in memory, write in batches.
- Use pagination and bounded concurrency.
- Avoid full Drive scans.
- Avoid loading every CMS dataset on initial Project load.
- Use idempotency keys for create/sync/publish operations.
- Apply retry with exponential backoff for transient Google API failures.
- Use operation logs and reconciliation for multi-step operations that cannot be transactional across Drive and Sheets.
- Cache public immutable data; never publicly cache Inbox submissions.
