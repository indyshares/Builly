# Builly Production Cutover Runbook — Google-only Auth

> Read-only preparation. This runbook does **not** perform deployment, DNS changes, secret changes, migrations, or data changes. The owner executes each step manually. Local baseline commits: `8e35f72`, `27a23e2`; local validation: 149 tests / 23 files, worker typecheck, lint, build, Wrangler dry-run all green.

## Go / No-Go checkpoints

| # | Checkpoint | Gate |
|---|---|---|
| G0 | All local validation green (above) | PASS locally |
| G1 | Custom Domain mapped; `/api/*` returns Worker JSON | BLOCKER if failed |
| G2 | Worker secrets/vars confirmed; encryption decision resolved | BLOCKER if failed |
| G3 | D1 migrations 0005/0006/0007 applied; backup taken | BLOCKER if failed |
| G4 | Google OAuth client + consent + both callbacks configured; Restricted Scope verification decision accepted | BLOCKER for production |
| G5 | Legacy identity migration dry-run reviewed and manually applied (if users exist) | BLOCKER if legacy users exist |
| G6 | Post-deploy diagnostics + browser E2E pass | BLOCKER before announcing cutover |

---

## 1. Infrastructure preflight

### 1.1 Confirm root config (no changes needed in repo)

`wrangler.toml` (root) is the production config:

```
name = "builly-project"
main = "worker/src/index.ts"
[assets] directory = "./dist"; binding = "ASSETS";
not_found_handling = "single-page-application"
run_worker_first = ["/api/*"]
[[d1_databases]] binding = "DB"; database_name = "builly";
database_id = "583c5b8a-e367-40f3-9403-ea03dcf25035"
migrations_dir = "worker/migrations"
```

`worker/wrangler.toml` (`builly-workspace-worker`) is **not** production. Never deploy with it.

### 1.2 Map the Custom Domain (owner, Cloudflare Dashboard)

1. Cloudflare Dashboard → **Workers & Pages** → `builly-project` → **Settings** → **Domains & Routes** → **Custom Domains** → **Add Custom Domain** → `builly.indyshares.com`.
2. If the zone is in Cloudflare, Cloudflare creates the DNS record. Otherwise add `CNAME builly.indyshares.com → builly-project.mycloudsfireworks.workers.dev` (proxied) at the DNS provider.
3. Leave `[assets]` and `run_worker_first = ["/api/*"]` unchanged. No route rewrite is needed: one Worker serves `/` from `dist` and `/api/*` from `worker/src/index.ts`.
4. Verify:
   ```bash
   curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://builly.indyshares.com/
   curl -sS https://builly.indyshares.com/api/health
   ```
   Expected: `200 text/html` and `{"ok":true,"service":"builly-workspace-worker","runtimeVersion":"1.0.0"}`.

**Rollback:** remove the Custom Domain in the same Dashboard page. The `workers.dev` URL remains available. Changing the domain does not delete Worker code or D1 data.

### 1.3 Same-origin frontend configuration

Production build variable (Workers Builds → Settings → Build → Variables, or CLI deploy environment):

```
VITE_CONSOLE_API_BASE_URL=same-origin
```

`src/config/apiConfig.ts` treats `same-origin` as an explicit marker: `buildConsoleApiUrl()` returns relative `/api/*`, so the browser calls `https://builly.indyshares.com/api/*`. Do **not** blank it — blank config forces `isConfigured=false` and the SPA shows the setup gate.

Keep `VITE_GOOGLE_WORKSPACE_SCOPES` aligned with Worker config:
```
https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly
```
Never place `GOOGLE_OAUTH_CLIENT_SECRET` or `TOKEN_ENCRYPTION_KEY` in `VITE_*`.

Local development: `vite.config.ts` proxies `/api` to the Worker, so `npm run dev` works with the same relative paths.

### 1.4 Worker runtime variables/secrets

Dashboard → `builly-project` → **Settings** → **Variables and Secrets**:

Vars:
```
GOOGLE_OAUTH_REDIRECT_URI=https://builly.indyshares.com/api/auth/google/callback
GOOGLE_WORKSPACE_SCOPES=https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly
ALLOWED_FRONTEND_ORIGINS=https://builly.indyshares.com
```
Secrets (names only shown in list): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`.

### 1.5 Verify both OAuth callback routes

```
GET  https://builly.indyshares.com/api/auth/google/callback   -> Worker route (login)
GET  https://builly.indyshares.com/api/google/oauth/callback  -> Worker route (workspace reconnect)
GET  https://builly.indyshares.com/api/google/oauth/diagnostics -> safe config flags
```
A bare GET without `code`/`state` returns a JSON error/redirect, not a 404. Confirm in Browser DevTools Network that login starts at `/api/auth/google/start` and Google redirects to the first callback above.

---

## 2. Encryption and credential preflight

All commands are read-only. Never paste a key or token into chat.

```bash
# Secret names only (values never printed)
npx wrangler secret list --name builly-project

