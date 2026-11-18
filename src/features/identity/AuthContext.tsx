import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ENV_CONFIG } from '../../config/env';
import { getSupabaseClient } from './supabaseClient';
import {
  BuillyOwnerIdentity,
  deriveOwnerFromSupabaseUser,
  signInWithGoogleIdentity,
  signOutBuillyIdentity,
} from './authService';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed_out' | 'authenticated' | 'error';

export interface AuthContextValue {
  status: AuthStatus;
  isConfigured: boolean;
  owner: BuillyOwnerIdentity | null;
  session: Session | null;
  accessToken: string | null;
  error: string | null;
  isBusy: boolean;
  signInWithGoogle: (returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isConfigured = ENV_CONFIG.isSupabaseConfigured;
  const [status, setStatus] = useState<AuthStatus>(() =>
    isConfigured ? 'loading' : 'unconfigured'
  );
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    if (nextSession?.user) {
      setStatus('authenticated');
      setError(null);
    } else {
      setStatus(ENV_CONFIG.isSupabaseConfigured ? 'signed_out' : 'unconfigured');
    }
  }, []);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setStatus('unconfigured');
      return;
    }

    let mounted = true;
    client.auth
      .getSession()
      .then(({ data, error: sessionErr }) => {
        if (!mounted) return;
        if (sessionErr) {
          setStatus('error');
          setError(sessionErr.message);
          return;
        }
        applySession(data.session);
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Unable to restore session.');
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      applySession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signInWithGoogle = useCallback(async (returnTo = '/console') => {
    setError(null);
    setIsBusy(true);
    try {
      await signInWithGoogleIdentity(returnTo);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to initiate Google Sign-In.';
      setError(message);
      setIsBusy(false);
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      await signOutBuillyIdentity();
      setSession(null);
      setStatus(ENV_CONFIG.isSupabaseConfigured ? 'signed_out' : 'unconfigured');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out.');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setStatus('unconfigured');
      return;
    }
    setIsBusy(true);
    try {
      const { data, error: refreshErr } = await client.auth.getSession();
      if (refreshErr) {
        setError(refreshErr.message);
        setStatus('error');
        return;
      }
      applySession(data.session);
    } finally {
      setIsBusy(false);
    }
  }, [applySession]);

  const owner = session?.user ? deriveOwnerFromSupabaseUser(session.user) : null;

  return (
    <AuthContext.Provider
      value={{
        status,
        isConfigured,
        owner,
        session,
        accessToken: session?.access_token ?? null,
        error,
        isBusy,
        signInWithGoogle,
        signOut,
        refreshSession,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return ctx;
}
