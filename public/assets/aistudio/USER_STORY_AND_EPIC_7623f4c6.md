# USER_STORY_AND_EPIC.md

## Purpose

This document groups product capabilities into epics and user stories. Stories are written from the user's perspective and include acceptance criteria that can become implementation and QA tests.

Priority:
- **P0:** Required for the core production product.
- **P1:** Important production capability; may be delivered in a later controlled release.
- **P2:** Expansion capability.

---

## EPIC E01 — Identity and Account

### US-001 — Sign in with Google
**Priority:** P0

As a visitor, I want to sign in with Google so that I can create and manage my portfolio.

Acceptance criteria:
- User can start Google sign-in.
- Successful authentication creates or retrieves the correct platform user.
- Failed/cancelled authentication returns a clear message.
- Protected routes require a valid session.
- Logout invalidates the application session.

### US-002 — Manage account profile
**Priority:** P0

As a user, I want to manage my platform profile so that my account information is accurate.

Acceptance criteria:
- User can view account email and profile metadata.
- User can update permitted profile fields.
- User cannot edit another user's profile.
- Profile data is not confused with public portfolio content.

### US-003 — Reconnect Google Workspace
**Priority:** P0

As a user, I want to reconnect Google when access expires or is revoked so that storage operations can resume.

Acceptance criteria:
- Connection health is visible.
- Expired access tokens are refreshed server-side where possible.
- Revoked/invalid refresh tokens trigger a reconnect flow.
- Existing source files are not deleted by disconnect/reconnect.

---

## EPIC E02 — Google Workspace Connection and Storage

### US-004 — Choose storage setup mode
**Priority:** P0

As a user, I want to choose automatic setup or existing Google resources so that I can use the storage arrangement I prefer.

Acceptance criteria:
- Auto Setup and Existing Storage options are shown.
- User understands which Google account is being connected.
- Required permissions are explained before consent.
- Setup progress and failures are visible.

### US-005 — Automatically provision storage
**Priority:** P0

As a user, I want the platform to create the required Drive folders and Spreadsheet so that I can start without manual setup.

Acceptance criteria:
- Provisioning creates the expected folder structure and named tabs.
- Provisioning is idempotent; retry does not create duplicate workspaces.
- Created resource IDs are saved in platform metadata and a Drive manifest.
- Partial failure can resume or clean up safely.
- User receives links to the created resources.

### US-006 — Select existing Spreadsheet and Drive folder
**Priority:** P0

As a user, I want to select existing Google resources so that I can keep using my current files.

Acceptance criteria:
- Google Picker lists eligible files/folders.
- The platform validates selected resources and access.
- Unsupported spreadsheet schema produces an actionable validation report.
- The platform does not modify unrelated files.
- The user can confirm any required setup changes.

### US-007 — Manage media library
**Priority:** P0

As a user, I want to upload and organize media in my Drive so that I can use it in my pages.

Acceptance criteria:
- Upload supports configured file types and size limits.
- Upload progress and failures are visible.
- Media records retain stable Drive file IDs.
- Missing/deleted media is detected.
- Public delivery does not require visitor authentication to the owner's Drive.

### US-008 — Export and recover workspace
**Priority:** P0

As a user, I want to export my website source and data so that I am not locked into the platform.

Acceptance criteria:
- User can export structured data and builder documents.
- Export includes an asset manifest and references.
- Recovery instructions explain how to reconnect or restore files.
- Export does not expose another user's information.

---

## EPIC E03 — Site and Page Management

### US-009 — Create and manage a site
**Priority:** P0

As a user, I want to create and configure my portfolio site.

Acceptance criteria:
- User can create a site with a unique slug.
- Reserved and duplicate slugs are rejected.
- Site settings are scoped to the owner.
- Site can be renamed without changing its internal ID.

### US-010 — Manage multiple pages
**Priority:** P0

As a user, I want to create and manage pages such as Home, About, Projects and Contact.

Acceptance criteria:
- Create, rename, duplicate, reorder and delete operations work.
- Each page has a stable ID and unique route within the site.
- A home page is defined.
- Deleting a page warns about links and references.
- Page documents are stored in the user's Drive.

### US-011 — Configure page SEO
**Priority:** P0

As a user, I want to set page titles and descriptions so that my website is represented correctly in search and social previews.

Acceptance criteria:
- Page title, description, canonical path and social image can be configured.
- Invalid or excessive metadata is validated.
- Metadata is included in the published output.

---

## EPIC E04 — Visual Page Builder

### US-012 — Add elements to a page
**Priority:** P0

As a user, I want to drag elements onto a canvas so that I can build my page visually.

Acceptance criteria:
- Elements are grouped and searchable.
- User can drag an element onto valid canvas targets.
- Nested placement is supported where allowed.
- Invalid drop targets are communicated.
- Keyboard/non-drag alternatives exist.

### US-013 — Nest and arrange elements
**Priority:** P0

As a user, I want to nest elements in containers and control their order.

Acceptance criteria:
- Element tree represents parent-child relationships.
- User can move, reorder and nest supported elements.
- Circular or invalid structures are prevented.
- Navigator reflects canvas changes immediately.

