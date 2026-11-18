import { useCallback, useEffect, useState } from 'react';
import { RESERVED_SYSTEM_SLUGS } from '../config/breakpoints';

export type AppRouteKind =
  | 'landing'
  | 'login'
  | 'auth-callback'
  | 'console'
  | 'workspace'
  | 'builder'
  | 'public-site';

export interface AppRouteState {
  kind: AppRouteKind;
  pathname: string;
  search: string;
  hash: string;
  fullPath: string;
  siteSlug?: string;
  sitePagePath?: string;
}

const CONSOLE_PREFIXES = ['/console', '/orgs', '/projects'];
const BUILDER_PREFIXES = ['/builder', '/editor', '/app'];
const RESERVED_FIRST_SEGMENTS = RESERVED_SYSTEM_SLUGS;

export type ConsoleModuleSlug =
  | 'cms'
  | 'inbox'
  | 'assets'
  | 'publishing'
  | 'versions'
  | 'settings';

export interface ConsoleRouteTarget {
  view: 'overview' | 'org' | 'project';
  orgId?: string;
  projectId?: string;
  moduleSlug?: ConsoleModuleSlug;
}

const CONSOLE_MODULE_SLUGS: ReadonlySet<string> = new Set([
  'cms',
  'inbox',
  'assets',
  'publishing',
  'versions',
  'settings',
]);

export function parseConsoleRoute(pathname: string): ConsoleRouteTarget {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  const segments = normalized.split('/').filter(Boolean);

  // /console/orgs/:orgId/projects/:projectId(/:moduleSlug)
  if (
    segments[0] === 'console' &&
    segments[1] === 'orgs' &&
    segments[2] &&
    segments[3] === 'projects' &&
    segments[4]
  ) {
    const rawMod = segments[5]?.toLowerCase();
    return {
      view: 'project',
      orgId: decodeURIComponent(segments[2]),
      projectId: decodeURIComponent(segments[4]),
      ...(rawMod && CONSOLE_MODULE_SLUGS.has(rawMod)
        ? { moduleSlug: rawMod as ConsoleModuleSlug }
        : {}),
    };
  }

  // /console/orgs/:orgId
  if (segments[0] === 'console' && segments[1] === 'orgs' && segments[2]) {
    return {
      view: 'org',
      orgId: decodeURIComponent(segments[2]),
    };
  }

  // /console/:orgId (direct org shorthand)
  if (
    segments[0] === 'console' &&
    segments[1] &&
    segments[1] !== 'orgs' &&
    segments[1] !== 'projects'
  ) {
    return {
      view: 'org',
      orgId: decodeURIComponent(segments[1]),
    };
  }

  // /orgs/:orgId/projects/:projectId(/:moduleSlug)
  if (segments[0] === 'orgs' && segments[1] && segments[2] === 'projects' && segments[3]) {
    const rawMod = segments[4]?.toLowerCase();
    return {
      view: 'project',
      orgId: decodeURIComponent(segments[1]),
      projectId: decodeURIComponent(segments[3]),
      ...(rawMod && CONSOLE_MODULE_SLUGS.has(rawMod)
        ? { moduleSlug: rawMod as ConsoleModuleSlug }
        : {}),
    };
  }

  // /orgs/:orgId
  if (segments[0] === 'orgs' && segments[1]) {
    return {
      view: 'org',
      orgId: decodeURIComponent(segments[1]),
    };
  }

  // /projects/:projectId(/:moduleSlug)
  if (segments[0] === 'projects' && segments[1]) {
    const rawMod = segments[2]?.toLowerCase();
    return {
      view: 'project',
      projectId: decodeURIComponent(segments[1]),
      ...(rawMod && CONSOLE_MODULE_SLUGS.has(rawMod)
        ? { moduleSlug: rawMod as ConsoleModuleSlug }
        : {}),
    };
  }

  return { view: 'overview' };
}

export function buildConsoleUrl(params?: {
  orgId?: string;
  projectId?: string;
  moduleSlug?: ConsoleModuleSlug;
}): string {
  if (params?.orgId && params?.projectId) {
    const base = `/console/orgs/${encodeURIComponent(params.orgId)}/projects/${encodeURIComponent(
      params.projectId
    )}`;
    return params.moduleSlug ? `${base}/${params.moduleSlug}` : base;
  }
  if (params?.orgId) {
    return `/console/orgs/${encodeURIComponent(params.orgId)}`;
  }
  if (params?.projectId) {
    const base = `/projects/${encodeURIComponent(params.projectId)}`;
    return params.moduleSlug ? `${base}/${params.moduleSlug}` : base;
  }
  return '/console';
}

