/**
 * Verifies Google OpenID Connect ID tokens using Google's published signing keys.
 * No token payload is ever trusted before signature, issuer, audience, expiry and nonce checks pass.
 */

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const VALID_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;
const JWKS_MIN_REFRESH_INTERVAL_MS = 60 * 1000;

type GoogleJwk = JsonWebKey & { kid?: string };

interface GoogleIdentityClaims {
  iss?: string;
  aud?: string | string[];
  azp?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
  iat?: number;
  exp?: number;
}

export interface VerifiedGoogleIdentityClaims {
  provider: 'google';
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  avatarUrl?: string;
}

interface JwksCache {
  keys: Map<string, GoogleJwk>;
  fetchedAt: number;
  lastRefreshAt: number;
}

let jwksCache: JwksCache | null = null;
let inFlightRefresh: Promise<Map<string, GoogleJwk>> | null = null;

export function clearGoogleJwksCache(): void {
  jwksCache = null;
  inFlightRefresh = null;
}

/** Test seam: allows simulating a later refresh window without waiting real time. */
export function resetJwksRefreshWindowForTest(): void {
  if (jwksCache) jwksCache.lastRefreshAt = 0;
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fetchJwks(): Promise<Map<string, GoogleJwk>> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_CERTS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error('GOOGLE_JWKS_UNAVAILABLE');
  }
  if (!response.ok) throw new Error('GOOGLE_JWKS_UNAVAILABLE');
  const body = (await response.json()) as { keys?: GoogleJwk[] };
  const keys = new Map<string, GoogleJwk>();
  for (const key of body.keys || []) {
    if (key.kid) keys.set(key.kid, key);
  }
  const now = Date.now();
  jwksCache = { keys, fetchedAt: now, lastRefreshAt: now };
  return keys;
}

/** Concurrent callers share one refresh; refreshes are bounded to one per interval. */
async function refreshJwks(): Promise<Map<string, GoogleJwk>> {
  if (inFlightRefresh) return inFlightRefresh;
  const now = Date.now();
  if (jwksCache && now - jwksCache.lastRefreshAt < JWKS_MIN_REFRESH_INTERVAL_MS) {
    return jwksCache.keys;
  }
  inFlightRefresh = fetchJwks().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function getSigningKey(kid: string): Promise<GoogleJwk> {
  const now = Date.now();
  if (!jwksCache || now - jwksCache.fetchedAt > JWKS_TTL_MS) {
    await refreshJwks();
  }
  const cached = jwksCache?.keys.get(kid);
  if (cached) return cached;

  // Unknown kid: refresh at most once per bounded interval, then fail closed.
  const before = jwksCache?.lastRefreshAt ?? 0;
  const keys = await refreshJwks();
  if ((jwksCache?.lastRefreshAt ?? 0) > before) {
    const refreshed = keys.get(kid);
    if (refreshed) return refreshed;
  }
  throw new Error('UNKNOWN_GOOGLE_SIGNING_KEY');
}

/**
 * Verifies an ID token and returns the identity claims only after all checks pass.
 * Throws errors with stable codes; never includes the token value in errors or logs.
 */
export async function verifyGoogleIdToken(
  token: string,
  audience: string,
  nonce: string,
  now: number = Math.floor(Date.now() / 1000)
): Promise<VerifiedGoogleIdentityClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('INVALID_ID_TOKEN_FORMAT');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  let header: { alg?: string; kid?: string };
  let claims: GoogleIdentityClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader)));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as GoogleIdentityClaims;
  } catch {
    throw new Error('INVALID_ID_TOKEN_FORMAT');
  }

  if (header.alg !== 'RS256' || !header.kid) throw new Error('UNSUPPORTED_ID_TOKEN_ALG');

  const jwk = await getSigningKey(header.kid);
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signature = decodeBase64Url(encodedSignature);
  const signedData = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
  if (!valid) throw new Error('INVALID_ID_TOKEN_SIGNATURE');

  if (!claims.iss || !VALID_ISSUERS.has(claims.iss)) throw new Error('INVALID_ID_TOKEN_ISSUER');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) throw new Error('INVALID_ID_TOKEN_AUDIENCE');
  if (claims.azp && claims.azp !== audience) throw new Error('INVALID_ID_TOKEN_AZP');
  if (!claims.exp || claims.exp <= now) throw new Error('EXPIRED_ID_TOKEN');
  if (claims.iat && claims.iat > now + 60) throw new Error('ID_TOKEN_ISSUED_IN_FUTURE');
  if (!claims.nonce || claims.nonce !== nonce) throw new Error('INVALID_ID_TOKEN_NONCE');
  if (!claims.sub) throw new Error('INVALID_ID_TOKEN_SUBJECT');

  return {
    provider: 'google',
    subject: claims.sub,
    email: claims.email || '',
    emailVerified: Boolean(claims.email_verified),
    displayName: claims.name,
    avatarUrl: claims.picture,
  };
}
