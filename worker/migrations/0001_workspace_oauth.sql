-- Cloudflare D1 Schema: Google Workspace OAuth states & encrypted credential vault ONLY.
-- DO NOT store portfolio, page, theme, or CMS data here; user Google Drive & Sheets are canonical.

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  frontend_origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS workspace_credentials (
  owner_id TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL,
  google_email TEXT NOT NULL,
  google_name TEXT NOT NULL,
  google_avatar TEXT NOT NULL,
  granted_scopes TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
