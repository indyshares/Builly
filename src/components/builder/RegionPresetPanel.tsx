import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DeviceMode,
  ElementNode,
  HeaderFooterPresetDef,
  RegionType,
  SiteDocument,
} from '../../types/builder';
import {
  analyzePresetImpact,
  applyPresetToRootNode,
  findPresetById,
  getPresetsForRegion,
  PresetImpactSummary,
} from '../../data/headerFooterPresets';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  Monitor,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
} from 'lucide-react';

interface RegionPresetPanelProps {
  regionType: RegionType;
  element: ElementNode;
  site?: SiteDocument;
  editingRegionLabel?: string | null;
  globalUsageCount?: number;
  deviceMode: DeviceMode;
  onReplaceRegionNode: (nextNode: ElementNode) => void;
  onSaveAsTemplate?: (regionType: RegionType, node: ElementNode) => void;
}

const PresetWireframePreview: React.FC<{
  preset: HeaderFooterPresetDef;
  previewDevice: DeviceMode;
}> = ({ preset, previewDevice }) => {
  const isNav = preset.regionType === 'navigation';
  const isFtr = preset.regionType === 'footer';
  const isMobile = previewDevice === 'mobile';
  const isCentered =
    preset.presetId.includes('centered') || preset.presetId.includes('editorial');
  const isDark = preset.presetId.includes('creative_bold');
  const isBottom = preset.presetId.includes('bottom_mobile');
  const isVertical = preset.presetId.includes('vertical_sidebar');
  const isMultiCol =
    preset.presetId.includes('agency_4col') ||
    preset.presetId.includes('standard_3col') ||
    preset.presetId.includes('advanced_accordion');

  return (
    <div
      className={`w-full rounded border px-2 py-2 flex flex-col gap-1.5 ${
        isDark
          ? 'bg-slate-900 border-slate-700 text-slate-100'
          : 'bg-slate-50 border-slate-200 text-slate-700'
      }`}
    >
      <div
        className={`mx-auto transition-all ${
          isMobile ? 'w-[58%] border-x border-dashed border-slate-300/70 px-1.5' : 'w-full'
        }`}
      >
        {isNav ? (
          isVertical ? (
            <div className="flex flex-col gap-1 w-1/2">
              <div className="h-1.5 w-10 rounded bg-slate-400/70" />
              <div className="h-1.5 w-12 rounded bg-slate-300" />
              <div className="h-1.5 w-9 rounded bg-slate-300" />
            </div>
          ) : isBottom && isMobile ? (
            <div className="flex items-center justify-around pt-1 border-t border-slate-300">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-500/70" />
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-400/60" />
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-400/60" />
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-400/60" />
            </div>
          ) : (
            <div
              className={`flex items-center ${
                isCentered ? 'justify-center' : 'justify-between'
              } gap-2`}
            >
              {preset.presetId === 'nav_split' && (
                <div className="h-2 w-8 rounded bg-slate-800/70" />
              )}
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-6 rounded bg-blue-500/80" />
                <div className="h-1.5 w-6 rounded bg-slate-400/60" />
                {!isMobile && <div className="h-1.5 w-6 rounded bg-slate-400/60" />}
              </div>
              {preset.presetId === 'nav_split' && !isMobile && (
                <div className="h-2.5 w-7 rounded bg-blue-600/80" />
              )}
            </div>
          )
        ) : isFtr ? (
          <div className="space-y-1.5">
            <div
              className={`flex ${
                isMobile ? 'flex-col gap-1' : 'items-start justify-between gap-2'
              }`}
            >
              <div className="h-2 w-10 rounded bg-current opacity-60" />
              {isMultiCol ? (
                <div className="flex gap-2">
                  <div className="space-y-0.5">
                    <div className="h-1 w-6 rounded bg-current opacity-50" />
                    <div className="h-1 w-5 rounded bg-current opacity-30" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="h-1 w-6 rounded bg-current opacity-50" />
                    <div className="h-1 w-5 rounded bg-current opacity-30" />
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <div className="h-1.5 w-5 rounded bg-current opacity-40" />
                  <div className="h-1.5 w-5 rounded bg-current opacity-40" />
                </div>
              )}
            </div>
            <div className="h-1 w-16 rounded bg-current opacity-25" />
          </div>
        ) : (
          <div className="space-y-1">
            {preset.presetId.includes('agency') && (
              <div className="h-1.5 w-full rounded bg-blue-600/75" />
            )}
            <div
              className={`flex ${
                isCentered && !isMobile
                  ? 'flex-col items-center gap-1'
                  : 'items-center justify-between gap-2'
              }`}
            >
              <div className="h-2 w-10 rounded bg-slate-800/75" />
              {isMobile ? (
                <div className="h-3 w-3 rounded border border-slate-400 flex flex-col justify-center gap-0.5 px-0.5">
                  <div className="h-px bg-slate-600" />
                  <div className="h-px bg-slate-600" />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-5 rounded bg-slate-400" />
                  <div className="h-1.5 w-5 rounded bg-slate-400" />
                  <div className="h-1.5 w-5 rounded bg-slate-400" />
                  {!preset.presetId.includes('min') && (
                    <div className="h-2.5 w-7 rounded bg-blue-600/80" />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const RegionPresetPanel: React.FC<RegionPresetPanelProps> = ({
  regionType,
  element,
  site,
  editingRegionLabel,
  globalUsageCount,
  deviceMode,
  onReplaceRegionNode,
  onSaveAsTemplate,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [previewDevice, setPreviewDevice] = useState<DeviceMode>(deviceMode);
  const [pendingPreset, setPendingPreset] = useState<{
    preset: HeaderFooterPresetDef;
    impact: PresetImpactSummary;
  } | null>(null);
  const [preserveContent, setPreserveContent] = useState(true);

  const presets = useMemo(() => getPresetsForRegion(regionType), [regionType]);
  const activePreset = useMemo(() => findPresetById(element.presetId), [element.presetId]);

  const savedTemplates = useMemo(() => {
    const targetType =
      regionType === 'header'
        ? 'header-template'
        : regionType === 'navigation'
        ? 'navigation-template'
        : 'footer-template';
    return (site?.libraryItems || []).filter((i) => i.type === targetType && i.rootNode);
  }, [site?.libraryItems, regionType]);

  const categories = useMemo(() => {
    const set = new Set<string>(['All']);
    presets.forEach((p) => set.add(p.category));
    if (savedTemplates.length > 0) set.add('My Templates');
    return Array.from(set);
  }, [presets, savedTemplates.length]);

  const filteredPresets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return presets.filter((p) => {
      if (selectedCategory !== 'All' && selectedCategory !== 'My Templates' && p.category !== selectedCategory) {
        return false;
      }
      if (selectedCategory === 'My Templates') return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [presets, selectedCategory, search]);

  const handleRequestApply = (preset: HeaderFooterPresetDef) => {
    const impact = analyzePresetImpact(element, preset);
    if (impact.isDestructive || (globalUsageCount && globalUsageCount > 1)) {
      setPendingPreset({ preset, impact });
      setPreserveContent(true);
    } else {
      const next = applyPresetToRootNode(element, preset, true);
      onReplaceRegionNode(next);
    }
  };

  const handleConfirmApply = () => {
    if (!pendingPreset) return;
    const next = applyPresetToRootNode(element, pendingPreset.preset, preserveContent);
    onReplaceRegionNode(next);
    setPendingPreset(null);
  };

  const handleResetToPreset = () => {
    if (!activePreset) return;
    const next = applyPresetToRootNode(element, activePreset, true);
    onReplaceRegionNode(next);
  };

  const isGlobalScope = Boolean(editingRegionLabel?.toLowerCase().includes('global'));
  const regionDisplayName = t(`regionPreset.regionNames.${regionType}`);

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="text-xs font-bold text-slate-900 truncate">
              {t(`regionPreset.titles.${regionType}`)}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">
            {activePreset ? activePreset.name : t('regionPreset.customLayout')}
            {element.isCustomized ? t('regionPreset.customizedBadge') : ''}
            {editingRegionLabel ? ` · ${isGlobalScope ? t('regionPreset.globalScope') : t('regionPreset.localScope')}` : ''}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {activePreset && element.isCustomized && (
            <button
              type="button"
              onClick={handleResetToPreset}
              title={t('regionPreset.resetTitle')}
              className="min-h-[28px] px-2 py-1 text-[10px] font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('regionPreset.resetBtn')}</span>
            </button>
          )}
          {onSaveAsTemplate && (
            <button
              type="button"
              onClick={() => onSaveAsTemplate(regionType, element)}
              title={t('regionPreset.saveTitle')}
              className="min-h-[28px] px-2 py-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded flex items-center gap-1"
            >
              <BookmarkPlus className="w-3 h-3" />
              <span>{t('regionPreset.saveBtn')}</span>
            </button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Global vs Local Scope Reminder */}
        {isGlobalScope && globalUsageCount && globalUsageCount > 0 && (
          <div className="text-[11px] text-indigo-900 bg-indigo-50/60 border border-indigo-200 rounded px-2.5 py-1.5">
            {globalUsageCount === 1
              ? t('regionPreset.globalNoticeOne', { count: globalUsageCount })
              : t('regionPreset.globalNoticeMany', { count: globalUsageCount })}
          </div>
        )}

        {/* Search + Responsive Preview Toggle */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('regionPreset.searchPlaceholder', { region: regionDisplayName })}
              className="w-full min-h-[32px] pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-md bg-white"
            />
          </div>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md shrink-0">
            {(
              [
                { id: 'desktop' as const, icon: Monitor, label: t('regionPreset.desktopPreview') },
                { id: 'tablet' as const, icon: Tablet, label: t('regionPreset.tabletPreview') },
                { id: 'mobile' as const, icon: Smartphone, label: t('regionPreset.mobilePreview') },
              ] as const
            ).map((bp) => {
              const Icon = bp.icon;
              return (
                <button
                  key={bp.id}
                  type="button"
                  title={bp.label}
                  onClick={() => setPreviewDevice(bp.id)}
                  className={`p-1 rounded ${
                    previewDevice === bp.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'All'
                ? t('regionPreset.allCategory')
                : cat === 'My Templates'
                ? t('regionPreset.myTemplatesCategory')
                : cat}
            </button>
          ))}
        </div>

        {/* Destructive Replace Confirmation Panel */}
        {pendingPreset && (
          <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 space-y-2">
            <div className="flex items-start gap-1.5 text-[11px] text-amber-950">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  {t('regionPreset.applyConfirmTitle', { name: pendingPreset.preset.name })}
                </div>
                <p className="leading-relaxed">{pendingPreset.impact.warningText}</p>
                {isGlobalScope && globalUsageCount && globalUsageCount > 1 && (
                  <p className="font-medium">
                    {t('regionPreset.affectsGlobalPages', {
                      count: globalUsageCount,
                      region: regionDisplayName,
                    })}
                  </p>
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={preserveContent}
                onChange={(e) => setPreserveContent(e.target.checked)}
                className="rounded border-amber-400"
              />
              <span>{t('regionPreset.preserveContent')}</span>
            </label>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setPendingPreset(null)}
                className="min-h-[30px] px-2.5 py-1 bg-white border border-slate-200 rounded text-[11px] font-semibold text-slate-700"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                className="min-h-[30px] px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-semibold"
              >
                {t('regionPreset.applyPresetBtn')}
              </button>
            </div>
          </div>
        )}

        {/* Saved User Templates (if category is All or My Templates) */}
        {(selectedCategory === 'All' || selectedCategory === 'My Templates') &&
          savedTemplates.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {t('regionPreset.mySavedTemplates')}
              </div>
              {savedTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-2 rounded-md border border-indigo-200 bg-indigo-50/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{tpl.name}</div>
                    <div className="text-[10px] text-slate-500 truncate">{tpl.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!tpl.rootNode) return;
                      const cloned: ElementNode = JSON.parse(JSON.stringify(tpl.rootNode));
                      cloned.id = element.id;
                      cloned.isCustomized = false;
                      onReplaceRegionNode(cloned);
                    }}
                    className="min-h-[30px] px-2.5 py-1 bg-white border border-indigo-300 hover:bg-indigo-50 text-indigo-800 rounded text-[11px] font-semibold shrink-0"
                  >
                    {t('regionPreset.applyBtn')}
                  </button>
                </div>
              ))}
            </div>
          )}

        {/* Preset Gallery List */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
          {filteredPresets.map((preset) => {
            const isActive = element.presetId === preset.presetId;
            return (
              <div
                key={preset.presetId}
                className={`p-2 rounded-lg border transition-colors space-y-1.5 ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-50/25'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <PresetWireframePreview preset={preset} previewDevice={previewDevice} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {preset.name}
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-snug mt-0.5">
                      {preset.description}
                    </div>
                    {preset.isVisualPlaceholder && preset.placeholderNotice && (
                      <div className="text-[10px] text-amber-800 mt-1">
                        {preset.placeholderNotice}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRequestApply(preset)}
                    className={`min-h-[30px] px-2.5 py-1 rounded text-[11px] font-semibold shrink-0 whitespace-nowrap ${
                      isActive
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    {isActive ? t('regionPreset.reapplyBtn') : t('regionPreset.useBtn')}
                  </button>
                </div>
              </div>
            );
          })}

          {filteredPresets.length === 0 && selectedCategory !== 'My Templates' && (
            <div className="py-4 text-center text-xs text-slate-400">
              {t('regionPreset.noPresetsMatch', { region: regionDisplayName, search })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
