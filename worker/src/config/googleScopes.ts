/**
 * Single source of truth for Worker-side Google OAuth scopes.
 * `drive` is an approved Restricted Scope: Builly must read and update pre-existing
 * canonical files under My Drive/Builly that were not created by this OAuth client.
 */

export const GOOGLE_IDENTITY_SCOPES = ['openid', 'email', 'profile'] as const;

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const;

export const GOOGLE_LOGIN_SCOPES = [...GOOGLE_IDENTITY_SCOPES, ...GOOGLE_WORKSPACE_SCOPES] as const;

export const GOOGLE_WORKSPACE_SCOPES_STRING = GOOGLE_WORKSPACE_SCOPES.join(' ');
