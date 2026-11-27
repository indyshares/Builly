import type { AuthStore } from './services/buillyAuth';

export interface WorkerEnv {
  DB: D1Database;
  ASSETS?: Fetcher;
  WORKSPACE_LOCK?: DurableObjectNamespace;
  PUBLIC_ARTIFACTS?: R2Bucket;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  GOOGLE_WORKSPACE_SCOPES: string;
  TOKEN_ENCRYPTION_KEY: string;
  ALLOWED_FRONTEND_ORIGINS?: string;
  /** Test seam only; production always uses the D1 adapter. */
  AUTH_STORE?: AuthStore;
}

export interface VerifiedSession {
  ownerId: string;
  email: string;
  accountId?: string;
  sessionId?: string;
}

export interface StoredCredentialRow {
  owner_id: string;
  google_subject: string;
  google_oidc_sub: string;
  google_email: string;
  google_name: string;
  google_avatar: string;
  granted_scopes: string;
  encrypted_refresh_token: string;
  encryption_iv: string;
  status: string;
  created_at: string;
  updated_at: string;
}
