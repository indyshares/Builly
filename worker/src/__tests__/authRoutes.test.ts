import { describe, expect, it } from 'vitest';
import { handleAuthGoogleStart, handleAuthLogout, handleAuthSession, resolveFrontendOrigin } from '../routes/auth';
import { createMemoryAuthStore } from '../services/buillyAuth';
import { WorkerEnv } from '../types';

function envWith(store = createMemoryAuthStore()): WorkerEnv {
  return {
    DB: {} as any,
    GOOGLE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/api/auth/google/callback',
    GOOGLE_WORKSPACE_SCOPES:
      'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
    TOKEN_ENCRYPTION_KEY: 'test',
    ALLOWED_FRONTEND_ORIGINS: 'https://builly.indyshares.com',
    AUTH_STORE: store,
  };
}

function startRequest(origin?: string): Request {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (origin) headers.Origin = origin;
  return new Request('https://builly.indyshares.com/api/auth/google/start?returnTo=%2Fconsole', {
    method: 'GET',
    headers,
  });
}

describe('Google login origin allowlist', () => {
  it('accepts an explicitly configured origin', () => {
    const request = startRequest('https://builly.indyshares.com');
    expect(resolveFrontendOrigin(request, envWith())).toBe('https://builly.indyshares.com');
  });

  it('rejects malicious, lookalike, and untrusted subdomain origins', () => {
    const env = envWith();
    for (const origin of [
      'https://evil.tld',
      'https://builly.indyshares.com.evil.tld',
      'https://evil.builly.indyshares.com',
      'null',
    ]) {
      expect(resolveFrontendOrigin(startRequest(origin), env)).toBeNull();
    }
  });

  it('uses only the safe configured default when Origin is missing', () => {
    expect(resolveFrontendOrigin(startRequest(), envWith())).toBe('https://builly.indyshares.com');
  });

  it('rejects an unrecognized Origin before creating a transaction', async () => {
    const res = await handleAuthGoogleStart(startRequest('https://evil.tld'), envWith());
    expect(res.status).toBe(400);
    expect((await res.json() as { code: string }).code).toBe('INVALID_ORIGIN');
  });

  it('redirects to Google with centralized scopes and sets a browser-binding cookie', async () => {
    const res = await handleAuthGoogleStart(startRequest('https://builly.indyshares.com'), envWith());
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('Location') || '');
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/drive');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = res.headers.get('Set-Cookie') || '';
    expect(cookie).toContain('builly_oauth_binding=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });
});

describe('Builly session cookie lifecycle', () => {
  it('returns 401 for session restoration without a cookie', async () => {
    const res = await handleAuthSession(new Request('https://builly.indyshares.com/api/auth/session'), envWith());
    expect(res.status).toBe(401);
    expect((await res.json() as { authenticated: boolean }).authenticated).toBe(false);
  });

  it('logout clears the session cookie with matching production attributes', async () => {
    const res = await handleAuthLogout(
      new Request('https://builly.indyshares.com/api/auth/logout', { method: 'POST' }),
      envWith()
    );
    expect(res.status).toBe(200);
    const cleared = res.headers.get('Set-Cookie') || '';
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('Secure');
    expect(cleared).toContain('SameSite=Lax');
    expect(cleared).toContain('Path=/');
    expect(cleared).toContain('Max-Age=0');
  });
});
