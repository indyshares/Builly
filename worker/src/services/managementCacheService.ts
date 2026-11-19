export interface ManagementCacheEntry<T = unknown> {
  cacheKey: string;
  ownerId: string;
  resourceType: string;
  resourceId: string;
  canonicalRevision: number;
  payload: T;
  fetchedAt: string;
  expiresAt: string;
  lastSyncedAt: string;
  stale: boolean;
}

export function buildManagementCacheKey(
  ownerId: string,
  resourceType: string,
  resourceId = 'default'
): string {
  return `${ownerId}:${resourceType}:${resourceId || 'default'}`;
}

export async function writeManagementCache(
  db: D1Database,
  params: {
    ownerId: string;
    resourceType: string;
    resourceId?: string;
    canonicalRevision?: number;
    payload: unknown;
    ttlSeconds?: number;
  }
): Promise<{ fetchedAt: string; lastSyncedAt: string }> {
  const resourceId = params.resourceId || 'default';
  const cacheKey = buildManagementCacheKey(params.ownerId, params.resourceType, resourceId);
  const now = new Date();
  const fetchedAt = now.toISOString();
  const ttlMs = Math.max(60, params.ttlSeconds ?? 3600) * 1000;
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const payloadJson = JSON.stringify(params.payload);

  await db
    .prepare(
      `INSERT INTO management_cache (
         cache_key, owner_id, resource_type, resource_id, canonical_revision,
         payload_json, fetched_at, expires_at, last_synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         canonical_revision = excluded.canonical_revision,
         payload_json = excluded.payload_json,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at,
         last_synced_at = excluded.last_synced_at`
    )
    .bind(
      cacheKey,
      params.ownerId,
      params.resourceType,
      resourceId,
      params.canonicalRevision ?? 1,
      payloadJson,
      fetchedAt,
      expiresAt,
      fetchedAt
    )
    .run();

  return { fetchedAt, lastSyncedAt: fetchedAt };
}

export async function readManagementCache<T = unknown>(
  db: D1Database,
  params: {
    ownerId: string;
    resourceType: string;
    resourceId?: string;
  }
): Promise<ManagementCacheEntry<T> | null> {
  const resourceId = params.resourceId || 'default';
  const cacheKey = buildManagementCacheKey(params.ownerId, params.resourceType, resourceId);
  const row = await db
    .prepare(
      `SELECT cache_key, owner_id, resource_type, resource_id, canonical_revision,
              payload_json, fetched_at, expires_at, last_synced_at
       FROM management_cache
       WHERE cache_key = ? AND owner_id = ?
       LIMIT 1`
    )
    .bind(cacheKey, params.ownerId)
    .first<{
      cache_key: string;
      owner_id: string;
      resource_type: string;
      resource_id: string;
      canonical_revision: number;
      payload_json: string;
      fetched_at: string;
      expires_at: string;
      last_synced_at: string;
    }>();

  if (!row) return null;

  try {
    const payload = JSON.parse(row.payload_json) as T;
    const expired = row.expires_at ? Date.parse(row.expires_at) < Date.now() : true;
    return {
      cacheKey: row.cache_key,
      ownerId: row.owner_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      canonicalRevision: Number(row.canonical_revision || 1),
      payload,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
      lastSyncedAt: row.last_synced_at,
      stale: expired,
    };
  } catch {
    return null;
  }
}

export async function invalidateManagementCacheForOwner(
  db: D1Database,
  ownerId: string,
  resourceType?: string,
  resourceId?: string
): Promise<void> {
  if (resourceType && resourceId) {
    const cacheKey = buildManagementCacheKey(ownerId, resourceType, resourceId);
    await db
      .prepare(`DELETE FROM management_cache WHERE cache_key = ? AND owner_id = ?`)
      .bind(cacheKey, ownerId)
      .run();
    return;
  }
  await db
    .prepare(`DELETE FROM management_cache WHERE owner_id = ?`)
    .bind(ownerId)
    .run();
}
