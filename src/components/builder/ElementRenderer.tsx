import React, { useEffect, useRef, useState } from 'react';
import {
  DeviceMode,
  DropPosition,
  ElementNode,
  GoogleWorkspaceState,
  InsertionPlacement,
  LibraryItem,
  PageDocument,
  SiteDocument,
} from '../../types/builder';
import { CmsDocument, CmsContentRecord } from '../../types/cms';
import {
  resolveStylesForBreakpoint,
  isHiddenAtBreakpoint,
} from '../../services/responsiveStyleModel';
import { isContainerElementType } from '../../data/elementRegistry';
import { sanitizeSvgMarkup } from '../../services/assetService';
import { buildIsolatedEmbedSrcDoc } from '../../services/cssCompiler';
import { CuratedIcon } from './CuratedIcon';
import { resolveCmsDynamicFieldValue, executeCmsQuery } from '../../services/cms/cmsQueryEngine';
import { isSafeRedirectUrl } from '../../services/cms/cmsValidation';
import {
  CmsCollectionGridOrList,
  CmsCarouselWidget,
  CmsTaxonomyWidget,
  CmsUtilityWidget,
} from './CmsDynamicWidgets';
import {
  RegionKind,
  DropValidationResult,
  getRegionContextForNode,
  resolveDropDestination,
  validateTreeInsert,
  validateTreeMove,
} from '../../services/treeCommandService';
import { useBuilderDrag } from '../../contexts/BuilderDragContext';
import {
  Database,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Plus,
  EyeOff,
  Image as ImageIcon,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Link2,
  Film,
  Music,
  MapPin,
  ExternalLink,
  Check,
  Info,
  RefreshCw,
  GripVertical,
  CornerLeftUp,
  Move,
  AlertCircle,
} from 'lucide-react';

interface NavResolvedPageItem {
  id: string;
  name: string;
  fullPath: string;
  navVisible: boolean;
  parentPageId?: string | null;
}

interface ElementRendererProps {
  node: ElementNode;
  isEditor?: boolean;
  isRoot?: boolean;
  depth?: number;
  site?: SiteDocument;
  activePage?: PageDocument | null;
  regionKind?: RegionKind;
  selectedId?: string | null;
  hoveredId?: string | null;
  deviceMode?: DeviceMode;
  editorViewportMode?: DeviceMode;
  workspace?: GoogleWorkspaceState;
  cms?: CmsDocument;
  currentRecord?: CmsContentRecord;
  reduceMotionPreview?: boolean;
  sitePages?: NavResolvedPageItem[];
  activePagePath?: string;
  onSelect?: (id: string, e: React.MouseEvent) => void;
  onHover?: (id: string | null) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onAddChild?: (parentId: string) => void;
  onUpdateContent?: (id: string, text: string) => void;
  onNavigatePage?: (slug: string) => void;
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
  contextRow?: Record<string, any>;
  themeCssVars?: Record<string, string>;
  onSubmitForm?: (
    formId: string,
    values: Record<string, any>,
    sourcePage?: string
  ) => Promise<boolean | void> | boolean | void;
}

