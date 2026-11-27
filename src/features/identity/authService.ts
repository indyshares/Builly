import {
  BuillyAccount,
  fetchBuillySession,
  signOutBuilly,
  startGoogleLogin,
} from './buillySessionClient';

export interface BuillyOwnerIdentity {
  ownerId: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: 'google';
}

const RETURN_TO_KEY = 'builly_auth_return_to_v1';
const RETURN_TO_TTL_MS = 15 * 60 * 1000;

type StoredReturnTo = { value: string; expiresAt: number };

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  return window.self !== window.top;
}

export function deriveOwnerFromAccount(account: BuillyAccount): BuillyOwnerIdentity {
  return {
    ownerId: account.id,
    email: account.email,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
    provider: 'google',
  };
}

export function savePendingReturnTo(returnTo: string): void {
  if (typeof window === 'undefined') return;
  const payload: StoredReturnTo = {
    value: returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/console',
    expiresAt: Date.now() + RETURN_TO_TTL_MS,
  };
  try {
    window.localStorage.setItem(RETURN_TO_KEY, JSON.stringify(payload));
  } catch {
    try {
      window.sessionStorage.setItem(RETURN_TO_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures; the default return path is used.
    }
  }
}

export function peekPendingReturnTo(): string | null {
  if (typeof window === 'undefined') return '/console';
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = storage.getItem(RETURN_TO_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredReturnTo;
      if (parsed.expiresAt > Date.now() && parsed.value.startsWith('/')) return parsed.value;
      storage.removeItem(RETURN_TO_KEY);
    } catch {
      // Ignore malformed entries.
    }
  }
  return '/console';
}

export function consumePendingReturnTo(): string {
  const value = peekPendingReturnTo();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(RETURN_TO_KEY);
      window.sessionStorage.removeItem(RETURN_TO_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
  return value || '/console';
}

export function scrubAuthCallbackUrlParams(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ['code', 'state', 'error', 'error_description', 'auth_error', 'workspace_error']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  invalid_state: 'Invalid Google sign-in response. Please try again.',
  missing_code: 'Google did not return an authorization code. Please try again.',
  token_exchange_failed: 'Could not complete Google sign-in. Please try again.',
  invalid_identity: 'Google identity verification failed. Please try again.',
  session_expired: 'Your session expired. Please sign in again.',
};

export function formatAuthCallbackError(raw: string): string {
  if (AUTH_ERROR_MESSAGES[raw]) return AUTH_ERROR_MESSAGES[raw];
  if (raw.includes('verifier') || raw.toLowerCase().includes('storage')) {
    return 'The sign-in session could not be restored. Please start again from Builly.';
  }
  return raw;
}

/** Starts the direct Worker → Google Authorization Code flow. */
export async function signInWithGoogleIdentity(returnTo = '/console'): Promise<void> {
  savePendingReturnTo(returnTo);
  startGoogleLogin(returnTo);
}

/**
 * Reads callback status set by the Worker and loads the Builly session.
 * The Worker handles the code exchange, ID token verification and cookie issuance.
 */
export async function completeAuthCallback(): Promise<{
  session: { user: { id: string; email?: string } } | null;
  error?: string;
}> {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const oauthError = params.get('auth_error') || params.get('error_description') || params.get('error');
  if (oauthError) {
    scrubAuthCallbackUrlParams();
    return { session: null, error: formatAuthCallbackError(oauthError) };
  }

  try {
    const state = await fetchBuillySession();
    scrubAuthCallbackUrlParams();
    if (!state.authenticated || !state.ownerId) {
      return { session: null, error: 'session_expired' };
    }
    return { session: { user: { id: state.ownerId, email: state.account?.email } } };
  } catch {
    return { session: null, error: 'Unable to load Builly session.' };
  }
}

/** Ends only the Builly session; the Google Workspace grant is managed separately. */
export async function signOutBuillyIdentity(): Promise<void> {
  await signOutBuilly();
}
