import { decryptSecret, encryptSecret } from '../security/encryption';
import { StoredCredentialRow, WorkerEnv } from '../types';

export async function saveEncryptedWorkspaceCredential(
  env: WorkerEnv,
  params: {
    ownerId: string;
    googleSubject: string;
    googleEmail: string;
    googleName: string;
    googleAvatar: string;
    grantedScopes: string[];
    refreshToken: string;
  }
): Promise<void> {
  const { ciphertext, iv } = await encryptSecret(params.refreshToken, env.TOKEN_ENCRYPTION_KEY);
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO workspace_credentials (
       owner_id, google_subject, google_email, google_name, google_avatar,
       granted_scopes, encrypted_refresh_token, encryption_iv, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET
       google_subject = excluded.google_subject,
       google_email = excluded.google_email,
       google_name = excluded.google_name,
       google_avatar = excluded.google_avatar,
       granted_scopes = excluded.granted_scopes,
       encrypted_refresh_token = excluded.encrypted_refresh_token,
       encryption_iv = excluded.encryption_iv,
       status = 'connected',
       updated_at = excluded.updated_at`
  )
    .bind(
      params.ownerId,
      params.googleSubject,
      params.googleEmail,
      params.googleName,
      params.googleAvatar,
      JSON.stringify(params.grantedScopes),
      ciphertext,
      iv,
      now,
      now
    )
    .run();
}

export async function getSafeWorkspaceStatus(
  env: WorkerEnv,
  ownerId: string
): Promise<{
  connected: boolean;
  needsReauth: boolean;
  ownerId: string;
  account: {
    email: string;
    displayName: string;
    avatarUrl: string;
    googleSubject: string;
  } | null;
  grantedScopes: string[];
  updatedAt: string | null;
}> {
  const row = await env.DB.prepare(
    `SELECT owner_id, google_subject, google_email, google_name, google_avatar,
            granted_scopes, status, updated_at
     FROM workspace_credentials WHERE owner_id = ?`
  )
    .bind(ownerId)
    .first<Omit<StoredCredentialRow, 'encrypted_refresh_token' | 'encryption_iv' | 'created_at'>>();

  if (!row) {
    return {
      connected: false,
      needsReauth: false,
      ownerId,
      account: null,
      grantedScopes: [],
      updatedAt: null,
    };
  }

  let scopes: string[] = [];
  try {
    scopes = JSON.parse(row.granted_scopes);
  } catch {
    scopes = [];
  }

  const needsReauth = row.status === 'needs_reauth';

  return {
    connected: row.status === 'connected',
    needsReauth,
    ownerId,
    account: {
      email: row.google_email,
      displayName: row.google_name,
      avatarUrl: row.google_avatar,
      googleSubject: row.google_subject,
    },
    grantedScopes: scopes,
    updatedAt: row.updated_at,
  };
}

/**
 * Exchanges an owner-bound encrypted refresh token for a short-lived server-only Google access token.
 * NEVER expose the returned token or refresh token to the browser.
 */
export async function mintOwnerGoogleAccessToken(
  env: WorkerEnv,
  ownerId: string
): Promise<{ accessToken: string; grantedScopes: string[] }> {
  const row = await env.DB.prepare(
    `SELECT encrypted_refresh_token, encryption_iv, granted_scopes, status
     FROM workspace_credentials WHERE owner_id = ?`
  )
    .bind(ownerId)
    .first<Pick<StoredCredentialRow, 'encrypted_refresh_token' | 'encryption_iv' | 'granted_scopes' | 'status'>>();

  if (!row || row.status !== 'connected') {
    throw new Error('WORKSPACE_REAUTH_REQUIRED');
  }

  const refreshToken = await decryptSecret(
    row.encrypted_refresh_token,
    row.encryption_iv,
    env.TOKEN_ENCRYPTION_KEY
  );

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };

  if (!tokenRes.ok || !data.access_token) {
    if (data.error === 'invalid_grant') {
      await env.DB.prepare(
        `UPDATE workspace_credentials SET status = 'needs_reauth', updated_at = ? WHERE owner_id = ?`
      )
        .bind(new Date().toISOString(), ownerId)
        .run();
    }
    throw new Error('WORKSPACE_REAUTH_REQUIRED');
  }

  let scopes: string[] = [];
  try {
    scopes = JSON.parse(row.granted_scopes);
  } catch {
    scopes = [];
  }

  return { accessToken: data.access_token, grantedScopes: scopes };
}

export async function revokeAndDeleteWorkspaceCredential(
  env: WorkerEnv,
  ownerId: string
): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT encrypted_refresh_token, encryption_iv FROM workspace_credentials WHERE owner_id = ?`
  )
    .bind(ownerId)
    .first<Pick<StoredCredentialRow, 'encrypted_refresh_token' | 'encryption_iv'>>();

  if (row) {
    try {
      const refreshToken = await decryptSecret(
        row.encrypted_refresh_token,
        row.encryption_iv,
        env.TOKEN_ENCRYPTION_KEY
      );
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );
    } catch {
      // Proceed with deletion even if upstream revoke fails
    }
  }

  await env.DB.prepare(`DELETE FROM workspace_credentials WHERE owner_id = ?`)
    .bind(ownerId)
    .run();
}
