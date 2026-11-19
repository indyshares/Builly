export interface LockRecord {
  scopeKey: string;
  ownerOperationId: string;
  fencingToken: number;
  acquiredAt: number;
  expiresAt: number;
}

const DEFAULT_LEASE_MS = 30_000;
const MAX_LEASE_MS = 120_000;

/**
 * Pure lock state machine shared by WorkspaceLockDO (Cloudflare Durable Object)
 * and unit-test in-memory coordinator so expired-lease recovery, fencing checks,
 * and bounded renewals share identical deterministic semantics.
 */
export class WorkspaceLockStateMachine {
  private current: LockRecord | null = null;
  private lastFencingToken = 0;

  constructor(initial?: { current?: LockRecord | null; lastFencingToken?: number }) {
    this.current = initial?.current || null;
    this.lastFencingToken = initial?.lastFencingToken || 0;
  }

  snapshot(): { current: LockRecord | null; lastFencingToken: number } {
    return {
      current: this.current ? { ...this.current } : null,
      lastFencingToken: this.lastFencingToken,
    };
  }

  tryAcquire(params: {
    scopeKey: string;
    operationId: string;
    leaseMs?: number;
    now?: number;
  }):
    | { granted: true; lock: LockRecord; recoveredExpiredLease: boolean }
    | { granted: false; heldByOperationId: string; expiresAt: number } {
    const now = params.now ?? Date.now();
    const leaseMs = Math.min(MAX_LEASE_MS, Math.max(1000, params.leaseMs ?? DEFAULT_LEASE_MS));

    let recoveredExpiredLease = false;
    if (this.current) {
      if (now < this.current.expiresAt) {
        if (this.current.ownerOperationId === params.operationId) {
          this.current = {
            ...this.current,
            expiresAt: now + leaseMs,
          };
          return { granted: true, lock: { ...this.current }, recoveredExpiredLease: false };
        }
        return {
          granted: false,
          heldByOperationId: this.current.ownerOperationId,
          expiresAt: this.current.expiresAt,
        };
      }
      recoveredExpiredLease = true;
    }

    this.lastFencingToken += 1;
    this.current = {
      scopeKey: params.scopeKey,
      ownerOperationId: params.operationId,
      fencingToken: this.lastFencingToken,
      acquiredAt: now,
      expiresAt: now + leaseMs,
    };
    return { granted: true, lock: { ...this.current }, recoveredExpiredLease };
  }

  renew(params: {
    operationId: string;
    fencingToken: number;
    leaseMs?: number;
    now?: number;
  }): { ok: true; lock: LockRecord } | { ok: false; code: 'LOCK_OWNERSHIP_LOST' } {
    const now = params.now ?? Date.now();
    const leaseMs = Math.min(MAX_LEASE_MS, Math.max(1000, params.leaseMs ?? DEFAULT_LEASE_MS));
    if (
      !this.current ||
      this.current.ownerOperationId !== params.operationId ||
      this.current.fencingToken !== params.fencingToken ||
      now >= this.current.expiresAt
    ) {
      return { ok: false, code: 'LOCK_OWNERSHIP_LOST' };
    }
    this.current = {
      ...this.current,
      expiresAt: now + leaseMs,
    };
    return { ok: true, lock: { ...this.current } };
  }

  verify(params: {
    operationId: string;
    fencingToken: number;
    now?: number;
  }): { valid: true; lock: LockRecord } | { valid: false; code: 'LOCK_OWNERSHIP_LOST' } {
    const now = params.now ?? Date.now();
    if (
      !this.current ||
      this.current.ownerOperationId !== params.operationId ||
      this.current.fencingToken !== params.fencingToken ||
      now >= this.current.expiresAt
    ) {
      return { valid: false, code: 'LOCK_OWNERSHIP_LOST' };
    }
    return { valid: true, lock: { ...this.current } };
  }

  release(params: { operationId: string; fencingToken: number }): boolean {
    if (
      !this.current ||
      this.current.ownerOperationId !== params.operationId ||
      this.current.fencingToken !== params.fencingToken
    ) {
      return false;
    }
    this.current = null;
    return true;
  }
}

interface DurableStateStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableStateStorageLike;
}

/**
 * Cloudflare Durable Object providing single-writer serialization per lock scope:
 * account:{ownerId}, org:{orgId}, project:{projectId}, site:{siteId}.
 */
export class WorkspaceLockDO {
  private state: DurableObjectStateLike;
  private machine: WorkspaceLockStateMachine | null = null;

  constructor(state: DurableObjectStateLike) {
    this.state = state;
  }

  private async getMachine(): Promise<WorkspaceLockStateMachine> {
    if (!this.machine) {
      const saved = await this.state.storage.get<{
        current: LockRecord | null;
        lastFencingToken: number;
      }>('lock_state');
      this.machine = new WorkspaceLockStateMachine(saved);
    }
    return this.machine;
  }

  private async persist(machine: WorkspaceLockStateMachine): Promise<void> {
    await this.state.storage.put('lock_state', machine.snapshot());
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as {
      scopeKey?: string;
      operationId?: string;
      fencingToken?: number;
      leaseMs?: number;
    };
    const machine = await this.getMachine();

    if (url.pathname === '/acquire' && request.method === 'POST') {
      const result = machine.tryAcquire({
        scopeKey: body.scopeKey || 'default',
        operationId: body.operationId || '',
        leaseMs: body.leaseMs,
      });
      if (result.granted) {
        await this.persist(machine);
        return Response.json(result, { status: 200 });
      }
      return Response.json(result, { status: 409 });
    }

    if (url.pathname === '/renew' && request.method === 'POST') {
      const result = machine.renew({
        operationId: body.operationId || '',
        fencingToken: Number(body.fencingToken || 0),
        leaseMs: body.leaseMs,
      });
      if (result.ok) {
        await this.persist(machine);
        return Response.json(result, { status: 200 });
      }
      return Response.json(result, { status: 409 });
    }

    if (url.pathname === '/verify' && request.method === 'POST') {
      const result = machine.verify({
        operationId: body.operationId || '',
        fencingToken: Number(body.fencingToken || 0),
      });
      return Response.json(result, { status: result.valid ? 200 : 409 });
    }

    if (url.pathname === '/release' && request.method === 'POST') {
      const released = machine.release({
        operationId: body.operationId || '',
        fencingToken: Number(body.fencingToken || 0),
      });
      await this.persist(machine);
      return Response.json({ released });
    }

    return Response.json({ error: 'Unknown lock DO action.' }, { status: 404 });
  }
}
