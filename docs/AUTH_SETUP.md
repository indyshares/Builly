# Builly authentication setup (current)

Worker: `builly-project` (root `wrangler.toml`). No Supabase configuration is required.

## Worker configuration

Variables:
- `GOOGLE_OAUTH_REDIRECT_URI` = `https://builly.indyshares.com/api/auth/google/callback`
- `GOOGLE_WORKSPACE_SCOPES` = `https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly` (Restricted Scope — see `docs/GOOGLE_DRIVE_SCOPE_ASSESSMENT.md`)
- `ALLOWED_FRONTEND_ORIGINS` = allowed SPA origins

Secrets (Worker Secrets only, never `VITE_*`):
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` (base64, 32 decoded bytes; preserve the existing value)

## Frontend build variables

- `VITE_CONSOLE_API_BASE_URL` = `same-origin` in production (relative `/api/*`); see `docs/PRODUCTION_CUTOVER_RUNBOOK.md`
- Builder's existing public GIS variables remain public only; never place a client secret in them.

## Google Cloud Console

Authorize redirect URI: `https://builly.indyshares.com/api/auth/google/callback`.
The consent screen must show Google as the destination; no `*.supabase.co` callback remains.

## D1 migrations

Apply `worker/migrations/0005_builly_identity.sql` additively. It creates `accounts`, `external_identities`, `auth_sessions`, `oauth_transactions`, `auth_audit_logs`. No existing table or row is dropped or rewritten.

## Existing users

1. Build `mappings.json` and an owner-attested live-D1 `preflight.json`.
2. Run `npx tsx scripts/migrate-supabase-identities.ts mappings.json --preflight preflight.json --emit identity-migration.sql`.
3. Review emitted SQL and apply manually only after owner approval. Full procedure: `docs/PRODUCTION_CUTOVER_RUNBOOK.md`.

Email is never used as an automatic merge key.
