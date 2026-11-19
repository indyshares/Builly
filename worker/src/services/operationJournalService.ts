import { VerifiedSession, WorkerEnv } from '../types';
import {
  DRIVE_FOLDER_MIME,
  DriveFileMeta,
  driveFetchWithRetry,
  driveJsonChecked,
  findDriveChildren,
  getDriveFileMeta,
  readDriveJsonWithConcurrency,
  verifyDriveParent,
  writeCanonicalDriveJson,
} from './driveCanonicalClient';
import { ActiveLockHandle, withMutationLock } from './mutationLockService';
import { BuillyTransactionError } from './transactionErrors';

export type OperationStatus =
  | 'pending'
  | 'in_progress'
  | 'retryable'
  | 'needs_reconciliation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface OperationStepRecord {
  key: string;
  status: 'pending' | 'completed' | 'failed' | 'needs_reconciliation';
  resource_id?: string;
  drive_file_id?: string;
  parent_id?: string;
  attempts?: number;
  verified_at?: string;
  detail?: string;
}

export interface OperationJournalRecord {
  schema_version: 1;
  operation_id: string;
  operation_type: string;
  account_id: string;
  scope_key: string;
  payload_hash: string;
  status: OperationStatus;
  target: Record<string, string | undefined>;
  steps: OperationStepRecord[];
  discovered_ids: Record<string, string>;
  result?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  fencing_token?: number;
  created_at: string;
  updated_at: string;
}

export interface SagaStepContext {
  operationId: string;
  journal: OperationJournalRecord;
  lock: ActiveLockHandle;
  accessToken: string;
  setDiscoveredId: (key: string, driveId: string) => void;
  getDiscoveredId: (key: string) => string | undefined;
  setOperationsFolderId: (folderId: string) => void;
}

export interface SagaStepDefinition {
  key: string;
  verifyCompleted?: (ctx: SagaStepContext) => Promise<boolean>;
  run: (ctx: SagaStepContext) => Promise<{
    resource_id?: string;
    drive_file_id?: string;
    parent_id?: string;
    detail?: string;
  } | void>;
}

