import { BuillyTransactionError } from './transactionErrors';

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveAppProperties {
  builly_root?: string;
  operation_id?: string;
  resource_id?: string;
  resource_type?: string;
  schema_version?: string;
  org_id?: string;
  project_id?: string;
  site_id?: string;
  dataset_key?: string;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  modifiedTime?: string;
  headRevisionId?: string;
  appProperties?: Record<string, string>;
  etag?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded exponential backoff with jitter for transient Google Drive errors (429 / 5xx).
 * Never blindly retries 401, 403, 404, 409, or 412.
 */
export async function driveFetchWithRetry(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  options?: { maxRetries?: number; operationId?: string }
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 2;
  let attempt = 0;

  while (true) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init.headers || {}),
        },
      });
    } catch (err) {
      if (attempt < maxRetries) {
        await sleep(200 * Math.pow(2, attempt) + Math.floor(Math.random() * 80));
        attempt += 1;
        continue;
      }
      throw new BuillyTransactionError(
        'DRIVE_TRANSIENT_ERROR',
        err instanceof Error ? err.message : 'Google Drive network request failed.',
        { operationId: options?.operationId, retryable: true }
      );
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt < maxRetries) {
        await sleep(250 * Math.pow(2, attempt) + Math.floor(Math.random() * 100));
        attempt += 1;
        continue;
      }
      throw new BuillyTransactionError(
        'DRIVE_TRANSIENT_ERROR',
        `Google Drive temporarily unavailable (${res.status}).`,
        { operationId: options?.operationId, retryable: true }
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new BuillyTransactionError(
        'DRIVE_PERMISSION_DENIED',
        `Google Drive denied access (${res.status}). Reauthorization may be required.`,
        { status: res.status, operationId: options?.operationId, retryable: false }
      );
    }

    if (res.status === 412) {
      throw new BuillyTransactionError(
        'REVISION_CONFLICT',
        'Google Drive file was modified externally (HTTP 412 ETag mismatch).',
        { status: 409, operationId: options?.operationId, retryable: false }
      );
    }

    if (res.status === 404) {
      throw new BuillyTransactionError(
        'RESOURCE_NOT_FOUND',
        'Requested Google Drive file or folder was not found.',
        { status: 404, operationId: options?.operationId, retryable: false }
      );
    }

    return res;
  }
}

export async function driveJsonChecked<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  options?: { maxRetries?: number; operationId?: string }
): Promise<T> {
  const res = await driveFetchWithRetry(url, accessToken, init, options);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new BuillyTransactionError(
      'POSTCONDITION_FAILED',
      `Google Drive API error (${res.status}): ${txt.slice(0, 180)}`,
      { status: 502, operationId: options?.operationId }
    );
  }
  return (await res.json()) as T;
}

