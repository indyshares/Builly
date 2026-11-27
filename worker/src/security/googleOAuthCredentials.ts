import { GOOGLE_WORKSPACE_SCOPES_STRING } from '../config/googleScopes';
import { WorkerEnv } from '../types';

export type GoogleOAuthConfigCode =
  | 'MISSING_GOOGLE_CLIENT_ID'
  | 'INVALID_GOOGLE_CLIENT_ID'
  | 'MISSING_GOOGLE_CLIENT_SECRET'
  | 'INVALID_GOOGLE_OAUTH_REDIRECT_URI'
  | 'MISSING_GOOGLE_WORKSPACE_SCOPES';

export interface GoogleOAuthConfigValidation {
  ok: boolean;
  codes: GoogleOAuthConfigCode[];
  message: string;
}

export interface SafeDiagnostics {
  clientIdConfigured: boolean;
  clientIdSource: 'GOOGLE_OAUTH_CLIENT_ID' | 'NONE';
  clientIdFingerprint: string;
  clientIdLength: number;
  clientIdFormatValid: boolean;
  hasQuotes: boolean;
  hasWhitespace: boolean;
  hasStandardSuffix: boolean;
  rawCandidateFound: boolean;
  redirectUriConfigured: boolean;
  redirectUriValid: boolean;
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
  source: 'GOOGLE_OAUTH_CLIENT_ID' | 'NONE';
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

function isValidRedirectUri(value: string): boolean {
  try {
    const parsed = new URL(value);
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname.toLowerCase());
    return (
      (parsed.protocol === 'https:' || isLocalHttp) &&
      ['/api/auth/google/callback', '/api/google/oauth/callback'].includes(parsed.pathname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
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
 * Resolves Google OAuth credentials exclusively from Worker runtime bindings.
 * VITE_* values are frontend build-time variables and are deliberately not accepted here.
 * - Strips accidental surrounding quotes and whitespace from dashboard inputs.
 * - Normalizes missing .apps.googleusercontent.com suffixes when a valid prefix was provided.
 * - Guarantees non-empty redirectUri with fallback to the request origin.
 * - Generates privacy-preserving safe diagnostics for verification.
 */
export function resolveGoogleOAuthCredentials(
  env: WorkerEnv,
  requestUrl?: string
): ResolvedGoogleCredentials {
  const rawPrimary = env.GOOGLE_OAUTH_CLIENT_ID;
  const chosenRaw = isValidCandidate(rawPrimary) ? rawPrimary : '';
  const source: 'GOOGLE_OAUTH_CLIENT_ID' | 'NONE' = chosenRaw ? 'GOOGLE_OAUTH_CLIENT_ID' : 'NONE';

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
  const clientIdFormatValid = Boolean(cleanedClientId && hasStandardSuffix);

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

  // Client Secret resolution (Worker Secret only)
  const cleanedClientSecret = cleanString(env.GOOGLE_OAUTH_CLIENT_SECRET);

  // Scopes resolution
  const cleanedScopes = cleanString(env.GOOGLE_WORKSPACE_SCOPES) || GOOGLE_WORKSPACE_SCOPES_STRING;

  const diagnostics: SafeDiagnostics = {
    clientIdConfigured: Boolean(cleanedClientId && cleanedClientId !== 'undefined'),
    clientIdSource: source,
    clientIdFingerprint: createSafeClientFingerprint(chosenRaw),
    clientIdLength: cleanedClientId.length,
    clientIdFormatValid,
    hasQuotes,
    hasWhitespace,
    hasStandardSuffix,
    rawCandidateFound,
    redirectUriConfigured: Boolean(
      env.GOOGLE_OAUTH_REDIRECT_URI && cleanString(env.GOOGLE_OAUTH_REDIRECT_URI)
    ),
    redirectUriValid: isValidRedirectUri(cleanedRedirectUri),
    redirectUri: cleanedRedirectUri,
    clientSecretConfigured: Boolean(cleanedClientSecret),
    scopesConfigured: Boolean(cleanString(env.GOOGLE_WORKSPACE_SCOPES)),
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

/**
 * Validates all Worker-side OAuth configuration at once so the start endpoint reports
 * every missing or invalid binding. Messages contain variable names only — never values.
 */
export function validateGoogleOAuthConfig(
  creds: ResolvedGoogleCredentials
): GoogleOAuthConfigValidation {
  const codes: GoogleOAuthConfigCode[] = [];

  if (!creds.clientId) {
    codes.push('MISSING_GOOGLE_CLIENT_ID');
  } else if (!creds.diagnostics.clientIdFormatValid) {
    codes.push('INVALID_GOOGLE_CLIENT_ID');
  }
  if (!creds.clientSecret) {
    codes.push('MISSING_GOOGLE_CLIENT_SECRET');
  }
  if (!creds.diagnostics.redirectUriValid) {
    codes.push('INVALID_GOOGLE_OAUTH_REDIRECT_URI');
  }
  if (!creds.scopes) {
    codes.push('MISSING_GOOGLE_WORKSPACE_SCOPES');
  }

  const messages: Record<GoogleOAuthConfigCode, string> = {
    MISSING_GOOGLE_CLIENT_ID:
      'Google OAuth Client ID is not configured on Cloudflare Worker. Set the GOOGLE_OAUTH_CLIENT_ID secret on Worker builly-project.',
    INVALID_GOOGLE_CLIENT_ID:
      'Google OAuth Client ID is malformed. Set a valid Google OAuth Web Client ID in GOOGLE_OAUTH_CLIENT_ID on Worker builly-project.',
    MISSING_GOOGLE_CLIENT_SECRET:
      'Google OAuth Client Secret is not configured on Cloudflare Worker. Set the GOOGLE_OAUTH_CLIENT_SECRET secret on Worker builly-project.',
    INVALID_GOOGLE_OAUTH_REDIRECT_URI:
      'Google OAuth redirect URI is invalid. Set GOOGLE_OAUTH_REDIRECT_URI to an HTTPS URL ending in /api/auth/google/callback.',
    MISSING_GOOGLE_WORKSPACE_SCOPES:
      'Google Workspace scopes are not configured on Cloudflare Worker. Set GOOGLE_WORKSPACE_SCOPES on Worker builly-project.',
  };

  return {
    ok: codes.length === 0,
    codes,
    message: codes.map((code) => messages[code]).join(' '),
  };
}
