import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DeviceMode,
  SemanticThemeColors,
  SiteDocument,
  ThemeTokens,
} from '../../types/builder';
import { THEMES } from '../../data/themes';
import {
  ResolvedEffectiveTheme,
  SEMANTIC_COLOR_FIELDS,
  auditThemeContrast,
  normalizeHexColor,
  portfolioThemeRootStyle,
} from '../../services/themeService';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Eye,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface ThemePanelProps {
  site: SiteDocument;
  effectiveTheme: ResolvedEffectiveTheme;
  editorViewportMode: DeviceMode;
  onSelectPresetTheme: (themeId: string, resetOverrides?: boolean) => void;
  onUpdateColorOverride: (token: keyof SemanticThemeColors, hex: string) => void;
  onResetColorOverride: (token: keyof SemanticThemeColors) => void;
  onResetAllColorOverrides: () => void;
  onSaveCustomTheme: (name: string) => void;
  onDeleteCustomTheme?: (themeId: string) => void;
  onViewOnCanvas?: () => void;
}

interface ColorTokenRowProps {
  label: string;
  cssVar: string;
  resolvedHex: string;
  isOverridden: boolean;
  onCommitHex: (hex: string) => void;
  onReset: () => void;
}

const ColorTokenRow: React.FC<ColorTokenRowProps> = ({
  label,
  cssVar,
  resolvedHex,
  isOverridden,
  onCommitHex,
  onReset,
}) => {
  const { t } = useTranslation();
  const [hexDraft, setHexDraft] = useState(resolvedHex);
  const [hexError, setHexError] = useState<string | null>(null);

  useEffect(() => {
    setHexDraft(resolvedHex);
    setHexError(null);
  }, [resolvedHex]);

  const handleHexInputChange = (val: string) => {
    setHexDraft(val);
    const check = normalizeHexColor(val);
    if (check.valid) {
      setHexError(null);
      if (check.hex !== resolvedHex.toUpperCase()) {
        onCommitHex(check.hex);
      }
    } else {
      setHexError(check.error || t('themePanel.invalidHex'));
    }
  };

  return (
    <div className="p-2.5 rounded-lg border border-slate-200 bg-white space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800 truncate">{label}</div>
          <div className="text-[10px] font-mono text-slate-400 truncate">{cssVar}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[11px] font-medium ${
              isOverridden ? 'text-blue-600' : 'text-slate-400'
            }`}
          >
            {isOverridden ? t('themePanel.customBadge') : t('themePanel.defaultBadge')}
          </span>
          {isOverridden && (
            <button
              type="button"
              onClick={onReset}
              title={t('themePanel.resetTokenAria', { label })}
              aria-label={t('themePanel.resetTokenAria', { label })}
              className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          value={resolvedHex}
          onChange={(e) => onCommitHex(e.target.value.toUpperCase())}
          aria-label={t('themePanel.colorPickerAria', { label })}
          className="w-10 h-10 rounded-md border border-slate-200 cursor-pointer shrink-0 bg-white p-0.5"
        />
        <input
          type="text"
          value={hexDraft}
          onChange={(e) => handleHexInputChange(e.target.value)}
          aria-label={t('themePanel.hexValueAria', { label })}
          placeholder="#2563EB"
          className={`flex-1 min-w-0 min-h-[40px] px-2.5 py-1.5 border rounded-md font-mono text-xs uppercase focus:outline-none ${
            hexError
              ? 'border-red-400 bg-red-50/40 text-red-900 focus:border-red-500'
              : 'border-slate-200 bg-white text-slate-900 focus:border-blue-500'
          }`}
        />
      </div>

      {hexError && (
        <div className="text-[11px] text-red-600 font-medium">{hexError}</div>
      )}
    </div>
  );
};

export const ThemePanel: React.FC<ThemePanelProps> = ({
  site,
  effectiveTheme,
  editorViewportMode,
  onSelectPresetTheme,
  onUpdateColorOverride,
  onResetColorOverride,
  onResetAllColorOverrides,
  onSaveCustomTheme,
  onDeleteCustomTheme,
  onViewOnCanvas,
}) => {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<'presets' | 'customize'>('presets');
  const [keepOverridesOnSwitch, setKeepOverridesOnSwitch] = useState<boolean>(true);
  const [isSavingTheme, setIsSavingTheme] = useState<boolean>(false);
  const [customThemeName, setCustomThemeName] = useState<string>('');
  const [showAllContrast, setShowAllContrast] = useState<boolean>(false);

  const customThemes = site.customThemes || [];
  const allThemes: ThemeTokens[] = [...customThemes, ...THEMES];

  const contrastItems = auditThemeContrast(effectiveTheme.colors);
  const failingContrast = contrastItems.filter((item) => !item.passes);

  const groupedFields: {
    group: 'brand' | 'surfaces' | 'typography';
    title: string;
  }[] = [
    { group: 'brand', title: t('themePanel.groups.brand') },
    { group: 'surfaces', title: t('themePanel.groups.surfaces') },
    { group: 'typography', title: t('themePanel.groups.typography') },
  ];

  const handleSaveThemeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customThemeName.trim();
    if (!trimmed) return;
    onSaveCustomTheme(trimmed);
    setCustomThemeName('');
    setIsSavingTheme(false);
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs: Preset Themes | Customize Colors */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
        <button
          type="button"
          onClick={() => setSubTab('presets')}
          className={`min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
            subTab === 'presets'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t('themePanel.presetThemesTab')}
        </button>
        <button
          type="button"
          onClick={() => setSubTab('customize')}
          className={`min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
            subTab === 'customize'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>{t('themePanel.customizeColorsTab')}</span>
          {effectiveTheme.overrideCount > 0 && (
            <span className="font-mono tabular-nums text-[11px] text-blue-600">
              ({effectiveTheme.overrideCount})
            </span>
          )}
        </button>
      </div>

      {/* Active Theme Summary Bar */}
      <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/80 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] text-slate-500 font-medium">{t('themePanel.activeThemeLabel')}</div>
            <div className="text-xs font-bold text-slate-900 truncate">
              {effectiveTheme.baseTheme.name}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {effectiveTheme.overrideCount > 0
                ? effectiveTheme.overrideCount === 1
                  ? t('themePanel.overridesActiveOne', { count: effectiveTheme.overrideCount })
                  : t('themePanel.overridesActiveMany', { count: effectiveTheme.overrideCount })
                : effectiveTheme.baseTheme.isCustom
                ? t('themePanel.savedPersonalTheme')
                : t('themePanel.usingPresetDefaults')}
            </div>
          </div>

          {effectiveTheme.overrideCount > 0 && (
            <button
              type="button"
              onClick={onResetAllColorOverrides}
              className="min-h-[34px] px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 flex items-center gap-1 shrink-0 whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('themePanel.resetBtn')}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/70">
          <button
            type="button"
            onClick={() => {
              setCustomThemeName(t('themePanel.customSuffix', { name: effectiveTheme.baseTheme.name }));
              setIsSavingTheme((prev) => !prev);
            }}
            className="min-h-[34px] px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-blue-500 text-[11px] font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>{t('themePanel.saveAsMyThemeBtn')}</span>
          </button>

          {editorViewportMode !== 'desktop' && onViewOnCanvas && (
            <button
              type="button"
              onClick={onViewOnCanvas}
              className="min-h-[34px] px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-semibold flex items-center gap-1.5 ml-auto whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{t('themePanel.viewCanvasBtn')}</span>
            </button>
          )}
        </div>

        {isSavingTheme && (
          <form onSubmit={handleSaveThemeSubmit} className="space-y-2 pt-2 border-t border-slate-200">
            <label className="text-[11px] font-semibold text-slate-700 block">
              {t('themePanel.personalThemeNameLabel')}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customThemeName}
                onChange={(e) => setCustomThemeName(e.target.value)}
                placeholder={t('themePanel.personalThemePlaceholder')}
                className="flex-1 min-w-0 min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!customThemeName.trim()}
                className="min-h-[38px] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Mobile / Tablet Live Mini-Preview Strip (visible even when sheet covers canvas) */}
      {editorViewportMode !== 'desktop' && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-600">{t('themePanel.livePalettePreview')}</div>
          <div
            style={{
              ...portfolioThemeRootStyle(effectiveTheme.cssVars),
              borderColor: 'var(--color-border)',
              borderRadius: 'var(--theme-radius)',
            }}
            className="portfolio-theme p-3.5 border shadow-xs space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div
                style={{
                  color: 'var(--color-heading)',
                  fontFamily: 'var(--font-display)',
                }}
                className="text-sm font-bold truncate"
              >
                {t('themePanel.previewHeading')}
              </div>
              <span
                style={{ color: 'var(--color-link)' }}
                className="text-[11px] font-semibold underline shrink-0"
              >
                {t('themePanel.previewViewLink')}
              </span>
            </div>
            <div
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              }}
              className="p-2.5 border space-y-1.5"
            >
              <p style={{ color: 'var(--color-text)' }} className="text-xs leading-snug">
                {t('themePanel.previewBody')}
              </p>
              <p style={{ color: 'var(--color-text-muted)' }} className="text-[11px]">
                {t('themePanel.previewCaption')}
              </p>
              <div className="pt-1 flex items-center gap-2">
                <span
                  style={{
                    backgroundColor: 'var(--color-button-primary-bg)',
                    color: 'var(--color-button-primary-text)',
                    borderRadius: 'var(--theme-radius)',
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold inline-block"
                >
                  {t('themePanel.previewPrimaryCta')}
                </span>
                <span
                  style={{
                    backgroundColor: 'var(--color-button-secondary-bg)',
                    color: 'var(--color-text)',
                    borderColor: 'var(--color-border)',
                    borderRadius: 'var(--theme-radius)',
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium border inline-block"
                >
                  {t('themePanel.previewSecondaryCta')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: PRESET & SAVED PERSONAL THEMES */}
      {subTab === 'presets' && (
        <div className="space-y-3">
          {effectiveTheme.overrideCount > 0 && (
            <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/70 space-y-2 text-[11px] text-blue-950">
              <div className="font-medium leading-snug">
                {t('themePanel.overrideBanner', { count: effectiveTheme.overrideCount })}
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-blue-900">
                <input
                  type="checkbox"
                  checked={keepOverridesOnSwitch}
                  onChange={(e) => setKeepOverridesOnSwitch(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <span>{t('themePanel.keepCustomColors')}</span>
              </label>
            </div>
          )}

          <div className="space-y-2.5">
            {allThemes.map((th) => {
              const isCurrent = th.id === effectiveTheme.baseTheme.id;
              return (
                <div
                  key={th.id}
                  onClick={() => onSelectPresetTheme(th.id, !keepOverridesOnSwitch)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectPresetTheme(th.id, !keepOverridesOnSwitch);
                    }
                  }}
                  className={`w-full text-left p-3 rounded-lg border cursor-pointer transition-all ${
                    isCurrent
                      ? 'border-blue-600 bg-blue-50/25 ring-1 ring-blue-500'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-xs text-slate-900 truncate">{th.name}</span>
                      {th.isCustom && (
                        <span className="text-[10px] font-semibold text-blue-600 shrink-0">
                          {t('themePanel.personalBadge')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {th.isCustom && onDeleteCustomTheme && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustomTheme(th.id);
                          }}
                          title={t('themePanel.deletePersonalTitle')}
                          aria-label={t('themePanel.deleteThemeAria', { name: th.name })}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isCurrent && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600">
                          <Check className="w-3.5 h-3.5" />
                          {t('themePanel.selectedBadge')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 mb-2.5">{th.category}</div>

                  {/* Mini Specimen & Semantic Swatches */}
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        backgroundColor: th.semantic.background,
                        color: th.semantic.heading,
                        borderColor: th.semantic.border,
                        fontFamily: th.fontDisplay,
                      }}
                      className="w-8 h-7 rounded border flex items-center justify-center text-xs font-bold shrink-0"
                      title={t('themePanel.specimenTitle')}
                    >
                      Aa
                    </div>

                    <div className="flex items-center gap-1">
                      {[
                        { label: t('themePanel.swatches.background'), hex: th.semantic.background },
                        { label: t('themePanel.swatches.surface'), hex: th.semantic.surface },
                        { label: t('themePanel.swatches.heading'), hex: th.semantic.heading },
                        { label: t('themePanel.swatches.primary'), hex: th.semantic.primary },
                        { label: t('themePanel.swatches.accent'), hex: th.semantic.accent },
                      ].map((sw) => (
                        <span
                          key={sw.label}
                          className="w-5 h-5 rounded border border-slate-300/80"
                          style={{ backgroundColor: sw.hex }}
                          title={`${sw.label}: ${sw.hex}`}
                        />
                      ))}
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono ml-auto shrink-0">
                      r={th.borderRadius}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMIZE COLORS & CONTRAST AUDIT */}
      {subTab === 'customize' && (
        <div className="space-y-4">
          {/* WCAG 2.2 AA Contrast Audit Card */}
          <div
            className={`p-3 rounded-lg border space-y-2.5 ${
              failingContrast.length > 0
                ? 'border-amber-300 bg-amber-50/70'
                : 'border-emerald-200 bg-emerald-50/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                {failingContrast.length > 0 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>
                  {failingContrast.length > 0
                    ? failingContrast.length === 1
                      ? t('themePanel.contrastWarningOne', { count: failingContrast.length })
                      : t('themePanel.contrastWarningMany', { count: failingContrast.length })
                    : t('themePanel.contrastPassed')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAllContrast((prev) => !prev)}
                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
              >
                {showAllContrast
                  ? t('themePanel.hideDetails')
                  : t('themePanel.allCount', { count: contrastItems.length })}
              </button>
            </div>

            {(failingContrast.length > 0 || showAllContrast) && (
              <div className="space-y-2 pt-1">
                {(showAllContrast ? contrastItems : failingContrast).map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded-md bg-white border border-slate-200/90 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-800 truncate">
                        {item.label}
                      </span>
                      <span
                        className={`text-[11px] font-mono tabular-nums font-semibold shrink-0 ${
                          item.passes ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {item.ratio.toFixed(1)}:1 / {item.target.toFixed(1)}:1
                      </span>
                    </div>

                    {!item.passes && (
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span
                            className="px-1.5 py-0.5 rounded border border-slate-200 font-semibold"
                            style={{ backgroundColor: item.bgHex, color: item.fgHex }}
                          >
                            Aa
                          </span>
                          <span>{t('themePanel.lowReadability')}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpdateColorOverride(item.fgKey, item.suggestedFgHex)}
                          className="min-h-[30px] px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <Sparkles className="w-3 h-3 text-amber-300" />
                          <span>{t('themePanel.applyHex', { hex: item.suggestedFgHex })}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Semantic Color Token Groups */}
          {groupedFields.map((grp) => {
            const fields = SEMANTIC_COLOR_FIELDS.filter((f) => f.group === grp.group);
            return (
              <div key={grp.group} className="space-y-2">
                <div className="text-xs font-bold text-slate-800 pt-1">{grp.title}</div>
                <div className="space-y-2">
                  {fields.map((field) => {
                    const isOverridden = Boolean(
                      effectiveTheme.config.colorOverrides?.[field.key]
                    );
                    return (
                      <ColorTokenRow
                        key={field.key}
                        label={field.label}
                        cssVar={field.cssVar}
                        resolvedHex={effectiveTheme.colors[field.key]}
                        isOverridden={isOverridden}
                        onCommitHex={(hex) => onUpdateColorOverride(field.key, hex)}
                        onReset={() => onResetColorOverride(field.key)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {effectiveTheme.overrideCount > 0 && (
            <button
              type="button"
              onClick={onResetAllColorOverrides}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('themePanel.resetAllDefaults')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
