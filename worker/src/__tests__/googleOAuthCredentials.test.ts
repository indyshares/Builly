import { describe, expect, it } from 'vitest';
import {
  createSafeClientFingerprint,
  resolveGoogleOAuthCredentials,
  validateGoogleOAuthConfig,
} from '../security/googleOAuthCredentials';
import { WorkerEnv } from '../types';

function createMockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: {} as any,
    GOOGLE_OAUTH_CLIENT_ID: '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/api/google/oauth/callback',
    GOOGLE_WORKSPACE_SCOPES: 'https://www.googleapis.com/auth/drive.file',
    TOKEN_ENCRYPTION_KEY: 'test-key',
    ...overrides,
  };
}

describe('googleOAuthCredentials resolver', () => {
  it('correctly creates safe non-sensitive client ID fingerprint', () => {
    const fp = createSafeClientFingerprint(
      '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com'
    );
    expect(fp).toBe('616978...c9f8.apps.googleusercontent.com (len 72)');
    expect(fp).not.toContain('6mdf7p75veer'); // Masks middle internal hash
  });

  it('detects missing .apps.googleusercontent.com suffix in fingerprint', () => {
    const fp = createSafeClientFingerprint('616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8');
    expect(fp).toContain('MISSING .apps.googleusercontent.com');
  });

  it('handles empty or undefined fingerprint safely', () => {
    expect(createSafeClientFingerprint('')).toBe('(empty)');
    expect(createSafeClientFingerprint('undefined')).toBe('literal string "undefined"');
  });

  it('resolves primary GOOGLE_OAUTH_CLIENT_ID when valid', () => {
    const env = createMockEnv();
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.source).toBe('GOOGLE_OAUTH_CLIENT_ID');
    expect(creds.clientId).toBe(
      '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com'
    );
    expect(creds.diagnostics.clientIdConfigured).toBe(true);
    expect(creds.diagnostics.hasQuotes).toBe(false);
    expect(creds.diagnostics.hasWhitespace).toBe(false);
  });

  it('strips accidental quotes and trailing whitespace from dashboard entries', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID:
        ' "616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com" ' as any,
      GOOGLE_OAUTH_CLIENT_SECRET: ' "my-secret-123" ' as any,
    });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.clientId).toBe(
      '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com'
    );
    expect(creds.clientSecret).toBe('my-secret-123');
    expect(creds.diagnostics.hasQuotes).toBe(true);
    expect(creds.diagnostics.hasWhitespace).toBe(true);
  });

  it('ignores VITE_GOOGLE_OAUTH_CLIENT_ID because it is a frontend build variable, not a Worker binding', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID: '' as any,
      ...( {
        VITE_GOOGLE_OAUTH_CLIENT_ID:
          '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com',
      } as any),
    });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.source).toBe('NONE');
    expect(creds.clientId).toBe('');
    expect(creds.diagnostics.clientIdConfigured).toBe(false);
  });

  it('ignores a literal "undefined" GOOGLE_OAUTH_CLIENT_ID without a VITE fallback', () => {
    const env = createMockEnv({ GOOGLE_OAUTH_CLIENT_ID: 'undefined' as any });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.source).toBe('NONE');
    expect(creds.clientId).toBe('');
  });

  it('normalizes missing .apps.googleusercontent.com domain when prefix is valid', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID: '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8',
    });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.clientId).toBe(
      '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com'
    );
    expect(creds.diagnostics.hasStandardSuffix).toBe(true);
  });

  it('reports missing client ID when neither variable is configured', () => {
    const env = createMockEnv({ GOOGLE_OAUTH_CLIENT_ID: '' as any });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.clientId).toBe('');
    expect(creds.diagnostics.clientIdConfigured).toBe(false);
  });

  it('falls back to request origin for redirect URI when unconfigured', () => {
    const env = createMockEnv({ GOOGLE_OAUTH_REDIRECT_URI: '' as any });
    const creds = resolveGoogleOAuthCredentials(
      env,
      'https://builly.indyshares.com/api/google/oauth/start'
    );
    expect(creds.redirectUri).toBe('https://builly.indyshares.com/api/google/oauth/callback');
    expect(creds.diagnostics.redirectUriValid).toBe(true);
  });
});

describe('Google OAuth runtime configuration validation', () => {
  it('accepts a complete Worker runtime configuration', () => {
    const result = validateGoogleOAuthConfig(resolveGoogleOAuthCredentials(createMockEnv()));
    expect(result.ok).toBe(true);
    expect(result.codes).toEqual([]);
  });

  it('reports missing client ID and client secret together without exposing values', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID: '' as any,
      GOOGLE_OAUTH_CLIENT_SECRET: '' as any,
    });
    const result = validateGoogleOAuthConfig(resolveGoogleOAuthCredentials(env));
    expect(result.codes).toEqual(['MISSING_GOOGLE_CLIENT_ID', 'MISSING_GOOGLE_CLIENT_SECRET']);
    expect(result.message).toContain('GOOGLE_OAUTH_CLIENT_ID');
    expect(result.message).toContain('GOOGLE_OAUTH_CLIENT_SECRET');
    expect(result.message).not.toContain('test-secret');
  });

  it('reports only the missing client secret when the client ID is configured', () => {
    const env = createMockEnv({ GOOGLE_OAUTH_CLIENT_SECRET: '' as any });
    const result = validateGoogleOAuthConfig(resolveGoogleOAuthCredentials(env));
    expect(result.codes).toEqual(['MISSING_GOOGLE_CLIENT_SECRET']);
  });

  it('rejects a redirect URI with the wrong callback path', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/wrong/callback',
    });
    const result = validateGoogleOAuthConfig(resolveGoogleOAuthCredentials(env));
    expect(result.codes).toEqual(['INVALID_GOOGLE_OAUTH_REDIRECT_URI']);
  });

  it('rejects a plaintext HTTP redirect URI on a remote host', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_REDIRECT_URI: 'http://example.com/api/google/oauth/callback',
    });
    const result = validateGoogleOAuthConfig(resolveGoogleOAuthCredentials(env));
    expect(result.codes).toEqual(['INVALID_GOOGLE_OAUTH_REDIRECT_URI']);
  });

  it('treats a VITE-only client ID as a wrong-environment configuration error', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID: '' as any,
      ...( { VITE_GOOGLE_OAUTH_CLIENT_ID: 'ignored.apps.googleusercontent.com' } as any),
    });
    const result = validateGoogleOAuthConfig(resolveGoogleOAuthCredentials(env));
    expect(result.codes).toEqual(['MISSING_GOOGLE_CLIENT_ID']);
  });
});
