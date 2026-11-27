import { describe, expect, it } from 'vitest';
import {
  cleanupExpiredOAuthTransactions,
  createBuillySession,
  createMemoryAuthStore,
  hashSessionToken,
  linkGoogleIdentity,
  resolveBuillySession,
  revokeAllBuillySessions,
  revokeBuillySession,
  rotateBuillySession,
} from '../services/buillyAuth';
import { requireSession } from '../middleware/requireSession';
import { WorkerEnv } from '../types';

function envWith(store: ReturnType<typeof createMemoryAuthStore>): WorkerEnv {
  return { DB: {} as any, AUTH_STORE: store } as unknown as WorkerEnv;
}

function cookieRequest(token?: string): Request {
  const headers: Record<string, string> = {};
  if (token) headers.Cookie = `builly_session=${token}`;
  return new Request('https://builly.indyshares.com/api/console/bootstrap', { headers });
}

describe('Builly session service', () => {
  it('stores only a hash of the opaque session token', async () => {
    const store = createMemoryAuthStore();
    const created = await createBuillySession(store, 'account-1');
    expect(created.token.length).toBeGreaterThan(40);
    expect(store.sessions.has(await hashSessionToken(created.token))).toBe(true);
    expect(store.sessions.has(created.token)).toBe(false);
  });

  it('resolves a valid unexpired session to its account', async () => {
    const store = createMemoryAuthStore();
    const { token } = await createBuillySession(store, 'account-1');
    const resolved = await resolveBuillySession(store, token, Date.now());
    expect(resolved?.accountId).toBe('account-1');
    expect(resolved?.sessionId).toBe(await hashSessionToken(token));
  });

  it('rejects expired sessions', async () => {
    const store = createMemoryAuthStore();
    const { token } = await createBuillySession(store, 'account-1', {
      idleTtlMs: 1000,
      absoluteTtlMs: 1000,
      now: 1000,
    });
    expect(await resolveBuillySession(store, token, 5000)).toBeNull();
  });

  it('rotates a session and invalidates the old token', async () => {
    const store = createMemoryAuthStore();
    const first = await createBuillySession(store, 'account-1', { now: 1000 });
    const second = await rotateBuillySession(store, first.token, { now: 2000 });
    expect(second?.token).not.toBe(first.token);
    expect(await resolveBuillySession(store, first.token, 2000)).toBeNull();
    expect((await resolveBuillySession(store, second!.token, 2000))?.accountId).toBe('account-1');
  });

  it('revokes one session without revoking all sessions for the account', async () => {
    const store = createMemoryAuthStore();
    const a = await createBuillySession(store, 'account-1');
    const b = await createBuillySession(store, 'account-1');
    await revokeBuillySession(store, a.token);
    expect(await resolveBuillySession(store, a.token, Date.now())).toBeNull();
    expect(await resolveBuillySession(store, b.token, Date.now())).not.toBeNull();
  });

  it('revokes all sessions for an account', async () => {
    const store = createMemoryAuthStore();
    const a = await createBuillySession(store, 'account-1');
    const b = await createBuillySession(store, 'account-1');
    await revokeAllBuillySessions(store, 'account-1');
    expect(await resolveBuillySession(store, a.token, Date.now())).toBeNull();
    expect(await resolveBuillySession(store, b.token, Date.now())).toBeNull();
  });
});

describe('OAuth transaction cleanup', () => {
  it('removes only expired or consumed transactions, bounded by limit', async () => {
    const store = createMemoryAuthStore();
    for (let i = 0; i < 3; i++) {
      await store.insertOAuthTransaction({
        stateHash: `expired-${i}`,
        browserBindingHash: 'hash',
        nonce: 'nonce',
        codeVerifier: 'verifier',
        redirectUri: 'https://builly.indyshares.com/api/auth/google/callback',
        returnTo: '/console',
        frontendOrigin: 'https://builly.indyshares.com',
        createdAt: 0,
        expiresAt: 100,
        consumedAt: null,
      });
    }
    await store.insertOAuthTransaction({
      stateHash: 'active',
      browserBindingHash: 'hash',
      nonce: 'nonce',
      codeVerifier: 'verifier',
      redirectUri: 'https://builly.indyshares.com/api/auth/google/callback',
      returnTo: '/console',
      frontendOrigin: 'https://builly.indyshares.com',
      createdAt: 0,
      expiresAt: 10_000,
      consumedAt: null,
    });
    expect(await cleanupExpiredOAuthTransactions(store, 200, 2)).toBe(2);
    expect(await store.getSession('x')).toBeNull();
    expect(await store.consumeOAuthTransaction('active', 200)).not.toBeNull();
  });
});

