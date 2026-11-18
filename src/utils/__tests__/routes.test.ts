import { describe, expect, it } from 'vitest';
import { validatePortfolioSlug } from '../../config/breakpoints';
import {
  buildBuilderUrl,
  buildConsoleUrl,
  buildLoginUrl,
  parseBuilderProjectParams,
  parseConsoleRoute,
  resolveAppRouteKind,
  resolvePublicSiteFromPath,
  sanitizeReturnTo,
} from '../routes';

describe('Builly routing, reserved system routes & returnTo safety', () => {
  it('routes / to Landing Page and reserves /console, /orgs, /projects, and Builder aliases', () => {
    expect(resolveAppRouteKind('/')).toBe('landing');
    expect(resolveAppRouteKind('/login')).toBe('login');
    expect(resolveAppRouteKind('/auth/callback')).toBe('auth-callback');
    expect(resolveAppRouteKind('/console')).toBe('console');
    expect(resolveAppRouteKind('/console/org_1')).toBe('console');
    expect(resolveAppRouteKind('/console/orgs/org_1/projects/prj_1')).toBe('console');
    expect(resolveAppRouteKind('/orgs')).toBe('console');
    expect(resolveAppRouteKind('/orgs/acme')).toBe('console');
    expect(resolveAppRouteKind('/projects')).toBe('console');
    expect(resolveAppRouteKind('/projects/prj_1')).toBe('console');
    expect(resolveAppRouteKind('/workspace')).toBe('workspace');
    expect(resolveAppRouteKind('/connect-workspace')).toBe('workspace');
    expect(resolveAppRouteKind('/builder')).toBe('builder');
    expect(resolveAppRouteKind('/builder/pages/about')).toBe('builder');
    expect(resolveAppRouteKind('/editor')).toBe('builder');
    expect(resolveAppRouteKind('/app')).toBe('builder');
  });

  it('parses and builds Console hierarchy & Builder project URLs accurately', () => {
    expect(parseConsoleRoute('/console')).toEqual({ view: 'overview' });
    expect(parseConsoleRoute('/console/orgs/org_123')).toEqual({
      view: 'org',
      orgId: 'org_123',
    });
    expect(parseConsoleRoute('/console/orgs/org_123/projects/prj_456')).toEqual({
      view: 'project',
      orgId: 'org_123',
      projectId: 'prj_456',
    });
    expect(parseConsoleRoute('/console/orgs/org_123/projects/prj_456/cms')).toEqual({
      view: 'project',
      orgId: 'org_123',
      projectId: 'prj_456',
      moduleSlug: 'cms',
    });
    expect(parseConsoleRoute('/projects/prj_999/inbox')).toEqual({
      view: 'project',
      projectId: 'prj_999',
      moduleSlug: 'inbox',
    });

    expect(buildConsoleUrl()).toBe('/console');
    expect(buildConsoleUrl({ orgId: 'org_1' })).toBe('/console/orgs/org_1');
    expect(buildConsoleUrl({ orgId: 'org_1', projectId: 'prj_2' })).toBe(
      '/console/orgs/org_1/projects/prj_2'
    );
    expect(buildBuilderUrl({ orgId: 'org_1', projectId: 'prj_2' })).toBe(
      '/builder?orgId=org_1&projectId=prj_2'
    );
    expect(parseBuilderProjectParams('?orgId=org_1&projectId=prj_2')).toEqual({
      orgId: 'org_1',
      projectId: 'prj_2',
    });
  });

  it('resolves explicit /s/{site_slug} and legacy /{site_slug} public site routes without capturing system routes', () => {
    expect(resolveAppRouteKind('/acme-studio')).toBe('public-site');
    expect(resolvePublicSiteFromPath('/acme-studio/work')).toEqual({
      siteSlug: 'acme-studio',
      sitePagePath: '/work',
    });

    expect(resolveAppRouteKind('/s/acme-studio')).toBe('public-site');
    expect(resolvePublicSiteFromPath('/s/acme-studio/about')).toEqual({
      siteSlug: 'acme-studio',
      sitePagePath: '/about',
    });
    // Explicit /s/ escape hatch remains reachable even for legacy slugs matching reserved words
    expect(resolvePublicSiteFromPath('/s/console/home')).toEqual({
      siteSlug: 'console',
      sitePagePath: '/home',
    });

    // Top-level reserved segments must never be treated as public site slugs
    expect(resolvePublicSiteFromPath('/console')).toBeNull();
    expect(resolvePublicSiteFromPath('/orgs')).toBeNull();
    expect(resolvePublicSiteFromPath('/projects')).toBeNull();
    expect(resolvePublicSiteFromPath('/builder')).toBeNull();
    expect(resolvePublicSiteFromPath('/workspace')).toBeNull();
  });

  it('rejects all newly reserved slugs in validatePortfolioSlug', () => {
    for (const reserved of ['console', 'orgs', 'projects', 'workspace', 'builder', 's', 'api']) {
      const res = validatePortfolioSlug(reserved);
      expect(res.valid).toBe(false);
    }
    expect(validatePortfolioSlug('acme-studio-2026')).toEqual({
      valid: true,
      normalized: 'acme-studio-2026',
    });
  });

  it('prevents open redirects and auth loops in sanitizeReturnTo', () => {
    expect(sanitizeReturnTo('/console')).toBe('/console');
    expect(sanitizeReturnTo('/builder?page=about')).toBe('/builder?page=about');
    expect(sanitizeReturnTo('/workspace')).toBe('/workspace');
    expect(sanitizeReturnTo('https://evil.example/steal')).toBe('/builder');
    expect(sanitizeReturnTo('//evil.example')).toBe('/builder');
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/builder');
    expect(sanitizeReturnTo('/login')).toBe('/builder');
    expect(sanitizeReturnTo('/auth/callback?code=123')).toBe('/builder');
  });

  it('builds safe login URLs with encoded returnTo destinations', () => {
    expect(buildLoginUrl('/builder')).toBe('/login');
    expect(buildLoginUrl('/console')).toBe('/login?returnTo=%2Fconsole');
    expect(buildLoginUrl('/builder?page=works')).toBe(
      '/login?returnTo=%2Fbuilder%3Fpage%3Dworks'
    );
    expect(buildLoginUrl('https://evil.example')).toBe('/login');
  });
});
