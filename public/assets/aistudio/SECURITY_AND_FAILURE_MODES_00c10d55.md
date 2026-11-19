# Security and Failure Modes

## Credentials

OAuth refresh tokens are security credentials, not business data. Store encrypted server-side with restricted access. Never store plain tokens in Drive JSON, browser storage, logs or published snapshots. One connection belongs to one Builly Account.

## Authorization

For every management request: validate Supabase session; derive account ID from trusted claims; resolve Google connection; verify Organization is listed in canonical account manifest; verify Project belongs to Organization; verify resource belongs to Project; verify module enabled and action allowed. Never trust URL IDs or client-supplied Drive/Sheet IDs.

## Concurrency

Drive JSON is not a multi-document transactional database. Use revision numbers, ETag/conditional updates where supported, per-account/resource mutation locks, read-modify-write conflict detection, operation IDs and reconciliation. Never assume multi-file updates are atomic.

## Failure matrix

| Failure | Behavior |
|---|---|
| OAuth revoked/expired | Read permitted cache only; read-only management |
| Drive unavailable + valid cache | Show stale data; disable writes |
| Drive unavailable + no cache | Reconnect/unavailable state |
| Drive write succeeds, D1 fails | Canonical success; queue index repair |
| Drive write fails | No success response; safe retry |
| Partial provisioning | Resume same operation and reuse IDs |
| Multiple Builly roots | Ask user; do not guess |
| Concurrent manifest edits | Detect conflict; do not silently overwrite |
| Sheets quota | Backoff/retry safely |
| Invalid publish snapshot | Keep previous live version |
| OAuth disconnected after publish | Serve only already-approved public artifacts if available |

## Data minimization

Separate private management cache from public Runtime cache. Scope cache keys by account/resource. Set retention/eviction for private cached data. Redact tokens and sensitive Inbox payloads from logs.

---

## Mutation Coordination and Recovery Safety

All writes are backend-authorized and coordinated through Durable Object locks with lease expiry, owner operation ID, bounded acquisition, renewal, and ownership/fencing checks before side effects. Revisions detect stale edits; idempotency prevents duplicate operations; the canonical Drive journal supports recovery. Direct external edits in Drive are outside the Durable Object lock and must be detected through revision/ETag/content reconciliation. Never silently overwrite conflicts or automatically hard-delete partially provisioned resources. Operation logs must not contain OAuth tokens or private Inbox payloads. See `TRANSACTION_AND_RECOVERY.md`.
