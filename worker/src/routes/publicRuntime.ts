import { mintOwnerGoogleAccessToken } from '../services/googleTokenVault';
import {
  checkRateLimit,
  escapeSheetCell,
  normalizeSlug,
  resolvePublishedSiteBySlugOrHost,
  scrubSnapshotForVisitor,
  SiteDatasetResourceRecord,
  SiteFormDestinationRecord,
} from '../services/siteRegistryService';
import { WorkerEnv } from '../types';

interface PublicCmsQueryBody {
  contentTypeId?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  taxonomyId?: string;
  termId?: string;
  // Explicitly reject/ignore any client-supplied spreadsheet/owner overrides
  spreadsheetId?: unknown;
  worksheetName?: unknown;
  ownerId?: unknown;
}

interface PublicFormSubmitBody {
  fields?: Record<string, unknown>;
  sourcePage?: string;
  _hp?: string; // honeypot
}

function getCacheStorage(): Cache | null {
  try {
    return (caches as unknown as { default?: Cache }).default || null;
  } catch {
    return null;
  }
}

async function loadActiveRuntimeSnapshot(
  env: WorkerEnv,
  site: {
    site_id: string;
    site_slug: string;
    owner_id: string;
    active_publish_version: string;
    runtime_config_drive_file_id: string;
  },
  requestUrl: string
): Promise<{ snapshot: Record<string, unknown>; cacheHit: boolean }> {
  const cacheStorage = getCacheStorage();
  const origin = new URL(requestUrl).origin;
  const versionedCacheUrl = `${origin}/api/public/sites/${encodeURIComponent(
    site.site_slug
  )}/runtime?v=${encodeURIComponent(site.active_publish_version)}`;

  const warmEdgeCache = async (cleanSnapshot: Record<string, unknown>) => {
    if (!cacheStorage) return;
    const cacheRes = new Response(JSON.stringify(cleanSnapshot), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    });
    await cacheStorage.put(new Request(versionedCacheUrl), cacheRes).catch(() => undefined);
  };

  // 1. Edge Cache
  if (cacheStorage) {
    const cached = await cacheStorage.match(new Request(versionedCacheUrl));
    if (cached) {
      const json = (await cached.json()) as Record<string, unknown>;
      return { snapshot: scrubSnapshotForVisitor(json), cacheHit: true };
    }
  }

  // 2. R2 immutable public artifacts bucket (zero OAuth required)
  if (env.PUBLIC_ARTIFACTS && site.site_id && site.active_publish_version) {
    const r2Key = `sites/${site.site_id}/published/${site.active_publish_version}.json`;
    const r2Obj = await env.PUBLIC_ARTIFACTS.get(r2Key).catch(() => null);
    if (r2Obj) {
      const rawJson = (await r2Obj.json().catch(() => null)) as Record<string, unknown> | null;
      if (rawJson) {
        const cleanSnapshot = scrubSnapshotForVisitor(rawJson);
        await warmEdgeCache(cleanSnapshot);
        return { snapshot: cleanSnapshot, cacheHit: true };
      }
    }
  }

  // 3. Derived D1 public_runtime_artifacts index (continues serving even if owner OAuth disconnects)
  if (site.site_id && site.active_publish_version) {
    const artifactRow = await env.DB.prepare(
      `SELECT snapshot_json FROM public_runtime_artifacts
       WHERE site_id = ? AND publish_version = ?
       LIMIT 1`
    )
      .bind(site.site_id, site.active_publish_version)
      .first<{ snapshot_json: string }>()
      .catch(() => null);

    if (artifactRow?.snapshot_json) {
      try {
        const parsed = JSON.parse(artifactRow.snapshot_json) as Record<string, unknown>;
        const cleanSnapshot = scrubSnapshotForVisitor(parsed);
        await warmEdgeCache(cleanSnapshot);
        return { snapshot: cleanSnapshot, cacheHit: true };
      } catch {
        // Fall through cleanly if JSON corrupted
      }
    }
  }

  // 4. Last-resort Drive fallback -> hydrate D1 public_runtime_artifacts + R2 + Edge Cache
  const { accessToken } = await mintOwnerGoogleAccessToken(env, site.owner_id);
  const driveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      site.runtime_config_drive_file_id
    )}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!driveRes.ok) {
    throw new Error(`SNAPSHOT_LOAD_FAILED_${driveRes.status}`);
  }

  const rawJson = (await driveRes.json()) as Record<string, unknown>;
  const cleanSnapshot = scrubSnapshotForVisitor(rawJson);
  const cleanJsonStr = JSON.stringify(cleanSnapshot);

  await env.DB.prepare(
    `INSERT INTO public_runtime_artifacts (
       site_id, publish_version, build_id, integrity_hash, snapshot_json, drive_file_id, indexed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(site_id, publish_version) DO UPDATE SET
       snapshot_json = excluded.snapshot_json,
       indexed_at = excluded.indexed_at`
  )
    .bind(
      site.site_id,
      site.active_publish_version,
      String(cleanSnapshot.buildId || ''),
      String(cleanSnapshot.integrityHash || ''),
      cleanJsonStr,
      site.runtime_config_drive_file_id,
      new Date().toISOString()
    )
    .run()
    .catch(() => undefined);

  if (env.PUBLIC_ARTIFACTS && site.site_id && site.active_publish_version) {
    await env.PUBLIC_ARTIFACTS.put(
      `sites/${site.site_id}/published/${site.active_publish_version}.json`,
      cleanJsonStr,
      {
        httpMetadata: {
          contentType: 'application/json',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      }
    ).catch(() => undefined);
  }

  await warmEdgeCache(cleanSnapshot);

  return { snapshot: cleanSnapshot, cacheHit: false };
}