export function generateOperationId(prefix = 'op'): string {
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}_${hex}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export async function computePayloadHash(payload: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(stableStringify(payload ?? {}));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export async function mirrorOperationToD1(
  db: D1Database,
  journal: OperationJournalRecord,
  driveJournalFileId: string,
  leaseExpiresAt = 0
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO operations_projection (
           operation_id, owner_id, operation_type, scope_key, payload_hash, status,
           target_json, steps_json, result_json, drive_journal_file_id,
           error_code, error_message, fencing_token, lease_expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(operation_id) DO UPDATE SET
           status = excluded.status,
           target_json = excluded.target_json,
           steps_json = excluded.steps_json,
           result_json = excluded.result_json,
           drive_journal_file_id = CASE WHEN excluded.drive_journal_file_id != '' THEN excluded.drive_journal_file_id ELSE operations_projection.drive_journal_file_id END,
           error_code = excluded.error_code,
           error_message = excluded.error_message,
           fencing_token = excluded.fencing_token,
           lease_expires_at = excluded.lease_expires_at,
           updated_at = excluded.updated_at`
      )
      .bind(
        journal.operation_id,
        journal.account_id,
        journal.operation_type,
        journal.scope_key,
        journal.payload_hash,
        journal.status,
        JSON.stringify(journal.target || {}),
        JSON.stringify(journal.steps || []),
        journal.result !== undefined ? JSON.stringify(journal.result) : '',
        driveJournalFileId,
        journal.error?.code || '',
        journal.error?.message || '',
        journal.fencing_token ?? 0,
        leaseExpiresAt,
        journal.created_at,
        journal.updated_at
      )
      .run();
  } catch {
    // D1 mirror failure must never break canonical Drive operations
  }
}

export async function readOperationFromD1(
  db: D1Database,
  ownerId: string,
  operationId: string
): Promise<{ journal: OperationJournalRecord; driveJournalFileId: string } | null> {
  try {
    const row = await db
      .prepare(
        `SELECT * FROM operations_projection WHERE operation_id = ? AND owner_id = ? LIMIT 1`
      )
      .bind(operationId, ownerId)
      .first<{
        operation_id: string;
        owner_id: string;
        operation_type: string;
        scope_key: string;
        payload_hash: string;
        status: OperationStatus;
        target_json: string;
        steps_json: string;
        result_json: string;
        drive_journal_file_id: string;
        error_code: string;
        error_message: string;
        fencing_token: number;
        created_at: string;
        updated_at: string;
      }>();

    if (!row) return null;

    return {
      driveJournalFileId: row.drive_journal_file_id || '',
      journal: {
        schema_version: 1,
        operation_id: row.operation_id,
        operation_type: row.operation_type,
        account_id: row.owner_id,
        scope_key: row.scope_key,
        payload_hash: row.payload_hash,
        status: row.status,
        target: JSON.parse(row.target_json || '{}') as Record<string, string | undefined>,
        steps: JSON.parse(row.steps_json || '[]') as OperationStepRecord[],
        discovered_ids: {},
        result: row.result_json ? JSON.parse(row.result_json) : undefined,
        error: row.error_code
          ? { code: row.error_code, message: row.error_message, retryable: row.status === 'retryable' }
          : undefined,
        fencing_token: row.fencing_token,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    };
  } catch {
    return null;
  }
}

export async function readDriveOperationJournal(
  accessToken: string,
  operationsFolderId: string,
  operationId: string
): Promise<{ fileId: string; journal: OperationJournalRecord } | null> {
  if (!operationsFolderId) return null;

  // Prefer trusted appProperties lookup first so timeouts/re-reads resolve deterministically
  const byMarker = await findDriveChildren(accessToken, {
    parentId: operationsFolderId,
    appProperties: { operation_id: operationId, resource_type: 'operation_journal' },
    operationId,
  }).catch(() => []);

  const candidates =
    byMarker.length > 0
      ? byMarker
      : await findDriveChildren(accessToken, {
          parentId: operationsFolderId,
          name: `${operationId}.json`,
          operationId,
        }).catch(() => []);

  if (candidates.length > 1) {
    throw new BuillyTransactionError(
      'DUPLICATE_RESOURCE_CANDIDATES',
      `Multiple journal files matched operation "${operationId}". Reconciliation required.`,
      {
        operationId,
        details: {
          needsReconciliation: true,
          candidates: candidates.map((c) => ({ id: c.id, name: c.name, parents: c.parents })),
        },
      }
    );
  }

  if (candidates.length === 0) return null;

  const target = candidates[0];
  await verifyDriveParent(accessToken, target.id, operationsFolderId, operationId);
  const { data } = await readDriveJsonWithConcurrency<OperationJournalRecord>(
    accessToken,
    target.id,
    operationId
  );
  return { fileId: target.id, journal: data };
}

export async function writeDriveOperationJournal(
  accessToken: string,
  operationsFolderId: string,
  journal: OperationJournalRecord,
  knownFileId?: string
): Promise<string> {
  if (!operationsFolderId) return knownFileId || '';

  try {
    const res = await writeCanonicalDriveJson(accessToken, {
      parentId: operationsFolderId,
      fileName: `${journal.operation_id}.json`,
      payload: journal as unknown as Record<string, unknown>,
      appProperties: {
        operation_id: journal.operation_id,
        resource_id: journal.operation_id,
        resource_type: 'operation_journal',
        schema_version: '1',
      },
      knownFileId: knownFileId || undefined,
      operationId: journal.operation_id,
    });
    return res.fileId;
  } catch (err) {
    // If transient timeout occurred while writing journal, inspect Drive to reuse any file created before throwing
    if (err instanceof BuillyTransactionError && err.code === 'DRIVE_TRANSIENT_ERROR') {
      const inspected = await readDriveOperationJournal(
        accessToken,
        operationsFolderId,
        journal.operation_id
      ).catch(() => null);
      if (inspected) {
        return inspected.fileId;
      }
    }
    throw err;
  }
}

export async function enqueueProjectionRepairOnFailure(
  db: D1Database,
  params: {
    ownerId: string;
    resourceType: string;
    resourceId: string;
    operationId: string;
    canonicalRevision?: number;
    driveFileId?: string;
    payload?: unknown;
    errorMessage: string;
  }
): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const repairId = `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    await db
      .prepare(
        `INSERT INTO projection_repair_queue (
           repair_id, owner_id, resource_type, resource_id, operation_id,
           canonical_revision, drive_file_id, payload_json, attempts, status,
           last_error, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?, ?)`
      )
      .bind(
        repairId,
        params.ownerId,
        params.resourceType,
        params.resourceId,
        params.operationId,
        params.canonicalRevision ?? 1,
        params.driveFileId || '',
        JSON.stringify(params.payload ?? {}),
        params.errorMessage.slice(0, 400),
        nowIso,
        nowIso
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

export interface RunSagaOptions<TResult extends Record<string, unknown>> {
  operationId: string;
  operationType: string;
  ownerId: string;
  scopeKey: string;
  payloadForHash: unknown;
  target: Record<string, string | undefined>;
  accessToken: string;
  initialOperationsFolderId?: string;
  steps: SagaStepDefinition[];
  buildResult: (ctx: SagaStepContext) => TResult;
  updateProjection: (result: TResult, ctx: SagaStepContext) => Promise<void>;
  repairResourceType: string;
  repairResourceId: string;
}

export async function runSagaWithJournal<TResult extends Record<string, unknown>>(
  env: WorkerEnv,
  options: RunSagaOptions<TResult>
): Promise<
  TResult & {
    operationId: string;
    deduplicated: boolean;
    canonicalCommitted: boolean;
    projectionStatus: 'synced' | 'PROJECTION_REPAIR_PENDING';
  }
> {
  const payloadHash = await computePayloadHash(options.payloadForHash);

  // Fast check before waiting on lock for already completed idempotent request or payload-hash mismatch
  const d1BeforeLock = await readOperationFromD1(env.DB, options.ownerId, options.operationId);
  if (d1BeforeLock) {
    if (d1BeforeLock.journal.payload_hash !== payloadHash) {
      throw new BuillyTransactionError(
        'IDEMPOTENCY_KEY_REUSED',
        `Operation ID "${options.operationId}" was already used with a different request payload.`,
        { operationId: options.operationId }
      );
    }
    if (d1BeforeLock.journal.status === 'completed' && d1BeforeLock.journal.result) {
      let pendingRepair = false;
      try {
        const rep = await env.DB.prepare(
          `SELECT repair_id FROM projection_repair_queue WHERE operation_id = ? AND owner_id = ? AND status IN ('pending', 'failed') LIMIT 1`
        )
          .bind(options.operationId, options.ownerId)
          .first<{ repair_id: string }>();
        pendingRepair = Boolean(rep?.repair_id);
      } catch {
        pendingRepair = false;
      }
      return {
        ...(d1BeforeLock.journal.result as TResult),
        operationId: options.operationId,
        deduplicated: true,
        canonicalCommitted: true,
        projectionStatus: pendingRepair ? 'PROJECTION_REPAIR_PENDING' : 'synced',
      };
    }
    if (d1BeforeLock.journal.status === 'needs_reconciliation') {
      throw new BuillyTransactionError(
        'NEEDS_RECONCILIATION',
        `Operation "${options.operationId}" stopped in needs_reconciliation. Manual or automated reconciliation is required.`,
        { operationId: options.operationId, details: { needsReconciliation: true } }
      );
    }
  }

  return withMutationLock(
    env,
    { scopeKey: options.scopeKey, operationId: options.operationId },
    async (lock) => {
      let operationsFolderId = options.initialOperationsFolderId || '';
      let driveJournalFileId = '';
      let journal: OperationJournalRecord | null = null;

      // Check canonical Drive journal first when folder is known, then D1 mirror
      if (operationsFolderId) {
        const driveExisting = await readDriveOperationJournal(
          options.accessToken,
          operationsFolderId,
          options.operationId
        );
        if (driveExisting) {
          driveJournalFileId = driveExisting.fileId;
          journal = driveExisting.journal;
        }
      }

      if (!journal) {
        const d1Existing = await readOperationFromD1(env.DB, options.ownerId, options.operationId);
        if (d1Existing) {
          journal = d1Existing.journal;
          driveJournalFileId = d1Existing.driveJournalFileId;
        }
      }

      if (journal) {
        if (journal.payload_hash !== payloadHash) {
          throw new BuillyTransactionError(
            'IDEMPOTENCY_KEY_REUSED',
            `Operation ID "${options.operationId}" was already used with a different request payload.`,
            { operationId: options.operationId }
          );
        }
        if (journal.status === 'completed' && journal.result) {
          return {
            ...(journal.result as TResult),
            operationId: options.operationId,
            deduplicated: true,
            canonicalCommitted: true,
            projectionStatus: 'synced',
          };
        }
        if (journal.status === 'needs_reconciliation') {
          throw new BuillyTransactionError(
            'NEEDS_RECONCILIATION',
            `Operation "${options.operationId}" requires reconciliation before retrying.`,
            { operationId: options.operationId, details: { needsReconciliation: true } }
          );
        }
      } else {
        const nowIso = new Date().toISOString();
        journal = {
          schema_version: 1,
          operation_id: options.operationId,
          operation_type: options.operationType,
          account_id: options.ownerId,
          scope_key: options.scopeKey,
          payload_hash: payloadHash,
          status: 'in_progress',
          target: options.target,
          steps: options.steps.map((s) => ({ key: s.key, status: 'pending', attempts: 0 })),
          discovered_ids: {},
          fencing_token: lock.fencingToken,
          created_at: nowIso,
          updated_at: nowIso,
        };
      }

      journal.status = 'in_progress';
      journal.fencing_token = lock.fencingToken;
      journal.updated_at = new Date().toISOString();

      await mirrorOperationToD1(env.DB, journal, driveJournalFileId, lock.expiresAt);
      if (operationsFolderId) {
        driveJournalFileId = await writeDriveOperationJournal(
          options.accessToken,
          operationsFolderId,
          journal,
          driveJournalFileId
        );
      }

      const ctx: SagaStepContext = {
        operationId: options.operationId,
        journal,
        lock,
        accessToken: options.accessToken,
        setDiscoveredId(key: string, driveId: string) {
          journal!.discovered_ids[key] = driveId;
        },
        getDiscoveredId(key: string) {
          return journal!.discovered_ids[key];
        },
        setOperationsFolderId(folderId: string) {
          operationsFolderId = folderId;
        },
      };

      const flushJournal = async () => {
        journal!.updated_at = new Date().toISOString();
        await mirrorOperationToD1(env.DB, journal!, driveJournalFileId, lock.expiresAt);
        if (operationsFolderId) {
          driveJournalFileId = await writeDriveOperationJournal(
            options.accessToken,
            operationsFolderId,
            journal!,
            driveJournalFileId
          );
        }
      };

      for (const stepDef of options.steps) {
        let stepState = journal.steps.find((s) => s.key === stepDef.key);
        if (!stepState) {
          stepState = { key: stepDef.key, status: 'pending', attempts: 0 };
          journal.steps.push(stepState);
        }

        if (stepState.status === 'completed') {
          if (!stepDef.verifyCompleted || (await stepDef.verifyCompleted(ctx))) {
            continue;
          }
          // Postcondition no longer holds -> reset step for idempotent re-run
          stepState.status = 'pending';
        }

        // Fencing check before every Drive mutation
        await lock.verify();

        stepState.attempts = (stepState.attempts || 0) + 1;
        try {
          const out = await stepDef.run(ctx);
          stepState.status = 'completed';
          stepState.verified_at = new Date().toISOString();
          if (out?.resource_id) stepState.resource_id = out.resource_id;
          if (out?.drive_file_id) stepState.drive_file_id = out.drive_file_id;
          if (out?.parent_id) stepState.parent_id = out.parent_id;
          if (out?.detail) stepState.detail = out.detail;
          await flushJournal();
        } catch (err) {
          const txErr =
            err instanceof BuillyTransactionError
              ? err
              : new BuillyTransactionError(
                  'POSTCONDITION_FAILED',
                  err instanceof Error ? err.message : 'Saga step failed.',
                  { operationId: options.operationId }
                );

          const requiresReconciliation =
            txErr.code === 'DUPLICATE_RESOURCE_CANDIDATES' ||
            txErr.code === 'PARENT_MISMATCH' ||
            txErr.code === 'REVISION_CONFLICT' ||
            txErr.code === 'NEEDS_RECONCILIATION';

          stepState.status = requiresReconciliation ? 'needs_reconciliation' : 'failed';
          stepState.detail = txErr.message;
          journal.status = requiresReconciliation
            ? 'needs_reconciliation'
            : txErr.retryable
            ? 'retryable'
            : 'failed';
          journal.error = {
            code: txErr.code,
            message: txErr.message,
            retryable: txErr.retryable,
          };

          await flushJournal().catch(() => undefined);
          throw txErr;
        }
      }

      // Renew & verify lock right before final completion mark
      await lock.verify();

      const result = options.buildResult(ctx);
      journal.status = 'completed';
      journal.error = undefined;
      journal.result = result;
      await flushJournal();

      // D1 operational projection update strictly AFTER verified Drive commit
      let projectionStatus: 'synced' | 'PROJECTION_REPAIR_PENDING' = 'synced';
      try {
        await options.updateProjection(result, ctx);
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO console_operation_idempotency (operation_key, owner_id, operation_type, payload_hash, result_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(
              options.operationId,
              options.ownerId,
              options.operationType,
              payloadHash,
              JSON.stringify(result),
              journal.created_at
            )
            .run();
        } catch {
          // Non-fatal; operations_projection + Drive journal already hold idempotency record
        }
      } catch (d1Err) {
        projectionStatus = 'PROJECTION_REPAIR_PENDING';
        await enqueueProjectionRepairOnFailure(env.DB, {
          ownerId: options.ownerId,
          resourceType: options.repairResourceType,
          resourceId: options.repairResourceId,
          operationId: options.operationId,
          payload: result,
          errorMessage: d1Err instanceof Error ? d1Err.message : 'D1 projection update failed.',
        });
      }

      return {
        ...result,
        operationId: options.operationId,
        deduplicated: false,
        canonicalCommitted: true,
        projectionStatus,
      };
    }
  );
}

/**
 * Reconstructs operation progress from Drive resources carrying appProperties.operation_id
 * when the canonical Operation Journal itself is missing or incomplete.
 * Stops with DUPLICATE_RESOURCE_CANDIDATES / NEEDS_RECONCILIATION if ambiguous.
 */
export async function reconstructOperationFromDriveMarkers(
  accessToken: string,
  operationId: string,
  expectedRootFolderId?: string
): Promise<{
  discoveredResources: DriveFileMeta[];
  ambiguous: boolean;
  reason?: string;
}> {
  const q = encodeURIComponent(
    `appProperties has { key='operation_id' and value='${operationId.replace(/'/g, "\\'")}' } and trashed = false`
  );
  const res = await driveJsonChecked<{ files?: DriveFileMeta[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,trashed,appProperties)&pageSize=50`,
    accessToken,
    {},
    { operationId }
  );

  const files = (res.files || []).filter((f) => !f.trashed);
  if (files.length === 0) {
    return { discoveredResources: [], ambiguous: false };
  }

  // Group by (resource_type, resource_id) to detect partial/duplicate creation
  const byIdentity = new Map<string, DriveFileMeta[]>();
  for (const f of files) {
    const rType = f.appProperties?.resource_type || f.mimeType;
    const rId = f.appProperties?.resource_id || f.name;
    const key = `${rType}:${rId}`;
    const list = byIdentity.get(key) || [];
    list.push(f);
    byIdentity.set(key, list);
  }

  for (const [identity, group] of byIdentity.entries()) {
    if (group.length > 1) {
      return {
        discoveredResources: files,
        ambiguous: true,
        reason: `Multiple Drive candidates (${group.length}) carry operation_id "${operationId}" for ${identity}.`,
      };
    }
    if (expectedRootFolderId && identity.startsWith('builly_root')) {
      const rootMeta = await getDriveFileMeta(accessToken, group[0].id, operationId);
      if (rootMeta.id !== expectedRootFolderId && rootMeta.mimeType === DRIVE_FOLDER_MIME) {
        return {
          discoveredResources: files,
          ambiguous: true,
          reason: `Discovered Builly root candidate "${rootMeta.id}" differs from expected root "${expectedRootFolderId}".`,
        };
      }
    }
  }

  return { discoveredResources: files, ambiguous: false };
}

export async function listAccountOperationsFromD1(
  db: D1Database,
  ownerId: string,
  limit = 40
): Promise<OperationJournalRecord[]> {
  try {
    const rows = await db
      .prepare(
        `SELECT * FROM operations_projection WHERE owner_id = ? ORDER BY updated_at DESC LIMIT ?`
      )
      .bind(ownerId, Math.min(100, Math.max(1, limit)))
      .all<{
        operation_id: string;
        owner_id: string;
        operation_type: string;
        scope_key: string;
        payload_hash: string;
        status: OperationStatus;
        target_json: string;
        steps_json: string;
        result_json: string;
        error_code: string;
        error_message: string;
        fencing_token: number;
        created_at: string;
        updated_at: string;
      }>();

    return (rows.results || []).map((row) => ({
      schema_version: 1,
      operation_id: row.operation_id,
      operation_type: row.operation_type,
      account_id: row.owner_id,
      scope_key: row.scope_key,
      payload_hash: row.payload_hash,
      status: row.status,
      target: JSON.parse(row.target_json || '{}'),
      steps: JSON.parse(row.steps_json || '[]'),
      discovered_ids: {},
      result: row.result_json ? JSON.parse(row.result_json) : undefined,
      error: row.error_code
        ? { code: row.error_code, message: row.error_message, retryable: row.status === 'retryable' }
        : undefined,
      fencing_token: row.fencing_token,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function listDriveOperationJournals(
  accessToken: string,
  operationsFolderId: string
): Promise<OperationJournalRecord[]> {
  if (!operationsFolderId) return [];
  const children = await findDriveChildren(accessToken, {
    parentId: operationsFolderId,
    appProperties: { resource_type: 'operation_journal' },
  });
  const out: OperationJournalRecord[] = [];
  for (const child of children.slice(0, 50)) {
    try {
      const { data } = await readDriveJsonWithConcurrency<OperationJournalRecord>(
        accessToken,
        child.id
      );
      if (data?.operation_id) out.push(data);
    } catch {
      // Skip malformed individual journal file cleanly
    }
  }
  return out;
}

export { driveFetchWithRetry };
