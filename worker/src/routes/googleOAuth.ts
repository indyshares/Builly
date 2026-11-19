import { requireSession } from '../middleware/requireSession';
import {
  resolveGoogleOAuthCredentials,
  SafeDiagnostics,
} from '../security/googleOAuthCredentials';
import { consumeOAuthStateRecord, createOAuthStateRecord } from '../security/oauthState';
import {
  getSafeWorkspaceStatus,
  revokeAndDeleteWorkspaceCredential,
  saveEncryptedWorkspaceCredential,
} from '../services/googleTokenVault';
import { WorkerEnv } from '../types';

function resolveAllowedOrigin(request: Request, env: WorkerEnv): string | null {
  const reqOrigin = (request.headers.get('Origin') || '').trim().replace(/\/+$/, '');
  const configuredAllowed = (env.ALLOWED_FRONTEND_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const defaultAllowed = [
    'https://builly-project.mycloudsfireworks.workers.dev',
    'https://builly.indyshares.com',
    'http://localhost:3000',
    'http://localhost:8787',
  ];

  const allowed = Array.from(new Set([...configuredAllowed, ...defaultAllowed]));

  const isDynamicAllowed =
    reqOrigin.endsWith('.run.app') ||
    reqOrigin.endsWith('.workers.dev') ||
    reqOrigin.endsWith('.indyshares.com') ||
    reqOrigin.startsWith('http://localhost:') ||
    reqOrigin.startsWith('http://127.0.0.1:');

  if (reqOrigin && (allowed.includes(reqOrigin) || isDynamicAllowed)) {
    return reqOrigin;
  }

  // Fallback for same-origin requests where browser might not send Origin
  try {
    const requestOrigin = new URL(request.url).origin.replace(/\/+$/, '');
    if (allowed.includes(requestOrigin) || requestOrigin.endsWith('.indyshares.com')) {
      return requestOrigin;
    }
  } catch {
    // ignore
  }

  return null;
}

function sanitizeInternalPath(raw?: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/workspace';
  }
  return raw;
}

export async function handleWorkspaceStatus(request: Request, env: WorkerEnv): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;
  const status = await getSafeWorkspaceStatus(env, session.ownerId);
  return Response.json(status);
}

/**
 * Public safe diagnostic endpoint for verifying Google OAuth configuration at runtime.
 * Never returns secrets, tokens, codes, or credentials.
 */
export function handleGoogleOAuthDiagnostics(request: Request, env: WorkerEnv): Response {
  const creds = resolveGoogleOAuthCredentials(env, request.url);
  return Response.json({
    ok: true,
    service: 'builly-workspace-worker',
    endpoint: '/api/google/oauth/diagnostics',
    diagnostics: creds.diagnostics,
  });
}

export async function handleGoogleOAuthStart(request: Request, env: WorkerEnv): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const creds = resolveGoogleOAuthCredentials(env, request.url);

  // Catch missing or invalid client_id before redirecting user to Google 401 error page
  if (!creds.clientId) {
    return Response.json(
      {
        error:
          'Google OAuth Client ID is not configured on Cloudflare Worker. Set GOOGLE_OAUTH_CLIENT_ID in Cloudflare secrets or variables.',
        code: 'MISSING_GOOGLE_CLIENT_ID',
        diagnostics: creds.diagnostics,
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    returnTo?: string;
    forceConsent?: boolean;
  };
  const frontendOrigin = resolveAllowedOrigin(request, env);
  if (!frontendOrigin) {
    return Response.json(
      { error: 'Allowed frontend origin is not configured.', code: 'INVALID_ORIGIN' },
      { status: 400 }
    );
  }

  const returnTo = sanitizeInternalPath(body.returnTo);
  const { rawState, codeChallenge } = await createOAuthStateRecord(env.DB, {
    ownerId: session.ownerId,
    returnTo,
    frontendOrigin,
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', creds.clientId);
  authUrl.searchParams.set('redirect_uri', creds.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', creds.scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', body.forceConsent ? 'consent select_account' : 'consent');
  authUrl.searchParams.set('state', rawState);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Privacy-preserving runtime audit log
  console.log(
    `[Google OAuth Start] Owner: ${session.ownerId.slice(0, 8)}... | Source: ${creds.source} | Fingerprint: ${creds.diagnostics.clientIdFingerprint} | RedirectURI: ${creds.redirectUri}`
  );

  return Response.json({
    authorizeUrl: authUrl.toString(),
    diagnostics: creds.diagnostics,
  });
}

export async function handleGoogleOAuthCallback(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const url = new URL(request.url);
  const rawState = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const oauthError = url.searchParams.get('error');

  const consumed = await consumeOAuthStateRecord(env.DB, rawState);
  if (!consumed) {
    return Response.json(
      { error: 'Invalid, expired, or already-used OAuth state.', code: 'INVALID_STATE' },
      { status: 400 }
    );
  }

  const redirectTarget = new URL(consumed.returnTo, consumed.frontendOrigin);

  if (oauthError || !code) {
    redirectTarget.searchParams.set('workspaceError', oauthError || 'consent_cancelled');
    return Response.redirect(redirectTarget.toString(), 302);
  }

  const creds = resolveGoogleOAuthCredentials(env, request.url);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: creds.redirectUri,
      grant_type: 'authorization_code',
      code,
      code_verifier: consumed.codeVerifier,
    }),
  });

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
    error?: string;
  };

  if (!tokenRes.ok || !tokens.access_token || !tokens.refresh_token) {
    redirectTarget.searchParams.set(
      'workspaceError',
      tokens.error || 'missing_refresh_token'
    );
    return Response.redirect(redirectTarget.toString(), 302);
  }

  const aboutRes = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId,photoLink)',
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );
  const aboutData = aboutRes.ok
    ? ((await aboutRes.json()) as {
        user?: {
          displayName?: string;
          emailAddress?: string;
          permissionId?: string;
          photoLink?: string;
        };
      })
    : {};
  const googleUser = aboutData.user || {};

  await saveEncryptedWorkspaceCredential(env, {
    ownerId: consumed.ownerId,
    googleSubject: googleUser.permissionId || googleUser.emailAddress || consumed.ownerId,
    googleEmail: googleUser.emailAddress || '',
    googleName: googleUser.displayName || googleUser.emailAddress || 'Connected Google Account',
    googleAvatar: googleUser.photoLink || '',
    grantedScopes: (tokens.scope || creds.scopes).split(/\s+/).filter(Boolean),
    refreshToken: tokens.refresh_token,
  });

  // Redirect back cleanly with NO tokens in URL or response
  redirectTarget.searchParams.set('workspace', 'connected');
  return Response.redirect(redirectTarget.toString(), 302);
}

export async function handleGoogleOAuthDisconnect(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;
  await revokeAndDeleteWorkspaceCredential(env, session.ownerId);
  return Response.json({ ok: true });
}

