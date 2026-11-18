# Site Capability and Shared Runtime

## 1. Site is not Project

A Site is an optional capability/entity attached to a Project.

- Project is the workspace.
- Site is a public website instance.
- Public slug and custom domains belong to Site.
- Runtime resolves requests to Site ID, then obtains the Project scope and published snapshot.

Suggested initial public URL:
`https://builly.indyshares.com/{site_slug}`

Do not use `project_slug` as a substitute for `site_slug`.

## 2. Shared Runtime

All published Sites use one shared Builly Runtime deployment on Cloudflare.

The Runtime:
- Resolves the Site from trusted hostname/path registry.
- Loads the active immutable published configuration snapshot.
- Renders using an allowlisted, versioned component registry.
- Applies theme and responsive rules.
- Fetches only public CMS data required by the current page.
- Handles public form submission through trusted form endpoints.
- Never reads private Inbox data for visitors.

## 3. Declarative configuration

Published JSON is declarative. It may describe:
- Pages and routes.
- Layout and component tree.
- Component properties.
- Theme tokens.
- Responsive overrides.
- Public CMS bindings.
- Public form references.
- Runtime compatibility version.

Do not execute arbitrary JavaScript from JSON. Components and capabilities must be allowlisted and versioned.

The editable Builder document may contain editor-only metadata such as stable element IDs, selection state metadata, and richer editing information. Published snapshots should contain only what Runtime needs.

## 4. Publish transaction

Recommended sequence:
1. Validate draft schema and supported component versions.
2. Validate assets and access references.
3. Validate CMS bindings and public field exposure.
4. Validate form definitions and server-side destinations.
5. Create immutable snapshot with a unique version ID.
6. Verify Runtime can load and interpret the snapshot.
7. Update active Site version pointer in trusted registry.
8. Invalidate or version public cache.
9. Record audit/publish event.
10. Retain previous version for rollback.

If any step before activation fails, keep the previous live version active.

## 5. Runtime data access

- Fetch only the data required for the current page.
- Expose only fields explicitly marked public.
- Use bounded pagination and response limits.
- Do not expose spreadsheet IDs, Drive IDs, OAuth tokens, private fields, or Inbox submissions.
- Never trust a client-supplied `site_id`, `project_id`, spreadsheet ID, or worksheet ID without server-side resolution and authorization.

## 6. Cache

- Cache immutable snapshots by version.
- Cache public CMS data only with a bounded freshness/revision strategy.
- Never publicly cache private Inbox submissions or authenticated management responses.
- Use versioned keys and explicit invalidation on publish/content updates.
- Cloudflare cache is ephemeral acceleration, not canonical storage.

## 7. Source export

Source Code is an optional, explicit download/export feature. It is not needed to run the published Site.

On user request, generate a ZIP with a portable structure such as:
```text
website-export/
├── index.html
├── pages/
├── components/
├── layouts/
├── styles/
├── scripts/
├── assets/
├── README.md
└── export-manifest.json
```

Export rules:
- Never include OAuth tokens, secrets, private Inbox submissions, or private owner data.
- Clearly document dependencies on Builly Runtime or adapters for dynamic CMS/forms.
- Do not claim an export is fully standalone if dynamic features still require Builly services.
- Keep export generation separate from publishing/runtime.
