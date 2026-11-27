import { describe, expect, it } from 'vitest';
import {
  GOOGLE_IDENTITY_SCOPES,
  GOOGLE_LOGIN_SCOPES,
  GOOGLE_WORKSPACE_SCOPES,
  GOOGLE_WORKSPACE_SCOPES_STRING,
} from '../config/googleScopes';
import { resolveGoogleOAuthCredentials, validateGoogleOAuthConfig } from '../security/googleOAuthCredentials';

describe('centralized Google OAuth scopes', () => {
  it('includes the approved full Drive scope and retained scopes exactly once', () => {
    expect(GOOGLE_WORKSPACE_SCOPES).toContain('https://www.googleapis.com/auth/drive');
    expect(GOOGLE_WORKSPACE_SCOPES).toContain('https://www.googleapis.com/auth/spreadsheets');
    expect(GOOGLE_WORKSPACE_SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(GOOGLE_WORKSPACE_SCOPES).toContain('https://www.googleapis.com/auth/drive.metadata.readonly');
    expect(new Set(GOOGLE_WORKSPACE_SCOPES).size).toBe(GOOGLE_WORKSPACE_SCOPES.length);
  });

  it('keeps identity scopes separate from workspace scopes', () => {
    expect(GOOGLE_IDENTITY_SCOPES).toEqual(['openid', 'email', 'profile']);
    expect(GOOGLE_LOGIN_SCOPES).toEqual([...GOOGLE_IDENTITY_SCOPES, ...GOOGLE_WORKSPACE_SCOPES]);
  });

  it('uses the centralized list as the resolver fallback', () => {
    const creds = resolveGoogleOAuthCredentials({
      DB: {} as any,
      GOOGLE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/api/auth/google/callback',
      GOOGLE_WORKSPACE_SCOPES: '' as any,
      TOKEN_ENCRYPTION_KEY: 'test',
    });
    expect(creds.scopes).toBe(GOOGLE_WORKSPACE_SCOPES_STRING);
    expect(validateGoogleOAuthConfig(creds).ok).toBe(true);
  });

  it('preserves a configured scope set instead of replacing it', () => {
    const configured = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
    const creds = resolveGoogleOAuthCredentials({
      DB: {} as any,
      GOOGLE_OAUTH_CLIENT_ID: 'client.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://builly.indyshares.com/api/auth/google/callback',
      GOOGLE_WORKSPACE_SCOPES: configured,
      TOKEN_ENCRYPTION_KEY: 'test',
    });
    expect(creds.scopes).toBe(configured);
  });
});
