import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DeviceMode,
  ElementNode,
  GoogleWorkspaceState,
  InsertionPlacement,
  LibraryItem,
  PageDocument,
  SiteDocument,
} from '../../types/builder';
import { BREAKPOINTS } from '../../config/breakpoints';
import { ResolvedEffectiveTheme, portfolioThemeRootStyle } from '../../services/themeService';
import { compilePreviewPageCss } from '../../services/cssCompiler';
import {
  resolvePageSlotComponent,
  isRegionVisibleOnDevice,
} from '../../services/componentLibraryService';
import { resolvePageFullPath, sortPagesForTree } from '../../services/pageService';
import { isContainerElementType } from '../../data/elementRegistry';
import {
  findNodeParentAndIndex,
  getRegionContextForNode,
  validateTreeInsert,
  validateTreeMove,
} from '../../services/treeCommandService';
import { useBuilderDrag } from '../../contexts/BuilderDragContext';
import { ElementRenderer } from './ElementRenderer';
import { CmsSurfaceProvider } from './CmsDynamicWidgets';
import { BuillyLogo } from '../common/BuillyLogo';
import { BuillyMadeWithBadge } from '../common/BuillyMadeWithBadge';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronRight,
  Layers,
  Monitor,
  Tablet,
  Smartphone,
  Maximize2,
  Sliders,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  AlertTriangle,
  Home,
  FilePlus2,
  Globe,
  Copy,
  Settings2,
  Move,
} from 'lucide-react';

interface CanvasProps {
  site: SiteDocument;
  page: PageDocument | null;
  effectiveTheme: ResolvedEffectiveTheme;
  deviceMode: DeviceMode; // Simulated website preview breakpoint
  editorViewportMode: DeviceMode; // Actual physical editor viewport layout
  isPreviewMode: boolean;
  selectedId: string | null;
  selectedNode: ElementNode | null;
  hoveredId: string | null;
  workspace: GoogleWorkspaceState;
  reduceMotionPreview?: boolean;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  onToggleReduceMotion?: () => void;
  onSetDeviceMode: (mode: DeviceMode) => void;
  onSelectElement: (id: string | null) => void;
  onHoverElement: (id: string | null) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onMoveUpElement: (id: string) => void;
  onMoveDownElement: (id: string) => void;
  onAddChildElement: (parentId: string) => void;
  onUpdateTextContent: (id: string, text: string) => void;
  onNavigatePage: (slug: string) => void;
  onDropCatalogItem?: (catalogType: string, targetContainerId: string) => void;
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
  onMoveOutOneLevel?: (nodeId: string) => void;
  onOpenProperties?: () => void;
  onOpenAddElements?: () => void;
  onOpenCreateHomePage?: () => void;
  onCopyGlobalToLocal?: (slot: 'header' | 'footer') => void;
  onOpenPageLayoutSettings?: () => void;
  onSubmitForm?: (
    formId: string,
    values: Record<string, any>,
    sourcePage?: string
  ) => Promise<boolean | void> | boolean | void;
}

