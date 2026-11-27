import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENV_CONFIG } from '../../config/env';
import {
  consumePendingReturnTo,
  formatAuthCallbackError,
  savePendingReturnTo,
  scrubAuthCallbackUrlParams,
} from '../identity/authService';

describe('Builly auth boundary invariants', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes no secret-like public configuration', () => {
    for (const key of Object.keys(ENV_CONFIG)) {
      expect(key.toLowerCase()).not.toContain('secret');
      expect(key.toLowerCase()).not.toContain('service_role');
      expect(key.toLowerCase()).not.toContain('encryption');
    }
  });

  it('maps Worker callback error codes to safe messages', () => {
    expect(formatAuthCallbackError('access_denied')).toBe('Google sign-in was cancelled.');
    expect(formatAuthCallbackError('invalid_state')).toContain('Invalid Google sign-in response');
    expect(formatAuthCallbackError('token_exchange_failed')).toContain('Could not complete Google sign-in');
    expect(formatAuthCallbackError('oauth_denied')).toBe('oauth_denied');
  });

  it('rejects unsafe return paths and consumes a safe pending return path', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
    vi.stubGlobal('window', {
      localStorage: storage,
      sessionStorage: storage,
      location: { href: 'https://builly.indyshares.com/login', search: '' },
      history: { replaceState: vi.fn() },
    });
    savePendingReturnTo('//evil.example');
    expect(consumePendingReturnTo()).toBe('/console');
    savePendingReturnTo('/console/projects');
    expect(consumePendingReturnTo()).toBe('/console/projects');
  });

  it('scrubs authorization codes and OAuth error params from the URL', () => {
    vi.stubGlobal('window', {
      location: { href: 'https://builly.indyshares.com/auth/callback?code=abc&state=xyz&auth_error=invalid_state' },
      history: { replaceState: vi.fn() },
    });
    scrubAuthCallbackUrlParams();
    expect(window.history.replaceState).toHaveBeenCalledWith({}, '', '/auth/callback');
  });
});
