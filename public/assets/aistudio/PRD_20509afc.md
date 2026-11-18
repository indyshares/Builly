# PRD.md — Product Requirements Document

## 1. Product overview

IndyShares Portfolio Builder is a multi-tenant SaaS that lets individuals create and publish personal websites using a freeform visual page builder inspired by WordPress Elementor. Users manage their content and website source files in their own Google Workspace. The platform provides authentication, editor experience, build orchestration, public delivery and caching.

## 2. Problem statement

Many individuals need a professional website but face one or more barriers:
- Coding a website requires technical skills and ongoing maintenance.
- Template-only builders restrict layout freedom.
- Traditional CMS platforms require hosting, plugin and maintenance decisions.
- Users may not want their portfolio source data and media locked into a platform-specific storage system.
- Public sites should be fast and stable even when the source data is stored in Google Sheets.

## 3. Product vision

Make it possible for a person to build a highly customized, professional website through a visual editor while retaining control of their source content and website files in their own Google Workspace.

## 4. Personas

### P1 — Creative professional
Needs visual control, image-heavy layouts, typography, galleries and responsive design.

### P2 — Developer
Needs freeform layout, code access, custom HTML/CSS/JS, reusable components and technical control.

### P3 — Freelancer / consultant
Needs projects, services, testimonials, contact details and a polished public URL.

### P4 — Student / job seeker
Needs a simple way to present profile, skills, experience, education and projects.

## 5. Product goals

- Provide a capable freeform visual page builder.
- Support multi-page sites and reusable components.
- Support custom HTML/CSS/JS with secure isolation.
- Use user-owned Google Sheets and Drive for canonical source data and authored files.
- Make dynamic Google Sheets data available to visual elements.
- Require explicit Save and Publish/Update actions.
- Serve public pages from prebuilt artifacts and edge cache.
- Support themes and templates without locking users into a fixed layout.

## 6. Non-goals

- Reimplement the full WordPress platform or its plugin ecosystem.
- Execute arbitrary PHP or user backend code.
- Provide a general-purpose cloud IDE.
- Provide real-time collaborative editing in the first release.
- Guarantee that all arbitrary third-party scripts work in every browser.
- Use Google Sheets as a high-throughput transactional database.

## 7. Product experience and navigation

### Main application areas

- Dashboard
- Sites / Pages
- Visual Builder
- Media Library
- Data / Collections
- Theme and Template Library
- Global Styles
- Publishing
- Google Storage Settings
- Account and Security Settings

### Visual editor layout

- Top toolbar: site/page selector, undo/redo, preview, device mode, save status, Save, Publish/Update.
- Left panel: Elements, Navigator/Layers, Pages, Templates, Saved Components.
- Center canvas: interactive visual editing surface.
- Right panel: Content, Style and Advanced properties.
- Optional bottom/status area: validation, responsive warnings and build messages.

The editor must support keyboard access for key operations and provide non-drag alternatives for moving/reordering elements.

## 8. Functional requirements

### 8.1 Identity and onboarding

- Sign in with Google through Supabase Auth.
- Create platform profile and initial site workspace.
- Separately authorize Google Drive and Sheets access.
- Support Auto Setup and Existing Storage modes.
- Display connected account, granted access and connection health.
- Support reauthorization and disconnect.

### 8.2 Google storage

- Create or connect a spreadsheet and Drive folder.
- Provision and validate named Sheets tabs and headers.
- Store stable IDs, not row numbers, as record identifiers.
- Store page-builder project documents as JSON files in Drive.
- Store media and custom code source files in Drive.
- Keep a manifest/index of Drive file IDs and schema versions.
- Support file ownership and permission validation.
- Detect missing, moved or deleted source files.
- Provide export and recovery paths.

### 8.3 Site and page management

- Create, rename, duplicate, reorder and delete pages.
- Configure page slug, title, description and visibility.
- Support a home page and custom pages.
- Prevent reserved or duplicate slugs.
- Support page-level and site-level settings.
- Support reusable headers, footers and components.

