import { WorkerEnv } from '../types';

export interface SiteRegistryRecord {
  site_id: string;
  site_slug: string;
  custom_domain: string | null;
  owner_id: string;
  site_name: string;
  status: 'draft' | 'published' | 'suspended';
  active_publish_version: string;
  active_build_id: string;
  publish_manifest_drive_file_id: string;
  runtime_config_drive_file_id: string;
  integrity_hash: string;
  schema_version: number;
  updated_at: string;
}

export interface SiteFormDestinationRecord {
  id: string;
  site_id: string;
  form_id: string;
  owner_id: string;
  form_name: string;
  category_id: string;
  destination_spreadsheet_id: string;
  destination_worksheet_name: string;
  inbox_registry_spreadsheet_id: string;
  field_mappings_json: string;
  status: string;
  updated_at: string;
}

export interface SiteDatasetResourceRecord {
  resource_id: string;
  site_id: string;
  owner_id: string;
  domain_kind: 'cms' | 'inbox' | 'system';
  dataset_key: string;
  spreadsheet_id: string;
  worksheet_name: string;
  schema_version: number;
  status: string;
  updated_at: string;
}

export const RESERVED_SITE_SLUGS: ReadonlySet<string> = new Set([
  'console',
  'orgs',
  'projects',
  'workspace',
  'connect-workspace',
  'builder',
  'editor',
  'app',
  'login',
  'auth',
  'signup',
  'admin',
  'dashboard',
  'preview',
  'settings',
  'api',
  'assets',
  'static',
  'public',
  's',
]);

export function normalizeSlug(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateSiteSlug(raw: string): {
  valid: boolean;
  normalized: string;
  code?: 'INVALID_SITE_SLUG' | 'RESERVED_SITE_SLUG';
  error?: string;
} {
  const trimmed = (raw || '').trim().toLowerCase();
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      code: 'INVALID_SITE_SLUG',
      error: 'Site slug cannot be empty.',
    };
  }
  if (RESERVED_SITE_SLUGS.has(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      code: 'RESERVED_SITE_SLUG',
      error: `"${trimmed}" is a reserved system route.`,
    };
  }
  if (trimmed.length < 3 || trimmed.length > 48) {
    return {
      valid: false,
      normalized: trimmed,
      code: 'INVALID_SITE_SLUG',
      error: 'Site slug must be 3–48 characters.',
    };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      code: 'INVALID_SITE_SLUG',
      error: 'Use lowercase letters, numbers, and single hyphens only.',
    };
  }
  return { valid: true, normalized: trimmed };
}

export function escapeSheetCell(value: unknown): string {
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Defensive Worker-side scrubber guarantees that even if an older snapshot in Drive
 * contained private fields, visitors never receive ownerId, OAuth tokens, Spreadsheet IDs,
 * Inbox submissions, notes, or form destinations.
 */
const FORBIDDEN_VISITOR_KEYS = new Set([
  'ownerId',
  'owner_id',
  'owner_account_id',
  'accessToken',
  'refreshToken',
  'driveFolderId',
  'spreadsheetId',
  'spreadsheet_id',
  'destination_spreadsheet_id',
  'inbox_registry_spreadsheet_id',
  'inboxSubmissions',
  'inboxCategories',
  'inboxNotes',
  'inboxActivities',
  'operationalLogs',
  'storageHealth',
  'destination',
  'fieldMappings',
]);

function scrubVisitorKeysDeep(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 20) return;
  if (Array.isArray(value)) {
    for (const item of value) scrubVisitorKeysDeep(item, depth + 1);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_VISITOR_KEYS.has(key)) {
      delete obj[key];
    } else {
      scrubVisitorKeysDeep(obj[key], depth + 1);
    }
  }
}

