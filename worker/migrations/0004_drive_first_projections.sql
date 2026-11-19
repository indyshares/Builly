-- Cloudflare D1 Schema: Drive-First Operational Projections, Repair Queue, Public Artifacts, & Management Cache
-- D1 remains a rebuildable operational projection; Google Drive (My Drive/Builly/) is canonical.

PRAGMA foreign_keys = ON;

-- 1. Operational mirror of canonical Drive Operation Journal (My Drive/Builly/System/Operations/)
CREATE TABLE IF NOT EXISTS operations_projection (
  operation_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'in_progress', 'retryable', 'needs_reconciliation', 'completed', 'failed', 'cancelled')
  ),
  target_json TEXT NOT NULL DEFAULT '{}',
  steps_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT NOT NULL DEFAULT '',
  drive_journal_file_id TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  fencing_token INTEGER NOT NULL DEFAULT 0,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_proj_owner_status ON operations_projection (owner_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_ops_proj_scope ON operations_projection (scope_key, status);

-- 2. D1 projection repair queue (enqueued when Drive succeeds and D1 projection fails)
CREATE TABLE IF NOT EXISTS projection_repair_queue (
  repair_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  operation_id TEXT NOT NULL DEFAULT '',
  canonical_revision INTEGER NOT NULL DEFAULT 1,
  drive_file_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reconciling', 'completed', 'failed')),
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proj_repair_owner_status ON projection_repair_queue (owner_id, status, created_at);

-- 3. Derived public-safe immutable runtime artifacts (strictly scrubbed; zero secrets, zero Inbox, zero drafts)
-- Rebuilt from Drive Published/*.json. Allows public site serving even if owner OAuth is later disconnected.
CREATE TABLE IF NOT EXISTS public_runtime_artifacts (
  site_id TEXT NOT NULL,
  publish_version TEXT NOT NULL,
  build_id TEXT NOT NULL DEFAULT '',
  integrity_hash TEXT NOT NULL DEFAULT '',
  snapshot_json TEXT NOT NULL,
  drive_file_id TEXT NOT NULL DEFAULT '',
  indexed_at TEXT NOT NULL,
  PRIMARY KEY (site_id, publish_version)
);

CREATE INDEX IF NOT EXISTS idx_pub_artifacts_site ON public_runtime_artifacts (site_id, indexed_at DESC);

-- 4. Authenticated owner-scoped read-only management cache for OAuth/Drive outage fallback
-- Never served on /api/public/*; never holds OAuth tokens.
CREATE TABLE IF NOT EXISTS management_cache (
  cache_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL DEFAULT '',
  canonical_revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mgmt_cache_owner ON management_cache (owner_id, resource_type, resource_id);

-- 5. Additive projection metadata columns on existing 0002/0003 D1 projection tables
ALTER TABLE organizations ADD COLUMN canonical_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN projected_at TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN projection_status TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE organizations ADD COLUMN last_operation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE organizations ADD COLUMN drive_manifest_file_id TEXT NOT NULL DEFAULT '';

ALTER TABLE projects ADD COLUMN canonical_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN projected_at TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN projection_status TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE projects ADD COLUMN last_operation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN drive_manifest_file_id TEXT NOT NULL DEFAULT '';

ALTER TABLE sites ADD COLUMN canonical_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sites ADD COLUMN projected_at TEXT NOT NULL DEFAULT '';
ALTER TABLE sites ADD COLUMN projection_status TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE sites ADD COLUMN last_operation_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sites ADD COLUMN drive_manifest_file_id TEXT NOT NULL DEFAULT '';

ALTER TABLE site_registry ADD COLUMN canonical_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE site_registry ADD COLUMN indexed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE site_registry ADD COLUMN last_verified_at TEXT NOT NULL DEFAULT '';
ALTER TABLE site_registry ADD COLUMN projection_status TEXT NOT NULL DEFAULT 'synced';
ALTER TABLE site_registry ADD COLUMN last_operation_id TEXT NOT NULL DEFAULT '';

ALTER TABLE workspace_resources ADD COLUMN canonical_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workspace_resources ADD COLUMN last_operation_id TEXT NOT NULL DEFAULT '';

ALTER TABLE console_operation_idempotency ADD COLUMN payload_hash TEXT NOT NULL DEFAULT '';
