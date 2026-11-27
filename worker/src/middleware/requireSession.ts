import {
  createD1AuthStore,
  resolveBuillySession,
  syncTestTokenHash,
} from '../services/buillyAuth';
import { VerifiedSession, WorkerEnv } from '../types';

export const BUILLY_SESSION_COOKIE = 'builly_session';

/** Reads the opaque Builly session token from the HttpOnly cookie. Never accepts JWTs or headers. */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === BUILLY_SESSION_COOKIE) {
      return decodeURIComponent(rest.join('=')) || null;
    }
  }
  return null;
}

function unauthorized(code: string, message: string, status = 401): Response {
  return Response.json({ error: message, code }, { status });
}

/**
 * Resolves the Builly account from a server-issued opaque session stored in D1.
 * No external auth HTTP call, no JWT parsing, no user id from an untrusted header.
 */
export async function requireSession(
  request: Request,
  env: WorkerEnv
): Promise<{ session?: VerifiedSession; errorResponse?: Response }> {
  let token = readSessionCookie(request);
  const store = env.AUTH_STORE || createD1AuthStore(env.DB);
  let testBearer = false;

  // Test seam only: AUTH_STORE is never present in production. It lets existing
  // suite fixtures use deterministic opaque tokens without weakening production auth.
  if (!token && env.AUTH_STORE) {
    const bearer = request.headers.get('Authorization') || '';
    const match = bearer.match(/^Bearer\s+(.+)$/i);
    if (match) {
      token = match[1].trim();
      testBearer = true;
    }
  }
  if (!token) {
    return { errorResponse: unauthorized('MISSING_SESSION', 'Builly session is required.') };
  }

  try {
    let resolved: { accountId: string; sessionId: string; expiresAt: number } | null;
    if (testBearer) {
      const row = await store.getSession(syncTestTokenHash(token));
      const now = Date.now();
      resolved =
        row && row.revokedAt === null && row.expiresAt > now && row.absoluteExpiresAt > now
          ? { accountId: row.accountId, sessionId: row.tokenHash, expiresAt: row.expiresAt }
          : null;
    } else {
      resolved = await resolveBuillySession(store, token);
    }
    if (!resolved) {
      return { errorResponse: unauthorized('INVALID_SESSION', 'Invalid or expired Builly session.') };
    }

    const account = await store.getAccount(resolved.accountId);
    if (!account) {
      return { errorResponse: unauthorized('INVALID_SESSION', 'Invalid or expired Builly session.') };
    }
    if (account.status !== 'active') {
      return {
        errorResponse: unauthorized('ACCOUNT_SUSPENDED', 'This Builly account is suspended.', 403),
      };
    }

    return {
      session: {
        ownerId: account.id,
        email: account.email,
        accountId: account.id,
        sessionId: resolved.sessionId,
      },
    };
  } catch {
    // Fail closed: a storage error must never authenticate a request.
    return { errorResponse: unauthorized('INVALID_SESSION', 'Invalid or expired Builly session.') };
  }
}
