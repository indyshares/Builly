import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { ENV_CONFIG } from '../../config/env';
import { clearStalePkceVerifiers, getSupabaseClient } from './supabaseClient';
import { sanitizeReturnTo } from '../../utils/routes';

export interface BuillyOwnerIdentity {
  ownerId: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  provider: string;
  lastSignInAt?: string;
}

const RETURN_TO_STORAGE_KEY = 'builly_auth_return_to_v1';
const RETURN_TO_TTL_MS = 15 * 60 * 1000;

// Module-level lock preventing duplicate PKCE code exchange (e.g. React StrictMode double effects)
const inFlightCodeExchanges = new Map<
  string,
  Promise<{ session: Session | null; error?: string }>
>();

export function isEmbeddedIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function deriveOwnerFromSupabaseUser(user: User): BuillyOwnerIdentity {
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    user.email?.split('@')[0] ||
    'Builly Owner';
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    '';
  const provider =
    typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : 'google';

  return {
    ownerId: user.id,
    email: user.email || '',
    displayName: fullName,
    avatarUrl,
    provider,
    lastSignInAt: user.last_sign_in_at,
  };
}

export function savePendingReturnTo(path: string): void {
  if (typeof window === 'undefined') return;
  const safePath = sanitizeReturnTo(path, '/console');
  const payload = JSON.stringify({
    path: safePath,
    expiresAt: Date.now() + RETURN_TO_TTL_MS,
  });
  try {
    window.localStorage.setItem(RETURN_TO_STORAGE_KEY, payload);
  } catch {
    try {
      window.sessionStorage.setItem(RETURN_TO_STORAGE_KEY, payload);
    } catch {
      // Ignore storage restriction errors
    }
  }
}

export function peekPendingReturnTo(): string {
  if (typeof window === 'undefined') return '/console';
  try {
    const raw =
      window.localStorage.getItem(RETURN_TO_STORAGE_KEY) ??
      window.sessionStorage.getItem(RETURN_TO_STORAGE_KEY);
    if (!raw) return '/console';
    if (raw.startsWith('/')) {
      return sanitizeReturnTo(raw, '/console');
    }
    const parsed = JSON.parse(raw) as { path?: string; expiresAt?: number };
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      return '/console';
    }
    return sanitizeReturnTo(parsed.path, '/console');
  } catch {
    return '/console';
  }
}

export function consumePendingReturnTo(): string {
  const path = peekPendingReturnTo();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(RETURN_TO_STORAGE_KEY);
    } catch {
      // Ignore
    }
    try {
      window.sessionStorage.removeItem(RETURN_TO_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  return path;
}

function scrubAuthCallbackUrlParams(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const paramsToDelete = ['code', 'state', 'error', 'error_code', 'error_description'];
    let changed = false;
    for (const p of paramsToDelete) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    }
    if (changed) {
      const nextSearch = url.searchParams.toString();
      const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`;
      window.history.replaceState(null, '', nextUrl);
    }
  } catch {
    // Ignore history replaceState errors
  }
}

export function formatAuthCallbackError(rawError: string): string {
  const lower = rawError.toLowerCase();
  if (lower.includes('code verifier') || lower.includes('pkce')) {
    return (
      'PKCE verification could not be completed because the browser storage from the login start was unavailable on return ' +
      '(this commonly happens when signing in from an embedded preview frame, switching browsers/tabs, or clearing site storage). ' +
      'Please retry Google Sign-In directly in this browser tab.'
    );
  }
  return rawError;
}

/**
 * Initiates Google Sign-In strictly through Supabase Auth for Builly owner identity.
 * Intentionally requests NO Google Drive or Google Sheets scopes here.
 */
export async function signInWithGoogleIdentity(returnTo = '/console'): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable Google Sign-In.'
    );
  }

  // Ensure exact origin match between the browser tab holding the PKCE verifier and redirectTo
  const callbackOrigin =
    typeof window !== 'undefined' ? window.location.origin : ENV_CONFIG.appUrl;

  clearStalePkceVerifiers();
  savePendingReturnTo(returnTo);

  const redirectTo = `${callbackOrigin.replace(/\/+$/, '')}/auth/callback`;

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error) {
    throw new Error(error.message || 'Could not start Google Sign-In via Supabase Auth.');
  }
}

/**
 * Pure, testable PKCE callback handler:
 * 1. Always awaits client.auth.getSession() FIRST so Supabase's built-in detectSessionInUrl
 *    initializer completes without racing a duplicate exchangeCodeForSession call.
 * 2. Deduplicates explicit code exchange per authorization code so React StrictMode
 *    double-invocations never consume the verifier twice.
 */
export async function resolveAuthCallbackWithClient(
  client: Pick<SupabaseClient, 'auth'>,
  search: string
): Promise<{ session: Session | null; error?: string }> {
  const params = new URLSearchParams(search);
  const oauthError = params.get('error_description') || params.get('error');
  if (oauthError) {
    scrubAuthCallbackUrlParams();
    return { session: null, error: formatAuthCallbackError(oauthError) };
  }

  // First check session — in @supabase/supabase-js, getSession() awaits _initialize(),
  // which automatically exchanges ?code=... once when detectSessionInUrl: true.
  const { data: initialData, error: initialErr } = await client.auth.getSession();
  if (initialData.session) {
    scrubAuthCallbackUrlParams();
    return { session: initialData.session };
  }
  if (initialErr) {
    scrubAuthCallbackUrlParams();
    return { session: null, error: formatAuthCallbackError(initialErr.message) };
  }

  const code = params.get('code');
  if (!code) {
    return { session: null };
  }

  const existingPromise = inFlightCodeExchanges.get(code);
  if (existingPromise) {
    return existingPromise;
  }

  const exchangePromise = (async () => {
    try {
      // Double check getSession() right before exchange in case another listener just completed
      const { data: recheckData } = await client.auth.getSession();
      if (recheckData.session) {
        scrubAuthCallbackUrlParams();
        return { session: recheckData.session };
      }

      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) {
        return { session: null, error: formatAuthCallbackError(error.message) };
      }
      scrubAuthCallbackUrlParams();
      return { session: data.session };
    } finally {
      inFlightCodeExchanges.delete(code);
    }
  })();

  inFlightCodeExchanges.set(code, exchangePromise);
  return exchangePromise;
}

/**
 * Completes or restores an OAuth callback session on /auth/callback.
 */
export async function completeAuthCallback(): Promise<{
  session: Session | null;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      session: null,
      error:
        'Supabase Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    };
  }

  const search = typeof window !== 'undefined' ? window.location.search : '';
  return resolveAuthCallbackWithClient(client, search);
}

/**
 * Ends ONLY the Builly Supabase identity session.
 * Intentionally does NOT revoke any separate Google Workspace OAuth grant.
 */
export async function signOutBuillyIdentity(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) {
    throw new Error(error.message || 'Failed to sign out of Builly session.');
  }
}
