# Transaction, Consistency & Recovery

## 1. Purpose and consistency model

Google Drive and Google Sheets do not provide an atomic transaction spanning multiple files. Builly therefore uses an **application-level Saga with forward recovery**, not a distributed database transaction.

The consistency model is:
- Google Drive is the canonical source of truth for business/workspace data.
- A mutation is not considered complete until its canonical Drive changes have been verified.
- Cloudflare D1 is a rebuildable operational projection, not canonical business data.
- Cloudflare Durable Objects serialize conflicting mutations within a defined lock scope.
- Every mutation is idempotent and recoverable after timeout, worker termination, or partial completion.
- Recovery prefers completing a valid operation. Automatic destructive rollback is prohibited unless a compensation is explicitly proven safe.

This provides recoverable, controlled consistency. It does **not** claim atomic visibility across all Drive files during a multi-step operation.

## 2. Resource revisions

Every canonical manifest/resource that can be edited must have:
- `resource_id` (stable and immutable)
- `revision` (monotonically increasing integer)
- `updated_at`
- `last_operation_id`
- optionally `schema_version`

Example:

```json
{
  "project_id": "prj_123",
  "name": "My Website",
  "revision": 12,
  "updated_at": "2026-11-18T10:00:00Z",
  "last_operation_id": "op_abc123",
  "schema_version": 1
}
```

Mutation request:

```json
{
  "operation_id": "op_abc123",
  "resource_id": "prj_123",
  "expected_revision": 12,
  "changes": {
    "name": "New Project Name"
  }
}
```

Rules:
1. Read the canonical resource and its current revision.
2. Acquire the appropriate mutation lock.
3. Re-read canonical state after acquiring the lock.
4. Compare `expected_revision` with the current revision.
5. If different, stop with `REVISION_CONFLICT`; do not overwrite.
6. Apply the mutation and increment revision exactly once for that logical operation.
7. Verify the resulting Drive content and metadata before marking the operation complete.

A read-then-write sequence alone is not compare-and-swap. Drive ETags/conditional requests should be used where the specific API operation supports them, but must not be assumed universally. The Durable Object lock serializes Builly-controlled writers; external edits made directly in Drive must still be detected through revision/ETag or content reconciliation. Do not silently overwrite an external edit.

For multi-file changes, revisions are per resource. Do not pretend there is one atomic global revision. An optional workspace/account revision may be used as a change-feed or summary counter, but it is not a transaction boundary.

## 3. Idempotency

Every mutation request must carry a client-generated or server-issued `operation_id` that remains unchanged across retries.

The operation record must bind the ID to:
- `operation_type`
- `account_id`
- target resource IDs
- canonicalized `payload_hash`
- creation time
- current status
- step records and discovered Drive file/folder IDs
- final result or failure classification

Rules:
- Same `operation_id` + same payload hash: resume or return the recorded result; never create duplicates.
- Same `operation_id` + different payload hash: reject with `IDEMPOTENCY_KEY_REUSED`.
- New logical mutation: new `operation_id`.
- Preallocate stable target IDs (e.g. `project_id`) before creating Drive resources.
- Each step must be independently idempotent: inspect for the intended resource before creating it; persist discovered IDs immediately.
- Do not use folder/file names alone as identity. Use stable IDs, trusted `appProperties`, and verified parent IDs.

Example:

```json
{
  "operation_id": "op_create_project_abc123",
  "operation_type": "CREATE_PROJECT",
  "account_id": "acc_001",
  "target": {
    "organization_id": "org_001",
    "project_id": "prj_456"
  },
  "payload_hash": "sha256:...",
  "status": "in_progress",
  "steps": []
}
```

## 4. Operation journal and its own recovery

The canonical Operation Journal lives under `My Drive/Builly/System/Operations/`. It is canonical operational metadata for coordinating multi-file Drive workflows; it is not business content.

Cloudflare D1 may keep a fast operational mirror for status lookup, lock coordination metadata, retry scheduling, and repair queues. D1 must never be the only record of a business mutation or the only source from which recovery can be performed.

