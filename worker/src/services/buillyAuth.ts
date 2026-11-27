/**
 * Builly-owned identity, session and OAuth-transaction storage.
 * The AuthStore interface keeps the domain testable without a live D1 binding;
 * createD1AuthStore is the production adapter using the existing DB binding.
 */

export interface AccountRow {
  id: string;
  status: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  createdAt: number;
  updatedAt: number;
}

export interface IdentityRow {
  provider: string;
  subject: string;
  accountId: string;
  email: string;
  emailVerified: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRow {
  tokenHash: string;
  accountId: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
  revokedAt: number | null;
  userAgent: string;
  ip: string;
}

export interface OAuthTransactionRow {
  stateHash: string;
  browserBindingHash: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  returnTo: string;
  frontendOrigin: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

export interface AuthStore {
  getAccount(id: string): Promise<AccountRow | null>;
  insertAccount(row: AccountRow): Promise<void>;
  updateAccount(row: AccountRow): Promise<void>;
  getIdentity(provider: string, subject: string): Promise<IdentityRow | null>;
  insertIdentity(row: IdentityRow): Promise<void>;
  updateIdentity(row: IdentityRow): Promise<void>;
  insertSession(row: SessionRow): Promise<void>;
  getSession(tokenHash: string): Promise<SessionRow | null>;
  touchSession(tokenHash: string, lastSeenAt: number): Promise<void>;
  revokeSession(tokenHash: string, revokedAt: number): Promise<void>;
  revokeSessionsForAccount(accountId: string, revokedAt: number): Promise<void>;
  insertOAuthTransaction(row: OAuthTransactionRow): Promise<void>;
  consumeOAuthTransaction(stateHash: string, consumedAt: number): Promise<OAuthTransactionRow | null>;
  insertAudit(accountId: string, event: string, metadata: string, createdAt: number): Promise<void>;
}

const IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createMemoryAuthStore(): AuthStore & {
  sessions: Map<string, SessionRow>;
  accounts: Map<string, AccountRow>;
  identities: Map<string, IdentityRow>;
} {
  const sessions = new Map<string, SessionRow>();
  const accounts = new Map<string, AccountRow>();
  const identities = new Map<string, IdentityRow>();
  const transactions = new Map<string, OAuthTransactionRow>();

  return {
    sessions,
    accounts,
    identities,
    async getAccount(id) {
      return accounts.get(id) || null;
    },
    async insertAccount(row) {
      accounts.set(row.id, { ...row });
    },
    async updateAccount(row) {
      accounts.set(row.id, { ...row });
    },
    async getIdentity(provider, subject) {
      return identities.get(`${provider}:${subject}`) || null;
    },
    async insertIdentity(row) {
      identities.set(`${row.provider}:${row.subject}`, { ...row });
    },
    async updateIdentity(row) {
      identities.set(`${row.provider}:${row.subject}`, { ...row });
    },
    async insertSession(row) {
      sessions.set(row.tokenHash, { ...row });
    },
    async getSession(tokenHash) {
      return sessions.get(tokenHash) || null;
    },
    async touchSession(tokenHash, lastSeenAt) {
      const row = sessions.get(tokenHash);
      if (row) sessions.set(tokenHash, { ...row, lastSeenAt });
    },
    async revokeSession(tokenHash, revokedAt) {
      const row = sessions.get(tokenHash);
      if (row) sessions.set(tokenHash, { ...row, revokedAt });
    },
    async revokeSessionsForAccount(accountId, revokedAt) {
      for (const [key, row] of sessions) {
        if (row.accountId === accountId) sessions.set(key, { ...row, revokedAt });
      }
    },
    async insertOAuthTransaction(row) {
      transactions.set(row.stateHash, { ...row });
    },
    async consumeOAuthTransaction(stateHash, consumedAt) {
      const row = transactions.get(stateHash);
      if (!row || row.consumedAt !== null || row.expiresAt <= consumedAt) return null;
      transactions.set(stateHash, { ...row, consumedAt });
      return { ...row };
    },
    async insertAudit() {},
  };
}

export function createD1AuthStore(db: D1Database): AuthStore {
  return {
    async getAccount(id) {
      const row = await db
        .prepare(
          `SELECT id, status, email, display_name, avatar_url, created_at, updated_at FROM accounts WHERE id = ?`
        )
        .bind(id)
        .first<Record<string, unknown>>();
      return row ? mapAccount(row) : null;
    },
    async insertAccount(row) {
      await db
        .prepare(
          `INSERT INTO accounts (id, status, email, display_name, avatar_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(row.id, row.status, row.email, row.displayName, row.avatarUrl, row.createdAt, row.updatedAt)
        .run();
    },
    async updateAccount(row) {
      await db
        .prepare(
          `UPDATE accounts SET status = ?, email = ?, display_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?`
        )
        .bind(row.status, row.email, row.displayName, row.avatarUrl, row.updatedAt, row.id)
        .run();
    },
    async getIdentity(provider, subject) {
      const row = await db
        .prepare(
          `SELECT provider, subject, account_id, email, email_verified, created_at, updated_at
           FROM external_identities WHERE provider = ? AND subject = ?`
        )
        .bind(provider, subject)
        .first<Record<string, unknown>>();
      return row ? mapIdentity(row) : null;
    },
    async insertIdentity(row) {
      await db
        .prepare(
          `INSERT INTO external_identities
             (provider, subject, account_id, email, email_verified, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.provider,
          row.subject,
          row.accountId,
          row.email,
          row.emailVerified,
          row.createdAt,
          row.updatedAt
        )
        .run();
    },
    async updateIdentity(row) {
      await db
        .prepare(
          `UPDATE external_identities SET account_id = ?, email = ?, email_verified = ?, updated_at = ?
           WHERE provider = ? AND subject = ?`
        )
        .bind(row.accountId, row.email, row.emailVerified, row.updatedAt, row.provider, row.subject)
        .run();
    },
    async insertSession(row) {
      await db
        .prepare(
          `INSERT INTO auth_sessions
             (token_hash, account_id, created_at, last_seen_at, expires_at, absolute_expires_at, revoked_at, user_agent, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.tokenHash,
          row.accountId,
          row.createdAt,
          row.lastSeenAt,
          row.expiresAt,
          row.absoluteExpiresAt,
          row.revokedAt,
          row.userAgent,
          row.ip
        )
        .run();
    },
    async getSession(tokenHash) {
      const row = await db
        .prepare(`SELECT * FROM auth_sessions WHERE token_hash = ?`)
        .bind(tokenHash)
        .first<Record<string, unknown>>();
      return row ? mapSession(row) : null;
    },
    async touchSession(tokenHash, lastSeenAt) {
      await db
        .prepare(`UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?`)
        .bind(lastSeenAt, tokenHash)
        .run();
    },
    async revokeSession(tokenHash, revokedAt) {
      await db
        .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?`)
        .bind(revokedAt, tokenHash)
        .run();
    },
    async revokeSessionsForAccount(accountId, revokedAt) {
      await db
        .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`)
        .bind(revokedAt, accountId)
        .run();
    },
    async insertOAuthTransaction(row) {
      await db
        .prepare(
          `INSERT INTO oauth_transactions
             (state_hash, browser_binding_hash, nonce, code_verifier, redirect_uri, return_to, frontend_origin, created_at, expires_at, consumed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.stateHash,
          row.browserBindingHash,
          row.nonce,
          row.codeVerifier,
          row.redirectUri,
          row.returnTo,
          row.frontendOrigin,
          row.createdAt,
          row.expiresAt,
          null
        )
        .run();
    },
    async consumeOAuthTransaction(stateHash, consumedAt) {
      const row = await db
        .prepare(
          `DELETE FROM oauth_transactions
           WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
           RETURNING state_hash, browser_binding_hash, nonce, code_verifier, redirect_uri, return_to, frontend_origin, created_at, expires_at, consumed_at`
        )
        .bind(stateHash, consumedAt)
        .first<Record<string, unknown>>();
      return row ? mapTransaction(row) : null;
    },
    async insertAudit(accountId, event, metadata, createdAt) {
      await db
        .prepare(
          `INSERT INTO auth_audit_logs (account_id, event, created_at, metadata) VALUES (?, ?, ?, ?)`
        )
        .bind(accountId, event, createdAt, metadata)
        .run();
    },
  };
}

function mapAccount(row: Record<string, unknown>): AccountRow {
  return {
    id: String(row.id),
    status: String(row.status),
    email: String(row.email || ''),
    displayName: String(row.display_name || ''),
    avatarUrl: String(row.avatar_url || ''),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapIdentity(row: Record<string, unknown>): IdentityRow {
  return {
    provider: String(row.provider),
    subject: String(row.subject),
    accountId: String(row.account_id),
    email: String(row.email || ''),
    emailVerified: Number(row.email_verified || 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapSession(row: Record<string, unknown>): SessionRow {
  return {
    tokenHash: String(row.token_hash),
    accountId: String(row.account_id),
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
    expiresAt: Number(row.expires_at),
    absoluteExpiresAt: Number(row.absolute_expires_at),
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : Number(row.revoked_at),
    userAgent: String(row.user_agent || ''),
    ip: String(row.ip || ''),
  };
}

function mapTransaction(row: Record<string, unknown>): OAuthTransactionRow {
  return {
    stateHash: String(row.state_hash),
    browserBindingHash: String(row.browser_binding_hash || ''),
    nonce: String(row.nonce || ''),
    codeVerifier: String(row.code_verifier),
    redirectUri: String(row.redirect_uri),
    returnTo: String(row.return_to || '/'),
    frontendOrigin: String(row.frontend_origin || ''),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    consumedAt: row.consumed_at === null || row.consumed_at === undefined ? null : Number(row.consumed_at),
  };
}

export interface VerifiedGoogleIdentity {
  provider: 'google';
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
}

/** Maps (provider, subject) to a Builly-owned account. Never merges by email. */
export async function linkGoogleIdentity(
  store: AuthStore,
  identity: VerifiedGoogleIdentity
): Promise<AccountRow> {
  const existing = await store.getIdentity(identity.provider, identity.subject);
  const now = Date.now();
  if (existing) {
    const account = await store.getAccount(existing.accountId);
    if (!account) throw new Error('IDENTITY_ACCOUNT_MISSING');
    const updated: AccountRow = {
      ...account,
      email: identity.email || account.email,
      displayName: identity.displayName || account.displayName,
      avatarUrl: identity.avatarUrl || account.avatarUrl,
      updatedAt: now,
    };
    await store.updateAccount(updated);
    await store.updateIdentity({
      ...existing,
      email: identity.email,
      emailVerified: identity.emailVerified ? 1 : 0,
      updatedAt: now,
    });
    return updated;
  }

  const account: AccountRow = {
    id: crypto.randomUUID(),
    status: 'active',
    email: identity.email,
    displayName: identity.displayName || '',
    avatarUrl: identity.avatarUrl || '',
    createdAt: now,
    updatedAt: now,
  };
  await store.insertAccount(account);
  await store.insertIdentity({
    provider: identity.provider,
    subject: identity.subject,
    accountId: account.id,
    email: identity.email,
    emailVerified: identity.emailVerified ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
  return account;
}

export async function createBuillySession(
  store: AuthStore,
  accountId: string,
  options: { now?: number; idleTtlMs?: number; absoluteTtlMs?: number; userAgent?: string; ip?: string } = {}
): Promise<{ token: string; tokenHash: string; expiresAt: number }> {
  const now = options.now ?? Date.now();
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashSessionToken(token);
  const idleTtl = options.idleTtlMs ?? IDLE_TTL_MS;
  const absoluteTtl = options.absoluteTtlMs ?? ABSOLUTE_TTL_MS;
  await store.insertSession({
    tokenHash,
    accountId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + idleTtl,
    absoluteExpiresAt: now + absoluteTtl,
    revokedAt: null,
    userAgent: options.userAgent || '',
    ip: options.ip || '',
  });
  return { token, tokenHash, expiresAt: now + idleTtl };
}

/** Deterministic non-cryptographic hash used only by the test seam. */
export function syncTestTokenHash(token: string): string {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Test seam: registers a fixed opaque token without generating a random one. */
export async function seedBuillyTestSession(
  store: AuthStore,
  token: string,
  accountId: string,
  email = ''
): Promise<void> {
  const now = Date.now();
  const tokenHash = syncTestTokenHash(token);
  await store.insertAccount({
    id: accountId,
    status: 'active',
    email,
    displayName: '',
    avatarUrl: '',
    createdAt: now,
    updatedAt: now,
  });
  await store.insertSession({
    tokenHash,
    accountId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + IDLE_TTL_MS,
    absoluteExpiresAt: now + ABSOLUTE_TTL_MS,
    revokedAt: null,
    userAgent: '',
    ip: '',
  });
}

export async function resolveBuillySession(
  store: AuthStore,
  token: string,
  now: number = Date.now()
): Promise<{ accountId: string; sessionId: string; expiresAt: number } | null> {
  const tokenHash = await hashSessionToken(token);
  const row = await store.getSession(tokenHash);
  if (!row || row.revokedAt !== null || row.expiresAt <= now || row.absoluteExpiresAt <= now) {
    return null;
  }
  await store.touchSession(tokenHash, now);
  return { accountId: row.accountId, sessionId: tokenHash, expiresAt: row.expiresAt };
}

export async function rotateBuillySession(
  store: AuthStore,
  token: string,
  options: { now?: number } = {}
): Promise<{ token: string; tokenHash: string; expiresAt: number } | null> {
  const resolved = await resolveBuillySession(store, token, options.now ?? Date.now());
  if (!resolved) return null;
  await store.revokeSession(resolved.sessionId, options.now ?? Date.now());
  return createBuillySession(store, resolved.accountId, options);
}

export async function revokeBuillySession(store: AuthStore, token: string): Promise<void> {
  const tokenHash = await hashSessionToken(token);
  await store.revokeSession(tokenHash, Date.now());
}

export async function revokeAllBuillySessions(store: AuthStore, accountId: string): Promise<void> {
  await store.revokeSessionsForAccount(accountId, Date.now());
}

