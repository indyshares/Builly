import { GoogleWorkspaceState, SiteDocument } from '../types/builder';
import {
  DEMO_GOOGLE_WORKSPACE_TABS,
  INITIAL_GOOGLE_WORKSPACE,
  INITIAL_SITE,
} from '../data/initialSite';
import { migrateSiteToThemeConfig } from './themeService';
import { migrateSitePages } from './pageService';
import { migrateSiteComponentsAndLayout } from './componentLibraryService';
import { migrateSiteCms } from './cms/cmsService';
import { cmsRepository, getProjectCmsStorageKey } from './cms/cmsRepository';
import { assetRepository, getProjectAssetsStorageKey } from './assetRepository';

const STORAGE_KEY_SITE = 'indyshares_portfolio_site_v2';
const STORAGE_KEY_WORKSPACE = 'indyshares_google_workspace_v2';
const PROJECT_DRAFT_KEY_PREFIX = 'builly_project_draft:';
const ACTIVE_PROJECT_CTX_KEY = 'builly_active_project_ctx_v1';

export interface ActiveProjectContextMeta {
  orgId?: string;
  orgName?: string;
  projectId?: string;
  projectName?: string;
}

export function getProjectDraftStorageKey(projectId?: string | null): string {
  const clean = (projectId || '').trim();
  return clean ? `${PROJECT_DRAFT_KEY_PREFIX}${clean}` : STORAGE_KEY_SITE;
}

export function saveActiveProjectContext(ctx: ActiveProjectContextMeta | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!ctx || (!ctx.orgId && !ctx.projectId)) {
      window.localStorage.removeItem(ACTIVE_PROJECT_CTX_KEY);
      return;
    }
    window.localStorage.setItem(ACTIVE_PROJECT_CTX_KEY, JSON.stringify(ctx));
  } catch {
    // Ignore storage quota/restriction errors
  }
}

export function loadActiveProjectContext(): ActiveProjectContextMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_PROJECT_CTX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveProjectContextMeta;
    return parsed && (parsed.orgId || parsed.projectId) ? parsed : null;
  } catch {
    return null;
  }
}

export function createDemoWorkspaceState(): GoogleWorkspaceState {
  return {
    ...INITIAL_GOOGLE_WORKSPACE,
    isDemoMode: true,
    connectionStatus: 'not_connected',
    connected: false,
    connectionHealth: 'disconnected',
    lastSynced: 'Demo preview (local only)',
    syncStatus: 'idle',
    spreadsheetLinked: false,
    spreadsheet: {
      id: '',
      name: 'Demo Sample Data (Local Only)',
      url: '',
      tabs: JSON.parse(JSON.stringify(DEMO_GOOGLE_WORKSPACE_TABS)),
    },
  };
}

