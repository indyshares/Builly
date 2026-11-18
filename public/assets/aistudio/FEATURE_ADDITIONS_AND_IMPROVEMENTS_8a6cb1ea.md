# FEATURE_ADDITIONS_AND_IMPROVEMENTS.md

## IndyShares Portfolio Builder
### Supplemental Feature Additions & Improvements

**Document type:** Product Change Request / Supplemental Requirements  
**Status:** Draft for review  
**Purpose:** Add requirements to the existing IndyShares Portfolio Builder baseline without modifying or replacing previously approved project documents.

---

## 1. Change Summary

This document records two additions to the existing product requirements:

1. Responsive support for desktop, tablet, and mobile devices.
2. Public portfolio URLs using the path-based format:

   `https://domain.com/{portfolio-name}`

These requirements are additive. They do not replace or silently revise the existing TOR, PRD, User Stories & Epics, Backlog, requirements register, or README.

## 2. Feature A — Responsive Portfolio Websites

### 2.1 Objective

Every published portfolio must provide a usable, readable, and visually intentional experience across desktop, tablet, and mobile screen sizes.

Responsive behavior must be part of the website-building model, not merely a browser-level scaling behavior.

### 2.2 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| RWD-FR-001 | Published portfolio pages must support desktop, tablet, and mobile viewports. | Must |
| RWD-FR-002 | The builder must provide device preview modes for desktop, tablet, and mobile. | Must |
| RWD-FR-003 | Users must be able to configure responsive layout properties at supported breakpoints. | Must |
| RWD-FR-004 | Responsive properties must support, at minimum, layout direction, sizing, spacing, typography, alignment, and element visibility where applicable. | Must |
| RWD-FR-005 | The builder must preserve a sensible inheritance model so breakpoint-specific settings override defaults without unnecessarily duplicating all styles. | Must |
| RWD-FR-006 | Published pages must avoid unintended horizontal overflow at supported viewport sizes. | Must |
| RWD-FR-007 | Themes, templates, reusable components, and dynamic collection components must have responsive behavior. | Must |
| RWD-FR-008 | Users must be able to preview responsive changes before publishing. | Must |
| RWD-FR-009 | Responsive behavior must remain consistent after save, reload, publish, update, and rollback. | Must |
| RWD-FR-010 | The system should provide sensible responsive defaults for newly inserted elements and templates. | Should |

### 2.3 Breakpoint Model

Use a centrally managed breakpoint configuration rather than hardcoding unrelated breakpoint values across components.

Initial suggested defaults (subject to design validation):

| Device preset | Suggested CSS range |
|---|---|
| Mobile | Up to 767px |
| Tablet | 768px–1023px |
| Desktop | 1024px and above |

These are starting defaults, not immutable device definitions. The implementation should allow the platform to evolve breakpoint values without corrupting saved page documents.

### 2.4 Responsive Editing UX

The editor should provide:

- Device preview controls in the top toolbar.
- A clear indication of the currently selected breakpoint.
- Visual distinction between inherited values and breakpoint overrides, where practical.
- A predictable reset-to-inherited/default action.
- A way to inspect and edit responsive properties without requiring drag-and-drop.
- Warnings or visual indicators for likely overflow or broken layouts where feasible.

Changing a value in one breakpoint must follow documented inheritance rules. The UI must make it clear whether the user is changing a global/default value or an override for the selected breakpoint.

### 2.5 Editor Device Support

The editor itself must be responsive and usable on desktop, tablet, and mobile. The editing experience may adapt to the available screen space.

| Capability | Desktop | Tablet | Mobile |
|---|---|---|---|
| Open and manage projects/pages | Full | Full, adapted UI | Core workflows |
| Edit text, links, images, and content | Full | Full | Must support |
| Edit common style properties | Full | Full | Must support core properties |
| Device preview | Full | Full | Full |
| Navigator / layers | Persistent or docked panel | Adapted panel | Drawer or focused panel |
| Properties panel | Side panel | Adapted panel | Drawer or focused panel |
| Drag-and-drop | Full | Touch-friendly | Optional; provide non-drag alternatives |
| Advanced layout operations | Full | Supported where practical | May be simplified |
| Custom code editing | Full | Usable adapted experience | May be deferred or limited |