export const Canvas: React.FC<CanvasProps> = ({
  site,
  page,
  effectiveTheme,
  deviceMode,
  editorViewportMode,
  isPreviewMode,
  selectedId,
  selectedNode,
  hoveredId,
  workspace,
  reduceMotionPreview = false,
  isFocusMode = false,
  onToggleFocusMode,
  onToggleReduceMotion,
  onSetDeviceMode,
  onSelectElement,
  onHoverElement,
  onDeleteElement,
  onDuplicateElement,
  onMoveUpElement,
  onMoveDownElement,
  onAddChildElement,
  onUpdateTextContent,
  onNavigatePage,
  onDropCatalogItem,
  onCommitTreeMove,
  onCommitCatalogDrop,
  onCommitLibraryDrop,
  onDragRejected,
  onOpenMovePicker,
  onSetInsertionTarget,
  onMoveOutOneLevel,
  onOpenProperties,
  onOpenAddElements,
  onOpenCreateHomePage,
  onCopyGlobalToLocal,
  onOpenPageLayoutSettings,
  onSubmitForm,
}) => {
  const { t } = useTranslation();
  const { activeDrag, endDrag } = useBuilderDrag();
  const [hoverCrumbId, setHoverCrumbId] = useState<string | null>(null);
  const [manualZoom, setManualZoom] = useState<number>(100);
  const [fitToScreen, setFitToScreen] = useState<boolean>(true);
  const [availableWidth, setAvailableWidth] = useState<number>(1200);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState<boolean>(false);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const handleSurfaceDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!activeDrag || !surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    const edgeThreshold = 64;
    if (e.clientY < rect.top + edgeThreshold) {
      surfaceRef.current.scrollTop -= 14;
    } else if (e.clientY > rect.bottom - edgeThreshold) {
      surfaceRef.current.scrollTop += 14;
    }
  };

  const handleBreadcrumbDrop = (targetAncestorId: string, e: React.DragEvent) => {
    if (!activeDrag || !page) return;
    e.preventDefault();
    e.stopPropagation();
    setHoverCrumbId(null);
    const dragSnapshot = activeDrag;
    endDrag();

    const ctx = getRegionContextForNode(site, page, targetAncestorId);
    if (!ctx) return;
    const loc = findNodeParentAndIndex(ctx.root, targetAncestorId);
    const destIdx = loc?.node.children?.length || 0;

    if (dragSnapshot.kind === 'existing') {
      const validation = validateTreeMove(site, page, {
        nodeIds: dragSnapshot.nodeIds,
        destinationParentId: targetAncestorId,
        destinationIndex: destIdx,
      });
      if (!validation.valid) {
        if (!validation.isNoOp && validation.reason) onDragRejected?.(validation.reason);
        return;
      }
      onCommitTreeMove?.(dragSnapshot.nodeIds, targetAncestorId, destIdx);
    } else if (dragSnapshot.kind === 'catalog') {
      const validation = validateTreeInsert(site, page, {
        elementType: dragSnapshot.elementType,
        destinationParentId: targetAncestorId,
        destinationIndex: destIdx,
      });
      if (!validation.valid) {
        if (validation.reason) onDragRejected?.(validation.reason);
        return;
      }
      onCommitCatalogDrop?.(dragSnapshot.elementType, targetAncestorId, destIdx);
    } else if (dragSnapshot.kind === 'library-item') {
      const validation = validateTreeInsert(site, page, {
        elementType: dragSnapshot.item.rootNode?.type || 'container',
        destinationParentId: targetAncestorId,
        destinationIndex: destIdx,
        sourceItem: dragSnapshot.item,
      });
      if (!validation.valid) {
        if (validation.reason) onDragRejected?.(validation.reason);
        return;
      }
      onCommitLibraryDrop?.(dragSnapshot.item, dragSnapshot.mode, targetAncestorId, destIdx);
    }
  };

  // Measure available canvas surface width so wider website breakpoints fit cleanly
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const updateSize = () => {
      setAvailableWidth(el.clientWidth);
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Target simulated website width
  const targetPreviewWidth = BREAKPOINTS[deviceMode].previewWidth;
  const horizontalPad = editorViewportMode === 'mobile' ? 24 : 48;
  const usableWidth = Math.max(240, availableWidth - horizontalPad);

  const computedScale = fitToScreen
    ? Math.min(1, usableWidth / targetPreviewWidth)
    : manualZoom / 100;

  const effectivePercent = Math.round(computedScale * 100);

  // Detect inner horizontal overflow within simulated website frame
  useEffect(() => {
    const frameEl = frameRef.current;
    if (!frameEl) return;
    const checkOverflow = () => {
      setHasHorizontalOverflow(frameEl.scrollWidth > frameEl.clientWidth + 4);
    };
    const t = setTimeout(checkOverflow, 120);
    return () => clearTimeout(t);
  }, [page, deviceMode, effectivePercent]);

  const headerSlot = useMemo(
    () => (page ? resolvePageSlotComponent(page, site, 'header') : null),
    [page, site]
  );
  const footerSlot = useMemo(
    () => (page ? resolvePageSlotComponent(page, site, 'footer') : null),
    [page, site]
  );
  const hasVisibleFooter = Boolean(
    footerSlot?.component && isRegionVisibleOnDevice(footerSlot.responsiveVisibility, deviceMode)
  );

  const sitePagesNav = useMemo(
    () =>
      sortPagesForTree(site.pages).map((p) => ({
        id: p.id,
        name: p.navigation?.label || p.name,
        fullPath: resolvePageFullPath(p, site.pages),
        navVisible: p.navigation?.visible !== false && p.status !== 'archived' && p.status !== 'unpublished',
        parentPageId: p.parentPageId || null,
      })),
    [site.pages]
  );
  const activePagePath = useMemo(
    () => (page ? resolvePageFullPath(page, site.pages) : '/'),
    [page, site.pages]
  );

  // Compute breadcrumbs for selected element across Header, Page Root, or Footer
  const breadcrumbs: { id: string; name: string }[] = [];
  if (selectedId && page) {
    const findPath = (node: ElementNode, currentPath: { id: string; name: string }[]): boolean => {
      currentPath.push({ id: node.id, name: node.name });
      if (node.id === selectedId) return true;
      if (node.children) {
        for (const child of node.children) {
          if (findPath(child, currentPath)) return true;
        }
      }
      currentPath.pop();
      return false;
    };
    if (headerSlot?.component && findPath(headerSlot.component.rootElement, breadcrumbs)) {
      // matched inside header
    } else if (findPath(page.rootElement, breadcrumbs)) {
      // matched inside page
    } else if (footerSlot?.component) {
      findPath(footerSlot.component.rootElement, breadcrumbs);
    }
  }

  const isSelectedContainer = Boolean(selectedNode && isContainerElementType(selectedNode.type));

  const isRootSelected = Boolean(
    selectedNode &&
      ((page && selectedNode.id === page.rootElement.id) ||
        (headerSlot?.component && selectedNode.id === headerSlot.component.rootElement.id) ||
        (footerSlot?.component && selectedNode.id === footerSlot.component.rootElement.id))
  );

  const compiledCanvasCss = useMemo(() => {
    if (!page) return '';
    return compilePreviewPageCss(page, site, deviceMode, {
      isEditor: !isPreviewMode,
      reduceMotion: reduceMotionPreview,
    });
  }, [page, site, deviceMode, isPreviewMode, reduceMotionPreview]);

  if (!page) {
    return (
      <div className="flex-1 h-full bg-[var(--builder-canvas-bg)] flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-[var(--builder-panel-bg)] border border-[var(--builder-border)] rounded-xl p-6 text-center space-y-3 shadow-xs">
          <div className="flex justify-center">
            <BuillyLogo mode="mobile" theme="light" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[var(--builder-text-primary)]">{t('builder.canvas.noPagesTitle')}</h3>
            <p className="text-xs text-[var(--builder-text-secondary)] leading-relaxed">
              {t('builder.canvas.noPagesDesc')}
            </p>
          </div>
          {onOpenCreateHomePage && (
            <button
              type="button"
              onClick={onOpenCreateHomePage}
              className="min-h-[40px] px-4 py-2 bg-[var(--builder-primary)] hover:bg-[var(--builder-primary-hover)] text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>{t('builder.canvas.createHomeBtn')}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 h-full bg-[var(--builder-canvas-bg)] flex flex-col relative min-w-0 overflow-hidden isolate z-0"
      onClick={() => onSelectElement(null)}
    >
      {/* Canvas Top Bar */}
      {!isPreviewMode && (
        <div className="min-h-[40px] bg-[var(--builder-panel-bg)]/95 backdrop-blur-sm border-b border-[var(--builder-border)] px-3 sm:px-4 flex items-center justify-between gap-2 text-xs text-[var(--builder-text-secondary)] shrink-0 z-20 select-none">
          {/* Breadcrumbs on Desktop/Tablet, Compact Preview Indicator on Mobile */}
          {editorViewportMode === 'mobile' ? (
            <div
              className="flex items-center gap-1.5 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
                {t('builder.canvas.websiteLabel')}
              </span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg">
                {(
                  [
                    { id: 'desktop', icon: Monitor, label: t('common.desktop') },
                    { id: 'tablet', icon: Tablet, label: t('common.tablet') },
                    { id: 'mobile', icon: Smartphone, label: t('common.mobile') },
                  ] as const
                ).map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSetDeviceMode(id)}
                    aria-label={t('builder.canvas.previewBreakpointAria', { device: label })}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                      deviceMode === id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {deviceMode === id && <span>{label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 min-w-0">
              <span className="font-medium text-slate-700 flex items-center gap-1 shrink-0">
                {page.isHome ? (
                  <Home className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>{page.name}</span>
                {page.status && page.status !== 'published' && (
                  <span className="text-[10px] capitalize font-semibold text-amber-700 ml-0.5">
                    ({page.status})
                  </span>
                )}
              </span>
              {breadcrumbs.map((crumb, idx) => {
                const isAncestorDropTarget = Boolean(
                  activeDrag && idx < breadcrumbs.length - 1
                );
                const isHoveredCrumb = hoverCrumbId === crumb.id;
                return (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectElement(crumb.id);
                      }}
                      onDragOver={(e) => {
                        if (!isAncestorDropTarget) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setHoverCrumbId(crumb.id);
                      }}
                      onDragLeave={() => {
                        if (hoverCrumbId === crumb.id) setHoverCrumbId(null);
                      }}
                      onDrop={(e) => handleBreadcrumbDrop(crumb.id, e)}
                      title={
                        isAncestorDropTarget
                          ? t('builder.canvas.dropInsideBreadcrumb', { name: crumb.name })
                          : crumb.name
                      }
                      className={`px-1.5 py-0.5 rounded transition-colors truncate max-w-[140px] whitespace-nowrap ${
                        isHoveredCrumb
                          ? 'bg-emerald-600 text-white font-semibold'
                          : isAncestorDropTarget
                          ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)] border border-dashed border-[var(--builder-primary)]'
                          : idx === breadcrumbs.length - 1
                          ? 'font-semibold text-[var(--builder-primary)] hover:underline'
                          : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-primary)]'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {/* Fit & Zoom Controls + Overflow Warning */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {hasHorizontalOverflow && (
              <span
                className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 mr-2 whitespace-nowrap"
                title={t('builder.canvas.overflowTitle')}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                {t('builder.canvas.overflowShort')}
              </span>
            )}

            {editorViewportMode === 'desktop' && onToggleReduceMotion && (
              <button
                type="button"
                onClick={onToggleReduceMotion}
                aria-pressed={reduceMotionPreview}
                title={t('builder.canvas.reduceMotion')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  reduceMotionPreview
                    ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)] font-semibold'
                    : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)]'
                }`}
              >
                {t('builder.canvas.reduceMotion')}
              </button>
            )}

            {editorViewportMode === 'desktop' && isFocusMode && onToggleFocusMode && (
              <button
                type="button"
                onClick={onToggleFocusMode}
                className="px-2 py-1 rounded text-[11px] font-semibold bg-[var(--builder-primary-soft)] text-[var(--builder-primary)] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                {t('builder.canvas.exitFocusMode')}
              </button>
            )}

            <button
              type="button"
              onClick={() => setFitToScreen((prev) => !prev)}
              className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                fitToScreen
                  ? 'bg-[var(--builder-primary)] text-white'
                  : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)]'
              }`}
              title={t('builder.canvas.fitTitle')}
            >
              <Maximize2 className="w-3 h-3" />
              <span>{t('builder.canvas.fit')}</span>
            </button>

            {editorViewportMode !== 'mobile' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setFitToScreen(false);
                    setManualZoom((z) => Math.max(40, z - 10));
                  }}
                  title={t('builder.canvas.zoomOut')}
                  aria-label={t('builder.canvas.zoomOut')}
                  className="p-1.5 hover:bg-[var(--builder-surface-hover)] rounded text-[var(--builder-text-secondary)]"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono tabular-nums text-[11px] w-10 text-center text-[var(--builder-text-primary)]">
                  {effectivePercent}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFitToScreen(false);
                    setManualZoom((z) => Math.min(200, z + 10));
                  }}
                  title={t('builder.canvas.zoomIn')}
                  aria-label={t('builder.canvas.zoomIn')}
                  className="p-1.5 hover:bg-[var(--builder-surface-hover)] rounded text-[var(--builder-text-secondary)]"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFitToScreen(false);
                    setManualZoom(100);
                  }}
                  title={t('builder.canvas.actualZoom')}
                  aria-label={t('builder.canvas.actualZoom')}
                  className="p-1.5 hover:bg-[var(--builder-surface-hover)] rounded text-[var(--builder-text-secondary)]"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </>
            )}

            {editorViewportMode === 'mobile' && (
              <span className="font-mono tabular-nums text-[11px] text-slate-500 pl-1">
                {effectivePercent}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Main Visual Editing Surface */}
      <div
        ref={surfaceRef}
        onDragOver={handleSurfaceDragOver}
        className={`flex-1 overflow-auto min-h-0 flex justify-center items-start ${
          editorViewportMode === 'mobile' ? 'p-3 pb-20' : 'p-6'
        }`}
      >
        <div
          style={{
            width: `${Math.round(targetPreviewWidth * computedScale)}px`,
            minHeight: '640px',
          }}
          className="relative shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            ref={frameRef}
            style={{
              ...portfolioThemeRootStyle(effectiveTheme.cssVars),
              width: `${targetPreviewWidth}px`,
              transform: `scale(${computedScale})`,
              transformOrigin: 'top left',
              isolation: 'isolate',
              contain: 'layout',
              transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s ease-out',
            }}
            className={`portfolio-theme relative min-h-[820px] flex flex-col ${
              deviceMode !== 'desktop'
                ? 'rounded-2xl border-4 sm:border-8 border-slate-800 shadow-xl overflow-hidden'
                : 'rounded-lg border border-slate-200/80 shadow-sm'
            }`}
          >
            {deviceMode === 'mobile' && (
              <div
                data-indy-editor-chrome="true"
                className="h-5 bg-slate-800 flex items-center justify-center"
              >
                <div className="w-16 h-1 bg-slate-700 rounded-full" />
              </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: compiledCanvasCss }} />

            <CmsSurfaceProvider>
              {/* HEADER REGION */}
              {!isPreviewMode && headerSlot && (
                <div
                  data-indy-editor-chrome="true"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-600 select-none"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe
                      className={`w-3 h-3 shrink-0 ${
                        headerSlot.mode === 'global'
                          ? 'text-indigo-600'
                          : headerSlot.mode === 'local'
                          ? 'text-blue-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="font-semibold text-slate-800 truncate">
                      {headerSlot.mode === 'global'
                        ? `${t('builder.canvas.globalHeader')} · ${
                            headerSlot.definition?.name || t('builder.canvas.missing')
                          }`
                        : headerSlot.mode === 'local'
                        ? `${t('builder.canvas.localHeader')} · ${
                            headerSlot.definition?.name || t('common.custom')
                          }`
                        : t('builder.canvas.headerNone')}
                    </span>
                    {headerSlot.mode === 'global' && !headerSlot.siteGlobalEnabled && (
                      <span className="text-[10px] font-medium text-amber-700 shrink-0">
                        {t('builder.canvas.disabledSiteWide')}
                      </span>
                    )}
                    {headerSlot.mode !== 'none' && !headerSlot.pageEnabled && (
                      <span className="text-[10px] font-medium text-amber-700 shrink-0">
                        {t('builder.canvas.disabledOnPage')}
                      </span>
                    )}
                    {headerSlot.component &&
                      !isRegionVisibleOnDevice(headerSlot.responsiveVisibility, deviceMode) && (
                        <span className="text-[10px] font-medium text-slate-500 shrink-0">
                          {t('builder.canvas.hiddenOnDevice', { device: t(`common.${deviceMode}`) })}
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {headerSlot.mode === 'global' && onCopyGlobalToLocal && (
                      <button
                        type="button"
                        onClick={() => onCopyGlobalToLocal('header')}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-slate-700 flex items-center gap-1"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        <span>{t('builder.canvas.copyLocal')}</span>
                      </button>
                    )}
                    {onOpenPageLayoutSettings && (
                      <button
                        type="button"
                        onClick={onOpenPageLayoutSettings}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-slate-700 flex items-center gap-1"
                      >
                        <Settings2 className="w-2.5 h-2.5" />
                        <span>{t('builder.canvas.layout')}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {headerSlot?.component && (
                <div className="portfolio-site-surface">
                  <ElementRenderer
                    node={headerSlot.component.rootElement}
                    isEditor={!isPreviewMode}
                    isRoot={true}
                    depth={0}
                    site={site}
                    activePage={page}
                    regionKind="header"
                    selectedId={selectedId}
                    hoveredId={hoveredId}
                    deviceMode={deviceMode}
                    editorViewportMode={editorViewportMode}
                    workspace={workspace}
                    cms={site.cms}
                    reduceMotionPreview={reduceMotionPreview}
                    sitePages={sitePagesNav}
                    activePagePath={activePagePath}
                    onSelect={(id, e) => {
                      e.stopPropagation();
                      onSelectElement(id);
                    }}
                    onHover={onHoverElement}
                    onDelete={onDeleteElement}
                    onDuplicate={onDuplicateElement}
                    onMoveUp={onMoveUpElement}
                    onMoveDown={onMoveDownElement}
                    onAddChild={onAddChildElement}
                    onUpdateContent={onUpdateTextContent}
                    onNavigatePage={onNavigatePage}
                    onDropCatalogItem={onDropCatalogItem}
                    onCommitTreeMove={onCommitTreeMove}
                    onCommitCatalogDrop={onCommitCatalogDrop}
                    onCommitLibraryDrop={onCommitLibraryDrop}
                    onDragRejected={onDragRejected}
                    onOpenMovePicker={onOpenMovePicker}
                    onSetInsertionTarget={onSetInsertionTarget}
                    onMoveOutOneLevel={onMoveOutOneLevel}
                    themeCssVars={effectiveTheme.cssVars}
                    onSubmitForm={onSubmitForm}
                  />
                </div>
              )}

              {/* PAGE CONTENT REGION */}
              {!isPreviewMode && (
                <div
                  data-indy-editor-chrome="true"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1 bg-slate-50 border-y border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500 select-none"
                >
                  <span>
                    {t('builder.canvas.pageContent')} · {page.name}
                  </span>
                  <span>{page.slug}</span>
                </div>
              )}

              <div className="portfolio-site-surface flex-1 flex flex-col">
                <ElementRenderer
                  node={page.rootElement}
                  isEditor={!isPreviewMode}
                  isRoot={true}
                  depth={0}
                  site={site}
                  activePage={page}
                  regionKind="page"
                  selectedId={selectedId}
                  hoveredId={hoveredId}
                  deviceMode={deviceMode}
                  editorViewportMode={editorViewportMode}
                  workspace={workspace}
                  cms={site.cms}
                  reduceMotionPreview={reduceMotionPreview}
                  sitePages={sitePagesNav}
                  activePagePath={activePagePath}
                  onSelect={(id, e) => {
                    e.stopPropagation();
                    onSelectElement(id);
                  }}
                  onHover={onHoverElement}
                  onDelete={onDeleteElement}
                  onDuplicate={onDuplicateElement}
                  onMoveUp={onMoveUpElement}
                  onMoveDown={onMoveDownElement}
                  onAddChild={onAddChildElement}
                  onUpdateContent={onUpdateTextContent}
                  onNavigatePage={onNavigatePage}
                  onDropCatalogItem={onDropCatalogItem}
                  onCommitTreeMove={onCommitTreeMove}
                  onCommitCatalogDrop={onCommitCatalogDrop}
                  onCommitLibraryDrop={onCommitLibraryDrop}
                  onDragRejected={onDragRejected}
                  onOpenMovePicker={onOpenMovePicker}
                  onSetInsertionTarget={onSetInsertionTarget}
                  onMoveOutOneLevel={onMoveOutOneLevel}
                  themeCssVars={effectiveTheme.cssVars}
                  onSubmitForm={onSubmitForm}
                />
              </div>

              {/* FOOTER REGION */}
              {!isPreviewMode && footerSlot && (
                <div
                  data-indy-editor-chrome="true"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-600 select-none"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe
                      className={`w-3 h-3 shrink-0 ${
                        footerSlot.mode === 'global'
                          ? 'text-indigo-600'
                          : footerSlot.mode === 'local'
                          ? 'text-blue-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="font-semibold text-slate-800 truncate">
                      {footerSlot.mode === 'global'
                        ? `${t('builder.canvas.globalFooter')} · ${
                            footerSlot.definition?.name || t('builder.canvas.missing')
                          }`
                        : footerSlot.mode === 'local'
                        ? `${t('builder.canvas.localFooter')} · ${
                            footerSlot.definition?.name || t('common.custom')
                          }`
                        : t('builder.canvas.footerNone')}
                    </span>
                    {footerSlot.mode === 'global' && !footerSlot.siteGlobalEnabled && (
                      <span className="text-[10px] font-medium text-amber-700 shrink-0">
                        {t('builder.canvas.disabledSiteWide')}
                      </span>
                    )}
                    {footerSlot.mode !== 'none' && !footerSlot.pageEnabled && (
                      <span className="text-[10px] font-medium text-amber-700 shrink-0">
                        {t('builder.canvas.disabledOnPage')}
                      </span>
                    )}
                    {footerSlot.component &&
                      !isRegionVisibleOnDevice(footerSlot.responsiveVisibility, deviceMode) && (
                        <span className="text-[10px] font-medium text-slate-500 shrink-0">
                          {t('builder.canvas.hiddenOnDevice', { device: t(`common.${deviceMode}`) })}
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {footerSlot.mode === 'global' && onCopyGlobalToLocal && (
                      <button
                        type="button"
                        onClick={() => onCopyGlobalToLocal('footer')}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-slate-700 flex items-center gap-1"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        <span>{t('builder.canvas.copyLocal')}</span>
                      </button>
                    )}
                    {onOpenPageLayoutSettings && (
                      <button
                        type="button"
                        onClick={onOpenPageLayoutSettings}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-50 text-[10px] font-semibold text-slate-700 flex items-center gap-1"
                      >
                        <Settings2 className="w-2.5 h-2.5" />
                        <span>{t('builder.canvas.layout')}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {footerSlot?.component && (
                <div className="portfolio-site-surface">
                  <ElementRenderer
                    node={footerSlot.component.rootElement}
                    isEditor={!isPreviewMode}
                    isRoot={true}
                    depth={0}
                    site={site}
                    activePage={page}
                    regionKind="footer"
                    selectedId={selectedId}
                    hoveredId={hoveredId}
                    deviceMode={deviceMode}
                    editorViewportMode={editorViewportMode}
                    workspace={workspace}
                    cms={site.cms}
                    reduceMotionPreview={reduceMotionPreview}
                    sitePages={sitePagesNav}
                    activePagePath={activePagePath}
                    onSelect={(id, e) => {
                      e.stopPropagation();
                      onSelectElement(id);
                    }}
                    onHover={onHoverElement}
                    onDelete={onDeleteElement}
                    onDuplicate={onDuplicateElement}
                    onMoveUp={onMoveUpElement}
                    onMoveDown={onMoveDownElement}
                    onAddChild={onAddChildElement}
                    onUpdateContent={onUpdateTextContent}
                    onNavigatePage={onNavigatePage}
                    onDropCatalogItem={onDropCatalogItem}
                    onCommitTreeMove={onCommitTreeMove}
                    onCommitCatalogDrop={onCommitCatalogDrop}
                    onCommitLibraryDrop={onCommitLibraryDrop}
                    onDragRejected={onDragRejected}
                    onOpenMovePicker={onOpenMovePicker}
                    onSetInsertionTarget={onSetInsertionTarget}
                    onMoveOutOneLevel={onMoveOutOneLevel}
                    themeCssVars={effectiveTheme.cssVars}
                    onSubmitForm={onSubmitForm}
                  />
                  {hasVisibleFooter && <BuillyMadeWithBadge variant="footer" />}
                </div>
              )}
            </CmsSurfaceProvider>
          </div>
        </div>
      </div>

      {/* Bottom-left Floating Overlay Badge when Footer is Disabled or Hidden */}
      {!hasVisibleFooter && (
        <BuillyMadeWithBadge
          variant="floating"
          className={`absolute left-3 z-30 ${
            !isPreviewMode && editorViewportMode === 'mobile' && selectedNode
              ? 'bottom-16'
              : 'bottom-3'
          }`}
        />
      )}

      {/* Mobile Contextual Touch Action Bar for Selected Element */}
      {!isPreviewMode && editorViewportMode === 'mobile' && selectedNode && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mx-3 mb-2 px-2.5 py-1.5 bg-slate-900 text-white rounded-xl shadow-lg flex items-center justify-between gap-2 shrink-0 z-20"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{selectedNode.name}</div>
            <div className="text-[10px] text-slate-400 font-mono truncate">
              {selectedNode.type} · {BREAKPOINTS[deviceMode].shortLabel}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isRootSelected && (
              <>
                <button
                  type="button"
                  onClick={() => onMoveUpElement(selectedNode.id)}
                  aria-label={t('builder.canvas.moveUpAria')}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-800 active:bg-slate-700"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveDownElement(selectedNode.id)}
                  aria-label={t('builder.canvas.moveDownAria')}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-800 active:bg-slate-700"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                {onOpenMovePicker && (
                  <button
                    type="button"
                    onClick={() => onOpenMovePicker(selectedNode.id)}
                    aria-label={t('builder.canvas.moveToAria')}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-800 active:bg-slate-700 text-blue-300"
                  >
                    <Move className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            {isSelectedContainer && onOpenAddElements && (
              <button
                type="button"
                onClick={onOpenAddElements}
                aria-label={t('builder.canvas.addInsideAria')}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-800 active:bg-slate-700 text-emerald-400"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            {onOpenProperties && (
              <button
                type="button"
                onClick={onOpenProperties}
                className="min-h-[40px] px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{t('common.edit')}</span>
              </button>
            )}
            {!isRootSelected && (
              <button
                type="button"
                onClick={() => onDeleteElement(selectedNode.id)}
                aria-label={t('builder.canvas.deleteAria')}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-red-600/80 text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
