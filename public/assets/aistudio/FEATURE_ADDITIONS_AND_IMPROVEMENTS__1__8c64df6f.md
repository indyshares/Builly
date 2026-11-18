# FEATURE_ADDITIONS_AND_IMPROVEMENTS.md

## IndyShares Portfolio Builder
### Supplemental Platform-Wide Responsive Design & Public URL Requirements

**Document type:** Product Change Request / Supplemental Requirements  
**Status:** Draft for review  
**Version:** 2.0  
**Purpose:** Add platform-wide responsive design requirements and path-based public portfolio URLs to the existing IndyShares baseline without modifying or replacing previously approved project documents.

---

## 1. Change Summary

This change request adds two product capabilities:

1. **Platform-wide responsive experience:** The entire IndyShares product must be usable across desktop, tablet, and mobile devices. This includes marketing/public pages, authentication, dashboard, portfolio management, builder, templates, media management, account settings, billing, and published portfolio websites.
2. **Path-based public portfolio URLs:** Each published portfolio can be shared using `https://{platform-domain}/{portfolio-name}`.

These requirements are additive. They do not replace or silently revise the existing TOR, PRD, User Stories & Epics, Backlog, requirements register, or README.

### 1.1 Important distinction

There are two separate responsive concerns:

- **IndyShares Platform UI:** The SaaS application used to sign in, manage portfolios, edit settings, manage assets, and use the builder.
- **Published Portfolio Websites:** The websites created by users through the Page Builder.

Both must be responsive. They have different UX requirements and test coverage, while sharing a consistent platform design system and breakpoint strategy where appropriate.

---

## 2. Feature A — Platform-Wide Responsive Design

### 2.1 Objective

Every user-facing area of IndyShares must provide an effective and accessible experience on desktop, tablet, and mobile. Responsive support is a platform-level quality requirement, not a feature limited to the Page Builder or published portfolio output.

The platform must adapt layouts and interaction patterns to available screen space. It must not simply scale down desktop layouts.

### 2.2 Scope

| Platform area | Desktop | Tablet | Mobile |
|---|---|---|---|
| Marketing / landing pages | Full | Full responsive layout | Full responsive layout |
| Public product/pricing pages | Full | Full responsive layout | Full responsive layout |
| Login / registration / authentication | Full | Full | Full |
| Onboarding / setup wizard | Full | Full | Full |
| User dashboard | Full | Adaptive layout | Mobile-first layout |
| Portfolio list / portfolio management | Full | Adaptive layout | Mobile-friendly cards/list |
| Page Builder editor | Full editor | Adapted editor | Core editing workflows |
| Theme / template library | Full | Adaptive grid | Mobile-friendly list/grid |
| Media / asset management | Full | Adaptive layout | Mobile-friendly management |
| Account / profile / settings | Full | Full | Full |
| Subscription / billing | Full | Full | Full |
| Notifications / help / support | Full | Full | Full |
| Published portfolio websites | Full | Full | Full |

Any future user-facing module must follow the same platform responsive standards unless an explicit exception is approved and documented.

