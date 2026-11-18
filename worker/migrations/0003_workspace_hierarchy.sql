-- Cloudflare D1 Schema: Account -> Organization -> Project -> Modules -> Site + Workspace Resources
-- Preserves all existing 0001 and 0002 records non-destructively.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
  org_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  org_slug TEXT NOT NULL,
  drive_folder_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_id, org_slug)
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations (owner_id, status);

CREATE TABLE IF NOT EXISTS organization_members (
  member_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations (org_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members (org_id, status);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations (org_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  drive_folder_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, project_slug)
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (org_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects (owner_id, status);

CREATE TABLE IF NOT EXISTS project_modules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (
    module_key IN ('builder', 'cms', 'inbox', 'assets', 'publishing', 'versions', 'settings')
  ),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_project_modules_project ON project_modules (project_id);

CREATE TABLE IF NOT EXISTS sites (
  site_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (project_id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organizations (org_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  site_slug TEXT NOT NULL UNIQUE,
  site_name TEXT NOT NULL,
  custom_domain TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'suspended')),
  active_publish_version TEXT NOT NULL DEFAULT '',
  active_build_id TEXT NOT NULL DEFAULT '',
  drive_config_folder_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sites_project ON sites (project_id);
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites (org_id);
CREATE INDEX IF NOT EXISTS idx_sites_owner ON sites (owner_id);
CREATE INDEX IF NOT EXISTS idx_sites_slug ON sites (site_slug);

CREATE TABLE IF NOT EXISTS workspace_resources (
  resource_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  org_id TEXT NOT NULL REFERENCES organizations (org_id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects (project_id) ON DELETE CASCADE,
  site_id TEXT REFERENCES sites (site_id) ON DELETE SET NULL,
  resource_kind TEXT NOT NULL CHECK (
    resource_kind IN (
      'builly_root',
      'org_folder',
      'project_folder',
      'config_draft',
      'config_published',
      'cms_folder',
      'inbox_folder',
      'assets_folder',
      'exports_folder',
      'cms_sheet',
      'inbox_sheet',
      'legacy_sheet',
      'legacy_registry'
    )
  ),
  resource_key TEXT NOT NULL,
  drive_file_id TEXT NOT NULL DEFAULT '',
  spreadsheet_id TEXT NOT NULL DEFAULT '',
  parent_folder_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'legacy', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, project_id, resource_kind, resource_key)
);

CREATE INDEX IF NOT EXISTS idx_ws_resources_owner ON workspace_resources (owner_id, resource_kind);
CREATE INDEX IF NOT EXISTS idx_ws_resources_project ON workspace_resources (project_id, resource_kind);

CREATE TABLE IF NOT EXISTS console_operation_idempotency (
  operation_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_console_idem_owner ON console_operation_idempotency (owner_id, created_at);

-- Non-destructive additive link columns on existing 0002 Shared Runtime site_registry
ALTER TABLE site_registry ADD COLUMN org_id TEXT;
ALTER TABLE site_registry ADD COLUMN project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_site_registry_org ON site_registry (org_id);
CREATE INDEX IF NOT EXISTS idx_site_registry_project ON site_registry (project_id);
