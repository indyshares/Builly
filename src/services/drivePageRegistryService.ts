import { PageDocument, SiteDocument } from '../types/builder';
import { ENV_CONFIG } from '../config/env';
import { resolvePageFullPath } from './pageService';

const REGISTRY_FILENAME = 'indyshares-pages-registry.json';

export interface DrivePageRegistryManifest {
  schemaVersion: number;
  siteId: string;
  siteName: string;
  portfolioSlug: string;
  activePageId: string;
  pageRegistryRevision: number;
  siteThemeRevision: number;
  activeThemeId: string;
  themeConfig?: SiteDocument['themeConfig'];
  globalComponents?: SiteDocument['globalComponents'];
  libraryItems?: SiteDocument['libraryItems'];
  updatedAt: string;
  pages: {
    pageId: string;
    name: string;
    slug: string;
    fullPath: string;
    parentPageId?: string | null;
    isHome: boolean;
    status: string;
    navigation: {
      visible: boolean;
      label: string;
      order: number;
    };
    seo: {
      title: string;
      description: string;
      canonicalPath?: string;
      ogImage?: string;
      noIndex?: boolean;
    };
    builderDocument: {
      fileId?: string;
      fileName: string;
      revision: number;
    };
    updatedAt: string;
  }[];
}

export class DriveConcurrencyError extends Error {
  remoteRevision: number;
  constructor(message: string, remoteRevision: number) {
    super(message);
    this.name = 'DriveConcurrencyError';
    this.remoteRevision = remoteRevision;
  }
}

async function driveJsonRequest<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let msg = `Google Drive request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // Ignore JSON error parsing failure
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function ensurePortfolioDriveFolder(
  accessToken: string,
  existingFolderId?: string
): Promise<string> {
  if (existingFolderId) {
    try {
      const check = await driveJsonRequest<{ id: string; trashed?: boolean }>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          existingFolderId
        )}?fields=id,trashed`,
        accessToken
      );
      if (check.id && !check.trashed) return check.id;
    } catch {
      // Fall through to search/create
    }
  }

  const escaped = ENV_CONFIG.driveFolderName.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const found = await driveJsonRequest<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    accessToken
  );

  if (found.files?.[0]?.id) {
    return found.files[0].id;
  }

  const created = await driveJsonRequest<{ id: string }>(
    'https://www.googleapis.com/drive/v3/files',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ENV_CONFIG.driveFolderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    }
  );
  return created.id;
}

async function findFileInFolder(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<string | null> {
  const escapedName = fileName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${escapedName}' and trashed = false`
  );
  const list = await driveJsonRequest<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    accessToken
  );
  return list.files?.[0]?.id || null;
}

