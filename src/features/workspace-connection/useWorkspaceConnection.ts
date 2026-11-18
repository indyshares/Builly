import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../identity/AuthContext';
import {
  SafeWorkspaceAccount,
  WorkspaceConnectionPhase,
  WorkerApiError,
  workspaceApiClient,
} from './workspaceApiClient';

export interface WorkspaceConnectionState {
  phase: WorkspaceConnectionPhase;
  workerAvailable: boolean;
  connected: boolean;
  needsReauth: boolean;
  account: SafeWorkspaceAccount | null;
  grantedScopes: string[];
  updatedAt: string | null;
  error: string | null;
  differentAccountNotice: string | null;
  refreshStatus: () => Promise<void>;
  connectWorkspace: (options?: { returnTo?: string; forceConsent?: boolean }) => Promise<void>;
  disconnectWorkspace: () => Promise<void>;
  clearError: () => void;
}

export function useWorkspaceConnection(): WorkspaceConnectionState {
  const { status: authStatus, owner, accessToken } = useAuth();
  const [phase, setPhase] = useState<WorkspaceConnectionPhase>('idle');
  const [workerAvailable, setWorkerAvailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [account, setAccount] = useState<SafeWorkspaceAccount | null>(null);
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (authStatus !== 'authenticated' || !accessToken) {
      setPhase('idle');
      setConnected(false);
      setNeedsReauth(false);
      setAccount(null);
      setGrantedScopes([]);
      return;
    }

    setPhase('loading');
    setError(null);

    try {
      const res = await workspaceApiClient.getStatus(accessToken);
      setWorkerAvailable(res.workerAvailable);
      setConnected(res.connected);
      setNeedsReauth(res.needsReauth);
      setAccount(res.account);
      setGrantedScopes(res.grantedScopes);
      setUpdatedAt(res.updatedAt);

      if (!res.workerAvailable) {
        setPhase('worker_unconfigured');
        return;
      }
      if (res.needsReauth) {
        setPhase('needs_reauth');
        return;
      }
      setPhase(res.connected ? 'connected' : 'disconnected');
    } catch (err) {
      setPhase('error');
      setError(
        err instanceof Error ? err.message : 'Unable to check Google Workspace connection status.'
      );
    }
  }, [authStatus, accessToken]);

  useEffect(() => {
    if (authStatus === 'authenticated' && accessToken) {
      refreshStatus();
    } else {
      setPhase('idle');
      setConnected(false);
      setNeedsReauth(false);
      setAccount(null);
      setGrantedScopes([]);
    }
  }, [authStatus, accessToken, refreshStatus]);

  const connectWorkspace = useCallback(
    async (options?: { returnTo?: string; forceConsent?: boolean }) => {
      if (!accessToken) {
        setError('Please sign in with your Builly Google account first.');
        return;
      }
      setError(null);
      setPhase('connecting');
      try {
        const { authorizeUrl } = await workspaceApiClient.startGoogleWorkspaceOAuth(
          accessToken,
          options
        );
        window.location.assign(authorizeUrl);
      } catch (err) {
        const msg =
          err instanceof WorkerApiError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Unable to start Google Workspace authorization.';
        setError(msg);
        setPhase(workerAvailable ? 'disconnected' : 'worker_unconfigured');
      }
    },
    [accessToken, workerAvailable]
  );

  const disconnectWorkspace = useCallback(async () => {
    if (!accessToken) return;
    setError(null);
    setPhase('loading');
    try {
      await workspaceApiClient.disconnect(accessToken);
      setConnected(false);
      setNeedsReauth(false);
      setAccount(null);
      setGrantedScopes([]);
      setPhase('disconnected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Google Workspace.');
      setPhase('error');
    }
  }, [accessToken]);

  const differentAccountNotice =
    connected &&
    owner?.email &&
    account?.email &&
    owner.email.toLowerCase() !== account.email.toLowerCase()
      ? `Builly account (${owner.email}) differs from connected Google Workspace account (${account.email}). Drive & Sheets operations will use ${account.email}.`
      : null;

  return {
    phase,
    workerAvailable,
    connected,
    needsReauth,
    account,
    grantedScopes,
    updatedAt,
    error,
    differentAccountNotice,
    refreshStatus,
    connectWorkspace,
    disconnectWorkspace,
    clearError: () => setError(null),
  };
}
