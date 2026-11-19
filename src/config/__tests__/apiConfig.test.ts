import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiConfigurationError,
  buildConsoleApiUrl,
  evaluateConsoleApiConfig,
  resolveConsoleApiOrigin,
} from '../apiConfig';
import { workspaceHierarchyClient } from '../../features/console/workspaceHierarchyClient';
import { WorkerApiError } from '../../features/workspace-connection/workspaceApiClient';

describe('Centralized Console API origin resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes bare Worker hostname without scheme to an absolute HTTPS origin', () => {
    expect(resolveConsoleApiOrigin('builly-project.mycloudsfireworks.workers.dev', { isProd: true })).toBe(
      'https://builly-project.mycloudsfireworks.workers.dev'
    );
  });

  it('strips trailing slashes and stray path segments cleanly', () => {
    expect(
      resolveConsoleApiOrigin('https://builly-project.mycloudsfireworks.workers.dev///', {
        isProd: true,
      })
    ).toBe('https://builly-project.mycloudsfireworks.workers.dev');

    expect(
      resolveConsoleApiOrigin('https://builly-project.mycloudsfireworks.workers.dev/api/v1/', {
        isProd: true,
      })
    ).toBe('https://builly-project.mycloudsfireworks.workers.dev');
  });

  it('allows explicit local dev HTTP URLs for localhost and 127.0.0.1', () => {
    expect(resolveConsoleApiOrigin('http://localhost:8787/', { isProd: false })).toBe(
      'http://localhost:8787'
    );
    expect(resolveConsoleApiOrigin('localhost:8787', { isProd: false })).toBe(
      'http://localhost:8787'
    );
    expect(resolveConsoleApiOrigin('http://127.0.0.1:8787', { isProd: false })).toBe(
      'http://127.0.0.1:8787'
    );
  });

  it('rejects malformed, relative, non-HTTPS remote, and credentialed URLs instead of falling back', () => {
    expect(() => resolveConsoleApiOrigin('', { isProd: true })).toThrowError(ApiConfigurationError);
    expect(() => resolveConsoleApiOrigin('/api/console', { isProd: true })).toThrowError(
      ApiConfigurationError
    );
    expect(() =>
      resolveConsoleApiOrigin('http://builly-project.mycloudsfireworks.workers.dev', { isProd: true })
    ).toThrowError(ApiConfigurationError);
    expect(() =>
      resolveConsoleApiOrigin('https://user:pass@builly-project.mycloudsfireworks.workers.dev', {
        isProd: true,
      })
    ).toThrowError(ApiConfigurationError);
    expect(() => resolveConsoleApiOrigin('not a valid url', { isProd: true })).toThrowError(
      ApiConfigurationError
    );
  });

  it('evaluateConsoleApiConfig preserves configuration errors without falling back to window.location.origin', () => {
    const bad = evaluateConsoleApiConfig('http://builly-project.mycloudsfireworks.workers.dev', {
      isProd: true,
    });
    expect(bad.isConfigured).toBe(false);
    expect(bad.origin).toBe('');
    expect(bad.error).toBeInstanceOf(ApiConfigurationError);
  });

  it('builds the exact absolute /api/console/bootstrap URL and never concatenates hostnames as relative paths', () => {
    const endpoint = buildConsoleApiUrl(
      '/api/console/bootstrap',
      'builly-project.mycloudsfireworks.workers.dev'
    );
    expect(endpoint).toBe('https://builly-project.mycloudsfireworks.workers.dev/api/console/bootstrap');
    expect(endpoint).not.toContain('run.app/builly-project.mycloudsfireworks.workers.dev');
  });

  it('workspaceHierarchyClient.getBootstrap calls the absolute Worker HTTPS URL and diagnoses HTTP status & network errors', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: { owner_id: 'owner-1', email: 'owner@example.com' },
          organizations: [],
          projects: [],
          modules: [],
          sites: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchSpy);

    const bootstrap = await workspaceHierarchyClient.getBootstrap('valid-test-jwt');
    expect(bootstrap.organizations).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toMatch(/^https?:\/\//);
    expect(calledUrl.endsWith('/api/console/bootstrap')).toBe(true);
    expect(calledUrl).not.toContain('run.app/builly-project.mycloudsfireworks.workers.dev');

    // Non-JSON 404 diagnostic
    fetchSpy.mockResolvedValueOnce(
      new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    );
    await expect(workspaceHierarchyClient.getBootstrap('valid-test-jwt')).rejects.toMatchObject({
      status: 404,
      code: 'WORKER_ROUTE_NOT_FOUND',
    } satisfies Partial<WorkerApiError>);

    // JSON 401 diagnostic
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Authentication required.', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(workspaceHierarchyClient.getBootstrap('valid-test-jwt')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    } satisfies Partial<WorkerApiError>);

    // JSON 403 diagnostic
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(workspaceHierarchyClient.getBootstrap('valid-test-jwt')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    } satisfies Partial<WorkerApiError>);

    // Network/CORS rejection
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(workspaceHierarchyClient.getBootstrap('valid-test-jwt')).rejects.toMatchObject({
      status: 503,
      code: 'WORKER_UNREACHABLE',
    } satisfies Partial<WorkerApiError>);
  });
});