export function buildBuilderUrl(params?: { orgId?: string; projectId?: string }): string {
  const qs = new URLSearchParams();
  if (params?.orgId) qs.set('orgId', params.orgId);
  if (params?.projectId) qs.set('projectId', params.projectId);
  const query = qs.toString();
  return query ? `/builder?${query}` : '/builder';
}

export function parseBuilderProjectParams(search: string): {
  orgId?: string;
  projectId?: string;
} {
  const params = new URLSearchParams(search || '');
  const orgId = params.get('orgId')?.trim() || undefined;
  const projectId = params.get('projectId')?.trim() || undefined;
  return { orgId, projectId };
}

export function sanitizeReturnTo(raw?: string | null, fallback = '/builder'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }
  // Prevent auth redirect loops back to /login or /auth/callback
  const pathOnly = trimmed.split(/[?#]/)[0].toLowerCase();
  if (pathOnly === '/login' || pathOnly === '/auth/callback') {
    return fallback;
  }
  return trimmed;
}

export function resolvePublicSiteFromPath(
  pathname: string
): { siteSlug: string; sitePagePath: string } | null {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') return null;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // Support explicit /s/{site-slug}/... staging prefix as well as /{site-slug}/...
  if (segments[0] === 's' && segments[1] && /^[a-z0-9][a-z0-9-]{1,47}$/i.test(segments[1])) {
    const rest = segments.slice(2).join('/');
    return {
      siteSlug: segments[1].toLowerCase(),
      sitePagePath: rest ? `/${rest}` : '/',
    };
  }

  const first = segments[0].toLowerCase();
  if (RESERVED_FIRST_SEGMENTS.has(first) || first.includes('.')) {
    return null;
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(first) && first.length >= 3 && first.length <= 48) {
    const rest = segments.slice(1).join('/');
    return {
      siteSlug: first,
      sitePagePath: rest ? `/${rest}` : '/',
    };
  }
  return null;
}

export function resolveAppRouteKind(pathname: string): AppRouteKind {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') return 'landing';
  if (normalized === '/login') return 'login';
  if (normalized === '/auth/callback') return 'auth-callback';
  if (
    CONSOLE_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
    )
  ) {
    return 'console';
  }
  if (normalized === '/workspace' || normalized === '/connect-workspace') return 'workspace';
  if (
    BUILDER_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
    )
  ) {
    return 'builder';
  }
  if (resolvePublicSiteFromPath(normalized)) {
    return 'public-site';
  }
  return 'landing';
}

export function getCurrentRouteState(): AppRouteState {
  if (typeof window === 'undefined') {
    return {
      kind: 'landing',
      pathname: '/',
      search: '',
      hash: '',
      fullPath: '/',
    };
  }
  const { pathname, search, hash } = window.location;
  // Support legacy deep-link query params directly on /?page=... or /?tab=...
  const params = new URLSearchParams(search);
  const hasLegacyBuilderQuery =
    pathname === '/' && (params.has('page') || params.has('builder') || params.has('tab'));

  const kind = hasLegacyBuilderQuery ? 'builder' : resolveAppRouteKind(pathname);
  const publicMatch = kind === 'public-site' ? resolvePublicSiteFromPath(pathname) : null;

  return {
    kind,
    pathname,
    search,
    hash,
    fullPath: `${pathname}${search}${hash}`,
    ...(publicMatch ? publicMatch : {}),
  };
}

export function buildLoginUrl(returnTo?: string): string {
  const safeTarget = sanitizeReturnTo(returnTo, '/builder');
  if (safeTarget === '/builder') {
    return '/login';
  }
  return `/login?returnTo=${encodeURIComponent(safeTarget)}`;
}

const NAVIGATE_EVENT = 'builly:navigate';

export function navigateTo(to: string, options?: { replace?: boolean }): void {
  if (typeof window === 'undefined') return;
  const target = to.startsWith('/') ? to : `/${to}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` === target) {
    return;
  }
  if (options?.replace) {
    window.history.replaceState(null, '', target);
  } else {
    window.history.pushState(null, '', target);
  }
  window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT));
}

export function useAppRouter(): {
  route: AppRouteState;
  navigate: (to: string, options?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = useState<AppRouteState>(() => getCurrentRouteState());

  useEffect(() => {
    const sync = () => setRoute(getCurrentRouteState());
    window.addEventListener('popstate', sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    navigateTo(to, options);
  }, []);

  return { route, navigate };
}