### 2.3 Platform-Wide Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| PLAT-RWD-FR-001 | All user-facing platform routes and modules must support desktop, tablet, and mobile viewports. | Must |
| PLAT-RWD-FR-002 | Shared navigation, page shells, forms, buttons, menus, dialogs, tables, cards, and feedback components must have defined responsive behavior. | Must |
| PLAT-RWD-FR-003 | The platform must use shared responsive design tokens and centrally managed breakpoints. | Must |
| PLAT-RWD-FR-004 | Navigation must adapt to screen size, such as sidebar on desktop and drawer or another suitable mobile pattern. | Must |
| PLAT-RWD-FR-005 | Dashboard metrics and content grids must reflow without clipping or unreadable compression. | Must |
| PLAT-RWD-FR-006 | Data tables must provide a usable narrow-screen presentation, such as responsive columns, card/list transformation, or controlled horizontal scrolling where appropriate. | Must |
| PLAT-RWD-FR-007 | Forms, validation messages, inputs, upload controls, and primary actions must be usable on touch devices. | Must |
| PLAT-RWD-FR-008 | Dialogs, drawers, popovers, and menus must fit within the available viewport and remain operable. | Must |
| PLAT-RWD-FR-009 | No critical workflow may require a desktop-only interaction when a mobile alternative can reasonably be provided. | Must |
| PLAT-RWD-FR-010 | The platform must avoid unintended horizontal overflow at supported viewport sizes. | Must |
| PLAT-RWD-FR-011 | Layouts must account for mobile browser safe areas and on-screen keyboards where relevant. | Must |
| PLAT-RWD-FR-012 | Touch targets and focus states must meet the product's accessibility standard. | Must |
| PLAT-RWD-FR-013 | Responsive behavior must be included in design reviews, implementation reviews, and regression testing for every module. | Must |
| PLAT-RWD-FR-014 | Loading, empty, error, and success states must also be responsive. | Must |
| PLAT-RWD-FR-015 | The platform should preserve user workflow context when navigation changes between responsive layouts. | Should |

### 2.4 Shared Responsive Design System

Create and maintain shared responsive foundations, preferably in the existing proposed `packages/design-system` package.

The design system should define:

- Breakpoint tokens and responsive utilities.
- Spacing, sizing, typography, and layout tokens.
- Responsive page containers and grid rules.
- Navigation patterns: sidebar, drawer, tabs, and mobile navigation where appropriate.
- Responsive form controls and validation.
- Responsive table/list patterns.
- Dialog, drawer, menu, and popover behavior.
- Touch target sizing and interaction states.
- Accessibility rules for keyboard, focus, and screen readers.

All platform applications and modules should consume these shared foundations rather than implementing unrelated breakpoint values and one-off responsive behavior.

### 2.5 Breakpoint Strategy

Use centrally managed breakpoints. Initial suggested defaults:

| Preset | Suggested range |
|---|---|
| Mobile | Up to 767px |
| Tablet | 768px–1023px |
| Desktop | 1024px and above |

These are initial design presets, not fixed definitions of physical devices. Components should respond to available space and content constraints, not assume that a device category always has one exact width.

The platform design system may define additional internal breakpoints if justified, but shared conventions must remain documented.

### 2.6 Responsive Navigation and Layout Guidance

Recommended defaults, subject to UX validation:

- Desktop: persistent sidebar or full navigation where it improves workflow efficiency.
- Tablet: collapsible sidebar, compact navigation, or adaptive panels.
- Mobile: drawer, compact header, bottom navigation, or focused navigation depending on the module.
- Dashboard: stack or reflow summary metrics and content; do not squeeze desktop columns into unreadable cards.
- Tables: prioritize important fields, provide row details, or use a card/list representation where appropriate.
- Forms: single-column layout on narrow screens; keep labels, validation, and actions visible.
- Dialogs: use full-height or near-full-screen sheets on mobile when conventional centered dialogs are too constrained.
- Long workflows: preserve progress and entered data when moving between steps or opening responsive navigation.

Do not force one navigation pattern onto every module. Use shared components and interaction rules while allowing patterns appropriate to each workflow.

### 2.7 Platform Responsive Acceptance Criteria

- Every in-scope platform route can be opened and used at mobile, tablet, and desktop widths.
- Primary navigation and critical actions remain discoverable and operable.
- No critical content, field, button, or workflow is clipped or inaccessible.
- Tables, forms, dialogs, and menus use intentional narrow-screen behavior.
- The on-screen keyboard does not permanently obscure the active input or primary form action.
- Touch interactions do not depend on hover-only behavior.
- Loading, empty, error, and success states remain usable at all supported widths.
- Shared components behave consistently across modules.
- Responsive regressions are covered by automated and manual checks.

---

## 3. Feature B — Responsive Page Builder and Published Websites