Important limitation: the Journal is itself stored in Drive and is also subject to timeout/partial-write risk. Therefore:
- Allocate `operation_id` and target resource IDs before the first side effect.
- Store operation markers (`operation_id`, `resource_id`, `resource_type`, `schema_version`) in Drive `appProperties` on created files/folders where supported.
- Use a deterministic operation journal file identity or a trusted registry pointer; do not create a new journal file on each retry.
- Write journal updates as complete, versioned state transitions where possible; verify the resulting file after writes.
- If a journal write times out, read the same journal resource and inspect `appProperties`/content before retrying.
- If the journal is missing or incomplete, reconstruct progress by inspecting target resources and their operation markers. Never infer success solely from a missing journal step.
- Keep journal payloads bounded. Partition/archive completed operations by time or account so the System folder does not grow without limit.
- Retain enough completed-operation data to cover the idempotency retry window and support audit/recovery. Define retention and archival policy before production.

Suggested journal record:

```json
{
  "operation_id": "op_123",
  "operation_type": "CREATE_PROJECT",
  "status": "in_progress",
  "payload_hash": "sha256:...",
  "target": {
    "organization_id": "org_001",
    "project_id": "prj_456"
  },
  "steps": [
    {
      "key": "create_project_folder",
      "status": "completed",
      "resource_id": "drive_folder_001"
    },
    {
      "key": "create_config_folder",
      "status": "completed",
      "resource_id": "drive_folder_002"
    },
    {
      "key": "write_project_manifest",
      "status": "pending"
    },
    {
      "key": "update_resource_registry",
      "status": "pending"
    }
  ],
  "created_at": "2026-11-18T10:00:00Z",
  "updated_at": "2026-11-18T10:01:00Z"
}
```

## 5. Saga workflow and step contract

Each multi-file workflow is a sequence of small steps. Each step must define:
- deterministic step key
- inputs and expected parent/resource IDs
- precondition
- idempotent action
- postcondition/verification
- persisted outputs (especially Drive IDs)
- retry classification
- compensation, if any, and why it is safe

Example `CREATE_PROJECT`:
1. Create operation intent and preallocate `project_id`.
2. Verify target Organization and capacity limit.
3. Find or create Project folder under the verified Organization Projects folder.
4. Find or create Config, Data, Assets, Exports folders under the verified Project folder.
5. Create minimal `project.json` and `modules.json`.
6. Update Organization project index and canonical resource registry with revision checks.
7. Read-after-write verify all required files, IDs, and parent relationships.
8. Mark Journal `completed`.
9. Update D1 operational projection; if this fails, enqueue projection repair without undoing canonical Drive success.

For each folder/file creation, search by trusted operation/resource markers and verify the actual parent ID. If multiple candidates are found, stop with `needs_reconciliation`; do not choose arbitrarily.

## 6. Locking and concurrent writes

Use Cloudflare Durable Objects to serialize Builly-controlled mutations within a clear scope:
- Create Organization: Account scope
- Create Project: Organization scope
- Update Project config: Project scope
- Create/update Site: Site scope
- Publish: Site scope

Lock requirements:
- lease/expiry and owner operation ID
- bounded acquisition timeout
- renewal for long-running operations
- fencing/ownership check before each side effect
- release in `finally` where possible
- expired-lock recovery after worker termination
- no lock held while waiting indefinitely for user input

Do not lock the entire Account for every mutation. Keep lock scope as narrow as correctness permits.

Durable Object serialization does not protect against users editing files directly in Drive or another external integration. Use revision/ETag/content checks and reconciliation for those cases.

## 7. Operation states and resource states

Operation states:
- `pending`: accepted, not started
- `in_progress`: steps executing
- `retryable`: transient failure; safe retry exists
- `needs_reconciliation`: ambiguous or conflicting canonical state; stop automatic writes
- `completed`: all canonical postconditions verified
- `failed`: terminal failure
- `cancelled`: cancelled before irreversible side effects, or safely compensated

Resource lifecycle is separate:
- Organization/Project/Site resource state may be `provisioning`, `active`, `archived`, or `deleting` as applicable.
- Never overload an operation status as the resource's lifecycle status.

## 8. Recovery algorithm