export async function handlePublicResolveSite(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || undefined;
  const host = url.searchParams.get('host') || undefined;

  const site = await resolvePublishedSiteBySlugOrHost(env, { slug, host });
  if (!site) {
    return Response.json({ found: false }, { status: 404 });
  }

  return Response.json(
    {
      found: true,
      siteId: site.site_id,
      siteSlug: site.site_slug,
      siteName: site.site_name,
      status: site.status,
      publishVersion: site.active_publish_version,
      buildId: site.active_build_id,
      schemaVersion: site.schema_version,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60',
      },
    }
  );
}

export async function handlePublicGetRuntimeSnapshot(
  request: Request,
  env: WorkerEnv,
  rawSiteSlug: string
): Promise<Response> {
  const siteSlug = normalizeSlug(rawSiteSlug);
  const site = await resolvePublishedSiteBySlugOrHost(env, {
    slug: siteSlug,
    host: request.headers.get('Host') || undefined,
  });

  if (!site || !site.runtime_config_drive_file_id) {
    return Response.json(
      { error: 'Published website not found.', code: 'SITE_NOT_PUBLISHED' },
      { status: 404 }
    );
  }

  try {
    const { snapshot, cacheHit } = await loadActiveRuntimeSnapshot(env, site, request.url);
    return Response.json(
      {
        ok: true,
        siteSlug: site.site_slug,
        publishVersion: site.active_publish_version,
        cacheHit,
        snapshot,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=120, s-maxage=600',
          'X-Builly-Cache': cacheHit ? 'HIT' : 'MISS',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RUNTIME_ERROR';
    return Response.json(
      { error: 'Unable to load published website configuration.', code: msg },
      { status: 502 }
    );
  }
}

const ALLOWED_SORT_FIELDS = new Set(['sortOrder', 'publishedAt', 'createdAt', 'updatedAt', 'title']);

export async function handlePublicCmsQuery(
  request: Request,
  env: WorkerEnv,
  rawSiteSlug: string
): Promise<Response> {
  const siteSlug = normalizeSlug(rawSiteSlug);
  const site = await resolvePublishedSiteBySlugOrHost(env, { slug: siteSlug });
  if (!site) {
    return Response.json({ error: 'Published site not found.' }, { status: 404 });
  }

  let body: PublicCmsQueryBody;
  try {
    body = (await request.json()) as PublicCmsQueryBody;
  } catch {
    return Response.json({ error: 'Invalid JSON query body.' }, { status: 400 });
  }

  // Strictly reject client attempts to specify raw Spreadsheet IDs, worksheet names, or owner IDs
  if (body.spreadsheetId !== undefined || body.worksheetName !== undefined || body.ownerId !== undefined) {
    return Response.json(
      { error: 'Client-supplied spreadsheet or owner overrides are forbidden.', code: 'FORBIDDEN_QUERY_PARAM' },
      { status: 403 }
    );
  }

  const contentTypeId = String(body.contentTypeId || '').trim();
  if (!contentTypeId || !/^[a-zA-Z0-9_-]{1,64}$/.test(contentTypeId)) {
    return Response.json({ error: 'Invalid contentTypeId.' }, { status: 400 });
  }

  const limit = Math.min(50, Math.max(1, Number(body.limit ?? 12)));
  const offset = Math.max(0, Number(body.offset ?? 0));
  const sortBy = ALLOWED_SORT_FIELDS.has(String(body.sortBy)) ? String(body.sortBy) : 'sortOrder';
  const sortDirection = body.sortDirection === 'desc' ? 'desc' : 'asc';
  const search = String(body.search || '').trim().toLowerCase().slice(0, 120);

  try {
    const { snapshot } = await loadActiveRuntimeSnapshot(env, site, request.url);
    const publicCms = snapshot.publicCms as
      | {
          contentTypes?: Array<{
            id: string;
            enabled?: boolean;
            publiclyPublishable?: boolean;
            fields?: Array<{ key: string; publiclyExposed?: boolean; searchable?: boolean }>;
          }>;
          records?: Array<Record<string, unknown> & {
            recordId: string;
            contentTypeId: string;
            status: string;
            title: string;
            slug: string;
            sortOrder?: number;
            publishedAt?: string;
            createdAt?: string;
            updatedAt?: string;
            fields?: Record<string, unknown>;
            termIdsByTaxonomy?: Record<string, string[]>;
          }>;
        }
      | undefined;

    if (!publicCms) {
      return Response.json({ records: [], totalCount: 0, hasMore: false });
    }

    const schema = (publicCms.contentTypes || []).find(
      (ct) => ct.id === contentTypeId && ct.enabled !== false && ct.publiclyPublishable !== false
    );
    if (!schema) {
      return Response.json({ records: [], totalCount: 0, hasMore: false });
    }

    // Also check if a partitioned dataset spreadsheet is registered for live Sheets reads
    const registeredResource = await env.DB.prepare(
      `SELECT * FROM site_dataset_resources
       WHERE site_id = ? AND domain_kind = 'cms' AND dataset_key = ? AND status = 'active' LIMIT 1`
    )
      .bind(site.site_id, `cms_${contentTypeId}`)
      .first<SiteDatasetResourceRecord>();

    const allowedFieldKeys = new Set(
      (schema.fields || []).filter((f) => f.publiclyExposed !== false).map((f) => f.key)
    );

    let list = (publicCms.records || []).filter(
      (r) => r.contentTypeId === contentTypeId && r.status === 'published'
    );

    if (body.taxonomyId && body.termId) {
      list = list.filter((r) => (r.termIdsByTaxonomy?.[body.taxonomyId!] || []).includes(body.termId!));
    }

    if (search) {
      list = list.filter((r) => {
        if (String(r.title || '').toLowerCase().includes(search)) return true;
        if (String(r.slug || '').toLowerCase().includes(search)) return true;
        return Array.from(allowedFieldKeys).some((k) =>
          String(r.fields?.[k] ?? '')
            .toLowerCase()
            .includes(search)
        );
      });
    }

    const dir = sortDirection === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const va = a[sortBy] ?? '';
      const vb = b[sortBy] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });

    const filteredCount = list.length;
    const sliced = list.slice(offset, offset + limit).map((rec) => {
      const cleanFields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rec.fields || {})) {
        if (allowedFieldKeys.has(k)) cleanFields[k] = v;
      }
      return { ...rec, fields: cleanFields };
    });

    return Response.json(
      {
        records: sliced,
        totalCount: filteredCount,
        hasMore: offset + limit < filteredCount,
        source: registeredResource ? 'partitioned_registry_backed' : 'published_snapshot',
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=120',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'CMS_QUERY_FAILED';
    return Response.json({ error: 'Public CMS query failed.', code: msg }, { status: 502 });
  }
}

