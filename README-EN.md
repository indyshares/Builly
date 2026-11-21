[Thai](README.md) | English
```markdown name=README.md
# Builly

Builly is a visual website and project management tool for creating portfolios and customizable websites. It emphasizes freeform design, an easy-to-use editor, and user-controlled data storage via Google Workspace.

> Create, arrange, customize, select themes, and preview your work systematically from a single tool.

**Note:** The information in this document is based on the current project's code and configuration files.

---

## Overview

Builly includes functionality for:

- Drag-and-drop page editor with free-form customization
- Project and page management system
- Customizable themes and styles
- CMS for managing content and datasets
- Website code export
- Supabase authentication
- Google Workspace integration
- Google Sheets and Google Drive storage
- Collaborative editing with workspace separation by project and owner
- Page formatting with multiple breakpoints
- Saving drafts locally when the backend is unavailable
- Processing and generating content using the Gemini API on the server side

---

## Key Features

### Visual Builder

- Copy, move, group, and delete components
- Undo / Redo
- Preview and responsive editing
- Control layout via the property panel
- Manage themes, settings, and style variables
- Display component structure in a hierarchy tree
- Save and restore drafts from Local Storage
- Export pages as HTML/CSS or usable source code structures.

### Project Management

- Create and manage workspaces
- Create and manage projects
- Separate pages and data by project
- Display page and asset status
- Manage data in a multi-page structure
- Supports workspace operation

### CMS and Content

- Create CMS collections and data
- Manage models and content schema
- Synchronize data with pages and components
- Manage dynamic content
- Export and import structured data

### Google Workspace

- Connect a Google account separate from the login account
- Use Google Sheets for data storage
- Use Google Drive for file and registry storage
- Enable two separate Google Accounts
- Encrypt refresh tokens using AES-256-GCM
- Store OAuth credentials in Cloudflare D1
- Separate data by owner, project, and workspace

### Authentication

- Authentication via Supabase
- Use Google Sign-In
- Identify user identities using... `supabaseUser.id`
- Allows opening the builder page via a protected route.
- Supports local draft preview when Supabase is not yet defined.

---

## Technologies Used

### Frontend

- React 19
- TypeScript
- Vite 8
- Tailwind CSS 4
- Motion
- i18next / react-i18next
- Lucide React
- Vitest

### Backend and Infrastructure

- Cloudflare Workers
- Cloudflare D1
- Cloudflare Durable Objects
- Cloudflare Static Assets
- Supabase Authentication
- Google OAuth 2.0
- Google Sheets API
- Google Drive API
- Gemini API

### Development Tools

- Bun lockfile
- npm scripts
- Wrangler
- TypeScript 7 for frontend
- TypeScript 5 for worker
- Vitest
- ESLint or TypeScript-based type checking format

---

## Project Structure

text
Builly/
src/ # React application and frontend source
assets/ # Static frontend assets
components/ # Shared UI and editor components
builder/
cms/
common/
console/
modals/
sheets/
contexts/ # React contexts
data/ # Initial data and constants
│ ├── features/ # Authentication, console, and workspace connection
│ ├── i18n/ # Language settings and translation
│ ├── locales/ # Localization files
│ ├── pages/ # Main application pages
│ ├── services/ # API, storage, compiler, and integration services
│ ├── types/ # TypeScript types and interfaces
│ └── utils/ # Help functions
├── worker/
│ ├── src/ # Cloudflare Worker source code
│ └── migrations/ # D1 database migrations
├── docs/ # Installation and Migration Documentation
├── public/ # Public assets
├── package.json
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml # Cloudflare unified deployment settings
├── .env.example
└── LICENSE
```

---

## Main Pages and Routes

| Route | Page |
|---|---|
| `/` | Landing Page |
| `/login` | Login or Supabase setup guide |
| `/auth/callback` | Callback after Supabase authentication |
| `/app` | Website editor page |
| `/builder` | Visual Builder for creating and editing pages |
| `/editor` | Shortcuts or design editing mode |
| `/console` | Workspace and project management |
| `/workspace` | Connect to and check Google Workspace status |
| `/site/:slug` | View published websites |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

Route and display status may be further adjusted based on Auth and Workspace settings.

---

## System Requirements

For on-premise development:

