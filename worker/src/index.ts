import {
  handleGoogleOAuthCallback,
  handleGoogleOAuthDisconnect,
  handleGoogleOAuthStart,
  handleWorkspaceStatus,
} from './routes/googleOAuth';
import { handleDriveVerifyFile } from './routes/drive';
import {
  handleSheetsAppendValues,
  handleSheetsEnsureSpreadsheet,
  handleSheetsReadMeta,
  handleSheetsReadValues,
  handleSheetsWriteValues,
} from './routes/sheets';
import { handleOwnerPublishSite, handleOwnerRollbackSite } from './routes/ownerPublish';
import {
  handlePublicAssetProxy,
  handlePublicCmsQuery,
  handlePublicFormSubmit,
  handlePublicGetRuntimeSnapshot,
  handlePublicResolveSite,
} from './routes/publicRuntime';
import { handleConsoleApiRequest } from './routes/consoleApi';
import { WorkerEnv } from './types';

function withCors(request: Request, env: WorkerEnv, response: Response): Response {
  const reqOrigin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_FRONTEND_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const headers = new Headers(response.headers);
  if (reqOrigin && allowed.includes(reqOrigin)) {
    headers.set('Access-Control-Allow-Origin', reqOrigin);
  } else if (request.url.includes('/api/public/')) {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  headers.set('Vary', 'Origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return withCors(request, env, new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    const { pathname } = url;

    let response: Response | null = null;
    if (pathname === '/api/health' && request.method === 'GET') {
      response = Response.json({ ok: true, service: 'builly-workspace-worker', runtimeVersion: '1.0.0' });
    } else if (pathname.startsWith('/api/console/')) {
      response = await handleConsoleApiRequest(request, env, pathname);
    } else if (pathname === '/api/workspace/status' && request.method === 'GET') {
      response = await handleWorkspaceStatus(request, env);
    } else if (pathname === '/api/google/oauth/start' && request.method === 'POST') {
      response = await handleGoogleOAuthStart(request, env);
    } else if (pathname === '/api/google/oauth/callback' && request.method === 'GET') {
      // Browser top-level redirect from Google — return directly without overwriting redirect headers
      return handleGoogleOAuthCallback(request, env);
    } else if (pathname === '/api/google/oauth/disconnect' && request.method === 'POST') {
      response = await handleGoogleOAuthDisconnect(request, env);
    } else if (pathname === '/api/drive/file' && request.method === 'GET') {
      response = await handleDriveVerifyFile(request, env);
    } else if (pathname === '/api/sheets/meta' && request.method === 'GET') {
      response = await handleSheetsReadMeta(request, env);
    } else if (pathname === '/api/sheets/values/read' && request.method === 'POST') {
      response = await handleSheetsReadValues(request, env);
    } else if (pathname === '/api/sheets/values/write' && request.method === 'POST') {
      response = await handleSheetsWriteValues(request, env);
    } else if (pathname === '/api/sheets/values/append' && request.method === 'POST') {
      response = await handleSheetsAppendValues(request, env);
    } else if (pathname === '/api/sheets/spreadsheets/ensure' && request.method === 'POST') {
      response = await handleSheetsEnsureSpreadsheet(request, env);
    } else if (pathname === '/api/public/sites/resolve' && request.method === 'GET') {
      response = await handlePublicResolveSite(request, env);
    } else {
      const ownerPubMatch = pathname.match(/^\/api\/owner\/sites\/([^/]+)\/publish$/);
      const ownerRollbackMatch = pathname.match(/^\/api\/owner\/sites\/([^/]+)\/rollback$/);
      const pubRuntimeMatch = pathname.match(/^\/api\/public\/sites\/([^/]+)\/runtime$/);
      const pubCmsMatch = pathname.match(/^\/api\/public\/sites\/([^/]+)\/cms\/query$/);
      const pubFormMatch = pathname.match(/^\/api\/public\/sites\/([^/]+)\/forms\/([^/]+)\/submit$/);
      const pubAssetMatch = pathname.match(/^\/api\/public\/sites\/([^/]+)\/assets\/([^/]+)$/);

      if (ownerPubMatch && request.method === 'POST') {
        response = await handleOwnerPublishSite(request, env, decodeURIComponent(ownerPubMatch[1]));
      } else if (ownerRollbackMatch && request.method === 'POST') {
        response = await handleOwnerRollbackSite(request, env, decodeURIComponent(ownerRollbackMatch[1]));
      } else if (pubRuntimeMatch && request.method === 'GET') {
        response = await handlePublicGetRuntimeSnapshot(request, env, decodeURIComponent(pubRuntimeMatch[1]));
      } else if (pubCmsMatch && request.method === 'POST') {
        response = await handlePublicCmsQuery(request, env, decodeURIComponent(pubCmsMatch[1]));
      } else if (pubFormMatch && request.method === 'POST') {
        response = await handlePublicFormSubmit(
          request,
          env,
          decodeURIComponent(pubFormMatch[1]),
          decodeURIComponent(pubFormMatch[2])
        );
      } else if (pubAssetMatch && request.method === 'GET') {
        response = await handlePublicAssetProxy(
          request,
          env,
          decodeURIComponent(pubAssetMatch[1]),
          decodeURIComponent(pubAssetMatch[2])
        );
      }
    }

    if (!pathname.startsWith('/api/') && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    if (!response) {
      response = Response.json({ error: 'Not Found' }, { status: 404 });
    }

    return withCors(request, env, response);
  },
};