This section is additional to platform-wide responsiveness. The Page Builder requires its own responsive authoring capabilities because users are designing a separate public website.

### 3.1 Published Portfolio Requirements

| ID | Requirement | Priority |
|---|---|---|
| PORT-RWD-FR-001 | Published portfolio pages must support desktop, tablet, and mobile viewports. | Must |
| PORT-RWD-FR-002 | The builder must provide device preview modes for desktop, tablet, and mobile. | Must |
| PORT-RWD-FR-003 | Users must be able to configure responsive layout properties at supported breakpoints. | Must |
| PORT-RWD-FR-004 | Responsive properties must support layout direction, sizing, spacing, typography, alignment, and visibility where applicable. | Must |
| PORT-RWD-FR-005 | The builder must use documented inheritance rules so breakpoint-specific settings override defaults predictably. | Must |
| PORT-RWD-FR-006 | Published pages must avoid unintended horizontal overflow at supported viewport sizes. | Must |
| PORT-RWD-FR-007 | Themes, templates, reusable components, and dynamic collection components must have responsive behavior. | Must |
| PORT-RWD-FR-008 | Users must preview responsive changes before publishing. | Must |
| PORT-RWD-FR-009 | Responsive settings must survive save, reload, publish, update, and rollback. | Must |
| PORT-RWD-FR-010 | New elements and templates should have sensible responsive defaults. | Should |

### 3.2 Responsive Editing UX

The editor should provide:

- Device preview controls in the top toolbar.
- A clear indication of the selected breakpoint.
- A distinction between inherited values and breakpoint overrides, where practical.
- A reset-to-inherited/default action.
- Responsive property editing without requiring drag-and-drop.
- Warnings or visual indicators for likely overflow or broken layouts where feasible.

The UI must clearly indicate whether a user is changing a global/default value or an override for the selected breakpoint.

### 3.3 Editor Device Support

| Capability | Desktop | Tablet | Mobile |
|---|---|---|---|
| Open and manage projects/pages | Full | Full, adapted UI | Core workflows |
| Edit text, links, images, and content | Full | Full | Must support |
| Edit common style properties | Full | Full | Must support core properties |
| Device preview | Full | Full | Full |
| Navigator / layers | Docked or persistent panel | Adapted panel | Drawer/focused panel |
| Properties panel | Side panel | Adapted panel | Drawer/focused panel |
| Drag-and-drop | Full | Touch-friendly | Optional; provide non-drag alternatives |
| Advanced layout operations | Full | Supported where practical | May be simplified |
| Custom code editing | Full | Adapted experience | May be limited/deferred |

**Product recommendation:** Mobile editing must not be read-only. Users should be able to complete common content and page-management tasks. Advanced freeform layout and code editing may be optimized for tablet/desktop if full phone support would produce a poor UX.

Exact mobile-versus-desktop feature parity remains a product decision requiring UX sign-off.

### 3.4 Suggested Responsive Acceptance Criteria

- A published portfolio is navigable and readable at supported viewport sizes.
- No critical content or primary navigation is clipped.
- Users can switch device preview modes.
- Breakpoint-specific values appear in the corresponding preview.
- Overrides do not unexpectedly alter other breakpoints.
- Responsive settings survive reload and are included in published builds.
- Rollback restores the responsive behavior of the selected previous build.
- Core editor workflows support touch and non-drag alternatives.

---

## 4. Feature C — Path-Based Public Portfolio URL

### 4.1 Objective

Each published portfolio must have a shareable public URL in this format:

`https://{platform-domain}/{portfolio-name}`

Examples:

- `https://domain.com/john-doe`
- `https://domain.com/jane-smith`
- `https://domain.com/design-portfolio`

`domain.com` is a placeholder. The production platform domain must be selected separately.

