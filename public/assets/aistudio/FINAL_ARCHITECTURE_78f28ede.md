# Final Architecture

## Confirmed decisions

| Area | Decision |
|---|---|
| Canonical business data | User's Google Drive My Drive/Builly |
| Structured CMS/Inbox | Separate Google Sheets files per dataset |
| Site Registry | Canonical registry in Drive; derived D1 index for Runtime |
| Google connection | One per Builly Account, shared across its Organizations |
| Identity | Supabase Auth |
| OAuth outage | Read-only from permitted cache; no offline writes |
| Backend / Runtime | Cloudflare Workers / shared Cloudflare Runtime |
| OAuth refresh token | Encrypted server-side credential storage; never plain Drive JSON |

## Principle

Drive is the canonical source of truth for user-owned business data. Cloudflare may hold derived indexes, temporary caches, operational job state/locks and encrypted integration credentials. Cloudflare copies must not become a separate canonical copy of Organization, Project, CMS, Inbox, Site configuration or assets. Derived indexes must be rebuildable from Drive.

## Architecture

```text
Browser: Console / Builder / CMS / Inbox / Assets
                 |
                 v
Cloudflare Workers (trusted backend)
  - Validate Supabase Auth session
  - Resolve Builly Account → Google credential
  - Organization / Project / Module services
  - Drive / Sheets repositories
  - CMS / Inbox / Asset services
  - Publish service
  - Derived D1 Site Index + temporary cache
                 |
        Google Drive / Sheets API
                 |
                 v
         User's My Drive/Builly/

Public visitor → Shared Runtime → D1 derived Site Index
               → immutable public snapshot + public page data
```

## Responsibility boundaries

**Google Drive/Sheets owns:** account workspace manifest, Organizations, Projects, module configuration, Sites, canonical Site Registry, Builder documents, published snapshots, CMS, Inbox, assets and exports.

**Cloudflare owns operational execution:** APIs, shared Runtime, derived Site Index, temporary cache, rebuild/sync jobs, locks, rate limits and encrypted OAuth credential storage.

**Supabase Auth:** Builly identity/session only. Being signed in does not imply Google Drive consent.

## Account model

One Builly Account maps to one Google connection. Its My Drive/Builly root contains many Organizations, each with Projects. Stable IDs identify records; folder names are labels only.

## Authenticated request

1. Validate Supabase session and derive account ID.
2. Resolve Google credential server-side.
3. Load canonical account/organization/project manifests from Drive, or authorized cache if Google is unavailable.
4. Verify ownership and parent-child relationships.
5. Resolve resource IDs from canonical registry.
6. Read/write the selected Drive/Sheets resource.
7. Update caches/indexes only after canonical writes succeed.

## Public request

1. Normalize hostname/path.
2. Resolve Site using derived D1 index.
3. Load approved immutable public snapshot.
4. Fetch only public page-required CMS data.
5. Never expose drafts, private CMS fields, Inbox submissions, manifests, or credentials.

A published site may continue serving from already published public artifacts after owner OAuth is disconnected, provided the public artifacts remain available and contain no private data.

## Consistency

- Drive write succeeds → update/invalidate projections.
- Drive write fails → do not report success.
- D1 update fails after Drive success → canonical operation remains successful; queue projection repair.
- D1/cache lost → rebuild from Drive.

---

## Transaction and Recovery Addendum

Builly uses application-level Saga orchestration with forward recovery because Google Drive/Sheets do not provide atomic transactions across files. Every mutation has an `operation_id`, payload hash, stable target IDs, resource revisions, a canonical Drive Operation Journal, idempotent steps, and postcondition verification. Cloudflare Durable Objects serialize Builly-controlled writes by Account/Organization/Project/Site scope. D1 remains a rebuildable operational projection. See `TRANSACTION_AND_RECOVERY.md` for normative rules, recovery algorithm, error codes, and acceptance tests.

Do not claim atomic visibility across all Drive files. During a multi-step workflow, resources may be in `provisioning`; UI must communicate progress and must not report completion until canonical postconditions are verified.
