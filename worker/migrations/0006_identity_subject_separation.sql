-- Additive only. Field semantics:
--   accounts.id / external_identities.subject = Builly Account ID / Google OIDC `sub`
--   workspace_credentials.google_oidc_sub    = stable Google OIDC `sub` (identity)
--   workspace_credentials.google_subject     = legacy Drive principal (permissionId/email)
-- Existing rows keep their legacy google_subject value; the new column defaults to empty
-- and is populated on the next login/reconnect that supplies an OIDC subject.

ALTER TABLE workspace_credentials ADD COLUMN google_oidc_sub TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_workspace_credentials_oidc_sub
  ON workspace_credentials (google_oidc_sub);
