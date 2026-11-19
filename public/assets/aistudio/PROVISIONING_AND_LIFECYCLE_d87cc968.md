# Provisioning and Lifecycle

## General rules

All operations must be idempotent and retry-safe. Generate stable IDs and operation IDs before creating resources. Persist Drive IDs, verify actual parent IDs and read-after-write. Use trusted Drive appProperties/markers to recover partial operations. Never scan all Drive or identify resources by name alone.

## First Google connection / root bootstrap

1. User signs in with Supabase Auth.
2. User explicitly connects Google.
3. Backend validates Google identity and binds it to Builly Account.
4. Store refresh token encrypted server-side.
5. Search this Google account's My Drive for a Builly root using trusted marker metadata.
6. If one valid root exists, validate it and reuse it.
7. If none exists, create `My Drive/Builly/`, `System/`, and `Organizations/`.
8. Create account manifest, organizations index and resource registry.
9. Verify parents and read-after-write.
10. Build/update derived D1 Site Index from canonical Drive registry.

If multiple candidate roots exist, stop and ask user. Do not create another root automatically.

## Create Organization

Preconditions: valid session, connected Google, verified account manifest, below 10 Organization limit.

1. Generate org ID and operation ID.
2. Create Organization folder under `Organizations/`.
3. Create `Projects/` child.
4. Create `organization.json`.
5. Update organizations index and account manifest with revision/conflict checks.
6. Verify contents and actual Drive parents.
7. Refresh authorized cache.

On retry, resume the same operation and reuse folders/files. Do not create duplicates.

## Create Project

Preconditions: Organization is owned by Account, active, and below 10 Project limit.

1. Generate project ID and operation ID.
2. Verify Organization manifest and Projects folder.
3. Create Project folder.
4. Create `Config/`, `Data/`, `Assets/`, `Exports/`.
5. Create project.json and minimal modules.json.
6. Do not create CMS/Inbox spreadsheets until enabled/used.
7. Update Organization Project index.
8. Verify parents and read-after-write.
9. Refresh cache.

Project is generic; do not automatically create a Site unless Website capability is explicitly enabled.

## Enable module

Validate module and dependencies; update modules.json with revision check; create only required resources; register them canonically; verify; mark enabled only after provisioning succeeds (or use explicit provisioning state).

## Create Site

Require Site capability. Generate site_id and globally unique site_slug. Reject reserved slugs such as console, orgs, projects, builder, workspace and s. Create Site folder and manifests; register in canonical Drive registry; update D1 derived index. Site is not public until successful publish.

## Publish

Validate config/components/assets/public CMS fields/forms; create immutable snapshot; verify Runtime compatibility; update canonical Site active-version pointer; update D1 index; invalidate/version cache. Failed publish keeps prior version active. If D1 update fails after Drive commit, queue repair.

## Lifecycle

Archive before hard delete. Archived records count toward 10/10 limits until permanently deleted. Hard delete requires explicit confirmation, dependency checks and backup/export guidance. Never delete outside Builly root.

---

## Multi-file Provisioning Consistency

Organization, Project, module, Site, and publish workflows must be implemented as idempotent Saga steps. Preallocate stable resource IDs and an `operation_id`; journal intent before side effects; inspect before create; persist discovered Drive IDs; verify every step; and mark complete only after all canonical Drive postconditions pass. Retry resumes the same operation and never creates replacement IDs. Ambiguous duplicates, wrong parents, revision conflicts, or uncertain ownership stop in `needs_reconciliation`. Prefer forward recovery over automatic deletion/rollback. See `TRANSACTION_AND_RECOVERY.md`.
