import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DeviceMode,
  ElementNode,
  ElementStyles,
  GoogleWorkspaceState,
  PseudoStateKey,
  RegionType,
  SheetsTab,
  SiteDocument,
} from '../../types/builder';
import { BREAKPOINTS } from '../../config/breakpoints';
import { ResolvedEffectiveTheme } from '../../services/themeService';
import {
  copyBreakpointStyles,
  countBreakpointOverrides,
  getStyleSource,
  resetAllOverridesForBreakpoint,
  resetStyleForBreakpoint,
  resetStyleGroupForBreakpoint,
  setRawDeclarationForBreakpoint,
  setStylesForBreakpoint,
} from '../../services/responsiveStyleModel';
import {
  getElementLayoutContext,
  sectionMatchesSearch,
  STYLE_SECTIONS_METADATA,
} from '../../services/propertyCatalog';
import {
  CollapsibleStyleGroup,
  CssUnitInput,
  FieldHeader,
  StyleContextProps,
} from './property-editor/CssUnitInput';
import { ALIGNMENT_PROPS, AlignmentSection } from './property-editor/AlignmentSection';
import { BoxModelEditor } from './property-editor/BoxModelEditor';
import {
  BACKGROUND_PROPS,
  BackgroundSection,
  BORDER_PROPS,
  BorderOutlineSection,
  EFFECTS_PROPS,
  EffectsFiltersSection,
  LAYOUT_PROPS,
  LayoutSection,
  OVERFLOW_PROPS,
  OverflowMediaSection,
  SIZING_PROPS,
  SizingSection,
  TYPOGRAPHY_PROPS,
  TypographySection,
} from './property-editor/StyleSections';
import {
  CustomCssAndRawSection,
  POSITION_PROPS,
  PositioningSection,
  TRANSFORM_PROPS,
  TransformSection,
  TRANSITION_PROPS,
  TransitionAnimationSection,
} from './property-editor/AdvancedStyleSections';
import {
  BookmarkPlus,
  Sliders,
  Database,
  Trash2,
  Copy,
  Monitor,
  Tablet,
  Smartphone,
  RotateCcw,
  ArrowLeft,
  EyeOff,
  Check,
  Search,
  X,
  Code2,
  Globe,
  Link2,
  Plus,
  Unlink,
  AlertCircle,
} from 'lucide-react';
import { CURATED_ICON_SET, sanitizeSvgMarkup } from '../../services/assetService';
import { extractEmbeddedHtmlAndCss } from '../../services/cssCompiler';
import { hasBalancedDelimiters } from '../../services/styleValidator';
import { isContainerElementType } from '../../data/elementRegistry';
import { CuratedIcon } from './CuratedIcon';
import { RegionPresetPanel } from './RegionPresetPanel';
import { getPagesReferencingGlobalComponent } from '../../services/componentLibraryService';
import { FormCmsInspectorSection } from './property-editor/FormCmsInspectorSection';
import { CmsDocument } from '../../types/cms';

interface PropertyInspectorProps {
  element: ElementNode | null;
  parentElement: ElementNode | null;
  site?: SiteDocument;
  effectiveTheme: ResolvedEffectiveTheme;
  workspace: GoogleWorkspaceState;
  deviceMode: DeviceMode;
  editorViewportMode: DeviceMode;
  reduceMotionPreview?: boolean;
  editingRegionLabel?: string;
  onToggleReduceMotion?: () => void;
  onSetDeviceMode: (mode: DeviceMode) => void;
  onUpdateElement: (updated: ElementNode) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  onDetachLinkedComponent?: (id: string) => void;
  onOpenSaveAsLibrary?: (node: ElementNode) => void;
  onSaveRegionAsTemplate?: (regionType: RegionType, node: ElementNode) => void;
  onOpenNavigator?: () => void;
  onOpenCodeTab?: () => void;
  onClose?: () => void;
  onUpdateCms?: (updater: (prev: CmsDocument) => CmsDocument) => void;
  onUpdateWorkspaceTabs?: (tabs: SheetsTab[]) => void;
  onSubmitForm?: (
    formId: string,
    values: Record<string, any>,
    sourcePage?: string
  ) => Promise<boolean | void> | boolean | void;
  onOpenCmsInbox?: () => void;
  desktopWidth?: number;
}

