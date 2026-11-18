import { createInitialCmsDocument } from '../../data/cmsDefaults';
import { workspaceHierarchyClient } from '../../features/console/workspaceHierarchyClient';
import { CmsContentRecord, CmsDocument, CmsRecordStatus } from '../../types/cms';
import { invalidateCmsQueryCache } from './cmsQueryEngine';
import {
  bulkActionCmsRecords,
  BulkActionResult,
  CmsMutationResult,
  deleteCmsRecordPermanently,
  duplicateCmsRecord,
  saveCmsRecord,
  transitionCmsRecordStatus,
} from './cmsService';
import { buildCmsSheetTables } from './cmsWorkspaceAdapter';

const PROJECT_CMS_KEY_PREFIX = 'builly_project_cms:';
const LEGACY_SITE_STORAGE_KEY = 'indyshares_portfolio_site_v2';
const PROJECT_DRAFT_KEY_PREFIX = 'builly_project_draft:';

export type CmsListener = (cms: CmsDocument) => void;

const inMemoryCache = new Map<string, CmsDocument>();
const listenersByScope = new Map<string, Set<CmsListener>>();

function normalizeScopeKey(projectId?: string | null): string {
  const clean = (projectId || '').trim();
  return clean || 'default';
}

export function getProjectCmsStorageKey(projectId?: string | null): string {
  return `${PROJECT_CMS_KEY_PREFIX}${normalizeScopeKey(projectId)}`;
}

function getDraftStorageKey(projectId?: string | null): string {
  const clean = (projectId || '').trim();
  return clean ? `${PROJECT_DRAFT_KEY_PREFIX}${clean}` : LEGACY_SITE_STORAGE_KEY;
}

export function normalizeCmsDocument(raw?: Partial<CmsDocument> | null): CmsDocument {
  const defaults = createInitialCmsDocument();
  if (!raw || !Array.isArray(raw.contentTypes) || raw.contentTypes.length === 0) {
    return defaults;
  }

  const existingTypeIds = new Set(raw.contentTypes.map((ct) => ct.id));
  const missingBuiltIns = defaults.contentTypes.filter((ct) => !existingTypeIds.has(ct.id));
  const existingTaxIds = new Set((raw.taxonomies || []).map((t) => t.id));
  const missingTaxes = defaults.taxonomies.filter((t) => !existingTaxIds.has(t.id));

  return {
    ...defaults,
    ...raw,
    contentTypes: [...raw.contentTypes, ...missingBuiltIns],
    taxonomies: [...(raw.taxonomies || []), ...missingTaxes],
    terms: Array.isArray(raw.terms) ? raw.terms : defaults.terms,
    relationships: Array.isArray(raw.relationships) ? raw.relationships : defaults.relationships,
    records: Array.isArray(raw.records) ? raw.records : defaults.records,
    richDocs: raw.richDocs || {},
    forms: Array.isArray(raw.forms) ? raw.forms : defaults.forms,
    inboxSubmissions: Array.isArray(raw.inboxSubmissions)
      ? raw.inboxSubmissions
      : defaults.inboxSubmissions,
    inboxCategories: Array.isArray(raw.inboxCategories)
      ? raw.inboxCategories
      : defaults.inboxCategories,
    inboxNotes: Array.isArray(raw.inboxNotes) ? raw.inboxNotes : defaults.inboxNotes,
    inboxActivities: Array.isArray(raw.inboxActivities)
      ? raw.inboxActivities
      : defaults.inboxActivities,
    migrationLog: Array.isArray(raw.migrationLog) ? raw.migrationLog : [],
    operationalLogs: Array.isArray(raw.operationalLogs)
      ? raw.operationalLogs
      : defaults.operationalLogs,
    storageHealth: { ...defaults.storageHealth, ...(raw.storageHealth || {}) },
    settings: { ...defaults.settings, ...(raw.settings || {}) },
  };
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
    // Ignore storage quota errors gracefully
  }
}