describe('Google identity linking', () => {
  it('creates a Builly account on first login', async () => {
    const store = createMemoryAuthStore();
    const account = await linkGoogleIdentity(store, {
      provider: 'google',
      subject: 'google-sub-1',
      email: 'user@example.com',
      emailVerified: true,
      displayName: 'User',
      avatarUrl: '',
    });
    expect(account.id).toBeTruthy();
    expect(account.status).toBe('active');
    expect(store.identities.get('google:google-sub-1')?.accountId).toBe(account.id);
  });

  it('reuses the same account for repeat login and updates changed email metadata', async () => {
    const store = createMemoryAuthStore();
    const first = await linkGoogleIdentity(store, {
      provider: 'google',
      subject: 'google-sub-1',
      email: 'old@example.com',
      emailVerified: true,
    });
    const second = await linkGoogleIdentity(store, {
      provider: 'google',
      subject: 'google-sub-1',
      email: 'new@example.com',
      emailVerified: true,
    });
    expect(second.id).toBe(first.id);
    expect(store.accounts.get(first.id)?.email).toBe('new@example.com');
  });
});

describe('requireSession with Builly opaque sessions', () => {
  it('rejects a forged JWT with no session cookie', async () => {
    const store = createMemoryAuthStore();
    const request = new Request('https://builly.indyshares.com/api/console/bootstrap', {
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdHRhY2tlciJ9.forged',
      },
    });
    const result = await requireSession(request, envWith(store));
    expect(result.session).toBeUndefined();
    expect(result.errorResponse?.status).toBe(401);
  });

  it('returns 401 when the session cookie is missing', async () => {
    const result = await requireSession(cookieRequest(), envWith(createMemoryAuthStore()));
    expect(result.errorResponse?.status).toBe(401);
  });

  it('returns 401 for an unknown session token', async () => {
    const result = await requireSession(cookieRequest('not-a-real-session'), envWith(createMemoryAuthStore()));
    expect(result.errorResponse?.status).toBe(401);
  });

  it('accepts a valid session and resolves the Builly account', async () => {
    const store = createMemoryAuthStore();
    await linkGoogleIdentity(store, {
      provider: 'google',
      subject: 'google-sub-1',
      email: 'user@example.com',
      emailVerified: true,
    });
    const account = await linkGoogleIdentity(store, {
      provider: 'google',
      subject: 'google-sub-2',
      email: 'user2@example.com',
      emailVerified: true,
    });
    const { token } = await createBuillySession(store, account.id);
    const result = await requireSession(cookieRequest(token), envWith(store));
    expect(result.errorResponse).toBeUndefined();
    expect(result.session?.ownerId).toBe(account.id);
    expect(result.session?.email).toBe('user2@example.com');
  });

  it('enforces account suspension', async () => {
    const store = createMemoryAuthStore();
    store.accounts.set('suspended-1', {
      id: 'suspended-1',
      status: 'suspended',
      email: '',
      displayName: '',
      avatarUrl: '',
      createdAt: 0,
      updatedAt: 0,
    });
    const { token } = await createBuillySession(store, 'suspended-1');
    const result = await requireSession(cookieRequest(token), envWith(store));
    expect(result.errorResponse?.status).toBe(403);
    expect(result.session).toBeUndefined();
  });

  it('fails closed when the session store throws', async () => {
    const store = createMemoryAuthStore();
    const original = store.getSession;
    store.getSession = async () => {
      throw new Error('D1 unavailable');
    };
    const { token } = await createBuillySession(createMemoryAuthStore(), 'account-1');
    const result = await requireSession(cookieRequest(token), envWith(store));
    expect(result.session).toBeUndefined();
    expect(result.errorResponse?.status).toBe(401);
    store.getSession = original;
  });
});