# Encrypted credential count and last write (no token values)
npx wrangler d1 execute DB --remote \
  --command "SELECT COUNT(*) AS encrypted_credentials, MAX(updated_at) AS last_write FROM workspace_credentials"
```

Expected: secret list includes `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`; count query returns one row with integer count and timestamp (or `null` timestamp when table empty).

### Decision matrix

| Key present | Encrypted credentials | Decision |
|---|---|---|
| Yes | 0 | Safe. Keep the existing key; proceed. |
| Yes | >0 | Safe. **Do not rotate or regenerate.** Proceed after backup. |
| No | 0 | Generate with `openssl rand -base64 32`, set as Worker Secret, proceed. |
| No | >0 | **BLOCKER.** Do not generate a new key — existing refresh tokens become undecryptable. Locate the original key, or plan explicit user reconnect/re-consent. |

`TOKEN_ENCRYPTION_KEY` format: standard base64 decoding to exactly 32 bytes. No hex, no raw string. No automatic generation or rotation exists in code.

---

## 3. D1 migration runbook

Migrations are applied from project root with `migrations_dir = "worker/migrations"`, in filename order.

Dependencies: `0005` creates identity/session/OAuth-transaction tables; `0006` requires `workspace_credentials` from `0001` and adds `google_oidc_sub`; `0007` requires `oauth_transactions` from `0005`. No destructive statements in any of the three.

### 3.1 Remote preflight (read-only)

```bash
npx wrangler d1 migrations list DB --remote
npx wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','external_identities','auth_sessions','oauth_transactions','auth_audit_logs') ORDER BY name"
npx wrangler d1 execute DB --remote \
  --command "SELECT name FROM pragma_table_info('workspace_credentials') WHERE name='google_oidc_sub'"
```

Do **not** assume 0005 is unapplied. If any table above exists, 0005 was already applied — do not edit historical migrations; Wrangler skips recorded migrations.

### 3.2 Backup

```bash
npx wrangler d1 export builly --remote --output ./backup-builly-$(date +%Y%m%d).sql
```
Store the backup outside the repo. Verify the file is non-empty.

### 3.3 Apply

```bash
npm run cf:d1:migrate:remote
```
Expected: Wrangler reports migrations applied (or "no migrations to apply" if already current).

### 3.4 Post-migration verification

```bash
npx wrangler d1 execute DB --remote \
  --command "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_external_identities_account','idx_auth_sessions_account','idx_workspace_credentials_oidc_sub','idx_oauth_transactions_expires') ORDER BY name"
npx wrangler d1 execute DB --remote \
  --command "SELECT COUNT(*) AS rows_before FROM workspace_credentials"
```
`workspace_credentials` row count must be unchanged from step 2.

### 3.5 Recovery / rollback limitations

There are no down migrations. Recovery = restore from the D1 export (destructive; owner decision only). A code rollback alone is safe: the new tables/columns are additive and unused by old code. `0001`–`0004` data and all `owner_id` values are untouched.

---

## 4. Legacy identity migration

### 4.1 Mapping file (`mappings.json`, owner-created, never in repo)

```json
[
  { "legacyOwnerId": "existing-d1-owner-id", "googleSubject": "verified-google-oidc-sub", "email": "user@example.com", "displayName": "User" }
]
```
`legacyOwnerId` must be the exact existing D1 `owner_id`. `googleSubject` must be owner-attested as that person's Google OIDC `sub`. Email is **metadata only** — no automatic merge by email.

### 4.2 Live preflight (`preflight.json`, owner-created after read-only queries)

```json
{
  "verified": true,
  "migration0005Applied": true,
  "ownerAttestedSubjects": true,
  "existingAccountIds": ["..."],
  "existingSubjects": [{"provider":"google","subject":"...","accountId":"..."}]
}
```
Source these from read-only D1 queries:
```bash
npx wrangler d1 execute DB --remote --command "SELECT id FROM accounts"
npx wrangler d1 execute DB --remote --command "SELECT provider, subject, account_id FROM external_identities"
```

### 4.3 Dry run (no SQL applied)

```bash
npx tsx scripts/migrate-supabase-identities.ts mappings.json --preflight preflight.json --emit identity-migration.sql
```
Expected on success: `Preflight verified: YES`, row/mapped counts, `SQL written to identity-migration.sql`, exit 0. Duplicate legacy IDs, duplicate subjects, conflicting existing mappings, or missing fields print `MIGRATION BLOCKED` and exit 1. Without `--preflight`, the tool prints `NOT VERIFIED` and exits 2.

### 4.4 Review and apply manually

1. Read `identity-migration.sql`; confirm only `INSERT OR IGNORE` against `accounts` / `external_identities`.
2. Owner explicitly approves the mapping file (record the printed input SHA256).
3. Apply manually:
   ```bash
   npx wrangler d1 execute DB --remote --file ./identity-migration.sql
   ```
4. Post-apply verification:
   ```bash
   npx wrangler d1 execute DB --remote --command "SELECT provider, subject, account_id FROM external_identities"
   ```
   Each row must map to the intended legacy owner; no account IDs changed.

---

## 5. OAuth and Google verification

OAuth Client configuration (Google Cloud Console):
- Authorized redirect URIs:
  - `https://builly.indyshares.com/api/auth/google/callback` (login)
  - `https://builly.indyshares.com/api/google/oauth/callback` (workspace reconnect)
