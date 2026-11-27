import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DeviceMode,
  EditorPanelType,
  ElementNode,
  GoogleWorkspaceState,
  HeaderFooterComponentDef,
  InsertionPlacement,
  LayoutMode,
  LibraryItem,
  LibraryItemType,
  MediaAsset,
  PageDocument,
  PageLayoutSlot,
  PageStatus,
  RegionResponsiveVisibility,
  RegionType,
  SemanticThemeColors,
  SheetsTab,
  SiteDocument,
  ThemeTokens,
  BuildRelease,
} from './types/builder';
import { useEditorViewport } from './config/breakpoints';
import { ENV_CONFIG } from './config/env';
import {
  ELEMENT_REGISTRY,
  canNestElement,
  isContainerElementType,
} from './data/elementRegistry';
import {
  DEFAULT_REGION_VISIBILITY,
  applyComponentRevisionToSite,
  cloneHeaderFooterAsLocal,
  createBlankHeaderFooterDef,
  createDefaultPageLayout,
  createLibraryItemFromNode,
  instantiateLibraryItem,
  migrateSiteComponentsAndLayout,
  normalizeRegionVisibility,
  resolvePageSlotComponent,
} from './services/componentLibraryService';
import {
  executeTreeInsert,
  executeTreeMove,
  findNodeParentAndIndex,
  getMoveTargetsForNode,
  getRegionContextForNode,
  validateTreeInsert,
  validateTreeMove,
} from './services/treeCommandService';
import { BuilderDragProvider } from './contexts/BuilderDragContext';
import { findPresetById } from './data/headerFooterPresets';
import {
  ActiveProjectContextMeta,
  storageService,
  createDemoWorkspaceState,
} from './services/storageService';
import { INITIAL_GOOGLE_WORKSPACE, DEMO_GOOGLE_WORKSPACE_TABS } from './data/initialSite';
import {
  GOOGLE_WORKSPACE_SCOPES,
  GoogleAuthCancelledError,
  cancelGoogleSignIn,
  clearInMemoryAccessToken,
  disconnectGoogleWorkspace,
  getGoogleAccessToken,
  initGoogleAuth,
  signInWithGoogleWorkspace,
} from './services/googleAuthService';
import {
  GoogleWorkspaceApiError,
  createPortfolioSpreadsheet,
  extractSpreadsheetIdFromInput,
  initializeMissingTabsInSpreadsheet,
  openGoogleSpreadsheetPicker,
  readSpreadsheetTabs,
  saveTabsToSpreadsheet,
  verifySpreadsheetAccess,
} from './services/googleWorkspaceApi';
import { THEMES } from './data/themes';
import { normalizeHexColor, resolveEffectiveTheme } from './services/themeService';
import {
  PageCreationMethod,
  cloneElementTreeWithNewIds,
  createPageDocument,
  generateUniquePageSlug,
  migrateSitePages,
  normalizePageOrders,
  resolvePageFullPath,
  sortPagesForTree,
  wouldCreateParentCycle,
} from './services/pageService';
import {
  DriveConcurrencyError,
  loadSitePagesFromGoogleDrive,
  syncSitePagesToGoogleDrive,
} from './services/drivePageRegistryService';
import { HeaderToolbar } from './components/builder/HeaderToolbar';
import { LeftSidebar, LeftTab } from './components/builder/LeftSidebar';
import { PageSettingsPatch } from './components/builder/PageManagementPanel';
import { Canvas } from './components/builder/Canvas';
import { PropertyInspector } from './components/builder/PropertyInspector';
import { MobileBottomNav, MobileMoreSheet } from './components/builder/MobileBottomNav';
import { PublishModal } from './components/modals/PublishModal';
import { GoogleSetupModal } from './components/modals/GoogleSetupModal';
import { PublicSiteModal } from './components/modals/PublicSiteModal';
import { SheetsEditorModal } from './components/sheets/SheetsEditorModal';
import { ExportModal } from './components/modals/ExportModal';
import { PageCreationModal } from './components/modals/PageCreationModal';
import { SaveLibraryModal } from './components/modals/SaveLibraryModal';
import { MoveTargetPickerModal } from './components/modals/MoveTargetPickerModal';
import {
  DeleteChildMode,
  PageDeleteConfirmModal,
} from './components/modals/PageDeleteConfirmModal';
import { WorkspaceConfirmModal } from './components/modals/WorkspaceConfirmModal';
import { CmsWorkspaceModal, CmsViewMode } from './components/cms/CmsWorkspaceModal';
import {
  syncCmsToGoogleWorkspace,
  pullCmsFromGoogleWorkspace,
} from './services/cms/cmsWorkspaceAdapter';
import { cmsRepository } from './services/cms/cmsRepository';
import { assetRepository } from './services/assetRepository';
import { CmsDocument, InboxSubmission, InboxActivity } from './types/cms';
import { escapeSheetFormulaCell } from './services/cms/cmsValidation';
import { BuillyOwnerIdentity } from './features/identity/authService';
import { rollbackSiteOnSharedRuntime } from './services/runtime/publishRuntimeClient';
import {
  LEFT_PANEL_DEFAULT,
  LEFT_PANEL_MAX,
  LEFT_PANEL_MIN,
  RIGHT_PANEL_DEFAULT,
  RIGHT_PANEL_MAX,
  RIGHT_PANEL_MIN,
  clampLeftWidth,
  clampRightWidth,
  loadBuilderUiPrefs,
  saveBuilderUiPrefs,
} from './services/builderUiPrefs';
import { CheckCircle2 } from 'lucide-react';

const LEFT_PANEL_TABS: ReadonlySet<EditorPanelType> = new Set([
  'elements',
  'navigator',
  'pages',
  'themes',
  'sheets',
  'media',
  'code',
  'releases',
]);

function containsNodeId(root: ElementNode | null | undefined, targetId: string): boolean {
  if (!root) return false;
  if (root.id === targetId) return true;
  return Boolean(root.children?.some((child) => containsNodeId(child, targetId)));
}

function findNodeWithParentInTree(
  node: ElementNode,
  targetId: string,
  parent: ElementNode | null = null
): { selectedNode: ElementNode | null; parentNode: ElementNode | null } {
  if (node.id === targetId) return { selectedNode: node, parentNode: parent };
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeWithParentInTree(child, targetId, node);
      if (found.selectedNode) return found;
    }
  }
  return { selectedNode: null, parentNode: null };
}

export interface BuilderAppProps {
  buillyOwner?: BuillyOwnerIdentity | null;
  workerSessionToken?: string | null;
  projectContext?: ActiveProjectContextMeta | null;
  initialPanel?: string | null;
  onNavigateConsole?: () => void;
  onNavigateLanding?: () => void;
  onOpenWorkspaceConnect?: () => void;
  onOpenRuntimeRoute?: (path: string) => void;
  onSignOutOwner?: () => void;
}

