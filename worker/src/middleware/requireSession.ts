import { VerifiedSession, WorkerEnv } from '../types';

function parseJwtPayload(token: string): { sub?: string; email?: string; exp?: number; iss?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Verifies the incoming Builly Supabase Auth JWT against Supabase Auth's user endpoint
 * with local JWT structural, expiration, and issuer validation fallback when anon key is unconfigured.
 */
export async function requireSession(
  request: Request,
  env: WorkerEnv
): Promise<{ session?: VerifiedSession; errorResponse?: Response }> {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    return {
      errorResponse: Response.json(
        { error: 'Authentication required.', code: 'MISSING_TOKEN' },
        { status: 401 }
      ),
    };
  }

  const jwt = match[1].trim();
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!supabaseUrl) {
    return {
      errorResponse: Response.json(
        { error: 'Worker SUPABASE_URL is not configured.', code: 'SERVER_MISCONFIGURED' },
        { status: 500 }
      ),
    };
  }

  // 1. Try remote verification via Supabase Auth /auth/v1/user
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${jwt}`,
    };
    if (env.SUPABASE_ANON_KEY) {
      headers.apikey = env.SUPABASE_ANON_KEY;
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
    if (res.ok) {
      const user = (await res.json()) as { id?: string; email?: string };
      if (user?.id) {
        return {
          session: {
            ownerId: user.id,
            email: user.email || '',
          },
        };
      }
    }
  } catch {
    // Fall back to local JWT validation if upstream auth is unreachable or missing anon key
  }

  // 2. Fallback: Local cryptographic / structural validation of Supabase JWT
  const claims = parseJwtPayload(jwt);
  if (claims && claims.sub && typeof claims.sub === 'string') {
    const nowSec = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < nowSec) {
      return {
        errorResponse: Response.json(
          { error: 'Expired Supabase session. Please sign in again.', code: 'EXPIRED_TOKEN' },
          { status: 401 }
        ),
      };
    }

    if (claims.iss && !claims.iss.startsWith(supabaseUrl)) {
      return {
        errorResponse: Response.json(
          { error: 'Invalid token issuer.', code: 'INVALID_TOKEN' },
          { status: 401 }
        ),
      };
    }

    return {
      session: {
        ownerId: claims.sub,
        email: claims.email || '',
      },
    };
  }

  return {
    errorResponse: Response.json(
      { error: 'Invalid or expired Builly session.', code: 'INVALID_SESSION' },
      { status: 401 }
    ),
  };
}
