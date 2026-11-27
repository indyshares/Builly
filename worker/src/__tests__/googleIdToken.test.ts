import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearGoogleJwksCache,
  resetJwksRefreshWindowForTest,
  verifyGoogleIdToken,
} from '../security/googleIdToken';

function b64url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function makeKey() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', (pair as any).publicKey as CryptoKey);
  return {
    privateKey: (pair as any).privateKey as CryptoKey,
    jwk: { ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' },
  };
}

async function signToken(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'test-key', typ: 'JWT' }
): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(signature))}`;
}

describe('verifyGoogleIdToken', () => {
  afterEach(() => {
    clearGoogleJwksCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubCerts(jwks: { keys: unknown[] }): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
  }

  it('accepts a correctly signed ID token with matching nonce and audience', async () => {
    const { privateKey, jwk } = await makeKey();
    stubCerts({ keys: [jwk] });
    const token = await signToken(privateKey, {
      iss: 'https://accounts.google.com',
      aud: 'client-123',
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      nonce: 'nonce-abc',
      iat: 1000,
      exp: 2000,
    });
    const identity = await verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500);
    expect(identity.subject).toBe('google-sub-1');
    expect(identity.emailVerified).toBe(true);
  });

  it('rejects a token with an invalid signature', async () => {
    const { privateKey, jwk } = await makeKey();
    stubCerts({ keys: [jwk] });
    const token = await signToken(privateKey, {
      iss: 'https://accounts.google.com',
      aud: 'client-123',
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      nonce: 'nonce-abc',
      exp: 2000,
    });
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${b64url(decodeB64url(parts[2]).map((b) => b ^ 1))}`;
    await expect(verifyGoogleIdToken(tampered, 'client-123', 'nonce-abc', 1500)).rejects.toThrow(
      /INVALID_ID_TOKEN_SIGNATURE/
    );
  });

  it('rejects wrong issuer, audience, expiry and nonce', async () => {
    const { privateKey, jwk } = await makeKey();
    stubCerts({ keys: [jwk] });
    const base = {
      iss: 'https://accounts.google.com',
      aud: 'client-123',
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      nonce: 'nonce-abc',
      exp: 2000,
    };
    const cases = [
      [{ ...base, iss: 'https://evil.example' }, 'nonce-abc', 1500],
      [{ ...base, aud: 'other-client' }, 'nonce-abc', 1500],
      [{ ...base }, 'nonce-abc', 2500],
      [{ ...base }, 'wrong-nonce', 1500],
    ] as const;
    for (const [claims, nonce, now] of cases) {
      await expect(
        verifyGoogleIdToken(await signToken(privateKey, claims), 'client-123', nonce, now)
      ).rejects.toThrow();
    }
  });

  it('refreshes signing keys when the kid is unknown (key rotation)', async () => {
    const { privateKey, jwk } = await makeKey();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'old-key' }] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);
    const token = await signToken(privateKey, {
      iss: 'https://accounts.google.com',
      aud: 'client-123',
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      nonce: 'nonce-abc',
      exp: 2000,
    });
    await expect(verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500)).rejects.toThrow(
      'UNKNOWN_GOOGLE_SIGNING_KEY'
    );
    resetJwksRefreshWindowForTest();
    const identity = await verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500);
    expect(identity.subject).toBe('google-sub-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses a cached key without refetching', async () => {
    const { privateKey, jwk } = await makeKey();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const claims = {
      iss: 'https://accounts.google.com',
      aud: 'client-123',
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      nonce: 'nonce-abc',
      exp: 2000,
    };
    const token = await signToken(privateKey, claims);
    await verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500);
    await verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bounds repeated unknown-kid refreshes', async () => {
    const { privateKey, jwk } = await makeKey();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const token = await signToken(
      privateKey,
      {
        iss: 'https://accounts.google.com',
        aud: 'client-123',
        sub: 'google-sub-1',
        email: 'user@example.com',
        email_verified: true,
        nonce: 'nonce-abc',
        exp: 2000,
      },
      { alg: 'RS256', kid: 'unknown-kid', typ: 'JWT' }
    );
    await expect(verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500)).rejects.toThrow(
      'UNKNOWN_GOOGLE_SIGNING_KEY'
    );
    await expect(verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500)).rejects.toThrow(
      'UNKNOWN_GOOGLE_SIGNING_KEY'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the JWKS request times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('AbortError')));
    const { privateKey } = await makeKey();
    const token = await signToken(privateKey, {
      iss: 'https://accounts.google.com',
      aud: 'client-123',
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      nonce: 'nonce-abc',
      exp: 2000,
    });
    await expect(verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500)).rejects.toThrow(
      'GOOGLE_JWKS_UNAVAILABLE'
    );
  });

  it('dedupes concurrent JWKS refreshes', async () => {
    const { privateKey, jwk } = await makeKey();
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; })
    );
    vi.stubGlobal('fetch', fetchMock);
    const token = await signToken(privateKey, {
      iss: 'https://accounts.google.com',
      aud: 'client-123',
      sub: 'google-sub-1',
      email: 'user@example.com',
      email_verified: true,
      nonce: 'nonce-abc',
      exp: 2000,
    });
    const first = verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500);
    const second = verifyGoogleIdToken(token, 'client-123', 'nonce-abc', 1500);
    resolveFetch(new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }));
    const [a, b] = await Promise.all([first, second]);
    expect(a.subject).toBe('google-sub-1');
    expect(b.subject).toBe('google-sub-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
