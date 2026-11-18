# Builly — Technical Architecture Baseline

## Agreed stack
- React + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Supabase Auth only
- User Google Sheets: structured website data
- User Google Drive: Page Builder JSON, source files, assets
- Cloudflare Workers: Backend API and application services
- Cloudflare: frontend hosting and public delivery
- Cloudflare R2: optional published asset copies only

## Responsibility boundaries

| Layer | Responsibility | Not responsible for |
|---|---|---|
| React | Landing, auth UX, dashboard/app shell, Builder/CMS UI | Secrets/tokens |
| Supabase Auth | Builly identity/session | Website/page/CMS data |
| Cloudflare Workers | Session verification, owner authorization, Google OAuth, Drive/Sheets adapters, publishing | Canonical portfolio database |
| Google Sheets | Structured user-owned content | Transactional relational workloads |
| Google Drive | Editable page JSON, source and original assets | CDN |
| Cloudflare hosting/cache | Frontend and public delivery | Canonical source |
| Optional R2 | Published delivery copies | Editable source of truth |

## Logical architecture
Browser (React Landing/Auth/Builder) → Supabase Auth for identity; Cloudflare Worker API for protected operations → Google OAuth credential service → user's Drive and Sheets → Cloudflare public delivery/cache and optional R2.

## Data ownership
- Supabase: identity/session only. No site metadata, page records, Drive IDs, slugs, SEO, themes, CMS content, page JSON or build artifacts.
- Sheets: structured site content and CMS data.
- Drive: Page Builder JSON, site manifest, reusable components, custom source files and original assets.
- Browser storage: non-sensitive preferences and disposable transient UI state only.
- Cloudflare cache: disposable derived content.
- R2: optional published copies only.

## Frontend structure direction
Do not move every existing file immediately. Introduce boundaries incrementally, e.g. `pages/LandingPage`, `features/identity`, `features/workspace-connection`, while preserving existing Builder modules. Avoid broad refactors unrelated to this feature.

## Worker structure direction
`worker/src/index.ts`, `middleware/requireSession.ts`, `routes/googleOAuth.ts`, `routes/workspace.ts`, `routes/drive.ts`, `routes/sheets.ts`, `services/googleTokenVault.ts`, `services/googleDrive.ts`, `services/googleSheets.ts`, `security/oauthState.ts`, `security/encryption.ts`. Only scaffold when it can build/deploy and fits the repository.

## Environment
Frontend public config: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, public app URL.
Worker secrets: Google OAuth client secret, token encryption key, JWT verification configuration, allowed origins, redirect URIs.
Never expose Supabase service-role key, Google client secret, tokens or encryption key.

## Migration rules
Inventory routes/auth/storage first. Add adapters before replacing implementations. Do not remove Firebase until Supabase parity is verified. Do not remove browser Google API implementation until Worker equivalent works. Do not silently discard local drafts. Keep Builder/CMS stable.