function isSafeHttpsEmbed(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const ElementRenderer: React.FC<ElementRendererProps> = ({
  node,
  isEditor = false,
  isRoot = false,
  depth = 0,
  site,
  activePage,
  regionKind = 'page',
  selectedId,
  hoveredId,
  deviceMode = 'desktop',
  editorViewportMode = 'desktop',
  workspace,
  cms,
  currentRecord,
  reduceMotionPreview = false,
  sitePages,
  activePagePath,
  onSelect,
  onHover,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onAddChild,
  onUpdateContent,
  onNavigatePage,
  onDropCatalogItem,
  onCommitTreeMove,
  onCommitCatalogDrop,
  onCommitLibraryDrop,
  onDragRejected,
  onOpenMovePicker,
  onSetInsertionTarget,
  onMoveOutOneLevel,
  contextRow,
  themeCssVars,
  onSubmitForm,
}) => {
  const { activeDrag, hoverTarget, startDrag, setHoverTarget, endDrag } = useBuilderDrag();
  const [imgFailed, setImgFailed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [openAccordionIdx, setOpenAccordionIdx] = useState<number | null>(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toggleChecked, setToggleChecked] = useState<boolean>(
    Boolean(node.content?.checked ?? true)
  );
  const [selectedRadioIdx, setSelectedRadioIdx] = useState<number>(0);

  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const embedIframeRef = useRef<HTMLIFrameElement>(null);
  const [embedHeight, setEmbedHeight] = useState<number>(80);
  const [embedRunKey, setEmbedRunKey] = useState<number>(0);

  useEffect(() => {
    if (!mobileNavOpen && !openDropdownId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileNavOpen) {
          setMobileNavOpen(false);
          requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus());
        }
        if (openDropdownId) {
          setOpenDropdownId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen, openDropdownId]);

  useEffect(() => {
    if (node.type !== 'html-embed') return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (
        data &&
        data.type === 'indy-embed-resize' &&
        data.embedId === node.id &&
        (!embedIframeRef.current?.contentWindow ||
          event.source === embedIframeRef.current.contentWindow) &&
        typeof data.height === 'number' &&
        Number.isFinite(data.height)
      ) {
        const nextH = Math.max(32, Math.min(8000, Math.ceil(data.height)));
        setEmbedHeight(nextH);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [node.id, node.type]);

  const hiddenAtBp = isHiddenAtBreakpoint(node, deviceMode);
  if (hiddenAtBp && !isEditor) return null;

  const isSelected = isEditor && selectedId === node.id;
  const isHovered = isEditor && hoveredId === node.id && !isSelected;

  const baseStyles = resolveStylesForBreakpoint(node, deviceMode);

  // Dynamic value resolution
  let displayText = node.content?.text ?? '';
  let displayImageSrc = node.content?.imageSrc ?? '';
  let displayUrl = node.content?.url ?? '';

  if (node.dynamicBinding?.enabled) {
    const { source = 'sheets', tab: tabName, field } = node.dynamicBinding;
    let boundVal: any = undefined;

    if (source === 'cms' || source === 'context') {
      boundVal = resolveCmsDynamicFieldValue(
        cms,
        node.dynamicBinding,
        currentRecord,
        isEditor ? 'editor' : 'public_build'
      );
    } else if (workspace) {
      if (contextRow && contextRow[field] !== undefined) {
        boundVal = contextRow[field];
      } else {
        const tab = workspace.spreadsheet.tabs.find((t) => t.name === tabName);
        if (tab && tab.rows.length > 0) {
          boundVal = tab.rows[0][field];
        }
      }
    }

    if (boundVal !== undefined) {
      if (node.type === 'image') {
        displayImageSrc = String(boundVal);
      } else if (node.type === 'button' || node.type === 'link') {
        if (
          field.toLowerCase().includes('url') ||
          field.toLowerCase().includes('link') ||
          field === '$url'
        ) {
          displayUrl = String(boundVal);
        } else {
          displayText = String(boundVal);
        }
      } else {
        displayText = String(boundVal);
      }
    }
  }

  if (displayText.includes('{year}')) {
    displayText = displayText.replace(/\{year\}/gi, String(new Date().getFullYear()));
  }

  const isDropHovered = Boolean(
    isEditor && hoverTarget && hoverTarget.targetNodeId === node.id && !hoverTarget.isNoOp
  );

  const editorOnlyStyles: React.CSSProperties = {};
  if (isEditor) {
    if (hiddenAtBp) {
      editorOnlyStyles.opacity = 0.42;
    }
    if ((isSelected || isDropHovered) && (!baseStyles.position || baseStyles.position === 'static')) {
      editorOnlyStyles.position = 'relative';
    }
  }

  const navigateOrFollow = (url: string | undefined, e: React.MouseEvent) => {
    if (isEditor) {
      e.preventDefault();
      e.stopPropagation();
      onSelect?.(node.id, e);
      return;
    }
    if (!url) return;
    if (url.startsWith('/')) {
      e.preventDefault();
      onNavigatePage?.(url);
    } else if (url.startsWith('#')) {
      e.preventDefault();
      const target = document.getElementById(url.slice(1));
      target?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isEditor) {
      e.stopPropagation();
      onSelect?.(node.id, e);
    } else if (displayUrl) {
      navigateOrFollow(displayUrl, e);
    }
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (isEditor && editorViewportMode !== 'mobile') {
      e.stopPropagation();
      onHover?.(node.id);
    }
  };

  const handleMouseLeave = () => {
    if (isEditor && editorViewportMode !== 'mobile') {
      onHover?.(null);
    }
  };

  const isContainerLike = isContainerElementType(node.type);
  const isLinkedInstance = node.componentRef?.mode === 'linked';

  const computeDropZoneAndValidate = (e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let position: DropPosition = 'after';
    if (isRoot) {
      position = 'inside-last';
    } else if (isContainerLike) {
      if (!node.children || node.children.length === 0) {
        position = 'inside-last';
      } else {
        const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
        if (relY < 0.22) position = 'before';
        else if (relY > 0.78) position = 'after';
        else position = 'inside-last';
      }
    } else {
      const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
      position = relY < 0.5 ? 'before' : 'after';
    }

    if (!site || !activePage || !activeDrag) {
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

  const dragHandlers: Record<string, any> = isEditor
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (activeDrag) {
            e.preventDefault();
            e.stopPropagation();
            const { position, validation, region } = computeDropZoneAndValidate(e);
            if (validation) {
              const targetLabel =
                position === 'before'
                  ? `Before ${node.name}`
                  : position === 'after'
                  ? `After ${node.name}`
                  : `Inside ${node.name}`;
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
                  ? targetLabel
                  : validation.reason || 'Invalid target',
                destinationParentId: validation.destinationParentId,
                destinationIndex:
                  validation.normalizedIndex ?? validation.destinationIndex,
              });
            }
            return;
          }

          if (
            isContainerLike &&
            onDropCatalogItem &&
            e.dataTransfer.types.includes('application/x-indy-catalog')
          ) {
            e.preventDefault();
            e.stopPropagation();
            setHoverTarget({
              targetNodeId: node.id,
              position: 'inside-last',
              region: regionKind,
              valid: true,
              label: `Inside ${node.name}`,
              destinationParentId: node.id,
              destinationIndex: node.children?.length || 0,
            });
          }
        },
        onDragLeave: (e: React.DragEvent) => {
          const related = e.relatedTarget as Node | null;
          if (related && (e.currentTarget as HTMLElement).contains(related)) return;
          if (hoverTarget?.targetNodeId === node.id) {
            setHoverTarget(null);
          }
        },
        onDrop: (e: React.DragEvent) => {
          if (activeDrag) {
            e.preventDefault();
            e.stopPropagation();
            const { dest, validation } = computeDropZoneAndValidate(e);
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
            return;
          }

          if (isContainerLike && onDropCatalogItem) {
            const catalogType = e.dataTransfer.getData('application/x-indy-catalog');
            if (catalogType) {
              e.preventDefault();
              e.stopPropagation();
              endDrag();
              onDropCatalogItem(catalogType, node.id);
            }
          }
        },
      }
    : {};

  // Render children helper
  const renderChildren = (
    customContextRow?: Record<string, any>,
    customRecord?: CmsContentRecord
  ) => {
    return node.children?.map((child) => (
      <ElementRenderer
        key={child.id}
        node={child}
        isEditor={isEditor}
        isRoot={false}
        depth={depth + 1}
        site={site}
        activePage={activePage}
        regionKind={regionKind}
        selectedId={selectedId}
        hoveredId={hoveredId}
        deviceMode={deviceMode}
        editorViewportMode={editorViewportMode}
        workspace={workspace}
        cms={cms}
        currentRecord={customRecord || currentRecord}
        reduceMotionPreview={reduceMotionPreview}
        sitePages={sitePages}
        activePagePath={activePagePath}
        onSelect={onSelect}
        onHover={onHover}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onAddChild={onAddChild}
        onUpdateContent={onUpdateContent}
        onNavigatePage={onNavigatePage}
        onDropCatalogItem={onDropCatalogItem}
        onCommitTreeMove={onCommitTreeMove}
        onCommitCatalogDrop={onCommitCatalogDrop}
        onCommitLibraryDrop={onCommitLibraryDrop}
        onDragRejected={onDragRejected}
        onOpenMovePicker={onOpenMovePicker}
        onSetInsertionTarget={onSetInsertionTarget}
        onMoveOutOneLevel={onMoveOutOneLevel}
        contextRow={customContextRow || contextRow}
        themeCssVars={themeCssVars}
        onSubmitForm={onSubmitForm}
      />
    ));
  };

  // Repeater handling
  let repeaterItems: React.ReactNode = null;
  if (node.type === 'repeater') {
    const templateChild = node.children?.[0];
    if (templateChild) {
      if (
        node.content?.repeaterSource === 'cms' ||
        node.content?.cmsQuery ||
        (cms && cms.contentTypes.some((ct) => ct.id === node.content?.repeaterCollection))
      ) {
        const cmsQuery = node.content?.cmsQuery || {
          contentTypeId: node.content?.repeaterCollection || 'project',
          statusFilter: isEditor ? 'all_non_trash' : 'published_only',
          limit: node.content?.repeaterLimit || 6,
        };
        const queryRes = executeCmsQuery(cms, cmsQuery, {
          mode: isEditor ? 'editor' : 'public_build',
        });
        repeaterItems = queryRes.records.map((rec, idx) => (
          <ElementRenderer
            key={`${templateChild.id}_cms_rec_${rec.recordId || idx}`}
            node={templateChild}
            isEditor={isEditor}
            isRoot={false}
            depth={depth + 1}
            site={site}
            activePage={activePage}
            regionKind={regionKind}
            selectedId={selectedId}
            hoveredId={hoveredId}
            deviceMode={deviceMode}
            editorViewportMode={editorViewportMode}
            workspace={workspace}
            cms={cms}
            currentRecord={rec}
            reduceMotionPreview={reduceMotionPreview}
            onSelect={onSelect}
            onHover={onHover}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onAddChild={onAddChild}
            onUpdateContent={onUpdateContent}
            onNavigatePage={onNavigatePage}
            onDropCatalogItem={onDropCatalogItem}
            onDragRejected={onDragRejected}
            onOpenMovePicker={onOpenMovePicker}
            contextRow={rec.fields}
            themeCssVars={themeCssVars}
          />
        ));
      } else if (node.content?.repeaterCollection && workspace) {
        const tab = workspace.spreadsheet.tabs.find(
          (t) => t.name === node.content?.repeaterCollection
        );
        if (tab) {
          let rows = [...tab.rows];
          if (node.content.repeaterSortBy) {
            const sortBy = node.content.repeaterSortBy;
            const order = node.content.repeaterOrder === 'desc' ? -1 : 1;
            rows.sort((a, b) => {
              const va = a[sortBy] ?? '';
              const vb = b[sortBy] ?? '';
              return va > vb ? order : va < vb ? -order : 0;
            });
          }
          const limit = node.content.repeaterLimit || 6;
          rows = rows.slice(0, limit);

          repeaterItems = rows.map((row, idx) => (
            <ElementRenderer
              key={`${templateChild.id}_row_${idx}`}
              node={templateChild}
              isEditor={isEditor}
              isRoot={false}
              depth={depth + 1}
              site={site}
              activePage={activePage}
              regionKind={regionKind}
              selectedId={selectedId}
              hoveredId={hoveredId}
              deviceMode={deviceMode}
              editorViewportMode={editorViewportMode}
              workspace={workspace}
              cms={cms}
              currentRecord={currentRecord}
              reduceMotionPreview={reduceMotionPreview}
              onSelect={onSelect}
              onHover={onHover}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onAddChild={onAddChild}
              onUpdateContent={onUpdateContent}
              onNavigatePage={onNavigatePage}
              onDropCatalogItem={onDropCatalogItem}
              onDragRejected={onDragRejected}
              onOpenMovePicker={onOpenMovePicker}
              contextRow={row}
              themeCssVars={themeCssVars}
            />
          ));
        }
      }
    }
  }

  const dropIndicator =
    isDropHovered && hoverTarget ? (
      hoverTarget.position === 'before' ? (
        <div
          key="__drop_ind"
          data-indy-editor-chrome="true"
          className={`pointer-events-none absolute -top-0.5 left-0 right-0 h-[3px] z-50 ${
            hoverTarget.valid ? 'bg-blue-600' : 'bg-red-500'
          }`}
        >
          <span
            className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap shadow-sm ${
              hoverTarget.valid ? 'bg-blue-600' : 'bg-red-600'
            }`}
          >
            {hoverTarget.label}
          </span>
        </div>
      ) : hoverTarget.position === 'after' ? (
        <div
          key="__drop_ind"
          data-indy-editor-chrome="true"
          className={`pointer-events-none absolute -bottom-0.5 left-0 right-0 h-[3px] z-50 ${
            hoverTarget.valid ? 'bg-blue-600' : 'bg-red-500'
          }`}
        >
          <span
            className={`absolute -bottom-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap shadow-sm ${
              hoverTarget.valid ? 'bg-blue-600' : 'bg-red-600'
            }`}
          >
            {hoverTarget.label}
          </span>
        </div>
      ) : (
        <div
          key="__drop_ind"
          data-indy-editor-chrome="true"
          className={`pointer-events-none absolute inset-0 z-40 border-2 border-dashed rounded-[inherit] ${
            hoverTarget.valid
              ? 'border-emerald-500 bg-emerald-500/5'
              : 'border-red-500 bg-red-500/5'
          }`}
        >
          <span
            className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap shadow-sm ${
              hoverTarget.valid ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            {hoverTarget.label}
          </span>
        </div>
      )
    ) : null;

  const editorChrome = isSelected && (
    editorViewportMode === 'mobile' ? (
      <div
        data-indy-editor-chrome="true"
        className="absolute top-1 left-1 z-40 flex items-center gap-1.5 px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-medium shadow-sm pointer-events-none max-w-[85%]"
      >
        <span className="truncate">{node.name}</span>
        {isLinkedInstance && (
          <span className="text-indigo-200 font-mono shrink-0">Linked</span>
        )}
        {hiddenAtBp && (
          <span className="flex items-center gap-0.5 text-amber-200 shrink-0">
            <EyeOff className="w-2.5 h-2.5" />
            Hidden
          </span>
        )}
      </div>
    ) : (
      <div
        data-indy-editor-chrome="true"
        className={`absolute ${
          isRoot ? 'top-1.5 left-1.5' : '-top-8 left-0'
        } z-40 flex items-center gap-1 px-2 py-1 ${
          isLinkedInstance ? 'bg-indigo-600' : 'bg-blue-600'
        } text-white rounded-md text-xs shadow-lg pointer-events-auto max-w-[460px]`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isRoot && !node.locked && (
          <span
            draggable={true}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData('application/x-indy-node', node.id);
              e.dataTransfer.effectAllowed = 'move';
              startDrag({
                kind: 'existing',
                nodeIds: [node.id],
                name: node.name,
                sourceRegion: regionKind,
              });
            }}
            onDragEnd={() => endDrag()}
            title="Drag to reorder or reparent"
            aria-label={`Drag ${node.name}`}
            className="p-0.5 hover:bg-black/20 rounded cursor-grab active:cursor-grabbing shrink-0 touch-none"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <span className="font-semibold truncate max-w-[120px]">{node.name}</span>
        {isLinkedInstance && (
          <span className="px-1 bg-indigo-800 rounded text-[10px] flex items-center gap-0.5 shrink-0 font-mono">
            <Link2 className="w-2.5 h-2.5" />
            Linked
          </span>
        )}
        {hiddenAtBp && (
          <span className="px-1 py-0.2 bg-amber-500 text-slate-950 rounded text-[10px] font-semibold shrink-0 flex items-center gap-0.5">
            <EyeOff className="w-2.5 h-2.5" />
            Hidden
          </span>
        )}
        {node.dynamicBinding?.enabled && (
          <span className="px-1 py-0.2 bg-blue-800 rounded text-[10px] flex items-center gap-1 shrink-0 font-mono">
            <Database className="w-2.5 h-2.5" />
            {node.dynamicBinding.tab}
          </span>
        )}
        {!isRoot && (
          <>
            <div className="h-3 w-px bg-white/30 mx-0.5 shrink-0" />
            {depth >= 2 && onMoveOutOneLevel && (
              <button
                type="button"
                onClick={() => onMoveOutOneLevel(node.id)}
                title="Move Out One Level"
                className="p-1 hover:bg-black/20 rounded transition-colors shrink-0"
              >
                <CornerLeftUp className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onMoveUp?.(node.id)}
              title="Move Up"
              className="p-1 hover:bg-black/20 rounded transition-colors shrink-0"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMoveDown?.(node.id)}
              title="Move Down"
              className="p-1 hover:bg-black/20 rounded transition-colors shrink-0"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            {onOpenMovePicker && (
              <button
                type="button"
                onClick={() => onOpenMovePicker(node.id)}
                title="Move to..."
                className="p-1 hover:bg-black/20 rounded transition-colors shrink-0"
              >
                <Move className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDuplicate?.(node.id)}
              title="Duplicate"
              className="p-1 hover:bg-black/20 rounded transition-colors shrink-0"
            >
              <Copy className="w-3 h-3" />
            </button>
          </>
        )}
        {isContainerLike && (
          <button
            type="button"
            onClick={() => onAddChild?.(node.id)}
            title="Add Child Element"
            className="p-1 hover:bg-black/20 rounded transition-colors shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
        {node.type === 'html-embed' && (
          <button
            type="button"
            onClick={() => setEmbedRunKey((k) => k + 1)}
            title="Re-run HTML/JS Sandbox"
            className="p-1 hover:bg-black/20 rounded transition-colors shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        {!isRoot && (
          <button
            type="button"
            onClick={() => onDelete?.(node.id)}
            title="Delete Element"
            className="p-1 hover:bg-red-600 rounded transition-colors ml-0.5 shrink-0"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  );

  // Editor outline styling
  const editorOutlineClass = isEditor
    ? isSelected
      ? isLinkedInstance
        ? 'outline-2 outline-indigo-600 outline-offset-1'
        : 'outline-2 outline-blue-600 outline-offset-1'
      : isHovered
      ? 'outline-1 outline-blue-400 outline-dashed outline-offset-1 cursor-pointer'
      : 'cursor-pointer'
    : '';

  const commonAttrs = {
    'data-indy-el': node.id,
    id: node.advanced?.htmlId || node.htmlId || undefined,
    'aria-label': node.advanced?.ariaLabel || undefined,
    role: node.advanced?.role || undefined,
  };
  const effectiveInlineStyle =
    Object.keys(editorOnlyStyles).length > 0 ? editorOnlyStyles : undefined;

  let innerContent: React.ReactNode = null;

  switch (node.type) {
    case 'heading': {
      const Tag = (node.content?.headingLevel || 'h2') as keyof React.JSX.IntrinsicElements;
      innerContent = (
        <Tag
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`portfolio-heading ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {displayText}
        </Tag>
      );
      break;
    }

    case 'text': {
      innerContent = (
        <p
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {displayText}
        </p>
      );
      break;
    }

    case 'rich-text': {
      const paragraphs = (displayText || '').split(/\n\n+/);
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-3 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {paragraphs.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      );
      break;
    }

    case 'label': {
      innerContent = (
        <span
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {displayText}
        </span>
      );
      break;
    }

    case 'link':
    case 'anchor-link': {
      innerContent = (
        <a
          {...commonAttrs}
          href={isEditor ? undefined : displayUrl || '#'}
          target={!isEditor && node.content?.targetBlank ? '_blank' : undefined}
          rel={!isEditor && node.content?.targetBlank ? 'noopener noreferrer' : undefined}
          style={effectiveInlineStyle}
          className={`cursor-pointer transition-opacity hover:opacity-80 ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {displayText}
        </a>
      );
      break;
    }

    case 'button': {
      innerContent = (
        <a
          {...commonAttrs}
          href={isEditor ? undefined : displayUrl || '#'}
          target={!isEditor && node.content?.targetBlank ? '_blank' : undefined}
          rel={!isEditor && node.content?.targetBlank ? 'noopener noreferrer' : undefined}
          style={effectiveInlineStyle}
          className={`cursor-pointer inline-flex items-center justify-center transition-all ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <span>{displayText}</span>
        </a>
      );
      break;
    }

    case 'list': {
      const ListTag = node.content?.orderedList ? 'ol' : 'ul';
      const listItems = node.content?.items || [];
      innerContent = (
        <ListTag
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${
            node.content?.orderedList ? 'list-decimal' : 'list-disc'
          } space-y-1.5 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {listItems.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ListTag>
      );
      break;
    }

    case 'blockquote': {
      innerContent = (
        <blockquote
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-2 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <p className="m-0">“{displayText}”</p>
          {node.content?.caption && (
            <footer
              style={{ color: 'var(--color-text-muted)' }}
              className="text-xs font-sans not-italic font-medium"
            >
              — {node.content.caption}
            </footer>
          )}
        </blockquote>
      );
      break;
    }

    case 'code': {
      innerContent = (
        <pre
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <code className="block font-mono whitespace-pre">{displayText}</code>
        </pre>
      );
      break;
    }

    case 'icon': {
      const iconSize = node.content?.iconSize || '28px';
      const stroke = node.content?.iconStrokeWidth ?? 2;
      const color = node.content?.iconColor || 'var(--color-accent)';
      const safeSvg =
        node.content?.iconSet === 'custom-svg' && node.content?.svgMarkup
          ? sanitizeSvgMarkup(node.content.svgMarkup)
          : null;

      const iconInner =
        safeSvg?.valid && safeSvg.sanitized ? (
          <span
            style={{ width: iconSize, height: iconSize, color }}
            className="inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: safeSvg.sanitized }}
          />
        ) : (
          <CuratedIcon
            name={node.content?.iconName || 'Sparkles'}
            size={iconSize}
            strokeWidth={stroke}
            color={color}
            ariaLabel={node.content?.text || node.name}
          />
        );

      const WrapperTag = displayUrl && !isEditor ? 'a' : 'div';
      innerContent = (
        <WrapperTag
          {...commonAttrs}
          {...(WrapperTag === 'a' ? { href: displayUrl } : {})}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {iconInner}
        </WrapperTag>
      );
      break;
    }

    case 'logo': {
      const mode = node.content?.logoMode || 'icon-text';
      const logoImgSrc = node.content?.logoLightSrc || node.content?.imageSrc || '';
      const fit = node.content?.objectFit || 'contain';

      innerContent = (
        <a
          {...commonAttrs}
          href={isEditor ? undefined : node.content?.url || '/'}
          style={effectiveInlineStyle}
          className={`inline-flex items-center gap-2.5 cursor-pointer no-underline ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={(e) => navigateOrFollow(node.content?.url || '/', e)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {mode === 'image' && logoImgSrc ? (
            <img
              src={logoImgSrc}
              alt={node.content?.logoText || node.name}
              style={{ objectFit: fit as React.CSSProperties['objectFit'] }}
              className="h-8 w-auto max-w-[160px] block"
            />
          ) : (
            <>
              {mode === 'icon-text' && (
                <span
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-button-primary-text)',
                  }}
                  className="w-7 h-7 rounded-md inline-flex items-center justify-center shrink-0"
                >
                  <CuratedIcon name={node.content?.logoIconName || 'Layers'} size={16} />
                </span>
              )}
              <span className="flex flex-col leading-tight">
                <span>{node.content?.logoText || 'Portfolio'}</span>
                {node.content?.logoTagline && (
                  <span
                    style={{ color: 'var(--color-text-muted)' }}
                    className="text-[11px] font-normal"
                  >
                    {node.content.logoTagline}
                  </span>
                )}
              </span>
            </>
          )}
        </a>
      );
      break;
    }

    case 'image': {
      const aspectClasses = {
        '16:9': 'aspect-video',
        '4:3': 'aspect-4/3',
        '1:1': 'aspect-square',
        auto: 'aspect-auto',
      }[node.content?.aspectRatio || 'auto'];

      const effectiveFit = baseStyles.objectFit || node.content?.objectFit || 'cover';

      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative overflow-hidden ${aspectClasses} ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {!imgFailed ? (
            <img
              src={displayImageSrc || '/src/assets/images/project_minimalist_fintech_1794451338248.jpg'}
              alt={node.content?.imageAlt || node.name}
              referrerPolicy="no-referrer"
              style={{
                objectFit: effectiveFit as React.CSSProperties['objectFit'],
                objectPosition: baseStyles.objectPosition || undefined,
              }}
              className="w-full h-full block"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div
              style={{
                backgroundColor: 'var(--color-surface-alt)',
                color: 'var(--color-text-muted)',
              }}
              className="w-full h-full min-h-[120px] flex flex-col items-center justify-center p-4 text-center"
            >
              <ImageIcon className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">{node.content?.imageAlt || node.name}</span>
            </div>
          )}
        </div>
      );
      break;
    }

    case 'image-gallery': {
      const items = node.content?.items || [];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {items.map((item) => (
            <figure
              key={item.id}
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="border overflow-hidden m-0"
            >
              <div className="aspect-4/3 overflow-hidden bg-slate-100">
                <img
                  src={item.imageSrc || '/src/assets/images/project_minimalist_fintech_1794451338248.jpg'}
                  alt={item.title}
                  className="w-full h-full object-cover block"
                />
              </div>
              <figcaption className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--color-heading)' }} className="font-semibold truncate">
                  {item.title}
                </span>
                {item.meta && (
                  <span style={{ color: 'var(--color-text-muted)' }} className="font-mono text-[11px]">
                    {item.meta}
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      );
      break;
    }

    case 'video': {
      const videoUrl = node.content?.videoUrl;
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {videoUrl ? (
            <video
              controls={!isEditor}
              poster={node.content?.videoPoster}
              src={videoUrl}
              className="w-full aspect-video block bg-slate-950"
            />
          ) : (
            <div className="relative aspect-video bg-slate-900 flex flex-col items-center justify-center text-white p-6 text-center">
              {node.content?.videoPoster && (
                <img
                  src={node.content.videoPoster}
                  alt={node.content?.caption || 'Video poster'}
                  className="absolute inset-0 w-full h-full object-cover opacity-35"
                />
              )}
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/25">
                  <Film className="w-5 h-5" />
                </div>
                <div className="text-sm font-semibold">{node.content?.caption || 'Showreel Video'}</div>
                <div className="text-xs text-slate-300">Attach an MP4/WebM from Assets or enter a video URL</div>
              </div>
            </div>
          )}
        </div>
      );
      break;
    }

    case 'audio': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-2 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <div className="flex items-center gap-2.5">
            <div
              style={{
                backgroundColor: 'var(--color-surface-alt)',
                color: 'var(--color-accent)',
              }}
              className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
            >
              <Music className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div style={{ color: 'var(--color-heading)' }} className="text-xs font-semibold truncate">
                {node.content?.audioTitle || node.name}
              </div>
              <div style={{ color: 'var(--color-text-muted)' }} className="text-[11px] truncate">
                {node.content?.audioUrl ? 'Ready to play' : node.content?.text || 'Attach MP3/WAV asset'}
              </div>
            </div>
          </div>
          {node.content?.audioUrl && (
            <audio controls className="w-full h-9" src={node.content.audioUrl} />
          )}
        </div>
      );
      break;
    }

    case 'background-media': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative flex items-end p-6 sm:p-8 ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <img
            src={displayImageSrc || '/src/assets/images/hero_creative_director_1794451337351.jpg'}
            alt={node.content?.text || node.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            style={{
              background:
                'linear-gradient(180deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.82) 100%)',
            }}
            className="absolute inset-0"
          />
          <div className="relative z-10 max-w-xl space-y-1 text-white">
            {node.content?.caption && (
              <div className="text-xs font-mono tracking-wide text-slate-200">
                {node.content.caption}
              </div>
            )}
            <div className="text-xl sm:text-2xl font-bold leading-snug">
              {displayText || 'Editorial Banner'}
            </div>
          </div>
        </div>
      );
      break;
    }

    case 'embed': {
      const embedUrl = node.content?.embedUrl;
      const safe = isSafeHttpsEmbed(embedUrl);
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`overflow-hidden ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {safe && !isEditor ? (
            <iframe
              src={embedUrl}
              title={node.name}
              sandbox="allow-scripts allow-same-origin allow-popups"
              className="w-full min-h-[260px] border-0 block"
            />
          ) : (
            <div className="p-6 flex flex-col items-center justify-center text-center min-h-[180px] gap-1.5">
              <ExternalLink className="w-5 h-5" style={{ color: 'var(--color-accent)' }} />
              <div style={{ color: 'var(--color-heading)' }} className="text-xs font-semibold">
                {safe ? `Sandboxed Embed: ${embedUrl}` : 'Sandboxed External Embed'}
              </div>
              <div style={{ color: 'var(--color-text-muted)' }} className="text-[11px] max-w-xs">
                {node.content?.caption || 'Configure an https:// URL in Properties'}
              </div>
            </div>
          )}
        </div>
      );
      break;
    }

    case 'navbar':
    case 'nav-menu': {
      const resolveMenuLinks = (): NonNullable<NonNullable<ElementNode['content']>['navLinks']> => {
        if (node.content?.navSource === 'site-pages' && sitePages && sitePages.length > 0) {
          const topPages = sitePages.filter((p) => p.navVisible && !p.parentPageId);
          return topPages.map((p) => {
            const subPages = sitePages.filter((c) => c.navVisible && c.parentPageId === p.id);
            return {
              id: `sp_${p.id}`,
              label: p.name,
              url: p.fullPath,
              children:
                subPages.length > 0
                  ? subPages.map((c) => ({
                      id: `sp_${c.id}`,
                      label: c.name,
                      url: c.fullPath,
                    }))
                  : undefined,
            };
          });
        }
        return node.content?.navLinks || [];
      };

      const links = resolveMenuLinks() || [];
      const isNavbar = node.type === 'navbar';
      const variant = node.content?.navVariant || (isNavbar ? 'split' : 'horizontal-inline');
      const mobileVariant = node.content?.mobileNavVariant || 'drawer';
      const isCompact = deviceMode !== 'desktop' && (isNavbar || node.content?.mobileMenuEnabled);
      const isMega = variant === 'mega-menu' || variant === 'full-mega';
      const isTabStyle = variant === 'tab-style';
      const isScrollable = variant === 'scrollable-horizontal';
      const isCompactIcon = variant === 'compact-icon';
      const isBreadcrumbVariant = variant === 'breadcrumb';
      const isVertical = variant === 'vertical-sidebar';
      const isBottomMobile = variant === 'bottom-mobile' || mobileVariant === 'bottom';

      const isLinkActive = (url: string) => {
        if (!activePagePath) return false;
        return activePagePath === url;
      };

      const renderSubMenu = (itemId: string, subItems: NonNullable<typeof links>) => {
        if (openDropdownId !== itemId) return null;
        return (
          <div
            role="menu"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              borderRadius: 'var(--theme-radius)',
            }}
            className={`${
              variant === 'full-mega'
                ? 'fixed left-4 right-4 max-w-4xl mx-auto mt-2 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3'
                : isMega
                ? 'absolute left-0 top-full mt-2 w-72 p-3 grid grid-cols-1 gap-1.5'
                : 'absolute left-0 top-full mt-1.5 min-w-[190px] p-1.5 flex flex-col gap-0.5'
            } z-50 border shadow-lg`}
          >
            {subItems.map((sub) => (
              <div key={sub.id} className="space-y-0.5">
                <a
                  href={isEditor ? undefined : sub.url}
                  onClick={(e) => {
                    setOpenDropdownId(null);
                    navigateOrFollow(sub.url, e);
                  }}
                  style={{ color: 'var(--color-text)' }}
                  className="block px-2.5 py-1.5 rounded text-xs font-medium no-underline hover:bg-black/5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>{sub.label}</span>
                    {sub.badge && (
                      <span className="text-[10px] font-mono opacity-70">{sub.badge}</span>
                    )}
                  </div>
                  {sub.description && (
                    <div
                      style={{ color: 'var(--color-text-muted)' }}
                      className="text-[11px] font-normal mt-0.5"
                    >
                      {sub.description}
                    </div>
                  )}
                </a>
                {sub.children && sub.children.length > 0 && (
                  <div className="pl-3 border-l border-slate-200 ml-2 space-y-0.5">
                    {sub.children.map((nested) => (
                      <a
                        key={nested.id}
                        href={isEditor ? undefined : nested.url}
                        onClick={(e) => {
                          setOpenDropdownId(null);
                          navigateOrFollow(nested.url, e);
                        }}
                        style={{ color: 'var(--color-text-muted)' }}
                        className="block px-2 py-1 text-[11px] no-underline hover:opacity-80"
                      >
                        {nested.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      };

      const renderDesktopLinkList = () => {
        if (isBreadcrumbVariant) {
          return (
            <div className="flex items-center flex-wrap gap-1.5">
              {links.map((item, idx) => (
                <React.Fragment key={item.id}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-55 shrink-0" />}
                  <a
                    href={isEditor ? undefined : item.url}
                    aria-current={isLinkActive(item.url) ? 'page' : undefined}
                    onClick={(e) => navigateOrFollow(item.url, e)}
                    style={{
                      color: isLinkActive(item.url)
                        ? 'var(--color-heading)'
                        : 'var(--color-text)',
                    }}
                    className={`text-xs no-underline hover:underline whitespace-nowrap ${
                      isLinkActive(item.url) ? 'font-bold' : 'font-medium'
                    }`}
                  >
                    {item.label}
                  </a>
                </React.Fragment>
              ))}
            </div>
          );
        }

        return (
          <div
            className={`flex ${
              isVertical
                ? 'flex-col items-start gap-2'
                : isScrollable
                ? 'flex-row items-center gap-4 overflow-x-auto max-w-full pb-0.5'
                : 'flex-row items-center flex-wrap gap-5'
            }`}
          >
            {links.map((item) => {
              const hasSub = Boolean(item.children && item.children.length > 0);
              const isActive = isLinkActive(item.url);
              const isOpen = openDropdownId === item.id;

              return (
                <div
                  key={item.id}
                  className="relative flex items-center"
                  onMouseLeave={() => {
                    if (!isEditor && node.content?.submenuTrigger === 'click-hover' && isOpen) {
                      setOpenDropdownId(null);
                    }
                  }}
                >
                  <a
                    href={isEditor ? undefined : item.url}
                    target={!isEditor && item.targetBlank ? '_blank' : undefined}
                    rel={!isEditor && item.targetBlank ? 'noopener noreferrer' : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={(e) => {
                      if (hasSub && !isEditor) {
                        e.preventDefault();
                        setOpenDropdownId((prev) => (prev === item.id ? null : item.id));
                        return;
                      }
                      navigateOrFollow(item.url, e);
                    }}
                    onMouseEnter={() => {
                      if (!isEditor && hasSub && node.content?.submenuTrigger === 'click-hover') {
                        setOpenDropdownId(item.id);
                      }
                    }}
                    style={{
                      color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                      borderBottom:
                        isTabStyle && isActive
                          ? '2px solid var(--color-primary)'
                          : isTabStyle
                          ? '2px solid transparent'
                          : undefined,
                    }}
                    className={`inline-flex items-center gap-1.5 text-sm no-underline hover:opacity-80 whitespace-nowrap ${
                      isActive ? 'font-semibold' : 'font-medium'
                    } ${isTabStyle ? 'py-1.5 px-1' : ''}`}
                  >
                    {isCompactIcon && item.iconName && (
                      <CuratedIcon name={item.iconName} className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{item.label}</span>
                  </a>
                  {hasSub && (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-haspopup="menu"
                      aria-label={`Toggle ${item.label} submenu`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdownId((prev) => (prev === item.id ? null : item.id));
                      }}
                      style={{ color: 'var(--color-text-muted)' }}
                      className="p-1 ml-0.5 rounded hover:bg-black/5"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  )}
                  {hasSub && renderSubMenu(item.id, item.children!)}
                </div>
              );
            })}
          </div>
        );
      };

      const renderMobileLinksOverlay = () => {
        if (!mobileNavOpen) return null;
        const closeAndFollow = (url: string, e: React.MouseEvent) => {
          setMobileNavOpen(false);
          navigateOrFollow(url, e);
        };

        if (mobileVariant === 'fullscreen') {
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Site navigation"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
              className="fixed inset-0 z-50 p-6 flex flex-col justify-between overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <span
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--color-heading)' }}
                  className="text-lg font-bold"
                >
                  {node.content?.logoText || 'Navigation'}
                </span>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileNavOpen(false);
                    requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus());
                  }}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 py-6 flex flex-col gap-3">
                {links.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <a
                      href={isEditor ? undefined : item.url}
                      aria-current={isLinkActive(item.url) ? 'page' : undefined}
                      onClick={(e) => closeAndFollow(item.url, e)}
                      style={{
                        color: isLinkActive(item.url)
                          ? 'var(--color-primary)'
                          : 'var(--color-heading)',
                      }}
                      className="block py-2 text-lg font-semibold no-underline"
                    >
                      {item.label}
                    </a>
                    {item.children?.map((sub) => (
                      <a
                        key={sub.id}
                        href={isEditor ? undefined : sub.url}
                        onClick={(e) => closeAndFollow(sub.url, e)}
                        style={{ color: 'var(--color-text-muted)' }}
                        className="block pl-4 py-1 text-sm no-underline"
                      >
                        {sub.label}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
              {node.content?.ctaLabel && (
                <a
                  href={isEditor ? undefined : node.content.ctaUrl || '/contact'}
                  onClick={(e) => closeAndFollow(node.content?.ctaUrl || '/contact', e)}
                  style={{
                    backgroundColor: 'var(--color-button-primary-bg)',
                    color: 'var(--color-button-primary-text)',
                    borderRadius: 'var(--theme-radius)',
                  }}
                  className="w-full py-3 text-sm font-semibold text-center no-underline"
                >
                  {node.content.ctaLabel}
                </a>
              )}
            </div>
          );
        }

        if (mobileVariant === 'off-canvas') {
          const isLeft = node.content?.drawerSide === 'left';
          return (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Side navigation panel"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
              }}
              className={`fixed top-0 bottom-0 ${
                isLeft ? 'left-0 border-r' : 'right-0 border-l'
              } w-72 max-w-[85vw] z-50 p-5 shadow-2xl flex flex-col gap-4 overflow-y-auto`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="text-sm font-bold">{node.content?.logoText || 'Menu'}</span>
                <button
                  type="button"
                  aria-label="Close side menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileNavOpen(false);
                    requestAnimationFrame(() => mobileMenuTriggerRef.current?.focus());
                  }}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-md border border-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {links.map((item) => (
                  <a
                    key={item.id}
                    href={isEditor ? undefined : item.url}
                    aria-current={isLinkActive(item.url) ? 'page' : undefined}
                    onClick={(e) => closeAndFollow(item.url, e)}
                    style={{
                      color: isLinkActive(item.url)
                        ? 'var(--color-primary)'
                        : 'var(--color-text)',
                    }}
                    className="py-2 text-sm font-medium no-underline"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
            className="w-full mt-3 pt-3 border-t flex flex-col gap-2"
          >
            {links.map((item) => (
              <div key={item.id} className="space-y-1">
                <a
                  href={isEditor ? undefined : item.url}
                  aria-current={isLinkActive(item.url) ? 'page' : undefined}
                  onClick={(e) => closeAndFollow(item.url, e)}
                  style={{
                    color: isLinkActive(item.url) ? 'var(--color-primary)' : 'var(--color-text)',
                  }}
                  className="block py-1.5 text-sm font-medium no-underline"
                >
                  {item.label}
                </a>
                {item.children && item.children.length > 0 && (
                  <div className="pl-3 border-l border-slate-200 space-y-1">
                    {item.children.map((sub) => (
                      <a
                        key={sub.id}
                        href={isEditor ? undefined : sub.url}
                        onClick={(e) => closeAndFollow(sub.url, e)}
                        style={{ color: 'var(--color-text-muted)' }}
                        className="block py-1 text-xs no-underline"
                      >
                        {sub.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {node.content?.ctaLabel && (
              <a
                href={isEditor ? undefined : node.content.ctaUrl || '/contact'}
                onClick={(e) => closeAndFollow(node.content?.ctaUrl || '/contact', e)}
                style={{
                  backgroundColor: 'var(--color-button-primary-bg)',
                  color: 'var(--color-button-primary-text)',
                  borderRadius: 'var(--theme-radius)',
                }}
                className="mt-1 px-4 py-2.5 text-xs font-semibold text-center no-underline"
              >
                {node.content.ctaLabel}
              </a>
            )}
          </div>
        );
      };

      if (isBottomMobile && deviceMode === 'mobile') {
        innerContent = (
          <nav
            {...commonAttrs}
            style={{
              ...effectiveInlineStyle,
              backgroundColor: 'var(--color-surface)',
              borderTop: '1px solid var(--color-border)',
            }}
            className={`w-full px-2 py-1.5 flex items-center justify-around gap-1 ${editorOutlineClass} ${
              node.advanced?.customClasses || ''
            }`}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {isSelected ? editorChrome : null}
            {links.slice(0, 5).map((item) => {
              const active = isLinkActive(item.url);
              return (
                <a
                  key={item.id}
                  href={isEditor ? undefined : item.url}
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => navigateOrFollow(item.url, e)}
                  style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
                  className="min-h-[44px] px-2 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium no-underline"
                >
                  {item.iconName && <CuratedIcon name={item.iconName} className="w-4 h-4" />}
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        );
        break;
      }

      innerContent = (
        <nav
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {isNavbar ? (
            <div className="w-full flex items-center justify-between gap-4">
              <a
                href={isEditor ? undefined : node.content?.url || '/'}
                onClick={(e) => navigateOrFollow(node.content?.url || '/', e)}
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--color-heading)',
                }}
                className="text-base font-bold no-underline whitespace-nowrap"
              >
                {node.content?.logoText || 'Portfolio'}
              </a>

              {!isCompact ? (
                <div className="flex items-center gap-6">
                  {renderDesktopLinkList()}
                  {node.content?.ctaLabel && (
                    <a
                      href={isEditor ? undefined : node.content.ctaUrl || '/contact'}
                      onClick={(e) => navigateOrFollow(node.content?.ctaUrl || '/contact', e)}
                      style={{
                        backgroundColor: 'var(--color-button-primary-bg)',
                        color: 'var(--color-button-primary-text)',
                        borderRadius: 'var(--theme-radius)',
                      }}
                      className="px-3.5 py-2 text-xs font-semibold no-underline whitespace-nowrap"
                    >
                      {node.content.ctaLabel}
                    </a>
                  )}
                </div>
              ) : (
                node.content?.mobileMenuEnabled !== false && (
                  <button
                    ref={mobileMenuTriggerRef}
                    type="button"
                    aria-expanded={mobileNavOpen}
                    aria-label="Toggle navigation menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isEditor) onSelect?.(node.id, e);
                      setMobileNavOpen((prev) => !prev);
                    }}
                    style={{
                      color: 'var(--color-heading)',
                      borderColor: 'var(--color-border)',
                    }}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md border"
                  >
                    {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                  </button>
                )
              )}
            </div>
          ) : !isCompact || isScrollable ? (
            renderDesktopLinkList()
          ) : (
            <div className="w-full flex flex-col">
              <button
                ref={mobileMenuTriggerRef}
                type="button"
                aria-expanded={mobileNavOpen}
                aria-label="Toggle navigation menu"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isEditor) onSelect?.(node.id, e);
                  setMobileNavOpen((prev) => !prev);
                }}
                style={{
                  color: 'var(--color-heading)',
                  borderColor: 'var(--color-border)',
                }}
                className="self-end min-h-[40px] px-2.5 flex items-center gap-1.5 rounded-md border text-xs font-medium"
              >
                {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                <span>Menu</span>
              </button>
              {renderMobileLinksOverlay()}
            </div>
          )}

          {isNavbar && isCompact && renderMobileLinksOverlay()}
        </nav>
      );
      break;
    }

    case 'breadcrumbs': {
      const links = node.content?.navLinks || [];
      innerContent = (
        <nav
          {...commonAttrs}
          aria-label="Breadcrumb"
          style={effectiveInlineStyle}
          className={`flex items-center flex-wrap gap-1.5 ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {links.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />}
              <a
                href={isEditor ? undefined : item.url}
                onClick={(e) => navigateOrFollow(item.url, e)}
                style={{
                  color:
                    idx === links.length - 1
                      ? 'var(--color-heading)'
                      : 'var(--color-text-muted)',
                }}
                className={`no-underline text-xs ${
                  idx === links.length - 1 ? 'font-semibold' : 'hover:underline'
                }`}
              >
                {item.label}
              </a>
            </React.Fragment>
          ))}
        </nav>
      );
      break;
    }

    case 'pagination': {
      const links = node.content?.navLinks || [];
      innerContent = (
        <nav
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {links.map((item) => (
            <a
              key={item.id}
              href={isEditor ? undefined : item.url}
              onClick={(e) => navigateOrFollow(item.url, e)}
              style={{ color: 'var(--color-link)' }}
              className="text-sm font-semibold no-underline hover:underline"
            >
              {item.label}
            </a>
          ))}
        </nav>
      );
      break;
    }

    case 'social-links': {
      const links = node.content?.navLinks || [];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {links.map((item) => (
            <a
              key={item.id}
              href={isEditor ? undefined : item.url}
              target={!isEditor && item.targetBlank ? '_blank' : undefined}
              rel={!isEditor && item.targetBlank ? 'noopener noreferrer' : undefined}
              onClick={(e) => navigateOrFollow(item.url, e)}
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface-alt)',
                color: 'var(--color-heading)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium no-underline hover:opacity-80"
            >
              {item.iconName && <CuratedIcon name={item.iconName} size={14} />}
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      );
      break;
    }

    case 'form': {
      const cmsFormDef =
        cms?.forms?.find((f) => f.formId === node.content?.formId) || cms?.forms?.[0];
      const hasChildren = Boolean(node.children && node.children.length > 0);
      const formFields = [...(cmsFormDef?.fields || [])].sort((a, b) => a.order - b.order);

      const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isEditor) {
          return;
        }

        const formEl = e.currentTarget;
        const formData = new FormData(formEl);
        const values: Record<string, any> = {};
        const uploadedFiles: Array<{ name: string; url: string; size: string }> = [];

        formData.forEach((value, key) => {
          if (typeof File !== 'undefined' && value instanceof File) {
            if (value.name) {
              const sizeKb = Math.max(1, Math.round(value.size / 1024));
              const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
              values[key] = value.name;
              uploadedFiles.push({
                name: value.name,
                url: `#drive-pending/${encodeURIComponent(value.name)}`,
                size: sizeLabel,
              });
            }
          } else {
            values[key] = value;
          }
        });

        if (uploadedFiles.length > 0) {
          values.__uploadedFiles = uploadedFiles;
        }

        setFormSubmitting(true);
        setFormError(null);

        try {
          const formId = node.content?.formId || cmsFormDef?.formId || 'form_contact_01';
          if (onSubmitForm) {
            await onSubmitForm(
              formId,
              values,
              activePage?.title || activePage?.name || 'Home'
            );
          }
          setFormSubmitted(true);
          if (
            cmsFormDef?.settings?.successAction === 'redirect' &&
            isSafeRedirectUrl(cmsFormDef.settings.redirectUrl)
          ) {
            const safeUrl = cmsFormDef.settings.redirectUrl!.trim();
            setTimeout(() => {
              window.location.assign(safeUrl);
            }, 1200);
          }
        } catch (err: any) {
          setFormError(err?.message || 'Submission failed. Please try again.');
        } finally {
          setFormSubmitting(false);
        }
      };

      innerContent = (
        <form
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onSubmit={handleFormSubmit}
          {...dragHandlers}
        >
          {isSelected ? editorChrome : null}

          {formSubmitted && !isEditor ? (
            <div
              style={{
                backgroundColor: 'var(--color-surface, #f8fafc)',
                borderColor: 'var(--color-border, #e2e8f0)',
                borderRadius: 'var(--theme-radius, 8px)',
              }}
              className="p-6 text-center border shadow-xs space-y-3 my-2"
            >
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <Check className="w-5 h-5" />
              </div>
              <h4 style={{ color: 'var(--color-heading, #0f172a)' }} className="text-sm font-bold">
                {cmsFormDef?.name ? `${cmsFormDef.name} Received` : 'Submission Received'}
              </h4>
              <p
                style={{ color: 'var(--color-body, #475569)' }}
                className="text-xs max-w-md mx-auto leading-relaxed"
              >
                {cmsFormDef?.settings?.successMessage ||
                  'Thank you! Your inquiry has been sent to our studio inbox.'}
              </p>
              <button
                type="button"
                onClick={() => setFormSubmitted(false)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer pt-1 inline-block"
              >
                Submit another response
              </button>
            </div>
          ) : (
            <>
              {formFields.length > 0 ? (
                <div className="space-y-4 mb-4">
                  {formFields.map((f) => (
                    <div key={f.fieldId} className="space-y-1.5 text-left">
                      <label
                        style={{ color: 'var(--color-heading, #0f172a)' }}
                        className="block text-xs font-semibold"
                      >
                        {f.label}
                        {f.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>

                      {f.type === 'textarea' ? (
                        <textarea
                          name={f.key}
                          placeholder={f.placeholder}
                          required={f.required}
                          rows={4}
                          className="w-full px-3 py-2 text-xs border rounded-md transition-colors"
                          style={{
                            borderColor: 'var(--color-border, #cbd5e1)',
                            backgroundColor: 'var(--color-surface, #ffffff)',
                            color: 'var(--color-body, #334155)',
                            borderRadius: 'var(--theme-radius, 6px)',
                          }}
                        />
                      ) : f.type === 'select' ? (
                        <select
                          name={f.key}
                          required={f.required}
                          className="w-full px-3 py-2 text-xs border rounded-md transition-colors"
                          style={{
                            borderColor: 'var(--color-border, #cbd5e1)',
                            backgroundColor: 'var(--color-surface, #ffffff)',
                            color: 'var(--color-body, #334155)',
                            borderRadius: 'var(--theme-radius, 6px)',
                          }}
                        >
                          <option value="">{f.placeholder || `Select ${f.label}...`}</option>
                          {(f.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : f.type === 'checkbox' ? (
                        <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                          <input
                            type="checkbox"
                            name={f.key}
                            required={f.required}
                            className="rounded border-slate-300 text-blue-600 focus:ring-0"
                          />
                          <span
                            style={{ color: 'var(--color-body, #334155)' }}
                            className="text-xs"
                          >
                            {f.placeholder || f.label}
                          </span>
                        </label>
                      ) : f.type === 'radio' ? (
                        <div className="flex flex-wrap gap-4 pt-1">
                          {(f.options || []).map((opt) => (
                            <label
                              key={opt}
                              className="inline-flex items-center gap-1.5 cursor-pointer text-xs"
                            >
                              <input
                                type="radio"
                                name={f.key}
                                value={opt}
                                required={f.required}
                                className="text-blue-600 focus:ring-0"
                              />
                              <span style={{ color: 'var(--color-body, #334155)' }}>{opt}</span>
                            </label>
                          ))}
                        </div>
                      ) : f.type === 'file' ? (
                        <input
                          type="file"
                          name={f.key}
                          required={f.required}
                          className="w-full px-3 py-2 text-xs border rounded-md"
                          style={{
                            borderColor: 'var(--color-border, #cbd5e1)',
                            backgroundColor: 'var(--color-surface, #ffffff)',
                            color: 'var(--color-body, #334155)',
                            borderRadius: 'var(--theme-radius, 6px)',
                          }}
                        />
                      ) : (
                        <input
                          type={f.type === 'phone' ? 'tel' : f.type}
                          name={f.key}
                          placeholder={f.placeholder}
                          required={f.required}
                          className="w-full px-3 py-2 text-xs border rounded-md transition-colors"
                          style={{
                            borderColor: 'var(--color-border, #cbd5e1)',
                            backgroundColor: 'var(--color-surface, #ffffff)',
                            color: 'var(--color-body, #334155)',
                            borderRadius: 'var(--theme-radius, 6px)',
                          }}
                        />
                      )}

                      {f.helpText && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{f.helpText}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : hasChildren ? (
                renderChildren()
              ) : null}

              {formError && (
                <div className="p-2.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 mb-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-1 flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{
                    backgroundColor: 'var(--color-button-primary-bg)',
                    color: 'var(--color-button-primary-text)',
                    borderRadius: 'var(--theme-radius)',
                  }}
                  className="px-5 py-2.5 text-xs font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 transition-opacity"
                >
                  {formSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>
                      {node.content?.text ||
                        cmsFormDef?.settings?.submitButtonText ||
                        'Send Inquiry'}
                    </span>
                  )}
                </button>

                {isEditor && (
                  <span
                    style={{ color: 'var(--color-accent)' }}
                    className="text-[11px] font-medium inline-flex items-center gap-1 opacity-70"
                  >
                    <Info className="w-3 h-3" />
                    Interactive in Preview
                  </span>
                )}
              </div>
            </>
          )}
        </form>
      );
      break;
    }

    case 'text-input': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-1.5 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {node.content?.fieldLabel && (
            <label style={{ color: 'var(--color-heading)' }} className="block text-xs font-semibold">
              {node.content.fieldLabel}
              {node.content.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
          )}
          <input
            type={node.content?.inputType || 'text'}
            placeholder={node.content?.placeholder || ''}
            readOnly={isEditor}
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              borderRadius: 'var(--theme-radius)',
            }}
            className="w-full px-3 py-2 text-sm border"
          />
        </div>
      );
      break;
    }

    case 'textarea': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-1.5 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {node.content?.fieldLabel && (
            <label style={{ color: 'var(--color-heading)' }} className="block text-xs font-semibold">
              {node.content.fieldLabel}
              {node.content.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
          )}
          <textarea
            rows={4}
            placeholder={node.content?.placeholder || ''}
            readOnly={isEditor}
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              borderRadius: 'var(--theme-radius)',
            }}
            className="w-full px-3 py-2 text-sm border"
          />
        </div>
      );
      break;
    }

    case 'select': {
      const options = node.content?.options || ['Option 1', 'Option 2'];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-1.5 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {node.content?.fieldLabel && (
            <label style={{ color: 'var(--color-heading)' }} className="block text-xs font-semibold">
              {node.content.fieldLabel}
            </label>
          )}
          <select
            disabled={isEditor}
            style={{
              backgroundColor: 'var(--color-background)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              borderRadius: 'var(--theme-radius)',
            }}
            className="w-full px-3 py-2 text-sm border"
          >
            {options.map((opt, idx) => (
              <option key={idx} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
      break;
    }

    case 'checkbox': {
      innerContent = (
        <label
          {...commonAttrs}
          style={{ ...(effectiveInlineStyle || {}), color: 'var(--color-text)' }}
          className={`flex items-center gap-2.5 text-sm cursor-pointer ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <input
            type="checkbox"
            checked={toggleChecked}
            onChange={(e) => !isEditor && setToggleChecked(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span>{node.content?.fieldLabel || 'Checkbox option'}</span>
        </label>
      );
      break;
    }

    case 'radio-group': {
      const options = node.content?.options || ['Option A', 'Option B'];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-2 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {node.content?.fieldLabel && (
            <div style={{ color: 'var(--color-heading)' }} className="text-xs font-semibold">
              {node.content.fieldLabel}
            </div>
          )}
          <div className="space-y-1.5">
            {options.map((opt, idx) => (
              <label
                key={idx}
                style={{ color: 'var(--color-text)' }}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="radio"
                  name={`rad_${node.id}`}
                  checked={selectedRadioIdx === idx}
                  onChange={() => !isEditor && setSelectedRadioIdx(idx)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      );
      break;
    }

    case 'toggle': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`flex items-center justify-between gap-3 ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={(e) => {
            if (isEditor) handleClick(e);
            else setToggleChecked((p) => !p);
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <span style={{ color: 'var(--color-text)' }} className="text-sm font-medium">
            {node.content?.fieldLabel || 'Toggle control'}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={toggleChecked}
            style={{
              backgroundColor: toggleChecked ? 'var(--color-primary)' : 'var(--color-border)',
            }}
            className="w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0"
          >
            <span
              className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                toggleChecked ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      );
      break;
    }

    case 'tabs': {
      const items = node.content?.items || [];
      const activeItem = items[activeTabIdx] || items[0];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-3 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <div
            style={{ borderColor: 'var(--color-border)' }}
            className="flex flex-wrap gap-1 border-b pb-2"
          >
            {items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isEditor) onSelect?.(node.id, e);
                  setActiveTabIdx(idx);
                }}
                style={{
                  backgroundColor:
                    activeTabIdx === idx ? 'var(--color-primary)' : 'var(--color-surface-alt)',
                  color:
                    activeTabIdx === idx ? 'var(--color-button-primary-text)' : 'var(--color-text)',
                  borderRadius: 'var(--theme-radius)',
                }}
                className="px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors"
              >
                {item.title}
              </button>
            ))}
          </div>
          {activeItem && (
            <div
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="p-4 border text-sm leading-relaxed"
            >
              {activeItem.description}
            </div>
          )}
        </div>
      );
      break;
    }

    case 'accordion': {
      const items = node.content?.items || [];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-2 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {items.map((item, idx) => {
            const open = openAccordionIdx === idx;
            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  borderRadius: 'var(--theme-radius)',
                }}
                className="border overflow-hidden"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isEditor) onSelect?.(node.id, e);
                    setOpenAccordionIdx(open ? null : idx);
                  }}
                  style={{ color: 'var(--color-heading)' }}
                  className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-sm font-semibold cursor-pointer"
                >
                  <span>{item.title}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open && (
                  <div
                    style={{
                      color: 'var(--color-text-muted)',
                      borderColor: 'var(--color-divider)',
                    }}
                    className="px-4 pb-3.5 pt-2 border-t text-sm leading-relaxed"
                  >
                    {item.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
      break;
    }

    case 'modal-box': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          {...dragHandlers}
        >
          {isSelected ? editorChrome : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isEditor) onSelect?.(node.id, e);
              setModalOpen(true);
            }}
            style={{
              backgroundColor: 'var(--color-button-primary-bg)',
              color: 'var(--color-button-primary-text)',
              borderRadius: 'var(--theme-radius)',
            }}
            className="px-4 py-2 text-sm font-semibold cursor-pointer"
          >
            {node.content?.modalTriggerLabel || 'Open Modal'}
          </button>

          {(modalOpen || isSelected) && (
            <div
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="mt-3 p-4 border shadow-md space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div style={{ color: 'var(--color-heading)' }} className="text-sm font-bold">
                  {node.content?.modalTitle || 'Modal Dialog'}
                </div>
                {modalOpen && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalOpen(false);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="space-y-2">{renderChildren()}</div>
            </div>
          )}
        </div>
      );
      break;
    }

    case 'tooltip': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`inline-flex items-center gap-1.5 group relative ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <span
            tabIndex={0}
            style={{
              color: 'var(--color-heading)',
              borderColor: 'var(--color-border)',
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold border-b border-dashed pb-0.5 cursor-help"
          >
            <Info className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
            <span>{displayText || 'Tooltip'}</span>
          </span>
          <span className="hidden group-hover:block group-focus-within:block absolute left-0 bottom-full mb-2 w-56 p-2.5 rounded-md bg-slate-900 text-white text-[11px] leading-snug shadow-lg z-30">
            {node.content?.tooltipText || 'Tooltip explanation'}
          </span>
        </div>
      );
      break;
    }

    case 'profile-card': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`flex flex-wrap ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <img
            src={displayImageSrc || '/src/assets/images/hero_creative_director_1794451337351.jpg'}
            alt={displayText || 'Profile portrait'}
            className="w-16 h-16 rounded-full object-cover shrink-0 border"
            style={{ borderColor: 'var(--color-border)' }}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div style={{ color: 'var(--color-heading)', fontFamily: 'var(--font-display)' }} className="text-lg font-bold">
              {displayText || 'Alex Rivera'}
            </div>
            {node.content?.caption && (
              <div style={{ color: 'var(--color-text-muted)' }} className="text-sm">
                {node.content.caption}
              </div>
            )}
          </div>
        </div>
      );
      break;
    }

    case 'skills-matrix': {
      const items = node.content?.items || [];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="p-4 border space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span style={{ color: 'var(--color-heading)' }} className="text-sm font-bold">
                  {item.title}
                </span>
                {item.meta && (
                  <span style={{ color: 'var(--color-accent)' }} className="text-[11px] font-mono font-semibold">
                    {item.meta}
                  </span>
                )}
              </div>
              {item.subtitle && (
                <p style={{ color: 'var(--color-text-muted)' }} className="text-xs m-0">
                  {item.subtitle}
                </p>
              )}
            </div>
          ))}
        </div>
      );
      break;
    }

    case 'experience':
    case 'education': {
      const items = node.content?.items || [];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-3 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="p-4 border space-y-1"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div style={{ color: 'var(--color-heading)' }} className="text-sm font-bold">
                  {item.title}
                </div>
                {item.meta && (
                  <div style={{ color: 'var(--color-text-muted)' }} className="text-xs font-mono tabular-nums">
                    {item.meta}
                  </div>
                )}
              </div>
              {item.subtitle && (
                <div style={{ color: 'var(--color-accent)' }} className="text-xs font-semibold">
                  {item.subtitle}
                </div>
              )}
              {item.description && (
                <p style={{ color: 'var(--color-text-muted)' }} className="text-xs pt-1 m-0 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
          ))}
        </div>
      );
      break;
    }

    case 'timeline': {
      const items = node.content?.items || [];
      innerContent = (
        <div
          {...commonAttrs}
          style={{ ...(effectiveInlineStyle || {}), borderColor: 'var(--color-border)' }}
          className={`space-y-4 pl-5 border-l ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {items.map((item) => (
            <div key={item.id} className="relative space-y-0.5">
              <span
                style={{ backgroundColor: 'var(--color-primary)' }}
                className="w-2.5 h-2.5 rounded-full absolute -left-[25px] top-1.5"
              />
              {item.meta && (
                <div style={{ color: 'var(--color-accent)' }} className="text-[11px] font-mono font-semibold">
                  {item.meta}
                </div>
              )}
              <div style={{ color: 'var(--color-heading)' }} className="text-sm font-bold">
                {item.title}
              </div>
              {item.description && (
                <p style={{ color: 'var(--color-text-muted)' }} className="text-xs m-0 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
          ))}
        </div>
      );
      break;
    }

    case 'testimonials': {
      const items = node.content?.items || [];
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="p-5 border flex flex-col justify-between gap-3"
            >
              <p style={{ color: 'var(--color-text)' }} className="text-sm leading-relaxed m-0">
                “{item.description}”
              </p>
              <div>
                <div style={{ color: 'var(--color-heading)' }} className="text-xs font-bold">
                  {item.title}
                </div>
                {item.subtitle && (
                  <div style={{ color: 'var(--color-text-muted)' }} className="text-[11px]">
                    {item.subtitle}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      );
      break;
    }

    case 'data-table': {
      const sheetTab =
        node.content?.repeaterCollection && workspace
          ? workspace.spreadsheet.tabs.find((t) => t.name === node.content?.repeaterCollection)
          : undefined;
      const cols =
        sheetTab && sheetTab.columns.length > 0
          ? sheetTab.columns.slice(0, 4)
          : node.content?.tableColumns || ['Column 1', 'Column 2'];
      const rows =
        sheetTab && sheetTab.rows.length > 0
          ? sheetTab.rows.slice(0, 8).map((r) => cols.map((c) => String(r[c] ?? '')))
          : node.content?.tableRows || [];

      innerContent = (
        <div
          {...commonAttrs}
          style={{
            ...(effectiveInlineStyle || {}),
            borderColor: 'var(--color-border)',
            borderRadius: 'var(--theme-radius)',
          }}
          className={`overflow-x-auto border ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <table className="w-full text-left border-collapse text-xs">
            <thead style={{ backgroundColor: 'var(--color-surface-alt)', borderColor: 'var(--color-border)' }} className="border-b">
              <tr>
                {cols.map((col, idx) => (
                  <th
                    key={idx}
                    style={{ color: 'var(--color-heading)' }}
                    className="px-3.5 py-2.5 font-semibold whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  style={{ borderColor: 'var(--color-divider)' }}
                  className="border-b last:border-b-0"
                >
                  {row.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      style={{ color: 'var(--color-text)' }}
                      className="px-3.5 py-2.5 tabular-nums"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      break;
    }

    case 'svg-graphic': {
      const check = sanitizeSvgMarkup(node.content?.svgMarkup || '');
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {check.valid && check.sanitized ? (
            <div dangerouslySetInnerHTML={{ __html: check.sanitized }} />
          ) : (
            <div className="text-xs text-red-600 p-2 border border-red-200 rounded">
              Invalid or unsafe SVG markup
            </div>
          )}
        </div>
      );
      break;
    }

    case 'chart': {
      const items = node.content?.items || [];
      const maxVal = Math.max(1, ...items.map((i) => Number(i.value || 0)));
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`space-y-3 ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {displayText && (
            <div style={{ color: 'var(--color-heading)' }} className="text-xs font-bold">
              {displayText}
            </div>
          )}
          <div className="space-y-2">
            {items.map((item) => {
              const val = Number(item.value || 0);
              const pct = Math.min(100, Math.round((val / maxVal) * 100));
              return (
                <div key={item.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--color-text)' }} className="font-medium">
                      {item.title}
                    </span>
                    <span style={{ color: 'var(--color-heading)' }} className="font-mono tabular-nums font-semibold">
                      {val}
                    </span>
                  </div>
                  <div
                    style={{ backgroundColor: 'var(--color-surface-alt)' }}
                    className="w-full h-2.5 rounded-full overflow-hidden"
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        backgroundColor: 'var(--color-primary)',
                      }}
                      className="h-full rounded-full transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    }

    case 'map': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`flex flex-wrap items-center justify-between gap-3 ${editorOutlineClass} ${
            node.advanced?.customClasses || ''
          }`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-primary)',
                borderColor: 'var(--color-border)',
              }}
              className="w-10 h-10 rounded-lg border flex items-center justify-center shrink-0"
            >
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div style={{ color: 'var(--color-heading)' }} className="text-sm font-bold truncate">
                {displayText || 'Studio Location'}
              </div>
              {node.content?.caption && (
                <div style={{ color: 'var(--color-text-muted)' }} className="text-xs font-mono truncate">
                  {node.content.caption}
                </div>
              )}
            </div>
          </div>
          {node.content?.url && (
            <a
              href={isEditor ? undefined : node.content.url}
              target={!isEditor ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => isEditor && handleClick(e)}
              style={{ color: 'var(--color-link)' }}
              className="text-xs font-semibold inline-flex items-center gap-1 no-underline hover:underline"
            >
              <span>Open Map</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      );
      break;
    }

    case 'spacer': {
      innerContent = (
        <div
          {...commonAttrs}
          style={{
            ...(effectiveInlineStyle || {}),
            ...(isEditor && !baseStyles.borderColor ? { borderColor: 'var(--color-border)' } : {}),
          }}
          className={`${isEditor ? 'border border-dashed' : ''} ${editorOutlineClass}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          {isEditor && (
            <span
              data-indy-editor-chrome="true"
              style={{ color: 'var(--color-text-muted)' }}
              className="text-[10px] p-1 block font-mono"
            >
              Spacer ({baseStyles.height || '48px'})
            </span>
          )}
        </div>
      );
      break;
    }

    case 'divider': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={editorOutlineClass}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
        </div>
      );
      break;
    }

    case 'html-embed': {
      const rawHtmlCode = node.content?.htmlCode || '';
      const effectiveHtml =
        rawHtmlCode.trim().length > 0
          ? rawHtmlCode
          : isEditor
          ? '<div style="padding:14px;font-size:12px;opacity:0.65;border:1px dashed currentColor;border-radius:6px;text-align:center;">Custom HTML / CSS / JS Sandbox — Edit code in Properties</div>'
          : '';

      const srcDoc = buildIsolatedEmbedSrcDoc({
        embedId: node.id,
        htmlCode: effectiveHtml,
        themeMode: node.content?.embedThemeMode || 'follow-theme',
        themeCssVars,
      });

      const hasExplicitHeight = Boolean(baseStyles.height && baseStyles.height !== 'auto');

      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <div className="w-full h-full overflow-hidden rounded-[inherit]">
            {effectiveHtml ? (
              <iframe
                key={`${node.id}_${embedRunKey}`}
                ref={embedIframeRef}
                title={node.name || 'Custom HTML Sandbox'}
                sandbox="allow-scripts allow-forms"
                srcDoc={srcDoc}
                style={{
                  height: hasExplicitHeight ? '100%' : `${embedHeight}px`,
                  minHeight: isEditor ? '40px' : undefined,
                }}
                className="w-full border-0 block bg-transparent overflow-hidden"
              />
            ) : null}
          </div>
          {isEditor && !isSelected && (
            <div
              data-indy-editor-chrome="true"
              className="absolute inset-0 z-10 cursor-pointer"
              onClick={handleClick}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            />
          )}
        </div>
      );
      break;
    }

    case 'repeater': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          {...dragHandlers}
        >
          {isSelected ? editorChrome : null}
          {repeaterItems || renderChildren()}
        </div>
      );
      break;
    }

    case 'post-grid':
    case 'post-list':
    case 'related-content': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <CmsCollectionGridOrList
            node={node}
            cms={cms}
            isEditor={isEditor}
            deviceMode={deviceMode}
            currentRecord={currentRecord}
            onSelectElement={(id, e) => onSelect?.(id, e)}
            onNavigatePage={onNavigatePage}
          />
        </div>
      );
      break;
    }

    case 'post-carousel':
    case 'post-slider':
    case 'slide-carousel':
    case 'custom-carousel':
    case 'media-carousel': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <CmsCarouselWidget
            node={node}
            cms={cms}
            isEditor={isEditor}
            deviceMode={deviceMode}
            reduceMotionPreview={reduceMotionPreview}
            onSelectElement={(id, e) => onSelect?.(id, e)}
            onNavigatePage={onNavigatePage}
          />
        </div>
      );
      break;
    }

    case 'taxonomy-list':
    case 'taxonomy-filter': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <CmsTaxonomyWidget
            node={node}
            cms={cms}
            isEditor={isEditor}
            deviceMode={deviceMode}
            onSelectElement={(id, e) => onSelect?.(id, e)}
            onNavigatePage={onNavigatePage}
          />
        </div>
      );
      break;
    }

    case 'content-counter':
    case 'cms-pagination': {
      innerContent = (
        <div
          {...commonAttrs}
          style={effectiveInlineStyle}
          className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
          onClick={handleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isSelected ? editorChrome : null}
          <CmsUtilityWidget
            node={node}
            cms={cms}
            isEditor={isEditor}
            deviceMode={deviceMode}
            onSelectElement={(id, e) => onSelect?.(id, e)}
          />
        </div>
      );
      break;
    }

    default: {
      const Tag = (node.tag || 'div') as keyof React.JSX.IntrinsicElements;
      const isHeaderRegionRoot = node.tag === 'header';
      const isFooterRegionRoot = node.tag === 'footer';
      innerContent = (
        <>
          {isHeaderRegionRoot && node.content?.announcementText && (
            <div
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-button-primary-text)',
              }}
              className="w-full px-4 py-1.5 text-center text-xs font-medium"
            >
              {node.content.announcementUrl ? (
                <a
                  href={isEditor ? undefined : node.content.announcementUrl}
                  onClick={(e) => navigateOrFollow(node.content?.announcementUrl, e)}
                  className="text-inherit no-underline hover:underline"
                >
                  {node.content.announcementText}
                </a>
              ) : (
                <span>{node.content.announcementText}</span>
              )}
            </div>
          )}
          <Tag
            {...commonAttrs}
            style={effectiveInlineStyle}
            className={`relative ${editorOutlineClass} ${node.advanced?.customClasses || ''}`}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            {...dragHandlers}
          >
            {dropIndicator}
            {isSelected ? editorChrome : null}
            {renderChildren()}
            {isHeaderRegionRoot && node.content?.showSearchBox && (
              <div
                style={{ borderColor: 'var(--color-border)' }}
                className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded border text-[11px] opacity-80 shrink-0"
                title="Visual layout placeholder shell"
              >
                <input
                  type="search"
                  readOnly={isEditor}
                  placeholder="Search placeholder..."
                  aria-label="Visual search shell placeholder"
                  className="bg-transparent outline-none w-32 text-xs"
                />
              </div>
            )}
            {isFooterRegionRoot && node.content?.newsletterPlaceholder && (
              <div className="w-full pt-3 mt-2 border-t border-slate-200/30 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] opacity-75">
                  Newsletter visual placeholder (connect a form action to collect responses)
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="email"
                    readOnly={isEditor}
                    placeholder={node.content.newsletterPlaceholder}
                    className="px-2.5 py-1.5 rounded border border-slate-300 text-xs bg-white text-slate-900"
                  />
                  <span
                    style={{
                      backgroundColor: 'var(--color-button-primary-bg)',
                      color: 'var(--color-button-primary-text)',
                    }}
                    className="px-3 py-1.5 rounded text-xs font-semibold"
                  >
                    {node.content.newsletterButtonLabel || 'Subscribe'}
                  </span>
                </div>
              </div>
            )}
            {isFooterRegionRoot && node.content?.showBackToTop && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isEditor && typeof window !== 'undefined') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                style={{
                  color: 'var(--color-text-muted)',
                  borderColor: 'var(--color-border)',
                }}
                className="self-end mt-1 px-2.5 py-1 rounded border text-[11px] font-medium hover:opacity-80"
              >
                ↑ Back to top
              </button>
            )}
            {isEditor && (!node.children || node.children.length === 0) && (
              <div
                data-indy-editor-chrome="true"
                style={{
                  borderColor: isDropHovered ? '#10b981' : 'var(--color-border)',
                  color: isDropHovered ? '#047857' : 'var(--color-text-muted)',
                }}
                className={`p-6 border border-dashed rounded-lg flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  isDropHovered ? 'bg-emerald-50/60' : 'hover:opacity-80'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild?.(node.id);
                }}
              >
                <Plus className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium text-center">
                  {isDropHovered
                    ? `Drop here to nest inside ${node.name}`
                    : 'Empty Container · Drop element or tap to add'}
                </span>
              </div>
            )}
          </Tag>
        </>
      );
      return innerContent;
    }
  }

  if (isEditor && React.isValidElement(innerContent) && innerContent.type !== React.Fragment) {
    const existingProps = innerContent.props as { children?: React.ReactNode };
    return React.cloneElement(
      innerContent as React.ReactElement<any>,
      dragHandlers,
      dropIndicator,
      existingProps.children
    );
  }

  return innerContent;
};