### 4.2 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| URL-FR-001 | Each portfolio must have a unique public slug within the platform domain. | Must |
| URL-FR-002 | A published portfolio must be accessible at `https://{platform-domain}/{slug}`. | Must |
| URL-FR-003 | The owner must be able to choose a slug during setup or publishing. | Must |
| URL-FR-004 | The system must validate and normalize slugs. | Must |
| URL-FR-005 | Duplicate normalized slugs must be rejected. | Must |
| URL-FR-006 | Platform routes such as `/admin`, `/login`, `/api`, `/pricing`, and other reserved paths must not be claimable. | Must |
| URL-FR-007 | Slug changes must update routing safely and must not cause cross-tenant content resolution. | Must |
| URL-FR-008 | Unpublished portfolios must not be served as published websites. | Must |
| URL-FR-009 | Public routes must resolve to the currently active successful build. | Must |
| URL-FR-010 | Public HTML and assets must be cacheable without cross-tenant cache leakage. | Must |
| URL-FR-011 | Each portfolio must support SEO title, description, canonical URL, and social-sharing metadata. | Must |
| URL-FR-012 | The system should support a configurable redirect or migration policy for old slugs. | Should |

### 4.3 Recommended Routing Architecture

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

The public request path must not read Google Sheets or rebuild the website. It should resolve the active published build and serve a pre-generated artifact. A cache miss must retrieve the active build from the configured durable artifact store; it must not trigger a live build from source data.

### 4.4 Metadata Registry

The platform metadata store (Supabase PostgreSQL under the current architecture) should maintain routing metadata. Suggested fields:

| Field | Purpose |
|---|---|
| `portfolio_id` | Stable internal portfolio identifier |
| `owner_id` | Portfolio owner |
| `slug` | Current public URL slug |
| `publication_status` | Draft, published, unpublished, suspended, or equivalent defined states |
| `active_build_id` | Pointer to active successful immutable build |
| `created_at` | Creation timestamp |
| `updated_at` | Last metadata update timestamp |

Enforce slug uniqueness at the database level. Use stable portfolio IDs for internal relationships; do not use the slug as the permanent identity of a portfolio.

### 4.5 Slug Rules and Change Behavior

Recommended initial rules:

- Lowercase letters, numbers, and hyphens.
- No leading or trailing hyphen.
- Configurable minimum and maximum length.
- Case-insensitive uniqueness.
- Reject reserved platform routes.
- Normalize input consistently before checking uniqueness.

When an owner changes a slug:

1. Validate and normalize the requested slug.
2. Check uniqueness and reserved paths.
3. Update the routing registry atomically.
4. Purge or invalidate cache entries for old and new paths.
5. Make the new path resolve to the active build.
6. Apply the documented old-URL policy.

**Recommended default:** retain the old slug as a redirect alias for a configurable period, where feasible. Never silently assign an old slug to another owner while it is retained as an alias.

### 4.6 Public URL and Platform Route Separation

Recommended separation:

- Public portfolios: `https://domain.com/{portfolio-name}`
- Builder application: `https://app.domain.com`
- API: `https://api.domain.com` or Worker-managed API routes, depending on final deployment design.

This separation reduces route collisions and helps isolate the editor application from untrusted public portfolio code. It does not by itself provide complete security isolation. Authentication cookies, CORS, CSP, custom JavaScript execution, and tenant boundaries still require explicit security design.

### 4.7 URL Acceptance Criteria

- A published portfolio is accessible using its assigned path-based URL.
- Two portfolios cannot claim the same normalized slug.
- Reserved routes cannot be claimed.
- An unpublished portfolio is not served as a public published site.
- The URL resolves to the active successful build, not an incomplete or failed build.
- A failed update does not replace the previous active build.
- Cache keys and routing resolution cannot return another tenant's content.
- Slug changes follow the documented redirect or retirement policy.
- Page-level SEO and social metadata are present in published output.

---

## 5. Cross-Feature Architecture Impacts

