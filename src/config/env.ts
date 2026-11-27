import { CONSOLE_API_CONFIG } from './apiConfig';

// Scopes are supplied by VITE_GOOGLE_WORKSPACE_SCOPES at build time. The Worker's
// worker/src/config/googleScopes.ts is the authoritative list; no divergent frontend default.
function parseScopes(raw?: string): readonly string[] {
  if (!raw || !raw.trim()) {
    return [];
  }
  const parsed = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed;
}

function cleanPublicEnv(val?: string): string {
  return typeof val === 'string' ? val.trim() : '';
}

const env = import.meta.env;

export const ENV_CONFIG = {
  appUrl:
    cleanPublicEnv(env.VITE_APP_URL) ||
    (typeof window !== 'undefined' ? window.location.origin : ''),
  googleOAuthClientId: cleanPublicEnv(env.VITE_GOOGLE_OAUTH_CLIENT_ID),
  googleWorkspaceScopes: parseScopes(env.VITE_GOOGLE_WORKSPACE_SCOPES),
  driveFolderName: cleanPublicEnv(env.VITE_INDYSHARES_DRIVE_FOLDER_NAME) || 'Builly',
  schemaVersion: cleanPublicEnv(env.VITE_INDYSHARES_SCHEMA_VERSION) || '2.0',
  // Builly session APIs live on the same Worker origin as the Console API.
  consoleApiBaseUrl: CONSOLE_API_CONFIG.origin,
  workerApiUrl: CONSOLE_API_CONFIG.origin,
  isWorkerConfigured: CONSOLE_API_CONFIG.isConfigured,
  isAuthConfigured: CONSOLE_API_CONFIG.isConfigured,
  workerConfigError: CONSOLE_API_CONFIG.error?.message || null,
} as const;