### US-014 — Edit element content
**Priority:** P0

As a user, I want to edit text, links, images and element attributes.

Acceptance criteria:
- Properties shown match selected element type.
- Changes update the canvas.
- Values are validated and safely rendered.
- Content changes are included in Save.

### US-015 — Style elements visually
**Priority:** P0

As a user, I want to control layout and visual styles without writing CSS.

Acceptance criteria:
- Controls cover supported typography, color, background, spacing, sizing, border, shadow and layout properties.
- Style changes update the preview.
- Unsupported values are rejected or normalized.
- Global styles can be reused.

### US-016 — Use Navigator/Layers
**Priority:** P0

As a user, I want a tree view of page elements so that I can select and manage complex layouts.

Acceptance criteria:
- Navigator shows nested structure.
- Select in Navigator selects the canvas element.
- Rename, duplicate, hide, lock, delete and reorder are supported as applicable.
- Canvas selection updates Navigator selection.

### US-017 — Undo and redo
**Priority:** P0

As a user, I want to undo and redo edits so that I can recover from mistakes.

Acceptance criteria:
- Supported editing operations enter history.
- Undo and redo restore consistent editor state.
- History is bounded.
- Save and reload behavior is documented.

### US-018 — Responsive editing
**Priority:** P0

As a user, I want to preview and override styles for different devices.

Acceptance criteria:
- Desktop, tablet and mobile previews are available.
- Breakpoint rules are consistent.
- Device-specific styles do not unexpectedly overwrite other breakpoints.
- Public output is responsive.

### US-019 — Reusable components
**Priority:** P0

As a user, I want to save a group of elements as a reusable component.

Acceptance criteria:
- User can save a selection as a named reusable component.
- Component can be inserted on another page.
- Update behavior is explicit: linked instance or detached copy.
- Component documents are stored in Drive.

---

## EPIC E05 — Custom Code

### US-020 — Add custom HTML
**Priority:** P0

As an advanced user, I want to add custom HTML so that I can create structures not covered by standard elements.

Acceptance criteria:
- HTML editor provides syntax highlighting and validation.
- Unsafe or unsupported embedding is handled according to policy.
- Custom HTML is stored as user source.
- Public output is encoded/isolated appropriately.

### US-021 — Add custom CSS
**Priority:** P0

As an advanced user, I want to add custom CSS at element, page and site scope.

Acceptance criteria:
- Scope is visible and predictable.
- CSS is stored in Drive and referenced from page/site documents.
- CSS cannot alter the platform admin origin.
- Build output includes the correct styles.

### US-022 — Add custom JavaScript
**Priority:** P0, gated by security sign-off

As an advanced user, I want to add custom JavaScript to my public website.

Acceptance criteria:
- User sees a clear security warning.
- Code executes only in the isolated public-site context.
- Code cannot access platform secrets or admin session cookies.
- CSP and sandbox policy are enforced.
- Failed or malicious code cannot break the platform control plane.
- User can disable or roll back the code.

---

## EPIC E06 — Dynamic Data and Collections

### US-023 — Define a collection
**Priority:** P0

As a user, I want to define a collection backed by a Google Sheets tab.

Acceptance criteria:
- Collection maps to a spreadsheet and tab.
- Field definitions and types are stored.
- A stable record ID field is required.
- Schema changes are validated.
- Unsupported or ambiguous columns are reported.

### US-024 — Bind element to a field
**Priority:** P0

As a user, I want to bind text, image and link elements to collection fields.

Acceptance criteria:
- Data source and field can be selected in the editor.
- Field types are checked against element types.
- Missing fields are reported before publishing.
- Binding metadata is saved in the page document.

### US-025 — Render collection repeater
**Priority:** P0

As a user, I want to repeat a card/layout for each record in a collection.

Acceptance criteria:
- Repeater resolves records during build.
- Sorting, filtering and item limits are supported within defined constraints.
- Empty states can be configured.
- Public requests do not query Google Sheets.

### US-026 — Refresh source data
**Priority:** P0

As a user, I want Update to read the latest Google Sheets data so that my published site reflects changes I made in Sheets.

Acceptance criteria:
- Update reads latest accessible source data.
- Data is validated against collection schemas.
- Failed reads fail the build safely.
- Existing public version remains active after failure.

---

## EPIC E07 — Themes and Templates

### US-027 — Browse themes and templates
**Priority:** P0

As a user, I want to browse themes and templates so that I can start from a design foundation.

Acceptance criteria:
- Catalog supports categories and previews.
- Theme/template metadata is versioned.
- User can preview before applying.
- Applying a theme does not erase content.

### US-028 — Customize theme freely
**Priority:** P0

As a user, I want to modify any supported element after applying a theme.

Acceptance criteria:
- Theme is a starting configuration, not a locked page.
- All normal builder operations remain available.
- Theme changes do not overwrite user content unexpectedly.

### US-029 — Save a page as a template
**Priority:** P1

As a user, I want to save a page or section as a reusable template.

