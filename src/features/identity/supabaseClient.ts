import { createClient, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';
import { ENV_CONFIG } from '../../config/env';

let cachedClient: SupabaseClient | null = null;

/**
 * Safe browser storage adapter for Supabase Auth PKCE state and session tokens.
 * Uses localStorage so PKCE code verifiers survive top-level OAuth redirects reliably,
 * without throwing in restricted browser environments.
 */
function createSafeAuthStorage(): SupportedStorage | undefined {
  if (typeof window === 'undefined') return undefined;

  return {
    getItem(key: string): string | null {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string): void {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Ignore storage quota / restriction errors
      }
    },
    removeItem(key: string): void {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore storage restriction errors
      }
    },
  };
}

/**
 * Clears orphaned Supabase PKCE code verifier keys before initiating a fresh sign-in
 * or recovering from a stale callback. Never touches Builly Builder draft keys.
 */
export function clearStalePkceVerifiers(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token-code-verifier')) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Returns the configured Supabase Auth client (public URL + anon key ONLY).
 * Returns null if public Supabase environment variables are not configured —
 * never creates a fake or mock client.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!ENV_CONFIG.isSupabaseConfigured) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(ENV_CONFIG.supabaseUrl, ENV_CONFIG.supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: createSafeAuthStorage(),
      },
    });
  }
  return cachedClient;
}
