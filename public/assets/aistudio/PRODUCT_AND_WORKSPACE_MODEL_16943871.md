# Product and Workspace Model

## 1. Core product model

Builly is a product workspace platform. It provides tools/modules that help a user create, manage, publish, and operate digital products.

The hierarchy is:

```text
Account
└── Organization
    └── Project
        ├── Builder
        ├── CMS
        ├── Inbox
        ├── Assets
        ├── Publishing
        ├── Version History
        ├── Analytics (future)
        └── Other modules (future)
```

### Account
- Represents the authenticated Builly identity.
- Supabase Auth is the intended identity/session provider.
- Account identity does not automatically grant access to a user's Google Drive.

### Organization
- Workspace/tenant boundary for a user or team.
- Owns Projects.
- Organization membership and roles can be modelled for future collaboration.
- Initial release may be owner-only, but authorization must be designed so team membership can be added without replacing the model.

### Project
- A general-purpose workspace that groups related modules, resources, settings, and operational data.
- A Project is **not** a Website.
- A Project may enable a Website/Site capability, but it may also contain other product workflows.
- Project identity is a stable `project_id`; name and slug are display/routing attributes, not identity.

### Module
- A distinct capability and user experience within a Project.
- Module enablement is represented by `ProjectModules`.
- Module enablement is not the same as authorization.
- Modules should share common services and repositories where their data domains overlap.

### Site
- An optional public website instance attached to a Project.
- A Project may initially have one Site if that is the simplest supported product rule, but the data model should not make Project and Site identical.
- Site owns its public slug/domain, publish versions, and runtime configuration.
- Public visitors resolve to a Site, not directly to a Project.

## 2. Product principles

1. Keep Project generic and extensible.
2. Separate module navigation/UX from backend duplication.
3. One source of truth per data domain.
4. A user should be able to manage content without opening the Visual Builder.
5. Builder must still support in-context CMS workflows.
6. Do not provision storage for modules that are disabled or unused.
7. Do not implement future modules as empty placeholders that imply functionality exists.
8. Keep permissions and module availability as separate concerns.

## 3. Initial module catalogue

| Module | Initial status | Responsibility |
|---|---|---|
| Builder | Core | Visual composition and editing experience |
| CMS | Core | Manage structured content records and content types |
| Inbox | Core when forms are enabled | View and manage form submissions |
| Assets | Core | Browse and manage project assets |
| Publishing | Core for Site-enabled Projects | Validate and publish a Site configuration |
| Version History | Core for publishable resources | Inspect immutable versions and restore/rollback where supported |
| Settings | Core | Project-level configuration |
| Analytics | Later | Usage and performance insights |
| SEO | Later / Site capability | Search metadata and related controls |
| E-commerce | Later | Commerce capabilities |
| Automation | Later | Workflow automation |
| AI Tools | Later | AI-assisted creation/operations |

Do not show a module as available unless it is implemented and enabled for the Project.

## 4. Limits and lifecycle

Current intended limits:
- Maximum 10 Organizations per Account.
- Maximum 10 Projects per Organization.

These limits must be enforced server-side, not only by hiding UI actions.

Recommended lifecycle policy:
- Use soft deletion/archive for recoverability.
- Archived records continue to count toward limits until permanently deleted, unless the owner explicitly chooses a different policy.
- Hard deletion must be an explicit, guarded operation with dependency checks and clear consequences.
- Define retention and restore windows before implementing destructive cleanup.

## 5. Onboarding decisions still requiring owner confirmation

Do not silently assume these product choices:
1. Organization naming: create a temporary default Organization name, or ask the user to name it during onboarding?
2. Google Drive ownership: use one connected Google account/Drive for all Organizations, or allow a different connected Google account per Organization?
3. Navigation: global Organization switcher, or select Organization from the Console dashboard?

Recommended defaults:
- Ask for Organization name during onboarding, with a sensible editable default suggested.
- Store Google Workspace connection at the Account level initially, while recording the owning account and access scope. Move to Organization-level connections only if a real use case requires it.
- Provide a global Organization switcher once multi-Organization use is supported; on small screens, place it in the Console navigation.
