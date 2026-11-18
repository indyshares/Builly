# Builly — Authentication, Workspace OAuth & Phased Migration Setup

This guide documents how Builly separates **owner identity** (Supabase Auth) from **user-owned content storage** (Google Drive & Google Sheets via Cloudflare Workers).

## 1. Architecture Boundaries

- **Supabase Auth (Identity only)**:
  - Google Sign-In (`openid email profile`) via PKCE.
  - Canonical `ownerId = supabaseUser.id`.
  - **Never** stores portfolio pages, themes, CMS schemas, Drive IDs, or user spreadsheets.
  - **Never** embed `SUPABASE_SERVICE_ROLE_KEY` in `VITE_*` client environment variables.
- **Google Workspace OAuth (Separate authorization)**:
  - Managed via the Cloudflare Worker (`/worker`) so refresh tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and stored strictly server-side in D1 (`workspace_credentials`).
  - Frontend receives safe status metadata only (`/api/workspace/status`) — **never** refresh tokens.
  - Users can connect a different Google account for Drive/Sheets than the Google account used for Builly sign-in.
- **Visual Builder (`/builder`, `/editor`, `/app`)**:
  - Protected route when Supabase Auth is configured (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`).
  - Preserves existing Builder canvas, CMS, pages, themes, undo/redo, and local draft recovery (`storageService.ts`).

## 2. Frontend Public Environment Setup (`.env.local`)

Copy `.env.example` to `.env.local` and configure:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_PUBLIC_ANON_KEY"
VITE_WORKER_API_URL="https://api.yourdomain.com"
VITE_GOOGLE_OAUTH_CLIENT_ID="YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
```

### Supabase Auth Configuration
1. In the Supabase Dashboard -> **Authentication -> Providers -> Google**, enable Google Sign-In (standard identity scopes only; do **not** add Drive/Sheets scopes here).
2. In **Authentication -> URL Configuration**, add your frontend origin and callback URL:
   - `http://localhost:3000/auth/callback`
   - `https://<your-production-domain>/auth/callback`

## 3. Cloudflare Worker Setup (`/worker`)

1. Create a Cloudflare D1 database for encrypted OAuth states and Workspace credentials:
   ```bash
   cd worker
   npx wrangler d1 create builly_oauth_vault
   npx wrangler d1 execute builly_oauth_vault --file=./migrations/0001_workspace_oauth.sql
   ```
2. Update `worker/wrangler.toml` with the D1 binding, `SUPABASE_URL`, `ALLOWED_FRONTEND_ORIGINS`, and `GOOGLE_OAUTH_REDIRECT_URI` (`https://<worker-domain>/api/google/oauth/callback`).
3. Set Worker secrets (never commit):
   ```bash
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
   npx wrangler secret put TOKEN_ENCRYPTION_KEY   # 32-byte base64 key
   ```
4. Add `https://<worker-domain>/api/google/oauth/callback` as an Authorized Redirect URI in Google Cloud Console OAuth 2.0 Client settings.
5. Deploy Worker:
   ```bash
   npm run deploy
   ```

## 4. Phased Migration Notes & Current Limitations
- While `VITE_WORKER_API_URL` is unset or `/worker` is not deployed, the `/workspace` onboarding page transparently reports that server-side Worker OAuth is unconfigured and does **not** store refresh tokens in the browser.
- Existing client-side in-memory GIS Google Sheets/Drive flows inside `/builder` remain preserved until all Drive/Sheets adapters are migrated onto the Worker proxy endpoints.
- When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are unset, `/login` shows setup documentation (never a fake login), while allowing explicit local draft preview on `/builder` so pre-existing local drafts remain accessible and recoverable.