A Recovery Worker should:
1. Find operations in `pending`, `in_progress`, or `retryable`, plus expired leases.
2. Load the canonical journal from Drive; if unavailable, use D1 only to locate the operation, not to assert canonical completion.
3. Verify operation ID and payload hash.
4. Acquire the same scope lock and establish a new lease/fencing token.
5. Inspect each step's real Drive postcondition and operation markers.
6. Mark verified steps completed; rerun only missing idempotent steps.
7. On transient errors, back off with bounded exponential retry and jitter.
8. On revision mismatch, duplicate candidates, wrong parent, unexpected file contents, or uncertain ownership, set `needs_reconciliation` and stop.
9. Verify the complete workflow postconditions.
10. Mark canonical journal completed, then update D1 projection.
11. If D1 update fails, enqueue/retry projection repair. Do not roll back canonical Drive data.

If Drive is unavailable, do not claim success and do not attempt offline writes. Preserve the operation as retryable/unknown, show the last known state, and resume after reconnection.

## 9. Compensation and deletion

Forward recovery is the default. Compensation is allowed only when:
- the operation is known to have created the resource;
- no user edits or downstream references occurred;
- dependencies are checked;
- the compensation itself is idempotent and journaled.

Never automatically hard-delete partially created folders/files merely to simulate rollback. Prefer marking an incomplete resource as `provisioning` or `needs_reconciliation`, then complete or explicitly clean it up after validation.

## 10. D1 projection repair

D1 contains rebuildable operational projections, not canonical business data. Every projection row should record source identity and canonical revision, for example:
- `resource_id`
- `canonical_revision`
- `projected_at`
- `projection_status`

After a successful Drive mutation:
- update D1 projection;
- if update fails, enqueue a repair task;
- repair reads the canonical Drive registry/resource and upserts D1;
- stale D1 rows are not allowed to override Drive;
- full D1 rebuild is possible from canonical Drive registries and published Site records.

A D1 outage must not convert a verified Drive success into a reported business-data failure. Report canonical success with projection pending where appropriate.

## 11. Required error codes

- `REVISION_CONFLICT`
- `IDEMPOTENCY_KEY_REUSED`
- `LOCK_TIMEOUT`
- `LOCK_OWNERSHIP_LOST`
- `DRIVE_TRANSIENT_ERROR`
- `DRIVE_PERMISSION_DENIED`
- `RESOURCE_NOT_FOUND`
- `DUPLICATE_RESOURCE_CANDIDATES`
- `PARENT_MISMATCH`
- `POSTCONDITION_FAILED`
- `NEEDS_RECONCILIATION`
- `PROJECTION_REPAIR_PENDING`

Errors must include a safe user-facing message, operation ID for support, retryability, and no secret/token values.

## 12. Minimum acceptance tests

1. Retry the same create request five times: exactly one logical resource set exists.
2. Reuse an operation ID with a different payload: reject.
3. Simulate timeout after Drive folder creation: retry discovers and reuses the folder.
4. Terminate Worker after any workflow step: Recovery resumes safely.
5. Simulate Journal write timeout: inspect Drive state and reconstruct progress without duplicate creation.
6. Simulate missing/incomplete Journal: reconstruct from operation markers and target resources; ambiguous results stop for reconciliation.
7. Two concurrent updates with the same expected revision: at most one succeeds; the other receives conflict or is re-evaluated against the new revision.
8. External Drive edit occurs between read and write: detect conflict where supported; never silently overwrite.
9. D1 is unavailable after canonical Drive success: mutation remains successful; projection repair is queued.
10. Delete all D1 operational rows: rebuild projection from Drive.
11. Wrong parent or duplicate candidate found: stop with `needs_reconciliation`.
12. Drive outage: no offline write and no false success.
13. Expired lock after Worker termination: new worker acquires a fresh lease and safely resumes.
14. Completed operation retried: return recorded result without reapplying side effects.

## 13. Implementation boundaries

- Keep orchestration in a service layer, not UI components.
- UI sends one logical mutation request with operation ID and expected revision.
- Backend owns payload canonicalization/hash, authorization, lock acquisition, journal updates, Drive API calls, verification, and projection repair.
- Use bounded retries, exponential backoff, and jitter for transient failures only.
- Do not retry permission errors, invalid payloads, revision conflicts, or ambiguous duplicate resources blindly.
- Log operation ID, step key, resource IDs, revisions, duration, and outcome. Never log OAuth tokens or private submission payloads.
