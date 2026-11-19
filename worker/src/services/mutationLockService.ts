import { LockRecord, WorkspaceLockStateMachine } from '../do/WorkspaceLockDO';
import { WorkerEnv } from '../types';
import { BuillyTransactionError } from './transactionErrors';

export interface ActiveLockHandle {
  scopeKey: string;
  operationId: string;
  fencingToken: number;
  expiresAt: number;
  renew: (leaseMs?: number) => Promise<void>;
  verify: () => Promise<void>;
  release: () => Promise<void>;
}

const inMemoryMachines = new Map<string, WorkspaceLockStateMachine>();

function getInMemoryMachine(scopeKey: string): WorkspaceLockStateMachine {
  let machine = inMemoryMachines.get(scopeKey);
  if (!machine) {
    machine = new WorkspaceLockStateMachine();
    inMemoryMachines.set(scopeKey, machine);
  }
  return machine;
}

export function clearInMemoryLocksForTest(): void {
  inMemoryMachines.clear();
}

export function expireInMemoryLockForTest(scopeKey: string): void {
  const machine = inMemoryMachines.get(scopeKey);
  if (!machine) return;
  const snap = machine.snapshot();
  if (snap.current) {
    inMemoryMachines.set(
      scopeKey,
      new WorkspaceLockStateMachine({
        current: { ...snap.current, expiresAt: Date.now() - 1 },
        lastFencingToken: snap.lastFencingToken,
      })
    );
  }
}

async function doAction<T>(
  env: WorkerEnv,
  scopeKey: string,
  action: '/acquire' | '/renew' | '/verify' | '/release',
  body: Record<string, unknown>
): Promise<{ status: number; data: T }> {
  if (env.WORKSPACE_LOCK) {
    const id = env.WORKSPACE_LOCK.idFromName(scopeKey);
    const stub = env.WORKSPACE_LOCK.get(id);
    const res = await stub.fetch(`https://workspace-lock.internal${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scopeKey, ...body }),
    });
    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  const machine = getInMemoryMachine(scopeKey);
  if (action === '/acquire') {
    const r = machine.tryAcquire({
      scopeKey,
      operationId: String(body.operationId || ''),
      leaseMs: typeof body.leaseMs === 'number' ? body.leaseMs : undefined,
    });
    return { status: r.granted ? 200 : 409, data: r as unknown as T };
  }
  if (action === '/renew') {
    const r = machine.renew({
      operationId: String(body.operationId || ''),
      fencingToken: Number(body.fencingToken || 0),
      leaseMs: typeof body.leaseMs === 'number' ? body.leaseMs : undefined,
    });
    return { status: r.ok ? 200 : 409, data: r as unknown as T };
  }
  if (action === '/verify') {
    const r = machine.verify({
      operationId: String(body.operationId || ''),
      fencingToken: Number(body.fencingToken || 0),
    });
    return { status: r.valid ? 200 : 409, data: r as unknown as T };
  }
  const released = machine.release({
    operationId: String(body.operationId || ''),
    fencingToken: Number(body.fencingToken || 0),
  });
  return { status: 200, data: { released } as unknown as T };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquires a bounded-timeout lease lock for scopeKey (account:{id}, org:{id}, project:{id}, site:{id}).
 * Uses Cloudflare Durable Object WorkspaceLockDO when bound, or identical WorkspaceLockStateMachine in-memory.
 */
export async function acquireMutationLock(
  env: WorkerEnv,
  params: {
    scopeKey: string;
    operationId: string;
    leaseMs?: number;
    acquireTimeoutMs?: number;
  }
): Promise<ActiveLockHandle> {
  const leaseMs = params.leaseMs ?? 30_000;
  const timeoutMs = params.acquireTimeoutMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;

  let attempt = 0;
  while (true) {
    const res = await doAction<{
      granted: boolean;
      lock?: LockRecord;
      heldByOperationId?: string;
    }>(env, params.scopeKey, '/acquire', {
      operationId: params.operationId,
      leaseMs,
    });

    if (res.data.granted && res.data.lock) {
      let currentToken = res.data.lock.fencingToken;
      let currentExpiresAt = res.data.lock.expiresAt;

      return {
        scopeKey: params.scopeKey,
        operationId: params.operationId,
        fencingToken: currentToken,
        expiresAt: currentExpiresAt,
        async renew(nextLeaseMs?: number) {
          const r = await doAction<{ ok: boolean; lock?: LockRecord }>(
            env,
            params.scopeKey,
            '/renew',
            {
              operationId: params.operationId,
              fencingToken: currentToken,
              leaseMs: nextLeaseMs ?? leaseMs,
            }
          );
          if (!r.data.ok || !r.data.lock) {
            throw new BuillyTransactionError(
              'LOCK_OWNERSHIP_LOST',
              'Mutation lock lease expired or was claimed by another operation.',
              { operationId: params.operationId }
            );
          }
          currentExpiresAt = r.data.lock.expiresAt;
        },
        async verify() {
          const r = await doAction<{ valid: boolean }>(env, params.scopeKey, '/verify', {
            operationId: params.operationId,
            fencingToken: currentToken,
          });
          if (!r.data.valid) {
            throw new BuillyTransactionError(
              'LOCK_OWNERSHIP_LOST',
              'Mutation lock ownership check failed before side effect.',
              { operationId: params.operationId }
            );
          }
        },
        async release() {
          await doAction<{ released: boolean }>(env, params.scopeKey, '/release', {
            operationId: params.operationId,
            fencingToken: currentToken,
          }).catch(() => undefined);
        },
      };
    }

    if (Date.now() >= deadline) {
      throw new BuillyTransactionError(
        'LOCK_TIMEOUT',
        `Timed out waiting for mutation lock on "${params.scopeKey}".`,
        { operationId: params.operationId }
      );
    }

    attempt += 1;
    const waitMs = Math.min(250, 25 * Math.pow(1.5, attempt)) + Math.floor(Math.random() * 20);
    await sleep(waitMs);
  }
}

export async function withMutationLock<T>(
  env: WorkerEnv,
  params: {
    scopeKey: string;
    operationId: string;
    leaseMs?: number;
    acquireTimeoutMs?: number;
  },
  fn: (lock: ActiveLockHandle) => Promise<T>
): Promise<T> {
  const lock = await acquireMutationLock(env, params);
  try {
    return await fn(lock);
  } finally {
    await lock.release();
  }
}
