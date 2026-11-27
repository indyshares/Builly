import {
  cleanupExpiredOAuthTransactions,
  createBuillySession,
  createD1AuthStore,
  hashSessionToken,
  linkGoogleIdentity,
  revokeBuillySession,
} from '../services/buillyAuth';
import { saveEncryptedWorkspaceCredential } from '../services/googleTokenVault';
import {
  resolveGoogleOAuthCredentials,
  validateGoogleOAuthConfig,
} from '../security/googleOAuthCredentials';
import { handleGoogleOAuthStart } from './googleOAuth';
import { generateHighEntropyToken, sha256Base64Url } from '../security/oauthState';
import { verifyGoogleIdToken } from '../security/googleIdToken';
import {
  BUILLY_SESSION_COOKIE,
  readSessionCookie,
  requireSession,
} from '../middleware/requireSession';
import { WorkerEnv } from '../types';

const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

function storeFor(env: WorkerEnv) {
  return env.AUTH_STORE || createD1AuthStore(env.DB);
}

function sanitizeReturnTo(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')
    ? raw
    : '/console';
}

function redirectTo(origin: string, path: string, params: Record<string, string> = {}): Response {
  const target = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}

function sessionCookie(token: string, secure: boolean): string {
  // Production is same-origin: no third-party cookie, no cross-site CORS.
  return `${BUILLY_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function clearedSessionCookie(secure: boolean): string {
  return `${BUILLY_SESSION_COOKIE}=; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SAFE_FRONTEND_ORIGIN = 'https://builly.indyshares.com';
const OAUTH_BINDING_COOKIE = 'builly_oauth_binding';

function configuredFrontendOrigins(env: WorkerEnv): Set<string> {
  return new Set(
    (env.ALLOWED_FRONTEND_ORIGINS || '')
      .split(',')
      .map((value) => value.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .concat(SAFE_FRONTEND_ORIGIN)
  );
}

/** Exact allowlist match only. Never uses raw Origin or suffix matching as a redirect target. */
export function resolveFrontendOrigin(request: Request, env: WorkerEnv): string | null {
  const raw = (request.headers.get('Origin') || '').trim().replace(/\/+$/, '');
  if (raw === 'null') return null;
  if (!raw) return SAFE_FRONTEND_ORIGIN;
  return configuredFrontendOrigins(env).has(raw) ? raw : null;
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('=')) || null;
  }
  return null;
}

function bindingCookie(value: string, secure: boolean): string {
  return `${OAUTH_BINDING_COOKIE}=${encodeURIComponent(value)}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=600`;
}

function clearedBindingCookie(secure: boolean): string {
  return `${OAUTH_BINDING_COOKIE}=; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`;
}

export async function handleAuthGoogleStart(request: Request, env: WorkerEnv): Promise<Response> {
  const origin = resolveFrontendOrigin(request, env);
  if (!origin) {
    return Response.json({ error: 'Unrecognized frontend origin.', code: 'INVALID_ORIGIN' }, { status: 400 });
  }
  const creds = resolveGoogleOAuthCredentials(env, request.url);
  const validation = validateGoogleOAuthConfig(creds);
  if (!validation.ok) {
    return Response.json(
      { error: validation.message, code: validation.codes[0], codes: validation.codes },
      { status: 500 }
    );
  }
  if (new URL(creds.redirectUri).pathname !== '/api/auth/google/callback') {
    return Response.json(
      {
        error: 'GOOGLE_OAUTH_REDIRECT_URI must point to /api/auth/google/callback.',
        code: 'INVALID_GOOGLE_OAUTH_REDIRECT_URI',
      },
      { status: 500 }
    );
  }

  await cleanupExpiredOAuthTransactions(storeFor(env));
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get('returnTo'));
  const state = generateHighEntropyToken(32);
  const bindingSecret = generateHighEntropyToken(32);
  const browserBindingHash = await hashSessionToken(bindingSecret);
  const nonce = generateHighEntropyToken(32);
  const codeVerifier = generateHighEntropyToken(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const redirectUri = creds.redirectUri;

  await storeFor(env).insertOAuthTransaction({
    stateHash: await sha256Base64Url(state),
    browserBindingHash,
    nonce,
    codeVerifier,
    redirectUri,
    returnTo,
    frontendOrigin: origin,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000,
    consumedAt: null,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', creds.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', `openid email profile ${creds.scopes}`.trim());
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('nonce', nonce);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', 'select_account');

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': bindingCookie(bindingSecret, new URL(request.url).protocol === 'https:'),
    },
  });
}

