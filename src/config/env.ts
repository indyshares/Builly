const DEFAULT_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
] as const;

function parseScopes(raw?: string): readonly string[] {
  if (!raw || !raw.trim()) {
    return DEFAULT_WORKSPACE_SCOPES;
  }
  const parsed = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_WORKSPACE_SCOPES;
}

function cleanPublicEnv(val?: string): string {
  return typeof val === 'string' ? val.trim() : '';
}

function isValidSupabaseUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('YOUR_PROJECT_REF')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isValidSupabaseAnonKey(key: string): boolean {
  if (!key) return false;
  if (key === 'YOUR_SUPABASE_ANON_KEY') return false;
  return key.length >= 20;
}

const env = import.meta.env;
const supabaseUrl = cleanPublicEnv(env.VITE_SUPABASE_URL);
const supabaseAnonKey = cleanPublicEnv(env.VITE_SUPABASE_ANON_KEY);
const workerApiUrl = cleanPublicEnv(env.VITE_WORKER_API_URL).replace(/\/+$/, '');

export const ENV_CONFIG = {
  appUrl:
    cleanPublicEnv(env.VITE_APP_URL) ||
    (typeof window !== 'undefined' ? window.location.origin : ''),
  googleOAuthClientId: cleanPublicEnv(env.VITE_GOOGLE_OAUTH_CLIENT_ID),
  googleWorkspaceScopes: parseScopes(env.VITE_GOOGLE_WORKSPACE_SCOPES),
  driveFolderName: cleanPublicEnv(env.VITE_INDYSHARES_DRIVE_FOLDER_NAME) || 'Builly',
  schemaVersion: cleanPublicEnv(env.VITE_INDYSHARES_SCHEMA_VERSION) || '2.0',
  // Public Supabase Auth configuration ONLY (never store service_role key in VITE_*)
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured: isValidSupabaseUrl(supabaseUrl) && isValidSupabaseAnonKey(supabaseAnonKey),
  // Cloudflare Worker API base URL (empty means same-origin /api/* or Worker not configured)
  workerApiUrl,
  isWorkerConfigured: workerApiUrl.length > 0,
} as const;
