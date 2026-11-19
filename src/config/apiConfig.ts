const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class ApiConfigurationError extends Error {
  code: string;

  constructor(message: string, code = 'INVALID_API_CONFIGURATION') {
    super(message);
    this.name = 'ApiConfigurationError';
    this.code = code;
  }
}

export interface ResolveApiOriginOptions {
  isProd?: boolean;
}

/**
 * Normalizes and validates the Console / Worker API origin once.
 * - Rejects malformed values or relative paths rather than falling back to window.location.origin.
 * - Prepends https:// when a bare hostname (e.g. "builly-project.mycloudsfireworks.workers.dev") is provided.
 * - Requires HTTPS for all non-local hosts (and in production builds).
 * - Returns canonical `url.origin` without trailing slashes or path segments.
 */
export function resolveConsoleApiOrigin(
  rawValue: string | undefined | null,
  options: ResolveApiOriginOptions = {}
): string {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) {
    throw new ApiConfigurationError(
      'Missing Console API base URL configuration (VITE_CONSOLE_API_BASE_URL).',
      'MISSING_API_CONFIGURATION'
    );
  }

  if (value.startsWith('/') || value.startsWith('.')) {
    throw new ApiConfigurationError(
      `Invalid Console API base URL "${value}": must be an absolute origin, not a relative path.`,
      'INVALID_API_CONFIGURATION'
    );
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  const isBareLocalHost =
    !hasScheme && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i.test(value);
  const normalized = hasScheme ? value : `${isBareLocalHost ? 'http' : 'https'}://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ApiConfigurationError(
      `Malformed Console API base URL "${value}". Expected https://<worker-host>.`,
      'INVALID_API_CONFIGURATION'
    );
  }

  if (parsed.username || parsed.password) {
    throw new ApiConfigurationError(
      'Console API base URL must not contain embedded credentials.',
      'INVALID_API_CONFIGURATION'
    );
  }

  if (!parsed.hostname || parsed.hostname.includes(' ')) {
    throw new ApiConfigurationError(
      `Malformed Console API base URL "${value}": invalid hostname.`,
      'INVALID_API_CONFIGURATION'
    );
  }

  const isLocalHostname = LOCAL_DEV_HOSTS.has(parsed.hostname.toLowerCase());
  const isProd = options.isProd ?? Boolean(import.meta.env?.PROD);

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ApiConfigurationError(
      `Console API base URL must use HTTPS (received ${parsed.protocol}).`,
      'INVALID_API_CONFIGURATION'
    );
  }

  if ((isProd || !isLocalHostname) && parsed.protocol !== 'https:' && !isLocalHostname) {
    throw new ApiConfigurationError(
      `Console API base URL must use HTTPS for non-local host "${parsed.hostname}".`,
      'INVALID_API_CONFIGURATION'
    );
  }

  return parsed.origin;
}

export interface ConsoleApiConfigState {
  origin: string;
  rawConfigured: string;
  isConfigured: boolean;
  error: ApiConfigurationError | null;
}

function readRawApiBaseUrl(): string {
  const env = (import.meta.env || {}) as Record<string, string | undefined>;
  const preferred = typeof env.VITE_CONSOLE_API_BASE_URL === 'string' ? env.VITE_CONSOLE_API_BASE_URL.trim() : '';
  if (preferred) return preferred;
  const legacy = typeof env.VITE_WORKER_API_URL === 'string' ? env.VITE_WORKER_API_URL.trim() : '';
  return legacy;
}

export function evaluateConsoleApiConfig(
  rawOverride?: string | null,
  options?: ResolveApiOriginOptions
): ConsoleApiConfigState {
  const rawConfigured = rawOverride !== undefined ? (rawOverride || '').trim() : readRawApiBaseUrl();
  if (!rawConfigured) {
    return {
      origin: '',
      rawConfigured: '',
      isConfigured: false,
      error: null,
    };
  }

  try {
    const origin = resolveConsoleApiOrigin(rawConfigured, options);
    return {
      origin,
      rawConfigured,
      isConfigured: true,
      error: null,
    };
  } catch (err) {
    return {
      origin: '',
      rawConfigured,
      isConfigured: false,
      error:
        err instanceof ApiConfigurationError
          ? err
          : new ApiConfigurationError(
              err instanceof Error ? err.message : 'Invalid Console API base URL configuration.'
            ),
    };
  }
}

export const CONSOLE_API_CONFIG: ConsoleApiConfigState = evaluateConsoleApiConfig();

function isStandalonePreviewHost(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  const host = (window.location.hostname || '').toLowerCase();
  return (
    host.endsWith('.run.app') &&
    (host.startsWith('ais-dev-') || host.startsWith('ais-pre-'))
  );
}

/**
 * Constructs an absolute Console/Worker API endpoint URL using the centrally resolved origin.
 * Never constructs a relative path with a Worker hostname and never falls back to window.location.origin
 * when configuration is malformed or when running inside a separate preview origin.
 */
export function buildConsoleApiUrl(
  path: string,
  overrideOrigin?: string
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (overrideOrigin !== undefined) {
    const resolved = resolveConsoleApiOrigin(overrideOrigin);
    return new URL(normalizedPath, resolved).toString();
  }

  if (CONSOLE_API_CONFIG.error) {
    throw CONSOLE_API_CONFIG.error;
  }

  if (CONSOLE_API_CONFIG.origin) {
    return new URL(normalizedPath, CONSOLE_API_CONFIG.origin).toString();
  }

  if (isStandalonePreviewHost()) {
    throw new ApiConfigurationError(
      'Missing VITE_CONSOLE_API_BASE_URL for AI Studio preview. Set it to https://builly-project.mycloudsfireworks.workers.dev.',
      'MISSING_API_CONFIGURATION'
    );
  }

  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    return new URL(normalizedPath, window.location.origin).toString();
  }

  return normalizedPath;
}