**Product recommendation:** Do not make mobile editing a read-only experience. Mobile users should be able to complete common content and page-management tasks. Advanced freeform layout and code-editing workflows may be optimized for tablet/desktop if implementing them on a phone would create a poor experience.

The exact mobile-versus-desktop feature parity remains a product decision and should be confirmed before final UX sign-off.

### 2.6 Responsive Acceptance Criteria

- A published portfolio can be navigated and read at mobile, tablet, and desktop viewport sizes.
- No critical content or primary navigation is clipped or inaccessible at supported sizes.
- The user can switch device preview modes in the editor.
- The user can set a breakpoint-specific value and see that value reflected in the matching preview.
- A breakpoint override does not unexpectedly alter other breakpoints.
- Saved responsive settings survive reload and are included in published builds.
- Rollback restores the responsive behavior of the selected previous build.
- Core editor workflows remain usable with touch input and without relying exclusively on drag-and-drop.

---

## 3. Feature B — Path-Based Public Portfolio URL

### 3.1 Objective

Each published portfolio must have a shareable public URL using this structure:

`https://{platform-domain}/{portfolio-name}`

Examples:

- `https://domain.com/john-doe`
- `https://domain.com/jane-smith`
- `https://domain.com/design-portfolio`

The examples use a placeholder domain. The production platform domain must be selected and configured separately.

### 3.2 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| URL-FR-001 | Each portfolio must have a unique public slug within the platform domain. | Must |
| URL-FR-002 | A published portfolio must be accessible at `https://{platform-domain}/{slug}`. | Must |
| URL-FR-003 | The owner must be able to choose a slug during setup or publishing. | Must |
| URL-FR-004 | The system must validate slug format and reject invalid values. | Must |
| URL-FR-005 | The system must prevent duplicate slugs. | Must |
| URL-FR-006 | The system must reserve platform paths such as `/admin`, `/login`, `/api`, `/pricing`, and other system routes. | Must |
| URL-FR-007 | Slug changes must update routing safely and must not cause one user's portfolio to resolve to another user's content. | Must |
| URL-FR-008 | Unpublished portfolios must not be publicly served as published websites. | Must |
| URL-FR-009 | Public routes must resolve to the currently active successful build. | Must |
| URL-FR-010 | Public HTML and assets must be cacheable without allowing cross-tenant cache leakage. | Must |
| URL-FR-011 | Each portfolio must support its own SEO title, description, canonical URL, and social-sharing metadata. | Must |
| URL-FR-012 | The platform should support a configurable redirect or migration policy for old slugs. | Should |

### 3.3 Recommended Routing Architecture

Use path-based multi-tenant routing through the Cloudflare Worker.

```text
Visitor
  |
  v
https://domain.com/{portfolio-name}
  |
  v
Cloudflare Worker
  |
  v
Parse and validate requested slug
  |
  v
Resolve slug to portfolio/site metadata
  |
  v
Check publication status and active build pointer
  |
  v
Serve the active immutable build
  |
  v
Cache the public response safely
```

The public request path must not read Google Sheets or rebuild a website. It should resolve the active published build and serve the pre-generated artifact. A cache miss must retrieve the active build from the configured durable artifact store; it must not trigger a live build from source data.

### 3.4 Data and Metadata

The platform metadata store (Supabase PostgreSQL under the current architecture) should maintain the routing registry. Suggested fields:

| Field | Purpose |
|---|---|
| `portfolio_id` | Stable internal portfolio identifier |
| `owner_id` | Portfolio owner |
| `slug` | Current public URL slug |
| `publication_status` | Draft, published, unpublished, suspended, or equivalent defined states |
| `active_build_id` | Pointer to the active successful immutable build |
| `created_at` | Creation timestamp |
| `updated_at` | Last metadata update timestamp |

