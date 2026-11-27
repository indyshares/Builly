import { buildConsoleApiUrl } from '../../config/apiConfig';

export interface BuillyAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  status: string;
}

export interface BuillySessionState {
  authenticated: boolean;
  ownerId: string | null;
  account: BuillyAccount | null;
}

const jsonHeaders = { Accept: 'application/json' };

/** Loads the Builly-owned session. The opaque token stays HttpOnly in the Worker cookie. */
export async function fetchBuillySession(): Promise<BuillySessionState> {
  const res = await fetch(buildConsoleApiUrl('/api/auth/session'), {
    method: 'GET',
    credentials: 'include',
    headers: jsonHeaders,
  });
  if (res.status === 401) {
    return { authenticated: false, ownerId: null, account: null };
  }
  if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Unable to load Builly session.');
  }
  const data = (await res.json()) as BuillySessionState;
  return {
    authenticated: Boolean(data.authenticated),
    ownerId: data.ownerId || null,
    account: data.account || null,
  };
}

/** Full-page navigation to the Worker, which redirects to Google directly. */
export function startGoogleLogin(returnTo = '/console'): void {
  const target = buildConsoleApiUrl(
    `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`
  );
  window.location.assign(target);
}

export async function signOutBuilly(): Promise<void> {
  await fetch(buildConsoleApiUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
  });
}
