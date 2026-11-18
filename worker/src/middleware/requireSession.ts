import { VerifiedSession, WorkerEnv } from '../types';

/**
 * Verifies the incoming Builly Supabase Auth JWT against Supabase Auth's user endpoint
 * and derives ownerId strictly from the verified Supabase identity (never trusting client headers).
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
        { error: 'Authentication required.', code: 'UNAUTHORIZED' },
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

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${jwt}`,
    };
    if (env.SUPABASE_ANON_KEY) {
      headers.apikey = env.SUPABASE_ANON_KEY;
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
    if (!res.ok) {
      return {
        errorResponse: Response.json(
          { error: 'Invalid or expired Builly session.', code: 'INVALID_SESSION' },
          { status: 401 }
        ),
      };
    }

    const user = (await res.json()) as { id?: string; email?: string };
    if (!user?.id) {
      return {
        errorResponse: Response.json(
          { error: 'Verified user lacks canonical owner ID.', code: 'INVALID_SESSION' },
          { status: 401 }
        ),
      };
    }

    return {
      session: {
        ownerId: user.id,
        email: user.email || '',
      },
    };
  } catch {
    return {
      errorResponse: Response.json(
        { error: 'Session verification failed.', code: 'AUTH_UPSTREAM_ERROR' },
        { status: 502 }
      ),
    };
  }
}
