# Project Modules and UX Specification

## 1. Navigation model

The landing page should lead to the Builly Console, not directly into the Builder.

Suggested entry:
- Primary action: `Console`
- Route: `/console`

Suggested routes:
```text
/console
/console/organizations/{organization_id}
/console/organizations/{organization_id}/projects
/console/organizations/{organization_id}/projects/{project_id}

/console/organizations/{organization_id}/projects/{project_id}/builder
/console/organizations/{organization_id}/projects/{project_id}/cms
/console/organizations/{organization_id}/projects/{project_id}/inbox
/console/organizations/{organization_id}/projects/{project_id}/assets
/console/organizations/{organization_id}/projects/{project_id}/publishing
/console/organizations/{organization_id}/projects/{project_id}/versions
/console/organizations/{organization_id}/projects/{project_id}/settings
```

These are route proposals. Preserve existing routes and add redirects/compatibility only after inspecting the current router.

## 2. Console

Purpose:
- Organization and Project management.
- Entry point into workspaces.
- Account-level navigation and connection status.

Should include:
- Organization list/switcher.
- Project list for selected Organization.
- Create Project action, subject to server-side limit.
- Google Workspace connection state and explicit connect/disconnect controls.
- Clear empty states and recovery guidance.

Do not turn Console into a dense analytics dashboard.

## 3. Project Dashboard

Purpose:
- Central overview and module launcher for one Project.
- Not the Builder itself.

Suggested layout:
- Project name and status.
- Compact summary of last activity / last publish where relevant.
- Module launcher with clear descriptions.
- Recent activity only if reliable activity data exists.
- Setup guidance for modules not yet configured.

Avoid decorative metric cards without real operational value.

## 4. Builder module

Clicking Builder opens the Visual Builder directly.

Builder responsibilities:
- Visual page/layout editing.
- Component tree and canvas.
- Property Inspector.
- Responsive settings.
- Theme and design tokens.
- Asset selection.
- In-context CMS operations:
  - Bind a component to CMS data.
  - Select content type/record.
  - Preview bound content.
  - Edit a content item in context.
  - Connect a form to an Inbox destination.
- Publish/preview actions where Site capability is enabled.

Builder must not own a separate CMS database or duplicate CMS records.

## 5. Standalone CMS module

Purpose:
- Manage content without opening the Visual Builder.

Responsibilities:
- Browse content types.
- Search/filter/sort records.
- Create/edit/delete/archive records according to permissions.
- Manage relationships, categories, tags, and structured fields.
- Validate required fields and field types.
- Support pagination and useful empty/loading/error states.

Critical invariant:
- Standalone CMS and Builder in-context CMS call the same CMSService and use the same repository/resource registry.
- A change made in either surface must be visible in the other after successful persistence.
- Do not duplicate content or create separate storage for each UI.

## 6. Inbox module

Purpose:
- Manage form submissions independently from Builder.

Responsibilities:
- Submission list and detail.
- Search/filter/status.
- Categories, notes, activity history where implemented.
- Export only with explicit authorization.
- Clear handling of unavailable or revoked Google access.

Security:
- Inbox records are private.
- Never expose Inbox submissions through public Runtime endpoints or public cache.
- Browser must not choose arbitrary destination spreadsheet IDs.

## 7. Assets module

Purpose:
- Browse and manage project assets.
- Reuse the same asset service from Builder's asset picker.
- Enforce Project scope and file access checks.
- Do not expose private Drive URLs or OAuth credentials to public visitors.

## 8. Publishing and Version History

Publishing:
- Validate configuration, assets, component compatibility, CMS bindings, and forms.
- Create immutable snapshot.
- Verify snapshot can be read by Runtime.
- Atomically update active version pointer in the trusted registry.
- Invalidate/version caches.
- Keep previous version for rollback.

Version History:
- Show version, timestamp, author, and publish status when known.
- Preview prior version without changing live state.
- Rollback must be an explicit operation with confirmation and a new active pointer/version event.
- Do not mutate historical snapshots.

## 9. Responsive and visual quality

- Professional, calm, spacious layout.
- Clear hierarchy and predictable navigation.
- Avoid cramped inspector panels and excessive cards.
- Ensure property inputs are visible, not clipped, and reflect saved state.
- Support Thai and English; no hardcoded user-facing strings.
- Provide loading, empty, success, error, retry, and cancel states for important workflows.
