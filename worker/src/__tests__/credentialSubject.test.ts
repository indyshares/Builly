import { describe, expect, it } from 'vitest';
import { saveEncryptedWorkspaceCredential } from '../services/googleTokenVault';
import { WorkerEnv } from '../types';

function captureEnv(): { env: WorkerEnv; sql: () => string; params: () => unknown[] } {
  let query = '';
  let bound: unknown[] = [];
  const db = {
    prepare: (raw: string) => ({
      bind: (...values: unknown[]) => {
        query = raw;
        bound = values;
        return { run: async () => ({}) };
      },
    }),
  } as any;
  return {
    env: {
      DB: db,
      GOOGLE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/api/auth/google/callback',
      GOOGLE_WORKSPACE_SCOPES: 'https://www.googleapis.com/auth/drive',
      TOKEN_ENCRYPTION_KEY: btoa('0123456789abcdef0123456789abcdef'),
    },
    sql: () => query,
    params: () => bound,
  };
}

describe('workspace credential subject separation', () => {
  it('stores OIDC sub and Drive principal in separate columns', async () => {
    const capture = captureEnv();
    await saveEncryptedWorkspaceCredential(capture.env, {
      ownerId: 'account-1',
      googleSubject: 'drive-permission-id',
      googleOidcSub: 'google-oidc-sub-1',
      googleEmail: 'user@example.com',
      googleName: 'User',
      googleAvatar: '',
      grantedScopes: ['https://www.googleapis.com/auth/drive'],
      refreshToken: 'refresh-token',
    });
    expect(capture.sql()).toContain('google_oidc_sub');
    expect(capture.params()).toContain('google-oidc-sub-1');
    expect(capture.params()).toContain('drive-permission-id');
    const params = capture.params();
    expect(params.indexOf('google-oidc-sub-1')).not.toBe(params.indexOf('drive-permission-id'));
    expect(capture.sql()).toContain('CASE WHEN excluded.google_oidc_sub');
  });

  it('preserves an existing OIDC sub when reconnect supplies none', async () => {
    const capture = captureEnv();
    await saveEncryptedWorkspaceCredential(capture.env, {
      ownerId: 'account-1',
      googleSubject: 'drive-permission-id-2',
      googleEmail: 'user@example.com',
      googleName: 'User',
      googleAvatar: '',
      grantedScopes: [],
      refreshToken: 'refresh-token',
    });
    expect(capture.params()[2]).toBe('');
    expect(capture.sql()).toContain('CASE WHEN excluded.google_oidc_sub');
  });
});