Enforce slug uniqueness at the database level, not only in application code. Use stable portfolio IDs for internal relationships; do not use the slug as the permanent identity of a portfolio.

### 3.5 Slug Rules

Recommended initial rules:

- Lowercase letters, numbers, and hyphens.
- No leading or trailing hyphen.
- No consecutive separators unless explicitly supported.
- A configurable minimum and maximum length.
- Case-insensitive uniqueness.
- Reject reserved platform routes.
- Normalize input consistently before checking uniqueness.

The exact length limit and reserved-word list should be defined in platform configuration.

### 3.6 Slug Change Behavior

When an owner changes a slug:

1. Validate and normalize the requested slug.
2. Check uniqueness and reserved paths.
3. Update the routing registry atomically.
4. Purge or invalidate cache entries for the old and new paths.
5. Make the new path resolve to the active build.
6. Apply the chosen old-URL policy.

**Recommended default:** retain the old slug as a redirect alias for a configurable period, where feasible. If permanent redirects are not desired, clearly communicate that the old shared URL will stop working. Never silently assign an old slug to a different owner while it is still retained as an alias.

### 3.7 Public URL and Platform Route Separation

Recommended separation:

- Public portfolios: `https://domain.com/{portfolio-name}`
- Builder application: `https://app.domain.com`
- API: `https://api.domain.com` or Worker-managed API routes, depending on the final deployment design.

This separation reduces route collisions and helps isolate the editor application from untrusted public portfolio code. It does not, by itself, provide complete security isolation; authentication cookies, CORS, CSP, custom JavaScript execution, and tenant boundaries still require an explicit security design.

### 3.8 URL Acceptance Criteria

- A published portfolio is accessible using its assigned path-based URL.
- Two portfolios cannot claim the same normalized slug.
- Reserved routes cannot be claimed by users.
- An unpublished portfolio is not served as a public published site.
- The URL resolves to the active successful build, not an incomplete or failed build.
- A failed update does not replace the previous active build.
- Cache keys and routing resolution cannot return another tenant's content.
- Changing a slug follows the documented redirect or retirement policy.
- Page-level SEO and social metadata are present in the published output.

---

## 4. Cross-Feature Architecture Impacts

These additions affect existing system areas and should be reflected in implementation planning.

| Existing area | Required impact |
|---|---|
| Page Builder schema | Store responsive style/layout overrides and schema version information. |
| Builder UI | Add device preview and breakpoint-aware property editing. |
| Component library | Define responsive defaults and behavior for core components. |
| Theme system | Include responsive tokens, variants, and responsive navigation patterns. |
| Template system | Validate templates at mobile, tablet, and desktop sizes. |
| Publishing engine | Compile responsive styles into immutable published artifacts. |
| Public runtime | Resolve `{slug}` routes to the active build. |
| Supabase metadata | Maintain unique slug registry and active build pointer. |
| Cloudflare Worker | Route public requests, apply cache policy, and isolate tenant responses. |
| SEO | Generate canonical URLs and portfolio-specific metadata. |
| QA | Add responsive viewport tests and multi-tenant route/cache tests. |
| Security | Validate separation between the builder origin and public tenant content. |

## 5. Additional Non-Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| RWD-NFR-001 | Responsive pages should avoid unnecessary layout shifts and preserve readable content hierarchy. | Must |
| RWD-NFR-002 | Public pages must remain usable with touch input and keyboard navigation. | Must |
| URL-NFR-001 | Slug lookup must be efficient and backed by an indexed/unique database constraint. | Must |
| URL-NFR-002 | Public cache behavior must be tenant-safe and version-aware. | Must |
| URL-NFR-003 | Routing must fail safely when a slug is unknown, unpublished, or has no valid active build. | Must |
| URL-NFR-004 | Public routing must not expose private Google Drive/Sheets identifiers, OAuth tokens, or platform secrets. | Must |

## 6. QA and Test Coverage Additions

