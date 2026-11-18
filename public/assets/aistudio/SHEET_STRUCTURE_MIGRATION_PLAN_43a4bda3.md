# Builly CMS Sheet Structure — Audit & Migration Plan

## 1. Decision principle

The current Sheet Structure may need redesign, but **do not replace it blindly**. First inventory real spreadsheets, worksheets, headers, records, formulas, named ranges, external references and code dependencies.

A new target structure should improve consistency and management while preserving data and providing rollback.

## 2. Phase A — Inventory

For every connected Builly data source, collect metadata only first:
- Spreadsheet ID and title
- Owner/connected Google account
- Worksheet IDs and titles
- Header row and normalized header keys
- Row/column counts
- Existing stable ID columns
- Formula columns and protected ranges where available
- Named ranges and references
- Current Content Type mapping
- Last modified metadata
- Known consumers in application code

Do not read or export full user content unless required and authorized.

Output:
- `SHEET_STRUCTURE_INVENTORY.md`
- old-to-new field mapping table
- orphan/duplicate worksheet report
- migration risk report

## 3. Phase B — Target logical structure

Prefer a small, explicit registry plus predictable content storage. Avoid one worksheet per tiny metadata entity unless justified.

Potential registry:
- `Builly_System` spreadsheet:
  - `Sites`
  - `ContentTypes`
  - `DataSources`
  - `DriveFolders`
  - `SheetResources`
  - `SyncJobs`
  - `AuditEvents`

Content data:
- Existing per-content-type worksheets may remain where they are healthy.
- If consolidation is justified, use a documented `ContentRecords` model or separate typed worksheets.
- Keep user-facing display labels in schema/config, not as mutable permanent field identifiers.
- Use stable `field_key` and stable `record_id`.
- Store schema version and data source references.

This is a logical target, not a fixed worksheet mandate. AI must recommend the smallest reliable structure based on actual scale and current implementation.

## 4. Phase C — Migration mapping

For each old field/header:
- old spreadsheet + worksheet
- old header
- new `field_key`
- data type
- required status
- transform rule
- null/empty handling
- validation
- conflict/duplicate handling

Special attention:
- `Title`, `Project Title`, `Post Title` and localized labels must map to one canonical semantic field per Content Type.
- Do not assume all content types share identical field keys.
- Preserve legacy header aliases during transition.

## 5. Phase D — Safe migration

1. Back up source spreadsheet metadata and data to a user-approved backup destination.
2. Create target structure in a staging folder/spreadsheet, not production.
3. Validate headers and schema.
4. Copy records in batches.
5. Preserve stable record IDs; generate IDs only when no reliable identity exists and record the mapping.
6. Verify record counts, required fields, representative values, formulas and relationships.
7. Run read-only comparison and discrepancy report.
8. Test create/update/delete against staging.
9. Run application integration tests against staging.
10. Obtain owner approval before cutover.

Never delete or rename source sheets during migration.

## 6. Phase E — Cutover

- Switch one site/content type/data source at a time.
- Record active schema version and target resource IDs.
- Keep old source read-only during observation period.
- Monitor errors and sync activity.
- Provide rollback to old source mapping.
- Do not dual-write unless idempotency and reconciliation are proven.
- Do not remove legacy adapter until all dependent features pass.

## 7. Phase F — Cleanup

Only after explicit approval and successful observation:
- Mark old structures as legacy.
- Offer archive/export.
- Delete old structures only through a separate confirmed maintenance operation.
- Keep migration manifest and audit record.

## 8. Rollback

Rollback must specify:
- Previous source and worksheet IDs
- Previous schema/mapping version
- Writes made after cutover
- Whether reverse sync is safe
- How conflicts are resolved
- Which source is authoritative

Do not promise lossless rollback if writes have occurred in both old and new structures. State limitations clearly.

## 9. Migration acceptance criteria

- [ ] All connected sources inventoried.
- [ ] Mapping covers every active Content Type field.
- [ ] Stable record IDs preserved.
- [ ] Record counts reconcile.
- [ ] Required field values reconcile.
- [ ] No source data deleted during migration.
- [ ] Staging tests pass.
- [ ] Cutover has owner approval.
- [ ] Rollback path documented and tested.
- [ ] Legacy structures retained until cleanup approval.