const PSEUDO_STATE_OPTIONS: { id: PseudoStateKey; labelKey: string; fallback: string }[] = [
  { id: 'default', labelKey: 'inspector.pseudoStates.default', fallback: 'Default' },
  { id: 'hover', labelKey: 'inspector.pseudoStates.hover', fallback: ':hover' },
  { id: 'focus', labelKey: 'inspector.pseudoStates.focus', fallback: ':focus' },
  { id: 'focus-visible', labelKey: 'inspector.pseudoStates.focusVisible', fallback: 'Focus Ring' },
  { id: 'active', labelKey: 'inspector.pseudoStates.active', fallback: ':active' },
  { id: 'disabled', labelKey: 'inspector.pseudoStates.disabled', fallback: ':disabled' },
];

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  element,
  parentElement,
  site,
  effectiveTheme,
  workspace,
  deviceMode,
  editorViewportMode,
  reduceMotionPreview = false,
  editingRegionLabel,
  onToggleReduceMotion,
  onSetDeviceMode,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onDetachLinkedComponent,
  onOpenSaveAsLibrary,
  onSaveRegionAsTemplate,
  onOpenNavigator,
  onOpenCodeTab,
  onClose,
  onUpdateCms,
  onUpdateWorkspaceTabs,
  onSubmitForm,
  onOpenCmsInbox,
  desktopWidth = 372,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'responsive' | 'advanced'>(
    'content'
  );
  const [pseudoState, setPseudoState] = useState<PseudoStateKey>('default');
  const [styleSearch, setStyleSearch] = useState('');
  const [iconQuery, setIconQuery] = useState('');

  const isOverlay = editorViewportMode !== 'desktop';
  const inputHeightClass = isOverlay ? 'min-h-[42px] text-sm' : 'h-[38px] text-sm';

  const layoutCtx = useMemo(() => {
    if (!element) return null;
    return getElementLayoutContext(element, parentElement, deviceMode);
  }, [element, parentElement, deviceMode]);

  // Determine if selected element is Header, Navigation, or Footer region
  const selectedRegionType: RegionType | null = useMemo(() => {
    if (!element) return null;
    if (element.tag === 'header') return 'header';
    if (element.type === 'navbar' || element.type === 'nav-menu') return 'navigation';
    if (element.tag === 'footer') return 'footer';
    return null;
  }, [element]);

  const globalRegionUsageCount = useMemo(() => {
    if (!site || !editingRegionLabel?.toLowerCase().includes('global')) return undefined;
    if (editingRegionLabel.toLowerCase().includes('header')) {
      const activeId = site.globalComponents?.activeHeaderId;
      return activeId ? getPagesReferencingGlobalComponent(site, 'header', activeId).length : 0;
    }
    if (editingRegionLabel.toLowerCase().includes('footer')) {
      const activeId = site.globalComponents?.activeFooterId;
      return activeId ? getPagesReferencingGlobalComponent(site, 'footer', activeId).length : 0;
    }
    return undefined;
  }, [site, editingRegionLabel]);

  if (!element || !layoutCtx) {
    return (
      <aside
        style={!isOverlay ? { width: `${desktopWidth}px` } : undefined}
        className={`${
          isOverlay ? 'w-full' : 'shrink-0 border-l border-[var(--builder-border)]'
        } h-full bg-[var(--builder-panel-bg)] flex flex-col select-none`}
      >
        {isOverlay && onClose && (
          <div className="px-4 py-3 border-b border-[var(--builder-border)] flex items-center justify-between bg-[var(--builder-surface-muted)]">
            <span className="text-sm font-semibold text-[var(--builder-text-primary)]">
              {t('builder.properties')}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3 rounded-[7px] bg-[var(--builder-text-primary)] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('inspector.backToCanvas')}</span>
            </button>
          </div>
        )}
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-[var(--builder-text-muted)]">
          <Sliders className="w-8 h-8 text-[var(--builder-border-strong)] mb-2.5 stroke-[1.5]" />
          <span className="text-sm font-semibold text-[var(--builder-text-primary)]">
            {t('inspector.noElementSelected')}
          </span>
          <p className="text-xs text-[var(--builder-text-secondary)] mt-1.5 max-w-[260px] leading-relaxed">
            {t('inspector.noElementHint')}
          </p>
        </div>
      </aside>
    );
  }

  // Mutator helpers
  const updateContent = (fields: Partial<NonNullable<ElementNode['content']>>) => {
    onUpdateElement({
      ...element,
      ...(element.presetId ? { isCustomized: true } : {}),
      content: { ...element.content, ...fields },
    });
  };

  const updateBreakpointStyles = (
    updates: Partial<ElementStyles>,
    targetPseudo: PseudoStateKey = pseudoState
  ) => {
    const nextNode = setStylesForBreakpoint(element, updates, deviceMode, targetPseudo);
    onUpdateElement(element.presetId ? { ...nextNode, isCustomized: true } : nextNode);
  };

  const handleResetProp = (
    prop: keyof ElementStyles,
    targetPseudo: PseudoStateKey = pseudoState
  ) => {
    onUpdateElement(resetStyleForBreakpoint(element, prop, deviceMode, targetPseudo));
  };

  const handleResetGroup = (
    props: (keyof ElementStyles)[],
    targetPseudo: PseudoStateKey = pseudoState
  ) => {
    onUpdateElement(resetStyleGroupForBreakpoint(element, props, deviceMode, targetPseudo));
  };

  const handleResetAllBreakpoint = () => {
    if (deviceMode === 'desktop') return;
    onUpdateElement(resetAllOverridesForBreakpoint(element, deviceMode));
  };

  const handleCopyFromBreakpoint = (fromBp: DeviceMode) => {
    if (deviceMode === 'desktop' || fromBp === deviceMode) return;
    onUpdateElement(copyBreakpointStyles(element, fromBp, deviceMode));
  };

  const updateAdvanced = (adv: Partial<NonNullable<ElementNode['advanced']>>) => {
    onUpdateElement({
      ...element,
      advanced: { ...element.advanced, ...adv },
    });
  };

  const toggleDynamicBinding = (enabled: boolean) => {
    if (enabled) {
      const defaultCt = site?.cms?.contentTypes[0]?.id || 'project';
      onUpdateElement({
        ...element,
        dynamicBinding: {
          enabled: true,
          source: 'cms',
          contentTypeId: defaultCt,
          field: '$title',
        },
      });
    } else {
      onUpdateElement({
        ...element,
        dynamicBinding: { enabled: false, source: 'sheets', tab: '', field: '' },
      });
    }
  };

  const currentTabCols =
    workspace.spreadsheet.tabs.find((t) => t.name === element.dynamicBinding?.tab)?.columns || [];

  const tabletOverrideCount = countBreakpointOverrides(element, 'tablet');
  const mobileOverrideCount = countBreakpointOverrides(element, 'mobile');
  const currentOverrideCount = countBreakpointOverrides(element, deviceMode);

  const hasGroupOverrides = (props: (keyof ElementStyles)[]) =>
    props.some((p) => {
      const meta = getStyleSource(element, p, deviceMode, pseudoState);
      if (pseudoState !== 'default') return meta.value !== undefined;
      return deviceMode !== 'desktop' && meta.isOverriddenOnCurrent;
    });

  const styleCtxProps: StyleContextProps = {
    element,
    deviceMode,
    pseudoState,
    effectiveTheme,
    isOverlay,
    onUpdateStyles: (u) => updateBreakpointStyles(u, pseudoState),
    onResetProp: (p) => handleResetProp(p, pseudoState),
    onResetGroup: (props) => handleResetGroup(props, pseudoState),
  };

  const showSection = (id: string) => {
    const desc = STYLE_SECTIONS_METADATA.find((s) => s.id === id);
    return desc ? sectionMatchesSearch(desc, styleSearch) : true;
  };

  const BreakpointBanner = () => (
    <div className="p-3 bg-[var(--builder-surface-muted)] rounded-[8px] space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--builder-text-primary)]">
          {t('inspector.websiteBreakpoint')}
        </span>
        {deviceMode !== 'desktop' && currentOverrideCount > 0 && (
          <button
            type="button"
            onClick={handleResetAllBreakpoint}
            className="text-[11px] font-medium text-[var(--builder-primary)] hover:text-[var(--builder-primary-hover)] flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('inspector.resetCount', { count: currentOverrideCount })}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 bg-white/80 p-1 rounded-[7px] border border-[var(--builder-border)]">
        {(
          [
            { id: 'desktop', label: t('common.desktop'), count: 0, icon: Monitor },
            { id: 'tablet', label: t('common.tablet'), count: tabletOverrideCount, icon: Tablet },
            { id: 'mobile', label: t('common.mobile'), count: mobileOverrideCount, icon: Smartphone },
          ] as const
        ).map(({ id, label, count, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSetDeviceMode(id)}
            className={`min-h-[34px] px-2 py-1 rounded-[5px] text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
              deviceMode === id
                ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)] font-semibold'
                : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-muted)]'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{label}</span>
            {count > 0 && (
              <span className="text-[10px] font-mono tabular-nums text-[var(--builder-primary)]">
                ({count})
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-[var(--builder-text-secondary)] leading-snug">
        {deviceMode === 'desktop'
          ? t('inspector.banners.breakpointBase', {
              defaultValue: `Base (Desktop ${BREAKPOINTS.desktop.rangeDescription}). Cascades to Tablet and Mobile.`,
            })
          : currentOverrideCount > 0
          ? t(
              currentOverrideCount === 1
                ? 'inspector.banners.breakpointOverridden'
                : 'inspector.banners.breakpointOverriddenPlural',
              { count: currentOverrideCount }
            )
          : t('inspector.banners.breakpointInherited')}
      </p>
    </div>
  );

  const PseudoStateBar = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--builder-text-primary)]">
          {t('inspector.pseudoState')}
        </span>
        {pseudoState !== 'default' && (
          <button
            type="button"
            onClick={() => setPseudoState('default')}
            className="text-[11px] font-medium text-[var(--builder-primary)] hover:underline"
          >
            {t('inspector.pseudoStates.default')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PSEUDO_STATE_OPTIONS.map((st) => (
          <button
            key={st.id}
            type="button"
            onClick={() => setPseudoState(st.id)}
            className={`px-2.5 h-[30px] rounded-[6px] border text-[11px] font-medium transition-colors ${
              pseudoState === st.id
                ? st.id === 'default'
                  ? 'bg-[var(--builder-text-primary)] text-white border-[var(--builder-text-primary)]'
                  : 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-hover)]'
            }`}
          >
            {t(st.labelKey, { defaultValue: st.fallback })}
          </button>
        ))}
      </div>
      {pseudoState !== 'default' && (
        <div className="px-2.5 py-1.5 rounded-[6px] bg-[var(--builder-primary-soft)] text-[11px] text-[var(--builder-primary)]">
          {t('inspector.editingStateNote', { state: pseudoState })}
        </div>
      )}
    </div>
  );

  const StyleSearchBar = () => (
    <div className="relative">
      <Search className="w-3.5 h-3.5 text-[var(--builder-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="text"
        aria-label={t('inspector.searchStylesPlaceholder')}
        placeholder={t('inspector.searchStylesPlaceholder')}
        value={styleSearch}
        onChange={(e) => setStyleSearch(e.target.value)}
        className="w-full pl-8 pr-8 h-[38px] border border-[var(--builder-border)] rounded-[7px] text-xs bg-[var(--builder-surface-muted)] text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:bg-white focus:outline-none focus:border-[var(--builder-primary)] transition-colors"
      />
      {styleSearch && (
        <button
          type="button"
          onClick={() => setStyleSearch('')}
          aria-label={t('inspector.clearSearch')}
          title={t('inspector.clearSearch')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--builder-text-muted)] hover:text-[var(--builder-text-primary)] p-0.5 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  const renderResponsiveMeta = (prop: keyof ElementStyles, fallback = '') => {
    const meta = getStyleSource(element, prop, deviceMode, 'default');
    return (meta.value as string) ?? fallback;
  };

  return (
    <aside
      style={!isOverlay ? { width: `${desktopWidth}px` } : undefined}
      className={`${
        isOverlay ? 'w-full' : 'shrink-0 border-l border-[var(--builder-border)]'
      } h-full bg-[var(--builder-panel-bg)] flex flex-col select-none overflow-hidden z-20`}
    >
      {/* Element Header */}
      <div className="px-4 py-3 border-b border-[var(--builder-border)] flex items-center justify-between gap-2.5 bg-[var(--builder-panel-bg)] shrink-0">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] leading-snug font-semibold text-[var(--builder-text-primary)] truncate">
            {element.name}
          </div>
          <div className="text-xs text-[var(--builder-text-secondary)] truncate mt-0.5">
            <span className="font-mono text-[11px]">{element.type}</span>
            {' · '}
            <span>{t(`common.${deviceMode}`, { defaultValue: BREAKPOINTS[deviceMode].shortLabel })}</span>
            {parentElement ? ` · ${t('inspector.inParent', { parent: parentElement.name })}` : ''}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {onOpenSaveAsLibrary && (
            <button
              type="button"
              onClick={() => onOpenSaveAsLibrary(element)}
              title={t('inspector.saveToLibrary')}
              aria-label={t('inspector.saveToLibrary')}
              className="min-h-[34px] min-w-[34px] flex items-center justify-center text-[var(--builder-text-secondary)] hover:text-[var(--builder-primary)] hover:bg-[var(--builder-primary-soft)] rounded-[6px] transition-colors"
            >
              <BookmarkPlus className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onDuplicateElement(element.id)}
            title={t('inspector.duplicateElement')}
            aria-label={t('inspector.duplicateElement')}
            className="min-h-[34px] min-w-[34px] flex items-center justify-center text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-muted)] rounded-[6px] transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onDeleteElement(element.id)}
            title={t('inspector.deleteElement')}
            aria-label={t('inspector.deleteElement')}
            className="min-h-[34px] min-w-[34px] flex items-center justify-center text-[var(--builder-text-secondary)] hover:text-[var(--builder-danger)] hover:bg-red-50 rounded-[6px] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {isOverlay && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] px-2.5 ml-1 bg-[var(--builder-text-primary)] text-white text-xs font-semibold rounded-[6px] flex items-center gap-1 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('common.done', { defaultValue: 'Done' })}</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Shared Region / Linked Instance Status Bars */}
      {editingRegionLabel && editingRegionLabel.startsWith('Global') && (
        <div className="px-4 py-2 bg-[var(--builder-primary-soft)] border-b border-[var(--builder-border)] text-[11px] text-[var(--builder-text-primary)] flex items-start gap-2 shrink-0">
          <Globe className="w-3.5 h-3.5 text-[var(--builder-primary)] shrink-0 mt-0.5" />
          <span>{t('inspector.banners.globalShared', { label: editingRegionLabel })}</span>
        </div>
      )}

      {element.componentRef?.mode === 'linked' && (
        <div className="px-4 py-2 bg-[var(--builder-primary-soft)] border-b border-[var(--builder-border)] flex items-center justify-between gap-2 text-[11px] text-[var(--builder-text-primary)] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link2 className="w-3.5 h-3.5 text-[var(--builder-primary)] shrink-0" />
            <span className="font-semibold truncate">
              {t('inspector.banners.linkedComponent')} · Rev {element.componentRef.revision}
            </span>
          </div>
          {onDetachLinkedComponent && (
            <button
              type="button"
              onClick={() => onDetachLinkedComponent(element.id)}
              className="min-h-[28px] px-2 py-0.5 rounded-[5px] bg-white border border-[var(--builder-border)] hover:bg-[var(--builder-surface-muted)] text-[11px] font-semibold text-[var(--builder-primary)] flex items-center gap-1 shrink-0 whitespace-nowrap"
            >
              <Unlink className="w-3 h-3" />
              <span>{t('inspector.banners.detachToLocal')}</span>
            </button>
          )}
        </div>
      )}

      {/* 4 Tabs: Content, Style, Responsive, Advanced */}
      <div className="grid grid-cols-4 border-b border-[var(--builder-border)] text-xs font-medium text-center shrink-0 bg-[var(--builder-panel-bg)]">
        {(['content', 'style', 'responsive', 'advanced'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`min-h-[42px] py-2 px-1 transition-colors whitespace-nowrap truncate ${
              activeTab === tab
                ? 'text-[var(--builder-primary)] font-semibold border-b-2 border-[var(--builder-primary)] bg-[var(--builder-panel-bg)]'
                : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-muted)]'
            }`}
          >
            {t(`inspector.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab Contents (Container Query Root for Responsive Inspector Grids) */}
      <div className="@container flex-1 overflow-y-auto px-4 py-4 pb-16 space-y-4">
        {/* TAB 1: CONTENT */}
        {activeTab === 'content' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                  <Database className="w-3.5 h-3.5 text-blue-600" />
                  <span>Dynamic Data Binding</span>
                </div>
                <input
                  type="checkbox"
                  checked={element.dynamicBinding?.enabled ?? false}
                  onChange={(e) => toggleDynamicBinding(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
              </div>

              {element.dynamicBinding?.enabled && (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-blue-800 block mb-1">
                      Data Source
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-blue-100 p-0.5 rounded-md">
                      {(['cms', 'sheets'] as const).map((src) => (
                        <button
                          key={src}
                          type="button"
                          onClick={() => {
                            onUpdateElement({
                              ...element,
                              dynamicBinding: {
                                ...element.dynamicBinding!,
                                source: src,
                                contentTypeId:
                                  src === 'cms'
                                    ? site?.cms?.contentTypes[0]?.id || 'project'
                                    : undefined,
                                tab:
                                  src === 'sheets'
                                    ? workspace.spreadsheet.tabs[0]?.name || 'PROFILE'
                                    : undefined,
                              },
                            });
                          }}
                          className={`min-h-[32px] px-2 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                            (element.dynamicBinding?.source || 'cms') === src
                              ? 'bg-white text-blue-900 shadow-xs'
                              : 'text-blue-700 hover:text-blue-900'
                          }`}
                        >
                          {src}
                        </button>
                      ))}
                    </div>
                  </div>

                  {element.dynamicBinding.source === 'cms' ? (
                    <>
                      <div>
                        <label className="text-[11px] font-semibold text-blue-800 block mb-1">
                          CMS Content Type
                        </label>
                        <select
                          value={element.dynamicBinding.contentTypeId || 'project'}
                          onChange={(e) => {
                            onUpdateElement({
                              ...element,
                              dynamicBinding: {
                                ...element.dynamicBinding!,
                                contentTypeId: e.target.value,
                                field: '$title',
                              },
                            });
                          }}
                          className={`w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-md focus:outline-none ${inputHeightClass}`}
                        >
                          {(site?.cms?.contentTypes || []).map((ct) => (
                            <option key={ct.id} value={ct.id}>
                              {ct.pluralLabel} ({ct.id})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-blue-800 block mb-1">
                          Field Key or Property
                        </label>
                        <select
                          value={element.dynamicBinding.field || '$title'}
                          onChange={(e) => {
                            onUpdateElement({
                              ...element,
                              dynamicBinding: {
                                ...element.dynamicBinding!,
                                field: e.target.value,
                              },
                            });
                          }}
                          className={`w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-md focus:outline-none font-mono ${inputHeightClass}`}
                        >
                          <option value="$title">$title (Record Title)</option>
                          <option value="$slug">$slug (URL Slug)</option>
                          <option value="$url">$url (Detail URL)</option>
                          <option value="$publishedAt">$publishedAt (Published Date)</option>
                          <option value="$taxonomy_labels">$taxonomy_labels (Categories/Tags)</option>
                          {(() => {
                            const ctId = element.dynamicBinding.contentTypeId || 'project';
                            const ct = site?.cms?.contentTypes.find((c) => c.id === ctId);
                            return (ct?.fields || []).map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label} ({f.key})
                              </option>
                            ));
                          })()}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-[11px] font-semibold text-blue-800 block mb-1">
                          Sheets Tab
                        </label>
                        <select
                          value={element.dynamicBinding.tab}
                          onChange={(e) => {
                            const newTab = e.target.value;
                            const firstCol =
                              workspace.spreadsheet.tabs.find((t) => t.name === newTab)?.columns[0] || '';
                            onUpdateElement({
                              ...element,
                              dynamicBinding: {
                                ...element.dynamicBinding!,
                                tab: newTab,
                                field: firstCol,
                              },
                            });
                          }}
                          className={`w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-md focus:outline-none ${inputHeightClass}`}
                        >
                          {workspace.spreadsheet.tabs.map((tab) => (
                            <option key={tab.name} value={tab.name}>
                              {tab.name} ({tab.rows.length} rows)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-blue-800 block mb-1">
                          Target Field / Column
                        </label>
                        <select
                          value={element.dynamicBinding.field}
                          onChange={(e) => {
                            onUpdateElement({
                              ...element,
                              dynamicBinding: {
                                ...element.dynamicBinding!,
                                field: e.target.value,
                              },
                            });
                          }}
                          className={`w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-md focus:outline-none font-mono ${inputHeightClass}`}
                        >
                          {currentTabCols.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {element.type === 'heading' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Heading Level
                  </label>
                  <div className="grid grid-cols-6 gap-1">
                    {(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => updateContent({ headingLevel: lvl })}
                        className={`min-h-[38px] text-xs py-1 rounded font-mono uppercase transition-colors ${
                          element.content?.headingLevel === lvl
                            ? 'bg-slate-900 text-white font-bold'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Heading Text
                  </label>
                  <textarea
                    rows={3}
                    value={element.content?.text || ''}
                    onChange={(e) => updateContent({ text: e.target.value })}
                    className="w-full text-sm sm:text-xs p-2.5 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {(element.type === 'text' ||
              element.type === 'rich-text' ||
              element.type === 'label' ||
              element.type === 'blockquote' ||
              element.type === 'code') && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {element.type === 'blockquote'
                      ? 'Quote Text'
                      : element.type === 'code'
                      ? 'Code Snippet'
                      : element.type === 'label'
                      ? 'Label Text'
                      : 'Text Content'}
                  </label>
                  <textarea
                    rows={element.type === 'label' ? 2 : 4}
                    value={element.content?.text || ''}
                    onChange={(e) => updateContent({ text: e.target.value })}
                    className={`w-full text-sm sm:text-xs p-2.5 border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 ${
                      element.type === 'code' ? 'font-mono bg-slate-950 text-slate-100' : ''
                    }`}
                  />
                </div>
                {element.type === 'blockquote' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Attribution / Source
                    </label>
                    <input
                      type="text"
                      value={element.content?.caption || ''}
                      onChange={(e) => updateContent({ caption: e.target.value })}
                      className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                    />
                  </div>
                )}
                {element.type === 'code' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Language
                    </label>
                    <input
                      type="text"
                      value={element.content?.codeLanguage || 'typescript'}
                      onChange={(e) => updateContent({ codeLanguage: e.target.value })}
                      className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                    />
                  </div>
                )}
              </div>
            )}

            {(element.type === 'button' ||
              element.type === 'link' ||
              element.type === 'anchor-link' ||
              element.type === 'tooltip') && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    {element.type === 'tooltip' ? 'Trigger Label' : 'Label'}
                  </label>
                  <input
                    type="text"
                    value={element.content?.text || ''}
                    onChange={(e) => updateContent({ text: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                  />
                </div>

                {element.type === 'tooltip' ? (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Tooltip Help Text
                    </label>
                    <textarea
                      rows={2}
                      value={element.content?.tooltipText || ''}
                      onChange={(e) => updateContent({ tooltipText: e.target.value })}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-md"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Destination URL
                      </label>
                      <input
                        type="text"
                        value={element.content?.url || ''}
                        onChange={(e) => updateContent({ url: e.target.value })}
                        placeholder={
                          element.type === 'anchor-link' ? '#projects' : '#projects or /about'
                        }
                        className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                      />
                    </div>

                    <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={Boolean(element.content?.targetBlank)}
                        onChange={(e) => updateContent({ targetBlank: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span>Open external links in new tab</span>
                    </label>
                  </>
                )}
              </div>
            )}

            {/* ICON ELEMENT EDITOR */}
            {element.type === 'icon' && (() => {
              const svgCheck =
                element.content?.iconSet === 'custom-svg' && element.content?.svgMarkup
                  ? sanitizeSvgMarkup(element.content.svgMarkup)
                  : { valid: true };
              const filteredIcons = CURATED_ICON_SET.filter((ic) => {
                const q = iconQuery.trim().toLowerCase();
                if (!q) return true;
                return (
                  ic.name.toLowerCase().includes(q) ||
                  ic.label.toLowerCase().includes(q) ||
                  ic.keywords.some((k) => k.includes(q))
                );
              });

              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-md">
                    {(
                      [
                        { id: 'lucide', label: 'Curated Icons' },
                        { id: 'custom-svg', label: 'Custom SVG' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateContent({ iconSet: m.id })}
                        className={`min-h-[32px] rounded text-[11px] font-semibold ${
                          (element.content?.iconSet || 'lucide') === m.id
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {(element.content?.iconSet || 'lucide') === 'lucide' ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={iconQuery}
                        onChange={(e) => setIconQuery(e.target.value)}
                        placeholder="Search icons (Arrow, Mail, Code, Star...)"
                        className="w-full min-h-[34px] text-xs px-2.5 py-1 border border-slate-200 rounded-md"
                      />
                      <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto p-1.5 border border-slate-200 rounded-lg bg-slate-50">
                        {filteredIcons.map((ic) => {
                          const active = (element.content?.iconName || 'Sparkles') === ic.name;
                          return (
                            <button
                              key={ic.name}
                              type="button"
                              title={ic.label}
                              onClick={() => updateContent({ iconName: ic.name, iconSet: 'lucide' })}
                              className={`min-h-[36px] rounded flex items-center justify-center border transition-colors ${
                                active
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                              }`}
                            >
                              <CuratedIcon name={ic.name} size={16} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 block">
                        Sanitized Inline SVG
                      </label>
                      <textarea
                        rows={4}
                        value={element.content?.svgMarkup || ''}
                        onChange={(e) => updateContent({ svgMarkup: e.target.value })}
                        placeholder="<svg viewBox='0 0 24 24'>...</svg>"
                        className="w-full text-[11px] font-mono p-2 border border-slate-200 rounded-md bg-slate-950 text-slate-100"
                      />
                      {!svgCheck.valid && (
                        <div className="flex items-start gap-1 text-[11px] text-red-600">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{svgCheck.error}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[12px] font-medium text-[var(--builder-text-primary)] block mb-1">
                        Icon Size
                      </label>
                      <input
                        type="text"
                        value={element.content?.iconSize || '24px'}
                        onChange={(e) => updateContent({ iconSize: e.target.value })}
                        placeholder="24px"
                        className="w-full h-[38px] text-sm px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono bg-white focus:outline-none focus:border-[var(--builder-primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium text-[var(--builder-text-primary)] block mb-1">
                        Stroke Width
                      </label>
                      <input
                        type="number"
                        step={0.25}
                        min={1}
                        max={3.5}
                        value={element.content?.iconStrokeWidth ?? ''}
                        placeholder="2"
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            updateContent({ iconStrokeWidth: undefined });
                            return;
                          }
                          const parsed = parseFloat(raw);
                          if (Number.isFinite(parsed)) {
                            updateContent({ iconStrokeWidth: parsed });
                          }
                        }}
                        className="w-full h-[38px] text-sm px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono tabular-nums bg-white focus:outline-none focus:border-[var(--builder-primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Icon Color
                      </label>
                      <input
                        type="text"
                        value={element.content?.iconColor || ''}
                        onChange={(e) => updateContent({ iconColor: e.target.value })}
                        placeholder="var(--color-primary)"
                        className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Link URL (Optional)
                      </label>
                      <input
                        type="text"
                        value={element.content?.url || ''}
                        onChange={(e) => updateContent({ url: e.target.value })}
                        placeholder="/work"
                        className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Accessible Description (ARIA Label)
                    </label>
                    <input
                      type="text"
                      value={element.advanced?.ariaLabel || ''}
                      onChange={(e) => updateAdvanced({ ariaLabel: e.target.value })}
                      placeholder="Decorative or action description"
                      className="w-full min-h-[36px] text-xs px-2.5 py-1 border border-slate-200 rounded-md"
                    />
                  </div>
                </div>
              );
            })()}

            {/* LOGO ELEMENT EDITOR */}
            {element.type === 'logo' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Logo Mode
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-md">
                    {(
                      [
                        { id: 'icon-text', label: 'Mark + Text' },
                        { id: 'text', label: 'Wordmark' },
                        { id: 'image', label: 'Logo Asset' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => updateContent({ logoMode: m.id })}
                        className={`min-h-[32px] rounded text-[11px] font-semibold ${
                          (element.content?.logoMode || 'icon-text') === m.id
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Brand Name / Wordmark
                  </label>
                  <input
                    type="text"
                    value={element.content?.logoText || ''}
                    onChange={(e) => updateContent({ logoText: e.target.value })}
                    className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md ${inputHeightClass}`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tagline (Optional)
                  </label>
                  <input
                    type="text"
                    value={element.content?.logoTagline || ''}
                    onChange={(e) => updateContent({ logoTagline: e.target.value })}
                    placeholder="Design & Engineering"
                    className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md ${inputHeightClass}`}
                  />
                </div>

                {(element.content?.logoMode || 'icon-text') === 'icon-text' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">
                      Logo Mark Icon
                    </label>
                    <div className="grid grid-cols-6 gap-1 max-h-28 overflow-y-auto p-1.5 border border-slate-200 rounded-lg bg-slate-50">
                      {CURATED_ICON_SET.slice(0, 24).map((ic) => (
                        <button
                          key={ic.name}
                          type="button"
                          title={ic.label}
                          onClick={() => updateContent({ logoIconName: ic.name })}
                          className={`min-h-[32px] rounded flex items-center justify-center border ${
                            (element.content?.logoIconName || 'Sparkles') === ic.name
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          <CuratedIcon name={ic.name} size={14} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(element.content?.logoMode || 'icon-text') === 'image' && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Light Mode Logo URL
                      </label>
                      <input
                        type="text"
                        value={element.content?.logoLightSrc || ''}
                        onChange={(e) => updateContent({ logoLightSrc: e.target.value })}
                        placeholder="https://... or select Drive logo"
                        className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Dark Mode Variant URL (Optional)
                      </label>
                      <input
                        type="text"
                        value={element.content?.logoDarkSrc || ''}
                        onChange={(e) => updateContent({ logoDarkSrc: e.target.value })}
                        placeholder="Optional dark background variant"
                        className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md font-mono"
                      />
                    </div>
                    {site && site.mediaAssets.length > 0 && (
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                          Pick from Drive Assets
                        </label>
                        <select
                          value={element.content?.logoAssetId || ''}
                          onChange={(e) => {
                            const asset = site.mediaAssets.find((a) => a.id === e.target.value);
                            if (asset) {
                              updateContent({
                                logoAssetId: asset.id,
                                logoLightSrc: asset.url,
                                imageAlt: asset.altText || asset.name,
                              });
                            }
                          }}
                          className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md bg-white"
                        >
                          <option value="">Choose uploaded asset...</option>
                          {site.mediaAssets.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name} ({a.category || 'asset'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Home Destination URL
                  </label>
                  <input
                    type="text"
                    value={element.content?.url || '/'}
                    onChange={(e) => updateContent({ url: e.target.value })}
                    className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                  />
                </div>
              </div>
            )}

            {/* HEADER & FOOTER REGION CONTROLS */}
            {(element.tag === 'header' || element.tag === 'footer') && (
              <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {element.tag === 'header' ? 'Header Region Options' : 'Footer Region Options'}
                  </span>
                  <span className="text-[10px] font-mono text-indigo-700">
                    {editingRegionLabel?.toLowerCase().includes('global') ? 'GLOBAL' : 'LOCAL'}
                  </span>
                </div>

                {element.tag === 'header' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Scroll Position
                        </label>
                        <select
                          value={element.content?.stickyMode || 'static'}
                          onChange={(e) =>
                            updateContent({
                              stickyMode: e.target.value as 'static' | 'sticky' | 'fixed',
                            })
                          }
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          <option value="static">Static</option>
                          <option value="sticky">Sticky Top</option>
                          <option value="fixed">Fixed Overlay</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Container Width
                        </label>
                        <select
                          value={element.content?.containerWidthMode || 'contained'}
                          onChange={(e) =>
                            updateContent({
                              containerWidthMode: e.target.value as 'contained' | 'full-bleed',
                            })
                          }
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          <option value="contained">Contained</option>
                          <option value="full-bleed">Full Bleed</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Announcement / Utility Bar Text
                      </label>
                      <input
                        type="text"
                        value={element.content?.announcementText || ''}
                        onChange={(e) => updateContent({ announcementText: e.target.value })}
                        placeholder="Optional top announcement message..."
                        className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                      />
                    </div>

                    {element.content?.announcementText && (
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Announcement Link URL
                        </label>
                        <input
                          type="text"
                          value={element.content?.announcementUrl || ''}
                          onChange={(e) => updateContent({ announcementUrl: e.target.value })}
                          placeholder="/contact or https://..."
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white font-mono"
                        />
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(element.content?.showSearchBox)}
                        onChange={(e) =>
                          updateContent({
                            showSearchBox: e.target.checked,
                            isVisualPlaceholderShell: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span>Show search bar shell (visual placeholder)</span>
                    </label>
                  </>
                )}

                {element.tag === 'footer' && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(element.content?.showBackToTop)}
                        onChange={(e) => updateContent({ showBackToTop: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span>Show Back-to-Top action</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(element.content?.mobileAccordionColumns)}
                        onChange={(e) => updateContent({ mobileAccordionColumns: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span>Collapsible columns on mobile</span>
                    </label>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Newsletter Placeholder (Visual Shell)
                      </label>
                      <input
                        type="text"
                        value={element.content?.newsletterPlaceholder || ''}
                        onChange={(e) => updateContent({ newsletterPlaceholder: e.target.value })}
                        placeholder="Leave empty to hide newsletter shell"
                        className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                      />
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Tip: Use <code className="font-mono">{'{year}'}</code> inside footer copyright text to auto-render the current year.
                    </div>
                  </>
                )}
              </div>
            )}

            {/* NAVIGATION ELEMENTS (Navbar, Nav Menu, Breadcrumbs, Pagination, Social Links) */}
            {(element.type === 'navbar' ||
              element.type === 'nav-menu' ||
              element.type === 'breadcrumbs' ||
              element.type === 'pagination' ||
              element.type === 'social-links') && (
              <div className="space-y-3">
                {(element.type === 'navbar' || element.type === 'nav-menu') && (
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Menu Source
                        </label>
                        <select
                          value={element.content?.navSource || 'manual'}
                          onChange={(e) =>
                            updateContent({
                              navSource: e.target.value as 'manual' | 'site-pages',
                            })
                          }
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          <option value="manual">Manual Links</option>
                          <option value="site-pages">Sync with Site Pages</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Submenu Trigger
                        </label>
                        <select
                          value={element.content?.submenuTrigger || 'click'}
                          onChange={(e) =>
                            updateContent({
                              submenuTrigger: e.target.value as 'click' | 'click-hover',
                            })
                          }
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          <option value="click">Click / Tap (Accessible)</option>
                          <option value="click-hover">Click + Hover</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Nav Layout Style
                        </label>
                        <select
                          value={element.content?.navVariant || (element.type === 'navbar' ? 'split' : 'horizontal-inline')}
                          onChange={(e) => updateContent({ navVariant: e.target.value })}
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          <option value="horizontal-inline">Horizontal Inline</option>
                          <option value="split">Split Brand + Links</option>
                          <option value="centered">Centered</option>
                          <option value="dropdown">Dropdown Menu</option>
                          <option value="multi-dropdown">Multi-Level Dropdown</option>
                          <option value="mega-menu">Mega Menu</option>
                          <option value="full-mega">Full-Width Mega</option>
                          <option value="vertical-sidebar">Vertical Sidebar</option>
                          <option value="compact-icon">Compact Icon</option>
                          <option value="breadcrumb">Breadcrumb</option>
                          <option value="tab-style">Tab-Style</option>
                          <option value="scrollable-horizontal">Scrollable Strip</option>
                          <option value="bottom-mobile">Bottom Mobile Bar</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Mobile Pattern
                        </label>
                        <select
                          value={element.content?.mobileNavVariant || 'drawer'}
                          onChange={(e) =>
                            updateContent({
                              mobileNavVariant: e.target.value as
                                | 'drawer'
                                | 'fullscreen'
                                | 'off-canvas'
                                | 'bottom'
                                | 'compact',
                            })
                          }
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          <option value="drawer">Slide Drawer</option>
                          <option value="fullscreen">Full-Screen Overlay</option>
                          <option value="off-canvas">Off-Canvas Panel</option>
                          <option value="bottom">Bottom Mobile Dock</option>
                          <option value="compact">Compact Inline</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {element.type === 'navbar' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Brand / Wordmark
                      </label>
                      <input
                        type="text"
                        value={element.content?.logoText || ''}
                        onChange={(e) => updateContent({ logoText: e.target.value })}
                        className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md ${inputHeightClass}`}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          CTA Label
                        </label>
                        <input
                          type="text"
                          value={element.content?.ctaLabel || ''}
                          onChange={(e) => updateContent({ ctaLabel: e.target.value })}
                          className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          CTA URL
                        </label>
                        <input
                          type="text"
                          value={element.content?.ctaUrl || ''}
                          onChange={(e) => updateContent({ ctaUrl: e.target.value })}
                          className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md font-mono"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={element.content?.mobileMenuEnabled !== false}
                        onChange={(e) => updateContent({ mobileMenuEnabled: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span>Enable responsive mobile drawer</span>
                    </label>
                  </>
                )}

                {element.content?.navSource === 'site-pages' ? (
                  <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/50 text-[11px] text-blue-900">
                    Links automatically follow visible pages in your Site Pages tree (including parent/child dropdowns). Switch Menu Source to <strong>Manual Links</strong> to edit links individually.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        {element.type === 'social-links' ? 'Social Profiles' : 'Links'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const existing = element.content?.navLinks || [];
                          updateContent({
                            navLinks: [
                              ...existing,
                              {
                                id: `nl_${Date.now().toString(36)}`,
                                label: element.type === 'social-links' ? 'Website' : 'New Link',
                                url: '/',
                                ...(element.type === 'social-links' ? { iconName: 'Globe' } : {}),
                              },
                            ],
                          });
                        }}
                        className="min-h-[30px] px-2 py-1 bg-slate-900 text-white rounded text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(element.content?.navLinks || []).map((lnk, idx) => (
                        <div
                          key={lnk.id}
                          className="p-2 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={lnk.label}
                              onChange={(e) => {
                                const next = [...(element.content?.navLinks || [])];
                                next[idx] = { ...next[idx], label: e.target.value };
                                updateContent({ navLinks: next });
                              }}
                              placeholder="Label"
                              className="flex-1 min-w-0 min-h-[32px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = (element.content?.navLinks || []).filter(
                                  (_, i) => i !== idx
                                );
                                updateContent({ navLinks: next });
                              }}
                              aria-label="Remove link"
                              className="p-1.5 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              value={lnk.url}
                              onChange={(e) => {
                                const next = [...(element.content?.navLinks || [])];
                                next[idx] = { ...next[idx], url: e.target.value };
                                updateContent({ navLinks: next });
                              }}
                              placeholder="/path or https://..."
                              className="min-h-[32px] text-[11px] px-2 py-1 border border-slate-200 rounded bg-white font-mono"
                            />
                            {element.type === 'social-links' ? (
                              <select
                                value={lnk.iconName || 'Globe'}
                                onChange={(e) => {
                                  const next = [...(element.content?.navLinks || [])];
                                  next[idx] = { ...next[idx], iconName: e.target.value };
                                  updateContent({ navLinks: next });
                                }}
                                className="min-h-[32px] text-[11px] px-1.5 py-1 border border-slate-200 rounded bg-white"
                              >
                                {['Globe', 'Github', 'Linkedin', 'Twitter', 'Instagram', 'Youtube', 'Dribbble', 'Mail'].map(
                                  (ic) => (
                                    <option key={ic} value={ic}>
                                      {ic}
                                    </option>
                                  )
                                )}
                              </select>
                            ) : (
                              (element.type === 'navbar' || element.type === 'nav-menu') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...(element.content?.navLinks || [])];
                                    const existingChildren = next[idx].children || [];
                                    next[idx] = {
                                      ...next[idx],
                                      children: [
                                        ...existingChildren,
                                        {
                                          id: `sub_${Date.now().toString(36)}`,
                                          label: 'Sub-item',
                                          url: '/',
                                        },
                                      ],
                                    };
                                    updateContent({ navLinks: next });
                                  }}
                                  className="min-h-[32px] px-2 py-1 border border-slate-200 bg-white hover:bg-slate-100 rounded text-[11px] font-medium text-slate-700"
                                >
                                  + Sub-link ({lnk.children?.length || 0})
                                </button>
                              )
                            )}
                          </div>

                          {lnk.children && lnk.children.length > 0 && (
                            <div className="pl-2.5 pt-1 border-l-2 border-indigo-200 space-y-1">
                              {lnk.children.map((sub, subIdx) => (
                                <div key={sub.id} className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={sub.label}
                                    onChange={(e) => {
                                      const next = [...(element.content?.navLinks || [])];
                                      const subs = [...(next[idx].children || [])];
                                      subs[subIdx] = { ...subs[subIdx], label: e.target.value };
                                      next[idx] = { ...next[idx], children: subs };
                                      updateContent({ navLinks: next });
                                    }}
                                    placeholder="Sub-label"
                                    className="flex-1 min-w-0 min-h-[28px] text-[11px] px-1.5 py-0.5 border border-slate-200 rounded bg-white"
                                  />
                                  <input
                                    type="text"
                                    value={sub.url}
                                    onChange={(e) => {
                                      const next = [...(element.content?.navLinks || [])];
                                      const subs = [...(next[idx].children || [])];
                                      subs[subIdx] = { ...subs[subIdx], url: e.target.value };
                                      next[idx] = { ...next[idx], children: subs };
                                      updateContent({ navLinks: next });
                                    }}
                                    placeholder="/url"
                                    className="w-20 min-h-[28px] text-[10px] px-1.5 py-0.5 border border-slate-200 rounded bg-white font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...(element.content?.navLinks || [])];
                                      const subs = (next[idx].children || []).filter(
                                        (_, s) => s !== subIdx
                                      );
                                      next[idx] = { ...next[idx], children: subs };
                                      updateContent({ navLinks: next });
                                    }}
                                    aria-label="Remove sub-link"
                                    className="p-1 text-slate-400 hover:text-red-600"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* IMAGE / BACKGROUND MEDIA */}
            {(element.type === 'image' || element.type === 'background-media') && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Image Source URL
                  </label>
                  <input
                    type="text"
                    value={element.content?.imageSrc || ''}
                    onChange={(e) => updateContent({ imageSrc: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                  />
                </div>

                {site && site.mediaAssets.length > 0 && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Quick Pick from Drive Assets
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const a = site.mediaAssets.find((m) => m.id === e.target.value);
                        if (a) {
                          updateContent({
                            imageSrc: a.url,
                            imageAlt: a.altText || element.content?.imageAlt || a.name,
                          });
                        }
                      }}
                      className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded-md bg-white"
                    >
                      <option value="">Choose asset...</option>
                      {site.mediaAssets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {element.type === 'image' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Aspect Ratio
                    </label>
                    <div className="grid grid-cols-4 gap-1">
                      {(['16:9', '4:3', '1:1', 'auto'] as const).map((ar) => (
                        <button
                          key={ar}
                          type="button"
                          onClick={() => updateContent({ aspectRatio: ar })}
                          className={`min-h-[38px] text-xs py-1 rounded font-mono transition-colors ${
                            element.content?.aspectRatio === ar
                              ? 'bg-slate-900 text-white font-bold'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {ar}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Alt Text
                  </label>
                  <input
                    type="text"
                    value={element.content?.imageAlt || ''}
                    onChange={(e) => updateContent({ imageAlt: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                  />
                </div>
              </div>
            )}

            {/* VIDEO / AUDIO / EMBED / MAP */}
            {element.type === 'video' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Video URL (MP4 / WebM or Drive URL)
                  </label>
                  <input
                    type="text"
                    value={element.content?.videoUrl || ''}
                    onChange={(e) => updateContent({ videoUrl: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Poster Image URL
                  </label>
                  <input
                    type="text"
                    value={element.content?.videoPoster || ''}
                    onChange={(e) => updateContent({ videoPoster: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                  />
                </div>
              </div>
            )}

            {element.type === 'audio' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Track Title
                  </label>
                  <input
                    type="text"
                    value={element.content?.audioTitle || ''}
                    onChange={(e) => updateContent({ audioTitle: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Audio Source URL
                  </label>
                  <input
                    type="text"
                    value={element.content?.audioUrl || ''}
                    onChange={(e) => updateContent({ audioUrl: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                  />
                </div>
              </div>
            )}

            {element.type === 'embed' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 block">
                  External Embed URL (HTTPS required)
                </label>
                <input
                  type="url"
                  value={element.content?.embedUrl || ''}
                  onChange={(e) => updateContent({ embedUrl: e.target.value })}
                  placeholder="https://www.figma.com/embed?..."
                  className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                />
                <p className="text-[11px] text-slate-500">
                  Rendered inside a sandboxed iframe. Only <code className="font-mono">https://</code>{' '}
                  URLs are permitted.
                </p>
              </div>
            )}

            {element.type === 'map' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Location Label
                  </label>
                  <input
                    type="text"
                    value={element.content?.text || ''}
                    onChange={(e) => updateContent({ text: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Coordinates / Address Subtitle
                  </label>
                  <input
                    type="text"
                    value={element.content?.caption || ''}
                    onChange={(e) => updateContent({ caption: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Google Maps Embed / Link URL
                  </label>
                  <input
                    type="url"
                    value={element.content?.url || ''}
                    onChange={(e) => updateContent({ url: e.target.value })}
                    placeholder="https://maps.google.com/..."
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                  />
                </div>
              </div>
            )}

            {/* SVG GRAPHIC */}
            {element.type === 'svg-graphic' && (() => {
              const check = sanitizeSvgMarkup(element.content?.svgMarkup || '');
              return (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Sanitized SVG Markup
                  </label>
                  <textarea
                    rows={6}
                    value={element.content?.svgMarkup || ''}
                    onChange={(e) => updateContent({ svgMarkup: e.target.value })}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-md font-mono bg-slate-950 text-slate-100"
                  />
                  {!check.valid && (
                    <div className="flex items-start gap-1 text-[11px] text-red-600">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{check.error}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* FORMS & INTERACTIVE CONTROLS */}
            {(element.type === 'form' ||
              element.type === 'text-input' ||
              element.type === 'textarea' ||
              element.type === 'select' ||
              element.type === 'checkbox' ||
              element.type === 'radio-group' ||
              element.type === 'toggle' ||
              element.type === 'modal-box') && (
              <div className="space-y-3">
                {element.type === 'form' ? (
                  <FormCmsInspectorSection
                    element={element}
                    site={site}
                    workspace={workspace}
                    onUpdateElement={onUpdateElement}
                    onUpdateCms={onUpdateCms}
                    onUpdateWorkspaceTabs={onUpdateWorkspaceTabs}
                    onSubmitForm={onSubmitForm}
                    onOpenCmsInbox={onOpenCmsInbox}
                    inputHeightClass={inputHeightClass}
                  />
                ) : element.type === 'modal-box' ? (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Trigger Button Label
                      </label>
                      <input
                        type="text"
                        value={element.content?.modalTriggerLabel || ''}
                        onChange={(e) => updateContent({ modalTriggerLabel: e.target.value })}
                        className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Modal Dialog Title
                      </label>
                      <input
                        type="text"
                        value={element.content?.modalTitle || ''}
                        onChange={(e) => updateContent({ modalTitle: e.target.value })}
                        className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Field Label
                      </label>
                      <input
                        type="text"
                        value={element.content?.fieldLabel || ''}
                        onChange={(e) => updateContent({ fieldLabel: e.target.value })}
                        className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                      />
                    </div>
                    {(element.type === 'text-input' || element.type === 'textarea') && (
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          Placeholder
                        </label>
                        <input
                          type="text"
                          value={element.content?.placeholder || ''}
                          onChange={(e) => updateContent({ placeholder: e.target.value })}
                          className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                        />
                      </div>
                    )}
                    {element.type === 'text-input' && (
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          Input Type
                        </label>
                        <select
                          value={element.content?.inputType || 'text'}
                          onChange={(e) =>
                            updateContent({
                              inputType: e.target.value as 'text' | 'email' | 'url' | 'tel' | 'number',
                            })
                          }
                          className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                        >
                          <option value="text">Text</option>
                          <option value="email">Email</option>
                          <option value="url">URL</option>
                          <option value="tel">Phone</option>
                          <option value="number">Number</option>
                        </select>
                      </div>
                    )}
                    {(element.type === 'select' || element.type === 'radio-group') && (
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          Options (one per line)
                        </label>
                        <textarea
                          rows={4}
                          value={(element.content?.options || []).join('\n')}
                          onChange={(e) =>
                            updateContent({
                              options: e.target.value
                                .split('\n')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full text-xs p-2 border border-slate-200 rounded-md"
                        />
                      </div>
                    )}
                    {(element.type === 'checkbox' || element.type === 'toggle') && (
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(element.content?.checked)}
                          onChange={(e) => updateContent({ checked: e.target.checked })}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                        <span>Checked by default</span>
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(element.content?.required)}
                        onChange={(e) => updateContent({ required: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                      <span>Required field</span>
                    </label>
                  </>
                )}
              </div>
            )}

            {/* STRUCTURED COLLECTIONS (List, Gallery, Tabs, Accordion, Profile, Skills, Experience, Education, Timeline, Testimonials, Chart) */}
            {(element.type === 'list' ||
              element.type === 'image-gallery' ||
              element.type === 'tabs' ||
              element.type === 'accordion' ||
              element.type === 'profile-card' ||
              element.type === 'skills-matrix' ||
              element.type === 'experience' ||
              element.type === 'education' ||
              element.type === 'timeline' ||
              element.type === 'testimonials' ||
              element.type === 'chart') && (
              <div className="space-y-3">
                {element.type === 'list' && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(element.content?.orderedList)}
                      onChange={(e) => updateContent({ orderedList: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <span>Numbered List (&lt;ol&gt;)</span>
                  </label>
                )}

                {element.type === 'profile-card' && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={element.content?.text || ''}
                        onChange={(e) => updateContent({ text: e.target.value })}
                        className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md ${inputHeightClass}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Role &amp; Location
                      </label>
                      <input
                        type="text"
                        value={element.content?.caption || ''}
                        onChange={(e) => updateContent({ caption: e.target.value })}
                        className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md ${inputHeightClass}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Avatar Image URL
                      </label>
                      <input
                        type="text"
                        value={element.content?.imageSrc || ''}
                        onChange={(e) => updateContent({ imageSrc: e.target.value })}
                        className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono ${inputHeightClass}`}
                      />
                    </div>
                  </div>
                )}

                {element.type !== 'profile-card' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Items ({element.content?.items?.length || 0})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const items = element.content?.items || [];
                          updateContent({
                            items: [
                              ...items,
                              {
                                id: `itm_${Date.now().toString(36)}`,
                                title: `Item ${items.length + 1}`,
                                subtitle: '',
                                description: '',
                                meta: '',
                                ...(element.type === 'chart' || element.type === 'skills-matrix'
                                  ? { value: 80 }
                                  : {}),
                              },
                            ],
                          });
                        }}
                        className="min-h-[30px] px-2 py-1 bg-slate-900 text-white rounded text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Item</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(element.content?.items || []).map((itm, idx) => (
                        <div
                          key={itm.id}
                          className="p-2 rounded-lg border border-slate-200 bg-slate-50 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={itm.title}
                              onChange={(e) => {
                                const next = [...(element.content?.items || [])];
                                next[idx] = { ...next[idx], title: e.target.value };
                                updateContent({ items: next });
                              }}
                              placeholder="Title"
                              className="flex-1 min-w-0 min-h-[32px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = (element.content?.items || []).filter(
                                  (_, i) => i !== idx
                                );
                                updateContent({ items: next });
                              }}
                              aria-label="Remove item"
                              className="p-1.5 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {element.type !== 'list' && (
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                type="text"
                                value={itm.subtitle || ''}
                                onChange={(e) => {
                                  const next = [...(element.content?.items || [])];
                                  next[idx] = { ...next[idx], subtitle: e.target.value };
                                  updateContent({ items: next });
                                }}
                                placeholder="Subtitle / Role"
                                className="min-h-[30px] text-[11px] px-2 py-1 border border-slate-200 rounded bg-white"
                              />
                              {element.type === 'chart' || element.type === 'skills-matrix' ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={itm.value ?? ''}
                                  onChange={(e) => {
                                    const next = [...(element.content?.items || [])];
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      next[idx] = { ...next[idx], value: undefined };
                                    } else {
                                      const parsed = parseInt(raw, 10);
                                      if (Number.isFinite(parsed)) {
                                        next[idx] = { ...next[idx], value: parsed };
                                      }
                                    }
                                    updateContent({ items: next });
                                  }}
                                  placeholder="Value %"
                                  className="h-[34px] text-xs px-2.5 border border-[var(--builder-border)] rounded-[6px] bg-white font-mono tabular-nums focus:outline-none focus:border-[var(--builder-primary)]"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={itm.meta || ''}
                                  onChange={(e) => {
                                    const next = [...(element.content?.items || [])];
                                    next[idx] = { ...next[idx], meta: e.target.value };
                                    updateContent({ items: next });
                                  }}
                                  placeholder="Meta / Year"
                                  className="min-h-[30px] text-[11px] px-2 py-1 border border-slate-200 rounded bg-white"
                                />
                              )}
                            </div>
                          )}

                          {element.type === 'image-gallery' && (
                            <input
                              type="text"
                              value={itm.imageSrc || ''}
                              onChange={(e) => {
                                const next = [...(element.content?.items || [])];
                                next[idx] = { ...next[idx], imageSrc: e.target.value };
                                updateContent({ items: next });
                              }}
                              placeholder="Image URL"
                              className="w-full min-h-[30px] text-[11px] px-2 py-1 border border-slate-200 rounded bg-white font-mono"
                            />
                          )}

                          {element.type !== 'list' &&
                            element.type !== 'chart' &&
                            element.type !== 'image-gallery' && (
                              <textarea
                                rows={2}
                                value={itm.description || ''}
                                onChange={(e) => {
                                  const next = [...(element.content?.items || [])];
                                  next[idx] = { ...next[idx], description: e.target.value };
                                  updateContent({ items: next });
                                }}
                                placeholder="Description / Details"
                                className="w-full text-[11px] p-1.5 border border-slate-200 rounded bg-white"
                              />
                            )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DATA TABLE */}
            {element.type === 'data-table' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Data Source (Sheets Tab or Custom)
                  </label>
                  <select
                    value={element.content?.repeaterCollection || 'custom'}
                    onChange={(e) => updateContent({ repeaterCollection: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                  >
                    <option value="custom">Custom Static Rows</option>
                    {workspace.spreadsheet.tabs.map((tab) => (
                      <option key={tab.name} value={tab.name}>
                        Sheets: {tab.name} ({tab.rows.length} rows)
                      </option>
                    ))}
                  </select>
                </div>

                {(element.content?.repeaterCollection || 'custom') === 'custom' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Column Headers (comma separated)
                      </label>
                      <input
                        type="text"
                        value={(element.content?.tableColumns || []).join(', ')}
                        onChange={(e) =>
                          updateContent({
                            tableColumns: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-md ${inputHeightClass}`}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1">
                        Rows (one row per line, values separated by |)
                      </label>
                      <textarea
                        rows={4}
                        value={(element.content?.tableRows || [])
                          .map((r) => r.join(' | '))
                          .join('\n')}
                        onChange={(e) =>
                          updateContent({
                            tableRows: e.target.value
                              .split('\n')
                              .map((line) => line.split('|').map((c) => c.trim()))
                              .filter((cells) => cells.some(Boolean)),
                          })
                        }
                        className="w-full text-[11px] font-mono p-2 border border-slate-200 rounded-md"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {element.type === 'repeater' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Google Sheets Collection
                  </label>
                  <select
                    value={element.content?.repeaterCollection || 'PROJECTS'}
                    onChange={(e) => updateContent({ repeaterCollection: e.target.value })}
                    className={`w-full px-2.5 py-2 border border-slate-200 rounded-md ${inputHeightClass}`}
                  >
                    {workspace.spreadsheet.tabs.map((tab) => (
                      <option key={tab.name} value={tab.name}>
                        {tab.name} ({tab.rows.length} rows)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--builder-text-primary)] block mb-1">
                    Item Limit
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={element.content?.repeaterLimit ?? ''}
                    placeholder="6"
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        updateContent({ repeaterLimit: undefined });
                        return;
                      }
                      const parsed = parseInt(raw, 10);
                      if (Number.isFinite(parsed)) {
                        updateContent({ repeaterLimit: parsed });
                      }
                    }}
                    className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono tabular-nums bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                  />
                </div>
              </div>
            )}

            {element.type === 'html-embed' && (() => {
              const rawHtml = element.content?.htmlCode || '';
              const extracted = extractEmbeddedHtmlAndCss(rawHtml, { stripScripts: false });
              const cssDelimCheck = extracted.extractedCss
                ? hasBalancedDelimiters(extracted.extractedCss)
                : { valid: true };
              const embedThemeMode = element.content?.embedThemeMode || 'follow-theme';

              return (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                      Theme Integration
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-md">
                      {(
                        [
                          { id: 'follow-theme', label: 'Follow Theme' },
                          { id: 'independent', label: 'Separate from Theme' },
                        ] as const
                      ).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => updateContent({ embedThemeMode: mode.id })}
                          className={`min-h-[36px] px-2 rounded text-[11px] font-semibold transition-colors ${
                            embedThemeMode === mode.id
                              ? 'bg-slate-900 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                      {embedThemeMode === 'follow-theme'
                        ? 'Injects active site theme variables (var(--color-*), var(--font-*)) into this sandbox.'
                        : 'Uses a clean baseline independent of the site theme.'}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Embedded HTML, &lt;style&gt; &amp; &lt;script&gt;
                      </label>
                      <span className="text-[10px] font-mono text-emerald-700">
                        Element-Only Sandbox
                      </span>
                    </div>
                    <textarea
                      rows={9}
                      value={rawHtml}
                      onChange={(e) => updateContent({ htmlCode: e.target.value })}
                      placeholder={`<style>\n  .demo-btn { padding: 8px 14px; border-radius: 6px; border: 0; background: var(--color-primary); color: #fff; cursor: pointer; }\n</style>\n<button class="demo-btn" id="btn">Clicked: 0</button>\n<script>\n  let n = 0;\n  document.getElementById('btn').addEventListener('click', (e) => {\n    e.target.textContent = 'Clicked: ' + (++n);\n  });\n</script>`}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-md font-mono bg-slate-950 text-slate-100"
                    />
                    <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                      HTML, <code className="font-mono">&lt;style&gt;</code> CSS, and{' '}
                      <code className="font-mono">&lt;script&gt;</code> JavaScript run inside an
                      isolated sandbox strictly confined to this element with zero effect outside.
                    </p>
                  </div>

                  {/* Quick Theme Token Chips */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Theme CSS Variables (click to insert)
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {[
                        'var(--color-primary)',
                        'var(--color-surface)',
                        'var(--color-heading)',
                        'var(--color-text)',
                        'var(--color-border)',
                        'var(--font-display)',
                      ].map((token) => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => {
                            const nextHtml = rawHtml
                              ? `${rawHtml}\n/* ${token} */`
                              : `<div style="color:${token};">Themed Block</div>`;
                            updateContent({ htmlCode: nextHtml });
                          }}
                          className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-[10px] font-mono text-slate-700"
                        >
                          {token.replace(/^var\((--[^)]+)\)$/, '$1')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!cssDelimCheck.valid && (
                    <div className="p-2 rounded bg-red-50 border border-red-200 text-[11px] text-red-700 flex items-start gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{cssDelimCheck.error || 'Unbalanced CSS braces or quotes inside <style>.'}</span>
                    </div>
                  )}

                  {cssDelimCheck.valid && extracted.hadScript && (
                    <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                      JavaScript is active inside this element&apos;s sandbox. Select the element on
                      canvas to interact with buttons/forms, or click Refresh in its toolbar to re-run scripts.
                    </div>
                  )}
                </div>
              );
            })()}

            {(isContainerElementType(element.type) ||
              element.type === 'spacer' ||
              element.type === 'divider') && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                Use the <strong className="text-slate-900">Style</strong>,{' '}
                <strong className="text-slate-900">Responsive</strong>, and{' '}
                <strong className="text-slate-900">Advanced</strong> tabs to customize layout,
                alignment, spacing, effects, transforms, and custom CSS for this {element.type}.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STYLE (FULL CSS PROPERTY SYSTEM) */}
        {activeTab === 'style' && (
          <div className="space-y-3.5">
            {selectedRegionType && (
              <RegionPresetPanel
                regionType={selectedRegionType}
                element={element}
                site={site}
                editingRegionLabel={editingRegionLabel}
                globalUsageCount={globalRegionUsageCount}
                deviceMode={deviceMode}
                onReplaceRegionNode={onUpdateElement}
                onSaveAsTemplate={onSaveRegionAsTemplate}
              />
            )}

            <BreakpointBanner />
            <PseudoStateBar />
            <StyleSearchBar />

            {showSection('layout') && (
              <CollapsibleStyleGroup
                sectionId="layout"
                title={t('inspector.styleGroups.layout')}
                subtitle={layoutCtx.effectiveDisplay}
                defaultOpen={true}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(LAYOUT_PROPS)}
                onResetGroup={() => handleResetGroup(LAYOUT_PROPS)}
              >
                <LayoutSection
                  {...styleCtxProps}
                  layoutCtx={layoutCtx}
                  onOpenNavigator={onOpenNavigator}
                />
              </CollapsibleStyleGroup>
            )}

            {showSection('alignment') && (
              <CollapsibleStyleGroup
                sectionId="alignment"
                title={t('inspector.styleGroups.alignment')}
                subtitle={
                  layoutCtx.isFlexContainer
                    ? 'Flex Container'
                    : layoutCtx.isGridContainer
                    ? 'Grid Container'
                    : layoutCtx.isFlexItem
                    ? 'Flex Item'
                    : layoutCtx.isGridItem
                    ? 'Grid Item'
                    : t('inspector.styleGroups.alignmentSub')
                }
                defaultOpen={true}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(ALIGNMENT_PROPS)}
                onResetGroup={() => handleResetGroup(ALIGNMENT_PROPS)}
              >
                <AlignmentSection
                  {...styleCtxProps}
                  parentElement={parentElement}
                  layoutCtx={layoutCtx}
                />
              </CollapsibleStyleGroup>
            )}

            {showSection('sizing') && (
              <CollapsibleStyleGroup
                sectionId="sizing"
                title={t('inspector.styleGroups.sizing')}
                subtitle={t('inspector.styleGroups.sizingSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(SIZING_PROPS)}
                onResetGroup={() => handleResetGroup(SIZING_PROPS)}
              >
                <SizingSection {...styleCtxProps} />
              </CollapsibleStyleGroup>
            )}

            {showSection('spacing') && (
              <CollapsibleStyleGroup
                sectionId="spacing"
                title={t('inspector.styleGroups.spacing')}
                subtitle={t('inspector.styleGroups.spacingSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides([
                  'margin',
                  'marginTop',
                  'marginRight',
                  'marginBottom',
                  'marginLeft',
                  'marginInline',
                  'marginBlock',
                  'padding',
                  'paddingTop',
                  'paddingRight',
                  'paddingBottom',
                  'paddingLeft',
                  'paddingInline',
                  'paddingBlock',
                ])}
                onResetGroup={() =>
                  handleResetGroup([
                    'margin',
                    'marginTop',
                    'marginRight',
                    'marginBottom',
                    'marginLeft',
                    'marginInline',
                    'marginBlock',
                    'padding',
                    'paddingTop',
                    'paddingRight',
                    'paddingBottom',
                    'paddingLeft',
                    'paddingInline',
                    'paddingBlock',
                  ])
                }
              >
                <BoxModelEditor {...styleCtxProps} />
              </CollapsibleStyleGroup>
            )}

            {showSection('typography') && (
              <CollapsibleStyleGroup
                sectionId="typography"
                title={t('inspector.styleGroups.typography')}
                subtitle={t('inspector.styleGroups.typographySub')}
                defaultOpen={element.type === 'heading' || element.type === 'text' || element.type === 'button'}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(TYPOGRAPHY_PROPS)}
                onResetGroup={() => handleResetGroup(TYPOGRAPHY_PROPS)}
              >
                <TypographySection {...styleCtxProps} />
              </CollapsibleStyleGroup>
            )}

            {showSection('background') && (
              <CollapsibleStyleGroup
                sectionId="background"
                title={t('inspector.styleGroups.background')}
                subtitle={t('inspector.styleGroups.backgroundSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(BACKGROUND_PROPS)}
                onResetGroup={() => handleResetGroup(BACKGROUND_PROPS)}
              >
                <BackgroundSection {...styleCtxProps} mediaAssets={site?.mediaAssets || []} />
              </CollapsibleStyleGroup>
            )}

            {showSection('border') && (
              <CollapsibleStyleGroup
                sectionId="border"
                title={t('inspector.styleGroups.border')}
                subtitle={t('inspector.styleGroups.borderSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(BORDER_PROPS)}
                onResetGroup={() => handleResetGroup(BORDER_PROPS)}
              >
                <BorderOutlineSection {...styleCtxProps} />
              </CollapsibleStyleGroup>
            )}

            {showSection('effects') && (
              <CollapsibleStyleGroup
                sectionId="effects"
                title={t('inspector.styleGroups.effects')}
                subtitle={t('inspector.styleGroups.effectsSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(EFFECTS_PROPS)}
                onResetGroup={() => handleResetGroup(EFFECTS_PROPS)}
              >
                <EffectsFiltersSection {...styleCtxProps} />
              </CollapsibleStyleGroup>
            )}

            {showSection('overflow') && (
              <CollapsibleStyleGroup
                sectionId="overflow"
                title={t('inspector.styleGroups.overflow')}
                subtitle={t('inspector.styleGroups.overflowSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(OVERFLOW_PROPS)}
                onResetGroup={() => handleResetGroup(OVERFLOW_PROPS)}
              >
                <OverflowMediaSection {...styleCtxProps} layoutCtx={layoutCtx} />
              </CollapsibleStyleGroup>
            )}

            {styleSearch &&
              !['layout', 'alignment', 'sizing', 'spacing', 'typography', 'background', 'border', 'effects', 'overflow'].some(
                (id) => showSection(id)
              ) && (
                <div className="p-4 rounded-[8px] bg-[var(--builder-surface-muted)] text-center text-xs text-[var(--builder-text-secondary)]">
                  {t('inspector.styleGroups.noMatchingStyles', { query: styleSearch })}
                </div>
              )}
          </div>
        )}

        {/* TAB 3: RESPONSIVE */}
        {activeTab === 'responsive' && (
          <div className="space-y-4">
            <BreakpointBanner />

            {/* Copy from another breakpoint */}
            {deviceMode !== 'desktop' && (
              <div className="p-3 bg-[var(--builder-surface-muted)] rounded-[8px] space-y-2">
                <span className="text-xs font-medium text-[var(--builder-text-primary)] block">
                  {t('inspector.copyFromBreakpoint')} ({t(`common.${deviceMode}`)})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyFromBreakpoint('desktop')}
                    className="min-h-[32px] px-2.5 py-1 rounded-[6px] border border-[var(--builder-border)] bg-white hover:bg-[var(--builder-surface-hover)] text-xs font-medium text-[var(--builder-text-primary)]"
                  >
                    {t('common.desktop')}
                  </button>
                  {deviceMode === 'mobile' && (
                    <button
                      type="button"
                      onClick={() => handleCopyFromBreakpoint('tablet')}
                      className="min-h-[32px] px-2.5 py-1 rounded-[6px] border border-[var(--builder-border)] bg-white hover:bg-[var(--builder-surface-hover)] text-xs font-medium text-[var(--builder-text-primary)]"
                    >
                      {t('common.tablet')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Visibility by Breakpoint */}
            <div className="space-y-2 pt-1">
              <div className="text-[13px] font-semibold text-[var(--builder-text-primary)] flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5 text-[var(--builder-text-secondary)]" />
                <span>Visibility per Breakpoint</span>
              </div>

              <div className="space-y-1.5">
                {[
                  { key: 'hideOnDesktop', label: 'Hide on Desktop (1024px+)' },
                  { key: 'hideOnTablet', label: 'Hide on Tablet (768px–1023px)' },
                  { key: 'hideOnMobile', label: 'Hide on Mobile (≤767px)' },
                ].map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-2 min-h-[38px] px-3 py-1.5 rounded-[7px] border border-[var(--builder-border)] bg-white text-xs text-[var(--builder-text-primary)] cursor-pointer hover:bg-[var(--builder-surface-muted)]"
                  >
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean((element.advanced as Record<string, unknown>)?.[key])}
                      onChange={(e) => updateAdvanced({ [key]: e.target.checked })}
                      className="w-4 h-4 rounded accent-[var(--builder-primary)]"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Responsive Layout & Stacking */}
            <div className="space-y-2.5 pt-3 border-t border-[var(--builder-border)]">
              <div className="text-[13px] font-semibold text-[var(--builder-text-primary)]">
                Responsive Layout &amp; Stacking ({t(`common.${deviceMode}`)})
              </div>

              <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                <div>
                  <FieldHeader
                    label={t('inspector.fields.display')}
                    prop="display"
                    element={element}
                    deviceMode={deviceMode}
                    pseudoState="default"
                    onResetProp={(p) => handleResetProp(p, 'default')}
                  />
                  <select
                    value={renderResponsiveMeta('display', layoutCtx.effectiveDisplay)}
                    onChange={(e) => updateBreakpointStyles({ display: e.target.value }, 'default')}
                    className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                  >
                    <option value="flex">flex</option>
                    <option value="inline-flex">inline-flex</option>
                    <option value="grid">grid</option>
                    <option value="inline-grid">inline-grid</option>
                    <option value="block">block</option>
                    <option value="inline-block">inline-block</option>
                    <option value="none">none</option>
                  </select>
                </div>

                <div>
                  <FieldHeader
                    label={t('inspector.alignment.order')}
                    prop="order"
                    element={element}
                    deviceMode={deviceMode}
                    pseudoState="default"
                    onResetProp={(p) => handleResetProp(p, 'default')}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={renderResponsiveMeta('order', '')}
                    onChange={(e) => updateBreakpointStyles({ order: e.target.value }, 'default')}
                    className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono tabular-nums bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                  />
                </div>
              </div>

              {layoutCtx.isGridItem && (
                <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                  <div>
                    <FieldHeader
                      label={t('inspector.alignment.gridColumn')}
                      prop="gridColumn"
                      element={element}
                      deviceMode={deviceMode}
                      pseudoState="default"
                      onResetProp={(p) => handleResetProp(p, 'default')}
                    />
                    <input
                      type="text"
                      placeholder="span 2 / 1 / -1"
                      value={renderResponsiveMeta('gridColumn', '')}
                      onChange={(e) =>
                        updateBreakpointStyles({ gridColumn: e.target.value }, 'default')
                      }
                      className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                    />
                  </div>
                  <div>
                    <FieldHeader
                      label={t('inspector.alignment.gridRow')}
                      prop="gridRow"
                      element={element}
                      deviceMode={deviceMode}
                      pseudoState="default"
                      onResetProp={(p) => handleResetProp(p, 'default')}
                    />
                    <input
                      type="text"
                      placeholder="span 1"
                      value={renderResponsiveMeta('gridRow', '')}
                      onChange={(e) =>
                        updateBreakpointStyles({ gridRow: e.target.value }, 'default')
                      }
                      className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                <CssUnitInput
                  label={t('inspector.fields.width')}
                  prop="width"
                  element={element}
                  deviceMode={deviceMode}
                  pseudoState="default"
                  isOverlay={isOverlay}
                  onChange={(v) => updateBreakpointStyles({ width: v }, 'default')}
                  onReset={(p) => handleResetProp(p, 'default')}
                />
                <CssUnitInput
                  label={t('inspector.alignment.gap')}
                  prop="gap"
                  element={element}
                  deviceMode={deviceMode}
                  pseudoState="default"
                  keywords={[]}
                  isOverlay={isOverlay}
                  onChange={(v) => updateBreakpointStyles({ gap: v }, 'default')}
                  onReset={(p) => handleResetProp(p, 'default')}
                />
                <CssUnitInput
                  label={t('inspector.fields.fontSize')}
                  prop="fontSize"
                  element={element}
                  deviceMode={deviceMode}
                  pseudoState="default"
                  keywords={[]}
                  isOverlay={isOverlay}
                  onChange={(v) => updateBreakpointStyles({ fontSize: v }, 'default')}
                  onReset={(p) => handleResetProp(p, 'default')}
                />
                <CssUnitInput
                  label={t('inspector.spacing.paddingInline')}
                  prop="paddingInline"
                  element={element}
                  deviceMode={deviceMode}
                  pseudoState="default"
                  keywords={[]}
                  isOverlay={isOverlay}
                  onChange={(v) => updateBreakpointStyles({ paddingInline: v }, 'default')}
                  onReset={(p) => handleResetProp(p, 'default')}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ADVANCED */}
        {activeTab === 'advanced' && (
          <div className="space-y-3.5">
            <PseudoStateBar />
            <StyleSearchBar />

            {showSection('positioning') && (
              <CollapsibleStyleGroup
                sectionId="positioning"
                title={t('inspector.styleGroups.positioning')}
                subtitle={renderResponsiveMeta('position', 'static')}
                defaultOpen={renderResponsiveMeta('position', 'static') !== 'static'}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(POSITION_PROPS)}
                onResetGroup={() => handleResetGroup(POSITION_PROPS)}
              >
                <PositioningSection {...styleCtxProps} />
              </CollapsibleStyleGroup>
            )}

            {showSection('transform') && (
              <CollapsibleStyleGroup
                sectionId="transform"
                title={t('inspector.styleGroups.transform')}
                subtitle={t('inspector.styleGroups.transformSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(TRANSFORM_PROPS)}
                onResetGroup={() => handleResetGroup(TRANSFORM_PROPS)}
              >
                <TransformSection {...styleCtxProps} />
              </CollapsibleStyleGroup>
            )}

            {showSection('transition') && (
              <CollapsibleStyleGroup
                sectionId="transition"
                title={t('inspector.styleGroups.transition')}
                subtitle={t('inspector.styleGroups.transitionSub')}
                defaultOpen={false}
                forceOpen={Boolean(styleSearch)}
                hasGroupOverrides={hasGroupOverrides(TRANSITION_PROPS)}
                onResetGroup={() => handleResetGroup(TRANSITION_PROPS)}
              >
                <TransitionAnimationSection
                  {...styleCtxProps}
                  reduceMotionPreview={reduceMotionPreview}
                  onToggleReduceMotion={onToggleReduceMotion}
                />
              </CollapsibleStyleGroup>
            )}

            <CollapsibleStyleGroup
              sectionId="logical"
              title={t('inspector.styleGroups.logical')}
              subtitle={t('inspector.styleGroups.logicalSub')}
              defaultOpen={false}
              forceOpen={Boolean(styleSearch)}
              hasGroupOverrides={hasGroupOverrides([
                'inlineSize',
                'blockSize',
                'direction',
                'writingMode',
                'cursor',
                'pointerEvents',
                'userSelect',
              ])}
              onResetGroup={() =>
                handleResetGroup([
                  'inlineSize',
                  'blockSize',
                  'direction',
                  'writingMode',
                  'cursor',
                  'pointerEvents',
                  'userSelect',
                ])
              }
            >
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                  <CssUnitInput
                    label="Inline Size"
                    cssProp="inline-size"
                    prop="inlineSize"
                    element={element}
                    deviceMode={deviceMode}
                    pseudoState={pseudoState}
                    isOverlay={isOverlay}
                    onChange={(v) => updateBreakpointStyles({ inlineSize: v })}
                    onReset={handleResetProp}
                  />
                  <CssUnitInput
                    label="Block Size"
                    cssProp="block-size"
                    prop="blockSize"
                    element={element}
                    deviceMode={deviceMode}
                    pseudoState={pseudoState}
                    isOverlay={isOverlay}
                    onChange={(v) => updateBreakpointStyles({ blockSize: v })}
                    onReset={handleResetProp}
                  />
                </div>
                <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                  <div>
                    <FieldHeader
                      label="Direction"
                      cssProp="direction"
                      prop="direction"
                      element={element}
                      deviceMode={deviceMode}
                      pseudoState={pseudoState}
                      onResetProp={handleResetProp}
                    />
                    <select
                      value={
                        (getStyleSource(element, 'direction', deviceMode, pseudoState)
                          .value as string) || 'ltr'
                      }
                      onChange={(e) => updateBreakpointStyles({ direction: e.target.value })}
                      className="w-full px-2.5 h-[38px] border border-[var(--builder-border)] rounded-[7px] text-sm bg-white focus:outline-none focus:border-[var(--builder-primary)]"
                    >
                      <option value="ltr">ltr</option>
                      <option value="rtl">rtl</option>
                    </select>
                  </div>
                  <div>
                    <FieldHeader
                      label="Writing Mode"
                      cssProp="writing-mode"
                      prop="writingMode"
                      element={element}
                      deviceMode={deviceMode}
                      pseudoState={pseudoState}
                      onResetProp={handleResetProp}
                    />
                    <select
                      value={
                        (getStyleSource(element, 'writingMode', deviceMode, pseudoState)
                          .value as string) || 'horizontal-tb'
                      }
                      onChange={(e) => updateBreakpointStyles({ writingMode: e.target.value })}
                      className="w-full px-2.5 h-[38px] border border-[var(--builder-border)] rounded-[7px] text-sm bg-white focus:outline-none focus:border-[var(--builder-primary)]"
                    >
                      <option value="horizontal-tb">horizontal-tb</option>
                      <option value="vertical-rl">vertical-rl</option>
                      <option value="vertical-lr">vertical-lr</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                  <div>
                    <FieldHeader
                      label="Cursor"
                      cssProp="cursor"
                      prop="cursor"
                      element={element}
                      deviceMode={deviceMode}
                      pseudoState={pseudoState}
                      onResetProp={handleResetProp}
                    />
                    <select
                      value={
                        (getStyleSource(element, 'cursor', deviceMode, pseudoState)
                          .value as string) || 'auto'
                      }
                      onChange={(e) => updateBreakpointStyles({ cursor: e.target.value })}
                      className="w-full px-2.5 h-[38px] border border-[var(--builder-border)] rounded-[7px] text-sm bg-white focus:outline-none focus:border-[var(--builder-primary)]"
                    >
                      <option value="auto">auto</option>
                      <option value="pointer">pointer</option>
                      <option value="default">default</option>
                      <option value="grab">grab</option>
                      <option value="not-allowed">not-allowed</option>
                    </select>
                  </div>
                  <div>
                    <FieldHeader
                      label="User Select"
                      cssProp="user-select"
                      prop="userSelect"
                      element={element}
                      deviceMode={deviceMode}
                      pseudoState={pseudoState}
                      onResetProp={handleResetProp}
                    />
                    <select
                      value={
                        (getStyleSource(element, 'userSelect', deviceMode, pseudoState)
                          .value as string) || 'auto'
                      }
                      onChange={(e) => updateBreakpointStyles({ userSelect: e.target.value })}
                      className="w-full px-2.5 h-[38px] border border-[var(--builder-border)] rounded-[7px] text-sm bg-white focus:outline-none focus:border-[var(--builder-primary)]"
                    >
                      <option value="auto">auto</option>
                      <option value="none">none</option>
                      <option value="text">text</option>
                      <option value="all">all</option>
                    </select>
                  </div>
                </div>
              </div>
            </CollapsibleStyleGroup>

            {showSection('custom') && (
              <CollapsibleStyleGroup
                sectionId="customCss"
                title={t('inspector.styleGroups.customCss')}
                subtitle={t('inspector.styleGroups.customCssSub')}
                defaultOpen={Boolean(element.advanced?.customCss)}
                forceOpen={Boolean(styleSearch)}
              >
                <CustomCssAndRawSection
                  {...styleCtxProps}
                  onUpdateCustomCss={(css) => updateAdvanced({ customCss: css })}
                  onSetRawDeclaration={(cssProp, cssVal) =>
                    onUpdateElement(
                      setRawDeclarationForBreakpoint(
                        element,
                        cssProp,
                        cssVal,
                        deviceMode,
                        pseudoState
                      )
                    )
                  }
                />
                {onOpenCodeTab && (
                  <button
                    type="button"
                    onClick={onOpenCodeTab}
                    className="w-full min-h-[36px] border border-[var(--builder-border)] rounded-[7px] bg-[var(--builder-surface-muted)] hover:bg-[var(--builder-surface-hover)] text-xs font-semibold text-[var(--builder-text-primary)] flex items-center justify-center gap-1.5"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{t('inspector.openCode')}</span>
                  </button>
                )}
              </CollapsibleStyleGroup>
            )}

            <CollapsibleStyleGroup
              sectionId="accessibility"
              title={t('inspector.styleGroups.accessibility')}
              subtitle={t('inspector.styleGroups.accessibilitySub')}
              defaultOpen={false}
              forceOpen={Boolean(styleSearch)}
            >
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[var(--builder-text-primary)] block mb-1">
                    HTML Element ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. projects-section"
                    value={element.advanced?.htmlId || ''}
                    onChange={(e) => updateAdvanced({ htmlId: e.target.value })}
                    className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--builder-text-primary)] block mb-1">
                    Custom CSS Classes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. hero-highlight"
                    value={element.advanced?.customClasses || ''}
                    onChange={(e) => updateAdvanced({ customClasses: e.target.value })}
                    className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                  />
                </div>

                <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-medium text-[var(--builder-text-primary)] block mb-1">
                      ARIA Label
                    </label>
                    <input
                      type="text"
                      placeholder="Accessible label"
                      value={element.advanced?.ariaLabel || ''}
                      onChange={(e) => updateAdvanced({ ariaLabel: e.target.value })}
                      className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--builder-text-primary)] block mb-1">
                      ARIA Role
                    </label>
                    <input
                      type="text"
                      placeholder="region / banner"
                      value={element.advanced?.role || ''}
                      onChange={(e) => updateAdvanced({ role: e.target.value })}
                      className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--builder-text-primary)] block mb-1">
                    Entry Motion Preset
                  </label>
                  <select
                    value={element.advanced?.animation || 'none'}
                    onChange={(e) =>
                      updateAdvanced({ animation: e.target.value as ElementNode['advanced'] extends infer A ? A extends { animation?: infer M } ? M : never : never })
                    }
                    className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white focus:outline-none focus:border-[var(--builder-primary)] ${inputHeightClass}`}
                  >
                    <option value="none">None</option>
                    <option value="fade-in">Fade In</option>
                    <option value="slide-up">Slide Up</option>
                    <option value="scale-in">Scale In</option>
                  </select>
                </div>
              </div>
            </CollapsibleStyleGroup>
          </div>
        )}
      </div>
    </aside>
  );
};