export async function handlePublicFormSubmit(
  request: Request,
  env: WorkerEnv,
  rawSiteSlug: string,
  formId: string
): Promise<Response> {
  const siteSlug = normalizeSlug(rawSiteSlug);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const rate = await checkRateLimit(env, `form:${siteSlug}:${ip}`, 10);
  if (!rate.allowed) {
    return Response.json(
      { error: 'Too many submissions. Please wait a minute before trying again.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 64 * 1024) {
    return Response.json({ error: 'Submission payload too large.' }, { status: 413 });
  }

  const site = await resolvePublishedSiteBySlugOrHost(env, { slug: siteSlug });
  if (!site) {
    return Response.json({ error: 'Published site not found.' }, { status: 404 });
  }

  let body: PublicFormSubmitBody;
  try {
    body = (await request.json()) as PublicFormSubmitBody;
  } catch {
    return Response.json({ error: 'Invalid form submission JSON.' }, { status: 400 });
  }

  // Honeypot anti-spam trap
  if (body._hp && String(body._hp).trim().length > 0) {
    return Response.json({ ok: true, filtered: true });
  }

  const idempotencyKey =
    request.headers.get('Idempotency-Key')?.trim() ||
    `auto_${site.site_id}_${formId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const existingIdem = await env.DB.prepare(
    `SELECT submission_id, inbox_item_id, status FROM form_submission_idempotency WHERE idempotency_key = ?`
  )
    .bind(idempotencyKey)
    .first<{ submission_id: string; inbox_item_id: string; status: string }>();

  if (existingIdem && existingIdem.status === 'persisted') {
    return Response.json({
      ok: true,
      deduplicated: true,
      submissionId: existingIdem.submission_id,
      inboxItemId: existingIdem.inbox_item_id,
    });
  }

  // Server-authoritative destination lookup (never accepts destination from client browser!)
  const dest = await env.DB.prepare(
    `SELECT * FROM site_form_destinations WHERE site_id = ? AND form_id = ? AND status = 'active' LIMIT 1`
  )
    .bind(site.site_id, formId)
    .first<SiteFormDestinationRecord>();

  if (!dest || !dest.destination_spreadsheet_id) {
    return Response.json(
      { error: 'Form destination is not configured for server-side submissions.', code: 'DESTINATION_UNCONFIGURED' },
      { status: 503 }
    );
  }

  // Validate submitted fields against published form schema
  const { snapshot } = await loadActiveRuntimeSnapshot(env, site, request.url);
  const publicForms = (snapshot.publicForms || {}) as Record<
    string,
    {
      fields?: Array<{ key: string; label: string; required?: boolean }>;
      settings?: { successMessage?: string; successAction?: string; redirectUrl?: string };
    }
  >;
  const formSchema = publicForms[formId];
  if (!formSchema) {
    return Response.json({ error: 'Published form definition not found.' }, { status: 404 });
  }

  const rawFields = body.fields || {};
  for (const field of formSchema.fields || []) {
    if (field.required) {
      const val = rawFields[field.key];
      if (val === undefined || val === null || String(val).trim() === '') {
        return Response.json(
          { error: `${field.label || field.key} is required.`, code: 'VALIDATION_ERROR' },
          { status: 400 }
        );
      }
    }
  }

  const nowIso = new Date().toISOString();
  const submissionId = existingIdem?.submission_id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const inboxItemId = existingIdem?.inbox_item_id || `inb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  await env.DB.prepare(
    `INSERT OR REPLACE INTO form_submission_idempotency (
       idempotency_key, site_id, form_id, submission_id, inbox_item_id, status, error_detail, created_at
     ) VALUES (?, ?, ?, ?, ?, 'pending', '', ?)`
  )
    .bind(idempotencyKey, site.site_id, formId, submissionId, inboxItemId, nowIso)
    .run();

  try {
    const { accessToken } = await mintOwnerGoogleAccessToken(env, site.owner_id);
    const worksheet = dest.destination_worksheet_name || 'CONTACT_SUBMISSIONS';
    const rowValues = [
      submissionId,
      nowIso,
      escapeSheetCell(rawFields.full_name || rawFields.name || ''),
      escapeSheetCell(rawFields.email || ''),
      escapeSheetCell(rawFields.phone || ''),
      escapeSheetCell(rawFields.message || JSON.stringify(rawFields)),
      escapeSheetCell(body.sourcePage || '/'),
    ];

    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        dest.destination_spreadsheet_id
      )}/values/${encodeURIComponent(`'${worksheet.replace(/'/g, "''")}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: [rowValues] }),
      }
    );

    if (!appendRes.ok) {
      throw new Error(`SHEETS_APPEND_${appendRes.status}`);
    }

    await env.DB.prepare(
      `UPDATE form_submission_idempotency SET status = 'persisted' WHERE idempotency_key = ?`
    )
      .bind(idempotencyKey)
      .run();

    return Response.json({
      ok: true,
      submissionId,
      inboxItemId,
      message: formSchema.settings?.successMessage || 'Thank you! Your message has been sent.',
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'SUBMISSION_WRITE_FAILED';
    await env.DB.prepare(
      `UPDATE form_submission_idempotency SET status = 'partial_error', error_detail = ? WHERE idempotency_key = ?`
    )
      .bind(detail, idempotencyKey)
      .run();

    return Response.json(
      { error: 'Unable to deliver submission to destination Inbox.', code: detail },
      { status: 502 }
    );
  }
}

export async function handlePublicAssetProxy(
  request: Request,
  env: WorkerEnv,
  rawSiteSlug: string,
  assetDriveId: string
): Promise<Response> {
  const siteSlug = normalizeSlug(rawSiteSlug);
  const site = await resolvePublishedSiteBySlugOrHost(env, { slug: siteSlug });
  if (!site) {
    return Response.json({ error: 'Site not found.' }, { status: 404 });
  }

  try {
    const { snapshot } = await loadActiveRuntimeSnapshot(env, site, request.url);
    const publicAssets = (snapshot.publicAssets || {}) as Record<
      string,
      { driveFileId?: string; mimeType?: string }
    >;

    const matched = Object.values(publicAssets).find((a) => a.driveFileId === assetDriveId);
    if (!matched) {
      return Response.json({ error: 'Asset is not part of this published site.' }, { status: 403 });
    }

    const { accessToken } = await mintOwnerGoogleAccessToken(env, site.owner_id);
    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(assetDriveId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!driveRes.ok) {
      return Response.json({ error: 'Asset not available.' }, { status: driveRes.status });
    }

    return new Response(driveRes.body, {
      status: 200,
      headers: {
        'Content-Type': matched.mimeType || driveRes.headers.get('Content-Type') || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return Response.json({ error: 'Asset fetch failed.' }, { status: 502 });
  }
}