- Node.js 20 or later
- npm or Bun
- Cloudflare account for deployment
Worker Requirements:
- Supabase project for Authentication
- Google Cloud project for OAuth
- Cloudflare D1 database
- Gemini API Key for AI features
- Browser supporting ES modules and modern web APIs

---

## Getting Started

### 1. Clone Repository

```bash
git clone https://github.com/indyshares/Builly.git
cd Builly
```

### 2. Install Dependencies

```bash
npm install
```

You can also use Bun for development:

```bash
bun install
```

### 3. Create Environment Files

```bash
cp .env.example .env.local
```

Edit `.env.local` and insert the values ​​received from Supabase, Google Cloud, and OAuth. Worker:

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_PUBLIC_ANON_KEY"

VITE_GOOGLE_OAUTH_CLIENT_ID="YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"
VITE_GOOGLE_WORKSPACE_SCOPES="https://www.googleapis.com/au th/spreadsheets,https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/drive.metadata.readonly"

VITE_WORKER_API_URL=""
VITE_APP_URL="http://localhost:3000"
VITE_INDYSHARES_DRIVE_FOLDER_NAME="Builly"
VITE_INDYSHARES_SCHEMA_VERSION="2.0"
```

When run with For single-origin Cloudflare Worker environments, set `VITE_WORKER_API_URL=""`.

Do not enter values ​​for service role keys or OAuth client secrets in environments starting with `VITE_*`.

### 4. Run the development server

```bash
npm run dev
```

The project will open at:

```text
http://localhost:3000
```

---

## Available commands

```bash
npm run dev
```

Run the Vite development server on port 3000

```bash
npm run build
```
Create the production bundle to the `dist` folder.

```bash
npm run preview
```

Open the preview for the production build.

```bash
npm run lint
```

Check TypeScript without creating output files.

```bash
npm run typecheck:worker
```

Check Cloudflare Worker code

```bash
npm run test
```

Run tests with Vitest

```bash
npm run clean
```

Delete build and server.js files

---

## Supabase Authentication Setup

1. Open Supabase Dashboard
2. Go to **Authentication → Providers → Google**
3. Open Google Sign-In
4. Add redirect URL:

```text
http://localhost:3000/auth/callback
https://<YOUR_DOMAIN>/auth/callback
```

5. Add Supabase public URL and anon key to `.env.local`

The embedded value in the frontend should only be the public anon key. Do not use the service role key.

Supabase is used only to describe the user's identity. Portfolio, workspace, theme, and CMS files should not be primarily stored in Supabase. In situations where the system has storage segmented across Google Workspaces:

---

## Google OAuth Setup

### Creating an OAuth 2.0 Client

In the Google Cloud Console:

1. Create an OAuth 2.0 Client ID.
2. Select the Web application type.
3. Add Authorized JavaScript Origins:

```text
http://localhost:3000
https://<YOUR_DOMAIN>
```

4. Add Authorized Redirect URIs:

```text
http://localhost:3000/api/google/oauth/callback
https://<YOUR_DOMAIN>/api/google/oauth/callback
```

Google connections use scopes. The following are the files:

```text
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/drive.metadata.readonly
```

---

## Cloudflare Worker and D1 Setup

Check the files:

- `wrangler.toml`
- `worker/wrangler.toml`
- `worker/migrations/`

Create the D1 database:

```bash
npx wrangler d1 create builly_oauth_vault
```

Then take the generated database ID and put it in... `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "builly"
database_id = "YOUR_D1_DATABASE_ID"
migrations_dir = "worker/migrations"
```

Use migration:

```bash
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
```

Set up the system via Wrangler:

```bash
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put SUPABASE_ANON_KEY
```

Generate a 32 bytes encryption key. Base64 architecture:

```bash
openssl rand -base64 32
```

Then add Worker variables such as:

```text
SUPABASE_URL
ALLOWED_FRONTEND_ORIGINS
GOOGLE_OAUTH_REDIRECT_URI
GOOGLE_WORKSPACE_SCOPES
```

Example:

```text
ALLOWED_FRONTEND_ORIGINS=https://builly.indyshares.com,http://localhost:3000
GOOGLE_OAUTH_REDIRECT_URI=https://builly.indyshares.com/api/google/oauth/callback
```

---

## Deploying with Cloudflare

### Build and deploy unified

```bash
npm run cf:build
npm run cf:deploy
```

Or run a single command:

```bash
npm run cf:deploy
```

### Run Cloudflare Worker on the machine

```bash
npm run cf:dev
```

This command will build the frontend and then run wrangler dev

### Deploy worker and frontend separately

If deploying Worker separately, set:

```env
VITE_WORKER_API_URL="https://YOUR_WORKER.workers.dev"
```

Example:

```text
https://builly-project.mycloudsfireworks.workers.dev
```

For a single Worker:

```bash
cd worker
npm install
npm run deploy
```

---

## Testing

Run unit tests and integration tests supported in the project:

```bash
npm run test
```

The main test suite is located at:

```text
src/**/__tests__/
src/pages/__tests__/
src/services/__tests__/
src/features/**/__tests
__/
```

Check data type before building production build:

```bash
npm run lint
npm run typecheck:worker
npm run build
```

---

## Architectural Structure

```text
Browser
│
├── React + Vite
│ ├── Visual Builder
│ ├── CMS
│ ├── Themes
│ └── Local Draft Storage
│
├── Superbase Auth
│ └── User Identity
│
└── Cloudflare Worker
├── OAuth callbacks
├── Token encryption
├── Workspace registry
├── Google APIs
├── D1 database
└── Durable Object locks
│
▼
Google Workspace
├── Google Sheets
└── Google Drive
```

---

## Security

The project is designed to separate identity and data by owner:

- Supabase stores identity and authentication.
- Google Workspace OAuth is managed separately from Supabase login.
- Refresh tokens are encrypted before being stored in D1.
- Clients should not receive refresh tokens.
- Public environment variables must not have secrets.
- OAuth client secrets should be stored as worker secrets.
- Encryption keys should not be committed to Git.
- Add allowed origins to restrict API calls from allowed domains.
- Workspace data. Must be categorized by owner and project.
- Use Durable Object lock to prevent conflicting modifications or registry operations.

---

## Limitations and Development Status

The system may have the following limitations:

- Google Workspace OAuth requires a deployed Worker and D1.
- Supabase is optional when opening local preview.
- Running in local mode without Supabase will not create a fake login.
- Some client-side Google Workspace flows may still be working during migration to a Worker proxy.
- Publishing actual files or assets may require configuring D1, Google Drive, and Cloudflare R2.
- Some configuration settings in... - The `wrangler.toml` file must be aligned with the user's domain and D1 database.
- Gemini-related features require secure server-side API key assignment.

Mission details are available in:

- [`docs/SETUP_AND_MIGRATION.md`](./docs/SETUP_AND_MIGRATION.md)
- `BUILDER_FEATURE_INVENTORY.md`
- `WORKSPACE_ARCHITECTURE_AUDIT.md`
- `CMS_RELIABILITY_AUDIT.md`
- `SHARED_RUNTIME_AUDIT.md`
- `REDESIGN_AUDIT.md`
- `SHEET_STRUCTURE_INVENTORY.md`
- `BUILDER_AUDIT_ARCHITECTURE_AND_PLAN.md`
- `BUILDER_QA_TEST_PLAN.md`

---

## Participation

Participation in the project can be done through the following steps:

1. Fork the repository.
2. Create a new branch.

```bash
git checkout -b feature/my-feature
```

3. Develop and modify the code.
4. Run typecheck and tests.

```bash
npm run lint
npm run typecheck:worker
npm run test
npm run build
```

5. Create a Pull Request with a clear description of the changes.
6. Specify the tests performed in the Pull Request.

It is recommended to ensure that:

- There are no API secrets or private keys in the code.
- No unnecessary user data is collected.
- No breaking changes are made without explaining the impact.
- The code passes the tests and build.
- Update documentation if new environment variables or routes are added.

---

## License

Builly uses the GNU General Public License v3.0.

See details at [LICENSE](./LICENSE)

---

## Developer and References

- Repository: [indyshares/Builly](https://github.com/indyshares/Builly)
- Maintainer: [indyshares](https://github.com/indyshares)
- Primary Project Language: TypeScript
- Runtime: React and Cloudflare Workers
- License: GPL-3.0
````