export default function App({
  buillyOwner = null,
  workerSessionToken = null,
  projectContext = null,
  initialPanel = null,
  onNavigateConsole,
  onNavigateLanding,
  onOpenWorkspaceConnect,
  onOpenRuntimeRoute,
  onSignOutOwner,
}: BuilderAppProps = {}) {
  const { t } = useTranslation();
  const { viewportMode: editorViewportMode } = useEditorViewport();
  const activeProjectId = projectContext?.projectId || undefined;

  const [site, setSite] = useState<SiteDocument>(() =>
    storageService.loadSite(activeProjectId)
  );
  const [workspace, setWorkspace] = useState<GoogleWorkspaceState>(() =>
    storageService.loadGoogleWorkspace()
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Website preview breakpoint (strictly decoupled from editorViewportMode)
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Desktop dock states & UI preferences persistence
  const [isFocusMode, setIsFocusMode] = useState<boolean>(() => loadBuilderUiPrefs().focusMode);
  const [isDesktopLeftOpen, setIsDesktopLeftOpen] = useState<boolean>(() => {
    const prefs = loadBuilderUiPrefs();
    return prefs.focusMode ? false : prefs.leftOpen;
  });
  const [isDesktopRightOpen, setIsDesktopRightOpen] = useState<boolean>(() => {
    const prefs = loadBuilderUiPrefs();
    return prefs.focusMode ? false : prefs.rightOpen;
  });
  const [leftWidth, setLeftWidth] = useState<number>(() => loadBuilderUiPrefs().leftWidth);
  const [rightWidth, setRightWidth] = useState<number>(() => loadBuilderUiPrefs().rightWidth);
  const preFocusDocksRef = useRef<{ leftOpen: boolean; rightOpen: boolean } | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>('elements');

  // Tablet / Mobile single-active-panel state (canvas-first by default)
  const [overlayPanel, setOverlayPanel] = useState<EditorPanelType>('none');
  const [insertionPlacement, setInsertionPlacement] =
    useState<InsertionPlacement>('into-selected');

  // Modals
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isGoogleSetupModalOpen, setIsGoogleSetupModalOpen] = useState(false);
  const [isPublicSiteModalOpen, setIsPublicSiteModalOpen] = useState(false);
  const [previewReleaseVersion, setPreviewReleaseVersion] = useState<string | null>(null);

  const handlePreviewRelease = (version: string) => {
    setPreviewReleaseVersion(version);
    setIsPublicSiteModalOpen(true);
  };

  const handleClosePublicSiteModal = () => {
    setIsPublicSiteModalOpen(false);
    setPreviewReleaseVersion(null);
  };
  const [isSheetsEditorModalOpen, setIsSheetsEditorModalOpen] = useState(false);
  const [isCmsWorkspaceModalOpen, setIsCmsWorkspaceModalOpen] = useState(false);
  const [cmsInitialViewMode, setCmsInitialViewMode] = useState<CmsViewMode>('overview');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const loadedProjectIdRef = useRef<string | undefined>(activeProjectId);

  useEffect(() => {
    if (loadedProjectIdRef.current !== activeProjectId) {
      loadedProjectIdRef.current = activeProjectId;
      setSite(storageService.loadSite(activeProjectId));
      setSelectedId(null);
      setHasUnsavedChanges(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    const unsubscribe = cmsRepository.subscribe(activeProjectId, (repoCms) => {
      setSite((prev) => (prev.cms === repoCms ? prev : { ...prev, cms: repoCms }));
    });
    const unsubscribeAssets = assetRepository.subscribe(activeProjectId, (repoAssets) => {
      setSite((prev) =>
        prev.mediaAssets === repoAssets ? prev : { ...prev, mediaAssets: repoAssets }
      );
    });
    if (activeProjectId && workerSessionToken) {
      void cmsRepository
        .loadFromProjectServer(activeProjectId, workerSessionToken)
        .catch(() => undefined);
    }
    return () => {
      unsubscribe();
      unsubscribeAssets();
    };
  }, [activeProjectId, workerSessionToken]);

  useEffect(() => {
    if (!initialPanel) return;
    if (initialPanel === 'cms') {
      setCmsInitialViewMode('overview');
      setIsCmsWorkspaceModalOpen(true);
    } else if (initialPanel === 'inbox') {
      setCmsInitialViewMode('inbox');
      setIsCmsWorkspaceModalOpen(true);
    } else if (initialPanel === 'assets') {
      setLeftTab('media');
      setIsDesktopLeftOpen(true);
    } else if (initialPanel === 'versions') {
      setLeftTab('releases');
      setIsDesktopLeftOpen(true);
    }
  }, [initialPanel]);
  const [pageCreateModalState, setPageCreateModalState] = useState<{
    open: boolean;
    forceHome?: boolean;
    method?: PageCreationMethod;
    sourcePageId?: string;
  }>({ open: false });
  const [deleteTargetPage, setDeleteTargetPage] = useState<PageDocument | null>(null);
  const [saveLibraryTarget, setSaveLibraryTarget] = useState<{
    node: ElementNode;
    defaultType: LibraryItemType;
  } | null>(null);
  const [openLayoutForPageId, setOpenLayoutForPageId] = useState<string | null>(null);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [driveConflictRevision, setDriveConflictRevision] = useState<number | null>(null);
  const [driveConfirmState, setDriveConfirmState] = useState<{
    open: boolean;
    mode: 'sync' | 'load';
    forceOverwrite?: boolean;
  } | null>(null);
  const [movePickerNodeId, setMovePickerNodeId] = useState<string | null>(null);
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('');

  const [history, setHistory] = useState<{ past: SiteDocument[]; future: SiteDocument[] }>({
    past: [],
    future: [],
  });

  const [reduceMotionPreview, setReduceMotionPreview] = useState(false);
  const lastPropertyEditRef = useRef<{ elementId: string; ts: number } | null>(null);

  const activePage = useMemo(
    () => site.pages.find((p) => p.id === site.activePageId) || site.pages[0] || null,
    [site.pages, site.activePageId]
  );

  const effectiveTheme = useMemo(() => resolveEffectiveTheme(site), [site]);

  const headerSlot = useMemo(
    () => resolvePageSlotComponent(activePage, site, 'header'),
    [activePage, site]
  );
  const footerSlot = useMemo(
    () => resolvePageSlotComponent(activePage, site, 'footer'),
    [activePage, site]
  );

  const protectedRootIds = useMemo(
    () =>
      new Set(
        [
          activePage?.rootElement.id,
          headerSlot.definition?.rootElement.id,
          footerSlot.definition?.rootElement.id,
        ].filter(Boolean) as string[]
      ),
    [activePage, headerSlot.definition, footerSlot.definition]
  );

  const { selectedNode, parentNode, editingRegionLabel } = useMemo((): {
    selectedNode: ElementNode | null;
    parentNode: ElementNode | null;
    editingRegionLabel?: string;
  } => {
    if (!selectedId || !activePage) {
      return { selectedNode: null, parentNode: null };
    }
    if (headerSlot.definition) {
      const inHeader = findNodeWithParentInTree(headerSlot.definition.rootElement, selectedId, null);
      if (inHeader.selectedNode) {
        return {
          ...inHeader,
          editingRegionLabel:
            headerSlot.mode === 'global' ? 'Global Header' : 'Local Header',
        };
      }
    }
    const inPage = findNodeWithParentInTree(activePage.rootElement, selectedId, null);
    if (inPage.selectedNode) {
      return { ...inPage, editingRegionLabel: 'Page Content' };
    }
    if (footerSlot.definition) {
      const inFooter = findNodeWithParentInTree(footerSlot.definition.rootElement, selectedId, null);
      if (inFooter.selectedNode) {
        return {
          ...inFooter,
          editingRegionLabel:
            footerSlot.mode === 'global' ? 'Global Footer' : 'Local Footer',
        };
      }
    }
    return { selectedNode: null, parentNode: null };
  }, [selectedId, activePage, headerSlot, footerSlot]);

  // Clear selection if selectedId no longer exists in active header/page/footer
  useEffect(() => {
    if (selectedId && !selectedNode) {
      setSelectedId(null);
    }
  }, [selectedId, selectedNode]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const announceAndToast = useCallback(
    (msg: string) => {
      setAriaAnnouncement(msg);
      showToast(msg);
    },
    [showToast]
  );

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const persistWorkspace = useCallback((next: GoogleWorkspaceState) => {
    setWorkspace(next);
    storageService.saveGoogleWorkspace(next);
  }, []);

  // Monitor Google Identity OAuth token validity (access tokens stay strictly in-memory)
  useEffect(() => {
    const unsubscribe = initGoogleAuth(undefined, (user) => {
      if (!user) {
        setWorkspace((prev) => {
          if (!prev.connected && prev.connectionStatus !== 'connecting') return prev;
          const next: GoogleWorkspaceState = {
            ...prev,
            connected: false,
            connectionStatus: prev.spreadsheetLinked ? 'needs_reauth' : 'not_connected',
            connectionHealth: prev.spreadsheetLinked ? 'degraded' : 'disconnected',
          };
          storageService.saveGoogleWorkspace(next);
          return next;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const pushState = useCallback(
    (newSite: SiteDocument) => {
      setHistory((prev) => ({ past: [...prev.past.slice(-25), site], future: [] }));
      setSite(newSite);
      setHasUnsavedChanges(true);
    },
    [site]
  );

  const handleUndo = useCallback(() => {
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    setHistory({ past: history.past.slice(0, -1), future: [site, ...history.future] });
    setSite(previous);
    setHasUnsavedChanges(true);
    showToast('Undo applied');
  }, [history, site, showToast]);

  const handleRedo = useCallback(() => {
    if (history.future.length === 0) return;
    const next = history.future[0];
    setHistory({ past: [...history.past, site], future: history.future.slice(1) });
    setSite(next);
    setHasUnsavedChanges(true);
    showToast('Redo applied');
  }, [history, site, showToast]);

  const handleSaveDraft = useCallback(() => {
    const res = storageService.saveSiteDraft(site, activeProjectId);
    if (res.success) {
      setHasUnsavedChanges(false);
      setLastSavedTime(res.timestamp);
      showToast('Draft saved');
    }
  }, [site, activeProjectId, showToast]);

  const transformOwningTree = useCallback(
    (
      targetId: string,
      transformer: (root: ElementNode) => ElementNode,
      coalesce = false,
      extraSitePatch?: (draft: SiteDocument) => SiteDocument
    ) => {
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
      const isoNow = new Date().toISOString();
      let nextSite: SiteDocument = site;
      let mutated = false;

      if (activePage && containsNodeId(activePage.rootElement, targetId)) {
        nextSite = {
          ...site,
          pages: site.pages.map((p) =>
            p.id !== activePage.id
              ? p
              : {
                  ...p,
                  rootElement: transformer(JSON.parse(JSON.stringify(p.rootElement))),
                  lastModified: stamp,
                }
          ),
        };
        mutated = true;
      } else if (
        activePage?.layout?.header.localComponent &&
        containsNodeId(activePage.layout.header.localComponent.rootElement, targetId)
      ) {
        nextSite = {
          ...site,
          pages: site.pages.map((p) =>
            p.id !== activePage.id || !p.layout?.header.localComponent
              ? p
              : {
                  ...p,
                  layout: {
                    ...p.layout,
                    header: {
                      ...p.layout.header,
                      localComponent: {
                        ...p.layout.header.localComponent,
                        rootElement: transformer(
                          JSON.parse(JSON.stringify(p.layout.header.localComponent.rootElement))
                        ),
                        revision: p.layout.header.localComponent.revision + 1,
                        updatedAt: isoNow,
                      },
                    },
                  },
                  lastModified: stamp,
                }
          ),
        };
        mutated = true;
      } else if (
        activePage?.layout?.footer.localComponent &&
        containsNodeId(activePage.layout.footer.localComponent.rootElement, targetId)
      ) {
        nextSite = {
          ...site,
          pages: site.pages.map((p) =>
            p.id !== activePage.id || !p.layout?.footer.localComponent
              ? p
              : {
                  ...p,
                  layout: {
                    ...p.layout,
                    footer: {
                      ...p.layout.footer,
                      localComponent: {
                        ...p.layout.footer.localComponent,
                        rootElement: transformer(
                          JSON.parse(JSON.stringify(p.layout.footer.localComponent.rootElement))
                        ),
                        revision: p.layout.footer.localComponent.revision + 1,
                        updatedAt: isoNow,
                      },
                    },
                  },
                  lastModified: stamp,
                }
          ),
        };
        mutated = true;
      } else if (
        site.globalComponents?.headers.some((h) => containsNodeId(h.rootElement, targetId))
      ) {
        nextSite = {
          ...site,
          globalComponents: {
            ...site.globalComponents,
            headers: site.globalComponents.headers.map((h) =>
              containsNodeId(h.rootElement, targetId)
                ? {
                    ...h,
                    rootElement: transformer(JSON.parse(JSON.stringify(h.rootElement))),
                    revision: h.revision + 1,
                    updatedAt: isoNow,
                  }
                : h
            ),
          },
        };
        mutated = true;
      } else if (
        site.globalComponents?.footers.some((f) => containsNodeId(f.rootElement, targetId))
      ) {
        nextSite = {
          ...site,
          globalComponents: {
            ...site.globalComponents,
            footers: site.globalComponents.footers.map((f) =>
              containsNodeId(f.rootElement, targetId)
                ? {
                    ...f,
                    rootElement: transformer(JSON.parse(JSON.stringify(f.rootElement))),
                    revision: f.revision + 1,
                    updatedAt: isoNow,
                  }
                : f
            ),
          },
        };
        mutated = true;
      }

      if (!mutated) return;
      if (extraSitePatch) {
        nextSite = extraSitePatch(nextSite);
      }

      if (coalesce) {
        setSite(nextSite);
        setHasUnsavedChanges(true);
      } else {
        pushState(nextSite);
      }
    },
    [site, activePage, pushState]
  );

  const handleUpdateElement = useCallback(
    (updatedNode: ElementNode) => {
      const now = Date.now();
      const prev = lastPropertyEditRef.current;
      const shouldCoalesce =
        Boolean(prev && prev.elementId === updatedNode.id && now - prev.ts < 550);
      lastPropertyEditRef.current = { elementId: updatedNode.id, ts: now };

      transformOwningTree(
        updatedNode.id,
        (root) => {
          const updateRec = (current: ElementNode): ElementNode =>
            current.id === updatedNode.id
              ? updatedNode
              : current.children
              ? { ...current, children: current.children.map(updateRec) }
              : current;
          return updateRec(root);
        },
        shouldCoalesce
      );
    },
    [transformOwningTree]
  );

  const handleDeleteElement = useCallback(
    (idToDelete: string) => {
      if (protectedRootIds.has(idToDelete)) {
        showToast('Region root containers cannot be deleted');
        return;
      }
      transformOwningTree(idToDelete, (root) => {
        const removeRec = (current: ElementNode): ElementNode =>
          !current.children
            ? current
            : {
                ...current,
                children: current.children
                  .filter((c) => c.id !== idToDelete)
                  .map(removeRec),
              };
        return removeRec(root);
      });
      if (selectedId === idToDelete) {
        setSelectedId(null);
        if (overlayPanel === 'properties') setOverlayPanel('none');
      }
      showToast('Element removed');
    },
    [protectedRootIds, transformOwningTree, selectedId, overlayPanel, showToast]
  );

  const handleDuplicateElement = useCallback(
    (idToDup: string) => {
      if (protectedRootIds.has(idToDup)) return;
      let duplicatedId: string | null = null;
      transformOwningTree(idToDup, (root) => {
        const dupRec = (current: ElementNode): ElementNode => {
          if (!current.children) return current;
          const newChildren: ElementNode[] = [];
          for (const child of current.children) {
            newChildren.push(dupRec(child));
            if (child.id === idToDup) {
              const clone = cloneElementTreeWithNewIds(child);
              duplicatedId = clone.id;
              newChildren.push(clone);
            }
          }
          return { ...current, children: newChildren };
        };
        return dupRec(root);
      });
      if (duplicatedId) setSelectedId(duplicatedId);
      showToast('Element duplicated');
    },
    [protectedRootIds, transformOwningTree, showToast]
  );

  const handleMoveElement = useCallback(
    (targetId: string, direction: 'up' | 'down') => {
      transformOwningTree(targetId, (root) => {
        const moveRec = (current: ElementNode): ElementNode => {
          if (!current.children) return current;
          const idx = current.children.findIndex((c) => c.id === targetId);
          if (idx !== -1) {
            const newChildren = [...current.children];
            if (direction === 'up' && idx > 0) {
              [newChildren[idx], newChildren[idx - 1]] = [
                newChildren[idx - 1],
                newChildren[idx],
              ];
            } else if (direction === 'down' && idx < newChildren.length - 1) {
              [newChildren[idx], newChildren[idx + 1]] = [
                newChildren[idx + 1],
                newChildren[idx],
              ];
            }
            return { ...current, children: newChildren };
          }
          return { ...current, children: current.children.map(moveRec) };
        };
        return moveRec(root);
      });
    },
    [transformOwningTree]
  );

  const handleMoveIntoContainer = useCallback(
    (elementId: string, targetContainerId: string) => {
      if (
        !activePage ||
        elementId === targetContainerId ||
        protectedRootIds.has(elementId)
      ) {
        return;
      }
      transformOwningTree(elementId, (root) => {
        if (!containsNodeId(root, targetContainerId)) return root;
        let extracted: ElementNode | null = null;

        const findAndCheck = (node: ElementNode): ElementNode | null => {
          if (node.id === elementId) return node;
          if (node.children) {
            for (const c of node.children) {
              const found = findAndCheck(c);
              if (found) return found;
            }
          }
          return null;
        };

        const sourceNode = findAndCheck(root);
        const targetNode = findAndCheck(root) && (() => {
          const findTarget = (n: ElementNode): ElementNode | null => {
            if (n.id === targetContainerId) return n;
            for (const c of n.children || []) {
              const r = findTarget(c);
              if (r) return r;
            }
            return null;
          };
          return findTarget(root);
        })();

        if (
          !sourceNode ||
          !targetNode ||
          containsNodeId(sourceNode, targetContainerId) ||
          !canNestElement(targetNode, sourceNode.type).allowed
        ) {
          return root;
        }

        const removeNode = (node: ElementNode): ElementNode => {
          if (!node.children) return node;
          const filtered: ElementNode[] = [];
          for (const child of node.children) {
            if (child.id === elementId) {
              extracted = child;
            } else {
              filtered.push(removeNode(child));
            }
          }
          return { ...node, children: filtered };
        };

        const withoutSource = removeNode(root);
        if (!extracted) return root;

        const insertNode = (node: ElementNode): ElementNode => {
          if (node.id === targetContainerId) {
            return { ...node, children: [...(node.children || []), extracted!] };
          }
          if (!node.children) return node;
          return { ...node, children: node.children.map(insertNode) };
        };

        return insertNode(withoutSource);
      });
      showToast('Moved into container');
    },
    [activePage, protectedRootIds, transformOwningTree, showToast]
  );

  const handleToggleHide = useCallback(
    (id: string) => {
      transformOwningTree(id, (root) => {
        const toggleRec = (current: ElementNode): ElementNode =>
          current.id === id
            ? { ...current, hidden: !current.hidden }
            : current.children
            ? { ...current, children: current.children.map(toggleRec) }
            : current;
        return toggleRec(root);
      });
    },
    [transformOwningTree]
  );

  const handleToggleLock = useCallback(
    (id: string) => {
      transformOwningTree(id, (root) => {
        const toggleRec = (current: ElementNode): ElementNode =>
          current.id === id
            ? { ...current, locked: !current.locked }
            : current.children
            ? { ...current, children: current.children.map(toggleRec) }
            : current;
        return toggleRec(root);
      });
    },
    [transformOwningTree]
  );

  const handleAddChild = useCallback(
    (parentId: string) => {
      const newNode: ElementNode = {
        id: 'c_' + Math.random().toString(36).substring(2, 7),
        type: 'container',
        name: 'New Container',
        tag: 'div',
        styles: {
          display: 'flex',
          flexDirection: 'column',
          paddingTop: '16px',
          paddingRight: '16px',
          paddingBottom: '16px',
          paddingLeft: '16px',
          gap: '8px',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--color-border)',
          borderRadius: 'var(--theme-radius, 8px)',
        },
        children: [],
      };
      transformOwningTree(parentId, (root) => {
        const addRec = (current: ElementNode): ElementNode =>
          current.id === parentId
            ? { ...current, children: [...(current.children || []), newNode] }
            : current.children
            ? { ...current, children: current.children.map(addRec) }
            : current;
        return addRec(root);
      });
      setSelectedId(newNode.id);
      showToast('Container added');
    },
    [transformOwningTree, showToast]
  );

  const handleCommitTreeMove = useCallback(
    (nodeIds: string[], destinationParentId: string, destinationIndex: number) => {
      const validation = validateTreeMove(site, activePage, {
        nodeIds,
        destinationParentId,
        destinationIndex,
      });
      if (!validation.valid) {
        if (!validation.isNoOp && validation.reason) {
          announceAndToast(validation.reason);
        }
        return;
      }

      transformOwningTree(destinationParentId, (root) =>
        executeTreeMove(root, nodeIds, destinationParentId, destinationIndex)
      );
      if (nodeIds.length === 1) {
        setSelectedId(nodeIds[0]);
      }
      announceAndToast(
        nodeIds.length > 1
          ? `Moved ${nodeIds.length} elements to ${validation.destinationParentName || 'container'}`
          : `Moved to ${validation.destinationParentName || 'target'}`
      );
    },
    [site, activePage, transformOwningTree, announceAndToast]
  );

  const handleMoveTopBottom = useCallback(
    (targetId: string, edge: 'top' | 'bottom') => {
      if (!activePage || protectedRootIds.has(targetId)) return;
      const ctx = getRegionContextForNode(site, activePage, targetId);
      if (!ctx) return;
      const loc = findNodeParentAndIndex(ctx.root, targetId);
      if (!loc?.parent) return;
      const destIdx = edge === 'top' ? 0 : loc.parent.children?.length || 0;
      handleCommitTreeMove([targetId], loc.parent.id, destIdx);
    },
    [site, activePage, protectedRootIds, handleCommitTreeMove]
  );

  const handleMoveOutOneLevel = useCallback(
    (targetId: string) => {
      if (!activePage || protectedRootIds.has(targetId)) return;
      const ctx = getRegionContextForNode(site, activePage, targetId);
      if (!ctx) return;
      const targets = getMoveTargetsForNode(ctx.root, targetId);
      if (!targets || targets.ancestors.length === 0) {
        announceAndToast('Already at the top level of this region');
        return;
      }
      const nextAncestor = targets.ancestors[0];
      handleCommitTreeMove([targetId], nextAncestor.id, nextAncestor.insertIndex);
    },
    [site, activePage, protectedRootIds, handleCommitTreeMove, announceAndToast]
  );

  const handleSetInsertionTarget = useCallback(
    (nodeId: string, placement: InsertionPlacement) => {
      setSelectedId(nodeId);
      setInsertionPlacement(placement);
      setLeftTab('elements');
      if (editorViewportMode === 'desktop') {
        setIsDesktopLeftOpen(true);
      } else {
        setOverlayPanel('elements');
      }
      announceAndToast('Insertion target updated');
    },
    [editorViewportMode, announceAndToast]
  );

  const handleCommitCatalogDrop = useCallback(
    (elementType: string, destinationParentId: string, destinationIndex: number) => {
      const def = ELEMENT_REGISTRY.find((c) => c.elementType === elementType);
      if (!def) return;
      const newNode = def.defaultNode();
      const validation = validateTreeInsert(site, activePage, {
        elementType: newNode.type,
        destinationParentId,
        destinationIndex,
      });
      if (!validation.valid) {
        if (validation.reason) announceAndToast(validation.reason);
        return;
      }

      transformOwningTree(
        destinationParentId,
        (root) => executeTreeInsert(root, newNode, destinationParentId, destinationIndex),
        false,
        (draft) => {
          const prevRecent = draft.elementPrefs?.recent || [];
          return {
            ...draft,
            elementPrefs: {
              favorites: draft.elementPrefs?.favorites || [],
              recent: [elementType, ...prevRecent.filter((t) => t !== elementType)].slice(0, 8),
            },
          };
        }
      );
      setSelectedId(newNode.id);
      announceAndToast(`Inserted ${newNode.name}`);
    },
    [site, activePage, transformOwningTree, announceAndToast]
  );

  const handleCommitLibraryDrop = useCallback(
    (
      item: LibraryItem,
      mode: 'independent' | 'linked',
      destinationParentId: string,
      destinationIndex: number
    ) => {
      const newNode = instantiateLibraryItem(item, mode);
      if (!newNode) return;
      const validation = validateTreeInsert(site, activePage, {
        elementType: newNode.type,
        destinationParentId,
        destinationIndex,
        sourceItem: item,
      });
      if (!validation.valid) {
        if (validation.reason) announceAndToast(validation.reason);
        return;
      }

      transformOwningTree(destinationParentId, (root) =>
        executeTreeInsert(root, newNode, destinationParentId, destinationIndex)
      );
      setSelectedId(newNode.id);
      announceAndToast(`Inserted ${item.name}`);
    },
    [site, activePage, transformOwningTree, announceAndToast]
  );

  const handleAddElementFromCatalog = useCallback(
    (catalogNode: ElementNode, elementTypeKey?: string) => {
      if (!activePage) {
        announceAndToast('Create a Home page first before adding elements');
        return;
      }

      const recordRecentPatch = (draft: SiteDocument): SiteDocument => {
        if (!elementTypeKey) return draft;
        const prevRecent = draft.elementPrefs?.recent || [];
        const nextRecent = [
          elementTypeKey,
          ...prevRecent.filter((t) => t !== elementTypeKey),
        ].slice(0, 8);
        return {
          ...draft,
          elementPrefs: {
            favorites: draft.elementPrefs?.favorites || [],
            recent: nextRecent,
          },
        };
      };

      let destParentId = activePage.rootElement.id;
      let destIndex = activePage.rootElement.children?.length || 0;

      if (selectedId && selectedNode) {
        const ctx = getRegionContextForNode(site, activePage, selectedId);
        const loc = ctx ? findNodeParentAndIndex(ctx.root, selectedId) : null;

        if (
          insertionPlacement === 'before-selected' &&
          loc?.parent &&
          !protectedRootIds.has(selectedId)
        ) {
          destParentId = loc.parent.id;
          destIndex = loc.index;
        } else if (
          insertionPlacement === 'after-selected' &&
          loc?.parent &&
          !protectedRootIds.has(selectedId)
        ) {
          destParentId = loc.parent.id;
          destIndex = loc.index + 1;
        } else if (insertionPlacement === 'first-child') {
          if (
            isContainerElementType(selectedNode.type) &&
            !selectedNode.locked &&
            selectedNode.componentRef?.mode !== 'linked'
          ) {
            destParentId = selectedNode.id;
            destIndex = 0;
          } else {
            destParentId = activePage.rootElement.id;
            destIndex = 0;
          }
        } else if (insertionPlacement === 'into-selected') {
          if (isContainerElementType(selectedNode.type)) {
            destParentId = selectedNode.id;
            destIndex = selectedNode.children?.length || 0;
          } else if (loc?.parent) {
            destParentId = loc.parent.id;
            destIndex = loc.index + 1;
          }
        }
      }

      const validation = validateTreeInsert(site, activePage, {
        elementType: catalogNode.type,
        destinationParentId: destParentId,
        destinationIndex: destIndex,
      });

      if (!validation.valid) {
        announceAndToast(validation.reason || 'Invalid insertion target');
        return;
      }

      transformOwningTree(
        destParentId,
        (root) => executeTreeInsert(root, catalogNode, destParentId, destIndex),
        false,
        recordRecentPatch
      );
      setSelectedId(catalogNode.id);
      if (editorViewportMode === 'mobile') {
        setOverlayPanel('none');
      }
      announceAndToast(
        `Added ${catalogNode.name} inside ${validation.destinationParentName || 'page'}`
      );
    },
    [
      site,
      activePage,
      insertionPlacement,
      selectedId,
      selectedNode,
      protectedRootIds,
      transformOwningTree,
      editorViewportMode,
      announceAndToast,
    ]
  );

  const handleDropCatalogItem = useCallback(
    (catalogType: string, targetContainerId: string) => {
      if (!activePage) return;
      const ctx = getRegionContextForNode(site, activePage, targetContainerId);
      const loc = ctx ? findNodeParentAndIndex(ctx.root, targetContainerId) : null;
      const destIdx = loc?.node.children?.length || 0;
      handleCommitCatalogDrop(catalogType, targetContainerId, destIdx);
    },
    [site, activePage, handleCommitCatalogDrop]
  );

  const handleUpdateText = useCallback(
    (id: string, text: string) => {
      transformOwningTree(id, (root) => {
        const updateRec = (current: ElementNode): ElementNode =>
          current.id === id
            ? { ...current, content: { ...current.content, text } }
            : current.children
            ? { ...current, children: current.children.map(updateRec) }
            : current;
        return updateRec(root);
      });
    },
    [transformOwningTree]
  );

  // Library, Favorites, Linked Component & Asset handlers
  const handleToggleFavoriteElement = useCallback(
    (elementType: string) => {
      const currentFavs = site.elementPrefs?.favorites || [];
      const exists = currentFavs.includes(elementType);
      const nextFavs = exists
        ? currentFavs.filter((f) => f !== elementType)
        : [elementType, ...currentFavs];
      setSite((prev) => ({
        ...prev,
        elementPrefs: {
          favorites: nextFavs,
          recent: prev.elementPrefs?.recent || [],
        },
      }));
    },
    [site.elementPrefs]
  );

  const handleSaveLibraryItem = useCallback(
    (params: {
      type: LibraryItemType;
      name: string;
      description: string;
      category: string;
      supportsLinkedInstances: boolean;
    }) => {
      if (!saveLibraryTarget) return;
      const item = createLibraryItemFromNode({
        type: params.type,
        name: params.name,
        description: params.description,
        category: params.category,
        node: saveLibraryTarget.node,
        supportsLinkedInstances: params.supportsLinkedInstances,
      });
      pushState({
        ...site,
        libraryItems: [item, ...(site.libraryItems || [])],
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
      setSaveLibraryTarget(null);
      showToast(`Saved "${item.name}" to My Library`);
    },
    [saveLibraryTarget, site, pushState, showToast]
  );

  const handleDeleteLibraryItem = useCallback(
    (itemId: string) => {
      const detachRec = (node: ElementNode): ElementNode => {
        const nextChildren = node.children ? node.children.map(detachRec) : undefined;
        if (
          node.componentRef?.mode === 'linked' &&
          node.componentRef.definitionId === itemId
        ) {
          return {
            ...node,
            componentRef: { ...node.componentRef, mode: 'detached' },
            ...(nextChildren ? { children: nextChildren } : {}),
          };
        }
        return nextChildren ? { ...node, children: nextChildren } : node;
      };

      pushState({
        ...site,
        libraryItems: (site.libraryItems || []).filter((i) => i.id !== itemId),
        pages: site.pages.map((p) => ({
          ...p,
          rootElement: detachRec(p.rootElement),
          layout: p.layout
            ? {
                header: p.layout.header.localComponent
                  ? {
                      ...p.layout.header,
                      localComponent: {
                        ...p.layout.header.localComponent,
                        rootElement: detachRec(p.layout.header.localComponent.rootElement),
                      },
                    }
                  : p.layout.header,
                footer: p.layout.footer.localComponent
                  ? {
                      ...p.layout.footer,
                      localComponent: {
                        ...p.layout.footer.localComponent,
                        rootElement: detachRec(p.layout.footer.localComponent.rootElement),
                      },
                    }
                  : p.layout.footer,
              }
            : p.layout,
        })),
        globalComponents: site.globalComponents
          ? {
              ...site.globalComponents,
              headers: site.globalComponents.headers.map((h) => ({
                ...h,
                rootElement: detachRec(h.rootElement),
              })),
              footers: site.globalComponents.footers.map((f) => ({
                ...f,
                rootElement: detachRec(f.rootElement),
              })),
            }
          : site.globalComponents,
      });
      showToast('Removed library item and detached any linked instances');
    },
    [site, pushState, showToast]
  );

  const handleDuplicateLibraryItem = useCallback(
    (itemId: string) => {
      const src = (site.libraryItems || []).find((i) => i.id === itemId);
      if (!src || !src.rootNode) return;
      const dup = createLibraryItemFromNode({
        type: src.type,
        name: `${src.name} Copy`,
        description: src.description,
        category: src.category,
        tags: src.tags,
        node: src.rootNode,
        supportsLinkedInstances: src.supportsLinkedInstances,
      });
      pushState({
        ...site,
        libraryItems: [dup, ...(site.libraryItems || [])],
      });
      showToast(`Duplicated "${src.name}"`);
    },
    [site, pushState, showToast]
  );

  const handleSyncLinkedInstances = useCallback(
    (item: LibraryItem) => {
      const nextSite = applyComponentRevisionToSite(site, item);
      pushState(nextSite);
      showToast(`Synced linked instances of "${item.name}"`);
    },
    [site, pushState, showToast]
  );

  const handleDetachLinkedComponent = useCallback(
    (nodeId: string) => {
      transformOwningTree(nodeId, (root) => {
        const detachRec = (current: ElementNode): ElementNode => {
          if (current.id === nodeId && current.componentRef) {
            return {
              ...current,
              componentRef: { ...current.componentRef, mode: 'detached' },
            };
          }
          return current.children
            ? { ...current, children: current.children.map(detachRec) }
            : current;
        };
        return detachRec(root);
      });
      showToast('Detached component instance to local editable copy');
    },
    [transformOwningTree, showToast]
  );

  const handleAddAsset = useCallback(
    (asset: MediaAsset) => {
      const nextAssets = assetRepository.addAsset(activeProjectId, asset);
      pushState({
        ...site,
        mediaAssets: nextAssets,
      });
      showToast(`Added "${asset.name}" to Assets`);
    },
    [site, activeProjectId, pushState, showToast]
  );

  const handleUpdateAsset = useCallback(
    (updated: MediaAsset) => {
      const nextAssets = assetRepository.updateAsset(activeProjectId, updated);
      pushState({
        ...site,
        mediaAssets: nextAssets,
      });
      showToast(`Updated "${updated.name}"`);
    },
    [site, activeProjectId, pushState, showToast]
  );

  const handleDeleteAsset = useCallback(
    (assetId: string) => {
      const nextAssets = assetRepository.deleteAsset(activeProjectId, assetId);
      pushState({
        ...site,
        mediaAssets: nextAssets,
      });
      showToast('Asset removed from library');
    },
    [site, activeProjectId, pushState, showToast]
  );

  const handleApplyAssetToSelection = useCallback(
    (asset: MediaAsset) => {
      if (selectedNode) {
        if (selectedNode.type === 'image' || selectedNode.type === 'background-media') {
          handleUpdateElement({
            ...selectedNode,
            content: {
              ...selectedNode.content,
              imageSrc: asset.url,
              imageAlt: asset.altText || selectedNode.content?.imageAlt || asset.name,
            },
          });
          if (editorViewportMode === 'mobile') setOverlayPanel('none');
          showToast(`Applied "${asset.name}" to ${selectedNode.name}`);
          return;
        }
        if (selectedNode.type === 'logo') {
          handleUpdateElement({
            ...selectedNode,
            content: {
              ...selectedNode.content,
              logoMode: 'image',
              logoAssetId: asset.id,
              logoLightSrc: asset.url,
              imageAlt: asset.altText || asset.name,
            },
          });
          if (editorViewportMode === 'mobile') setOverlayPanel('none');
          showToast(`Applied "${asset.name}" to Logo`);
          return;
        }
        if (
          (selectedNode.type === 'icon' || selectedNode.type === 'svg-graphic') &&
          asset.svgMarkup
        ) {
          handleUpdateElement({
            ...selectedNode,
            content: {
              ...selectedNode.content,
              iconSet: 'custom-svg',
              svgMarkup: asset.svgMarkup,
            },
          });
          if (editorViewportMode === 'mobile') setOverlayPanel('none');
          showToast(`Applied SVG "${asset.name}"`);
          return;
        }
        if (selectedNode.type === 'video' && asset.category === 'video-audio') {
          handleUpdateElement({
            ...selectedNode,
            content: { ...selectedNode.content, videoUrl: asset.url },
          });
          showToast(`Applied video "${asset.name}"`);
          return;
        }
        if (selectedNode.type === 'audio' && asset.category === 'video-audio') {
          handleUpdateElement({
            ...selectedNode,
            content: {
              ...selectedNode.content,
              audioUrl: asset.url,
              audioTitle: asset.name,
            },
          });
          showToast(`Applied audio "${asset.name}"`);
          return;
        }
      }

      // Otherwise insert a new element tailored to this asset onto the active page
      const id = 'ast_el_' + Math.random().toString(36).slice(2, 7);
      let newNode: ElementNode;
      if (asset.category === 'logos') {
        newNode = {
          id,
          type: 'logo',
          name: asset.name,
          tag: 'a',
          content: {
            logoMode: 'image',
            logoAssetId: asset.id,
            logoLightSrc: asset.url,
            logoText: asset.name,
            imageAlt: asset.altText || asset.name,
            url: '/',
          },
          styles: { display: 'inline-flex', alignItems: 'center', height: '40px' },
        };
      } else if (asset.svgMarkup && asset.category === 'icons') {
        newNode = {
          id,
          type: 'svg-graphic',
          name: asset.name,
          tag: 'div',
          content: { svgMarkup: asset.svgMarkup },
          styles: { display: 'inline-flex', width: '96px', height: '96px' },
        };
      } else if (asset.mimeType?.startsWith('video/') || asset.type === 'video') {
        newNode = {
          id,
          type: 'video',
          name: asset.name,
          tag: 'div',
          content: { videoUrl: asset.url },
          styles: { width: '100%', borderRadius: 'var(--theme-radius, 8px)' },
        };
      } else if (asset.mimeType?.startsWith('audio/') || asset.type === 'audio') {
        newNode = {
          id,
          type: 'audio',
          name: asset.name,
          tag: 'div',
          content: { audioUrl: asset.url, audioTitle: asset.name },
          styles: { width: '100%' },
        };
      } else {
        newNode = {
          id,
          type: 'image',
          name: asset.name,
          tag: 'img',
          content: {
            imageSrc: asset.url,
            imageAlt: asset.altText || asset.name,
            aspectRatio: '16:9',
            objectFit: 'cover',
          },
          styles: { width: '100%', borderRadius: 'var(--theme-radius, 8px)' },
        };
      }
      handleAddElementFromCatalog(newNode, newNode.type);
    },
    [selectedNode, handleUpdateElement, handleAddElementFromCatalog, editorViewportMode, showToast]
  );

  // Per-page and Site Layout (Global Header & Footer) handlers
  const handleUpdatePageLayoutSlot = useCallback(
    (pageId: string, slot: 'header' | 'footer', nextSlot: PageLayoutSlot) => {
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
      pushState({
        ...site,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
        pages: site.pages.map((p) => {
          if (p.id !== pageId) return p;
          const baseLayout = p.layout || createDefaultPageLayout();
          return {
            ...p,
            layout: {
              ...baseLayout,
              [slot]: nextSlot,
            },
            revision: (p.revision ?? 1) + 1,
            lastModified: stamp,
          };
        }),
      });
      setSelectedId(null);
      showToast(`Updated page ${slot} mode to ${nextSlot.mode}`);
    },
    [site, pushState, showToast]
  );

  const handleSelectGlobalComponent = useCallback(
    (slot: 'header' | 'footer', componentId: string) => {
      if (!site.globalComponents) return;
      pushState({
        ...site,
        globalComponents: {
          ...site.globalComponents,
          ...(slot === 'header'
            ? { activeHeaderId: componentId }
            : { activeFooterId: componentId }),
        },
      });
      setSelectedId(null);
      showToast(`Switched active Global ${slot}`);
    },
    [site, pushState, showToast]
  );

  const handleCreateGlobalVariant = useCallback(
    (
      slot: 'header' | 'footer',
      name: string,
      sourceDef?: HeaderFooterComponentDef,
      presetId?: string
    ) => {
      if (!site.globalComponents) return;
      const now = new Date().toISOString();
      const preset = presetId ? findPresetById(presetId) : undefined;
      let newDef: HeaderFooterComponentDef;
      if (preset) {
        newDef = {
          schemaVersion: 1,
          componentId: `global_${slot}_${Date.now().toString(36)}`,
          componentType: slot,
          name: name || preset.name,
          description: preset.description,
          revision: 1,
          engineVersion: '2.0.0',
          enabled: true,
          presetId: preset.presetId,
          presetVersion: preset.presetVersion,
          isCustomized: false,
          responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
          rootElement: cloneElementTreeWithNewIds(preset.buildRootNode()),
          createdAt: now,
          updatedAt: now,
        };
      } else if (sourceDef) {
        newDef = {
          ...cloneHeaderFooterAsLocal(sourceDef, name),
          componentId: `global_${slot}_${Date.now().toString(36)}`,
        };
      } else {
        newDef = {
          ...createBlankHeaderFooterDef(slot, name),
          componentId: `global_${slot}_${Date.now().toString(36)}`,
          createdAt: now,
          updatedAt: now,
        };
      }

      pushState({
        ...site,
        globalComponents: {
          ...site.globalComponents,
          ...(slot === 'header'
            ? {
                headers: [...site.globalComponents.headers, newDef],
                activeHeaderId: newDef.componentId,
              }
            : {
                footers: [...site.globalComponents.footers, newDef],
                activeFooterId: newDef.componentId,
              }),
        },
      });
      setSelectedId(null);
      showToast(`Created Global ${slot} "${newDef.name}"`);
    },
    [site, pushState, showToast]
  );

  const handleRenameGlobalVariant = useCallback(
    (slot: 'header' | 'footer', componentId: string, name: string) => {
      if (!site.globalComponents || !name.trim()) return;
      const clean = name.trim();
      const now = new Date().toISOString();
      pushState({
        ...site,
        globalComponents: {
          ...site.globalComponents,
          ...(slot === 'header'
            ? {
                headers: site.globalComponents.headers.map((h) =>
                  h.componentId === componentId ? { ...h, name: clean, updatedAt: now } : h
                ),
              }
            : {
                footers: site.globalComponents.footers.map((f) =>
                  f.componentId === componentId ? { ...f, name: clean, updatedAt: now } : f
                ),
              }),
        },
      });
      showToast(`Renamed ${slot} to "${clean}"`);
    },
    [site, pushState, showToast]
  );

  const handleDeleteGlobalVariant = useCallback(
    (slot: 'header' | 'footer', componentId: string) => {
      if (!site.globalComponents) return;
      const currentList =
        slot === 'header' ? site.globalComponents.headers : site.globalComponents.footers;
      if (currentList.length <= 1) {
        showToast(`At least one Global ${slot} variant must remain`);
        return;
      }
      const nextList = currentList.filter((item) => item.componentId !== componentId);
      const currentActive =
        slot === 'header'
          ? site.globalComponents.activeHeaderId
          : site.globalComponents.activeFooterId;
      const nextActive =
        currentActive === componentId ? nextList[0].componentId : currentActive;

      pushState({
        ...site,
        globalComponents: {
          ...site.globalComponents,
          ...(slot === 'header'
            ? { headers: nextList, activeHeaderId: nextActive }
            : { footers: nextList, activeFooterId: nextActive }),
        },
        pages: site.pages.map((p) => {
          const curSlot = p.layout?.[slot];
          if (!curSlot || curSlot.globalComponentId !== componentId) return p;
          return {
            ...p,
            layout: {
              ...(p.layout || createDefaultPageLayout()),
              [slot]: { ...curSlot, globalComponentId: null },
            },
          };
        }),
      });
      setSelectedId(null);
      showToast(`Removed Global ${slot} variant`);
    },
    [site, pushState, showToast]
  );

  const handleToggleGlobalRegionEnabled = useCallback(
    (slot: 'header' | 'footer', componentId: string) => {
      if (!site.globalComponents) return;
      const now = new Date().toISOString();
      let toggledTo = true;
      pushState({
        ...site,
        globalComponents: {
          ...site.globalComponents,
          ...(slot === 'header'
            ? {
                headers: site.globalComponents.headers.map((h) => {
                  if (h.componentId !== componentId) return h;
                  toggledTo = h.enabled === false;
                  return { ...h, enabled: toggledTo, updatedAt: now };
                }),
              }
            : {
                footers: site.globalComponents.footers.map((f) => {
                  if (f.componentId !== componentId) return f;
                  toggledTo = f.enabled === false;
                  return { ...f, enabled: toggledTo, updatedAt: now };
                }),
              }),
        },
      });
      showToast(`${toggledTo ? 'Enabled' : 'Disabled'} Global ${slot} site-wide`);
    },
    [site, pushState, showToast]
  );

  const handleToggleRegionPageEnabled = useCallback(
    (slot: 'header' | 'footer') => {
      if (!activePage) return;
      const baseLayout = activePage.layout || createDefaultPageLayout();
      const curSlot = baseLayout[slot];
      const nextEnabled = curSlot.enabled === false;
      handleUpdatePageLayoutSlot(activePage.id, slot, {
        ...curSlot,
        enabled: nextEnabled,
      });
      showToast(
        `${nextEnabled ? 'Enabled' : 'Disabled'} ${slot} on "${activePage.name}"`
      );
    },
    [activePage, handleUpdatePageLayoutSlot, showToast]
  );

  const handleUpdateSlotVisibility = useCallback(
    (slot: 'header' | 'footer', vis: RegionResponsiveVisibility) => {
      if (!activePage) return;
      const baseLayout = activePage.layout || createDefaultPageLayout();
      const curSlot = baseLayout[slot];
      handleUpdatePageLayoutSlot(activePage.id, slot, {
        ...curSlot,
        responsiveVisibility: normalizeRegionVisibility(vis),
      });
    },
    [activePage, handleUpdatePageLayoutSlot]
  );

  const handleSetSlotMode = useCallback(
    (slot: 'header' | 'footer', mode: LayoutMode) => {
      if (!activePage) return;
      const baseLayout = activePage.layout || createDefaultPageLayout();
      const curSlot = baseLayout[slot];
      if (mode === 'local') {
        const resolved = resolvePageSlotComponent(activePage, site, slot);
        const existingLocal = curSlot.localComponent;
        const nextLocal =
          existingLocal ||
          (resolved.definition
            ? cloneHeaderFooterAsLocal(
                resolved.definition,
                `${activePage.name} ${slot === 'header' ? 'Header' : 'Footer'}`
              )
            : createBlankHeaderFooterDef(
                slot,
                `${activePage.name} ${slot === 'header' ? 'Header' : 'Footer'}`
              ));
        handleUpdatePageLayoutSlot(activePage.id, slot, {
          ...curSlot,
          mode: 'local',
          enabled: true,
          localComponentId: nextLocal.componentId,
          localComponent: nextLocal,
        });
      } else {
        handleUpdatePageLayoutSlot(activePage.id, slot, {
          ...curSlot,
          mode,
          enabled: mode === 'none' ? curSlot.enabled : true,
        });
      }
    },
    [activePage, site, handleUpdatePageLayoutSlot]
  );

  const handleCopyGlobalToLocal = useCallback(
    (slot: 'header' | 'footer') => {
      if (!activePage) return;
      const resolved = resolvePageSlotComponent(activePage, site, slot);
      const baseLayout = activePage.layout || createDefaultPageLayout();
      const curSlot = baseLayout[slot];
      const source = resolved.definition;
      const localDef = source
        ? cloneHeaderFooterAsLocal(
            source,
            `${activePage.name} ${slot === 'header' ? 'Header' : 'Footer'}`
          )
        : createBlankHeaderFooterDef(
            slot,
            `${activePage.name} ${slot === 'header' ? 'Header' : 'Footer'}`
          );
      handleUpdatePageLayoutSlot(activePage.id, slot, {
        ...curSlot,
        mode: 'local',
        enabled: true,
        localComponentId: localDef.componentId,
        localComponent: localDef,
      });
    },
    [activePage, site, handleUpdatePageLayoutSlot]
  );

  const handleOpenPageLayoutSettings = useCallback(() => {
    if (!activePage) return;
    setLeftTab('pages');
    setOpenLayoutForPageId(activePage.id);
    if (editorViewportMode === 'desktop') {
      setIsDesktopLeftOpen(true);
    } else {
      setOverlayPanel('pages');
    }
  }, [activePage, editorViewportMode]);

  const handleApplyTheme = useCallback(
    (themeId: string, resetOverrides = false) => {
      const allThemes = [...THEMES, ...(site.customThemes || [])];
      const theme = allThemes.find((t) => t.id === themeId);
      if (!theme) return;

      pushState({
        ...site,
        activeThemeId: theme.id,
        themeConfig: {
          schemaVersion: 2,
          themeId: theme.id,
          themeVersion: theme.version,
          colorOverrides: resetOverrides
            ? {}
            : { ...(site.themeConfig?.colorOverrides || {}) },
          updatedAt: new Date().toISOString(),
        },
      });
      showToast(`Applied ${theme.name}`);
    },
    [site, pushState, showToast]
  );

  const handleUpdateThemeColorOverride = useCallback(
    (token: keyof SemanticThemeColors, hex: string) => {
      const check = normalizeHexColor(hex);
      if (!check.valid) return;
      const currentOverrides = { ...(site.themeConfig?.colorOverrides || {}) };
      if (effectiveTheme.baseTheme.semantic[token].toUpperCase() === check.hex) {
        delete currentOverrides[token];
      } else {
        currentOverrides[token] = check.hex;
      }

      pushState({
        ...site,
        themeConfig: {
          schemaVersion: 2,
          themeId: effectiveTheme.baseTheme.id,
          themeVersion: effectiveTheme.baseTheme.version,
          colorOverrides: currentOverrides,
          updatedAt: new Date().toISOString(),
        },
      });
    },
    [site, effectiveTheme.baseTheme, pushState]
  );

  const handleResetThemeColorOverride = useCallback(
    (token: keyof SemanticThemeColors) => {
      const currentOverrides = { ...(site.themeConfig?.colorOverrides || {}) };
      delete currentOverrides[token];
      pushState({
        ...site,
        themeConfig: {
          schemaVersion: 2,
          themeId: effectiveTheme.baseTheme.id,
          themeVersion: effectiveTheme.baseTheme.version,
          colorOverrides: currentOverrides,
          updatedAt: new Date().toISOString(),
        },
      });
      showToast('Reset color token to preset default');
    },
    [site, effectiveTheme.baseTheme, pushState, showToast]
  );

  const handleResetAllThemeOverrides = useCallback(() => {
    pushState({
      ...site,
      themeConfig: {
        schemaVersion: 2,
        themeId: effectiveTheme.baseTheme.id,
        themeVersion: effectiveTheme.baseTheme.version,
        colorOverrides: {},
        updatedAt: new Date().toISOString(),
      },
    });
    showToast(`Reset ${effectiveTheme.baseTheme.name} to defaults`);
  }, [site, effectiveTheme.baseTheme, pushState, showToast]);

  const handleSaveCustomTheme = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const resolvedColors = { ...effectiveTheme.colors };
      const base = effectiveTheme.baseTheme;
      const newTheme: ThemeTokens = {
        id: `custom_${Date.now()}`,
        name: trimmed,
        version: 1,
        category: `Custom · Based on ${base.name}`,
        isCustom: true,
        fontDisplay: base.fontDisplay,
        fontBody: base.fontBody,
        fontMono: base.fontMono,
        colors: {
          canvas: resolvedColors.background,
          surface: resolvedColors.surface,
          surfaceSubtle: resolvedColors.surfaceAlt,
          textPrimary: resolvedColors.text,
          textSecondary: resolvedColors.textMuted,
          accent: resolvedColors.primary,
          accentHover: resolvedColors.primaryHover,
          accentForeground: resolvedColors.buttonPrimaryText,
          border: resolvedColors.border,
        },
        semantic: resolvedColors,
        borderRadius: base.borderRadius,
        containerMaxWidth: base.containerMaxWidth,
      };

      pushState({
        ...site,
        activeThemeId: newTheme.id,
        customThemes: [newTheme, ...(site.customThemes || [])],
        themeConfig: {
          schemaVersion: 2,
          themeId: newTheme.id,
          themeVersion: newTheme.version,
          colorOverrides: {},
          updatedAt: new Date().toISOString(),
        },
      });
      showToast(`Saved personal theme "${trimmed}"`);
    },
    [site, effectiveTheme, pushState, showToast]
  );

  const handleDeleteCustomTheme = useCallback(
    (themeId: string) => {
      const remaining = (site.customThemes || []).filter((t) => t.id !== themeId);
      const isDeletingActive = effectiveTheme.baseTheme.id === themeId;
      const fallback = THEMES[0];
      pushState({
        ...site,
        customThemes: remaining,
        activeThemeId: isDeletingActive ? fallback.id : site.activeThemeId,
        themeConfig: isDeletingActive
          ? {
              schemaVersion: 2,
              themeId: fallback.id,
              themeVersion: fallback.version,
              colorOverrides: {},
              updatedAt: new Date().toISOString(),
            }
          : site.themeConfig,
      });
      showToast('Personal theme removed');
    },
    [site, effectiveTheme.baseTheme.id, pushState, showToast]
  );

  const handleCreatePage = useCallback(
    (params: {
      name: string;
      slugInput: string;
      method: PageCreationMethod;
      templateId?: string;
      sourcePageId?: string;
      parentPageId?: string | null;
      showInNavigation: boolean;
      forceHome?: boolean;
    }) => {
      const newPage = createPageDocument({
        siteName: site.name,
        pages: site.pages,
        name: params.name,
        slugInput: params.slugInput,
        method: params.method,
        templateId: params.templateId,
        sourcePageId: params.sourcePageId,
        parentPageId: params.parentPageId,
        showInNavigation: params.showInNavigation,
        forceHome: params.forceHome,
      });

      const nextPages = normalizePageOrders([...sortPagesForTree(site.pages), newPage]);
      pushState({
        ...site,
        pages: nextPages,
        activePageId: newPage.id,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
      setSelectedId(null);
      if (editorViewportMode === 'mobile') {
        setOverlayPanel('none');
      }
      showToast(`Created page "${newPage.name}"`);
    },
    [site, pushState, editorViewportMode, showToast]
  );

  const handleDuplicatePage = useCallback(
    (pageId: string) => {
      const src = site.pages.find((p) => p.id === pageId);
      if (!src) return;
      const copyName = `${src.name} Copy`;
      const uniqueSlug = generateUniquePageSlug(
        copyName,
        site.pages,
        src.parentPageId || null,
        false
      );
      const copyPage = createPageDocument({
        siteName: site.name,
        pages: site.pages,
        name: copyName,
        slugInput: uniqueSlug,
        method: 'duplicate',
        sourcePageId: src.id,
        parentPageId: src.isHome ? null : src.parentPageId || null,
        showInNavigation: src.navigation?.visible ?? true,
        forceHome: false,
      });

      const ordered = sortPagesForTree(site.pages);
      const srcIdx = ordered.findIndex((p) => p.id === pageId);
      if (srcIdx !== -1) {
        ordered.splice(srcIdx + 1, 0, copyPage);
      } else {
        ordered.push(copyPage);
      }

      pushState({
        ...site,
        pages: normalizePageOrders(ordered),
        activePageId: copyPage.id,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
      setSelectedId(null);
      showToast(`Duplicated "${src.name}" as Draft`);
    },
    [site, pushState, showToast]
  );

  const handleRenamePage = useCallback(
    (pageId: string, newName: string) => {
      const clean = newName.trim();
      if (!clean) return;
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
      pushState({
        ...site,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
        pages: site.pages.map((p) =>
          p.id !== pageId
            ? p
            : {
                ...p,
                name: clean,
                navigation: {
                  visible: p.navigation?.visible ?? true,
                  label:
                    !p.navigation?.label || p.navigation.label === p.name
                      ? clean
                      : p.navigation.label,
                  order: p.navigation?.order ?? 0,
                },
                revision: (p.revision ?? 1) + 1,
                lastModified: stamp,
              }
        ),
      });
      showToast(`Renamed page to "${clean}"`);
    },
    [site, pushState, showToast]
  );

  const handleSetHomePage = useCallback(
    (targetPageId: string) => {
      const target = site.pages.find((p) => p.id === targetPageId);
      if (!target || target.isHome) return;
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

      const otherPages = site.pages.filter((p) => p.id !== targetPageId);
      const updatedPages = site.pages.map((p) => {
        if (p.id === targetPageId) {
          return {
            ...p,
            isHome: true,
            slug: '/',
            parentPageId: null,
            navigation: {
              visible: true,
              label: p.navigation?.label || p.name,
              order: p.navigation?.order ?? 0,
            },
            revision: (p.revision ?? 1) + 1,
            lastModified: stamp,
          };
        }
        if (p.isHome) {
          const demotedSlug = generateUniquePageSlug(p.name || 'previous-home', otherPages, null, false);
          return {
            ...p,
            isHome: false,
            slug: demotedSlug,
            revision: (p.revision ?? 1) + 1,
            lastModified: stamp,
          };
        }
        return p;
      });

      pushState({
        ...site,
        pages: updatedPages,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
      showToast(`"${target.name}" is now Portfolio Home (/)`);
    },
    [site, pushState, showToast]
  );

  const handleMovePageOrder = useCallback(
    (pageId: string, direction: 'up' | 'down') => {
      const ordered = sortPagesForTree(site.pages);
      const idx = ordered.findIndex((p) => p.id === pageId);
      if (idx === -1) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= ordered.length) return;
      [ordered[idx], ordered[swapIdx]] = [ordered[swapIdx], ordered[idx]];

      pushState({
        ...site,
        pages: normalizePageOrders(ordered),
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
    },
    [site, pushState]
  );

  const handleReorderPageDrop = useCallback(
    (draggedPageId: string, targetPageId: string) => {
      const ordered = sortPagesForTree(site.pages);
      const fromIdx = ordered.findIndex((p) => p.id === draggedPageId);
      const toIdx = ordered.findIndex((p) => p.id === targetPageId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const [moved] = ordered.splice(fromIdx, 1);
      ordered.splice(toIdx, 0, moved);

      pushState({
        ...site,
        pages: normalizePageOrders(ordered),
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
    },
    [site, pushState]
  );

  const handleChangePageParent = useCallback(
    (pageId: string, parentPageId: string | null) => {
      const page = site.pages.find((p) => p.id === pageId);
      if (!page || page.isHome) return;
      if (wouldCreateParentCycle(pageId, parentPageId, site.pages)) {
        showToast('Cannot move a page inside itself or its own descendant');
        return;
      }
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
      pushState({
        ...site,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
        pages: site.pages.map((p) =>
          p.id !== pageId
            ? p
            : {
                ...p,
                parentPageId,
                revision: (p.revision ?? 1) + 1,
                lastModified: stamp,
              }
        ),
      });
      showToast(parentPageId ? 'Moved under parent page' : 'Moved to top-level');
    },
    [site, pushState, showToast]
  );

  const handleTogglePageNavVisibility = useCallback(
    (pageId: string) => {
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
      pushState({
        ...site,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
        pages: site.pages.map((p) =>
          p.id !== pageId
            ? p
            : {
                ...p,
                navigation: {
                  visible: !(p.navigation?.visible ?? true),
                  label: p.navigation?.label || p.name,
                  order: p.navigation?.order ?? 0,
                },
                revision: (p.revision ?? 1) + 1,
                lastModified: stamp,
              }
        ),
      });
    },
    [site, pushState]
  );

  const handleUpdatePageStatus = useCallback(
    (pageId: string, status: PageStatus) => {
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
      pushState({
        ...site,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
        pages: site.pages.map((p) =>
          p.id !== pageId
            ? p
            : {
                ...p,
                status,
                revision: (p.revision ?? 1) + 1,
                lastModified: stamp,
              }
        ),
      });
      showToast(`Page marked as ${status}`);
    },
    [site, pushState, showToast]
  );

  const handleSavePageSettings = useCallback(
    (pageId: string, patch: PageSettingsPatch) => {
      const existing = site.pages.find((p) => p.id === pageId);
      if (!existing) return;
      const oldFullPath = resolvePageFullPath(existing, site.pages);
      const stamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

      const candidatePages = site.pages.map((p) => {
        if (p.id !== pageId) return p;
        return {
          ...p,
          name: patch.name,
          slug: p.isHome ? '/' : patch.slug,
          parentPageId: p.isHome ? null : patch.parentPageId,
          navigation: {
            visible: patch.navigationVisible,
            label: patch.navigationLabel,
            order: p.navigation?.order ?? 0,
          },
          status: patch.status,
          title: patch.title,
          description: patch.description,
          canonicalPath: patch.canonicalPath,
          ogImage: patch.ogImage,
          noIndex: patch.noIndex,
          customCss: patch.customCss,
          customJs: patch.customJs,
          revision: (p.revision ?? 1) + 1,
          lastModified: stamp,
        };
      });

      const updatedTarget = candidatePages.find((p) => p.id === pageId)!;
      const newFullPath = resolvePageFullPath(updatedTarget, candidatePages);
      const finalPages =
        oldFullPath !== newFullPath
          ? candidatePages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    redirectFromSlugs: Array.from(
                      new Set([...(p.redirectFromSlugs || []), oldFullPath])
                    ),
                  }
                : p
            )
          : candidatePages;

      pushState({
        ...site,
        pages: finalPages,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
      showToast(`Saved settings for "${patch.name}"`);
    },
    [site, pushState, showToast]
  );

  const handleConfirmDeletePage = useCallback(
    (pageId: string, childMode: DeleteChildMode, targetParentId?: string | null) => {
      const target = site.pages.find((p) => p.id === pageId);
      if (!target || target.isHome) {
        showToast('Home page cannot be deleted until another page is set as Home');
        return;
      }

      const toDelete = new Set<string>([pageId]);
      if (childMode === 'delete') {
        let added = true;
        while (added) {
          added = false;
          for (const p of site.pages) {
            if (!toDelete.has(p.id) && p.parentPageId && toDelete.has(p.parentPageId)) {
              toDelete.add(p.id);
              added = true;
            }
          }
        }
      }

      const remaining = sortPagesForTree(
        site.pages.filter((p) => !toDelete.has(p.id))
      ).map((p) => {
        if (p.parentPageId === pageId) {
          return {
            ...p,
            parentPageId: childMode === 'reparent' ? targetParentId || null : null,
          };
        }
        return p;
      });

      const normalized = normalizePageOrders(remaining);
      const nextActive = toDelete.has(site.activePageId)
        ? normalized.find((p) => p.isHome)?.id || normalized[0]?.id || ''
        : site.activePageId;

      pushState({
        ...site,
        pages: normalized,
        activePageId: nextActive,
        pageRegistryRevision: (site.pageRegistryRevision ?? 1) + 1,
      });
      if (toDelete.has(site.activePageId)) {
        setSelectedId(null);
      }
      showToast(`Deleted "${target.name}"`);
    },
    [site, pushState, showToast]
  );

  const handleUpdateSiteMeta = useCallback(
    (updates: { name?: string; portfolioSlug?: string }) => {
      pushState({ ...site, ...updates });
      showToast('Portfolio URL updated');
    },
    [site, pushState, showToast]
  );

  const handleUpdateCustomCode = useCallback(
    (
      scope: 'site' | 'page' | 'element',
      css: string,
      js: string,
      themeMode?: 'follow-theme' | 'independent'
    ) => {
      if (scope === 'site') {
        pushState({
          ...site,
          globalCss: css,
          globalJs: js,
          ...(themeMode ? { globalCssThemeMode: themeMode } : {}),
        });
      } else if (scope === 'page') {
        pushState({
          ...site,
          pages: site.pages.map((p) =>
            p.id === site.activePageId
              ? {
                  ...p,
                  customCss: css,
                  customJs: js,
                  ...(themeMode ? { customCssThemeMode: themeMode } : {}),
                }
              : p
          ),
        });
      } else if (scope === 'element' && selectedNode) {
        handleUpdateElement({
          ...selectedNode,
          advanced: { ...selectedNode.advanced, customCss: css },
        });
      }
      showToast(`Saved ${scope} custom code`);
    },
    [site, pushState, selectedNode, handleUpdateElement, showToast]
  );

  const handleWorkspaceError = useCallback(
    (err: unknown, fallbackMsg: string): Error => {
      const message = err instanceof Error ? err.message : fallbackMsg;
      const isReauth =
        err instanceof GoogleWorkspaceApiError && err.code === 'REAUTH_REQUIRED';

      if (isReauth) {
        clearInMemoryAccessToken();
      }

      setWorkspace((prev) => {
        const wasConnecting = prev.connectionStatus === 'connecting';
        const fallbackStatus =
          (prev.spreadsheetLinked && prev.spreadsheet?.id) || prev.userEmail
            ? ('needs_reauth' as const)
            : ('not_connected' as const);
        const next: GoogleWorkspaceState = {
          ...prev,
          ...(isReauth || wasConnecting
            ? {
                connected: false,
                connectionStatus: fallbackStatus,
                connectionHealth:
                  fallbackStatus === 'needs_reauth'
                    ? ('degraded' as const)
                    : ('disconnected' as const),
              }
            : {}),
          syncStatus: 'error',
          syncError: message,
        };
        storageService.saveGoogleWorkspace(next);
        return next;
      });
      showToast(message);
      return err instanceof Error ? err : new Error(message);
    },
    [showToast]
  );

  const requireGoogleToken = useCallback((): string => {
    const token = getGoogleAccessToken();
    if (!token) {
      throw new GoogleWorkspaceApiError(
        'REAUTH_REQUIRED',
        'Your Google Workspace session has expired or needs sign-in. Please reconnect Google.'
      );
    }
    return token;
  }, []);

  const handleConnectGoogle = useCallback(
    async (forceConsent = false) => {
      setWorkspace((prev) => ({
        ...prev,
        connectionStatus: 'connecting',
        syncError: null,
      }));

      try {
        const { user, accessToken } = await signInWithGoogleWorkspace(forceConsent);
        const sameAccount =
          Boolean(workspace.googleSubject && workspace.googleSubject === user.uid) ||
          Boolean(workspace.userEmail && user.email && workspace.userEmail === user.email);
        const keepLinkedSheet =
          sameAccount && workspace.spreadsheetLinked && Boolean(workspace.spreadsheet.id);

        const baseConnected: GoogleWorkspaceState = {
          ...workspace,
          isDemoMode: false,
          connected: true,
          connectionStatus: 'connected',
          connectionHealth: 'healthy',
          userEmail: user.email || '',
          accountName: user.displayName || user.email || 'Google Account',
          avatarUrl: user.photoURL || '',
          googleSubject: user.uid,
          grantedScopes: [...GOOGLE_WORKSPACE_SCOPES],
          syncStatus: keepLinkedSheet ? 'syncing' : 'idle',
          syncError: null,
          lastSynced: keepLinkedSheet ? 'Syncing...' : 'Connected (no sheet linked)',
          ...(keepLinkedSheet
            ? {}
            : {
                spreadsheetLinked: false,
                spreadsheetCanEdit: undefined,
                missingSchemaTabs: [],
                spreadsheet: { id: '', name: '', url: '', tabs: [] },
              }),
        };
        persistWorkspace(baseConnected);

        if (keepLinkedSheet && workspace.spreadsheet.id) {
          const info = await verifySpreadsheetAccess(accessToken, workspace.spreadsheet.id);
          const readRes = await readSpreadsheetTabs(accessToken, info.id);
          const synced: GoogleWorkspaceState = {
            ...baseConnected,
            spreadsheetLinked: true,
            spreadsheetCanEdit: info.canEdit,
            schemaVersion: info.schemaVersion,
            missingSchemaTabs: info.missingSchemaTabs,
            syncStatus: 'synced',
            syncError: null,
            lastReadAt: readRes.readAt,
            lastSynced: readRes.readAt,
            lastSyncSummary: {
              operation: 'refresh',
              recordsRead: readRes.totalRecords,
              timestamp: readRes.readAt,
            },
            spreadsheet: {
              id: info.id,
              name: info.name,
              url: info.url,
              tabs: readRes.tabs,
            },
          };
          persistWorkspace(synced);
          showToast(`Reconnected & synced ${readRes.totalRecords} rows`);
        } else {
          showToast(`Connected as ${user.email || 'Google user'}`);
        }
      } catch (err) {
        if (err instanceof GoogleAuthCancelledError) {
          setWorkspace((prev) => {
            if (prev.connectionStatus !== 'connecting') return prev;
            const fallbackStatus =
              (prev.spreadsheetLinked && prev.spreadsheet?.id) || prev.userEmail
                ? ('needs_reauth' as const)
                : ('not_connected' as const);
            const next: GoogleWorkspaceState = {
              ...prev,
              connected: false,
              connectionStatus: fallbackStatus,
              connectionHealth:
                fallbackStatus === 'needs_reauth'
                  ? ('degraded' as const)
                  : ('disconnected' as const),
              syncStatus: 'idle',
              syncError: null,
            };
            storageService.saveGoogleWorkspace(next);
            return next;
          });
          return;
        }
        handleWorkspaceError(err, 'Failed to connect Google Workspace.');
      }
    },
    [workspace, persistWorkspace, showToast, handleWorkspaceError]
  );

  const handleCancelConnectGoogle = useCallback(() => {
    cancelGoogleSignIn();
    setWorkspace((prev) => {
      if (prev.connectionStatus !== 'connecting') return prev;
      const fallbackStatus =
        (prev.spreadsheetLinked && prev.spreadsheet?.id) || prev.userEmail
          ? ('needs_reauth' as const)
          : ('not_connected' as const);
      const next: GoogleWorkspaceState = {
        ...prev,
        connected: false,
        connectionStatus: fallbackStatus,
        connectionHealth:
          fallbackStatus === 'needs_reauth'
            ? ('degraded' as const)
            : ('disconnected' as const),
        syncStatus: 'idle',
        syncError: null,
      };
      storageService.saveGoogleWorkspace(next);
      return next;
    });
  }, []);

  const handleDisconnectGoogle = useCallback(async () => {
    try {
      await disconnectGoogleWorkspace();
    } finally {
      persistWorkspace({
        ...INITIAL_GOOGLE_WORKSPACE,
        connectionStatus: 'disconnected',
        lastSynced: 'Disconnected',
      });
      showToast('Google Workspace disconnected');
    }
  }, [persistWorkspace, showToast]);

  const linkVerifiedSpreadsheet = useCallback(
    async (accessToken: string, spreadsheetId: string) => {
      setWorkspace((prev) => ({ ...prev, syncStatus: 'syncing', syncError: null }));
      const info = await verifySpreadsheetAccess(accessToken, spreadsheetId);
      const readRes = await readSpreadsheetTabs(accessToken, info.id);

      setWorkspace((prev) => {
        const next: GoogleWorkspaceState = {
          ...prev,
          isDemoMode: false,
          connected: true,
          connectionStatus: 'connected',
          connectionHealth: 'healthy',
          spreadsheetLinked: true,
          spreadsheetCanEdit: info.canEdit,
          schemaVersion: info.schemaVersion,
          missingSchemaTabs: info.missingSchemaTabs,
          syncStatus: 'synced',
          syncError: null,
          lastReadAt: readRes.readAt,
          lastSynced: readRes.readAt,
          lastSyncSummary: {
            operation: 'link',
            recordsRead: readRes.totalRecords,
            timestamp: readRes.readAt,
          },
          spreadsheet: {
            id: info.id,
            name: info.name,
            url: info.url,
            tabs: readRes.tabs,
          },
        };
        storageService.saveGoogleWorkspace(next);
        return next;
      });
      showToast(`Linked "${info.name}" (${readRes.totalRecords} rows)`);
    },
    [showToast]
  );

  const handlePickSpreadsheet = useCallback(async () => {
    try {
      const token = requireGoogleToken();
      const picked = await openGoogleSpreadsheetPicker(token);
      if (picked.cancelled || !picked.fileId) return;
      await linkVerifiedSpreadsheet(token, picked.fileId);
    } catch (err) {
      handleWorkspaceError(err, 'Could not select spreadsheet from Google Picker.');
    }
  }, [requireGoogleToken, linkVerifiedSpreadsheet, handleWorkspaceError]);

  const handleLinkSpreadsheetById = useCallback(
    async (idOrUrl: string) => {
      try {
        const spreadsheetId = extractSpreadsheetIdFromInput(idOrUrl);
        if (!spreadsheetId) {
          throw new Error('Please enter a valid Google Sheets URL or Spreadsheet ID.');
        }
        const token = requireGoogleToken();
        await linkVerifiedSpreadsheet(token, spreadsheetId);
      } catch (err) {
        handleWorkspaceError(err, 'Could not verify the provided Google Spreadsheet.');
      }
    },
    [requireGoogleToken, linkVerifiedSpreadsheet, handleWorkspaceError]
  );

  const handleCreateSpreadsheet = useCallback(
    async (includeStarterData: boolean) => {
      try {
        const token = requireGoogleToken();
        setWorkspace((prev) => ({ ...prev, syncStatus: 'syncing', syncError: null }));
        const created = await createPortfolioSpreadsheet(
          token,
          site.name,
          site.id,
          includeStarterData ? DEMO_GOOGLE_WORKSPACE_TABS : undefined
        );
        const nowTime = new Date().toLocaleTimeString();

        setWorkspace((prev) => {
          const next: GoogleWorkspaceState = {
            ...prev,
            isDemoMode: false,
            connected: true,
            connectionStatus: 'connected',
            connectionHealth: 'healthy',
            mode: 'auto',
            spreadsheetLinked: true,
            spreadsheetCanEdit: true,
            schemaVersion: ENV_CONFIG.schemaVersion,
            missingSchemaTabs: [],
            syncStatus: 'synced',
            syncError: null,
            lastReadAt: nowTime,
            lastWriteAt: nowTime,
            lastSynced: nowTime,
            lastSyncSummary: {
              operation: 'create',
              recordsRead: created.totalRecords,
              recordsWritten: created.totalRecords,
              timestamp: nowTime,
            },
            driveFolder: {
              ...prev.driveFolder,
              id: created.driveFolderId || '',
              name: ENV_CONFIG.driveFolderName,
              path: `/${ENV_CONFIG.driveFolderName}`,
              verified: Boolean(created.driveFolderId),
            },
            spreadsheet: {
              id: created.id,
              name: created.name,
              url: created.url,
              tabs: created.tabs,
            },
          };
          storageService.saveGoogleWorkspace(next);
          return next;
        });
        showToast(`Created "${created.name}"`);
      } catch (err) {
        const wrapped = handleWorkspaceError(err, 'Failed to create portfolio spreadsheet.');
        throw wrapped;
      }
    },
    [requireGoogleToken, site.name, site.id, showToast, handleWorkspaceError]
  );

  const handleInitializeMissingTabs = useCallback(async () => {
    try {
      const token = requireGoogleToken();
      if (!workspace.spreadsheet.id) return;
      setWorkspace((prev) => ({ ...prev, syncStatus: 'syncing', syncError: null }));
      const initRes = await initializeMissingTabsInSpreadsheet(
        token,
        workspace.spreadsheet.id,
        site.name,
        site.id
      );
      await linkVerifiedSpreadsheet(token, workspace.spreadsheet.id);
      if (initRes.addedTabs.length > 0) {
        showToast(`Added tabs: ${initRes.addedTabs.join(', ')}`);
      }
    } catch (err) {
      const wrapped = handleWorkspaceError(err, 'Failed to initialize missing tabs.');
      throw wrapped;
    }
  }, [
    requireGoogleToken,
    workspace.spreadsheet.id,
    site.name,
    site.id,
    linkVerifiedSpreadsheet,
    showToast,
    handleWorkspaceError,
  ]);

  const handleRefreshFromSheets = useCallback(async () => {
    try {
      const token = requireGoogleToken();
      if (!workspace.spreadsheet.id) {
        throw new Error('No Google Spreadsheet is linked.');
      }
      await linkVerifiedSpreadsheet(token, workspace.spreadsheet.id);
    } catch (err) {
      const wrapped = handleWorkspaceError(err, 'Failed to refresh from Google Sheets.');
      throw wrapped;
    }
  }, [requireGoogleToken, workspace.spreadsheet.id, linkVerifiedSpreadsheet, handleWorkspaceError]);

  const handleSaveTabsToSheets = useCallback(
    async (updatedTabs: SheetsTab[]) => {
      try {
        const token = requireGoogleToken();
        if (!workspace.spreadsheet.id) {
          throw new Error('No Google Spreadsheet is linked.');
        }
        setWorkspace((prev) => ({ ...prev, syncStatus: 'syncing', syncError: null }));
        const writeRes = await saveTabsToSpreadsheet(
          token,
          workspace.spreadsheet.id,
          updatedTabs
        );

        setWorkspace((prev) => {
          const next: GoogleWorkspaceState = {
            ...prev,
            syncStatus: 'synced',
            syncError: null,
            lastWriteAt: writeRes.writeAt,
            lastSynced: writeRes.writeAt,
            lastSyncSummary: {
              operation: 'save',
              recordsWritten: writeRes.recordsWritten,
              timestamp: writeRes.writeAt,
            },
            spreadsheet: {
              ...prev.spreadsheet,
              url: writeRes.spreadsheetUrl || prev.spreadsheet.url,
              tabs: updatedTabs,
            },
          };
          storageService.saveGoogleWorkspace(next);
          return next;
        });
        setHasUnsavedChanges(true);
        showToast(`Saved ${writeRes.recordsWritten} rows to Google Sheets`);
      } catch (err) {
        const wrapped = handleWorkspaceError(err, 'Failed to save changes to Google Sheets.');
        throw wrapped;
      }
    },
    [requireGoogleToken, workspace.spreadsheet.id, showToast, handleWorkspaceError]
  );

  const handleSaveDemoTabs = useCallback(
    (updatedTabs: SheetsTab[]) => {
      const updatedWorkspace: GoogleWorkspaceState = {
        ...workspace,
        spreadsheet: { ...workspace.spreadsheet, tabs: updatedTabs },
      };
      persistWorkspace(updatedWorkspace);
      setHasUnsavedChanges(true);
      showToast('Demo sample rows updated locally');
    },
    [workspace, persistWorkspace, showToast]
  );

  const handleToggleDemoMode = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        persistWorkspace(createDemoWorkspaceState());
        showToast('Loaded offline Demo Sample Data');
      } else {
        persistWorkspace(INITIAL_GOOGLE_WORKSPACE);
        showToast('Cleared Demo Mode');
      }
    },
    [persistWorkspace, showToast]
  );

  const executeDriveSync = useCallback(
    async (forceOverwrite = false) => {
      setIsDriveSyncing(true);
      try {
        const token = requireGoogleToken();
        const result = await syncSitePagesToGoogleDrive(
          token,
          site,
          workspace.driveFolder.id || undefined,
          { forceOverwrite }
        );
        setDriveConflictRevision(null);
        setSite((prev) => ({
          ...prev,
          pages: result.updatedPages,
          pageRegistryRevision: result.nextRegistryRevision,
          pageRegistryDriveFileId: result.registryFileId,
        }));
        persistWorkspace({
          ...workspace,
          lastWriteAt: result.syncedAt,
          lastSynced: result.syncedAt,
          driveFolder: {
            ...workspace.driveFolder,
            id: result.folderId,
            verified: true,
          },
        });
        showToast(`Synced ${result.updatedPages.length} pages to Google Drive`);
      } catch (err) {
        if (err instanceof DriveConcurrencyError) {
          setDriveConflictRevision(err.remoteRevision);
          showToast(err.message);
        } else {
          handleWorkspaceError(err, 'Failed to sync pages to Google Drive.');
        }
      } finally {
        setIsDriveSyncing(false);
        setDriveConfirmState(null);
      }
    },
    [requireGoogleToken, site, workspace, persistWorkspace, showToast, handleWorkspaceError]
  );

  const executeDriveLoad = useCallback(async () => {
    setIsDriveSyncing(true);
    try {
      const token = requireGoogleToken();
      const loaded = await loadSitePagesFromGoogleDrive(
        token,
        site,
        workspace.driveFolder.id || undefined
      );
      setDriveConflictRevision(null);
      if (!loaded.found || !loaded.pages) {
        showToast('No existing page registry found in Google Drive yet');
        return;
      }
      const migrated = migrateSiteComponentsAndLayout(
        migrateSitePages({
          ...site,
          pages: loaded.pages,
          activePageId: loaded.manifest?.activePageId || site.activePageId,
          pageRegistryRevision: loaded.manifest?.pageRegistryRevision ?? 1,
          pageRegistryDriveFileId: loaded.registryFileId,
          ...(loaded.manifest?.activeThemeId
            ? { activeThemeId: loaded.manifest.activeThemeId }
            : {}),
          ...(loaded.manifest?.themeConfig
            ? { themeConfig: loaded.manifest.themeConfig }
            : {}),
          ...(loaded.manifest?.globalComponents
            ? { globalComponents: loaded.manifest.globalComponents }
            : {}),
          ...(loaded.manifest?.libraryItems
            ? { libraryItems: loaded.manifest.libraryItems }
            : {}),
        })
      );
      pushState(migrated);
      setSelectedId(null);
      persistWorkspace({
        ...workspace,
        driveFolder: {
          ...workspace.driveFolder,
          id: loaded.folderId,
          verified: true,
        },
      });
      showToast(`Loaded ${migrated.pages.length} pages from Google Drive`);
    } catch (err) {
      handleWorkspaceError(err, 'Failed to load pages from Google Drive.');
    } finally {
      setIsDriveSyncing(false);
      setDriveConfirmState(null);
    }
  }, [requireGoogleToken, site, workspace, pushState, persistWorkspace, showToast, handleWorkspaceError]);

  const syncVersionHistoryTab = useCallback(
    (releases: BuildRelease[], currentSite: SiteDocument) => {
      const versionHistoryRows = releases.map((r) => ({
        version_id: r.version_id || r.version,
        site_id: r.site_id || currentSite.portfolioSlug || 'site_builly_default',
        version_number: r.version_number || r.version,
        release_name: r.release_name || `Release ${r.version}`,
        description: r.description || r.commitMessage,
        build_id: r.build_id || `bld_${r.version}`,
        artifact_url: r.artifact_url || r.driveFileId,
        snapshot_id: r.snapshot_id || 'sheet_snap_default',
        manifest_url: r.manifest_url || 'manifest_default',
        artifact_hash: r.artifact_hash || 'sha256_default',
        status: r.status,
        is_active: Boolean(
          r.is_active ||
            r.version === currentSite.activeReleaseVersion ||
            r.status === 'Active' ||
            r.status === 'active'
        ),
        created_at: r.created_at || r.timestamp,
        created_by: r.created_by || workspace.userEmail || 'owner@builly.indyshares.com',
        deleted_at: r.deleted_at || '',
        deleted_by: r.deleted_by || '',
      }));

      const existingTabs = workspace.spreadsheet.tabs || [];
      const hasVersionHistory = existingTabs.some((t) => t.name === 'VersionHistory');

      const updatedTabs = hasVersionHistory
        ? existingTabs.map((t) => (t.name === 'VersionHistory' ? { ...t, rows: versionHistoryRows } : t))
        : [
            ...existingTabs,
            {
              name: 'VersionHistory',
              description: 'Builly version management system registry and release metadata',
              columns: [
                'version_id',
                'site_id',
                'version_number',
                'release_name',
                'description',
                'build_id',
                'artifact_url',
                'snapshot_id',
                'manifest_url',
                'artifact_hash',
                'status',
                'is_active',
                'created_at',
                'created_by',
                'deleted_at',
                'deleted_by',
              ],
              rows: versionHistoryRows,
            },
          ];

      persistWorkspace({
        ...workspace,
        spreadsheet: {
          ...workspace.spreadsheet,
          tabs: updatedTabs,
        },
      });
    },
    [workspace, persistWorkspace]
  );

  const handleRenameRelease = useCallback(
    (versionId: string, newName: string) => {
      if (!newName || !newName.trim()) return;
      setSite((prev) => {
        const updatedReleases = prev.releases.map((r) =>
          r.version_id === versionId || r.version === versionId
            ? { ...r, release_name: newName.trim() }
            : r
        );
        const nextSite = { ...prev, releases: updatedReleases };
        syncVersionHistoryTab(updatedReleases, nextSite);
        return nextSite;
      });
      showToast('Release renamed successfully');
    },
    [syncVersionHistoryTab, showToast]
  );

  const handleEditReleaseDescription = useCallback(
    (versionId: string, newDesc: string) => {
      if (!newDesc || !newDesc.trim()) return;
      setSite((prev) => {
        const updatedReleases = prev.releases.map((r) =>
          r.version_id === versionId || r.version === versionId
            ? { ...r, description: newDesc.trim(), commitMessage: newDesc.trim() }
            : r
        );
        const nextSite = { ...prev, releases: updatedReleases };
        syncVersionHistoryTab(updatedReleases, nextSite);
        return nextSite;
      });
      showToast('Release description updated');
    },
    [syncVersionHistoryTab, showToast]
  );

  const handleDeleteRelease = useCallback(
    (versionId: string) => {
      setSite((prev) => {
        const target = prev.releases.find((r) => r.version_id === versionId || r.version === versionId);
        if (!target) return prev;
        if (
          target.version === prev.activeReleaseVersion ||
          target.is_active ||
          target.status === 'Active' ||
          target.status === 'active'
        ) {
          showToast('Cannot delete an active or protected release.');
          return prev;
        }
        const updatedReleases = prev.releases.map((r) =>
          r.version_id === versionId || r.version === versionId
            ? {
                ...r,
                status: 'Deleted' as const,
                deleted_at: new Date().toISOString(),
                deleted_by: workspace.userEmail || 'owner',
              }
            : r
        );
        const nextSite = { ...prev, releases: updatedReleases };
        syncVersionHistoryTab(updatedReleases, nextSite);
        return nextSite;
      });
      showToast('Release moved to trash');
    },
    [workspace.userEmail, syncVersionHistoryTab, showToast]
  );

  const handleRestoreRelease = useCallback(
    (versionId: string) => {
      setSite((prev) => {
        const updatedReleases = prev.releases.map((r) =>
          r.version_id === versionId || r.version === versionId
            ? { ...r, status: 'Archived' as const, deleted_at: null, deleted_by: null }
            : r
        );
        const nextSite = { ...prev, releases: updatedReleases };
        syncVersionHistoryTab(updatedReleases, nextSite);
        return nextSite;
      });
      showToast('Release restored from trash');
    },
    [syncVersionHistoryTab, showToast]
  );

  const handleRollbackRelease = useCallback(
    (targetVersion: string) => {
      const targetRelease = site.releases.find(
        (r) => r.version === targetVersion || r.version_number === targetVersion
      );
      if (!targetRelease) return;
      const snap = targetRelease.themeSnapshot;
      const pagesSnap = targetRelease.pagesSnapshot;
      const globalCompSnap = targetRelease.globalComponentsSnapshot;
      const cmsSnap = targetRelease.cmsSnapshot;

      const updatedReleases = site.releases.map((r) => {
        const isTarget = r.version === targetVersion || r.version_number === targetVersion;
        return {
          ...r,
          status: isTarget ? ('Active' as const) : ('Archived' as const),
          is_active: isTarget,
        };
      });

      const preservedCms = cmsSnap
        ? {
            ...JSON.parse(JSON.stringify(cmsSnap)),
            // Never wipe owner Inbox operational records or form routing during rollback
            forms: site.cms?.forms || cmsSnap.forms || [],
            inboxSubmissions: site.cms?.inboxSubmissions || [],
            inboxCategories: site.cms?.inboxCategories || cmsSnap.inboxCategories || [],
            inboxNotes: site.cms?.inboxNotes || [],
            inboxActivities: site.cms?.inboxActivities || [],
          }
        : undefined;

      const nextSiteBase: SiteDocument = {
        ...site,
        activeReleaseVersion: targetRelease.version,
        releases: updatedReleases,
        ...(pagesSnap ? { pages: JSON.parse(JSON.stringify(pagesSnap)) } : {}),
        ...(globalCompSnap
          ? { globalComponents: JSON.parse(JSON.stringify(globalCompSnap)) }
          : {}),
        ...(preservedCms ? { cms: preservedCms } : {}),
        ...(snap
          ? {
              activeThemeId: snap.themeId,
              themeConfig: {
                schemaVersion: 2,
                themeId: snap.themeId,
                themeVersion: snap.themeVersion,
                colorOverrides: { ...snap.colorOverrides },
                updatedAt: new Date().toISOString(),
              },
            }
          : {}),
      };

      pushState(migrateSiteComponentsAndLayout(migrateSitePages(nextSiteBase)));
      syncVersionHistoryTab(updatedReleases, nextSiteBase);
      setSelectedId(null);
      showToast(`Rolled back to ${targetVersion}`);

      if (workerSessionToken && site.portfolioSlug) {
        void rollbackSiteOnSharedRuntime({
          siteSlug: site.portfolioSlug,
          targetVersion: targetRelease.version,
          workerSessionToken,
        }).then((res) => {
          if (!res.ok && res.error) {
            showToast(`Local rollback done (Worker sync warning: ${res.error})`);
          }
        });
      }
    },
    [site, pushState, syncVersionHistoryTab, showToast, workerSessionToken]
  );

  const handleUpdateCms = useCallback(
    (nextCms: CmsDocument) => {
      const normalized = cmsRepository.saveCms(activeProjectId, nextCms, {
        mirrorToDraft: false,
      });
      setSite((prev) => {
        const next = { ...prev, cms: normalized };
        storageService.saveSiteDraft(next, activeProjectId);
        return next;
      });
      setHasUnsavedChanges(true);
    },
    [activeProjectId]
  );

  const handleUpdateCmsByFn = useCallback(
    (updater: (prev: CmsDocument) => CmsDocument) => {
      setSite((prev) => {
        const baseCms = prev.cms || cmsRepository.getCms(activeProjectId);
        const normalized = cmsRepository.saveCms(activeProjectId, updater(baseCms), {
          mirrorToDraft: false,
        });
        const next = { ...prev, cms: normalized };
        storageService.saveSiteDraft(next, activeProjectId);
        return next;
      });
      setHasUnsavedChanges(true);
    },
    [activeProjectId]
  );

  const handleUpdateWorkspaceTabs = useCallback(
    (updatedTabs: SheetsTab[]) => {
      const updatedWorkspace: GoogleWorkspaceState = {
        ...workspace,
        spreadsheet: { ...workspace.spreadsheet, tabs: updatedTabs },
      };
      persistWorkspace(updatedWorkspace);
      setHasUnsavedChanges(true);
      showToast('Spreadsheet schema updated');
    },
    [workspace, persistWorkspace, showToast]
  );

  const handleFormSubmission = useCallback(
    async (formId: string, values: Record<string, any>, sourcePage?: string) => {
      const nowIso = new Date().toISOString();
      const submissionId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const inboxItemId = `inb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const currentForms = site.cms?.forms || [];
      const formDef = currentForms.find((f) => f.formId === formId) || currentForms[0];
      const formName = formDef?.name || 'Contact Form';
      const categoryId = formDef?.categoryId || 'cat_inquiry';
      const destinationWorksheet =
        formDef?.destination?.worksheetName || 'CONTACT_SUBMISSIONS';

      const { __uploadedFiles, ...cleanFields } = values || {};
      const uploadedFiles = Array.isArray(__uploadedFiles) ? __uploadedFiles : undefined;

      // Build sanitized submission row mapped to destination worksheet columns
      const mappedRow: Record<string, string> = {
        submission_id: submissionId,
        submitted_at: nowIso,
        status: 'received',
      };

      const fieldMappings = formDef?.fieldMappings || {};
      Object.entries(cleanFields).forEach(([key, val]) => {
        const targetCol = fieldMappings[key] || key;
        mappedRow[targetCol] = escapeSheetFormulaCell(val);
      });

      const inboxRegistryRow: Record<string, string> = {
        inbox_item_id: inboxItemId,
        submission_id: submissionId,
        owner_account_id: buillyOwner?.ownerId || 'owner_local',
        site_id: site.id,
        form_id: formId,
        form_name_snapshot: escapeSheetFormulaCell(formName),
        category_id: categoryId,
        destination_data_source_id: workspace.spreadsheet.id || 'demo_sheets',
        destination_spreadsheet_id: workspace.spreadsheet.id || 'demo_spreadsheet',
        destination_worksheet_id: destinationWorksheet,
        read_status: 'unread',
        read_at: '',
        starred: 'FALSE',
        archived: 'FALSE',
        spam_status: 'ham',
        submitted_at: nowIso,
        source_page: escapeSheetFormulaCell(sourcePage || activePage?.name || 'Home'),
        created_at: nowIso,
        updated_at: nowIso,
      };

      // Update local Google Sheets tabs (destination worksheet + InboxRegistry)
      const currentTabs = workspace.spreadsheet.tabs || [];
      let destTabExists = false;
      let inboxTabExists = false;

      const updatedTabs = currentTabs.map((tab) => {
        if (tab.name.toLowerCase() === destinationWorksheet.toLowerCase()) {
          destTabExists = true;
          const missingCols = Object.keys(mappedRow).filter(
            (col) => !tab.columns.includes(col)
          );
          return {
            ...tab,
            columns: [...tab.columns, ...missingCols],
            rows: [...tab.rows, mappedRow],
          };
        }
        if (tab.name === 'InboxRegistry') {
          inboxTabExists = true;
          return {
            ...tab,
            rows: [inboxRegistryRow, ...tab.rows],
          };
        }
        return tab;
      });

      if (!destTabExists) {
        updatedTabs.push({
          name: destinationWorksheet,
          description: `Form submissions for ${formName}`,
          columns: Object.keys(mappedRow),
          rows: [mappedRow],
        });
      }
      if (!inboxTabExists) {
        updatedTabs.push({
          name: 'InboxRegistry',
          description: 'Central registry aggregating all website form submissions',
          columns: Object.keys(inboxRegistryRow),
          rows: [inboxRegistryRow],
        });
      }

      persistWorkspace({
        ...workspace,
        spreadsheet: {
          ...workspace.spreadsheet,
          tabs: updatedTabs,
        },
      });

      // Record submission + activity in Unified CMS Inbox
      const newSubmission: InboxSubmission = {
        inbox_item_id: inboxItemId,
        submission_id: submissionId,
        owner_account_id: buillyOwner?.ownerId || 'owner_local',
        site_id: site.id,
        form_id: formId,
        form_name_snapshot: formName,
        category_id: categoryId,
        destination_data_source_id: workspace.spreadsheet.id || 'demo_sheets',
        destination_spreadsheet_id: workspace.spreadsheet.id || 'demo_spreadsheet',
        destination_worksheet_id: destinationWorksheet,
        read_status: 'unread',
        read_at: null,
        starred: false,
        archived: false,
        spam_status: 'ham',
        submitted_at: nowIso,
        source_page: sourcePage || activePage?.name || 'Home',
        created_at: nowIso,
        updated_at: nowIso,
        fields: cleanFields,
        ...(uploadedFiles ? { uploaded_files: uploadedFiles } : {}),
      };

      const newActivity: InboxActivity = {
        activity_id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        inbox_item_id: inboxItemId,
        action: 'submitted',
        new_value: `${formName} (${destinationWorksheet})`,
        actor_id: 'visitor',
        created_at: nowIso,
      };

      handleUpdateCmsByFn((prevCms) => ({
        ...prevCms,
        inboxSubmissions: [newSubmission, ...(prevCms.inboxSubmissions || [])],
        inboxActivities: [newActivity, ...(prevCms.inboxActivities || [])],
      }));

      // Best-effort sync to real Google Sheets if connected in auto mode
      if (workspace.connected && !workspace.isDemoMode && workspace.spreadsheet.id) {
        try {
          const token = getGoogleAccessToken();
          if (token) {
            await saveTabsToSpreadsheet(token, workspace.spreadsheet.id, updatedTabs);
          }
        } catch {
          // Keep submission recorded locally if live token is expired or visitor mode
        }
      }

      const senderName =
        cleanFields.full_name ||
        cleanFields.name ||
        cleanFields.first_name ||
        cleanFields.email ||
        'Visitor';
      showToast(`New submission received from ${senderName} on ${formName}`);
      return true;
    },
    [
      site.cms?.forms,
      site.id,
      buillyOwner?.ownerId,
      workspace,
      activePage?.name,
      persistWorkspace,
      handleUpdateCmsByFn,
      showToast,
    ]
  );

  const handleSyncCmsToWorkspace = useCallback(async () => {
    if (!site.cms) return;
    if (activeProjectId && workerSessionToken) {
      try {
        showToast('Syncing Project CMS to Drive & Sheets...');
        const synced = await cmsRepository.syncToProjectServer(
          activeProjectId,
          workerSessionToken,
          {
            syncSheets: true,
            projectName: projectContext?.projectName || site.name,
            siteId: site.id,
            ownerAccountId: buillyOwner?.ownerId,
          }
        );
        handleUpdateCms(synced.cms);
        showToast(
          `CMS synced: manifest saved to Drive and ${synced.tabsSynced.length} table(s) updated in Google Sheets.`
        );
        return;
      } catch (err) {
        handleWorkspaceError(err, 'Failed to sync Project CMS to Google Workspace.');
        return;
      }
    }
    try {
      const token = requireGoogleToken();
      showToast('Syncing CMS to Google Workspace...');
      const res = await syncCmsToGoogleWorkspace({
        accessToken: token,
        cms: site.cms,
        driveFolderId: workspace.driveFolder?.id || undefined,
        spreadsheetId: workspace.spreadsheet.id || undefined,
      });
      handleUpdateCms(res.cms);
      showToast(
        `CMS synced: manifest saved to Drive and ${res.tabsSynced.length} table(s) updated in Google Sheets.`
      );
    } catch (err) {
      handleWorkspaceError(err, 'Failed to sync CMS to Google Workspace.');
    }
  }, [
    site.cms,
    site.name,
    site.id,
    activeProjectId,
    workerSessionToken,
    projectContext?.projectName,
    buillyOwner?.ownerId,
    requireGoogleToken,
    workspace.driveFolder?.id,
    workspace.spreadsheet.id,
    handleUpdateCms,
    showToast,
    handleWorkspaceError,
  ]);

  const handlePullCmsFromWorkspace = useCallback(async () => {
    if (!site.cms) return;
    if (activeProjectId && workerSessionToken) {
      try {
        showToast('Pulling Project CMS from Google Drive...');
        const pulled = await cmsRepository.loadFromProjectServer(
          activeProjectId,
          workerSessionToken,
          { forceAdoptRemote: true }
        );
        if (!pulled.found) {
          showToast('No Project CMS manifest found in Drive yet. Try syncing first.');
          return;
        }
        handleUpdateCms(pulled.cms);
        showToast(`CMS pulled: ${pulled.cms.records.length} record(s) loaded from Drive.`);
        return;
      } catch (err) {
        handleWorkspaceError(err, 'Failed to pull Project CMS from Google Drive.');
        return;
      }
    }
    try {
      const token = requireGoogleToken();
      showToast('Pulling CMS from Google Workspace...');
      const res = await pullCmsFromGoogleWorkspace({
        accessToken: token,
        currentCms: site.cms,
        driveFolderId: workspace.driveFolder?.id || undefined,
        spreadsheetId: workspace.spreadsheet.id || undefined,
      });
      if (!res.found) {
        showToast('No CMS manifest found in Drive yet. Try syncing first.');
        return;
      }
      handleUpdateCms(res.cms);
      showToast(`CMS pulled: ${res.recordsRead} record(s) loaded from Google Workspace.`);
    } catch (err) {
      handleWorkspaceError(err, 'Failed to pull CMS from Google Workspace.');
    }
  }, [
    site.cms,
    activeProjectId,
    workerSessionToken,
    requireGoogleToken,
    workspace.driveFolder?.id,
    workspace.spreadsheet.id,
    handleUpdateCms,
    showToast,
    handleWorkspaceError,
  ]);

  // Canvas element selection handler adapted to editor viewport mode
  const handleSelectElementFromCanvas = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (editorViewportMode === 'tablet' && id) {
        setOverlayPanel('properties');
      }
    },
    [editorViewportMode]
  );

  // Persist UI dock & width preferences
  useEffect(() => {
    const current = loadBuilderUiPrefs();
    saveBuilderUiPrefs({
      ...current,
      leftOpen: isFocusMode ? current.leftOpen : isDesktopLeftOpen,
      rightOpen: isFocusMode ? current.rightOpen : isDesktopRightOpen,
      leftWidth,
      rightWidth,
      focusMode: isFocusMode,
    });
  }, [isDesktopLeftOpen, isDesktopRightOpen, leftWidth, rightWidth, isFocusMode]);

  const handleToggleFocusMode = useCallback(() => {
    setIsFocusMode((prev) => {
      if (!prev) {
        preFocusDocksRef.current = {
          leftOpen: isDesktopLeftOpen,
          rightOpen: isDesktopRightOpen,
        };
        setIsDesktopLeftOpen(false);
        setIsDesktopRightOpen(false);
        return true;
      }
      const restore = preFocusDocksRef.current ?? { leftOpen: true, rightOpen: true };
      setIsDesktopLeftOpen(restore.leftOpen);
      setIsDesktopRightOpen(restore.rightOpen);
      return false;
    });
  }, [isDesktopLeftOpen, isDesktopRightOpen]);

  const startPanelResize = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = side === 'left' ? leftWidth : rightWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        if (side === 'left') {
          setLeftWidth(clampLeftWidth(startWidth + delta));
        } else {
          setRightWidth(clampRightWidth(startWidth - delta));
        }
      };

      const handleMouseUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [leftWidth, rightWidth]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.tagName === 'SELECT' ||
        Boolean(activeEl?.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveDraft();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        handleToggleFocusMode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !isInput) {
        e.preventDefault();
        handleUndo();
      }
      if (
        (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') ||
          ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z')) &&
        !isInput
      ) {
        e.preventDefault();
        handleRedo();
      }
      if (e.altKey && e.key === 'ArrowUp' && !isInput && selectedId) {
        e.preventDefault();
        if (e.shiftKey) {
          handleMoveOutOneLevel(selectedId);
        } else {
          handleMoveElement(selectedId, 'up');
        }
      }
      if (e.altKey && e.key === 'ArrowDown' && !isInput && selectedId) {
        e.preventDefault();
        handleMoveElement(selectedId, 'down');
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && selectedId) {
        e.preventDefault();
        handleDeleteElement(selectedId);
      }
      if (e.key === 'Escape') {
        if (movePickerNodeId) {
          setMovePickerNodeId(null);
        } else {
          setSelectedId(null);
          setOverlayPanel('none');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleSaveDraft,
    handleToggleFocusMode,
    handleUndo,
    handleRedo,
    handleDeleteElement,
    handleMoveElement,
    handleMoveOutOneLevel,
    movePickerNodeId,
    selectedId,
  ]);

  const isDesktop = editorViewportMode === 'desktop';
  const isTablet = editorViewportMode === 'tablet';
  const isMobile = editorViewportMode === 'mobile';

  const isTabletLeftDrawerOpen = isTablet && LEFT_PANEL_TABS.has(overlayPanel);
  const isTabletRightDrawerOpen = isTablet && overlayPanel === 'properties';

  const activeLeftTab: LeftTab =
    !isDesktop && LEFT_PANEL_TABS.has(overlayPanel)
      ? (overlayPanel as LeftTab)
      : leftTab;

  const handleLeftTabChange = (tab: LeftTab) => {
    setLeftTab(tab);
    if (!isDesktop) {
      setOverlayPanel(tab);
    }
  };

  const handleToggleLeftHeader = () => {
    if (isDesktop) {
      setIsDesktopLeftOpen((prev) => {
        const next = !prev;
        if (next && isFocusMode) setIsFocusMode(false);
        return next;
      });
    } else {
      setOverlayPanel((prev) => (LEFT_PANEL_TABS.has(prev) ? 'none' : leftTab));
    }
  };

  const handleToggleRightHeader = () => {
    if (isDesktop) {
      setIsDesktopRightOpen((prev) => {
        const next = !prev;
        if (next && isFocusMode) setIsFocusMode(false);
        return next;
      });
    } else {
      setOverlayPanel((prev) => (prev === 'properties' ? 'none' : 'properties'));
    }
  };

  const sharedLeftSidebarProps = {
    site,
    effectiveTheme,
    activePage,
    selectedId,
    selectedNode,
    workspace,
    activeTab: activeLeftTab,
    editorViewportMode,
    desktopWidth: leftWidth,
    insertionPlacement,
    isDriveSyncing,
    driveConflictRevision,
    onChangeTab: handleLeftTabChange,
    onChangeInsertionPlacement: setInsertionPlacement,
    onSelectElement: (id: string | null) => setSelectedId(id),
    onAddElementToPage: handleAddElementFromCatalog,
    onToggleFavoriteElement: handleToggleFavoriteElement,
    onDeleteLibraryItem: handleDeleteLibraryItem,
    onDuplicateLibraryItem: handleDuplicateLibraryItem,
    onSyncLinkedInstances: handleSyncLinkedInstances,
    onSaveSelectionAsLibrary: selectedNode
      ? () =>
          setSaveLibraryTarget({
            node: selectedNode,
            defaultType: isContainerElementType(selectedNode.type)
              ? 'section-template'
              : 'component',
          })
      : undefined,
    onDeleteElement: handleDeleteElement,
    onDuplicateElement: handleDuplicateElement,
    onMoveUpElement: (id: string) => handleMoveElement(id, 'up'),
    onMoveDownElement: (id: string) => handleMoveElement(id, 'down'),
    onMoveTopElement: (id: string) => handleMoveTopBottom(id, 'top'),
    onMoveBottomElement: (id: string) => handleMoveTopBottom(id, 'bottom'),
    onMoveOutOneLevel: handleMoveOutOneLevel,
    onMoveIntoContainer: handleMoveIntoContainer,
    onCommitTreeMove: handleCommitTreeMove,
    onCommitCatalogDrop: handleCommitCatalogDrop,
    onCommitLibraryDrop: handleCommitLibraryDrop,
    onDragRejected: announceAndToast,
    onOpenMovePicker: (id: string) => setMovePickerNodeId(id),
    onSetInsertionTarget: handleSetInsertionTarget,
    onToggleHideElement: handleToggleHide,
    onToggleLockElement: handleToggleLock,
    onSelectPage: (pageId: string) => {
      setSite((prev) => ({ ...prev, activePageId: pageId }));
      setSelectedId(null);
      if (editorViewportMode !== 'desktop') setOverlayPanel('none');
    },
    onOpenCreatePageModal: (opts?: {
      forceHome?: boolean;
      method?: PageCreationMethod;
      sourcePageId?: string;
    }) => {
      setPageCreateModalState({ open: true, ...opts });
    },
    onOpenDeletePageModal: (page: PageDocument) => setDeleteTargetPage(page),
    onDuplicatePage: handleDuplicatePage,
    onRenamePage: handleRenamePage,
    onSetHomePage: handleSetHomePage,
    onMovePageOrder: handleMovePageOrder,
    onReorderPageDrop: handleReorderPageDrop,
    onChangePageParent: handleChangePageParent,
    onTogglePageNavVisibility: handleTogglePageNavVisibility,
    onUpdatePageStatus: handleUpdatePageStatus,
    onSavePageSettings: handleSavePageSettings,
    onRequestDriveSync: (forceOverwrite = false) =>
      setDriveConfirmState({ open: true, mode: 'sync', forceOverwrite }),
    onRequestDriveLoad: () => setDriveConfirmState({ open: true, mode: 'load' }),
    onUpdateSiteMeta: handleUpdateSiteMeta,
    openLayoutForPageId,
    onClearOpenLayoutTrigger: () => setOpenLayoutForPageId(null),
    onUpdatePageLayoutSlot: handleUpdatePageLayoutSlot,
    onSelectGlobalComponent: handleSelectGlobalComponent,
    onCreateGlobalVariant: handleCreateGlobalVariant,
    onRenameGlobalVariant: handleRenameGlobalVariant,
    onDeleteGlobalVariant: handleDeleteGlobalVariant,
    onToggleGlobalRegionEnabled: handleToggleGlobalRegionEnabled,
    onToggleRegionPageEnabled: handleToggleRegionPageEnabled,
    onUpdateSlotVisibility: handleUpdateSlotVisibility,
    onCopyGlobalToLocal: handleCopyGlobalToLocal,
    onSetSlotMode: handleSetSlotMode,
    onSaveSlotAsTemplate: (slot: 'header' | 'footer', rootNode: ElementNode) =>
      setSaveLibraryTarget({
        node: rootNode,
        defaultType: slot === 'header' ? 'header-template' : 'footer-template',
      }),
    onUpdateCustomCode: handleUpdateCustomCode,
    onApplyTheme: handleApplyTheme,
    onUpdateThemeColorOverride: handleUpdateThemeColorOverride,
    onResetThemeColorOverride: handleResetThemeColorOverride,
    onResetAllThemeOverrides: handleResetAllThemeOverrides,
    onSaveCustomTheme: handleSaveCustomTheme,
    onDeleteCustomTheme: handleDeleteCustomTheme,
    onUpdateWorkspaceTab: (name: string, rows: Record<string, any>[]) =>
      handleSaveDemoTabs(
        workspace.spreadsheet.tabs.map((t) => (t.name === name ? { ...t, rows } : t))
      ),
    onAddAsset: handleAddAsset,
    onUpdateAsset: handleUpdateAsset,
    onDeleteAsset: handleDeleteAsset,
    onApplyAssetToSelection: handleApplyAssetToSelection,
    onRollbackRelease: handleRollbackRelease,
    onPreviewRelease: handlePreviewRelease,
    onRenameRelease: handleRenameRelease,
    onEditReleaseDescription: handleEditReleaseDescription,
    onDeleteRelease: handleDeleteRelease,
    onRestoreRelease: handleRestoreRelease,
    onOpenSheetsEditor: () => setIsSheetsEditorModalOpen(true),
    onOpenCmsWorkspace: () => setIsCmsWorkspaceModalOpen(true),
    onOpenGoogleSetup: () => setIsGoogleSetupModalOpen(true),
    onRefreshFromSheets: handleRefreshFromSheets,
    onConnectGoogle: handleConnectGoogle,
    onClose: () => setOverlayPanel('none'),
  };

  const sharedInspectorProps = {
    element: selectedNode,
    parentElement: parentNode,
    site,
    effectiveTheme,
    workspace,
    deviceMode,
    editorViewportMode,
    desktopWidth: rightWidth,
    reduceMotionPreview,
    editingRegionLabel,
    onToggleReduceMotion: () => setReduceMotionPreview((p) => !p),
    onSetDeviceMode: setDeviceMode,
    onUpdateElement: handleUpdateElement,
    onDeleteElement: handleDeleteElement,
    onDuplicateElement: handleDuplicateElement,
    onDetachLinkedComponent: handleDetachLinkedComponent,
    onOpenSaveAsLibrary: (node: ElementNode) =>
      setSaveLibraryTarget({
        node,
        defaultType: isContainerElementType(node.type) ? 'section-template' : 'component',
      }),
    onSaveRegionAsTemplate: (regionType: RegionType, node: ElementNode) =>
      setSaveLibraryTarget({
        node,
        defaultType:
          regionType === 'header'
            ? 'header-template'
            : regionType === 'footer'
            ? 'footer-template'
            : 'navigation-template',
      }),
    onOpenNavigator: () => {
      setLeftTab('navigator');
      if (isDesktop) {
        setIsDesktopLeftOpen(true);
        if (isFocusMode) setIsFocusMode(false);
      } else {
        setOverlayPanel('navigator');
      }
    },
    onOpenCodeTab: () => {
      setLeftTab('code');
      if (isDesktop) {
        setIsDesktopLeftOpen(true);
        if (isFocusMode) setIsFocusMode(false);
      } else {
        setOverlayPanel('code');
      }
    },
    onClose: () => setOverlayPanel('none'),
    onUpdateCms: handleUpdateCmsByFn,
    onUpdateWorkspaceTabs: handleUpdateWorkspaceTabs,
    onSubmitForm: handleFormSubmission,
    onOpenCmsInbox: () => {
      setCmsInitialViewMode('inbox');
      setIsCmsWorkspaceModalOpen(true);
    },
  };

  const movePickerNode = useMemo(() => {
    if (!movePickerNodeId || !activePage) return null;
    const ctx = getRegionContextForNode(site, activePage, movePickerNodeId);
    if (!ctx) return null;
    return findNodeParentAndIndex(ctx.root, movePickerNodeId)?.node || null;
  }, [movePickerNodeId, site, activePage]);

  return (
    <BuilderDragProvider>
    <div className="builder-ui w-full h-full flex flex-col bg-[var(--builder-canvas-bg)] text-[var(--builder-text-primary)] overflow-hidden font-sans">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaAnnouncement}
      </div>
      <HeaderToolbar
        site={site}
        activePage={activePage}
        deviceMode={deviceMode}
        editorViewportMode={editorViewportMode}
        isPreviewMode={isPreviewMode}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSavedTime={lastSavedTime}
        workspace={workspace}
        buillyOwner={buillyOwner}
        projectName={projectContext?.projectName}
        onNavigateConsole={onNavigateConsole}
        onNavigateLanding={onNavigateLanding}
        onOpenWorkspaceConnect={onOpenWorkspaceConnect}
        onSignOutOwner={onSignOutOwner}
        isLeftDrawerOpen={isDesktop ? isDesktopLeftOpen : isTabletLeftDrawerOpen}
        isRightDrawerOpen={isDesktop ? isDesktopRightOpen : isTabletRightDrawerOpen}
        isFocusMode={isFocusMode}
        onSelectPage={(pageId) => {
          setSite((prev) => ({ ...prev, activePageId: pageId }));
          setSelectedId(null);
        }}
        onOpenCreatePageModal={() =>
          setPageCreateModalState({ open: true, forceHome: site.pages.length === 0 })
        }
        onSetDeviceMode={setDeviceMode}
        onTogglePreview={() => {
          setIsPreviewMode((prev) => !prev);
          setOverlayPanel('none');
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSaveDraft={handleSaveDraft}
        onOpenPublishModal={() => setIsPublishModalOpen(true)}
        onOpenPublicSiteModal={() => setIsPublicSiteModalOpen(true)}
        onOpenGoogleSetupModal={() => setIsGoogleSetupModalOpen(true)}
        onOpenSheetsEditorModal={() => setIsSheetsEditorModalOpen(true)}
        onOpenCmsModal={() => setIsCmsWorkspaceModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onToggleSidebar={handleToggleLeftHeader}
        onToggleInspector={handleToggleRightHeader}
        onToggleFocusMode={handleToggleFocusMode}
      />

      {/* Main Editor Workspace */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Desktop Left Dock + Resizable Splitter */}
        {isDesktop && !isPreviewMode && isDesktopLeftOpen && (
          <>
            <LeftSidebar {...sharedLeftSidebarProps} />
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label={t('builder.canvas.resizeLeftAria')}
              aria-valuenow={leftWidth}
              aria-valuemin={LEFT_PANEL_MIN}
              aria-valuemax={LEFT_PANEL_MAX}
              title={t('builder.canvas.resetWidthTitle')}
              onMouseDown={(e) => startPanelResize('left', e)}
              onDoubleClick={() => setLeftWidth(LEFT_PANEL_DEFAULT)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setLeftWidth((w) => clampLeftWidth(w - 12));
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setLeftWidth((w) => clampLeftWidth(w + 12));
                }
              }}
              className="w-1.5 shrink-0 cursor-col-resize bg-[var(--builder-canvas-bg)] hover:bg-[var(--builder-primary)]/20 active:bg-[var(--builder-primary)]/35 transition-colors flex items-center justify-center group z-20"
            >
              <span className="w-0.5 h-8 rounded-full bg-[var(--builder-border-strong)] group-hover:bg-[var(--builder-primary)] transition-colors" />
            </div>
          </>
        )}

        {/* Central Canvas (Always mounted to preserve scroll position across panel switches) */}
        <Canvas
          site={site}
          page={activePage}
          effectiveTheme={effectiveTheme}
          deviceMode={deviceMode}
          editorViewportMode={editorViewportMode}
          isPreviewMode={isPreviewMode}
          selectedId={selectedId}
          selectedNode={selectedNode}
          hoveredId={hoveredId}
          workspace={workspace}
          reduceMotionPreview={reduceMotionPreview}
          isFocusMode={isFocusMode}
          onToggleFocusMode={handleToggleFocusMode}
          onToggleReduceMotion={() => setReduceMotionPreview((p) => !p)}
          onSetDeviceMode={setDeviceMode}
          onSelectElement={handleSelectElementFromCanvas}
          onHoverElement={setHoveredId}
          onDeleteElement={handleDeleteElement}
          onDuplicateElement={handleDuplicateElement}
          onMoveUpElement={(id) => handleMoveElement(id, 'up')}
          onMoveDownElement={(id) => handleMoveElement(id, 'down')}
          onAddChildElement={handleAddChild}
          onUpdateTextContent={handleUpdateText}
          onNavigatePage={(slug) => {
            const target = site.pages.find(
              (p) => resolvePageFullPath(p, site.pages) === slug || p.slug === slug
            );
            if (target) {
              setSite((prev) => ({ ...prev, activePageId: target.id }));
              setSelectedId(null);
            }
          }}
          onDropCatalogItem={handleDropCatalogItem}
          onCommitTreeMove={handleCommitTreeMove}
          onCommitCatalogDrop={handleCommitCatalogDrop}
          onCommitLibraryDrop={handleCommitLibraryDrop}
          onDragRejected={announceAndToast}
          onOpenMovePicker={(id) => setMovePickerNodeId(id)}
          onSetInsertionTarget={handleSetInsertionTarget}
          onMoveOutOneLevel={handleMoveOutOneLevel}
          onOpenProperties={() => setOverlayPanel('properties')}
          onOpenAddElements={() => {
            setInsertionPlacement('into-selected');
            setLeftTab('elements');
            setOverlayPanel('elements');
          }}
          onOpenCreateHomePage={() =>
            setPageCreateModalState({ open: true, forceHome: true })
          }
          onCopyGlobalToLocal={handleCopyGlobalToLocal}
          onOpenPageLayoutSettings={handleOpenPageLayoutSettings}
          onSubmitForm={handleFormSubmission}
        />

        {/* Desktop Right Resizable Splitter + Right Dock */}
        {isDesktop && !isPreviewMode && isDesktopRightOpen && (
          <>
            <div
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label={t('builder.canvas.resizeRightAria')}
              aria-valuenow={rightWidth}
              aria-valuemin={RIGHT_PANEL_MIN}
              aria-valuemax={RIGHT_PANEL_MAX}
              title={t('builder.canvas.resetWidthTitle')}
              onMouseDown={(e) => startPanelResize('right', e)}
              onDoubleClick={() => setRightWidth(RIGHT_PANEL_DEFAULT)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  setRightWidth((w) => clampRightWidth(w + 12));
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  setRightWidth((w) => clampRightWidth(w - 12));
                }
              }}
              className="w-1.5 shrink-0 cursor-col-resize bg-[var(--builder-canvas-bg)] hover:bg-[var(--builder-primary)]/20 active:bg-[var(--builder-primary)]/35 transition-colors flex items-center justify-center group z-20"
            >
              <span className="w-0.5 h-8 rounded-full bg-[var(--builder-border-strong)] group-hover:bg-[var(--builder-primary)] transition-colors" />
            </div>
            <PropertyInspector {...sharedInspectorProps} />
          </>
        )}

        {/* Tablet Overlay Drawers (Single panel at a time; canvas remains visible underneath) */}
        {isTablet && !isPreviewMode && (isTabletLeftDrawerOpen || isTabletRightDrawerOpen) && (
          <>
            <div
              onClick={() => setOverlayPanel('none')}
              className="fixed inset-0 top-14 bg-slate-900/25 backdrop-blur-[1px] z-30"
            />
            {isTabletLeftDrawerOpen && (
              <div className="absolute top-0 left-0 bottom-0 w-[340px] max-w-[85vw] z-40 shadow-2xl border-r border-slate-200 bg-white">
                <LeftSidebar {...sharedLeftSidebarProps} />
              </div>
            )}
            {isTabletRightDrawerOpen && (
              <div className="absolute top-0 right-0 bottom-0 w-[360px] max-w-[85vw] z-40 shadow-2xl border-l border-slate-200 bg-white">
                <PropertyInspector {...sharedInspectorProps} />
              </div>
            )}
          </>
        )}

        {/* Mobile Focused Sheet Overlay (Single panel at a time above MobileBottomNav) */}
        {isMobile && !isPreviewMode && overlayPanel !== 'none' && (
          <div className="absolute inset-0 z-30 bg-white flex flex-col overflow-hidden">
            {overlayPanel === 'properties' ? (
              <PropertyInspector {...sharedInspectorProps} />
            ) : overlayPanel === 'more' ? (
              <MobileMoreSheet
                onOpenToolTab={(tab) => {
                  setLeftTab(tab);
                  setOverlayPanel(tab);
                }}
                onOpenSheetsModal={() => setIsSheetsEditorModalOpen(true)}
                onOpenCmsModal={() => setIsCmsWorkspaceModalOpen(true)}
                onOpenGoogleModal={() => setIsGoogleSetupModalOpen(true)}
                onOpenPublicSiteModal={() => setIsPublicSiteModalOpen(true)}
                onOpenExportModal={() => setIsExportModalOpen(true)}
                onClose={() => setOverlayPanel('none')}
              />
            ) : (
              <LeftSidebar {...sharedLeftSidebarProps} />
            )}
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && !isPreviewMode && (
        <MobileBottomNav
          activePanel={overlayPanel}
          hasSelection={Boolean(selectedId)}
          onSelectPanel={(panel) => {
            if (panel === 'elements' || panel === 'navigator') {
              setLeftTab(panel);
            }
            setOverlayPanel(panel);
          }}
        />
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`fixed ${
            isMobile && !isPreviewMode ? 'bottom-16' : 'bottom-5'
          } left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl flex items-center gap-2 whitespace-nowrap`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modals */}
      <PublishModal
        isOpen={isPublishModalOpen}
        site={site}
        workspace={workspace}
        workerSessionToken={workerSessionToken}
        orgId={projectContext?.orgId}
        projectId={projectContext?.projectId}
        onClose={() => setIsPublishModalOpen(false)}
        onPublishSuccess={(rel, publishedPageIds) => {
          const publishedSet = new Set(publishedPageIds);
          pushState({
            ...site,
            pages: site.pages.map((p) =>
              publishedSet.has(p.id) ? { ...p, status: 'published' as const } : p
            ),
            releases: [rel, ...site.releases.filter((r) => r.version !== rel.version)],
            activeReleaseVersion: rel.version,
          });
          setHasUnsavedChanges(false);
          showToast(`Published ${rel.version} (${publishedPageIds.length} pages)`);
        }}
        onOpenPublicSite={() => setIsPublicSiteModalOpen(true)}
        onOpenRuntimeRoute={
          onOpenRuntimeRoute && site.portfolioSlug
            ? () => onOpenRuntimeRoute(`/${site.portfolioSlug}`)
            : undefined
        }
      />
      <PageCreationModal
        isOpen={pageCreateModalState.open}
        site={site}
        defaultForceHome={pageCreateModalState.forceHome}
        defaultMethod={pageCreateModalState.method}
        defaultSourcePageId={pageCreateModalState.sourcePageId}
        onClose={() => setPageCreateModalState({ open: false })}
        onCreatePage={handleCreatePage}
      />
      <PageDeleteConfirmModal
        isOpen={Boolean(deleteTargetPage)}
        page={deleteTargetPage}
        allPages={site.pages}
        onClose={() => setDeleteTargetPage(null)}
        onConfirmDelete={handleConfirmDeletePage}
        onSetHomePage={(newHomeId) => {
          handleSetHomePage(newHomeId);
          setDeleteTargetPage((prev) => (prev ? { ...prev, isHome: false } : null));
        }}
      />
      <WorkspaceConfirmModal
        isOpen={Boolean(driveConfirmState?.open)}
        title={
          driveConfirmState?.mode === 'load'
            ? 'Load Pages from Google Drive?'
            : driveConfirmState?.forceOverwrite
            ? 'Overwrite Remote Drive Registry?'
            : 'Sync Multi-Page Registry to Google Drive?'
        }
        description={
          driveConfirmState?.mode === 'load'
            ? 'Loading from Google Drive will replace your current local draft pages with the manifest and page documents stored in your Drive folder.'
            : 'This will create or update indyshares-pages-registry.json and individual page-*.json files in your personal Google Drive folder.'
        }
        details={[
          `Folder: /${ENV_CONFIG.driveFolderName}`,
          `Local pages: ${site.pages.length} · Registry Rev ${site.pageRegistryRevision ?? 1}`,
        ]}
        confirmLabel={
          driveConfirmState?.mode === 'load'
            ? 'Load from Drive'
            : driveConfirmState?.forceOverwrite
            ? 'Force Overwrite'
            : 'Sync to Drive'
        }
        isDanger={Boolean(driveConfirmState?.forceOverwrite || driveConfirmState?.mode === 'load')}
        isBusy={isDriveSyncing}
        onConfirm={() => {
          if (driveConfirmState?.mode === 'load') {
            executeDriveLoad();
          } else {
            executeDriveSync(Boolean(driveConfirmState?.forceOverwrite));
          }
        }}
        onCancel={() => setDriveConfirmState(null)}
      />
      <GoogleSetupModal
        isOpen={isGoogleSetupModalOpen}
        workspace={workspace}
        siteName={site.name}
        onClose={() => setIsGoogleSetupModalOpen(false)}
        onConnectGoogle={handleConnectGoogle}
        onCancelConnectGoogle={handleCancelConnectGoogle}
        onDisconnectGoogle={handleDisconnectGoogle}
        onPickSpreadsheet={handlePickSpreadsheet}
        onLinkSpreadsheetById={handleLinkSpreadsheetById}
        onCreateSpreadsheet={handleCreateSpreadsheet}
        onInitializeMissingTabs={handleInitializeMissingTabs}
        onRefreshFromSheets={handleRefreshFromSheets}
        onUpdateMode={(m) => {
          persistWorkspace({ ...workspace, mode: m });
        }}
        onToggleDemoMode={handleToggleDemoMode}
        onOpenSheetsEditor={() => setIsSheetsEditorModalOpen(true)}
      />
      <PublicSiteModal
        isOpen={isPublicSiteModalOpen}
        site={site}
        workspace={workspace}
        onClose={handleClosePublicSiteModal}
        previewReleaseVersion={previewReleaseVersion}
        onOpenRuntimeRoute={onOpenRuntimeRoute}
        onSubmitForm={handleFormSubmission}
      />
      <SheetsEditorModal
        isOpen={isSheetsEditorModalOpen}
        workspace={workspace}
        onClose={() => setIsSheetsEditorModalOpen(false)}
        onRefreshFromSheets={handleRefreshFromSheets}
        onSaveTabsToSheets={handleSaveTabsToSheets}
        onSaveDemoTabs={handleSaveDemoTabs}
        onOpenGoogleSetup={() => setIsGoogleSetupModalOpen(true)}
        onConnectGoogle={handleConnectGoogle}
        onCancelConnectGoogle={handleCancelConnectGoogle}
      />
      {site.cms && (
        <CmsWorkspaceModal
          isOpen={isCmsWorkspaceModalOpen}
          siteCms={site.cms}
          workspace={workspace}
          initialViewMode={cmsInitialViewMode}
          onUpdateCms={handleUpdateCms}
          onSyncToWorkspace={handleSyncCmsToWorkspace}
          onPullFromWorkspace={handlePullCmsFromWorkspace}
          onClose={() => {
            setIsCmsWorkspaceModalOpen(false);
            setCmsInitialViewMode('overview');
          }}
          showToast={showToast}
        />
      )}
      <ExportModal
        isOpen={isExportModalOpen}
        site={site}
        workspace={workspace}
        onClose={() => setIsExportModalOpen(false)}
      />
      <SaveLibraryModal
        isOpen={Boolean(saveLibraryTarget)}
        targetNode={saveLibraryTarget?.node || null}
        defaultType={saveLibraryTarget?.defaultType || 'component'}
        onClose={() => setSaveLibraryTarget(null)}
        onSave={handleSaveLibraryItem}
      />
      <MoveTargetPickerModal
        isOpen={Boolean(movePickerNodeId && movePickerNode)}
        node={movePickerNode}
        site={site}
        activePage={activePage}
        onClose={() => setMovePickerNodeId(null)}
        onCommitTreeMove={handleCommitTreeMove}
        onSetInsertionTarget={(id, placement) => {
          setSelectedId(id);
          setInsertionPlacement(placement);
        }}
        onOpenElementsToInsert={() => {
          setLeftTab('elements');
          if (isDesktop) setIsDesktopLeftOpen(true);
          else setOverlayPanel('elements');
        }}
      />
    </div>
    </BuilderDragProvider>
  );
}
