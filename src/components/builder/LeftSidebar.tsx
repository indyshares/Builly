import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DeviceMode,
  DropPosition,
  ElementNode,
  GoogleWorkspaceState,
  HeaderFooterComponentDef,
  InsertionPlacement,
  LayoutMode,
  LibraryItem,
  MediaAsset,
  PageDocument,
  PageLayoutSlot,
  PageStatus,
  RegionResponsiveVisibility,
  SemanticThemeColors,
  SiteDocument,
} from '../../types/builder';
import {
  ELEMENT_REGISTRY,
  canNestElement,
  isContainerElementType,
} from '../../data/elementRegistry';
import {
  isRegionVisibleOnDevice,
  resolvePageSlotComponent,
} from '../../services/componentLibraryService';
import {
  RegionKind,
  DropValidationResult,
  findNodeParentAndIndex,
  getRegionContextForNode,
  resolveDropDestination,
  validateTreeInsert,
  validateTreeMove,
} from '../../services/treeCommandService';
import { useBuilderDrag } from '../../contexts/BuilderDragContext';
import { ResolvedEffectiveTheme } from '../../services/themeService';
import { validateCustomCss } from '../../services/styleValidator';
import { ThemePanel } from './ThemePanel';
import { PageManagementPanel, PageSettingsPatch } from './PageManagementPanel';
import { ElementLibraryPanel } from './ElementLibraryPanel';
import { AssetLibraryPanel } from './AssetLibraryPanel';
import { PageCreationMethod } from '../../services/pageService';
import {
  Plus,
  Layers,
  Palette,
  Database,
  Image as ImageIcon,
  Code2,
  History,
  FileText,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowUpToLine,
  ArrowDownToLine,
  CornerLeftUp,
  GripVertical,
  Move,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  X,
  FolderInput,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  FolderOpen,
  RotateCcw,
} from 'lucide-react';

export type LeftTab =
  | 'elements'
  | 'navigator'
  | 'pages'
  | 'themes'
  | 'sheets'
  | 'media'
  | 'code'
  | 'releases';

