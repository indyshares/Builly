function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateHighEntropyToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64Url(bytes);
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toBase64Url(new Uint8Array(digest));
}

export async function createOAuthStateRecord(
  db: D1Database,
  params: {
    ownerId: string;
    returnTo: string;
    frontendOrigin: string;
    ttlMs?: number;
  }
): Promise<{ rawState: string; codeChallenge: string }> {
  const rawState = generateHighEntropyToken(32);
  const stateHash = await sha256Base64Url(rawState);
  const codeVerifier = generateHighEntropyToken(32);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const expiresAt = Date.now() + (params.ttlMs ?? 10 * 60 * 1000);
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO oauth_states (state_hash, owner_id, code_verifier, return_to, frontend_origin, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      stateHash,
      params.ownerId,
      codeVerifier,
      params.returnTo,
      params.frontendOrigin,
      expiresAt,
      createdAt
    )
    .run();

  return { rawState, codeChallenge };
}

export async function consumeOAuthStateRecord(
  db: D1Database,
  rawState: string
): Promise<{
  ownerId: string;
  codeVerifier: string;
  returnTo: string;
  frontendOrigin: string;
} | null> {
  if (!rawState || rawState.length < 24) return null;
  const stateHash = await sha256Base64Url(rawState);
  const row = await db
    .prepare(
      `DELETE FROM oauth_states
       WHERE state_hash = ?
       RETURNING owner_id, code_verifier, return_to, frontend_origin, expires_at`
    )
    .bind(stateHash)
    .first<{
      owner_id: string;
      code_verifier: string;
      return_to: string;
      frontend_origin: string;
      expires_at: number;
    }>();

  if (!row) return null;
  if (Date.now() > Number(row.expires_at)) {
    return null;
  }

  return {
    ownerId: row.owner_id,
    codeVerifier: row.code_verifier,
    returnTo: row.return_to,
    frontendOrigin: row.frontend_origin,
  };
}
