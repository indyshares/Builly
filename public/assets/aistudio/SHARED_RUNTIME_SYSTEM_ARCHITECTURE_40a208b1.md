# Builly — Shared Runtime System Architecture

**Status:** Target architecture approved in principle  
**Runtime model:** A — Shared Runtime across all published sites  
**Primary platform:** Cloudflare  
**Identity:** Supabase Auth  
**Canonical user data:** Google Drive + Google Sheets

## 1. Product model

Builly is a multi-site visual website platform. The user creates and manages sites through the existing Visual Builder and CMS. Published websites do not run from per-site generated HTML/CSS/JS bundles. Instead, every published website is rendered by the same shared Builly Runtime using that site's published configuration and data.

### Three separate concerns

1. **Editor model** — editable structured document used by Visual Builder.
2. **Published configuration** — immutable, validated snapshot consumed by Runtime.
3. **Source export** — downloadable HTML/CSS/JS package generated on explicit user request.

Do not conflate these three.

## 2. High-level architecture

```text
Builly Owner
   |
   v
Existing Visual Builder + CMS
   |
   +--> Save editable documents/config --> Google Drive
   |
   +--> CMS records ---------------------> Separate Google Sheets files
   |
   +--> Assets --------------------------> Google Drive
   |
   v
Publish / Validate
   |
   +--> Create immutable Published Config Snapshot
   +--> Update active publish pointer only after validation
   |
   v
Cloudflare Shared Runtime
   |
   +--> Resolve hostname/path to site_id
   +--> Load active published config snapshot
   +--> Render page using shared component registry
   +--> Fetch public CMS data through backend data service
   +--> Submit forms through protected submission endpoint
   |
   v
Visitor's website

Separate owner action:
Visual Builder --> Export Source --> HTML/CSS/JS + assets ZIP --> User download
```

## 3. Shared Runtime responsibilities

The Runtime is a common application deployed once (or by controlled platform releases), serving many sites. It must:

- Resolve incoming hostname/path to the correct `site_id`.
- Load the active published configuration for that site.
- Resolve the requested page and route.
- Render only supported, registered component types.
- Apply theme tokens, layout, responsive rules and element styles.
- Resolve CMS bindings through a trusted backend service.
- Render CMS-driven lists/detail pages.
- Render forms from published form definitions.
- Submit form data only to the destination configured by the server.
- Return site-specific metadata, SEO and assets.
- Cache public configuration and public CMS responses safely.
- Never expose private owner Drive/Sheets access or Inbox data to visitors.

Runtime must not load the entire owner Drive or every Spreadsheet at request time.

## 4. Runtime deployment model

Recommended: one shared Cloudflare Worker/Pages application with:
- Runtime frontend/rendering layer
- Site resolution service
- Published config repository/loader
- Public CMS query service
- Public form submission service
- Cache layer

Cloudflare deployment is shared, but configuration and data are isolated per site and owner.

Do not create one Worker deployment per customer site unless a later product requirement justifies it.

## 5. Site resolution

A trusted site registry maps:
- normalized hostname and optional path prefix
- `site_id`
- owner account
- active publish version/config reference
- site status

For current subdomain pattern `builly.indyshares.com/{site-slug}`, resolve the first path segment as a candidate site slug, then verify it against the server-side registry. Never trust a client-supplied `site_id` alone.

If custom domains are introduced later, hostname mapping must be verified and normalized server-side.

## 6. Configuration loading and rendering

1. Resolve site and route.
2. Read active published manifest.
3. Load the immutable config snapshot (or cache hit).
4. Validate schema version and supported component types.
5. Resolve theme and page config.
6. Fetch only the public CMS datasets referenced by the current page.
7. Render component tree.
8. Resolve asset references through safe public asset URLs/proxy.
9. Return rendered page.

A visitor request must not read the Builder's mutable draft document. Published Runtime consumes a published snapshot so draft edits cannot leak to visitors.

## 7. Component registry

Runtime has a versioned component registry:
- `heading`
- `text`
- `image`
- `button`
- `container`
- `section`
- `grid`
- `form`
- CMS list/detail components
- other supported Visual Builder components

Each type has a renderer and validated property schema. Unknown types should fail safely with a logged diagnostic and a non-breaking fallback where possible. Never evaluate arbitrary JavaScript embedded in JSON configuration.

## 8. Multi-tenant isolation

Every resolved site must be checked against:
- site status
- owner account
- published config reference
- CMS data source permissions
- allowed public fields
- allowed form destination

A visitor can read only data explicitly marked public and published. Inbox submissions, notes, activity logs, private CMS fields and owner metadata are never exposed.

## 9. What remains unchanged

Do not rebuild the existing Visual Builder from scratch. Preserve:
- Drag & Drop
- Property Inspector
- responsive editing
- themes and layouts
- CMS editor
- Inbox management
- Preview / Publish / Version History
- existing save/load semantics until audited

Implement the shared runtime and new storage boundaries incrementally around proven existing behavior.
