# Published Configuration & Rendering Contract

## 1. Two configuration layers

### Editable Builder Document
Mutable document saved by the Builder. Contains editor-specific metadata:
- element IDs and parent-child structure
- component type and properties
- responsive overrides
- editor selection/order metadata where needed
- CMS bindings and form references
- reusable component references

### Published Configuration Snapshot
Immutable validated snapshot used by Runtime. It should contain only runtime-required data:
- site identity and publish version
- route/page map
- component tree
- resolved theme tokens
- public CMS binding definitions
- public form definitions (never secret destinations)
- asset references
- SEO and runtime settings
- schema/runtime compatibility version

The published snapshot must not contain OAuth tokens, private Inbox data, internal notes, private owner data, or raw unrestricted Spreadsheet IDs if those should remain server-side.

## 2. Suggested Drive layout

```text
Builly/
└── Sites/
    └── {site-slug}/
        ├── Config/
        │   ├── Draft/
        │   │   ├── site.config.json
        │   │   ├── pages/
        │   │   │   ├── home.json
        │   │   │   └── about.json
        │   │   ├── theme.json
        │   │   ├── components.json
        │   │   ├── cms-bindings.json
        │   │   └── forms.json
        │   └── Published/
        │       ├── build_0001/
        │       │   ├── publish-manifest.json
        │       │   └── runtime-config.json
        │       └── build_0002/
        ├── Assets/
        └── Exports/
```

This is a target layout, not an instruction to duplicate current files before audit. Use Drive file IDs as canonical references.

## 3. Rendering contract

Runtime interprets JSON as declarative configuration, not executable code.

Example only:

```json
{
  "schemaVersion": 1,
  "siteId": "site_123",
  "publishVersion": "build_0002",
  "routes": {
    "/": "page_home"
  },
  "pages": {
    "page_home": {
      "title": "Home",
      "elements": [
        {
          "id": "hero_001",
          "type": "section",
          "props": {
            "background": "#F7F6FA",
            "padding": {
              "desktop": "80px 40px",
              "tablet": "48px 24px",
              "mobile": "32px 16px"
            }
          },
          "children": [
            {
              "id": "heading_001",
              "type": "heading",
              "props": {
                "text": "Building Digital Experiences",
                "fontSize": {
                  "desktop": "48px",
                  "tablet": "38px",
                  "mobile": "30px"
                }
              }
            }
          ]
        }
      ]
    }
  }
}
```

This is illustrative only. AI Studio must inspect the existing Builder schema and preserve its real property names and semantics. Do not replace the current document model with this sample.

## 4. Component contract

Each registered renderer defines:
- stable `type`
- supported schema version
- allowed props and value types
- child policy
- responsive property behavior
- style token resolution
- accessibility behavior
- CMS/form integration behavior

Runtime must reject or safely ignore unknown/invalid properties. Do not use `eval`, `new Function`, inline arbitrary scripts, or arbitrary HTML from untrusted config.

## 5. CMS binding contract

A published binding identifies a public content query using server-defined identifiers:
- `content_type_key`
- public field selection
- filter/sort rules from an allowlisted query grammar
- pagination limits
- route parameter bindings for detail pages

The public browser should not be able to submit arbitrary Spreadsheet IDs, worksheet names, A1 ranges or owner IDs. The backend resolves these from trusted registries and enforces public field allowlists.

## 6. Form contract

Published form config may contain:
- form ID
- visible fields
- labels/placeholders
- validation rules
- success message/redirect
- public category identifier if allowed

It must not expose:
- destination Spreadsheet ID
- destination worksheet ID
- owner OAuth credentials
- private routing or internal notes

The server resolves the form ID to the configured Inbox destination. Apply validation, spam/rate controls and idempotency.

## 7. Version compatibility

Every published config has:
- `schema_version`
- `runtime_min_version`
- `runtime_compatibility`
- `publish_version`
- `created_at`
- integrity hash

Shared Runtime must support a defined compatibility window. Before publishing a config that requires a newer Runtime, validate compatibility and prevent a broken release.
