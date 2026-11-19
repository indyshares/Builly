import { requireSession } from '../middleware/requireSession';
import { consumeOAuthStateRecord, createOAuthStateRecord } from '../security/oauthState';
import {
  getSafeWorkspaceStatus,
  revokeAndDeleteWorkspaceCredential,
  saveEncryptedWorkspaceCredential,
} from '../services/googleTokenVault';
import { WorkerEnv } from '../types';

function resolveAllowedOrigin(request: Request, env: WorkerEnv): string | null {
  const reqOrigin = (request.headers.get('Origin') || '').trim().replace(/\/+$/, '');
  const allowed = (env.ALLOWED_FRONTEND_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (allowed.length === 0 || !reqOrigin || !allowed.includes(reqOrigin)) {
    return null;
  }
  return reqOrigin;
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

export async function handleGoogleOAuthStart(request: Request, env: WorkerEnv): Promise<Response> {
  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

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
  authUrl.searchParams.set('client_id', env.GOOGLE_OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', env.GOOGLE_OAUTH_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', env.GOOGLE_WORKSPACE_SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('include_granted_scopes', 'true');
  authUrl.searchParams.set('prompt', body.forceConsent ? 'consent select_account' : 'consent');
  authUrl.searchParams.set('state', rawState);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return Response.json({ authorizeUrl: authUrl.toString() });
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

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
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
    grantedScopes: (tokens.scope || env.GOOGLE_WORKSPACE_SCOPES).split(/\s+/).filter(Boolean),
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
