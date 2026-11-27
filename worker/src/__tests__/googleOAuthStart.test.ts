import { describe, expect, it } from 'vitest';
import { handleGoogleOAuthStart } from '../routes/googleOAuth';
import { createBuillySession, createMemoryAuthStore, linkGoogleIdentity } from '../services/buillyAuth';
import { WorkerEnv } from '../types';

interface StartResponse {
  authorizeUrl?: string;
  error?: string;
  code?: string;
  codes?: string[];
  diagnostics?: Record<string, unknown>;
}

async function createEnv(
  overrides: Partial<WorkerEnv> = {}
): Promise<{ env: WorkerEnv; cookie: string }> {
  const store = createMemoryAuthStore();
  const account = await linkGoogleIdentity(store, {
    provider: 'google',
    subject: 'google-sub-1',
    email: 'owner@example.com',
    emailVerified: true,
  });
  const session = await createBuillySession(store, account.id);
  return {
    env: {
      DB: {
        prepare: () => ({ bind: () => ({ run: async () => ({}) }) }),
      } as any,
      GOOGLE_OAUTH_CLIENT_ID:
        '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret-value',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/api/auth/google/callback',
      GOOGLE_WORKSPACE_SCOPES: 'https://www.googleapis.com/auth/drive.file',
      TOKEN_ENCRYPTION_KEY: 'test-key',
      AUTH_STORE: store,
      ...overrides,
    } as WorkerEnv,
    cookie: `builly_session=${session.token}`,
  };
}

function createRequest(cookie: string): Request {
  return new Request('https://builly-project.mycloudsfireworks.workers.dev/api/google/oauth/start', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: 'https://builly.indyshares.com',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ returnTo: '/console' }),
  });
}

describe('handleGoogleOAuthStart', () => {
  it('reports both missing Client ID and Client Secret without leaking values', async () => {
    const { env, cookie } = await createEnv({
      GOOGLE_OAUTH_CLIENT_ID: '' as any,
      GOOGLE_OAUTH_CLIENT_SECRET: '' as any,
    });
    const res = await handleGoogleOAuthStart(createRequest(cookie), env);
    expect(res.status).toBe(500);
    const body = (await res.json()) as StartResponse;
    expect(body.code).toBe('MISSING_GOOGLE_CLIENT_ID');
    expect(body.codes).toEqual(['MISSING_GOOGLE_CLIENT_ID', 'MISSING_GOOGLE_CLIENT_SECRET']);
    expect(body.error).toContain('GOOGLE_OAUTH_CLIENT_ID');
    expect(body.error).toContain('GOOGLE_OAUTH_CLIENT_SECRET');
    expect(JSON.stringify(body)).not.toContain('test-secret-value');
  });

  it('reports the missing Client Secret when the Client ID is configured', async () => {
    const { env, cookie } = await createEnv({ GOOGLE_OAUTH_CLIENT_SECRET: '' as any });
    const res = await handleGoogleOAuthStart(createRequest(cookie), env);
    expect(res.status).toBe(500);
    expect(((await res.json()) as StartResponse).code).toBe('MISSING_GOOGLE_CLIENT_SECRET');
  });

  it('rejects an incorrect redirect URI before generating an authorization URL', async () => {
    const { env, cookie } = await createEnv({
      GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/wrong',
    });
    const res = await handleGoogleOAuthStart(createRequest(cookie), env);
    expect(res.status).toBe(500);
    expect(((await res.json()) as StartResponse).code).toBe('INVALID_GOOGLE_OAUTH_REDIRECT_URI');
  });

  it('returns an authorization URL for valid Worker configuration without exposing the secret', async () => {
    const { env, cookie } = await createEnv();
    const res = await handleGoogleOAuthStart(createRequest(cookie), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as StartResponse;
    expect(body.authorizeUrl).toContain(
      'client_id=616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com'
    );
    expect(body.authorizeUrl).toContain('redirect_uri=https%3A%2F%2Fbuilly-project.mycloudsfireworks.workers.dev%2Fapi%2Fgoogle%2Foauth%2Fcallback');
    expect(JSON.stringify(body)).not.toContain('test-secret-value');
  });
});
