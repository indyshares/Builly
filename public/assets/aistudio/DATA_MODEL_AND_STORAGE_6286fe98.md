# Data Model and Storage

## 1. Ownership boundaries

```text
Account
└── Organization
    └── Project
        ├── ProjectModules
        ├── ProjectResources
        ├── CMS datasets
        ├── Inbox datasets
        ├── Assets
        └── optional Sites
            ├── SiteDomains
            └── SitePublishVersions
```

Stable IDs are required for all entities and records. Never use spreadsheet row numbers as permanent identifiers.

## 2. Core entities

| Entity | Key fields (illustrative) | Purpose |
|---|---|---|
| Account | `account_id` | Builly authenticated identity; may map to Supabase Auth user ID |
| Organization | `organization_id`, `owner_account_id`, `name`, `status` | Tenant/workspace boundary |
| OrganizationMember | `organization_id`, `account_id`, `role`, `status` | Future collaboration/authorization |
| Project | `project_id`, `organization_id`, `name`, `status` | General product workspace |
| ProjectModule | `project_id`, `module_key`, `enabled`, `config_ref` | Enabled capabilities |
| ProjectResource | `resource_id`, `project_id`, `domain`, `dataset_key`, `drive_file_id`, `worksheet_id`, `folder_id`, `schema_version` | Trusted resource mapping |
| Site | `site_id`, `project_id`, `slug`, `status`, `active_publish_version_id` | Optional public website instance |
| SiteDomain | `site_domain_id`, `site_id`, `hostname`, `path_prefix`, `verification_status` | Public hostname/path mapping |
| SitePublishVersion | `publish_version_id`, `site_id`, `snapshot_ref`, `runtime_version`, `created_at`, `published_by` | Immutable published snapshot |
| DriveFolder | `folder_id`, `owner_scope_type`, `owner_scope_id`, `purpose`, `drive_folder_id` | Drive folder registry |
| SyncOperation | `operation_id`, `project_id`, `operation_type`, `status`, `idempotency_key` | Retry/reconciliation |
| AuditEvent | `event_id`, `scope_type`, `scope_id`, `actor_id`, `action`, `created_at` | Important change history |

This is a logical model, not a requirement to create every table immediately. Inspect current schema and reuse compatible entities.

## 3. Control-plane vs data-plane storage

Recommended target split, subject to owner approval and codebase audit:

### Supabase Auth
- Builly identity/session only.
- Not a substitute for Google Workspace consent.

### Supabase Postgres (candidate for control plane)
- Account-to-Organization ownership/membership.
- Organization and Project metadata.
- Module enablement.
- Site slug/domain uniqueness and active publish pointers.
- Trusted resource registry or pointers needed for authorization/routing.
- Operational state for idempotent operations.

### Google Drive
- Organization and Project folder hierarchy.
- Configuration documents/snapshots.
- Assets and source exports.
- Spreadsheet files and other project-owned resources.

### Google Sheets
- Structured CMS datasets.
- Structured Inbox datasets.
- Other project datasets where Sheets is appropriate.

Do not store canonical CMS, Inbox, project config, or assets in Supabase merely to simplify implementation if this conflicts with the agreed data ownership model.

## 4. Google Drive folder structure

```text
Builly/
└── {Organization}/
    ├── {Project}/
    │   ├── Config/
    │   ├── Data/
    │   │   ├── CMS/
    │   │   │   └── {Dataset}.spreadsheet
    │   │   └── Inbox/
    │   │       └── {Dataset}.spreadsheet
    │   ├── Assets/
    │   └── Exports/
    └── ...
```

Persist folder IDs. Folder names are for readability, not identity. When moving/creating files, verify actual Drive parent IDs with Drive API; creating a spreadsheet does not guarantee it is in the intended folder.

## 5. Spreadsheet partitioning

Each dataset should have its own spreadsheet file. Do not combine all CMS and Inbox datasets into one workbook.

Example CMS datasets (create only when used):
- Posts
- Projects
- Services
- Testimonials
- TeamMembers
- Events
- Slides
- FAQs
- Categories
- Tags
- Relationship datasets where needed

Example Inbox datasets:
- Submissions
- SubmissionFields
- InboxCategories
- InboxNotes
- InboxActivity

System/control datasets may be split by domain if stored in Sheets, but the preferred control-plane registry should be transactional and trusted.

Rules:
- Do not create empty files for disabled/unimplemented modules.
- Do not create one spreadsheet per record.
- Use stable record IDs.
- Use schema versions and explicit column mappings.
- Resolve duplicate headers through explicit schema mapping; never discard ambiguous columns by guess.
- Batch operations; avoid API calls inside per-row loops.
- Paginate and load only the selected dataset or page-required public dataset.
- Do not scan all Drive.

## 6. CMS content model

- Content records are rows in the relevant dataset spreadsheet.
- Complex rich content may reference a Drive JSON/file resource using a stable reference.
- Builder and standalone CMS use the same CMS service and resource registry.
- CMS field schema should define field key, label, type, required, validation, default, and supported UI.
- Relationships should use stable IDs, not row numbers or display names.

## 7. Inbox model

- Submissions are stored as rows in `Submissions`.
- Dynamic field definitions may be stored in `SubmissionFields`.
- Notes/categories/activity are separate datasets where those capabilities are enabled.
- Form-to-destination mapping is stored server-side.
- Public browser submits a `form_id` and validated payload; backend resolves the destination resource.
