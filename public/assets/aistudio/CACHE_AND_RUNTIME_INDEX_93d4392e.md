# Cache and Runtime Index

## D1 is a projection, not canonical registry

Suggested D1 Site Index fields:
- site_id (primary key)
- site_slug (unique for base path)
- project_id
- organization_id
- status
- active_publish_version_id
- published_snapshot_file_id or public artifact reference
- canonical_revision
- indexed_at
- last_verified_at

Optional domain mapping: normalized hostname, site_id, verification_status, canonical_revision.

Every row must be rebuildable from Drive. D1 must not contain private Inbox records, OAuth tokens, drafts or owner-only configuration. Updating D1 happens after canonical Drive writes.

## Cache rules

- Management cache is scoped to authenticated account and resource.
- Cache records canonical revision, fetch time and freshness.
- Public cache contains published public artifacts only.
- Never publicly cache Inbox, drafts or private CMS fields.
- Cache miss + OAuth unavailable → unavailable/reconnect state, not empty workspace.
- Cache hit + OAuth unavailable → stale indicator and read-only view.
- Do not use browser localStorage for canonical data or OAuth secrets.

## OAuth outage (confirmed: read-only)

When Google is unavailable:
- Read permitted authorized cache only.
- Show last successful sync and stale status.
- Disable writes and do not claim save success.
- If no valid cache, show reconnect/unavailable state.
- On reconnect, fetch canonical Drive state and reconcile before enabling writes.
- No offline write queue in this phase.

## Public Runtime

Published public artifacts can continue to serve without owner OAuth if already safely published and available to Runtime. Runtime must not use the owner's OAuth token for every visitor request. If active artifact is unavailable, use a previous version only under an explicit fallback policy.

## Rebuild process

Authenticate account; read canonical root/account manifest; enumerate registered Organizations/Projects; read canonical Site registry partitions; validate Site and active version; rebuild D1 in batches; compare revisions/counts; mark complete after reconciliation.

---

## D1 Projection Repair

D1 is a rebuildable projection. After canonical Drive mutation is verified, update D1. If projection fails, retain canonical success and enqueue `PROJECTION_REPAIR_PENDING`; repair reads Drive and upserts the projection. D1 must never override Drive or be the sole evidence that a mutation completed. Full projection rebuild must be supported from Drive's canonical registries and Site records.