export function scrubSnapshotForVisitor(raw: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  scrubVisitorKeysDeep(copy);

  if (copy.publicCms && typeof copy.publicCms === 'object') {
    const cms = copy.publicCms as Record<string, unknown>;
    delete cms.forms;

    if (Array.isArray(cms.contentTypes) && Array.isArray(cms.records)) {
      const hiddenFieldsByType = new Map<string, Set<string>>();
      const allowedTypeIds = new Set<string>();
      for (const ct of cms.contentTypes as Array<Record<string, unknown>>) {
        if (ct.enabled !== false && ct.publiclyPublishable !== false && typeof ct.id === 'string') {
          allowedTypeIds.add(ct.id);
          const hidden = new Set<string>();
          if (Array.isArray(ct.fields)) {
            for (const f of ct.fields as Array<Record<string, unknown>>) {
              if (f.publiclyExposed === false && typeof f.key === 'string') {
                hidden.add(f.key);
              }
            }
            ct.fields = (ct.fields as Array<Record<string, unknown>>).filter(
              (f) => f.publiclyExposed !== false
            );
          }
          hiddenFieldsByType.set(ct.id, hidden);
        }
      }

      cms.records = (cms.records as Array<Record<string, unknown>>)
        .filter((r) => r.status === 'published' && allowedTypeIds.has(String(r.contentTypeId || '')))
        .map((r) => {
          const hidden = hiddenFieldsByType.get(String(r.contentTypeId || ''));
          if (!hidden || hidden.size === 0 || !r.fields || typeof r.fields !== 'object') return r;
          const cleanFields: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(r.fields as Record<string, unknown>)) {
            if (!hidden.has(k)) cleanFields[k] = v;
          }
          return { ...r, fields: cleanFields };
        });
    }
  }

  if (copy.publicForms && typeof copy.publicForms === 'object') {
    for (const formVal of Object.values(copy.publicForms as Record<string, unknown>)) {
      if (formVal && typeof formVal === 'object') {
        const formObj = formVal as Record<string, unknown>;
        delete formObj.destination;
        delete formObj.fieldMappings;
        delete formObj.spreadsheetId;
      }
    }
  }

  return copy;
}

export async function resolvePublishedSiteBySlugOrHost(
  env: WorkerEnv,
  params: { slug?: string; host?: string }
): Promise<SiteRegistryRecord | null> {
  if (params.host) {
    const cleanHost = params.host.trim().toLowerCase().replace(/:\d+$/, '');
    if (cleanHost) {
      const byHost = await env.DB.prepare(
        `SELECT * FROM site_registry WHERE lower(custom_domain) = ? AND status = 'published' LIMIT 1`
      )
        .bind(cleanHost)
        .first<SiteRegistryRecord>();
      if (byHost) return byHost;
    }
  }

  if (params.slug) {
    const cleanSlug = normalizeSlug(params.slug);
    if (!cleanSlug) return null;
    const bySlug = await env.DB.prepare(
      `SELECT * FROM site_registry WHERE site_slug = ? AND status = 'published' LIMIT 1`
    )
      .bind(cleanSlug)
      .first<SiteRegistryRecord>();
    if (bySlug) return bySlug;
  }

  return null;
}

export async function checkRateLimit(
  env: WorkerEnv,
  bucketKey: string,
  limitPerMinute: number
): Promise<{ allowed: boolean; remaining: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % 60);

  const existing = await env.DB.prepare(
    `SELECT window_start, count FROM runtime_rate_limits WHERE bucket_key = ?`
  )
    .bind(bucketKey)
    .first<{ window_start: number; count: number }>();

  if (!existing || existing.window_start !== windowStart) {
    await env.DB.prepare(
      `INSERT INTO runtime_rate_limits (bucket_key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(bucket_key) DO UPDATE SET window_start = excluded.window_start, count = 1`
    )
      .bind(bucketKey, windowStart)
      .run();
    return { allowed: true, remaining: Math.max(0, limitPerMinute - 1) };
  }

  if (existing.count >= limitPerMinute) {
    return { allowed: false, remaining: 0 };
  }

  const nextCount = existing.count + 1;
  await env.DB.prepare(`UPDATE runtime_rate_limits SET count = ? WHERE bucket_key = ?`)
    .bind(nextCount, bucketKey)
    .run();

  return { allowed: true, remaining: Math.max(0, limitPerMinute - nextCount) };
}

export async function purgeSiteRuntimeCache(requestUrl: string, siteSlug: string): Promise<void> {
  try {
    const cacheStorage = (caches as unknown as { default?: Cache }).default;
    if (!cacheStorage) return;
    const origin = new URL(requestUrl).origin;
    const keys = [
      `${origin}/api/public/sites/${encodeURIComponent(siteSlug)}/runtime`,
      `${origin}/api/public/sites/resolve?slug=${encodeURIComponent(siteSlug)}`,
    ];
    await Promise.all(keys.map((k) => cacheStorage.delete(new Request(k))));
  } catch {
    // Non-fatal in local/test environments without Cache API
  }
}