### 8.4 Visual page builder

The builder must support:
- Freeform drag-and-drop element placement.
- Nested containers and element trees.
- Selection, move, reorder, duplicate, copy, paste, delete, hide and lock.
- Navigator / layers panel.
- Element search and categorized element library.
- Undo and redo.
- Autosave or explicit save feedback, with durable Save action.
- Canvas preview and preview mode.
- Responsive device modes.
- Selection and property editing.
- Import/load and save/restore of builder project data.

### 8.5 Element system

Initial core element families:
- Layout: container, flex, grid, spacer, divider.
- Basic: heading, text, image, video, button, icon, link.
- Content: gallery, list, tabs, accordion, carousel.
- Portfolio: project card, project grid, profile, skills, experience, education, contact.
- Dynamic: dynamic text, dynamic image, dynamic link, repeater, collection grid.
- Advanced: HTML/embed and custom-code integration.

Each element must have a stable type identifier, versioned configuration schema, default values, editor controls, renderer behavior and validation rules.

### 8.6 Styling and responsive design

- Support typography, color, background, border, radius, shadow, spacing, sizing, display, positioning, flexbox and grid controls.
- Support global design tokens and reusable classes/styles.
- Support breakpoint-specific overrides.
- Define platform breakpoints and document precedence rules.
- Provide responsive warnings for overflow, fixed sizing and unsupported combinations.
- Sanitize and validate style values to prevent CSS injection into platform/admin contexts.

### 8.7 Custom code

- Provide HTML, CSS and JavaScript editing with syntax highlighting.
- Support element-level, page-level and site-level code scopes where applicable.
- Store source files in the user's Drive and reference them from page documents.
- Provide validation and preview before publishing.
- Treat all user code as untrusted.
- Run public custom code only in an isolated tenant origin/runtime with restrictive permissions.
- Never expose Supabase service credentials, Google tokens or platform secrets to public custom code.
- Provide clear warnings and account-level controls for custom JavaScript.
- Define CSP, iframe sandboxing, CORS and origin boundaries before enabling production execution.

### 8.8 Dynamic data and collections

- Allow users to define collections backed by Google Sheets tabs.
- Define fields and field types.
- Map a collection to a spreadsheet tab and stable record ID field.
- Bind text, image, link and supported element properties to fields.
- Support repeaters and collection grids.
- Support basic filtering, sorting and item limits at build time.
- Validate bindings before Publish.
- Resolve Google Drive image references to public build assets or controlled media URLs.
- Do not query Google Sheets during normal public page requests.

### 8.9 Themes and templates

- Provide theme and template catalogs.
- Themes define visual defaults and supported patterns, not a locked page structure.
- Users can modify a theme freely after applying it.
- Support page templates, section templates and reusable components.
- Preserve user content when changing themes.
- Version theme definitions and provide migrations or compatibility warnings.
- Never silently discard unsupported elements or styles.

### 8.10 Save and publishing

- Save persists draft page-builder documents and structured data to Google Workspace.
- Publish creates the first public release.
- Update builds from latest saved page documents and latest Google Sheets data.
- Build process validates, resolves data, packages assets, creates immutable version artifacts and activates the new version.
- Public delivery uses the active build and does not read Sheets on every request.
- Failed builds leave the previous active build unchanged.
- Support Unpublish and rollback.
- Display last saved, last published, active version and unsaved/unpublished change states.

### 8.11 Public website

- Serve multi-page sites using tenant-safe routing.
- Provide SEO metadata, Open Graph, canonical URLs, sitemap and robots behavior.
- Deliver responsive HTML/CSS/JS and media.
- Support custom domains when domain verification and routing are implemented.
- Ensure Unpublish takes effect within a documented cache invalidation SLA.
- Avoid cross-tenant data, cache or custom-code leakage.

## 9. Save, Publish and Update semantics

