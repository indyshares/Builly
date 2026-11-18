import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ElementFamily,
  ElementNode,
  InsertionPlacement,
  LibraryItem,
  PageDocument,
  SiteDocument,
} from '../../types/builder';
import {
  ELEMENT_CATEGORY_META,
  ELEMENT_REGISTRY,
  ElementDefinition,
  canNestElement,
  isContainerElementType,
} from '../../data/elementRegistry';
import {
  countLinkedInstancesInSite,
  getAllLibraryItems,
  instantiateLibraryItem,
} from '../../services/componentLibraryService';
import {
  findNodeParentAndIndex,
  getRegionContextForNode,
} from '../../services/treeCommandService';
import { useBuilderDrag } from '../../contexts/BuilderDragContext';
import { loadBuilderUiPrefs, saveBuilderUiPrefs } from '../../services/builderUiPrefs';
import { CuratedIcon } from './CuratedIcon';
import {
  AlertTriangle,
  Clock,
  Copy,
  Eye,
  GripVertical,
  LayoutGrid,
  Link2,
  List,
  PlusCircle,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';

interface ElementLibraryPanelProps {
  site: SiteDocument;
  activePage: PageDocument | null;
  selectedNode: ElementNode | null;
  insertionPlacement: InsertionPlacement;
  onChangeInsertionPlacement: (placement: InsertionPlacement) => void;
  onInsertElementNode: (node: ElementNode, elementTypeKey?: string) => void;
  onToggleFavoriteElement: (elementType: string) => void;
  onDeleteLibraryItem: (itemId: string) => void;
  onDuplicateLibraryItem: (itemId: string) => void;
  onSyncLinkedInstances: (item: LibraryItem) => void;
  onSaveSelectionAsLibrary?: () => void;
}

type LibraryModeTab = 'elements' | 'templates' | 'my-library';

export const ElementLibraryPanel: React.FC<ElementLibraryPanelProps> = ({
  site,
  activePage,
  selectedNode,
  insertionPlacement,
  onChangeInsertionPlacement,
  onInsertElementNode,
  onToggleFavoriteElement,
  onDeleteLibraryItem,
  onDuplicateLibraryItem,
  onSyncLinkedInstances,
  onSaveSelectionAsLibrary,
}) => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<LibraryModeTab>('elements');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<'all' | ElementFamily>('all');
  const [templateFilter, setTemplateFilter] = useState<
    | 'all'
    | 'component'
    | 'section-template'
    | 'header-template'
    | 'navigation-template'
    | 'footer-template'
  >('all');
  const [insertAsLinked, setInsertAsLinked] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<LibraryItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(
    () => loadBuilderUiPrefs().libraryViewMode
  );

  const handleChangeViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    const current = loadBuilderUiPrefs();
    saveBuilderUiPrefs({ ...current, libraryViewMode: mode });
  };

  const { startDrag, endDrag } = useBuilderDrag();
  const favorites = site.elementPrefs?.favorites || [];
  const recent = site.elementPrefs?.recent || [];

  const selectedRegionContext = useMemo(
    () => (selectedNode ? getRegionContextForNode(site, activePage, selectedNode.id) : null),
    [site, activePage, selectedNode]
  );

  const selectedLocation = useMemo(() => {
    if (!selectedNode || !selectedRegionContext) return null;
    return findNodeParentAndIndex(selectedRegionContext.root, selectedNode.id);
  }, [selectedNode, selectedRegionContext]);

  const isSelectedRegionRoot = Boolean(
    selectedNode && selectedRegionContext && selectedNode.id === selectedRegionContext.root.id
  );

  const canInsertIntoSelected = Boolean(
    selectedNode &&
      isContainerElementType(selectedNode.type) &&
      !selectedNode.locked &&
      selectedNode.componentRef?.mode !== 'linked'
  );

  const canInsertSibling = Boolean(
    selectedNode &&
      selectedLocation?.parent &&
      !isSelectedRegionRoot &&
      !selectedLocation.parent.locked &&
      selectedLocation.parent.componentRef?.mode !== 'linked'
  );

  // Target container & depth check for nesting validation feedback
  const effectiveTargetMeta = useMemo(() => {
    if (insertionPlacement === 'into-selected' && canInsertIntoSelected && selectedNode) {
      return { parent: selectedNode, depth: selectedLocation?.depth ?? 0 };
    }
    if (
      (insertionPlacement === 'before-selected' || insertionPlacement === 'after-selected') &&
      canInsertSibling &&
      selectedLocation?.parent
    ) {
      return {
        parent: selectedLocation.parent,
        depth: Math.max(0, selectedLocation.depth - 1),
      };
    }
    if (insertionPlacement === 'first-child') {
      if (canInsertIntoSelected && selectedNode) {
        return { parent: selectedNode, depth: selectedLocation?.depth ?? 0 };
      }
      return { parent: activePage?.rootElement || null, depth: 0 };
    }
    return { parent: activePage?.rootElement || null, depth: 0 };
  }, [
    insertionPlacement,
    canInsertIntoSelected,
    canInsertSibling,
    selectedNode,
    selectedLocation,
    activePage,
  ]);

  const insertionSummaryLabel = useMemo(() => {
    if (!activePage) return t('elementLibrary.summary.noPage');
    if (insertionPlacement === 'before-selected') {
      return canInsertSibling && selectedNode
        ? t('elementLibrary.summary.before', { name: selectedNode.name })
        : t('elementLibrary.summary.fallbackSibling', { name: activePage.name });
    }
    if (insertionPlacement === 'after-selected') {
      return canInsertSibling && selectedNode
        ? t('elementLibrary.summary.after', { name: selectedNode.name })
        : t('elementLibrary.summary.fallbackSibling', { name: activePage.name });
    }
    if (insertionPlacement === 'into-selected') {
      return canInsertIntoSelected && selectedNode
        ? t('elementLibrary.summary.inside', { name: selectedNode.name })
        : t('elementLibrary.summary.fallbackContainer', { name: activePage.name });
    }
    if (insertionPlacement === 'first-child') {
      return canInsertIntoSelected && selectedNode
        ? t('elementLibrary.summary.firstChild', { name: selectedNode.name })
        : t('elementLibrary.summary.startOfPage', { name: activePage.name });
    }
    return t('elementLibrary.summary.endOfPage', { name: activePage.name });
  }, [
    activePage,
    insertionPlacement,
    canInsertSibling,
    canInsertIntoSelected,
    selectedNode,
    t,
  ]);

  const filteredElements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ELEMENT_REGISTRY.filter((el) => {
      const matchesFamily = selectedFamily === 'all' || el.family === selectedFamily;
      if (!matchesFamily) return false;
      if (!q) return true;
      return (
        el.name.toLowerCase().includes(q) ||
        el.description.toLowerCase().includes(q) ||
        el.family.toLowerCase().includes(q) ||
        el.subcategory.toLowerCase().includes(q) ||
        el.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedFamily]);

  const favoriteDefinitions = useMemo(
    () =>
      favorites
        .map((elType) => ELEMENT_REGISTRY.find((el) => el.elementType === elType))
        .filter((x): x is ElementDefinition => Boolean(x)),
    [favorites]
  );

  const recentDefinitions = useMemo(
    () =>
      recent
        .map((elType) => ELEMENT_REGISTRY.find((el) => el.elementType === elType))
        .filter((x): x is ElementDefinition => Boolean(x))
        .slice(0, 6),
    [recent]
  );

  const allLibraryItems = useMemo(() => getAllLibraryItems(site), [site]);

  const filteredLibraryItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allLibraryItems.filter((item) => {
      const matchesOwnership =
        subTab === 'templates' ? Boolean(item.isBuiltIn) : !item.isBuiltIn;
      if (!matchesOwnership) return false;
      if (templateFilter !== 'all' && item.type !== templateFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [allLibraryItems, subTab, templateFilter, searchQuery]);

  const handleClickElement = (def: ElementDefinition) => {
    const node = def.defaultNode();
    onInsertElementNode(node, def.elementType);
  };

  const handleInsertLibraryItem = (item: LibraryItem) => {
    const mode = insertAsLinked && item.type === 'component' ? 'linked' : 'independent';
    const node = instantiateLibraryItem(item, mode);
    if (!node) return;
    onInsertElementNode(node);
    setPreviewItem(null);
  };

  return (
    <div className="space-y-3.5">
      {/* Sub-Navigation: Elements | Components & Templates | My Library */}
      <div className="grid grid-cols-3 gap-1 bg-[var(--builder-surface-muted)] p-1 rounded-lg border border-[var(--builder-border)]">
        {(
          [
            { id: 'elements', label: t('elementLibrary.tabs.elements') },
            { id: 'templates', label: t('elementLibrary.tabs.templates') },
            { id: 'my-library', label: t('elementLibrary.tabs.myLibrary') },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`min-h-[34px] px-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap ${
              subTab === tab.id
                ? 'bg-[var(--builder-panel-bg)] text-[var(--builder-text-primary)] shadow-xs'
                : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--builder-text-muted)] pointer-events-none" />
        <input
          type="text"
          aria-label={t('elementLibrary.searchAria')}
          placeholder={
            subTab === 'elements'
              ? t('elementLibrary.searchElementsPlaceholder')
              : t('elementLibrary.searchTemplatesPlaceholder')
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full min-h-[38px] text-xs pl-9 pr-8 py-2 border border-[var(--builder-border)] rounded-lg focus:outline-none focus:border-[var(--builder-primary)] bg-[var(--builder-panel-bg)] text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label={t('elementLibrary.clearSearchAria')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--builder-text-muted)] hover:text-[var(--builder-text-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Insertion Target Bar */}
      <div className="p-2.5 bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] rounded-lg space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-[var(--builder-text-primary)]">
            {t('elementLibrary.insertionTarget')}
          </span>
          {selectedNode && onSaveSelectionAsLibrary && (
            <button
              type="button"
              onClick={onSaveSelectionAsLibrary}
              className="text-[11px] font-semibold text-[var(--builder-primary)] hover:underline whitespace-nowrap"
            >
              {t('elementLibrary.saveSelectedBtn')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              {
                id: 'before-selected',
                label: t('elementLibrary.placements.before'),
                disabled: !canInsertSibling,
                title: canInsertSibling
                  ? t('elementLibrary.placementTitles.beforeValid', { name: selectedNode?.name })
                  : t('elementLibrary.placementTitles.beforeDisabled'),
              },
              {
                id: 'after-selected',
                label: t('elementLibrary.placements.after'),
                disabled: !canInsertSibling,
                title: canInsertSibling
                  ? t('elementLibrary.placementTitles.afterValid', { name: selectedNode?.name })
                  : t('elementLibrary.placementTitles.afterDisabled'),
              },
              {
                id: 'into-selected',
                label: t('elementLibrary.placements.inside'),
                disabled: !canInsertIntoSelected,
                title: canInsertIntoSelected
                  ? t('elementLibrary.placementTitles.insideValid', { name: selectedNode?.name })
                  : t('elementLibrary.placementTitles.insideDisabled'),
              },
              {
                id: 'first-child',
                label: t('elementLibrary.placements.firstChild'),
                disabled: !activePage,
                title:
                  canInsertIntoSelected && selectedNode
                    ? t('elementLibrary.placementTitles.firstChildInside', { name: selectedNode.name })
                    : t('elementLibrary.placementTitles.firstChildPage'),
              },
              {
                id: 'append-root',
                label: t('elementLibrary.placements.appendRoot'),
                disabled: !activePage,
                title: t('elementLibrary.placementTitles.appendRoot'),
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              title={opt.title}
              onClick={() => onChangeInsertionPlacement(opt.id)}
              className={`min-h-[32px] px-1.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap truncate ${
                insertionPlacement === opt.id && !opt.disabled
                  ? 'bg-[var(--builder-primary)] text-white font-semibold'
                  : 'bg-[var(--builder-panel-bg)] border border-[var(--builder-border)] text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)] disabled:opacity-40'
              } ${opt.id === 'append-root' ? 'col-span-2' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-[var(--builder-text-secondary)] flex items-center justify-between gap-1.5 pt-0.5">
          <span className="truncate">
            {t('elementLibrary.targetLabel')} <strong className="text-[var(--builder-text-primary)]">{insertionSummaryLabel}</strong>
          </span>
          <span className="text-[var(--builder-text-muted)] shrink-0 font-mono">{t('elementLibrary.clickOrDrag')}</span>
        </div>
      </div>

      {/* TAB 1: BUILT-IN ELEMENTS */}
      {subTab === 'elements' && (
        <div className="space-y-3.5">
          {/* Favorites & Recent Strip (when not searching) */}
          {!searchQuery && (favoriteDefinitions.length > 0 || recentDefinitions.length > 0) && (
            <div className="space-y-2">
              {favoriteDefinitions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                    <span>{t('elementLibrary.favorites')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {favoriteDefinitions.map((def) => (
                      <button
                        key={`fav_${def.elementType}`}
                        type="button"
                        onClick={() => handleClickElement(def)}
                        className="min-h-[34px] px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:border-blue-500 text-[11px] font-medium text-slate-800 flex items-center gap-1.5"
                      >
                        <CuratedIcon name={def.icon} size={13} className="text-slate-500" />
                        <span>{def.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recentDefinitions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{t('elementLibrary.recentlyUsed')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recentDefinitions.map((def) => (
                      <button
                        key={`rec_${def.elementType}`}
                        type="button"
                        onClick={() => handleClickElement(def)}
                        className="min-h-[32px] px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-500 text-[11px] font-medium text-slate-700 flex items-center gap-1.5"
                      >
                        <CuratedIcon name={def.icon} size={12} className="text-slate-500" />
                        <span>{def.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Category Filter Buttons & View Mode Toggle */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {ELEMENT_CATEGORY_META.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedFamily(cat.id)}
                  className={`min-h-[30px] text-[11px] px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                    selectedFamily === cat.id
                      ? 'bg-[var(--builder-primary)] text-white font-semibold'
                      : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)] hover:text-[var(--builder-text-primary)]'
                  }`}
                >
                  {t(`elementLibrary.categories.${cat.id}`, { defaultValue: cat.label })}
                </button>
              ))}
            </div>

            <div
              className="flex items-center bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] p-0.5 rounded-md shrink-0"
              role="group"
              aria-label={t('elementLibrary.viewModeGrid')}
            >
              <button
                type="button"
                onClick={() => handleChangeViewMode('grid')}
                title={t('elementLibrary.viewModeGrid')}
                aria-label={t('elementLibrary.viewModeGrid')}
                aria-pressed={viewMode === 'grid'}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-[var(--builder-panel-bg)] text-[var(--builder-primary)] shadow-xs'
                    : 'text-[var(--builder-text-muted)] hover:text-[var(--builder-text-primary)]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleChangeViewMode('list')}
                title={t('elementLibrary.viewModeList')}
                aria-label={t('elementLibrary.viewModeList')}
                aria-pressed={viewMode === 'list'}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-[var(--builder-panel-bg)] text-[var(--builder-primary)] shadow-xs'
                    : 'text-[var(--builder-text-muted)] hover:text-[var(--builder-text-primary)]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Element Cards Grid or List */}
          {filteredElements.length === 0 ? (
            <div className="p-4 border border-[var(--builder-border)] rounded-lg bg-[var(--builder-surface-muted)] text-center text-xs text-[var(--builder-text-secondary)]">
              {t('elementLibrary.noElementsMatch', { query: searchQuery })}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-2">
              {filteredElements.map((item) => {
                const isFav = favorites.includes(item.elementType);
                const nestCheck = canNestElement(
                  effectiveTargetMeta.parent,
                  item.elementType,
                  effectiveTargetMeta.depth
                );

                return (
                  <div
                    key={item.elementType}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-indy-catalog', item.elementType);
                      e.dataTransfer.effectAllowed = 'copy';
                      startDrag({
                        kind: 'catalog',
                        elementType: item.elementType,
                        name: item.name,
                      });
                    }}
                    onDragEnd={() => endDrag()}
                    className={`relative border rounded-lg bg-[var(--builder-panel-bg)] transition-all flex flex-col justify-between min-h-[104px] ${
                      nestCheck.allowed
                        ? 'border-[var(--builder-border)] hover:border-[var(--builder-primary)] hover:shadow-xs'
                        : 'border-amber-200 bg-amber-50/20'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!nestCheck.allowed}
                      title={!nestCheck.allowed ? nestCheck.reason : t('elementLibrary.insertElementTitle', { name: item.name })}
                      onClick={() => handleClickElement(item)}
                      className="text-left p-2.5 flex-1 flex flex-col justify-between cursor-pointer disabled:cursor-not-allowed w-full"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1 pr-5">
                          <div className="w-6 h-6 rounded-md bg-[var(--builder-surface-muted)] text-[var(--builder-text-primary)] flex items-center justify-center shrink-0">
                            <CuratedIcon name={item.icon} size={14} />
                          </div>
                          <PlusCircle className="w-3.5 h-3.5 text-[var(--builder-text-muted)] shrink-0" />
                        </div>
                        <div className="font-semibold text-xs text-[var(--builder-text-primary)] leading-snug">
                          {item.name}
                        </div>
                        <p className="text-[10px] text-[var(--builder-text-secondary)] line-clamp-2 leading-tight">
                          {!nestCheck.allowed ? nestCheck.reason : item.description}
                        </p>
                      </div>
                      <span className="text-[10px] capitalize text-[var(--builder-text-muted)] font-mono mt-1.5 block">
                        {item.subcategory}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteElement(item.elementType);
                      }}
                      aria-label={isFav ? t('elementLibrary.removeFavAria', { name: item.name }) : t('elementLibrary.addFavAria', { name: item.name })}
                      className="absolute top-2 right-2 p-1 rounded hover:bg-[var(--builder-surface-hover)] text-[var(--builder-text-muted)] hover:text-amber-500"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          isFav ? 'text-amber-500 fill-amber-400' : ''
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredElements.map((item) => {
                const isFav = favorites.includes(item.elementType);
                const nestCheck = canNestElement(
                  effectiveTargetMeta.parent,
                  item.elementType,
                  effectiveTargetMeta.depth
                );

                return (
                  <div
                    key={item.elementType}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-indy-catalog', item.elementType);
                      e.dataTransfer.effectAllowed = 'copy';
                      startDrag({
                        kind: 'catalog',
                        elementType: item.elementType,
                        name: item.name,
                      });
                    }}
                    onDragEnd={() => endDrag()}
                    className={`flex items-center gap-1.5 border rounded-lg bg-[var(--builder-panel-bg)] pr-1.5 transition-all ${
                      nestCheck.allowed
                        ? 'border-[var(--builder-border)] hover:border-[var(--builder-primary)]'
                        : 'border-amber-200 bg-amber-50/20'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!nestCheck.allowed}
                      title={!nestCheck.allowed ? nestCheck.reason : t('elementLibrary.insertElementTitle', { name: item.name })}
                      onClick={() => handleClickElement(item)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 p-2 text-left cursor-pointer disabled:cursor-not-allowed"
                    >
                      <div className="w-7 h-7 rounded-md bg-[var(--builder-surface-muted)] text-[var(--builder-text-primary)] flex items-center justify-center shrink-0">
                        <CuratedIcon name={item.icon} size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-xs text-[var(--builder-text-primary)] truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] capitalize text-[var(--builder-text-muted)] font-mono shrink-0">
                            {item.subcategory}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--builder-text-secondary)] truncate">
                          {!nestCheck.allowed ? nestCheck.reason : item.description}
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavoriteElement(item.elementType);
                      }}
                      aria-label={isFav ? t('elementLibrary.removeFavAria', { name: item.name }) : t('elementLibrary.addFavAria', { name: item.name })}
                      className="p-1.5 rounded hover:bg-[var(--builder-surface-hover)] text-[var(--builder-text-muted)] hover:text-amber-500 shrink-0"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          isFav ? 'text-amber-500 fill-amber-400' : ''
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2 & 3: COMPONENTS & TEMPLATES / MY LIBRARY */}
      {(subTab === 'templates' || subTab === 'my-library') && (
        <div className="space-y-3">
          {/* Type Filter */}
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: 'all', label: t('elementLibrary.templateFilters.all') },
                { id: 'component', label: t('elementLibrary.templateFilters.component') },
                { id: 'section-template', label: t('elementLibrary.templateFilters.section-template') },
                { id: 'header-template', label: t('elementLibrary.templateFilters.header-template') },
                { id: 'navigation-template', label: t('elementLibrary.templateFilters.navigation-template') },
                { id: 'footer-template', label: t('elementLibrary.templateFilters.footer-template') },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTemplateFilter(f.id)}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-[11px] transition-colors whitespace-nowrap ${
                  templateFilter === f.id
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Linked Component Insert Mode Switch */}
          <label className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] text-slate-700 cursor-pointer">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate font-medium">
                {t('elementLibrary.insertAsLinked')}
              </span>
            </div>
            <input
              type="checkbox"
              checked={insertAsLinked}
              onChange={(e) => setInsertAsLinked(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 shrink-0"
            />
          </label>

          {/* Delete Dependency Confirmation Box */}
          {pendingDeleteItem && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 space-y-2 text-xs text-red-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">{t('elementLibrary.deleteTitle', { name: pendingDeleteItem.name })}</div>
                  <p className="text-[11px] text-red-900">
                    {countLinkedInstancesInSite(site, pendingDeleteItem.id) > 0
                      ? t('elementLibrary.deleteLinkedDesc', { count: countLinkedInstancesInSite(site, pendingDeleteItem.id) })
                      : t('elementLibrary.deletePersonalDesc')}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setPendingDeleteItem(null)}
                  className="min-h-[34px] px-2.5 py-1 bg-white border border-red-200 rounded text-[11px] font-semibold text-slate-700"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteLibraryItem(pendingDeleteItem.id);
                    setPendingDeleteItem(null);
                  }}
                  className="min-h-[34px] px-2.5 py-1 bg-red-600 text-white rounded text-[11px] font-semibold"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          )}

          {/* Quick Preview Card for Complex Templates */}
          {previewItem && (
            <div className="p-3 rounded-lg border border-blue-300 bg-blue-50/40 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-slate-900">{previewItem.name}</div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {t('elementLibrary.previewMeta', {
                      type: previewItem.type,
                      rev: previewItem.revision,
                      count: previewItem.rootNode?.children?.length ?? 0,
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {previewItem.description}
              </p>
              <button
                type="button"
                onClick={() => handleInsertLibraryItem(previewItem)}
                className="w-full min-h-[38px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold"
              >
                {t('elementLibrary.insertIntoPageBtn')}
              </button>
            </div>
          )}

          {/* Items List */}
          {filteredLibraryItems.length === 0 ? (
            <div className="p-5 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-center space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                {subTab === 'my-library' ? t('elementLibrary.noSavedItemsTitle') : t('elementLibrary.noMatchingTemplatesTitle')}
              </div>
              <p className="text-[11px] text-slate-500">
                {subTab === 'my-library'
                  ? t('elementLibrary.noSavedItemsDesc')
                  : t('elementLibrary.noMatchingTemplatesDesc')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLibraryItems.map((item) => {
                const linkedCount = !item.isBuiltIn
                  ? countLinkedInstancesInSite(site, item.id)
                  : 0;
                const canDragItem =
                  Boolean(item.rootNode) &&
                  item.type !== 'header-template' &&
                  item.type !== 'footer-template';
                const dragMode =
                  insertAsLinked && item.type === 'component' ? 'linked' : 'independent';
                return (
                  <div
                    key={item.id}
                    draggable={canDragItem}
                    onDragStart={(e) => {
                      if (!canDragItem) return;
                      e.dataTransfer.setData('application/x-indy-library', item.id);
                      e.dataTransfer.effectAllowed = 'copy';
                      startDrag({
                        kind: 'library-item',
                        item,
                        mode: dragMode,
                      });
                    }}
                    onDragEnd={() => endDrag()}
                    className="p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-400 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex items-start gap-1.5">
                        {canDragItem && (
                          <GripVertical
                            className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0 cursor-grab"
                            aria-hidden="true"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span>{item.category}</span>
                            <span>·</span>
                            <span>{item.type.replace('-template', '')}</span>
                            {linkedCount > 0 && (
                              <span className="text-indigo-600 font-semibold">
                                {t('elementLibrary.linkedCount', { count: linkedCount })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        title={t('elementLibrary.previewStructureTitle')}
                        aria-label={t('elementLibrary.previewAria', { name: item.name })}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">
                      {item.description}
                    </p>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleInsertLibraryItem(item)}
                        className="flex-1 min-h-[36px] px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-semibold whitespace-nowrap"
                      >
                        {insertAsLinked && item.type === 'component'
                          ? t('elementLibrary.insertLinkedBtn')
                          : t('elementLibrary.insertBtn')}
                      </button>

                      {!item.isBuiltIn && (
                        <>
                          {linkedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => onSyncLinkedInstances(item)}
                              title={t('elementLibrary.syncTitle')}
                              className="min-h-[36px] px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>{t('elementLibrary.syncBtn')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDuplicateLibraryItem(item.id)}
                            title={t('elementLibrary.duplicateTitle')}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center border border-slate-200 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteItem(item)}
                            title={t('elementLibrary.deleteBtnTitle')}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center border border-slate-200 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
