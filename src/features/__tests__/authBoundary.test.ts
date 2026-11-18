import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../identity/supabaseClient';
import {
  formatAuthCallbackError,
  resolveAuthCallbackWithClient,
} from '../identity/authService';
import { ENV_CONFIG } from '../../config/env';

function createFakeSession(userId = 'owner-123'): Session {
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      app_metadata: { provider: 'google' },
      user_metadata: { full_name: 'Builly Owner' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
  } as Session;
}

describe('Auth & Workspace boundary invariants', () => {
  it('never exposes secrets in public ENV_CONFIG and returns null Supabase client when unconfigured', () => {
    const keys = Object.keys(ENV_CONFIG);
    for (const k of keys) {
      expect(k.toLowerCase()).not.toContain('secret');
      expect(k.toLowerCase()).not.toContain('service_role');
      expect(k.toLowerCase()).not.toContain('encryption');
    }

    if (!ENV_CONFIG.isSupabaseConfigured) {
      expect(getSupabaseClient()).toBeNull();
    }
  });

  it('does NOT call exchangeCodeForSession when getSession() already completed auto-PKCE exchange', async () => {
    const existingSession = createFakeSession();
    const exchangeSpy = vi.fn();
    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: existingSession },
          error: null,
        }),
        exchangeCodeForSession: exchangeSpy,
      },
    } as unknown as Pick<SupabaseClient, 'auth'>;

    const result = await resolveAuthCallbackWithClient(mockClient, '?code=pkce-code-1');
    expect(result.error).toBeUndefined();
    expect(result.session?.user.id).toBe('owner-123');
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent exchangeCodeForSession calls for the same authorization code', async () => {
    const exchangedSession = createFakeSession('owner-concurrent');
    const exchangeSpy = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ data: { session: exchangedSession, user: exchangedSession.user }, error: null }),
            15
          )
        )
    );
    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
        exchangeCodeForSession: exchangeSpy,
      },
    } as unknown as Pick<SupabaseClient, 'auth'>;

    const [r1, r2] = await Promise.all([
      resolveAuthCallbackWithClient(mockClient, '?code=shared-auth-code'),
      resolveAuthCallbackWithClient(mockClient, '?code=shared-auth-code'),
    ]);

    expect(exchangeSpy).toHaveBeenCalledTimes(1);
    expect(exchangeSpy).toHaveBeenCalledWith('shared-auth-code');
    expect(r1.session?.user.id).toBe('owner-concurrent');
    expect(r2.session?.user.id).toBe('owner-concurrent');
  });

  it('short-circuits with formatted recovery guidance when getSession() fails PKCE initialization', async () => {
    const exchangeSpy = vi.fn();
    const mockClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: { message: 'PKCE code verifier not found in storage.' },
        }),
        exchangeCodeForSession: exchangeSpy,
      },
    } as unknown as Pick<SupabaseClient, 'auth'>;

    const result = await resolveAuthCallbackWithClient(mockClient, '?code=stale-code');
    expect(result.session).toBeNull();
    expect(result.error).toContain('browser storage from the login start was unavailable');
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it('handles OAuth error query params and PKCE verifier error formatting cleanly', () => {
    expect(formatAuthCallbackError('PKCE code verifier not found in storage')).toContain(
      'embedded preview frame'
    );
    expect(formatAuthCallbackError('access_denied')).toBe('access_denied');
  });

  it('returns formatted error directly when OAuth callback contains error query params', async () => {
    const getSessionSpy = vi.fn();
    const exchangeSpy = vi.fn();
    const mockClient = {
      auth: {
        getSession: getSessionSpy,
        exchangeCodeForSession: exchangeSpy,
      },
    } as unknown as Pick<SupabaseClient, 'auth'>;

    const res = await resolveAuthCallbackWithClient(
      mockClient,
      '?error=access_denied&error_description=User+cancelled+Google+sign-in'
    );
    expect(res.session).toBeNull();
    expect(res.error).toBe('User cancelled Google sign-in');
    expect(getSessionSpy).not.toHaveBeenCalled();
    expect(exchangeSpy).not.toHaveBeenCalled();
  });
});
