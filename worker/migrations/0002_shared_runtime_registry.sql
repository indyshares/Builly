-- Cloudflare D1 Schema: Shared Runtime Trusted Site Registry, Resource Pointers, Idempotency & Rate Limits.
-- NOTE: Canonical website configs, CMS records, Inbox submissions, and assets remain in Google Drive & Sheets.
-- This schema stores ONLY routing/resource pointers and ephemeral operational guards.

CREATE TABLE IF NOT EXISTS site_registry (
  site_id TEXT PRIMARY KEY,
  site_slug TEXT NOT NULL UNIQUE,
  custom_domain TEXT,
  owner_id TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  active_publish_version TEXT NOT NULL DEFAULT '',
  active_build_id TEXT NOT NULL DEFAULT '',
  publish_manifest_drive_file_id TEXT NOT NULL DEFAULT '',
  runtime_config_drive_file_id TEXT NOT NULL DEFAULT '',
  integrity_hash TEXT NOT NULL DEFAULT '',
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_registry_slug ON site_registry (site_slug);
CREATE INDEX IF NOT EXISTS idx_site_registry_domain ON site_registry (custom_domain);
CREATE INDEX IF NOT EXISTS idx_site_registry_owner ON site_registry (owner_id);

CREATE TABLE IF NOT EXISTS site_release_history (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  site_slug TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  publish_version TEXT NOT NULL,
  build_id TEXT NOT NULL,
  runtime_config_drive_file_id TEXT NOT NULL,
  publish_manifest_drive_file_id TEXT NOT NULL,
  integrity_hash TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  commit_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_release_history_site ON site_release_history (site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_dataset_resources (
  resource_id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  domain_kind TEXT NOT NULL, -- 'cms' | 'inbox' | 'system'
  dataset_key TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  worksheet_name TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_dataset_site ON site_dataset_resources (site_id, domain_kind, dataset_key);

CREATE TABLE IF NOT EXISTS site_form_destinations (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  form_name TEXT NOT NULL DEFAULT 'Contact Form',
  category_id TEXT NOT NULL DEFAULT 'cat_inquiry',
  destination_spreadsheet_id TEXT NOT NULL,
  destination_worksheet_name TEXT NOT NULL DEFAULT 'CONTACT_SUBMISSIONS',
  inbox_registry_spreadsheet_id TEXT NOT NULL DEFAULT '',
  field_mappings_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  UNIQUE(site_id, form_id)
);

CREATE TABLE IF NOT EXISTS form_submission_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  inbox_item_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'persisted' | 'partial_error'
  error_detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
