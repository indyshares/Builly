import { INITIAL_SITE } from '../data/initialSite';
import { MediaAsset } from '../types/builder';

const PROJECT_ASSETS_KEY_PREFIX = 'builly_project_assets:';
const LEGACY_SITE_STORAGE_KEY = 'indyshares_portfolio_site_v2';
const PROJECT_DRAFT_KEY_PREFIX = 'builly_project_draft:';

export type AssetListener = (assets: MediaAsset[]) => void;

const inMemoryCache = new Map<string, MediaAsset[]>();
const listenersByScope = new Map<string, Set<AssetListener>>();

function normalizeScopeKey(projectId?: string | null): string {
  const clean = (projectId || '').trim();
  return clean || 'default';
}

export function getProjectAssetsStorageKey(projectId?: string | null): string {
  return `${PROJECT_ASSETS_KEY_PREFIX}${normalizeScopeKey(projectId)}`;
}

function getDraftStorageKey(projectId?: string | null): string {
  const clean = (projectId || '').trim();
  return clean ? `${PROJECT_DRAFT_KEY_PREFIX}${clean}` : LEGACY_SITE_STORAGE_KEY;
}

function readStoredJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota restrictions gracefully
  }
}

function notifyScope(scopeKey: string, assets: MediaAsset[]): void {
  const subs = listenersByScope.get(scopeKey);
  if (!subs || subs.size === 0) return;
  subs.forEach((listener) => {
    try {
      listener(assets);
    } catch {
      // Ignore individual subscriber errors
    }
  });
}

let storageListenerInstalled = false;
function ensureCrossTabListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return;
  storageListenerInstalled = true;
  window.addEventListener('storage', (event: StorageEvent) => {
    if (!event.key || !event.key.startsWith(PROJECT_ASSETS_KEY_PREFIX) || !event.newValue) {
      return;
    }
    const scopeKey = event.key.slice(PROJECT_ASSETS_KEY_PREFIX.length) || 'default';
    try {
      const parsed = JSON.parse(event.newValue);
      if (!Array.isArray(parsed)) return;
      inMemoryCache.set(scopeKey, parsed as MediaAsset[]);
      notifyScope(scopeKey, parsed as MediaAsset[]);
    } catch {
      // Ignore malformed cross-tab data
    }
  });
}

export const assetRepository = {
  hasStoredAssets(projectId?: string | null): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return Boolean(localStorage.getItem(getProjectAssetsStorageKey(projectId)));
    } catch {
      return false;
    }
  },

  getAssets(projectId?: string | null): MediaAsset[] {
    const scopeKey = normalizeScopeKey(projectId);
    const storedAssets = readStoredJson<MediaAsset[]>(getProjectAssetsStorageKey(projectId));
    if (Array.isArray(storedAssets)) {
      inMemoryCache.set(scopeKey, storedAssets);
      return storedAssets;
    }

    const cached = inMemoryCache.get(scopeKey);
    if (cached) return cached;

    const draftRaw = readStoredJson<{ mediaAssets?: MediaAsset[] }>(getDraftStorageKey(projectId));
    if (Array.isArray(draftRaw?.mediaAssets)) {
      inMemoryCache.set(scopeKey, draftRaw.mediaAssets);
      return draftRaw.mediaAssets;
    }

    const defaults = [...(INITIAL_SITE.mediaAssets || [])];
    inMemoryCache.set(scopeKey, defaults);
    return defaults;
  },

  saveAssets(
    projectId: string | null | undefined,
    assets: MediaAsset[],
    options?: { mirrorToDraft?: boolean }
  ): MediaAsset[] {
    const scopeKey = normalizeScopeKey(projectId);
    const cleanList = Array.isArray(assets) ? assets : [];
    inMemoryCache.set(scopeKey, cleanList);
    writeStoredJson(getProjectAssetsStorageKey(projectId), cleanList);

    if (options?.mirrorToDraft !== false) {
      const draftKey = getDraftStorageKey(projectId);
      const existingDraft = readStoredJson<Record<string, unknown>>(draftKey);
      if (existingDraft && typeof existingDraft === 'object') {
        writeStoredJson(draftKey, {
          ...existingDraft,
          mediaAssets: cleanList,
        });
      }
    }

    notifyScope(scopeKey, cleanList);
    return cleanList;
  },

  addAsset(projectId: string | null | undefined, asset: MediaAsset): MediaAsset[] {
    const current = assetRepository.getAssets(projectId);
    const next = [asset, ...current.filter((a) => a.id !== asset.id)];
    return assetRepository.saveAssets(projectId, next);
  },

  updateAsset(projectId: string | null | undefined, updated: MediaAsset): MediaAsset[] {
    const current = assetRepository.getAssets(projectId);
    const next = current.map((a) => (a.id === updated.id ? updated : a));
    return assetRepository.saveAssets(projectId, next);
  },

  deleteAsset(projectId: string | null | undefined, assetId: string): MediaAsset[] {
    const current = assetRepository.getAssets(projectId);
    const next = current.filter((a) => a.id !== assetId && a.driveFileId !== assetId);
    return assetRepository.saveAssets(projectId, next);
  },

  mergeRemoteAssets(projectId: string | null | undefined, remoteAssets: MediaAsset[]): MediaAsset[] {
    const current = assetRepository.getAssets(projectId);
    const byId = new Map<string, MediaAsset>();
    current.forEach((a) => byId.set(a.id, a));
    remoteAssets.forEach((remote) => {
      const existing = byId.get(remote.id);
      byId.set(remote.id, {
        ...(existing || {}),
        ...remote,
        url: remote.url || existing?.url || '',
      });
    });
    const merged = Array.from(byId.values()).sort((a, b) =>
      (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );
    return assetRepository.saveAssets(projectId, merged);
  },

  subscribe(projectId: string | null | undefined, listener: AssetListener): () => void {
    ensureCrossTabListener();
    const scopeKey = normalizeScopeKey(projectId);
    let set = listenersByScope.get(scopeKey);
    if (!set) {
      set = new Set();
      listenersByScope.set(scopeKey, set);
    }
    set.add(listener);
    return () => {
      const currentSet = listenersByScope.get(scopeKey);
      if (!currentSet) return;
      currentSet.delete(listener);
      if (currentSet.size === 0) {
        listenersByScope.delete(scopeKey);
      }
    };
  },

  clearCache(projectId?: string | null): void {
    if (projectId === undefined) {
      inMemoryCache.clear();
      return;
    }
    inMemoryCache.delete(normalizeScopeKey(projectId));
  },
};
