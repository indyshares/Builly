import { describe, expect, it } from 'vitest';
import {
  createSafeClientFingerprint,
  resolveGoogleOAuthCredentials,
} from '../security/googleOAuthCredentials';
import { WorkerEnv } from '../types';

function createMockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: {} as any,
    SUPABASE_URL: 'https://test.supabase.co',
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
    expect(fp).not.toContain('6mdf7p75veer'); // Masks middle internal secret hash
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

  it('falls back to VITE_GOOGLE_OAUTH_CLIENT_ID when GOOGLE_OAUTH_CLIENT_ID is undefined or empty', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID: undefined as any,
      VITE_GOOGLE_OAUTH_CLIENT_ID:
        '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com',
    });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.source).toBe('VITE_GOOGLE_OAUTH_CLIENT_ID');
    expect(creds.clientId).toBe(
      '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com'
    );
    expect(creds.diagnostics.clientIdConfigured).toBe(true);
  });

  it('falls back to VITE_GOOGLE_OAUTH_CLIENT_ID when GOOGLE_OAUTH_CLIENT_ID is literal "undefined"', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID: 'undefined' as any,
      VITE_GOOGLE_OAUTH_CLIENT_ID:
        '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com',
    });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.source).toBe('VITE_GOOGLE_OAUTH_CLIENT_ID');
    expect(creds.clientId).toBe(
      '616978390438-6mdf7p75veerl1aqk2gimal5kpp7c9f8.apps.googleusercontent.com'
    );
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
    const env = createMockEnv({
      GOOGLE_OAUTH_CLIENT_ID: '' as any,
      VITE_GOOGLE_OAUTH_CLIENT_ID: undefined,
    });
    const creds = resolveGoogleOAuthCredentials(env);
    expect(creds.clientId).toBe('');
    expect(creds.diagnostics.clientIdConfigured).toBe(false);
  });

  it('falls back to request origin for redirect URI when unconfigured', () => {
    const env = createMockEnv({
      GOOGLE_OAUTH_REDIRECT_URI: '' as any,
    });
    const creds = resolveGoogleOAuthCredentials(
      env,
      'https://builly.indyshares.com/api/google/oauth/start'
    );
    expect(creds.redirectUri).toBe('https://builly.indyshares.com/api/google/oauth/callback');
  });
});
