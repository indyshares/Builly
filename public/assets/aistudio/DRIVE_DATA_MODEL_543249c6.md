# Drive Data Model

## Root layout

```text
My Drive/Builly/
├── System/
│   ├── account-manifest.json
│   ├── organizations-index.json
│   └── resource-registry.json
└── Organizations/
    └── {org_id}/
        ├── organization.json
        └── Projects/
            └── {project_id}/
                ├── project.json
                ├── Config/
                │   ├── project-config.json
                │   ├── modules.json
                │   ├── builder-document.json
                │   ├── theme.json
                │   └── Sites/{site_id}/
                │       ├── site.json
                │       ├── site-config.json
                │       └── Published/{publish_version_id}.json
                ├── Data/
                │   ├── CMS/{dataset}.spreadsheet
                │   └── Inbox/{dataset}.spreadsheet
                ├── Assets/
                └── Exports/
```

Create only datasets for enabled/used modules. Do not create one spreadsheet per record.

## Canonical documents

`account-manifest.json`: schema_version, builIy_account_id, root_folder_id, system_folder_id, organizations_folder_id, organization_ids, revision, timestamps. Never put OAuth tokens here.

`organizations-index.json`: account ID and list of Organization IDs, names, statuses, folder IDs and manifest file IDs.

`organization.json`: organization_id, owner_account_id, name, slug, status, folder_id, projects_folder_id, revision, timestamps.

`project.json`: project_id, organization_id, name, slug, status, folder_id, config/data/assets/exports folder IDs, enabled_module_keys summary, revision, timestamps.

`modules.json`: project_id, module_key, enabled, config_ref, revision. Module enablement is not authorization.

`resource-registry.json`: resource_id, owner_type/id, resource_type, dataset_key, Drive file ID, MIME type, schema version, status, revision. Partition by Organization/Project if the document grows too large.

`site.json`: site_id, project_id, site_slug, status, active_publish_version_id, site_config_file_id, published_folder_id, revision, timestamps. Site is separate from Project.

Published snapshots are immutable JSON. Include only runtime-required declarative configuration and explicitly public bindings. Never include secrets, private CMS fields, owner metadata or Inbox submissions.

## Sheets rules

- One spreadsheet file per dataset (Posts, Services, Submissions, SubmissionFields, etc.).
- Stable record IDs; never use row numbers as identity.
- Explicit schema/column mappings and schema versions.
- Batch reads/writes, pagination, bounded concurrency.
- Never infer ambiguous duplicate headers or discard columns by guess.
- Builder and standalone CMS share one service/repository.
- Inbox is private and never exposed to public Runtime.

---

## Revision and Operation Metadata

Every mutable canonical manifest/resource must carry a stable ID, monotonically increasing `revision`, `updated_at`, `last_operation_id`, and where applicable `schema_version`. Mutations include `expected_revision`; after acquiring the relevant Durable Object lock, the backend re-reads canonical state and rejects stale writes with `REVISION_CONFLICT`. Per-resource revisions are authoritative; they do not create a cross-file transaction.

Created Drive files/folders should carry trusted `appProperties` where supported: `operation_id`, `resource_id`, `resource_type`, and `schema_version`. Verify actual parent folder IDs; names are not identity. The canonical operation journal is stored under `My Drive/Builly/System/Operations/`. Journal recovery details are defined in `TRANSACTION_AND_RECOVERY.md`.