export const storageService = {
  hasProjectDraft(projectId: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return Boolean(localStorage.getItem(getProjectDraftStorageKey(projectId)));
    } catch {
      return false;
    }
  },

  inspectLegacyDraft(): { exists: boolean; siteName?: string; siteSlug?: string } {
    if (typeof localStorage === 'undefined') return { exists: false };
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SITE);
      if (!raw) return { exists: false };
      const parsed = JSON.parse(raw) as Partial<SiteDocument>;
      return {
        exists: true,
        siteName: parsed.name || 'Untitled Site',
        siteSlug: parsed.portfolioSlug || '',
      };
    } catch {
      return { exists: false };
    }
  },

  importLegacyDraftToProject(projectId: string): SiteDocument | null {
    if (typeof localStorage === 'undefined' || !projectId.trim()) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SITE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SiteDocument;
      const migrated = migrateSiteCms(
        migrateSiteComponentsAndLayout(migrateSiteToThemeConfig(migrateSitePages(parsed)))
      );
      localStorage.setItem(getProjectDraftStorageKey(projectId), JSON.stringify(migrated));
      if (migrated.cms) {
        cmsRepository.saveCms(projectId, migrated.cms, { mirrorToDraft: false });
      }
      if (migrated.mediaAssets) {
        assetRepository.saveAssets(projectId, migrated.mediaAssets, { mirrorToDraft: false });
      }
      return migrated;
    } catch {
      return null;
    }
  },

  clearLegacyBrowserDrafts(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY_SITE);
      localStorage.removeItem(STORAGE_KEY_WORKSPACE);
    } catch {
      // Ignore storage failures
    }
  },

  loadSite(projectId?: string | null): SiteDocument {
    let hydrated: SiteDocument | null = null;
    try {
      const key = getProjectDraftStorageKey(projectId);
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data) as SiteDocument;
        hydrated = migrateSiteCms(
          migrateSiteComponentsAndLayout(migrateSiteToThemeConfig(migrateSitePages(parsed)))
        );
      }
    } catch (e) {
      console.warn('Failed to parse site from storage, defaulting to initial template', e);
    }

    if (!hydrated) {
      hydrated = migrateSiteCms(
        migrateSiteComponentsAndLayout(migrateSiteToThemeConfig(migrateSitePages(INITIAL_SITE)))
      );
    }

    let result = hydrated;
    if (cmsRepository.hasStoredCms(projectId)) {
      const repoCms = cmsRepository.getCms(projectId);
      if ((repoCms.revision || 1) >= (result.cms?.revision || 1)) {
        result = { ...result, cms: repoCms };
      }
    }
    if (assetRepository.hasStoredAssets(projectId)) {
      result = { ...result, mediaAssets: assetRepository.getAssets(projectId) };
    }

    return result;
  },

  findLocalDraftBySiteSlug(siteSlug: string): SiteDocument | null {
    if (typeof localStorage === 'undefined') return null;
    const normalized = siteSlug.trim().toLowerCase();
    if (!normalized) return null;

    const activeCtx = loadActiveProjectContext();
    if (activeCtx?.projectId) {
      const activeDoc = storageService.loadSite(activeCtx.projectId);
      if (activeDoc.portfolioSlug?.toLowerCase() === normalized) {
        return activeDoc;
      }
    }

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PROJECT_DRAFT_KEY_PREFIX)) continue;
        const projId = key.slice(PROJECT_DRAFT_KEY_PREFIX.length);
        const doc = storageService.loadSite(projId);
        if (doc.portfolioSlug?.toLowerCase() === normalized) {
          return doc;
        }
      }
    } catch {
      // Ignore iteration failures
    }

    const legacy = storageService.loadSite();
    if (legacy.portfolioSlug?.toLowerCase() === normalized) {
      return legacy;
    }
    return null;
  },

  saveSiteDraft(
    site: SiteDocument,
    projectId?: string | null
  ): { success: boolean; timestamp: string; fileId: string } {
    try {
      const updatedSite: SiteDocument = {
        ...site,
        pages: site.pages.map((p) =>
          p.id === site.activePageId
            ? {
                ...p,
                lastModified: new Date().toISOString().replace('T', ' ').substring(0, 16),
              }
            : p
        ),
      };
      localStorage.setItem(getProjectDraftStorageKey(projectId), JSON.stringify(updatedSite));
      if (updatedSite.cms) {
        cmsRepository.saveCms(projectId, updatedSite.cms, { mirrorToDraft: false });
      }
      if (Array.isArray(updatedSite.mediaAssets)) {
        assetRepository.saveAssets(projectId, updatedSite.mediaAssets, { mirrorToDraft: false });
      }
      return {
        success: true,
        timestamp: new Date().toLocaleTimeString(),
        fileId: `drv_draft_doc_${Date.now()}`,
      };
    } catch (e) {
      console.error('Failed to save draft to storage', e);
      return { success: false, timestamp: '', fileId: '' };
    }
  },

  loadGoogleWorkspace(): GoogleWorkspaceState {
    try {
      const data = localStorage.getItem(STORAGE_KEY_WORKSPACE);
      if (data) {
        const parsed = JSON.parse(data) as Partial<GoogleWorkspaceState>;

        // Strip legacy v1/v2 hardcoded mock workspace state
        if (
          parsed.spreadsheet?.id === 'sheet_db_7749129' ||
          parsed.spreadsheet?.url?.includes('portfolio-canonical-db')
        ) {
          return INITIAL_GOOGLE_WORKSPACE;
        }

        if (parsed.isDemoMode) {
          return createDemoWorkspaceState();
        }

        // OAuth tokens are strictly in-memory; on page reload, any previously linked
        // Google connection requires re-authenticating to acquire a fresh session token.
        const hasLinkedSheet = Boolean(parsed.spreadsheetLinked && parsed.spreadsheet?.id);
        return {
          ...INITIAL_GOOGLE_WORKSPACE,
          ...parsed,
          isDemoMode: false,
          connected: false,
          connectionStatus: hasLinkedSheet || parsed.userEmail ? 'needs_reauth' : 'not_connected',
          connectionHealth: hasLinkedSheet || parsed.userEmail ? 'degraded' : 'disconnected',
          syncStatus: 'idle',
          syncError: null,
        };
      }
    } catch (e) {
      console.warn('Failed to parse workspace, defaulting to initial', e);
    }
    return INITIAL_GOOGLE_WORKSPACE;
  },

  saveGoogleWorkspace(workspace: GoogleWorkspaceState): void {
    try {
      // Persist only safe metadata & cached rows — never tokens or secrets
      const safeToPersist: GoogleWorkspaceState = {
        ...workspace,
        syncStatus: workspace.syncStatus === 'syncing' ? 'idle' : workspace.syncStatus,
      };
      localStorage.setItem(STORAGE_KEY_WORKSPACE, JSON.stringify(safeToPersist));
    } catch (e) {
      console.error('Failed to save workspace state', e);
    }
  },

  resetToDefault(projectId?: string | null): { site: SiteDocument; workspace: GoogleWorkspaceState } {
    localStorage.removeItem(getProjectDraftStorageKey(projectId));
    localStorage.removeItem(getProjectCmsStorageKey(projectId));
    localStorage.removeItem(getProjectAssetsStorageKey(projectId));
    cmsRepository.clearCache(projectId);
    assetRepository.clearCache(projectId);
    if (!projectId) {
      localStorage.removeItem(STORAGE_KEY_WORKSPACE);
    }
    return {
      site: migrateSiteCms(
        migrateSiteComponentsAndLayout(migrateSiteToThemeConfig(migrateSitePages(INITIAL_SITE)))
      ),
      workspace: INITIAL_GOOGLE_WORKSPACE,
    };
  },

  exportProjectJson(site: SiteDocument, workspace: GoogleWorkspaceState): string {
    const backup = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      site,
      googleWorkspace: workspace,
    };
    return JSON.stringify(backup, null, 2);
  },
};