- Consent screen: Google is shown as the OAuth destination; app name, privacy policy, and scopes declared.
- Scopes requested by code: `openid email profile` + `drive`, `spreadsheets`, `drive.file`, `drive.metadata.readonly`.
- `https://www.googleapis.com/auth/drive` is a **Restricted Scope**.

**Configuration is not verification.** Google verification and Restricted-Scope security assessment are **not completed** and are owner actions. Prepare: privacy policy/data-use declaration, justification for full Drive access, data retention/deletion statement, domain restriction, demo video if requested. Existing users with `drive.file` must explicitly re-consent via Workspace reconnect; do not assume scope upgrade.

---

## 6. Deployment

```bash
# From project root ONLY
npm run cf:deploy     # cf:build (worker typecheck + vite build) && wrangler deploy
```
Pre-deploy: G1–G5 pass; backup taken; secrets/vars confirmed; `npx wrangler deploy --dry-run` re-run against final tree.

Post-deploy diagnostics:
```bash
curl -sS https://builly.indyshares.com/api/health
curl -sS https://builly.indyshares.com/api/google/oauth/diagnostics
curl -sS -H 'Cookie: bogus=1' https://builly.indyshares.com/api/auth/session
```
Expected: health `ok:true`; diagnostics shows configured redirect URI/flags and no secrets; session returns `401 {"authenticated":false}`.

Rollback:
```bash
npx wrangler deployments list --name builly-project
npx wrangler rollback --name builly-project <previous-version-id>
```
Confirm `wrangler rollback --help` for exact syntax in the installed Wrangler version. Rollback restores code only; D1 schema/data and secrets are unchanged.

---

## 7. End-to-end acceptance checklist

- [ ] Google login: `Continue with Google` → Google consent → callback → `/console`, no Supabase URL anywhere.
- [ ] Builly session: `/api/auth/session` returns `authenticated:true` with Builly account.
- [ ] Session restoration: hard reload keeps session; cookie `HttpOnly; Secure; SameSite=Lax; Path=/`.
- [ ] Logout: `/api/auth/logout` clears same cookie; subsequent API calls 401.
- [ ] Workspace reconnect (existing user): explicit full-Drive consent; existing account/IDs unchanged; no new Builly account.
- [ ] Existing manifest JSON under `My Drive/Builly/` read and updated (system, org, project, registry).
- [ ] Existing CMS and Inbox spreadsheets read/write.
- [ ] Assets: existing files read; new files created; no data loss.
- [ ] Publishing: snapshot/manifest written; published artifacts readable.
- [ ] Version History: list and rollback work.
- [ ] Organization/Project access: cross-tenant checks still deny other owners.
- [ ] Public Runtime: anonymous routes work without owner login.
- [ ] Console/Builder/CMS/Inbox/Assets pages load after reload.

---

## 8. Remaining unknowns

- Live Cloudflare account state: Custom Domain, secret names, D1 migration status, existing credential count — all owner-verified.
- Google Cloud Console state and Restricted-Scope verification — owner-verified.
- Which legacy owner IDs map to Google subjects — owner-attested.
- Actual behavior against pre-existing Drive files — verified only after live E2E.

## 9. Required owner actions (ordered)

1. G0–G3: map domain, set build/runtime vars and secrets, verify callbacks, backup and apply D1 migrations.
2. Resolve encryption decision matrix; do not rotate an existing key.
3. Configure Google OAuth client and consent screen; begin/complete verification.
4. Prepare, attest, review, and manually apply legacy identity mappings if legacy users exist.
5. Deploy with `npm run cf:deploy` from root.
6. Run diagnostics and full E2E checklist; only then announce cutover.
7. Keep previous Worker version id handy for rollback.

**Status: runbook prepared. No production operation performed. Local code is ready; production go/no-go depends on G1–G6.**