interface LeftSidebarProps {
  site: SiteDocument;
  effectiveTheme: ResolvedEffectiveTheme;
  activePage: PageDocument | null;
  selectedId: string | null;
  selectedNode: ElementNode | null;
  workspace: GoogleWorkspaceState;
  activeTab: LeftTab;
  editorViewportMode: DeviceMode;
  desktopWidth?: number;
  insertionPlacement: InsertionPlacement;
  isDriveSyncing?: boolean;
  driveConflictRevision?: number | null;
  onChangeTab: (tab: LeftTab) => void;
  onChangeInsertionPlacement: (placement: InsertionPlacement) => void;
  onSelectElement: (id: string | null) => void;
  onAddElementToPage: (elementNode: ElementNode, elementTypeKey?: string) => void;
  onToggleFavoriteElement: (elementType: string) => void;
  onDeleteLibraryItem: (itemId: string) => void;
  onDuplicateLibraryItem: (itemId: string) => void;
  onSyncLinkedInstances: (item: LibraryItem) => void;
  onSaveSelectionAsLibrary?: () => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onMoveUpElement: (id: string) => void;
  onMoveDownElement: (id: string) => void;
  onMoveTopElement?: (id: string) => void;
  onMoveBottomElement?: (id: string) => void;
  onMoveOutOneLevel?: (id: string) => void;
  onMoveIntoContainer?: (elementId: string, targetContainerId: string) => void;
  onCommitTreeMove?: (
    nodeIds: string[],
    destinationParentId: string,
    destinationIndex: number
  ) => void;
  onCommitCatalogDrop?: (
    elementType: string,
    destinationParentId: string,
    destinationIndex: number
  ) => void;
  onCommitLibraryDrop?: (
    item: LibraryItem,
    mode: 'independent' | 'linked',
    destinationParentId: string,
    destinationIndex: number
  ) => void;
  onDragRejected?: (reason: string) => void;
  onOpenMovePicker?: (nodeId: string) => void;
  onSetInsertionTarget?: (nodeId: string, placement: InsertionPlacement) => void;
  onToggleHideElement: (id: string) => void;
  onToggleLockElement: (id: string) => void;
  onSelectPage: (pageId: string) => void;
  onOpenCreatePageModal: (opts?: {
    forceHome?: boolean;
    method?: PageCreationMethod;
    sourcePageId?: string;
  }) => void;
  onOpenDeletePageModal: (page: PageDocument) => void;
  onDuplicatePage: (pageId: string) => void;
  onRenamePage: (pageId: string, newName: string) => void;
  onSetHomePage: (pageId: string) => void;
  onMovePageOrder: (pageId: string, direction: 'up' | 'down') => void;
  onReorderPageDrop: (draggedPageId: string, targetPageId: string) => void;
  onChangePageParent: (pageId: string, parentPageId: string | null) => void;
  onTogglePageNavVisibility: (pageId: string) => void;
  onUpdatePageStatus: (pageId: string, status: PageStatus) => void;
  onSavePageSettings: (pageId: string, patch: PageSettingsPatch) => void;
  onRequestDriveSync: (forceOverwrite?: boolean) => void;
  onRequestDriveLoad: () => void;
  onUpdateSiteMeta: (updates: { name?: string; portfolioSlug?: string }) => void;
  openLayoutForPageId?: string | null;
  onClearOpenLayoutTrigger?: () => void;
  onUpdatePageLayoutSlot: (
    pageId: string,
    slot: 'header' | 'footer',
    nextSlot: PageLayoutSlot
  ) => void;
  onSelectGlobalComponent: (slot: 'header' | 'footer', componentId: string) => void;
  onCreateGlobalVariant: (
    slot: 'header' | 'footer',
    name: string,
    sourceDef?: HeaderFooterComponentDef,
    presetId?: string
  ) => void;
  onRenameGlobalVariant: (slot: 'header' | 'footer', componentId: string, name: string) => void;
  onDeleteGlobalVariant: (slot: 'header' | 'footer', componentId: string) => void;
  onToggleGlobalRegionEnabled: (slot: 'header' | 'footer', componentId: string) => void;
  onToggleRegionPageEnabled: (slot: 'header' | 'footer') => void;
  onUpdateSlotVisibility: (slot: 'header' | 'footer', vis: RegionResponsiveVisibility) => void;
  onCopyGlobalToLocal: (slot: 'header' | 'footer') => void;
  onSetSlotMode: (slot: 'header' | 'footer', mode: LayoutMode) => void;
  onSaveSlotAsTemplate: (slot: 'header' | 'footer', rootNode: ElementNode) => void;
  onUpdateCustomCode: (
    scope: 'site' | 'page' | 'element',
    css: string,
    js: string,
    themeMode?: 'follow-theme' | 'independent'
  ) => void;
  onApplyTheme: (themeId: string, resetOverrides?: boolean) => void;
  onUpdateThemeColorOverride: (token: keyof SemanticThemeColors, hex: string) => void;
  onResetThemeColorOverride: (token: keyof SemanticThemeColors) => void;
  onResetAllThemeOverrides: () => void;
  onSaveCustomTheme: (name: string) => void;
  onDeleteCustomTheme?: (themeId: string) => void;
  onUpdateWorkspaceTab: (tabName: string, rows: Record<string, any>[]) => void;
  onAddAsset: (asset: MediaAsset) => void;
  onUpdateAsset: (asset: MediaAsset) => void;
  onDeleteAsset: (assetId: string) => void;
  onApplyAssetToSelection: (asset: MediaAsset) => void;
  onRollbackRelease: (version: string) => void;
  onPreviewRelease: (version: string) => void;
  onRenameRelease: (versionId: string, newName: string) => void;
  onEditReleaseDescription: (versionId: string, newDesc: string) => void;
  onDeleteRelease: (versionId: string) => void;
  onRestoreRelease: (versionId: string) => void;
  onOpenSheetsEditor?: () => void;
  onOpenCmsWorkspace?: () => void;
  onOpenGoogleSetup?: () => void;
  onRefreshFromSheets?: () => Promise<void>;
  onConnectGoogle?: (forceConsent?: boolean) => Promise<void>;
  onClose?: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  site,
  effectiveTheme,
  activePage,
  selectedId,
  selectedNode,
  workspace,
  activeTab,
  editorViewportMode,
  desktopWidth = 276,
  insertionPlacement,
  isDriveSyncing = false,
  driveConflictRevision = null,
  onChangeTab,
  onChangeInsertionPlacement,
  onSelectElement,
  onAddElementToPage,
  onToggleFavoriteElement,
  onDeleteLibraryItem,
  onDuplicateLibraryItem,
  onSyncLinkedInstances,
  onSaveSelectionAsLibrary,
  onDeleteElement,
  onDuplicateElement,
  onMoveUpElement,
  onMoveDownElement,
  onMoveTopElement,
  onMoveBottomElement,
  onMoveOutOneLevel,
  onMoveIntoContainer,
  onCommitTreeMove,
  onCommitCatalogDrop,
  onCommitLibraryDrop,
  onDragRejected,
  onOpenMovePicker,
  onSetInsertionTarget,
  onToggleHideElement,
  onToggleLockElement,
  onSelectPage,
  onOpenCreatePageModal,
  onOpenDeletePageModal,
  onDuplicatePage,
  onRenamePage,
  onSetHomePage,
  onMovePageOrder,
  onReorderPageDrop,
  onChangePageParent,
  onTogglePageNavVisibility,
  onUpdatePageStatus,
  onSavePageSettings,
  onRequestDriveSync,
  onRequestDriveLoad,
  onUpdateSiteMeta,
  openLayoutForPageId,
  onClearOpenLayoutTrigger,
  onUpdatePageLayoutSlot,
  onSelectGlobalComponent,
  onCreateGlobalVariant,
  onRenameGlobalVariant,
  onDeleteGlobalVariant,
  onToggleGlobalRegionEnabled,
  onToggleRegionPageEnabled,
  onUpdateSlotVisibility,
  onCopyGlobalToLocal,
  onSetSlotMode,
  onSaveSlotAsTemplate,
  onUpdateCustomCode,
  onApplyTheme,
  onUpdateThemeColorOverride,
  onResetThemeColorOverride,
  onResetAllThemeOverrides,
  onSaveCustomTheme,
  onDeleteCustomTheme,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onApplyAssetToSelection,
  onRollbackRelease,
  onPreviewRelease,
  onRenameRelease,
  onEditReleaseDescription,
  onDeleteRelease,
  onRestoreRelease,
  onOpenSheetsEditor,
  onOpenCmsWorkspace,
  onOpenGoogleSetup,
  onRefreshFromSheets,
  onConnectGoogle,
  onClose,
}) => {
  const { t } = useTranslation();
  const [releasesTabMode, setReleasesTabMode] = useState<'active' | 'trash'>('active');
  const [activeSheetsTab, setActiveSheetsTab] = useState<string>('PROJECTS');
  const [customCodeScope, setCustomCodeScope] = useState<'site' | 'page' | 'element'>('site');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { activeDrag, hoverTarget, startDrag, setHoverTarget, endDrag } = useBuilderDrag();

  // Controlled custom code draft synced with selected scope
  const getInitialCodeValues = () => {
    if (customCodeScope === 'site') {
      return {
        css: site.globalCss || '',
        js: site.globalJs || '',
        themeMode: site.globalCssThemeMode || 'follow-theme',
      };
    }
    if (customCodeScope === 'page') {
      return {
        css: activePage?.customCss || '',
        js: activePage?.customJs || '',
        themeMode: activePage?.customCssThemeMode || 'follow-theme',
      };
    }
    return {
      css: selectedNode?.advanced?.customCss || '',
      js: '',
      themeMode: 'follow-theme' as const,
    };
  };
  const currentCode = getInitialCodeValues();
  const [codeCssDraft, setCodeCssDraft] = useState(currentCode.css);
  const [codeJsDraft, setCodeJsDraft] = useState(currentCode.js);
  const [codeThemeModeDraft, setCodeThemeModeDraft] = useState<'follow-theme' | 'independent'>(
    currentCode.themeMode
  );

  useEffect(() => {
    const next = getInitialCodeValues();
    setCodeCssDraft(next.css);
    setCodeJsDraft(next.js);
    setCodeThemeModeDraft(next.themeMode);
  }, [
    customCodeScope,
    site.activePageId,
    selectedId,
    site.globalCss,
    site.globalCssThemeMode,
    site.globalJs,
    activePage?.customCss,
    activePage?.customCssThemeMode,
    activePage?.customJs,
    selectedNode?.advanced?.customCss,
  ]);

  const isOverlay = editorViewportMode !== 'desktop';

  const headerSlot = resolvePageSlotComponent(activePage, site, 'header');
  const footerSlot = resolvePageSlotComponent(activePage, site, 'footer');

  const rootIds = new Set(
    [
      activePage?.rootElement.id,
      headerSlot.definition?.rootElement.id,
      footerSlot.definition?.rootElement.id,
    ].filter(Boolean) as string[]
  );

  // Clear stale multi-selection when page changes
  useEffect(() => {
    setMultiSelectedIds([]);
  }, [activePage?.id]);

  // Collect available containers within the tree containing a node
  const collectContainers = (
    node: ElementNode,
    movingNode: ElementNode | null,
    depth = 0,
    list: { id: string; name: string; depth: number; allowed: boolean; reason?: string }[] = []
  ) => {
    if (movingNode && node.id === movingNode.id) return list;
    if (isContainerElementType(node.type)) {
      const check = movingNode
        ? canNestElement(node, movingNode.type, depth)
        : { allowed: true };
      list.push({
        id: node.id,
        name: node.name,
        depth,
        allowed: check.allowed,
        reason: check.reason,
      });
    }
    node.children?.forEach((c) => collectContainers(c, movingNode, depth + 1, list));
    return list;
  };

  const hasNodeId = (root: ElementNode | undefined, id: string | null): boolean => {
    if (!root || !id) return false;
    if (root.id === id) return true;
    return Boolean(root.children?.some((c) => hasNodeId(c, id)));
  };

  const owningRoot = hasNodeId(headerSlot.definition?.rootElement, selectedId)
    ? headerSlot.definition?.rootElement
    : hasNodeId(footerSlot.definition?.rootElement, selectedId)
    ? footerSlot.definition?.rootElement
    : activePage?.rootElement;

  const availableContainers = useMemo(
    () => (owningRoot ? collectContainers(owningRoot, selectedNode) : []),
    [owningRoot, selectedNode]
  );

  const toggleCollapseNode = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleMultiSelectSibling = (
    nodeId: string,
    parentNode: ElementNode | null,
    shiftOrMeta: boolean
  ) => {
    if (!parentNode || rootIds.has(nodeId)) return;
    if (!shiftOrMeta) {
      setMultiSelectedIds([]);
      onSelectElement(nodeId);
      return;
    }
    const siblingIdSet = new Set((parentNode.children || []).map((c) => c.id));
    setMultiSelectedIds((prev) => {
      const base =
        prev.length > 0 && prev.every((id) => siblingIdSet.has(id))
          ? prev
          : selectedId && siblingIdSet.has(selectedId)
          ? [selectedId]
          : [];
      const exists = base.includes(nodeId);
      const next = exists ? base.filter((id) => id !== nodeId) : [...base, nodeId];
      // Keep canonical parent child order
      const ordered = (parentNode.children || [])
        .map((c) => c.id)
        .filter((id) => next.includes(id));
      return ordered;
    });
    onSelectElement(nodeId);
  };

  const handleSidebarDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!activeDrag || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const edgeThreshold = 54;
    if (e.clientY < rect.top + edgeThreshold) {
      scrollContainerRef.current.scrollTop -= 12;
    } else if (e.clientY > rect.bottom - edgeThreshold) {
      scrollContainerRef.current.scrollTop += 12;
    }
  };

  const computeRowDropAndValidate = (
    node: ElementNode,
    isRoot: boolean,
    regionKind: RegionKind,
    e: React.DragEvent
  ) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isContainer = isContainerElementType(node.type);
    let position: DropPosition = 'after';
    if (isRoot) {
      position = 'inside-last';
    } else if (isContainer) {
      const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
      if (relY < 0.28) position = 'before';
      else if (relY > 0.72) position = 'after';
      else position = 'inside-last';
    } else {
      const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
      position = relY < 0.5 ? 'before' : 'after';
    }

    if (!activePage || !activeDrag) {
      return { position, dest: null, validation: null, region: regionKind };
    }

    const regionCtx = getRegionContextForNode(site, activePage, node.id);
    if (!regionCtx) {
      return { position, dest: null, validation: null, region: regionKind };
    }

    const dest = resolveDropDestination(regionCtx.root, node.id, position);
    if (!dest) {
      const invalidRes: DropValidationResult = {
        valid: false,
        reason: 'Invalid drop location.',
      };
      return {
        position,
        dest: null,
        validation: invalidRes,
        region: regionCtx.region,
      };
    }

    if (activeDrag.kind === 'existing') {
      const validation = validateTreeMove(site, activePage, {
        nodeIds: activeDrag.nodeIds,
        destinationParentId: dest.parent.id,
        destinationIndex: dest.index,
      });
      return { position, dest, validation, region: regionCtx.region };
    }

    const elementType =
      activeDrag.kind === 'catalog'
        ? activeDrag.elementType
        : activeDrag.item.rootNode?.type || 'container';

    const validation = validateTreeInsert(site, activePage, {
      elementType,
      destinationParentId: dest.parent.id,
      destinationIndex: dest.index,
      sourceItem: activeDrag.kind === 'library-item' ? activeDrag.item : undefined,
    });
    return { position, dest, validation, region: regionCtx.region };
  };

  // Navigator recursive tree item renderer
  const renderTreeItem = (
    node: ElementNode,
    depth = 0,
    regionKind: RegionKind = 'page',
    parentNode: ElementNode | null = null
  ) => {
    const isSelected = node.id === selectedId;
    const isMultiSelected = multiSelectedIds.includes(node.id);
    const isRoot = rootIds.has(node.id);
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isCollapsed = collapsedIds.has(node.id);
    const isDropTarget = Boolean(
      hoverTarget && hoverTarget.targetNodeId === node.id && !hoverTarget.isNoOp
    );
    const isBeingDragged = Boolean(
      activeDrag?.kind === 'existing' && activeDrag.nodeIds.includes(node.id)
    );

    const dragIds =
      multiSelectedIds.length > 1 && multiSelectedIds.includes(node.id)
        ? multiSelectedIds
        : [node.id];

    return (
      <div key={node.id} className="select-none relative">
        {isDropTarget && hoverTarget?.position === 'before' && (
          <div
            style={{ left: `${10 + depth * 12}px` }}
            className={`absolute top-0 right-1 h-[2px] z-20 pointer-events-none ${
              hoverTarget.valid ? 'bg-[var(--builder-primary)]' : 'bg-red-500'
            }`}
          />
        )}
        <div
          onClick={(e) => {
            e.stopPropagation();
            handleToggleMultiSelectSibling(node.id, parentNode, e.shiftKey || e.metaKey || e.ctrlKey);
          }}
          onDragOver={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            e.stopPropagation();
            const { position, validation, region } = computeRowDropAndValidate(
              node,
              isRoot,
              regionKind,
              e
            );
            if (validation) {
              e.dataTransfer.dropEffect = validation.valid
                ? activeDrag.kind === 'existing'
                  ? 'move'
                  : 'copy'
                : 'none';
              setHoverTarget({
                targetNodeId: node.id,
                position,
                region,
                valid: validation.valid,
                isNoOp: validation.isNoOp,
                reason: validation.reason,
                label: validation.valid
                  ? position === 'before'
                    ? t('sidebar.navigator.beforeTarget', { name: node.name })
                    : position === 'after'
                    ? t('sidebar.navigator.afterTarget', { name: node.name })
                    : t('sidebar.navigator.insideTarget', { name: node.name })
                  : validation.reason || t('sidebar.navigator.invalidTarget'),
                destinationParentId: validation.destinationParentId,
                destinationIndex:
                  validation.normalizedIndex ?? validation.destinationIndex,
              });
            }
          }}
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null;
            if (related && (e.currentTarget as HTMLElement).contains(related)) return;
            if (hoverTarget?.targetNodeId === node.id) setHoverTarget(null);
          }}
          onDrop={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            e.stopPropagation();
            const { dest, validation } = computeRowDropAndValidate(
              node,
              isRoot,
              regionKind,
              e
            );
            const dragSnapshot = activeDrag;
            endDrag();
            if (!validation || !dest) return;
            if (!validation.valid) {
              if (!validation.isNoOp && validation.reason) {
                onDragRejected?.(validation.reason);
              }
              return;
            }
            if (dragSnapshot.kind === 'existing' && onCommitTreeMove) {
              onCommitTreeMove(dragSnapshot.nodeIds, dest.parent.id, dest.index);
              setMultiSelectedIds([]);
            } else if (dragSnapshot.kind === 'catalog' && onCommitCatalogDrop) {
              onCommitCatalogDrop(dragSnapshot.elementType, dest.parent.id, dest.index);
            } else if (dragSnapshot.kind === 'library-item' && onCommitLibraryDrop) {
              onCommitLibraryDrop(
                dragSnapshot.item,
                dragSnapshot.mode,
                dest.parent.id,
                dest.index
              );
            }
          }}
          title={
            isDropTarget && hoverTarget && !hoverTarget.valid
              ? hoverTarget.reason
              : undefined
          }
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          className={`relative flex items-center justify-between min-h-[36px] py-1 pr-1.5 rounded-md text-xs cursor-pointer transition-colors ${
            isBeingDragged ? 'opacity-45' : ''
          } ${
            isDropTarget &&
            (hoverTarget?.position === 'inside-last' || hoverTarget?.position === 'inside-first')
              ? hoverTarget.valid
                ? 'bg-emerald-50 outline-1 outline-dashed outline-emerald-500'
                : 'bg-red-50 outline-1 outline-dashed outline-red-400'
              : isSelected
              ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)] font-semibold'
              : isMultiSelected
              ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)] font-medium'
              : 'text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-hover)]'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {!isRoot && !node.locked ? (
              <span
                draggable={true}
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData('application/x-indy-node', dragIds.join(','));
                  e.dataTransfer.effectAllowed = 'move';
                  startDrag({
                    kind: 'existing',
                    nodeIds: dragIds,
                    name:
                      dragIds.length > 1
                        ? t('sidebar.navigator.multiElementsName', { count: dragIds.length })
                        : node.name,
                    sourceRegion: regionKind,
                  });
                }}
                onDragEnd={() => endDrag()}
                title={t('sidebar.navigator.dragToReorderTitle')}
                aria-label={t('sidebar.navigator.dragLayerAria', { name: node.name })}
                className="p-0.5 text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing shrink-0 touch-none"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapseNode(node.id);
                }}
                aria-label={
                  isCollapsed
                    ? t('sidebar.navigator.expandAria', { name: node.name })
                    : t('sidebar.navigator.collapseAria', { name: node.name })
                }
                className="p-0.5 text-slate-400 hover:text-slate-700 rounded shrink-0"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="w-4 h-3.5 block shrink-0" />
            )}

            <span className="truncate">{node.name}</span>
            {isDropTarget && hoverTarget && (
              <span
                className={`text-[10px] font-semibold shrink-0 ml-1 ${
                  hoverTarget.valid ? 'text-emerald-700' : 'text-red-600'
                }`}
              >
                {hoverTarget.valid
                  ? hoverTarget.position === 'before'
                    ? t('sidebar.navigator.dropBefore')
                    : hoverTarget.position === 'after'
                    ? t('sidebar.navigator.dropAfter')
                    : t('sidebar.navigator.dropNest')
                  : t('sidebar.navigator.dropBlocked')}
              </span>
            )}
            {(node.type === 'navbar' || node.type === 'nav-menu') && (
              <span className="text-[10px] text-indigo-600 font-semibold shrink-0">
                {t('sidebar.navigator.navBadge')}
              </span>
            )}
            {node.hidden && (
              <span className="text-[10px] text-amber-700 font-medium shrink-0">
                {t('sidebar.navigator.hiddenBadge')}
              </span>
            )}
            {node.locked && (
              <Lock className="w-3 h-3 text-slate-400 shrink-0" />
            )}
            {node.dynamicBinding?.enabled && (
              <span className="text-[10px] text-blue-600 font-mono shrink-0">
                {t('sidebar.navigator.sheetsBadge')}
              </span>
            )}
          </div>

          {!isOverlay && !isRoot && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUpElement(node.id);
                }}
                title={t('sidebar.navigator.moveUpTitle')}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDownElement(node.id);
                }}
                title={t('sidebar.navigator.moveDownTitle')}
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHideElement(node.id);
                }}
                title={
                  node.hidden
                    ? t('sidebar.navigator.showTitle')
                    : t('sidebar.navigator.hideTitle')
                }
                className="p-1 text-slate-400 hover:text-slate-800 rounded"
              >
                {node.hidden ? (
                  <EyeOff className="w-3 h-3 text-amber-600" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
              </button>
            </div>
          )}
        </div>

        {isDropTarget && hoverTarget?.position === 'after' && (
          <div
            style={{ left: `${10 + depth * 12}px` }}
            className={`absolute bottom-0 right-1 h-[2px] z-20 pointer-events-none ${
              hoverTarget.valid ? 'bg-[var(--builder-primary)]' : 'bg-red-500'
            }`}
          />
        )}

        {/* Selected Node Action Bar: Non-drag touch-friendly controls for tablet/mobile & desktop */}
        {isSelected && !isRoot && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-1 mb-2 ml-3 mr-1 p-2 rounded-lg bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] space-y-2"
          >
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => onMoveUpElement(node.id)}
                className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>{t('sidebar.navigator.up')}</span>
              </button>
              <button
                type="button"
                onClick={() => onMoveDownElement(node.id)}
                className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>{t('sidebar.navigator.down')}</span>
              </button>
              {onMoveTopElement && (
                <button
                  type="button"
                  onClick={() => onMoveTopElement(node.id)}
                  title={t('sidebar.navigator.moveTopTitle')}
                  className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                >
                  <ArrowUpToLine className="w-3.5 h-3.5" />
                  <span>{t('sidebar.navigator.topBtn')}</span>
                </button>
              )}
              {onMoveBottomElement && (
                <button
                  type="button"
                  onClick={() => onMoveBottomElement(node.id)}
                  title={t('sidebar.navigator.moveBottomTitle')}
                  className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  <span>{t('sidebar.navigator.bottomBtn')}</span>
                </button>
              )}
              {depth >= 2 && onMoveOutOneLevel && (
                <button
                  type="button"
                  onClick={() => onMoveOutOneLevel(node.id)}
                  title={t('sidebar.navigator.moveOutTitle')}
                  className="min-h-[34px] px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-[11px] font-semibold text-blue-800 hover:bg-blue-100 flex items-center gap-1"
                >
                  <CornerLeftUp className="w-3.5 h-3.5" />
                  <span>{t('sidebar.navigator.outBtn')}</span>
                </button>
              )}
              {onOpenMovePicker && (
                <button
                  type="button"
                  onClick={() => onOpenMovePicker(node.id)}
                  className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                >
                  <Move className="w-3.5 h-3.5" />
                  <span>{t('sidebar.navigator.moveToBtn')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onDuplicateElement(node.id)}
                className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t('sidebar.navigator.duplicateBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleHideElement(node.id)}
                className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                {node.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>
                  {node.hidden ? t('sidebar.navigator.showBtn') : t('sidebar.navigator.hideBtn')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onToggleLockElement(node.id)}
                className="min-h-[34px] px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              >
                {node.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>
                  {node.locked ? t('sidebar.navigator.unlockBtn') : t('sidebar.navigator.lockBtn')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteElement(node.id)}
                className="min-h-[34px] px-2 py-1 bg-white border border-red-200 rounded-md text-[11px] font-medium text-red-600 hover:bg-red-50 flex items-center gap-1 ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('sidebar.navigator.deleteBtn')}</span>
              </button>
            </div>

            {onSetInsertionTarget && (
              <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-200/70">
                <span className="text-[10px] font-semibold text-slate-500 mr-1">
                  {t('sidebar.navigator.insertLabel')}
                </span>
                <button
                  type="button"
                  onClick={() => onSetInsertionTarget(node.id, 'before-selected')}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-semibold text-slate-700"
                >
                  {t('sidebar.navigator.insertBefore')}
                </button>
                <button
                  type="button"
                  onClick={() => onSetInsertionTarget(node.id, 'after-selected')}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-[10px] font-semibold text-slate-700"
                >
                  {t('sidebar.navigator.insertAfter')}
                </button>
                {isContainerElementType(node.type) && !node.locked && (
                  <button
                    type="button"
                    onClick={() => onSetInsertionTarget(node.id, 'into-selected')}
                    className="px-2 py-0.5 rounded bg-white border border-blue-200 hover:bg-blue-50 text-[10px] font-semibold text-blue-700"
                  >
                    {t('sidebar.navigator.insertInside')}
                  </button>
                )}
              </div>
            )}

            {onMoveIntoContainer && availableContainers.length > 1 && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/70">
                <FolderInput className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onMoveIntoContainer(node.id, e.target.value);
                  }}
                  aria-label={t('sidebar.navigator.moveIntoContainerAria')}
                  className="flex-1 text-[11px] px-2 py-1.5 bg-white border border-slate-200 rounded-md text-slate-700"
                >
                  <option value="">{t('sidebar.navigator.moveIntoContainerPlaceholder')}</option>
                  {availableContainers
                    .filter((c) => c.id !== node.id)
                    .map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.allowed}>
                        {'  '.repeat(Math.min(4, c.depth))}
                        {c.name}
                        {!c.allowed ? ` (${c.reason || t('sidebar.navigator.incompatible')})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}

        {hasChildren && !node.hidden && !isCollapsed && (
          <div>
            {node.children!.map((child) =>
              renderTreeItem(child, depth + 1, regionKind, node)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      style={!isOverlay ? { width: `${desktopWidth}px` } : undefined}
      className={`${
        isOverlay ? 'w-full' : 'border-r border-[var(--builder-border)]'
      } h-full bg-[var(--builder-panel-bg)] flex flex-col shrink-0 select-none overflow-hidden z-20`}
    >
      {/* Tab Navigation Strip */}
      <div className="flex items-center border-b border-[var(--builder-border)] bg-[var(--builder-surface-muted)] px-1.5 py-1.5 overflow-x-auto gap-1 shrink-0">
        {(
          [
            { id: 'elements', label: t('sidebar.tabs.elements'), icon: Plus },
            { id: 'navigator', label: t('sidebar.tabs.navigator'), icon: Layers },
            { id: 'pages', label: t('sidebar.tabs.pages'), icon: FileText },
            { id: 'themes', label: t('sidebar.tabs.themes'), icon: Palette },
            { id: 'sheets', label: t('sidebar.tabs.sheets'), icon: Database },
            { id: 'media', label: t('sidebar.tabs.media'), icon: ImageIcon },
            { id: 'code', label: t('sidebar.tabs.code'), icon: Code2 },
            { id: 'releases', label: t('sidebar.tabs.releases'), icon: History },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              className={`min-h-[36px] min-w-[36px] px-2 rounded-md transition-colors flex items-center justify-center gap-1.5 shrink-0 text-xs whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--builder-panel-bg)] text-[var(--builder-primary)] shadow-xs font-semibold'
                  : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-hover)]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {isOverlay && isActive && <span>{tab.label}</span>}
            </button>
          );
        })}

        {isOverlay && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('sidebar.closePanel')}
            className="ml-auto min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-hover)] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab Header Banner */}
      <div className="px-4 py-2.5 border-b border-[var(--builder-border)] flex items-center justify-between bg-[var(--builder-panel-bg)] shrink-0">
        <span className="text-xs font-bold text-[var(--builder-text-primary)] tracking-tight">
          {t(`sidebar.headers.${activeTab}`)}
        </span>
        <span className="text-[11px] text-[var(--builder-text-muted)] font-mono tabular-nums">
          {activeTab === 'elements' && t('sidebar.counts.types', { count: ELEMENT_REGISTRY.length })}
          {activeTab === 'navigator' && (activePage?.name || t('sidebar.counts.noPage'))}
          {activeTab === 'pages' && t('sidebar.counts.pages', { count: site.pages.length })}
          {activeTab === 'media' && t('sidebar.counts.assets', { count: site.mediaAssets.length })}
          {activeTab === 'sheets' &&
            (workspace.connected && workspace.spreadsheetLinked
              ? workspace.spreadsheet.name
              : workspace.isDemoMode
              ? t('sidebar.counts.demoMode')
              : workspace.connectionStatus === 'needs_reauth'
              ? t('sidebar.counts.needsReauth')
              : t('sidebar.counts.notLinked'))}
        </span>
      </div>

      {/* Tab Body */}
      <div
        ref={scrollContainerRef}
        onDragOver={handleSidebarDragOver}
        className="flex-1 overflow-y-auto p-4 pb-12"
      >
        {/* 1. ELEMENTS, TEMPLATES & REUSABLE COMPONENTS LIBRARY */}
        {activeTab === 'elements' && (
          <ElementLibraryPanel
            site={site}
            activePage={activePage}
            selectedNode={selectedNode}
            insertionPlacement={insertionPlacement}
            onChangeInsertionPlacement={onChangeInsertionPlacement}
            onInsertElementNode={onAddElementToPage}
            onToggleFavoriteElement={onToggleFavoriteElement}
            onDeleteLibraryItem={onDeleteLibraryItem}
            onDuplicateLibraryItem={onDuplicateLibraryItem}
            onSyncLinkedInstances={onSyncLinkedInstances}
            onSaveSelectionAsLibrary={onSaveSelectionAsLibrary}
          />
        )}

        {/* 2. NAVIGATOR (LAYERS ACROSS HEADER / PAGE / FOOTER) */}
        {activeTab === 'navigator' && (
          <div className="space-y-3">
            {activePage ? (
              <>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {t('sidebar.navigator.hint')}
                </p>

                {multiSelectedIds.length > 1 && (
                  <div className="p-2 rounded-lg border border-indigo-200 bg-indigo-50/70 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                    <span className="font-semibold text-indigo-900">
                      {t('sidebar.navigator.siblingsSelected', { count: multiSelectedIds.length })}
                    </span>
                    <div className="flex items-center gap-1">
                      {onCommitTreeMove && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const ctx = getRegionContextForNode(site, activePage, multiSelectedIds[0]);
                              if (!ctx) return;
                              const firstLoc = findNodeParentAndIndex(ctx.root, multiSelectedIds[0]);
                              if (!firstLoc?.parent || firstLoc.index <= 0) return;
                              onCommitTreeMove(multiSelectedIds, firstLoc.parent.id, firstLoc.index - 1);
                            }}
                            className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-800 font-semibold"
                          >
                            {t('sidebar.navigator.up')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const ctx = getRegionContextForNode(site, activePage, multiSelectedIds[multiSelectedIds.length - 1]);
                              if (!ctx) return;
                              const lastLoc = findNodeParentAndIndex(ctx.root, multiSelectedIds[multiSelectedIds.length - 1]);
                              if (!lastLoc?.parent) return;
                              onCommitTreeMove(multiSelectedIds, lastLoc.parent.id, lastLoc.index + 2);
                            }}
                            className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-800 font-semibold"
                          >
                            {t('sidebar.navigator.down')}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setMultiSelectedIds([])}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-medium"
                      >
                        {t('sidebar.navigator.clear')}
                      </button>
                    </div>
                  </div>
                )}

                {([
                  { key: 'header' as const, label: t('sidebar.navigator.header'), resolved: headerSlot },
                ]).map(({ key, label, resolved }) => {
                  const def = resolved.definition;
                  const visibleOnDevice = isRegionVisibleOnDevice(
                    resolved.responsiveVisibility,
                    editorViewportMode
                  );
                  const statusParts: string[] = [
                    resolved.mode === 'global'
                      ? t('sidebar.navigator.global')
                      : resolved.mode === 'local'
                      ? t('sidebar.navigator.local')
                      : t('sidebar.navigator.none'),
                  ];
                  if (resolved.mode === 'global' && !resolved.siteGlobalEnabled) {
                    statusParts.push(t('sidebar.navigator.disabledSiteWide'));
                  } else if (resolved.mode !== 'none' && !resolved.pageEnabled) {
                    statusParts.push(t('sidebar.navigator.disabledOnPage'));
                  }
                  if (resolved.effectiveEnabled && !visibleOnDevice) {
                    statusParts.push(
                      t('sidebar.navigator.hiddenOnDevice', {
                        device: t(`pagesPanel.settings.breakpoints.${editorViewportMode}`),
                      })
                    );
                  }

                  return (
                    <div
                      key={key}
                      className={`border rounded-lg p-2 space-y-1.5 ${
                        resolved.mode === 'none'
                          ? 'border-dashed border-slate-300 bg-slate-50/70'
                          : resolved.effectiveEnabled
                          ? 'border-indigo-200 bg-indigo-50/20'
                          : 'border-amber-200 bg-amber-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold text-slate-900 truncate">
                            {label} {def ? `· ${def.name}` : ''}
                          </div>
                          <div className="text-[10px] font-medium text-slate-500 truncate">
                            {statusParts.join(' · ')}
                          </div>
                        </div>

                        {resolved.mode === 'none' ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onSetSlotMode(key, 'global')}
                              className="min-h-[30px] px-2 py-1 rounded bg-slate-900 text-white text-[10px] font-semibold"
                            >
                              {t('sidebar.navigator.useGlobal')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSetSlotMode(key, 'local')}
                              className="min-h-[30px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 text-[10px] font-semibold"
                            >
                              {t('sidebar.navigator.local')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleRegionPageEnabled(key)}
                            className={`min-h-[30px] px-2.5 py-1 rounded text-[10px] font-semibold shrink-0 transition-colors ${
                              resolved.pageEnabled
                                ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            {resolved.pageEnabled
                              ? t('sidebar.navigator.disable')
                              : t('sidebar.navigator.enable')}
                          </button>
                        )}
                      </div>

                      {resolved.mode === 'global' && !resolved.siteGlobalEnabled && def && (
                        <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-amber-900 border-t border-amber-200/70">
                          <span>{t('sidebar.navigator.globalOffNotice', { region: label })}</span>
                          <button
                            type="button"
                            onClick={() => onToggleGlobalRegionEnabled(key, def.componentId)}
                            className="font-semibold underline shrink-0"
                          >
                            {t('sidebar.navigator.enableSiteWide')}
                          </button>
                        </div>
                      )}

                      {def && (
                        <>
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => onSelectElement(def.rootElement.id)}
                              className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t('sidebar.navigator.stylePreset')}
                            </button>
                            {resolved.mode === 'global' && (
                              <button
                                type="button"
                                onClick={() => onCopyGlobalToLocal(key)}
                                className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                              >
                                {t('sidebar.navigator.makeLocal')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSaveSlotAsTemplate(key, def.rootElement)}
                              className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t('sidebar.navigator.saveTemplate')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSetSlotMode(key, 'none')}
                              className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-500 hover:text-red-600 ml-auto"
                            >
                              {t('sidebar.navigator.setNone')}
                            </button>
                          </div>

                          <div className={resolved.effectiveEnabled ? '' : 'opacity-65'}>
                            {renderTreeItem(def.rootElement, 0, 'header')}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                <div className="border border-slate-200 rounded-lg p-1.5 bg-white">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    {t('sidebar.navigator.pageContentTitle', { name: activePage.name })}
                  </div>
                  {renderTreeItem(activePage.rootElement, 0, 'page')}
                </div>

                {([
                  { key: 'footer' as const, label: t('sidebar.navigator.footer'), resolved: footerSlot },
                ]).map(({ key, label, resolved }) => {
                  const def = resolved.definition;
                  const visibleOnDevice = isRegionVisibleOnDevice(
                    resolved.responsiveVisibility,
                    editorViewportMode
                  );
                  const statusParts: string[] = [
                    resolved.mode === 'global'
                      ? t('sidebar.navigator.global')
                      : resolved.mode === 'local'
                      ? t('sidebar.navigator.local')
                      : t('sidebar.navigator.none'),
                  ];
                  if (resolved.mode === 'global' && !resolved.siteGlobalEnabled) {
                    statusParts.push(t('sidebar.navigator.disabledSiteWide'));
                  } else if (resolved.mode !== 'none' && !resolved.pageEnabled) {
                    statusParts.push(t('sidebar.navigator.disabledOnPage'));
                  }
                  if (resolved.effectiveEnabled && !visibleOnDevice) {
                    statusParts.push(
                      t('sidebar.navigator.hiddenOnDevice', {
                        device: t(`pagesPanel.settings.breakpoints.${editorViewportMode}`),
                      })
                    );
                  }

                  return (
                    <div
                      key={key}
                      className={`border rounded-lg p-2 space-y-1.5 ${
                        resolved.mode === 'none'
                          ? 'border-dashed border-slate-300 bg-slate-50/70'
                          : resolved.effectiveEnabled
                          ? 'border-indigo-200 bg-indigo-50/20'
                          : 'border-amber-200 bg-amber-50/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-bold text-slate-900 truncate">
                            {label} {def ? `· ${def.name}` : ''}
                          </div>
                          <div className="text-[10px] font-medium text-slate-500 truncate">
                            {statusParts.join(' · ')}
                          </div>
                        </div>

                        {resolved.mode === 'none' ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onSetSlotMode(key, 'global')}
                              className="min-h-[30px] px-2 py-1 rounded bg-slate-900 text-white text-[10px] font-semibold"
                            >
                              {t('sidebar.navigator.useGlobal')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSetSlotMode(key, 'local')}
                              className="min-h-[30px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 text-[10px] font-semibold"
                            >
                              {t('sidebar.navigator.local')}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleRegionPageEnabled(key)}
                            className={`min-h-[30px] px-2.5 py-1 rounded text-[10px] font-semibold shrink-0 transition-colors ${
                              resolved.pageEnabled
                                ? 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            {resolved.pageEnabled
                              ? t('sidebar.navigator.disable')
                              : t('sidebar.navigator.enable')}
                          </button>
                        )}
                      </div>

                      {resolved.mode === 'global' && !resolved.siteGlobalEnabled && def && (
                        <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-amber-900 border-t border-amber-200/70">
                          <span>{t('sidebar.navigator.globalOffNotice', { region: label })}</span>
                          <button
                            type="button"
                            onClick={() => onToggleGlobalRegionEnabled(key, def.componentId)}
                            className="font-semibold underline shrink-0"
                          >
                            {t('sidebar.navigator.enableSiteWide')}
                          </button>
                        </div>
                      )}

                      {def && (
                        <>
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => onSelectElement(def.rootElement.id)}
                              className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t('sidebar.navigator.stylePreset')}
                            </button>
                            {resolved.mode === 'global' && (
                              <button
                                type="button"
                                onClick={() => onCopyGlobalToLocal(key)}
                                className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                              >
                                {t('sidebar.navigator.makeLocal')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSaveSlotAsTemplate(key, def.rootElement)}
                              className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {t('sidebar.navigator.saveTemplate')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onSetSlotMode(key, 'none')}
                              className="min-h-[28px] px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-medium text-slate-500 hover:text-red-600 ml-auto"
                            >
                              {t('sidebar.navigator.setNone')}
                            </button>
                          </div>

                          <div className={resolved.effectiveEnabled ? '' : 'opacity-65'}>
                            {renderTreeItem(def.rootElement, 0, 'footer')}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="p-4 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-center text-xs text-slate-500">
                {t('sidebar.navigator.createHomeHint')}
              </div>
            )}
          </div>
        )}

        {/* 3. MULTI-PAGE MANAGEMENT & SITE LAYOUT */}
        {activeTab === 'pages' && (
          <PageManagementPanel
            site={site}
            activePage={activePage}
            workspace={workspace}
            isDriveSyncing={isDriveSyncing}
            driveConflictRevision={driveConflictRevision}
            onSelectPage={onSelectPage}
            onOpenCreateModal={onOpenCreatePageModal}
            onOpenDeleteModal={onOpenDeletePageModal}
            onDuplicatePage={onDuplicatePage}
            onRenamePage={onRenamePage}
            onSetHomePage={onSetHomePage}
            onMovePageOrder={onMovePageOrder}
            onReorderPageDrop={onReorderPageDrop}
            onChangePageParent={onChangePageParent}
            onTogglePageNavVisibility={onTogglePageNavVisibility}
            onUpdatePageStatus={onUpdatePageStatus}
            onSavePageSettings={onSavePageSettings}
            onUpdateSiteMeta={onUpdateSiteMeta}
            onRequestDriveSync={onRequestDriveSync}
            onRequestDriveLoad={onRequestDriveLoad}
            onOpenGoogleSetup={onOpenGoogleSetup}
            openLayoutForPageId={openLayoutForPageId}
            onClearOpenLayoutTrigger={onClearOpenLayoutTrigger}
            onUpdatePageLayoutSlot={onUpdatePageLayoutSlot}
            onSelectGlobalComponent={onSelectGlobalComponent}
            onCreateGlobalVariant={onCreateGlobalVariant}
            onRenameGlobalVariant={onRenameGlobalVariant}
            onDeleteGlobalVariant={onDeleteGlobalVariant}
            onToggleGlobalRegionEnabled={onToggleGlobalRegionEnabled}
            onToggleRegionPageEnabled={onToggleRegionPageEnabled}
            onUpdateSlotVisibility={onUpdateSlotVisibility}
            onSaveSlotAsTemplate={onSaveSlotAsTemplate}
          />
        )}

        {/* 4. THEMES & GLOBAL DESIGN TOKENS */}
        {activeTab === 'themes' && (
          <ThemePanel
            site={site}
            effectiveTheme={effectiveTheme}
            editorViewportMode={editorViewportMode}
            onSelectPresetTheme={onApplyTheme}
            onUpdateColorOverride={onUpdateThemeColorOverride}
            onResetColorOverride={onResetThemeColorOverride}
            onResetAllColorOverrides={onResetAllThemeOverrides}
            onSaveCustomTheme={onSaveCustomTheme}
            onDeleteCustomTheme={onDeleteCustomTheme}
            onViewOnCanvas={onClose}
          />
        )}

        {/* 5. GOOGLE SHEETS DATA MANAGER */}
        {activeTab === 'sheets' && (
          <div className="space-y-4">
            {onOpenCmsWorkspace && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-blue-950">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>{t('sidebar.sheets.cmsTitle')}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold font-mono">
                    {t('sidebar.sheets.optionABadge')}
                  </span>
                </div>
                <p className="text-[11px] text-blue-900 leading-relaxed">
                  {t('sidebar.sheets.cmsDesc')}
                </p>
                <button
                  type="button"
                  onClick={onOpenCmsWorkspace}
                  className="w-full min-h-[36px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{t('sidebar.sheets.openCmsBtn')}</span>
                </button>
              </div>
            )}

            {workspace.connected && workspace.spreadsheetLinked ? (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg text-xs text-slate-900 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold min-w-0">
                    <Database className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">{workspace.spreadsheet.name}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                    {t('sidebar.sheets.syncedBadge')}
                  </span>
                </div>
                {workspace.spreadsheet.url && (
                  <a
                    href={workspace.spreadsheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-blue-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>{t('sidebar.sheets.openInSheets')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {onRefreshFromSheets && (
                    <button
                      type="button"
                      disabled={workspace.syncStatus === 'syncing'}
                      onClick={() => onRefreshFromSheets()}
                      className="min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-md text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          workspace.syncStatus === 'syncing' ? 'animate-spin' : ''
                        }`}
                      />
                      <span>{t('sidebar.sheets.refreshBtn')}</span>
                    </button>
                  )}
                  {onOpenSheetsEditor && (
                    <button
                      type="button"
                      onClick={onOpenSheetsEditor}
                      className="min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold"
                    >
                      {t('sidebar.sheets.openSheetsEditor')}
                    </button>
                  )}
                  {onOpenGoogleSetup && (
                    <button
                      type="button"
                      onClick={onOpenGoogleSetup}
                      className="min-h-[38px] px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-semibold"
                    >
                      {t('sidebar.sheets.settingsBtn')}
                    </button>
                  )}
                </div>
              </div>
            ) : workspace.connectionStatus === 'needs_reauth' ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{t('sidebar.sheets.sessionExpired')}</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  {t('sidebar.sheets.sessionExpiredDesc')}{' '}
                  <strong>{workspace.spreadsheet.name || t('sidebar.sheets.yourSpreadsheet')}</strong>.
                </p>
                <div className="flex flex-wrap gap-2">
                  {onConnectGoogle && (
                    <button
                      type="button"
                      onClick={() => onConnectGoogle(false)}
                      className="min-h-[38px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold"
                    >
                      {t('sidebar.sheets.reconnectGoogle')}
                    </button>
                  )}
                  {onOpenGoogleSetup && (
                    <button
                      type="button"
                      onClick={onOpenGoogleSetup}
                      className="min-h-[38px] px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-md text-xs font-semibold"
                    >
                      {t('sidebar.sheets.workspaceSetup')}
                    </button>
                  )}
                </div>
              </div>
            ) : workspace.connected && !workspace.spreadsheetLinked ? (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-950 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <FolderOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{t('sidebar.sheets.noSpreadsheetLinked')}</span>
                </div>
                <p className="text-[11px] text-blue-900 leading-relaxed">
                  {t('sidebar.sheets.signedInAs')} <strong>{workspace.userEmail}</strong>.{' '}
                  {t('sidebar.sheets.pickSpreadsheetDesc')}
                </p>
                {onOpenGoogleSetup && (
                  <button
                    type="button"
                    onClick={onOpenGoogleSetup}
                    className="min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold"
                  >
                    {t('sidebar.sheets.chooseCreateSpreadsheet')}
                  </button>
                )}
              </div>
            ) : workspace.isDemoMode ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Database className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>{t('sidebar.sheets.demoModeTitle')}</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  {t('sidebar.sheets.demoModeDesc')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {onOpenGoogleSetup && (
                    <button
                      type="button"
                      onClick={onOpenGoogleSetup}
                      className="min-h-[38px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold"
                    >
                      {t('sidebar.sheets.connectGoogle')}
                    </button>
                  )}
                  {onOpenSheetsEditor && (
                    <button
                      type="button"
                      onClick={onOpenSheetsEditor}
                      className="min-h-[38px] px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-md text-xs font-semibold"
                    >
                      {t('sidebar.sheets.editDemoRows')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{t('sidebar.sheets.notConnectedTitle')}</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('sidebar.sheets.notConnectedDesc')}
                </p>
                {onOpenGoogleSetup && (
                  <button
                    type="button"
                    onClick={onOpenGoogleSetup}
                    className="min-h-[40px] w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold"
                  >
                    {t('sidebar.sheets.connectWorkspace')}
                  </button>
                )}
              </div>
            )}

            {workspace.spreadsheet.tabs.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                  {workspace.spreadsheet.tabs.map((tab) => (
                    <button
                      key={tab.name}
                      type="button"
                      onClick={() => setActiveSheetsTab(tab.name)}
                      className={`min-h-[32px] text-[11px] px-2.5 py-1 rounded font-mono transition-colors tabular-nums ${
                        activeSheetsTab === tab.name
                          ? 'bg-blue-600 text-white font-medium'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.name} ({tab.rows.length})
                    </button>
                  ))}
                </div>

                {(() => {
                  const tab =
                    workspace.spreadsheet.tabs.find((tabItem) => tabItem.name === activeSheetsTab) ||
                    workspace.spreadsheet.tabs[0];
                  if (!tab) return null;

                  return (
                    <div className="space-y-2">
                      <div className="text-[11px] text-slate-500">{tab.description}</div>

                      {tab.rows.length === 0 ? (
                        <div className="p-4 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-center text-[11px] text-slate-500">
                          {t('sidebar.sheets.zeroRowsIn')}{' '}
                          <span className="font-mono font-semibold">{tab.name}</span>.
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                          <table className="w-full text-[11px] text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 font-mono text-slate-500">
                              <tr>
                                {tab.columns.slice(0, 3).map((col) => (
                                  <th key={col} className="p-2 font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                              {tab.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  {tab.columns.slice(0, 3).map((col) => (
                                    <td key={col} className="p-2 truncate max-w-[100px]">
                                      {String(row[col] ?? '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* 6. DRIVE ASSETS & BRAND STUDIO */}
        {activeTab === 'media' && (
          <AssetLibraryPanel
            site={site}
            workspace={workspace}
            selectedNode={selectedNode}
            onAddAsset={onAddAsset}
            onUpdateAsset={onUpdateAsset}
            onDeleteAsset={onDeleteAsset}
            onApplyAssetToSelection={onApplyAssetToSelection}
          />
        )}

        {/* 7. CUSTOM CODE HUB */}
        {activeTab === 'code' && (() => {
          const cssValidation = validateCustomCss(codeCssDraft);
          return (
            <div className="space-y-4">
              {editorViewportMode === 'mobile' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                  <span className="font-semibold block">{t('sidebar.code.mobileNoticeTitle')}</span>
                  <span className="text-[11px] text-blue-800">
                    {t('sidebar.code.mobileNoticeDesc')}
                  </span>
                </div>
              )}

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">{t('sidebar.code.isolatedTitle')}</span>
                  <span className="text-[11px] text-amber-800 leading-snug block">
                    {t('sidebar.code.isolatedDescPrefix')}
                    <code className="font-mono">.portfolio-site-surface</code>
                    {t('sidebar.code.isolatedDescSuffix')}
                  </span>
                </div>
              </div>

              <div className="flex gap-1 border-b border-slate-200 pb-2">
                {(['site', 'page', 'element'] as const).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    disabled={sc === 'element' && !selectedNode}
                    onClick={() => setCustomCodeScope(sc)}
                    className={`min-h-[34px] text-xs px-2.5 py-1 rounded transition-colors disabled:opacity-40 ${
                      customCodeScope === sc
                        ? 'bg-slate-900 text-white font-medium'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t('sidebar.code.scopeBtn', { scope: t(`sidebar.code.scopes.${sc}`) })}
                  </button>
                ))}
              </div>

              {customCodeScope !== 'element' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('sidebar.code.themeBehavior', {
                      scope: t(`sidebar.code.scopes.${customCodeScope}`),
                    })}
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-md">
                    {(
                      [
                        { id: 'follow-theme', label: t('sidebar.code.followTheme') },
                        { id: 'independent', label: t('sidebar.code.separateFromTheme') },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCodeThemeModeDraft(m.id)}
                        className={`min-h-[34px] px-2 rounded text-[11px] font-semibold transition-colors ${
                          codeThemeModeDraft === m.id
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t('sidebar.code.customCssLabel', {
                    scope: t(`sidebar.code.scopes.${customCodeScope}`),
                  })}
                </label>
                <textarea
                  rows={6}
                  value={codeCssDraft}
                  onChange={(e) => setCodeCssDraft(e.target.value)}
                  placeholder="/* .parent-section .child-card { border-color: var(--color-primary); } */"
                  className="w-full font-mono text-xs p-2.5 border border-slate-200 rounded-md bg-slate-950 text-slate-100 focus:outline-none"
                />

                <div className="flex flex-wrap gap-1">
                  {[
                    '--color-primary',
                    '--color-background',
                    '--color-surface',
                    '--color-heading',
                    '--color-text',
                    '--font-display',
                    '--font-body',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        setCodeCssDraft((prev) =>
                          prev ? `${prev}\n/* var(${v}) */` : `/* var(${v}) */`
                        )
                      }
                      className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-blue-50 text-[10px] font-mono text-slate-700"
                    >
                      {v}
                    </button>
                  ))}
                </div>

                {!cssValidation.valid && (
                  <div className="p-2 rounded bg-red-50 border border-red-200 text-[11px] text-red-700 space-y-0.5">
                    {cssValidation.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                )}
                {cssValidation.valid && cssValidation.warnings.length > 0 && (
                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-800 space-y-0.5">
                    {cssValidation.warnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </div>
                )}
              </div>

              {customCodeScope !== 'element' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 block">
                    {t('sidebar.code.customJsLabel', {
                      scope: t(`sidebar.code.scopes.${customCodeScope}`),
                    })}
                  </label>
                  <textarea
                    rows={4}
                    value={codeJsDraft}
                    onChange={(e) => setCodeJsDraft(e.target.value)}
                    placeholder={t('sidebar.code.customJsPlaceholder')}
                    className="w-full font-mono text-xs p-2.5 border border-slate-200 rounded-md bg-slate-950 text-slate-100 focus:outline-none"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  onUpdateCustomCode(
                    customCodeScope,
                    codeCssDraft,
                    codeJsDraft,
                    customCodeScope !== 'element' ? codeThemeModeDraft : undefined
                  )
                }
                className="w-full min-h-[40px] py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {t('sidebar.code.saveDraftBtn')}
              </button>
            </div>
          );
        })()}

        {/* 8. RELEASES & VERSION MANAGEMENT */}
        {activeTab === 'releases' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {t('sidebar.releases.desc')}
              </p>
            </div>

            {/* Sub-tab view switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setReleasesTabMode('active')}
                className={`flex-1 py-1.5 rounded-md transition-all ${
                  releasesTabMode === 'active'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('sidebar.releases.activeArchivedTab', 'Releases')} ({site.releases.filter(r => r.status !== 'Deleted' && r.status !== 'deleted').length})
              </button>
              <button
                type="button"
                onClick={() => setReleasesTabMode('trash')}
                className={`flex-1 py-1.5 rounded-md transition-all ${
                  releasesTabMode === 'trash'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('sidebar.releases.trashTab', 'Trash')} ({site.releases.filter(r => r.status === 'Deleted' || r.status === 'deleted').length})
              </button>
            </div>

            <div className="space-y-2.5">
              {site.releases
                .filter((rel) => {
                  const isDeleted = rel.status === 'Deleted' || rel.status === 'deleted';
                  return releasesTabMode === 'trash' ? isDeleted : !isDeleted;
                })
                .map((rel) => {
                  const isActive = rel.version === site.activeReleaseVersion || rel.is_active;
                  const versionIdKey = rel.version_id || rel.version;
                  const releaseName = rel.release_name || rel.version;
                  const releaseDesc = rel.description || rel.commitMessage;

                  return (
                    <div
                      key={versionIdKey}
                      className={`p-3 rounded-lg border transition-all ${
                        isActive ? 'border-emerald-500 bg-emerald-50/25' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono font-bold text-xs text-slate-900 shrink-0">
                            {rel.version}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 truncate" title={releaseName}>
                            {releaseName}
                          </span>
                        </div>
                        {isActive ? (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                            {t('sidebar.releases.activeBuild')}
                          </span>
                        ) : releasesTabMode === 'trash' ? (
                          <span className="text-[11px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full shrink-0">
                            Deleted
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                            Archived
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 mb-1.5 line-clamp-2">{releaseDesc}</p>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-2.5">
                        <span>{rel.timestamp || rel.created_at}</span>
                        <span>{rel.artifactSize || '—'}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
                        <button
                          type="button"
                          onClick={() => onPreviewRelease(rel.version)}
                          className="flex-1 min-h-[30px] px-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          {t('sidebar.releases.preview')}
                        </button>

                        {releasesTabMode === 'active' && !isActive && (
                          <button
                            type="button"
                            onClick={() => onRollbackRelease(rel.version)}
                            className="flex-1 min-h-[30px] px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-blue-500" />
                            {t('sidebar.releases.rollback')}
                          </button>
                        )}

                        {releasesTabMode === 'active' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const newName = window.prompt(t('sidebar.releases.rename', 'Rename release:'), releaseName);
                                if (newName !== null) onRenameRelease(versionIdKey, newName);
                              }}
                              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded transition-colors"
                              title={t('sidebar.releases.rename', 'Rename')}
                            >
                              {t('sidebar.releases.rename', 'Rename')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const newDesc = window.prompt(t('sidebar.releases.editDescription', 'Edit description:'), releaseDesc);
                                if (newDesc !== null) onEditReleaseDescription(versionIdKey, newDesc);
                              }}
                              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded transition-colors"
                              title={t('sidebar.releases.editDescription', 'Edit')}
                            >
                              {t('sidebar.releases.editDescription', 'Edit')}
                            </button>
                            {!isActive && (
                              <button
                                type="button"
                                onClick={() => onDeleteRelease(versionIdKey)}
                                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded transition-colors"
                                title={t('sidebar.releases.delete', 'Delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}

                        {releasesTabMode === 'trash' && (
                          <button
                            type="button"
                            onClick={() => onRestoreRelease(versionIdKey)}
                            className="w-full min-h-[30px] px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded transition-colors flex items-center justify-center gap-1"
                          >
                            {t('sidebar.releases.restore', 'Restore')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
