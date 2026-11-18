# Migration and Acceptance Plan

## 1. Audit before implementation

The implementation agent must first inspect the actual codebase and report:
- Current router and route compatibility.
- Existing Auth and Google OAuth flows.
- Existing Supabase/Firebase usage and exact responsibilities.
- Current Project/Website/CMS/Inbox data models.
- Existing Drive/Sheets resource creation and lookup behavior.
- Builder CMS binding and standalone CMS capability, if any.
- Existing publish/runtime flow.
- Existing source export implementation.
- Existing tests and deployment configuration.

Do not infer current behavior from these target documents.

## 2. Gap report

For each target capability, classify:
- Existing and compliant.
- Existing but partially compliant.
- Existing but incompatible.
- Missing.
- Unknown / cannot verify.

Include exact files/modules and evidence. Do not claim a feature is tested if it was not run.

## 3. Recommended phases

### Phase 0 — Audit and decision confirmation
- Produce current-state architecture and gap matrix.
- Identify data migration risks.
- Confirm unresolved Organization/Google connection/navigation decisions.
- No broad refactor or destructive migration.

### Phase 1 — Workspace foundation
- Account → Organization → Project model.
- Server-side limits and authorization.
- Console and Project Dashboard.
- Idempotent Drive folder provisioning.
- Preserve existing Builder functionality and route compatibility.

### Phase 2 — Module registry and shared services
- ProjectModules registry.
- Shared CMSService/repository.
- Standalone CMS UI connected to the same data as Builder.
- Inbox and Assets service boundaries.
- No duplicated CMS storage.

### Phase 3 — Site capability and shared Runtime
- Site entity and global slug registry.
- Project-to-Site relationship.
- Immutable publish snapshots.
- Runtime resolver and page-scoped public data access.
- Private/public boundary tests.

### Phase 4 — Data migration and spreadsheet partitioning
- Inventory current workbook/files and all records.
- Explicit mapping from old tabs to new per-dataset spreadsheets.
- Preserve stable record IDs and rich-content references.
- Verify row counts, IDs, required fields, relationships, and file parents.
- Keep rollback/backup until reconciliation passes.
- Do not delete old data until owner approves and verification is complete.

### Phase 5 — UX hardening and release
- Thai/English localization.
- Responsive/accessibility QA.
- Loading/empty/error/retry states.
- Performance and quota tests.
- Documentation and release checklist.

## 4. Acceptance criteria

### Workspace
- Account can access only authorized Organizations.
- Project cannot be accessed through a forged URL/ID.
- 10 Organization and 10 Project limits are enforced server-side.
- Project is not treated as a Website in domain logic.
- Module availability is distinct from authorization.

### CMS
- Builder and standalone CMS read/write the same records.
- Changes from either surface are reflected in the other.
- No duplicate storage is created.
- Pagination and validation work.
- Dataset file resolution uses trusted registry.

### Drive/Sheets
- Resources are created in the correct folder parents.
- Reconnect/retry does not create duplicates.
- Dataset spreadsheets are separated as specified.
- No unnecessary empty datasets are created.
- Batch operations and pagination are used.

### Site/Runtime
- A Site is resolved independently of Project identity.
- Published snapshot is immutable.
- Failed publish leaves previous live version active.
- Runtime fetches only page-required public data.
- Private Inbox data cannot be retrieved publicly.
- Cache does not expose private or draft data.

### Source export
- Export occurs only on explicit user action.
- ZIP contains no secrets/private Inbox data.
- Dynamic dependencies and limitations are documented.

### Quality
- No unresolved P0/P1 defects.
- Critical flows have automated or reproducible tests.
- Typecheck, lint, build, and relevant tests pass where configured.
- Report includes actual commands and results.

## 5. Migration safety

- Back up source datasets before migration.
- Build deterministic old→new resource mapping.
- Use idempotent migration jobs.
- Verify record counts and stable IDs.
- Verify relationships and rich-content references.
- Keep old data read-only during cutover if feasible.
- Do not delete old files/tables until owner approves after reconciliation.