Acceptance criteria:
- User can name and categorize the template.
- Template includes required assets and schema references.
- Template can be inserted into another page.
- Import handles version compatibility.

---

## EPIC E08 — Save, Publish and Update

### US-030 — Save draft
**Priority:** P0

As a user, I want to save my work without changing the live website.

Acceptance criteria:
- Page documents are persisted to Drive.
- Structured data is persisted to Sheets where applicable.
- Save state and revision are visible.
- Public active version remains unchanged.
- Save failure is clearly reported and recoverable.

### US-031 — Publish first release
**Priority:** P0

As a user, I want to publish my site for the first time.

Acceptance criteria:
- Preflight validation runs.
- Latest saved source and current Sheets data are read.
- Build artifacts are written as a new immutable version.
- Active version changes only after successful build validation.
- Public URL becomes available.
- Cache is warmed or populated safely.

### US-032 — Update published site
**Priority:** P0

As a user, I want to update my public website manually when I am ready.

Acceptance criteria:
- Update uses latest saved page documents and latest Sheets data.
- New version is built without overwriting the current active version.
- Active pointer switches only after successful build.
- Relevant cache is invalidated.
- Previous version remains available for rollback.
- Build report identifies errors and warnings.

### US-033 — Unpublish site
**Priority:** P0

As a user, I want to unpublish my website.

Acceptance criteria:
- Public access is disabled.
- Cache and route behavior meet the documented unpublish SLA.
- Source documents remain intact.
- Re-publish is possible.

### US-034 — Roll back a release
**Priority:** P0

As a user, I want to restore a previous successful release.

Acceptance criteria:
- User can select an available prior version.
- Version dependencies and assets are checked.
- Active version switches atomically.
- Cache is invalidated.
- Rollback event is audited.

---

## EPIC E09 — Public Delivery and Performance

### US-035 — Serve public pages
**Priority:** P0

As a visitor, I want to view a user's published portfolio without signing in.

Acceptance criteria:
- Public route resolves to the correct tenant and active build.
- Public request does not read Google Sheets.
- Public request does not expose private workspace metadata.
- Tenant boundaries are enforced.
- Missing/unpublished sites return correct status.

### US-036 — Cache public content
**Priority:** P0

As a visitor, I want the website to load quickly.

Acceptance criteria:
- HTML and immutable assets use appropriate cache policies.
- Cache keys include tenant and build/version context.
- Update invalidates or switches version safely.
- Cache miss retrieves the active build artifact, not live Sheets data.
- Cache is never the sole durable copy.

### US-037 — Deliver public media
**Priority:** P0

As a visitor, I want published images and media to load without accessing the owner's private Google account.

Acceptance criteria:
- Public assets have controlled delivery URLs or are included/replicated in build output.
- Private Drive permissions are not exposed.
- Deleted or unavailable assets are reported.
- Cache and access policies are explicit.

---

## EPIC E10 — Security, Privacy and Operations

### US-038 — Enforce tenant isolation
**Priority:** P0

As a user, I want my account, files and site to remain private from other users.

Acceptance criteria:
- Every authenticated operation checks ownership.
- RLS protects platform metadata.
- Public routes resolve only public data.
- Cross-tenant access tests pass.

### US-039 — Protect OAuth credentials
**Priority:** P0

As a user, I want Google credentials protected.

Acceptance criteria:
- Refresh tokens are encrypted at rest.
- Tokens are never sent to the browser.
- Token access is restricted to server-side services.
- Key rotation and incident response are documented.

### US-040 — Monitor system health
**Priority:** P0

As an operator, I want to identify failures in storage, builds, cache and public delivery.

Acceptance criteria:
- Correlation/request IDs are available.
- Build jobs have status and logs.
- Google API errors are categorized.
- Sensitive tokens and private content are not written to logs.
- Alerts exist for critical failure conditions.

### US-041 — Delete account and disconnect storage
**Priority:** P0

As a user, I want to disconnect Google or delete my platform account.

Acceptance criteria:
- User sees the consequences before confirmation.
- Disconnect revokes/deletes stored credentials as applicable.
- Account deletion follows documented retention and deletion policy.
- Public site and cached artifacts are disabled/removed within the defined SLA.
- User-owned Google files are not deleted without explicit consent.

---

## EPIC E11 — Platform Expansion

### US-042 — Custom domains
**Priority:** P1

As a user, I want to connect my own domain.

Acceptance criteria:
- Domain ownership is verified.
- Domain is mapped to the correct site.
- TLS is provisioned.
- Conflicting domain mappings are rejected.
- Unpublish and account deletion remove routing safely.

### US-043 — Analytics
**Priority:** P1

As a user, I want to see basic visitor analytics.

Acceptance criteria:
- Metrics respect privacy policy and applicable law.
- Analytics do not expose visitor personal data unnecessarily.
- User can disable analytics where supported.

### US-044 — Plan and entitlement controls
**Priority:** P1

As an operator, I want to manage feature entitlements.

Acceptance criteria:
- Limits are enforced server-side.
- UI reflects available features.
- Existing user content is not deleted when a plan changes.