async function readJsonDriveFile<T>(
  accessToken: string,
  fileId: string
): Promise<T> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to download file ${fileId} from Google Drive (${res.status}).`);
  }
  return res.json();
}

async function upsertJsonDriveFile(
  accessToken: string,
  params: {
    fileId?: string | null;
    folderId: string;
    name: string;
    payload: unknown;
  }
): Promise<string> {
  const metadata = params.fileId
    ? { name: params.name }
    : {
        name: params.name,
        mimeType: 'application/json',
        parents: [params.folderId],
      };

  const boundary = `indyshares_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(params.payload, null, 2)}\r\n` +
    `--${boundary}--`;

  const url = params.fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        params.fileId
      )}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

  const res = await driveJsonRequest<{ id: string }>(url, accessToken, {
    method: params.fileId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  return res.id;
}

export async function syncSitePagesToGoogleDrive(
  accessToken: string,
  site: SiteDocument,
  existingFolderId?: string,
  options: { forceOverwrite?: boolean } = {}
): Promise<{
  folderId: string;
  registryFileId: string;
  nextRegistryRevision: number;
  updatedPages: PageDocument[];
  syncedAt: string;
}> {
  const folderId = await ensurePortfolioDriveFolder(accessToken, existingFolderId);
  const registryFileId =
    site.pageRegistryDriveFileId ||
    (await findFileInFolder(accessToken, folderId, REGISTRY_FILENAME));

  const localRev = site.pageRegistryRevision ?? 1;

  // Optimistic concurrency check against remote registry in Drive
  if (registryFileId && !options.forceOverwrite) {
    try {
      const remoteManifest = await readJsonDriveFile<DrivePageRegistryManifest>(
        accessToken,
        registryFileId
      );
      if (
        typeof remoteManifest.pageRegistryRevision === 'number' &&
        remoteManifest.pageRegistryRevision > localRev
      ) {
        throw new DriveConcurrencyError(
          `A newer page registry (revision ${remoteManifest.pageRegistryRevision}) exists in your Google Drive. Load remote changes or force-sync your local version.`,
          remoteManifest.pageRegistryRevision
        );
      }
    } catch (err) {
      if (err instanceof DriveConcurrencyError) throw err;
    }
  }

  // Upsert each page document JSON into Google Drive
  const updatedPages: PageDocument[] = [];
  for (const page of site.pages) {
    const fileName = `page-${page.id}.json`;
    const existingPageFileId =
      page.driveFileId || (await findFileInFolder(accessToken, folderId, fileName));

    const nextPageRev = (page.revision ?? 1) + 1;
    const savedPageFileId = await upsertJsonDriveFile(accessToken, {
      fileId: existingPageFileId,
      folderId,
      name: fileName,
      payload: {
        schemaVersion: 2,
        pageId: page.id,
        siteId: site.id,
        revision: nextPageRev,
        title: page.title,
        description: page.description,
        layout: page.layout,
        customCss: page.customCss || '',
        customJs: page.customJs || '',
        rootElement: page.rootElement,
        updatedAt: new Date().toISOString(),
      },
    });

    updatedPages.push({
      ...page,
      driveFileId: savedPageFileId,
      revision: nextPageRev,
    });
  }

  const nextRegistryRevision = localRev + 1;
  const manifest: DrivePageRegistryManifest = {
    schemaVersion: 2,
    siteId: site.id,
    siteName: site.name,
    portfolioSlug: site.portfolioSlug,
    activePageId: site.activePageId,
    pageRegistryRevision: nextRegistryRevision,
    siteThemeRevision: site.siteThemeRevision ?? 1,
    activeThemeId: site.activeThemeId,
    themeConfig: site.themeConfig,
    globalComponents: site.globalComponents,
    libraryItems: site.libraryItems,
    updatedAt: new Date().toISOString(),
    pages: updatedPages.map((p, idx) => ({
      pageId: p.id,
      name: p.name,
      slug: p.slug,
      fullPath: resolvePageFullPath(p, updatedPages),
      parentPageId: p.parentPageId || null,
      isHome: Boolean(p.isHome),
      status: p.status || 'published',
      navigation: {
        visible: p.navigation?.visible ?? true,
        label: p.navigation?.label || p.name,
        order: p.navigation?.order ?? idx,
      },
      seo: {
        title: p.title,
        description: p.description,
        canonicalPath: p.canonicalPath,
        ogImage: p.ogImage,
        noIndex: p.noIndex,
      },
      builderDocument: {
        fileId: p.driveFileId,
        fileName: `page-${p.id}.json`,
        revision: p.revision ?? 1,
      },
      updatedAt: p.lastModified,
    })),
  };

  const finalRegistryFileId = await upsertJsonDriveFile(accessToken, {
    fileId: registryFileId,
    folderId,
    name: REGISTRY_FILENAME,
    payload: manifest,
  });

  return {
    folderId,
    registryFileId: finalRegistryFileId,
    nextRegistryRevision,
    updatedPages,
    syncedAt: new Date().toLocaleTimeString(),
  };
}

export async function loadSitePagesFromGoogleDrive(
  accessToken: string,
  site: SiteDocument,
  existingFolderId?: string
): Promise<{
  found: boolean;
  folderId: string;
  registryFileId?: string;
  manifest?: DrivePageRegistryManifest;
  pages?: PageDocument[];
}> {
  const folderId = await ensurePortfolioDriveFolder(accessToken, existingFolderId);
  const registryFileId =
    site.pageRegistryDriveFileId ||
    (await findFileInFolder(accessToken, folderId, REGISTRY_FILENAME));

  if (!registryFileId) {
    return { found: false, folderId };
  }

  const manifest = await readJsonDriveFile<DrivePageRegistryManifest>(
    accessToken,
    registryFileId
  );

  const loadedPages: PageDocument[] = [];
  for (const entry of manifest.pages) {
    const fileId =
      entry.builderDocument.fileId ||
      (await findFileInFolder(accessToken, folderId, entry.builderDocument.fileName));

    let docPayload: any = null;
    if (fileId) {
      docPayload = await readJsonDriveFile<any>(accessToken, fileId);
    }

    const fallbackLocal = site.pages.find((p) => p.id === entry.pageId);
    loadedPages.push({
      id: entry.pageId,
      name: entry.name,
      slug: entry.slug,
      parentPageId: entry.parentPageId || null,
      isHome: entry.isHome,
      status: (entry.status as PageDocument['status']) || 'draft',
      navigation: entry.navigation,
      title: entry.seo?.title || entry.name,
      description: entry.seo?.description || '',
      canonicalPath: entry.seo?.canonicalPath,
      ogImage: entry.seo?.ogImage,
      noIndex: entry.seo?.noIndex,
      revision: docPayload?.revision ?? entry.builderDocument.revision ?? 1,
      driveFileId: fileId || undefined,
      layout: docPayload?.layout || fallbackLocal?.layout,
      customCss: docPayload?.customCss || '',
      customJs: docPayload?.customJs || '',
      rootElement: docPayload?.rootElement || fallbackLocal?.rootElement || {
        id: `root_${entry.pageId}`,
        type: 'container',
        name: `${entry.name} Root`,
        styles: { display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' },
        children: [],
      },
      lastModified: entry.updatedAt || new Date().toISOString().replace('T', ' ').substring(0, 16),
    });
  }

  return {
    found: true,
    folderId,
    registryFileId,
    manifest,
    pages: loadedPages,
  };
}
