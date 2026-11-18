import { ENV_CONFIG } from '../config/env';

export const GOOGLE_WORKSPACE_SCOPES = ENV_CONFIG.googleWorkspaceScopes;

export interface GoogleAuthUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleIdentityWindow {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (resp: GisTokenResponse) => void;
          error_callback?: (err: { type?: string; message?: string }) => void;
        }) => GisTokenClient;
        revoke?: (token: string, done?: () => void) => void;
      };
    };
  };
}

// In-memory only token & session cache — never persisted in localStorage or sessionStorage.
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;
let currentGoogleUser: GoogleAuthUser | null = null;
let gisScriptPromise: Promise<void> | null = null;

type AuthListener = (user: GoogleAuthUser | null, token: string | null) => void;
const authListeners = new Set<AuthListener>();

function notifyListeners(): void {
  const token = getGoogleAccessToken();
  const user = token ? currentGoogleUser : null;
  authListeners.forEach((listener) => {
    try {
      listener(user, token);
    } catch {
      // Ignore listener errors
    }
  });
}

async function ensureGisLoaded(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Google Identity Services requires a browser environment.');
  }
  const win = window as unknown as GoogleIdentityWindow;
  if (win.google?.accounts?.oauth2?.initTokenClient) {
    return;
  }

  if (!gisScriptPromise) {
    gisScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="accounts.google.com/gsi/client"]'
      );
      if (existing) {
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          if ((window as unknown as GoogleIdentityWindow).google?.accounts?.oauth2?.initTokenClient) {
            clearInterval(poll);
            resolve();
          } else if (attempts > 60) {
            clearInterval(poll);
            gisScriptPromise = null;
            reject(
              new Error(
                'Google Identity Services failed to initialize. Check your network or script blocker and try again.'
              )
            );
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if ((window as unknown as GoogleIdentityWindow).google?.accounts?.oauth2?.initTokenClient) {
          resolve();
        } else {
          gisScriptPromise = null;
          reject(new Error('Google OAuth client library loaded without oauth2 support.'));
        }
      };
      script.onerror = () => {
        gisScriptPromise = null;
        reject(new Error('Could not load Google Identity Services script.'));
      };
      document.head.appendChild(script);
    });
  }

  return gisScriptPromise;
}

async function fetchGoogleProfile(accessToken: string): Promise<GoogleAuthUser> {
  try {
    const driveRes = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId,photoLink)',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (driveRes.ok) {
      const data = await driveRes.json();
      const user = data?.user;
      if (user) {
        return {
          uid: user.permissionId || user.emailAddress || `google_${Date.now()}`,
          email: user.emailAddress || '',
          displayName: user.displayName || user.emailAddress || 'Google Account',
          photoURL: user.photoLink || '',
        };
      }
    }
  } catch {
    // Fallback below
  }

  return {
    uid: `google_session_${Date.now().toString(36)}`,
    email: '',
    displayName: 'Connected Google Account',
    photoURL: '',
  };
}

export function initGoogleAuth(
  onAuthValid?: (user: GoogleAuthUser, token: string) => void,
  onAuthUnavailable?: (user: GoogleAuthUser | null) => void
): () => void {
  const listener: AuthListener = (user, token) => {
    if (user && token) {
      onAuthValid?.(user, token);
    } else {
      onAuthUnavailable?.(user);
    }
  };
  authListeners.add(listener);

  // Immediately sync once on subscription based on in-memory session state
  const currentToken = getGoogleAccessToken();
  if (currentGoogleUser && currentToken) {
    onAuthValid?.(currentGoogleUser, currentToken);
  } else {
    onAuthUnavailable?.(null);
  }

  const expiryTimer =
    typeof window !== 'undefined'
      ? window.setInterval(() => {
          if (cachedAccessToken && tokenExpiresAt > 0 && Date.now() >= tokenExpiresAt) {
            cachedAccessToken = null;
            tokenExpiresAt = 0;
            notifyListeners();
          }
        }, 15000)
      : null;

  return () => {
    authListeners.delete(listener);
    if (expiryTimer !== null) {
      window.clearInterval(expiryTimer);
    }
  };
}

export class GoogleAuthCancelledError extends Error {
  constructor(message = 'Google sign-in was cancelled.') {
    super(message);
    this.name = 'GoogleAuthCancelledError';
  }
}

let activeSignInCancel: (() => void) | null = null;

export function cancelGoogleSignIn(): void {
  if (activeSignInCancel) {
    activeSignInCancel();
    activeSignInCancel = null;
  }
}

function isEmbeddedInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export async function signInWithGoogleWorkspace(
  forceConsent = false
): Promise<{ user: GoogleAuthUser; accessToken: string }> {
  const clientId = ENV_CONFIG.googleOAuthClientId.trim();
  if (!clientId) {
    throw new Error(
      'Missing VITE_GOOGLE_OAUTH_CLIENT_ID. Configure your Google OAuth 2.0 Web Client ID to connect Google Workspace.'
    );
  }

  // Cancel any stale in-flight sign-in attempt before starting a new one.
  cancelGoogleSignIn();

  await ensureGisLoaded();
  const win = window as unknown as GoogleIdentityWindow;
  const oauth2 = win.google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    throw new Error('Google Identity OAuth 2.0 client is unavailable in this browser.');
  }

  const tokenResp = await new Promise<GisTokenResponse>((resolve, reject) => {
    let settled = false;
    let popupClosedManually = false;
    let rawPopup: Window | null = null;
    let timeoutId: number | null = null;

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (activeSignInCancel === cancelAttempt) {
        activeSignInCancel = null;
      }
    };

    const finishResolve = (resp: GisTokenResponse) => {
      if (settled) return;
      settled = true;
      popupClosedManually = true;
      cleanup();
      resolve(resp);
    };

    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      popupClosedManually = true;
      cleanup();
      try {
        rawPopup?.close();
      } catch {
        // Ignore COOP errors when closing popup
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const cancelAttempt = () => {
      finishReject(new GoogleAuthCancelledError('Google sign-in was cancelled.'));
    };

    activeSignInCancel = cancelAttempt;

    timeoutId = window.setTimeout(() => {
      const iframeHint = isEmbeddedInIframe()
        ? ' If you are running inside an embedded preview frame, try opening the app in a separate browser tab.'
        : '';
      finishReject(
        new Error(
          `Google sign-in timed out before completing authorization.${iframeHint} Please try connecting again.`
        )
      );
    }, 120_000);

    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_WORKSPACE_SCOPES.join(' '),
        callback: (resp: GisTokenResponse) => {
          if (resp.error) {
            finishReject(
              new Error(
                resp.error_description ||
                  (resp.error === 'access_denied'
                    ? 'Google Workspace permissions were declined.'
                    : `Google authorization error: ${resp.error}`)
              )
            );
            return;
          }
          finishResolve(resp);
        },
        error_callback: (err) => {
          if (err?.type === 'popup_closed') {
            finishReject(new Error('Google sign-in popup was closed before consent was granted.'));
          } else if (err?.type === 'popup_failed_to_open') {
            const iframeHint = isEmbeddedInIframe()
              ? ' Or open the app in a dedicated browser tab.'
              : '';
            finishReject(
              new Error(
                `Sign-in popup was blocked by your browser. Please allow popups for this site and retry.${iframeHint}`
              )
            );
          } else {
            finishReject(new Error(err?.message || 'Google authorization failed.'));
          }
        },
      });

      // Intercept the synchronous window.open call made by GIS so its background poller
      // never reads native `rawPopup.closed` across COOP boundaries (which spams
      // "Cross-Origin-Opener-Policy policy would block the window.closed call." and can abort login).
      const originalWindowOpen = window.open;
      window.open = ((...args: Parameters<typeof window.open>) => {
        rawPopup = originalWindowOpen.apply(window, args);
        if (!rawPopup) {
          return null;
        }
        const safePopupHandle = {
          get closed() {
            return popupClosedManually;
          },
          get opener() {
            return window;
          },
          get self() {
            return safePopupHandle;
          },
          get window() {
            return safePopupHandle;
          },
          close() {
            popupClosedManually = true;
            try {
              rawPopup?.close();
            } catch {
              // Ignore COOP close restrictions
            }
          },
          focus() {
            try {
              rawPopup?.focus();
            } catch {
              // Ignore COOP focus restrictions
            }
          },
          blur() {
            try {
              rawPopup?.blur();
            } catch {
              // Ignore COOP blur restrictions
            }
          },
          postMessage(message: unknown, targetOrigin: string, transfer?: Transferable[]) {
            try {
              rawPopup?.postMessage(message, targetOrigin, transfer);
            } catch {
              // Ignore COOP postMessage restrictions
            }
          },
        };
        return safePopupHandle as unknown as Window;
      }) as typeof window.open;

      try {
        client.requestAccessToken({
          prompt: forceConsent ? 'consent select_account' : 'select_account',
        });
      } finally {
        window.open = originalWindowOpen;
      }
    } catch (err) {
      finishReject(err);
    }
  });

  if (!tokenResp.access_token) {
    throw new Error(
      'Google authorization completed without an API access token. Please try connecting again.'
    );
  }

  const expiresInSec = Number(tokenResp.expires_in || 3500);
  cachedAccessToken = tokenResp.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, expiresInSec - 30) * 1000;
  currentGoogleUser = await fetchGoogleProfile(tokenResp.access_token);
  notifyListeners();

  return {
    user: currentGoogleUser,
    accessToken: cachedAccessToken,
  };
}

export function getGoogleAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (tokenExpiresAt > 0 && Date.now() >= tokenExpiresAt) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    return null;
  }
  return cachedAccessToken;
}

export function clearInMemoryAccessToken(): void {
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  notifyListeners();
}

export function getCurrentGoogleUser(): GoogleAuthUser | null {
  return getGoogleAccessToken() ? currentGoogleUser : null;
}

export async function disconnectGoogleWorkspace(): Promise<void> {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  tokenExpiresAt = 0;
  currentGoogleUser = null;

  if (tokenToRevoke) {
    try {
      const win = window as unknown as GoogleIdentityWindow;
      win.google?.accounts?.oauth2?.revoke?.(tokenToRevoke);
    } catch {
      // Best-effort GIS revoke
    }
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );
    } catch {
      // Best-effort OAuth2 revocation endpoint
    }
  }

  notifyListeners();
}