export async function handleAuthGoogleCallback(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const transaction = state
    ? await storeFor(env).consumeOAuthTransaction(await sha256Base64Url(state), Date.now())
    : null;

  const secure = new URL(request.url).protocol === 'https:';
  const fail = (code: string) => {
    const response = redirectTo(
      transaction?.frontendOrigin || SAFE_FRONTEND_ORIGIN,
      transaction?.returnTo || '/console',
      { auth_error: code }
    );
    response.headers.append('Set-Cookie', clearedBindingCookie(secure));
    return response;
  };

  if (!transaction) return fail('invalid_state');
  const binding = readCookie(request, OAUTH_BINDING_COOKIE);
  if (
    !binding ||
    !constantTimeEqual(await hashSessionToken(binding), transaction.browserBindingHash)
  ) {
    return fail('invalid_binding');
  }
  if (url.searchParams.get('error')) return fail(url.searchParams.get('error') || 'oauth_denied');

  const code = url.searchParams.get('code');
  if (!code) return fail('missing_code');

  const creds = resolveGoogleOAuthCredentials(env, request.url);
  if (!validateGoogleOAuthConfig(creds).ok) return fail('server_misconfigured');

  let tokens: {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        code_verifier: transaction.codeVerifier,
        redirect_uri: transaction.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    tokens = (await tokenRes.json()) as typeof tokens;
    if (!tokenRes.ok || !tokens.id_token || !tokens.access_token) return fail('token_exchange_failed');
  } catch {
    return fail('token_exchange_failed');
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(
      tokens.id_token!,
      creds.clientId,
      transaction.nonce
    );
  } catch {
    return fail('invalid_identity');
  }

  const account = await linkGoogleIdentity(storeFor(env), identity);
  const previous = readSessionCookie(request);
  if (previous) await revokeBuillySession(storeFor(env), previous).catch(() => undefined);
  const session = await createBuillySession(storeFor(env), account.id, {
    userAgent: request.headers.get('User-Agent') || '',
  });

  let workspaceError = '';
  if (tokens.refresh_token) {
    try {
      await saveEncryptedWorkspaceCredential(env, {
        ownerId: account.id,
        googleSubject: '',
        googleOidcSub: identity.subject,
        googleEmail: identity.email,
        googleName: identity.displayName || identity.email || 'Connected Google Account',
        googleAvatar: identity.avatarUrl || '',
        grantedScopes: (env.GOOGLE_WORKSPACE_SCOPES || '').split(/\s+/).filter(Boolean),
        refreshToken: tokens.refresh_token,
      });
    } catch {
      workspaceError = 'workspace_credential_failed';
    }
  } else {
    workspaceError = 'workspace_refresh_token_missing';
  }

  const response = redirectTo(transaction.frontendOrigin, transaction.returnTo, {
    ...(workspaceError ? { workspace_error: workspaceError } : {}),
  });
  response.headers.append('Set-Cookie', sessionCookie(session.token, secure));
  response.headers.append('Set-Cookie', clearedBindingCookie(secure));
  return response;
}

export async function handleAuthSession(request: Request, env: WorkerEnv): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) {
    return Response.json({ authenticated: false }, { status: 401 });
  }
  const account = await storeFor(env).getAccount(session.ownerId);
  return Response.json({
    authenticated: true,
    ownerId: session.ownerId,
    account: account
      ? {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl,
          status: account.status,
        }
      : null,
  });
}

export async function handleAuthLogout(request: Request, env: WorkerEnv): Promise<Response> {
  const token = readSessionCookie(request);
  if (token) await revokeBuillySession(storeFor(env), token).catch(() => undefined);
  const response = Response.json({ ok: true });
  response.headers.append('Set-Cookie', clearedSessionCookie(new URL(request.url).protocol === 'https:'));
  return response;
}

export async function handleAuthGoogleReconnect(request: Request, env: WorkerEnv): Promise<Response> {
  const { errorResponse } = await requireSession(request, env);
  if (errorResponse) return errorResponse;
  const origin = request.headers.get('Origin') || new URL(request.url).origin;
  const reconnectRequest = new Request(
    `${new URL(request.url).origin}/api/google/oauth/start?returnTo=${encodeURIComponent('/console')}`,
    {
      method: 'POST',
      headers: {
        Cookie: request.headers.get('Cookie') || '',
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ returnTo: '/console' }),
    }
  );
  return handleGoogleOAuthStart(reconnectRequest, env);
}