### Responsive test matrix

At minimum, test representative viewport widths:

- Small mobile: 320–375px
- Large mobile: 390–430px
- Tablet: 768–1023px
- Desktop: 1280px and above

Test:
- Navigation and menus.
- Text wrapping and typography.
- Images, video, and media sizing.
- Single-column and multi-column layouts.
- Nested containers.
- Forms and buttons.
- Dynamic collection grids/repeaters.
- Hidden/visible breakpoint behavior.
- Overflow and horizontal scrolling.
- Touch interaction in the editor.

### Routing and tenant-isolation test matrix

Test:
- Valid published slug.
- Unknown slug.
- Reserved slug.
- Duplicate slug, including case variations.
- Unpublished portfolio.
- Portfolio with no successful build.
- Failed build while an older build is active.
- Slug change and old URL behavior.
- Cache hit and cache miss.
- Two tenants with similar paths/assets.
- Attempted cache-key collision or cross-tenant response reuse.
- SEO canonical URL after slug change.

## 7. Backlog Additions

The following work items should be added to the existing backlog. They are supplemental and do not renumber or replace existing backlog items.

| Suggested ID | Work item | Suggested epic |
|---|---|---|
| ADD-RWD-01 | Define breakpoint and responsive inheritance specification | Responsive Builder |
| ADD-RWD-02 | Extend page/component schema for responsive overrides | Responsive Builder |
| ADD-RWD-03 | Implement device preview controls | Responsive Builder |
| ADD-RWD-04 | Implement breakpoint-aware property editing | Responsive Builder |
| ADD-RWD-05 | Add responsive defaults to core components and themes | Responsive Builder |
| ADD-RWD-06 | Adapt editor panels and navigation for tablet/mobile | Responsive Builder |
| ADD-RWD-07 | Add responsive visual regression and viewport tests | Quality Engineering |
| ADD-URL-01 | Define slug normalization, validation, and reserved route registry | Public URL & Routing |
| ADD-URL-02 | Add unique slug registry and database constraints | Public URL & Routing |
| ADD-URL-03 | Implement Worker path-based portfolio resolver | Public URL & Routing |
| ADD-URL-04 | Connect slug resolution to publication status and active build | Public URL & Routing |
| ADD-URL-05 | Implement slug change and old-URL policy | Public URL & Routing |
| ADD-URL-06 | Add tenant-safe cache keys and invalidation tests | Public URL & Routing |
| ADD-URL-07 | Generate canonical and social-sharing metadata | SEO & Sharing |
| ADD-URL-08 | Add multi-tenant routing and cache-isolation tests | Security & Quality Engineering |

## 8. Decisions to Confirm

The following decisions should be resolved before final UX and technical sign-off:

1. **Mobile editor parity:** Should mobile support all builder operations, or should advanced freeform layout and custom-code editing require tablet/desktop? Recommended: full common content editing on mobile; advanced layout/code workflows optimized for tablet/desktop.
2. **Platform domain:** What is the final public domain? `domain.com` is a placeholder in this document.
3. **Slug changes:** Should the previous slug redirect to the new slug, and for how long? Recommended: retain a redirect alias for a defined period, subject to route and SEO policy.
4. **Custom domains:** Is `domain.com/{slug}` the only public URL model initially, or should user-owned custom domains also be supported? The current baseline already treats custom domains as a possible platform capability; this supplemental change does not remove that possibility.

## 9. Relationship to Existing Documents

This document is an additive change record.

- Do not overwrite the previously created `TOR.md`.
- Do not overwrite the previously created `PRD.md`.
- Do not overwrite the previously created `USER_STORY_AND_EPIC.md`.
- Do not overwrite the previously created `BACKLOG.md`.
- Do not overwrite the previously created `requirements.txt`.
- Do not overwrite the previously created `README.md`.

When the project owner authorizes a consolidated documentation revision, these additions can be merged into the relevant source documents with traceable requirement IDs and backlog references.

---

**End of supplemental change document.**