function notifyScope(scopeKey: string, doc: CmsDocument): void {
  const subs = listenersByScope.get(scopeKey);
  if (!subs || subs.size === 0) return;
  subs.forEach((listener) => {
    try {
      listener(doc);
    } catch {
      // Ignore individual subscriber render errors
    }
  });
}

let storageListenerInstalled = false;
function ensureCrossTabListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return;
  storageListenerInstalled = true;
  window.addEventListener('storage', (event: StorageEvent) => {
    if (!event.key || !event.key.startsWith(PROJECT_CMS_KEY_PREFIX) || !event.newValue) {
      return;
    }
    const scopeKey = event.key.slice(PROJECT_CMS_KEY_PREFIX.length) || 'default';
    try {
      const parsed = JSON.parse(event.newValue) as Partial<CmsDocument>;
      const normalized = normalizeCmsDocument(parsed);
      inMemoryCache.set(scopeKey, normalized);
      invalidateCmsQueryCache();
      notifyScope(scopeKey, normalized);
    } catch {
      // Ignore malformed cross-tab payload
    }
  });
}

export const cmsRepository = {
  hasStoredCms(projectId?: string | null): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return Boolean(localStorage.getItem(getProjectCmsStorageKey(projectId)));
    } catch {
      return false;
    }
  },

  getCms(projectId?: string | null): CmsDocument {
    const scopeKey = normalizeScopeKey(projectId);
    const storedCmsRaw = readStoredJson<Partial<CmsDocument>>(getProjectCmsStorageKey(projectId));
    const draftRaw = readStoredJson<{ cms?: Partial<CmsDocument> }>(getDraftStorageKey(projectId));

    const cachedDoc = inMemoryCache.get(scopeKey);
    const storedDoc = storedCmsRaw ? normalizeCmsDocument(storedCmsRaw) : null;
    const draftDoc = draftRaw?.cms ? normalizeCmsDocument(draftRaw.cms) : null;

    let winner: CmsDocument | null = storedDoc || cachedDoc || null;

    if (cachedDoc && storedDoc && cachedDoc.revision > storedDoc.revision) {
      winner = cachedDoc;
    }
    if (draftDoc && (!winner || draftDoc.revision > winner.revision)) {
      winner = draftDoc;
    }

    if (!winner) {
      winner = createInitialCmsDocument();
    }

    inMemoryCache.set(scopeKey, winner);
    return winner;
  },

  saveCms(
    projectId: string | null | undefined,
    nextCms: CmsDocument,
    options?: { mirrorToDraft?: boolean }
  ): CmsDocument {
    const scopeKey = normalizeScopeKey(projectId);
    const normalized = normalizeCmsDocument(nextCms);

    invalidateCmsQueryCache();
    inMemoryCache.set(scopeKey, normalized);
    writeStoredJson(getProjectCmsStorageKey(projectId), normalized);

    if (options?.mirrorToDraft !== false) {
      const draftKey = getDraftStorageKey(projectId);
      const existingDraft = readStoredJson<Record<string, unknown>>(draftKey);
      if (existingDraft && typeof existingDraft === 'object') {
        writeStoredJson(draftKey, {
          ...existingDraft,
          cms: normalized,
        });
      }
    }

    notifyScope(scopeKey, normalized);
    return normalized;
  },

  updateCms(
    projectId: string | null | undefined,
    updater: (prev: CmsDocument) => CmsDocument,
    options?: { mirrorToDraft?: boolean }
  ): CmsDocument {
    const current = cmsRepository.getCms(projectId);
    const next = updater(current);
    return cmsRepository.saveCms(projectId, next, options);
  },

  subscribe(projectId: string | null | undefined, listener: CmsListener): () => void {
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

  saveRecord(
    projectId: string | null | undefined,
    input: {
      recordId?: string;
      contentTypeId: string;
      status: CmsRecordStatus;
      slug: string;
      fields: Record<string, unknown>;
      termIdsByTaxonomy: Record<string, string[]>;
      relationIdsByField: Record<string, string[]>;
      sortOrder?: number;
      scheduledAt?: string;
      expectedRevision?: number;
    }
  ): CmsMutationResult {
    const current = cmsRepository.getCms(projectId);
    const res = saveCmsRecord(current, input);
    if (!res.error) {
      const saved = cmsRepository.saveCms(projectId, res.cms);
      return { ...res, cms: saved };
    }
    return res;
  },

  saveRecordObject(
    projectId: string | null | undefined,
    record: CmsContentRecord,
    options?: { isEditing?: boolean; expectedRevision?: number }
  ): CmsMutationResult {
    return cmsRepository.saveRecord(projectId, {
      recordId: options?.isEditing ? record.recordId : undefined,
      contentTypeId: record.contentTypeId,
      status: record.status,
      slug: record.slug,
      fields: record.fields,
      termIdsByTaxonomy: record.termIdsByTaxonomy,
      relationIdsByField: record.relationIdsByField,
      sortOrder: record.sortOrder,
      scheduledAt: record.scheduledAt,
      expectedRevision: options?.expectedRevision,
    });
  },

  transitionRecordStatus(
    projectId: string | null | undefined,
    recordId: string,
    nextStatus: CmsRecordStatus
  ): CmsMutationResult {
    const current = cmsRepository.getCms(projectId);
    const res = transitionCmsRecordStatus(current, recordId, nextStatus);
    if (!res.error) {
      const saved = cmsRepository.saveCms(projectId, res.cms);
      return { ...res, cms: saved };
    }
    return res;
  },

  duplicateRecord(projectId: string | null | undefined, recordId: string): CmsMutationResult {
    const current = cmsRepository.getCms(projectId);
    const res = duplicateCmsRecord(current, recordId);
    if (!res.error) {
      const saved = cmsRepository.saveCms(projectId, res.cms);
      return { ...res, cms: saved };
    }
    return res;
  },

  deleteRecordPermanently(
    projectId: string | null | undefined,
    recordId: string,
    options: { detachReferences?: boolean } = {}
  ): CmsMutationResult {
    const current = cmsRepository.getCms(projectId);
    const res = deleteCmsRecordPermanently(current, recordId, options);
    if (!res.error) {
      const saved = cmsRepository.saveCms(projectId, res.cms);
      return { ...res, cms: saved };
    }
    return res;
  },

  bulkActionRecords(
    projectId: string | null | undefined,
    recordIds: string[],
    action: 'publish' | 'draft' | 'archive' | 'trash' | 'restore' | 'delete_permanently'
  ): BulkActionResult {
    const current = cmsRepository.getCms(projectId);
    const res = bulkActionCmsRecords(current, recordIds, action);
    const saved = cmsRepository.saveCms(projectId, res.cms);
    return { ...res, cms: saved };
  },

  async loadFromProjectServer(
    projectId: string,
    accessToken: string,
    options?: { forceAdoptRemote?: boolean }
  ): Promise<{
    workspaceConnected: boolean;
    found: boolean;
    folderId: string;
    manifestFileId: string;
    spreadsheetId: string;
    cms: CmsDocument;
    adoptedRemote: boolean;
  }> {
    const res = await workspaceHierarchyClient.getProjectCms(accessToken, projectId, {
      includeDocument: true,
    });
    const localCms = cmsRepository.getCms(projectId);

    if (!res.found || !res.document) {
      const nextWithHealth: CmsDocument = {
        ...localCms,
        storageHealth: {
          ...localCms.storageHealth,
          cmsFolderDriveId: res.folderId || localCms.storageHealth.cmsFolderDriveId,
          manifestDriveFileId:
            res.manifestFileId || localCms.storageHealth.manifestDriveFileId,
        },
      };
      return {
        workspaceConnected: res.workspaceConnected,
        found: false,
        folderId: res.folderId,
        manifestFileId: res.manifestFileId,
        spreadsheetId: res.spreadsheetId,
        cms: nextWithHealth,
        adoptedRemote: false,
      };
    }

    const remoteRev = Number((res.document as { cmsRevision?: number; revision?: number }).cmsRevision ?? res.document.revision ?? 1);
    const shouldAdopt =
      Boolean(options?.forceAdoptRemote) ||
      !cmsRepository.hasStoredCms(projectId) ||
      remoteRev >= (localCms.revision || 1);

    if (shouldAdopt) {
      const merged = normalizeCmsDocument({
        ...localCms,
        ...res.document,
        revision: Math.max(remoteRev, localCms.revision || 1),
        storageHealth: {
          ...localCms.storageHealth,
          cmsFolderDriveId: res.folderId || localCms.storageHealth.cmsFolderDriveId,
          manifestDriveFileId: res.manifestFileId || localCms.storageHealth.manifestDriveFileId,
          lastCmsPullAt: new Date().toISOString(),
          syncStatus: 'synced',
          lastError: null,
        },
      });
      const saved = cmsRepository.saveCms(projectId, merged);
      return {
        workspaceConnected: res.workspaceConnected,
        found: true,
        folderId: res.folderId,
        manifestFileId: res.manifestFileId,
        spreadsheetId: res.spreadsheetId,
        cms: saved,
        adoptedRemote: true,
      };
    }

    return {
      workspaceConnected: res.workspaceConnected,
      found: true,
      folderId: res.folderId,
      manifestFileId: res.manifestFileId,
      spreadsheetId: res.spreadsheetId,
      cms: localCms,
      adoptedRemote: false,
    };
  },

  async syncToProjectServer(
    projectId: string,
    accessToken: string,
    options?: {
      syncSheets?: boolean;
      projectName?: string;
      siteId?: string;
      ownerAccountId?: string;
    }
  ): Promise<{
    cms: CmsDocument;
    folderId: string;
    manifestFileId: string;
    spreadsheetId: string;
    tabsSynced: string[];
    syncedAt: string;
  }> {
    const current = cmsRepository.getCms(projectId);
    const syncSheets = options?.syncSheets !== false;
    const tables = syncSheets
      ? buildCmsSheetTables(current, {
          siteId: options?.siteId || projectId,
          ownerAccountId: options?.ownerAccountId || '',
        })
      : undefined;

    const savedRemote = await workspaceHierarchyClient.saveProjectCms(accessToken, projectId, {
      document: current,
      syncSheets,
      title: options?.projectName ? `Builly CMS — ${options.projectName}` : undefined,
      tables,
    });

    const nextCms = cmsRepository.saveCms(projectId, {
      ...current,
      richDocs: savedRemote.richDocs || current.richDocs,
      storageHealth: {
        ...current.storageHealth,
        cmsFolderDriveId: savedRemote.folderId,
        richContentFolderDriveId: savedRemote.richContentFolderId,
        manifestDriveFileId: savedRemote.manifestFileId,
        lastCmsSyncAt: savedRemote.syncedAt,
        syncStatus: 'synced',
        lastError: null,
        syncedTabNames: savedRemote.tabsSynced,
      },
      operationalLogs: [
        {
          id: `oplog_${Date.now().toString(36)}`,
          timestamp: savedRemote.syncedAt,
          level: 'info' as const,
          action: 'project_cms_sync',
          detail: `Synced project CMS to Drive (${savedRemote.tabsSynced.length} Sheets tabs updated).`,
        },
        ...(current.operationalLogs || []),
      ].slice(0, 60),
    });

    return {
      cms: nextCms,
      folderId: savedRemote.folderId,
      manifestFileId: savedRemote.manifestFileId,
      spreadsheetId: savedRemote.spreadsheetId,
      tabsSynced: savedRemote.tabsSynced,
      syncedAt: savedRemote.syncedAt,
    };
  },
};