| Action | Source behavior | Public behavior |
|---|---|---|
| Save | Persist draft to Google Workspace | No change |
| Publish | Build from saved source and current Sheets data | First release becomes active |
| Update | Rebuild from latest saved source and current Sheets data | New version becomes active |
| Unpublish | Keep source | Disable public access |
| Rollback | Keep current source | Reactivate selected previous successful build |

The product must distinguish unsaved editor changes from saved-but-unpublished changes.

## 10. High-level data architecture

### Canonical user-owned data

Google Sheets:
- META
- PROFILE
- PROJECTS
- SKILLS
- EXPERIENCE
- EDUCATION
- SOCIAL_LINKS
- PAGES
- COLLECTIONS
- DATA_SCHEMA

Google Drive:
- Website/Pages
- Website/Components
- Website/Custom-Code
- Website/Templates
- Website/Published
- Media

### Platform metadata in Supabase

- user profile and account metadata
- Google connection metadata and encrypted token material
- workspace and site registry
- slug/domain registry
- Drive/Sheets resource IDs
- active published build pointer
- build job state and operational metadata
- audit/security events as required

Do not store the complete editable portfolio as a second canonical database in Supabase. Any published copy or operational cache must be treated as a derived artifact.

## 11. Non-functional requirements

### Performance
- Public requests must not depend on live Google Sheets reads.
- Serve immutable versioned assets with long-lived caching where safe.
- Keep HTML/document delivery efficient.
- Define measurable targets for editor responsiveness, public TTFB, build duration and cache invalidation before launch.

### Security
- Encrypt OAuth refresh tokens at rest.
- Keep service-role credentials and Google tokens server-side.
- Apply RLS to user-owned platform metadata.
- Verify ownership on every API operation.
- Isolate tenant public origins and custom code.
- Use CSP, input validation, output encoding and dependency scanning.
- Maintain audit logs for sensitive operations.

### Reliability
- Use idempotent storage provisioning and build jobs.
- Use retry with exponential backoff for transient Google API errors.
- Handle rate limits and quota exhaustion.
- Preserve previous published version on failed update.
- Detect stale or missing Google resources.
- Provide recovery and export.

### Maintainability
- Use versioned page schema, element schema, theme schema and build manifest.
- Separate editor, storage adapters, data resolver, compiler and public runtime.
- Maintain integration and regression tests.
- Use architecture decision records for major changes.

### Accessibility
- Keyboard-accessible editor controls.
- Accessible public output.
- Semantic HTML and alt text support.
- Do not make drag-and-drop the only way to perform an operation.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Google OAuth verification delays | Validate scopes and consent requirements early |
| Sheets quota / latency | Build-time reads, batching, caching and backoff |
| Drive is not a CDN | Benchmark; consider optional delivery replication to R2 |
| Custom JS compromise | Isolated origin/runtime, CSP and strict permissions |
| Builder engine limitations | Technical proof of concept and engine abstraction |
| Engine schema changes | Pin versions, migration tooling and regression tests |
| Concurrent edits | Revision checks and conflict resolution |
| Build failure | Immutable artifacts and atomic active-version switch |
| Cache stale after unpublish | Versioned keys and explicit invalidation |
| User deletes source files | Health checks and recovery guidance |

## 13. Release acceptance

A production release is acceptable only when:
- Core user journeys pass end-to-end tests.
- Tenant isolation and OAuth token security are verified.
- Custom-code threat model and isolation tests pass.
- Save/Publish/Update semantics are verified.
- Failed update and rollback scenarios pass.
- Public requests do not query Sheets.
- Cache invalidation and Unpublish meet the agreed SLA.
- Export and recovery procedures are tested.
- Monitoring, alerting and incident runbooks exist.

## 14. Open decisions

1. Final page-builder engine and pinned version.
2. Exact Google OAuth scopes and verification path.
3. Public tenant hostname model and custom-code isolation.
4. Whether public media/build artifacts are served from Drive directly, replicated to R2, or use a hybrid.
5. Maximum page size, media size, collection size and build duration.
6. Custom JavaScript availability and abuse controls.
7. Custom domain availability and plan rules.
8. Retention period for old published versions and deleted accounts.
