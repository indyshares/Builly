# Data Storage & Spreadsheet Partitioning

## 1. Storage decisions

| Data | Canonical storage |
|---|---|
| Builder draft document | Google Drive JSON |
| Published config snapshots | Google Drive JSON |
| Theme/schema/form definitions | Google Drive JSON |
| CMS records | Separate Google Sheets files |
| Inbox submissions | Separate Google Sheets files |
| Inbox notes/activity/categories | Separate Google Sheets files |
| Assets | Google Drive files |
| Source export | Generated on demand; downloadable ZIP |
| Identity/session | Supabase Auth |
| Runtime cache | Cloudflare cache, ephemeral only |

Supabase Database and Storage are not canonical storage for website config, CMS, Inbox, assets or source export under this target architecture.

## 2. Spreadsheet partitioning

Do not keep all datasets in one workbook. Do not create one workbook per record. Partition by dataset/content type and operational domain.

Example:

```text
Builly/Data/
├── CMS/{site}/
│   ├── Posts (Spreadsheet)
│   ├── Projects (Spreadsheet)
│   ├── Services (Spreadsheet)
│   ├── Testimonials (Spreadsheet)
│   ├── Categories (Spreadsheet)
│   └── Tags (Spreadsheet)
├── Inbox/{site}/
│   ├── Submissions (Spreadsheet)
│   ├── SubmissionFields (Spreadsheet)
│   ├── InboxCategories (Spreadsheet)
│   ├── InboxNotes (Spreadsheet)
│   └── InboxActivity (Spreadsheet)
└── System/
    ├── Sites (Spreadsheet)
    ├── SiteDomains (Spreadsheet)
    ├── SheetResources (Spreadsheet)
    ├── DriveFolders (Spreadsheet)
    ├── SyncJobs (Spreadsheet)
    └── AuditEvents (Spreadsheet)
```

Create only datasets that are actually used by the site/features. Avoid empty placeholder files for disabled content types.

## 3. Performance

Separate workbooks reduce the amount of unrelated data a feature needs to access, but do not guarantee speed by themselves.

Required:
- Load only the current page's referenced CMS dataset.
- Load only the current CMS list/detail view's spreadsheet.
- Do not enumerate all site spreadsheets on every visitor request.
- Resolve Spreadsheet IDs through a registry and cache registry entries.
- Batch range reads/writes.
- Use bounded pagination and max page sizes.
- Select only required columns.
- Cache public query results with explicit invalidation/versioning.
- Avoid per-cell API calls.
- Avoid unbounded concurrent requests across datasets.

Google Sheets is suitable for modest CMS and form workloads but is not a high-throughput relational database. Monitor API quotas, latency, concurrent writes and workbook size. Define a threshold and migration path if usage exceeds tested limits.

## 4. Registry

Registry records should include:
- `resource_id`
- `owner_account_id`
- `site_id`
- `domain`
- `dataset_key`
- `spreadsheet_id`
- `worksheet_id`
- `folder_id`
- `schema_version`
- `status`
- timestamps

The registry is trusted backend data. Do not accept client-supplied spreadsheet IDs as authorization. Spreadsheet IDs are identifiers, not permissions.

## 5. Cross-spreadsheet consistency

Google Sheets does not provide a transaction across multiple spreadsheet files. For multi-file operations:
- use operation IDs/idempotency keys
- write in deterministic order
- record operation state
- retry safely
- reconcile partial completion
- surface partial failure to the owner

Do not claim a multi-dataset operation succeeded until required writes are verified.