| Existing area | Required impact |
|---|---|
| `packages/design-system` | Shared responsive tokens, breakpoints, layout primitives, navigation, forms, tables, dialogs, and accessibility standards for the entire platform. |
| Platform applications | Every route and module must adopt shared responsive foundations and pass viewport QA. |
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
| QA | Add platform-wide viewport tests, published-site responsive tests, and route/cache-isolation tests. |
| Security | Validate separation between builder origin and public tenant content. |

### 5.1 Architecture Principle

Do not create two competing responsive systems with unrelated rules.

- The **platform design system** owns shared breakpoints, tokens, and responsive component standards.
- The **Page Builder responsive model** owns user-editable breakpoint overrides for generated portfolio pages.
- Both should use compatible breakpoint definitions and documented conventions.
- User-authored portfolio styling must not be allowed to break the IndyShares platform UI.

---

## 6. Additional Non-Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| PLAT-RWD-NFR-001 | Platform UI must preserve readable hierarchy and usable interaction at supported viewport sizes. | Must |
| PLAT-RWD-NFR-002 | Responsive behavior must account for keyboard navigation, focus visibility, and touch interaction. | Must |
| PLAT-RWD-NFR-003 | Responsive layouts must not rely on hover as the only way to access essential actions. | Must |
| PLAT-RWD-NFR-004 | Shared responsive components must be reusable and consistently maintained. | Must |
| URL-NFR-001 | Slug lookup must be efficient and backed by an indexed/unique database constraint. | Must |
| URL-NFR-002 | Public cache behavior must be tenant-safe and version-aware. | Must |
| URL-NFR-003 | Routing must fail safely when a slug is unknown, unpublished, or has no valid active build. | Must |
| URL-NFR-004 | Public routing must not expose private Google Drive/Sheets identifiers, OAuth tokens, or platform secrets. | Must |

---

## 7. QA and Test Coverage Additions

### 7.1 Responsive Viewport Matrix

At minimum, test representative widths:

| Category | Test widths |
|---|---|
| Small mobile | 320px, 360px |
| Typical mobile | 390px, 430px |
| Tablet | 768px, 820px, 1024px |
| Desktop | 1280px, 1440px |
| Large desktop | 1920px |

Test representative routes and workflows from every platform module, not only the Page Builder.

### 7.2 Platform UI Test Scenarios

- Landing page and pricing navigation.
- Login, registration, password/session flows where applicable.
- Onboarding and Google Workspace connection/setup.
- Dashboard navigation and metric cards.
- Portfolio list, create, rename, duplicate, and delete flows.
- Theme/template selection.
- Media upload, browse, select, and delete flows.
- Builder launch, core editing, save, preview, and publish.
- Account profile and settings.
- Subscription and billing screens.
- Notifications, help, and support.
- Loading, empty, error, validation, and success states.
- Mobile keyboard behavior and touch interactions.
- Drawer/dialog open, close, scroll, and focus behavior.

### 7.3 Published Portfolio Responsive Test Scenarios

- Navigation and menus.
- Text wrapping and typography.
- Images, video, and media sizing.
- Single-column and multi-column layouts.
- Nested containers.
- Forms and buttons.
- Dynamic collection grids/repeaters.
- Breakpoint visibility behavior.
- Overflow and horizontal scrolling.
- Responsive behavior after publish, update, and rollback.

### 7.4 Routing and Tenant-Isolation Test Scenarios

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
- Cache-key collision or cross-tenant response reuse attempts.
- SEO canonical URL after slug change.

### 7.5 Quality Gates

A module should not be considered complete solely because its desktop view works. Each module's release checklist must include:

- Desktop responsive review.
- Tablet responsive review.
- Mobile responsive review.
- Keyboard and touch interaction review.
- Empty/loading/error state review.
- Regression checks for shared components.

---

## 8. Backlog Additions

These IDs are supplemental. Do not renumber or replace existing backlog items.