export async function getDriveFileMeta(
  accessToken: string,
  fileId: string,
  operationId?: string
): Promise<DriveFileMeta> {
  const res = await driveFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}?fields=id,name,mimeType,parents,trashed,modifiedTime,headRevisionId,appProperties`,
    accessToken,
    {},
    { operationId }
  );
  if (!res.ok) {
    throw new BuillyTransactionError(
      'RESOURCE_NOT_FOUND',
      `Drive file "${fileId}" could not be read (${res.status}).`,
      { status: res.status === 404 ? 404 : 502, operationId }
    );
  }
  const meta = (await res.json()) as DriveFileMeta;
  const etag = res.headers.get('etag') || undefined;
  return { ...meta, ...(etag ? { etag } : {}) };
}

export async function verifyDriveParent(
  accessToken: string,
  fileId: string,
  expectedParentId: string,
  operationId?: string
): Promise<DriveFileMeta> {
  const meta = await getDriveFileMeta(accessToken, fileId, operationId);
  if (meta.trashed) {
    throw new BuillyTransactionError(
      'RESOURCE_NOT_FOUND',
      `Drive resource "${fileId}" is trashed.`,
      { operationId, details: { resourceId: fileId } }
    );
  }
  if (expectedParentId === 'root') {
    if (!meta.parents || meta.parents.length === 0) {
      throw new BuillyTransactionError(
        'PARENT_MISMATCH',
        `Drive root folder "${meta.name || fileId}" has no verified parent.`,
        {
          operationId,
          details: {
            resourceId: fileId,
            expectedParentId,
            needsReconciliation: true,
          },
        }
      );
    }
    return meta;
  }
  if (!meta.parents || !meta.parents.includes(expectedParentId)) {
    throw new BuillyTransactionError(
      'PARENT_MISMATCH',
      `Drive resource "${meta.name || fileId}" has unexpected parent folder.`,
      {
        operationId,
        details: {
          resourceId: fileId,
          expectedParentId,
          parentId: meta.parents?.[0],
          needsReconciliation: true,
        },
      }
    );
  }
  return meta;
}

export async function findDriveChildren(
  accessToken: string,
  params: {
    parentId: string;
    name?: string;
    mimeType?: string;
    appProperties?: Record<string, string>;
    operationId?: string;
  }
): Promise<DriveFileMeta[]> {
  const clauses = [`'${params.parentId}' in parents`, `trashed = false`];
  if (params.name) {
    clauses.push(`name = '${params.name.replace(/'/g, "\\'")}'`);
  }
  if (params.mimeType) {
    clauses.push(`mimeType = '${params.mimeType.replace(/'/g, "\\'")}'`);
  }
  if (params.appProperties) {
    for (const [k, v] of Object.entries(params.appProperties)) {
      if (k && v) {
        clauses.push(`appProperties has { key='${k.replace(/'/g, "\\'")}' and value='${v.replace(/'/g, "\\'")}' }`);
      }
    }
  }
  const q = encodeURIComponent(clauses.join(' and '));
  const data = await driveJsonChecked<{ files?: DriveFileMeta[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,parents,trashed,modifiedTime,headRevisionId,appProperties)&pageSize=20`,
    accessToken,
    {},
    { operationId: params.operationId }
  );
  return (data.files || []).filter((f) => !f.trashed);
}

/**
 * Discovers Builly root folders using trusted appProperties marker first,
 * falling back to top-level 'Builly' folder in 'root'. Never guesses across multiple roots.
 */
export async function findBuillyRootCandidates(
  accessToken: string,
  operationId?: string
): Promise<DriveFileMeta[]> {
  const qMarker = encodeURIComponent(
    `appProperties has { key='builly_root' and value='true' } and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`
  );
  const byMarker = await driveJsonChecked<{ files?: DriveFileMeta[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${qMarker}&fields=files(id,name,mimeType,parents,trashed,appProperties)&pageSize=10`,
    accessToken,
    {},
    { operationId }
  );

  const qNamed = encodeURIComponent(
    `'root' in parents and name = 'Builly' and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`
  );
  const byName = await driveJsonChecked<{ files?: DriveFileMeta[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${qNamed}&fields=files(id,name,mimeType,parents,trashed,appProperties)&pageSize=10`,
    accessToken,
    {},
    { operationId }
  );

  const deduped = new Map<string, DriveFileMeta>();
  for (const f of [...(byMarker.files || []), ...(byName.files || [])]) {
    if (f?.id && !f.trashed) {
      deduped.set(f.id, f);
    }
  }
  return Array.from(deduped.values());
}

/**
 * Idempotently finds or creates a Drive folder under an explicit verified parentId
 * using trusted appProperties resource_id marker (falling back to name only under that parent).
 * Throws DUPLICATE_RESOURCE_CANDIDATES if >1 matching folder exists instead of picking files[0].
 */
export async function ensureMarkerFolder(
  accessToken: string,
  params: {
    parentId: string;
    name: string;
    appProperties: DriveAppProperties;
    operationId?: string;
    knownFolderId?: string;
  }
): Promise<{ folder: DriveFileMeta; created: boolean }> {
  if (params.knownFolderId) {
    try {
      const verified = await verifyDriveParent(
        accessToken,
        params.knownFolderId,
        params.parentId,
        params.operationId
      );
      if (verified.mimeType === DRIVE_FOLDER_MIME) {
        return { folder: verified, created: false };
      }
    } catch (err) {
      if (err instanceof BuillyTransactionError && err.code === 'PARENT_MISMATCH') {
        throw err;
      }
      // Resource not found -> continue deterministic discovery
    }
  }

  // Search by trusted resource_id marker first when provided
  if (params.appProperties.resource_id) {
    const byMarker = await findDriveChildren(accessToken, {
      parentId: params.parentId,
      mimeType: DRIVE_FOLDER_MIME,
      appProperties: { resource_id: params.appProperties.resource_id },
      operationId: params.operationId,
    });
    if (byMarker.length > 1) {
      throw new BuillyTransactionError(
        'DUPLICATE_RESOURCE_CANDIDATES',
        `Multiple Drive folders matched resource "${params.appProperties.resource_id}". Reconciliation required.`,
        {
          operationId: params.operationId,
          details: {
            resourceId: params.appProperties.resource_id,
            needsReconciliation: true,
            candidates: byMarker.map((f) => ({ id: f.id, name: f.name, parents: f.parents })),
          },
        }
      );
    }
    if (byMarker.length === 1) {
      const verified = await verifyDriveParent(
        accessToken,
        byMarker[0].id,
        params.parentId,
        params.operationId
      );
      return { folder: verified, created: false };
    }
  }

  // Search by exact folder name under verified parent
  const byName = await findDriveChildren(accessToken, {
    parentId: params.parentId,
    name: params.name,
    mimeType: DRIVE_FOLDER_MIME,
    operationId: params.operationId,
  });
  if (byName.length > 1) {
    throw new BuillyTransactionError(
      'DUPLICATE_RESOURCE_CANDIDATES',
      `Multiple "${params.name}" folders found under parent "${params.parentId}". Reconciliation required.`,
      {
        operationId: params.operationId,
        details: {
          parentId: params.parentId,
          needsReconciliation: true,
          candidates: byName.map((f) => ({ id: f.id, name: f.name, parents: f.parents })),
        },
      }
    );
  }
  if (byName.length === 1) {
    const verified = await verifyDriveParent(
      accessToken,
      byName[0].id,
      params.parentId,
      params.operationId
    );
    return { folder: verified, created: false };
  }

  const findExistingMarkerFolder = async (): Promise<DriveFileMeta | null> => {
    if (params.appProperties.resource_id) {
      const byMarker = await findDriveChildren(accessToken, {
        parentId: params.parentId,
        mimeType: DRIVE_FOLDER_MIME,
        appProperties: { resource_id: params.appProperties.resource_id },
        operationId: params.operationId,
      });
      if (byMarker.length > 1) {
        throw new BuillyTransactionError(
          'DUPLICATE_RESOURCE_CANDIDATES',
          `Multiple Drive folders matched resource "${params.appProperties.resource_id}". Reconciliation required.`,
          {
            operationId: params.operationId,
            details: {
              resourceId: params.appProperties.resource_id,
              needsReconciliation: true,
              candidates: byMarker.map((f) => ({ id: f.id, name: f.name, parents: f.parents })),
            },
          }
        );
      }
      if (byMarker.length === 1) {
        return await verifyDriveParent(
          accessToken,
          byMarker[0].id,
          params.parentId,
          params.operationId
        );
      }
    }

    const byName = await findDriveChildren(accessToken, {
      parentId: params.parentId,
      name: params.name,
      mimeType: DRIVE_FOLDER_MIME,
      operationId: params.operationId,
    });
    if (byName.length > 1) {
      throw new BuillyTransactionError(
        'DUPLICATE_RESOURCE_CANDIDATES',
        `Multiple "${params.name}" folders found under parent "${params.parentId}". Reconciliation required.`,
        {
          operationId: params.operationId,
          details: {
            parentId: params.parentId,
            needsReconciliation: true,
            candidates: byName.map((f) => ({ id: f.id, name: f.name, parents: f.parents })),
          },
        }
      );
    }
    if (byName.length === 1) {
      return await verifyDriveParent(
        accessToken,
        byName[0].id,
        params.parentId,
        params.operationId
      );
    }
    return null;
  };

  let created: DriveFileMeta | null = null;
  const maxCreateAttempts = 3;
  for (let attempt = 0; attempt < maxCreateAttempts; attempt++) {
    try {
      created = await driveJsonChecked<DriveFileMeta>(
        'https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,parents,appProperties',
        accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: params.name,
            mimeType: DRIVE_FOLDER_MIME,
            parents: [params.parentId],
            appProperties: params.appProperties,
          }),
        },
        { maxRetries: 0, operationId: params.operationId }
      );
      break;
    } catch (err) {
      if (err instanceof BuillyTransactionError && err.code === 'DRIVE_TRANSIENT_ERROR') {
        await sleep(150 * Math.pow(2, attempt));
        const discovered = await findExistingMarkerFolder().catch((discoverErr) => {
          if (
            discoverErr instanceof BuillyTransactionError &&
            (discoverErr.code === 'DUPLICATE_RESOURCE_CANDIDATES' ||
              discoverErr.code === 'PARENT_MISMATCH')
          ) {
            throw discoverErr;
          }
          return null;
        });
        if (discovered) {
          return { folder: discovered, created: false };
        }
        if (attempt < maxCreateAttempts - 1) {
          continue;
        }
      }
      throw err;
    }
  }

  if (!created) {
    throw new BuillyTransactionError(
      'DRIVE_TRANSIENT_ERROR',
      `Failed to create Drive folder "${params.name}".`,
      { operationId: params.operationId, retryable: true }
    );
  }

  // Read-after-write parent verification
  const verified = await verifyDriveParent(
    accessToken,
    created.id,
    params.parentId,
    params.operationId
  );
  return { folder: verified, created: true };
}

export async function readDriveJsonWithConcurrency<T = Record<string, unknown>>(
  accessToken: string,
  fileId: string,
  operationId?: string
): Promise<{ data: T; meta: DriveFileMeta }> {
  const meta = await getDriveFileMeta(accessToken, fileId, operationId);
  const res = await driveFetchWithRetry(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken,
    {},
    { operationId }
  );
  if (!res.ok) {
    throw new BuillyTransactionError(
      'POSTCONDITION_FAILED',
      `Failed to read canonical Drive JSON "${fileId}" (${res.status}).`,
      { status: 502, operationId }
    );
  }
  const etag = res.headers.get('etag') || meta.etag;
  const data = (await res.json()) as T;
  return { data, meta: { ...meta, ...(etag ? { etag } : {}) } };
}

/**
 * Writes a canonical Drive JSON file with parent verification, trusted appProperties,
 * revision conflict checking, optional HTTP ETag (If-Match) when available, and read-after-write check.
 * Does NOT claim cross-file atomicity; enforces single-resource revision/ETag integrity.
 */
export async function writeCanonicalDriveJson<T extends Record<string, unknown>>(
  accessToken: string,
  params: {
    parentId: string;
    fileName: string;
    payload: T;
    appProperties: DriveAppProperties;
    knownFileId?: string;
    expectedRevision?: number;
    expectedEtag?: string;
    operationId?: string;
  }
): Promise<{ fileId: string; name: string; meta: DriveFileMeta; created: boolean }> {
  let targetFileId = params.knownFileId || '';
  let currentEtag = params.expectedEtag;

  if (targetFileId) {
    const meta = await verifyDriveParent(
      accessToken,
      targetFileId,
      params.parentId,
      params.operationId
    );
    currentEtag = currentEtag || meta.etag;
  } else {
    const candidates = await findDriveChildren(accessToken, {
      parentId: params.parentId,
      name: params.fileName,
      operationId: params.operationId,
    });
    if (candidates.length > 1) {
      throw new BuillyTransactionError(
        'DUPLICATE_RESOURCE_CANDIDATES',
        `Multiple canonical files named "${params.fileName}" found under "${params.parentId}".`,
        {
          operationId: params.operationId,
          details: {
            parentId: params.parentId,
            needsReconciliation: true,
            candidates: candidates.map((c) => ({ id: c.id, name: c.name, parents: c.parents })),
          },
        }
      );
    }
    if (candidates.length === 1) {
      targetFileId = candidates[0].id;
    }
  }

  // Re-read canonical file right before write to enforce expected_revision & detect external Drive edits
  if (targetFileId && params.expectedRevision !== undefined) {
    const current = await readDriveJsonWithConcurrency<{ revision?: number }>(
      accessToken,
      targetFileId,
      params.operationId
    );
    const actualRev = Number(current.data?.revision ?? 0);
    if (actualRev !== params.expectedRevision) {
      throw new BuillyTransactionError(
        'REVISION_CONFLICT',
        `Revision conflict on "${params.fileName}": expected revision ${params.expectedRevision}, found ${actualRev}.`,
        {
          operationId: params.operationId,
          details: {
            resourceId: targetFileId,
            expectedRevision: params.expectedRevision,
            actualRevision: actualRev,
          },
        }
      );
    }
    currentEtag = currentEtag || current.meta.etag;
  }

  const metadata = targetFileId
    ? { name: params.fileName, appProperties: params.appProperties }
    : {
        name: params.fileName,
        mimeType: 'application/json',
        parents: [params.parentId],
        appProperties: params.appProperties,
      };

  const boundary = `builly_canon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(params.payload, null, 2)}\r\n--${boundary}--`;

  const url = targetFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        targetFileId
      )}?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime,headRevisionId,appProperties`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents,modifiedTime,headRevisionId,appProperties';

  const headers: Record<string, string> = {
    'Content-Type': `multipart/related; boundary=${boundary}`,
  };
  if (targetFileId && currentEtag) {
    headers['If-Match'] = currentEtag;
  }

  const saved = await driveJsonChecked<DriveFileMeta>(
    url,
    accessToken,
    {
      method: targetFileId ? 'PATCH' : 'POST',
      headers,
      body,
    },
    { operationId: params.operationId }
  );

  // Read-after-write verification: confirm parent and stored revision/operation marker
  const verified = await readDriveJsonWithConcurrency<Record<string, unknown>>(
    accessToken,
    saved.id,
    params.operationId
  );
  if (!verified.meta.parents?.includes(params.parentId)) {
    throw new BuillyTransactionError(
      'PARENT_MISMATCH',
      `Post-write parent verification failed for "${params.fileName}".`,
      {
        operationId: params.operationId,
        details: { resourceId: saved.id, expectedParentId: params.parentId, needsReconciliation: true },
      }
    );
  }
  const writtenRev = Number(verified.data?.revision ?? 0);
  const intendedRev = Number((params.payload as { revision?: number }).revision ?? 0);
  if (intendedRev > 0 && writtenRev !== intendedRev) {
    throw new BuillyTransactionError(
      'POSTCONDITION_FAILED',
      `Post-write revision verification mismatch on "${params.fileName}".`,
      { operationId: params.operationId, details: { resourceId: saved.id } }
    );
  }

  return {
    fileId: saved.id,
    name: saved.name || params.fileName,
    meta: verified.meta,
    created: !targetFileId,
  };
}
