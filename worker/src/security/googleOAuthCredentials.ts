import { WorkerEnv } from '../types';

export interface SafeDiagnostics {
  clientIdConfigured: boolean;
  clientIdSource: 'GOOGLE_OAUTH_CLIENT_ID' | 'VITE_GOOGLE_OAUTH_CLIENT_ID' | 'NONE';
  clientIdFingerprint: string;
  clientIdLength: number;
  hasQuotes: boolean;
  hasWhitespace: boolean;
  hasStandardSuffix: boolean;
  rawCandidateFound: boolean;
  redirectUriConfigured: boolean;
  redirectUri: string;
  clientSecretConfigured: boolean;
  scopesConfigured: boolean;
  scopes: string;
}

export interface ResolvedGoogleCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  source: 'GOOGLE_OAUTH_CLIENT_ID' | 'VITE_GOOGLE_OAUTH_CLIENT_ID' | 'NONE';
  diagnostics: SafeDiagnostics;
}

function cleanString(val: unknown): string {
  if (typeof val !== 'string') return '';
  let str = val.trim();
  while (
    (str.startsWith('"') && str.endsWith('"') && str.length >= 2) ||
    (str.startsWith("'") && str.endsWith("'") && str.length >= 2)
  ) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

function isValidCandidate(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const cleaned = cleanString(val);
  return cleaned.length > 0 && cleaned !== 'undefined' && cleaned !== 'null';
}

/**
 * Creates a safe, non-sensitive fingerprint of a Google OAuth Client ID for comparison.
 * Never exposes the complete internal hash; displays project number prefix, length, and domain.
 */
export function createSafeClientFingerprint(raw: string): string {
  const cleaned = cleanString(raw);
  if (!cleaned) return '(empty)';
  if (cleaned === 'undefined') return 'literal string "undefined"';

  const suffixIndex = cleaned.toLowerCase().indexOf('.apps.googleusercontent.com');
  if (suffixIndex !== -1) {
    const beforeDomain = cleaned.slice(0, suffixIndex);
    const parts = beforeDomain.split('-');
    const projectNum = parts[0] || '';
    const hash = parts.slice(1).join('-');
    const prefix = projectNum.slice(0, 6);
    const hashEnd = hash.slice(-4);
    return `${prefix}...${hashEnd}.apps.googleusercontent.com (len ${cleaned.length})`;
  }

  // Missing standard .apps.googleusercontent.com suffix
  const prefix = cleaned.slice(0, 6);
  const end = cleaned.slice(-4);
  return `${prefix}...${end} (len ${cleaned.length}, MISSING .apps.googleusercontent.com suffix)`;
}

/**
 * Centrally resolves Google OAuth credentials and parameters for the Worker runtime.
 * - Prioritizes GOOGLE_OAUTH_CLIENT_ID with fallback to VITE_GOOGLE_OAUTH_CLIENT_ID.
 * - Strips accidental surrounding quotes and whitespace from dashboard inputs.
 * - Normalizes missing .apps.googleusercontent.com suffixes when a valid prefix was provided.
 * - Guarantees non-empty redirectUri with fallback to request origin.
 * - Generates privacy-preserving safe diagnostics for verification.
 */
export function resolveGoogleOAuthCredentials(
  env: WorkerEnv,
  requestUrl?: string
): ResolvedGoogleCredentials {
  const envMap = env as unknown as Record<string, string | undefined>;
  const rawPrimary = env.GOOGLE_OAUTH_CLIENT_ID;
  const rawVite = envMap.VITE_GOOGLE_OAUTH_CLIENT_ID;

  let chosenRaw = '';
  let source: 'GOOGLE_OAUTH_CLIENT_ID' | 'VITE_GOOGLE_OAUTH_CLIENT_ID' | 'NONE' = 'NONE';

  if (isValidCandidate(rawPrimary)) {
    chosenRaw = rawPrimary;
    source = 'GOOGLE_OAUTH_CLIENT_ID';
  } else if (isValidCandidate(rawVite)) {
    chosenRaw = rawVite;
    source = 'VITE_GOOGLE_OAUTH_CLIENT_ID';
  }

  const rawTrimmed = typeof chosenRaw === 'string' ? chosenRaw.trim() : '';
  const hasQuotes =
    rawTrimmed.length >= 2 &&
    ((rawTrimmed.startsWith('"') && rawTrimmed.endsWith('"')) ||
      (rawTrimmed.startsWith("'") && rawTrimmed.endsWith("'")));
  const hasWhitespace = typeof chosenRaw === 'string' && /^\s|\s$/.test(chosenRaw);

  let cleanedClientId = cleanString(chosenRaw);
  const rawCandidateFound = cleanedClientId.length > 0 && cleanedClientId !== 'undefined';

  // Normalize: if user entered the client ID without .apps.googleusercontent.com
  let hasStandardSuffix = cleanedClientId.toLowerCase().endsWith('.apps.googleusercontent.com');
  if (rawCandidateFound && !hasStandardSuffix && /^\d+-[a-z0-9_]+$/i.test(cleanedClientId)) {
    cleanedClientId = `${cleanedClientId}.apps.googleusercontent.com`;
    hasStandardSuffix = true;
  }

  // Redirect URI resolution
  let cleanedRedirectUri = cleanString(env.GOOGLE_OAUTH_REDIRECT_URI);
  if (!cleanedRedirectUri && requestUrl) {
    try {
      const parsed = new URL(requestUrl);
      cleanedRedirectUri = `${parsed.origin}/api/google/oauth/callback`;
    } catch {
      // ignore
    }
  }
  if (!cleanedRedirectUri) {
    cleanedRedirectUri = 'https://builly.indyshares.com/api/google/oauth/callback';
  }

  // Client Secret resolution
  const cleanedClientSecret = cleanString(env.GOOGLE_OAUTH_CLIENT_SECRET);

  // Scopes resolution
  const rawScopes = env.GOOGLE_WORKSPACE_SCOPES || envMap.VITE_GOOGLE_WORKSPACE_SCOPES;
  const cleanedScopes =
    cleanString(rawScopes) ||
    'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';

  const diagnostics: SafeDiagnostics = {
    clientIdConfigured: Boolean(cleanedClientId && cleanedClientId !== 'undefined'),
    clientIdSource: source,
    clientIdFingerprint: createSafeClientFingerprint(chosenRaw),
    clientIdLength: cleanedClientId.length,
    hasQuotes,
    hasWhitespace,
    hasStandardSuffix,
    rawCandidateFound,
    redirectUriConfigured: Boolean(
      env.GOOGLE_OAUTH_REDIRECT_URI && cleanString(env.GOOGLE_OAUTH_REDIRECT_URI)
    ),
    redirectUri: cleanedRedirectUri,
    clientSecretConfigured: Boolean(cleanedClientSecret),
    scopesConfigured: Boolean(rawScopes && cleanString(rawScopes)),
    scopes: cleanedScopes,
  };

  return {
    clientId: cleanedClientId === 'undefined' ? '' : cleanedClientId,
    clientSecret: cleanedClientSecret,
    redirectUri: cleanedRedirectUri,
    scopes: cleanedScopes,
    source,
    diagnostics,
  };
}