| Suggested ID | Work item | Suggested epic |
|---|---|---|
| ADD-PLAT-RWD-01 | Define platform-wide responsive design standards and breakpoint tokens | Platform Design System |
| ADD-PLAT-RWD-02 | Implement shared responsive page shells and layout primitives | Platform Design System |
| ADD-PLAT-RWD-03 | Implement responsive navigation patterns | Platform UX |
| ADD-PLAT-RWD-04 | Implement responsive forms, validation, dialogs, menus, and upload controls | Platform Design System |
| ADD-PLAT-RWD-05 | Define responsive data table and list/card patterns | Platform UX |
| ADD-PLAT-RWD-06 | Audit and adapt marketing, authentication, and onboarding routes | Platform Responsive Rollout |
| ADD-PLAT-RWD-07 | Audit and adapt dashboard and portfolio management | Platform Responsive Rollout |
| ADD-PLAT-RWD-08 | Audit and adapt theme/template and media management | Platform Responsive Rollout |
| ADD-PLAT-RWD-09 | Audit and adapt account, settings, billing, and support routes | Platform Responsive Rollout |
| ADD-PLAT-RWD-10 | Add platform-wide responsive automated and manual QA | Quality Engineering |
| ADD-PORT-RWD-01 | Define portfolio breakpoint and responsive inheritance specification | Responsive Builder |
| ADD-PORT-RWD-02 | Extend page/component schema for responsive overrides | Responsive Builder |
| ADD-PORT-RWD-03 | Implement device preview controls | Responsive Builder |
| ADD-PORT-RWD-04 | Implement breakpoint-aware property editing | Responsive Builder |
| ADD-PORT-RWD-05 | Add responsive defaults to core components and themes | Responsive Builder |
| ADD-PORT-RWD-06 | Adapt editor panels and navigation for tablet/mobile | Responsive Builder |
| ADD-PORT-RWD-07 | Add published-site responsive visual regression tests | Quality Engineering |
| ADD-URL-01 | Define slug normalization, validation, and reserved route registry | Public URL & Routing |
| ADD-URL-02 | Add unique slug registry and database constraints | Public URL & Routing |
| ADD-URL-03 | Implement Worker path-based portfolio resolver | Public URL & Routing |
| ADD-URL-04 | Connect slug resolution to publication status and active build | Public URL & Routing |
| ADD-URL-05 | Implement slug change and old-URL policy | Public URL & Routing |
| ADD-URL-06 | Add tenant-safe cache keys and invalidation tests | Public URL & Routing |
| ADD-URL-07 | Generate canonical and social-sharing metadata | SEO & Sharing |
| ADD-URL-08 | Add multi-tenant routing and cache-isolation tests | Security & Quality Engineering |

---

## 9. Decisions to Confirm

1. **Mobile editor parity:** Recommended: mobile supports common content editing and page management; advanced freeform layout and custom-code workflows are optimized for tablet/desktop.
2. **Platform domain:** What is the final public domain? `domain.com` is a placeholder.
3. **Slug changes:** Should the previous slug redirect to the new slug, and for how long? Recommended: retain a redirect alias for a defined period, subject to route and SEO policy.
4. **Custom domains:** Is `domain.com/{slug}` the only public URL model initially, or should user-owned custom domains also be supported? This document does not remove the existing custom-domain direction.
5. **Mobile navigation patterns:** Confirm per-module patterns during UX design rather than forcing a single navigation pattern across the entire application.

---

## 10. Relationship to Existing Documents

This document is a supplemental change record and does not authorize overwriting existing project documents.

- Do not overwrite `TOR.md`.
- Do not overwrite `PRD.md`.
- Do not overwrite `USER_STORY_AND_EPIC.md`.
- Do not overwrite `BACKLOG.md`.
- Do not overwrite `requirements.txt`.
- Do not overwrite `README.md`.

When the project owner authorizes a consolidated documentation revision, these additions can be merged into the relevant source documents with traceable requirement IDs and backlog references.

---

**End of supplemental change document.**
