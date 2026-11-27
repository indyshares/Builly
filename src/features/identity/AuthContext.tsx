import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ENV_CONFIG } from '../../config/env';
import {
  BuillyOwnerIdentity,
  deriveOwnerFromAccount,
  signInWithGoogleIdentity,
  signOutBuillyIdentity,
} from './authService';
import { fetchBuillySession } from './buillySessionClient';

export type AuthStatus = 'loading' | 'unconfigured' | 'signed_out' | 'authenticated' | 'error';

interface LightweightSession {
  user: { id: string; email?: string };
}

export interface AuthContextValue {
  status: AuthStatus;
  isConfigured: boolean;
  owner: BuillyOwnerIdentity | null;
  session: LightweightSession | null;
  /** Compatibility sentinel only — the real opaque token is HttpOnly in the Worker cookie. */
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
  const isConfigured = ENV_CONFIG.isAuthConfigured;
  const [status, setStatus] = useState<AuthStatus>(() => (isConfigured ? 'loading' : 'unconfigured'));
  const [session, setSession] = useState<LightweightSession | null>(null);
  const [owner, setOwner] = useState<BuillyOwnerIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const applySession = useCallback(
    (authenticated: boolean, sessionOwnerId: string | null, accountEmail?: string) => {
      if (authenticated && sessionOwnerId) {
        setSession({ user: { id: sessionOwnerId, email: accountEmail } });
        setStatus('authenticated');
        setError(null);
      } else {
        setSession(null);
        setOwner(null);
        setStatus(isConfigured ? 'signed_out' : 'unconfigured');
      }
    },
    [isConfigured]
  );

  const refreshSession = useCallback(async () => {
    if (!isConfigured) {
      setStatus('unconfigured');
      return;
    }
    setIsBusy(true);
    try {
      const state = await fetchBuillySession();
      applySession(state.authenticated, state.ownerId, state.account?.email);
      setOwner(state.account ? deriveOwnerFromAccount(state.account) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore session.');
      setStatus('error');
    } finally {
      setIsBusy(false);
    }
  }, [applySession, isConfigured]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const signInWithGoogle = useCallback(async (returnTo = '/console') => {
    setError(null);
    setIsBusy(true);
    try {
      await signInWithGoogleIdentity(returnTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate Google Sign-In.';
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
      applySession(false, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out.');
    } finally {
      setIsBusy(false);
    }
  }, [applySession]);

  return (
    <AuthContext.Provider
      value={{
        status,
        isConfigured,
        owner,
        session,
        accessToken: session ? 'builly-session-active' : null,
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
