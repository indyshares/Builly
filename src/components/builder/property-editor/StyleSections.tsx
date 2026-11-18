import React, { useEffect, useState } from 'react';
import { AlertTriangle, Layers, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ElementStyles, MediaAsset, SiteDocument } from '../../../types/builder';
import { ElementLayoutContext } from '../../../services/propertyCatalog';
import { getStyleSource } from '../../../services/responsiveStyleModel';
import {
  ColorTokenInput,
  CssUnitInput,
  FieldHeader,
  StyleContextProps,
} from './CssUnitInput';

export const LAYOUT_PROPS: (keyof ElementStyles)[] = [
  'display',
  'boxSizing',
  'aspectRatio',
  'columnCount',
  'columnWidth',
  'columnRule',
  'contain',
  'contentVisibility',
];

export const SIZING_PROPS: (keyof ElementStyles)[] = [
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'aspectRatio',
];

export const TYPOGRAPHY_PROPS: (keyof ElementStyles)[] = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontStretch',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textColor',
  'textTransform',
  'textIndent',
  'textDecorationLine',
  'textDecorationStyle',
  'textDecorationColor',
  'textDecorationThickness',
  'textUnderlineOffset',
  'textShadow',
  'whiteSpace',
  'overflowWrap',
  'wordBreak',
  'hyphens',
  'lineClamp',
];

export const BACKGROUND_PROPS: (keyof ElementStyles)[] = [
  'backgroundColor',
  'backgroundImage',
  'backgroundGradient',
  'backgroundLayers',
  'backgroundPosition',
  'backgroundSize',
  'backgroundRepeat',
  'backgroundAttachment',
  'backgroundOrigin',
  'backgroundClip',
  'backgroundBlendMode',
];

export const BORDER_PROPS: (keyof ElementStyles)[] = [
  'borderWidth',
  'borderStyle',
  'borderColor',
  'borderTopWidth',
  'borderTopStyle',
  'borderTopColor',
  'borderRightWidth',
  'borderRightStyle',
  'borderRightColor',
  'borderBottomWidth',
  'borderBottomStyle',
  'borderBottomColor',
  'borderLeftWidth',
  'borderLeftStyle',
  'borderLeftColor',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
  'outlineWidth',
  'outlineStyle',
  'outlineColor',
  'outlineOffset',
];

export const EFFECTS_PROPS: (keyof ElementStyles)[] = [
  'boxShadow',
  'opacity',
  'filter',
  'backdropFilter',
  'mixBlendMode',
  'isolation',
  'clipPath',
];

export const OVERFLOW_PROPS: (keyof ElementStyles)[] = [
  'overflow',
  'overflowX',
  'overflowY',
  'overscrollBehavior',
  'scrollBehavior',
  'resize',
  'objectFit',
  'objectPosition',
];

function controlHeight(isOverlay: boolean) {
  return isOverlay ? 'min-h-[42px]' : 'h-[38px]';
}

function useSelectCls(isOverlay: boolean) {
  return `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white text-sm text-[var(--builder-text-primary)] focus:outline-none focus:border-[var(--builder-primary)] ${controlHeight(
    isOverlay
  )}`;
}

function useMonoInputCls(isOverlay: boolean) {
  return `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white font-mono text-sm text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:outline-none focus:border-[var(--builder-primary)] ${controlHeight(
    isOverlay
  )}`;
}

export const LayoutSection: React.FC<
  StyleContextProps & {
    layoutCtx: ElementLayoutContext;
    onOpenNavigator?: () => void;
  }
> = ({
  element,
  deviceMode,
  pseudoState,
  isOverlay,
  layoutCtx,
  onUpdateStyles,
  onResetProp,
  onOpenNavigator,
}) => {
  const { t } = useTranslation();
  const [showColumns, setShowColumns] = useState(false);
  const selectCls = useSelectCls(isOverlay);
  const monoCls = useMonoInputCls(isOverlay);
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const displayVal = val('display', layoutCtx.effectiveDisplay);

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.fields.display', { defaultValue: 'Display' })}
            cssProp="display"
            prop="display"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Display"
            value={displayVal}
            onChange={(e) => onUpdateStyles({ display: e.target.value })}
            className={selectCls}
          >
            <option value="block">block</option>
            <option value="inline">inline</option>
            <option value="inline-block">inline-block</option>
            <option value="flex">flex</option>
            <option value="inline-flex">inline-flex</option>
            <option value="grid">grid</option>
            <option value="inline-grid">inline-grid</option>
            <option value="flow-root">flow-root</option>
            <option value="none">none (Hidden)</option>
          </select>
        </div>

        <div>
          <FieldHeader
            label={t('inspector.fields.boxSizing', { defaultValue: 'Box Sizing' })}
            cssProp="box-sizing"
            prop="boxSizing"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Box Sizing"
            value={val('boxSizing', 'border-box')}
            onChange={(e) => onUpdateStyles({ boxSizing: e.target.value })}
            className={selectCls}
          >
            <option value="border-box">border-box</option>
            <option value="content-box">content-box</option>
          </select>
        </div>
      </div>

      {displayVal === 'none' && (
        <div className="p-2.5 rounded-[7px] bg-amber-50/90 border border-amber-200 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--builder-warning)] shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <strong className="block">
                {t('inspector.fields.hiddenDisplayTitle', { defaultValue: 'Hidden via display: none' })}
              </strong>
              <span className="text-[11px]">
                {t('inspector.fields.hiddenDisplayHint', {
                  defaultValue: 'Use Layers Navigator to reselect this element later.',
                })}
              </span>
            </div>
          </div>
          {onOpenNavigator && (
            <button
              type="button"
              onClick={onOpenNavigator}
              className="px-2.5 py-1 bg-white border border-amber-300 rounded-[6px] text-[11px] font-semibold text-amber-900 flex items-center gap-1 shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('inspector.openLayers', { defaultValue: 'Layers' })}</span>
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-medium text-[var(--builder-text-secondary)]">
          {t('inspector.fields.multiColContainment', { defaultValue: 'Multi-column & Containment' })}
        </span>
        <button
          type="button"
          onClick={() => setShowColumns((p) => !p)}
          className="text-xs font-medium text-[var(--builder-primary)] hover:underline"
        >
          {showColumns
            ? t('inspector.common.hide', { defaultValue: 'Hide' })
            : t('inspector.common.show', { defaultValue: 'Show' })}
        </button>
      </div>

      {showColumns && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <div>
              <FieldHeader
                label={t('inspector.fields.columnCount', { defaultValue: 'Column Count' })}
                cssProp="column-count"
                prop="columnCount"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="auto / 2"
                value={val('columnCount')}
                onChange={(e) => onUpdateStyles({ columnCount: e.target.value })}
                className={monoCls}
              />
            </div>
            <CssUnitInput
              label={t('inspector.fields.columnWidth', { defaultValue: 'Column Width' })}
              cssProp="column-width"
              prop="columnWidth"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ columnWidth: v })}
              onReset={onResetProp}
            />
          </div>
          <div>
            <FieldHeader
              label={t('inspector.fields.columnRule', { defaultValue: 'Column Rule' })}
              cssProp="column-rule"
              prop="columnRule"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <input
              type="text"
              placeholder="e.g. 1px solid #e2e8f0"
              value={val('columnRule')}
              onChange={(e) => onUpdateStyles({ columnRule: e.target.value })}
              className={monoCls}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export const SizingSection: React.FC<StyleContextProps> = ({
  element,
  deviceMode,
  pseudoState,
  isOverlay,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const monoCls = useMonoInputCls(isOverlay);
  const val = (p: keyof ElementStyles) =>
    (getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '';

  const sizeKeywords = ['auto', 'min-content', 'max-content', 'fit-content'];

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <CssUnitInput
          label={t('inspector.fields.width', { defaultValue: 'Width' })}
          cssProp="width"
          prop="width"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={sizeKeywords}
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ width: v })}
          onReset={onResetProp}
        />
        <CssUnitInput
          label={t('inspector.fields.height', { defaultValue: 'Height' })}
          cssProp="height"
          prop="height"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={sizeKeywords}
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ height: v })}
          onReset={onResetProp}
        />
        <CssUnitInput
          label={t('inspector.fields.minWidth', { defaultValue: 'Min Width' })}
          cssProp="min-width"
          prop="minWidth"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={sizeKeywords}
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ minWidth: v })}
          onReset={onResetProp}
        />
        <CssUnitInput
          label={t('inspector.fields.maxWidth', { defaultValue: 'Max Width' })}
          cssProp="max-width"
          prop="maxWidth"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={['none', 'min-content', 'max-content', 'fit-content']}
          placeholder="none"
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ maxWidth: v })}
          onReset={onResetProp}
        />
        <CssUnitInput
          label={t('inspector.fields.minHeight', { defaultValue: 'Min Height' })}
          cssProp="min-height"
          prop="minHeight"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={sizeKeywords}
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ minHeight: v })}
          onReset={onResetProp}
        />
        <CssUnitInput
          label={t('inspector.fields.maxHeight', { defaultValue: 'Max Height' })}
          cssProp="max-height"
          prop="maxHeight"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={['none', 'min-content', 'max-content', 'fit-content']}
          placeholder="none"
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ maxHeight: v })}
          onReset={onResetProp}
        />
      </div>

      {/* Quick Width Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { label: t('inspector.fields.auto', { defaultValue: 'Auto' }), prop: 'width' as const, v: 'auto' },
          { label: '100%', prop: 'width' as const, v: '100%' },
          { label: t('inspector.fields.fitContent', { defaultValue: 'Fit Content' }), prop: 'width' as const, v: 'fit-content' },
          { label: t('inspector.fields.max1200', { defaultValue: '1200px Max' }), prop: 'maxWidth' as const, v: '1200px' },
        ].map((p) => {
          const active = val(p.prop) === p.v;
          return (
            <button
              key={p.v}
              type="button"
              onClick={() => onUpdateStyles({ [p.prop]: p.v })}
              className={`px-2.5 py-1.5 rounded-[6px] border text-xs font-medium transition-colors ${
                active
                  ? 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                  : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:bg-[var(--builder-surface-hover)] hover:text-[var(--builder-text-primary)]'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div>
        <FieldHeader
          label={t('inspector.fields.aspectRatio', { defaultValue: 'Aspect Ratio' })}
          cssProp="aspect-ratio"
          prop="aspectRatio"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          onResetProp={onResetProp}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            placeholder="auto / 16/9 / 1/1"
            value={val('aspectRatio')}
            onChange={(e) => onUpdateStyles({ aspectRatio: e.target.value })}
            className={`${monoCls} flex-1 min-w-[110px]`}
          />
          {['auto', '16/9', '4/3', '1/1'].map((ar) => (
            <button
              key={ar}
              type="button"
              onClick={() => onUpdateStyles({ aspectRatio: ar })}
              className={`px-2.5 h-[38px] rounded-[6px] border text-xs font-mono transition-colors ${
                val('aspectRatio') === ar
                  ? 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                  : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:bg-[var(--builder-surface-hover)]'
              }`}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const TypographySection: React.FC<StyleContextProps> = ({
  element,
  deviceMode,
  pseudoState,
  effectiveTheme,
  isOverlay,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const [showAdvancedType, setShowAdvancedType] = useState(false);
  const selectCls = useSelectCls(isOverlay);
  const monoCls = useMonoInputCls(isOverlay);
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const textColorTokenDefault =
    element.type === 'heading'
      ? 'var(--color-heading)'
      : element.type === 'button'
      ? 'var(--color-button-primary-text)'
      : element.type === 'text'
      ? 'var(--color-text)'
      : undefined;

  return (
    <div className="space-y-3.5">
      <div>
        <FieldHeader
          label={t('inspector.fields.fontFamily', { defaultValue: 'Font Family' })}
          cssProp="font-family"
          prop="fontFamily"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          onResetProp={onResetProp}
        />
        <select
          aria-label="Font Family"
          value={val('fontFamily')}
          onChange={(e) => onUpdateStyles({ fontFamily: e.target.value })}
          className={selectCls}
        >
          <option value="">{t('inspector.common.inherit', { defaultValue: 'Inherit / Theme Default' })}</option>
          <option value="var(--font-display)">Theme Display Font</option>
          <option value="var(--font-body)">Theme Body Font</option>
          <option value="var(--font-mono)">Theme Mono Font</option>
          <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
          <option value="'Noto Sans Thai', sans-serif">Noto Sans Thai</option>
          <option value="'Outfit', sans-serif">Outfit</option>
          <option value="'Playfair Display', serif">Playfair Display</option>
          <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
        </select>
      </div>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <CssUnitInput
          label={t('inspector.fields.fontSize', { defaultValue: 'Font Size' })}
          cssProp="font-size"
          prop="fontSize"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={[]}
          placeholder="16"
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ fontSize: v })}
          onReset={onResetProp}
        />
        <div>
          <FieldHeader
            label={t('inspector.fields.fontWeight', { defaultValue: 'Weight' })}
            cssProp="font-weight"
            prop="fontWeight"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Font Weight"
            value={val('fontWeight', '400')}
            onChange={(e) => onUpdateStyles({ fontWeight: e.target.value })}
            className={selectCls}
          >
            <option value="100">100 Thin</option>
            <option value="200">200 ExtraLight</option>
            <option value="300">300 Light</option>
            <option value="400">400 Regular</option>
            <option value="500">500 Medium</option>
            <option value="600">600 SemiBold</option>
            <option value="700">700 Bold</option>
            <option value="800">800 ExtraBold</option>
            <option value="900">900 Black</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.fields.lineHeight', { defaultValue: 'Line Height' })}
            cssProp="line-height"
            prop="lineHeight"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <input
            type="text"
            placeholder="1.5 / 24px"
            value={val('lineHeight')}
            onChange={(e) => onUpdateStyles({ lineHeight: e.target.value })}
            className={monoCls}
          />
        </div>
        <CssUnitInput
          label={t('inspector.fields.letterSpacing', { defaultValue: 'Letter Spacing' })}
          cssProp="letter-spacing"
          prop="letterSpacing"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          allowNegative={true}
          keywords={['normal']}
          units={['em', 'px', 'rem']}
          step={0.01}
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ letterSpacing: v })}
          onReset={onResetProp}
        />
      </div>

      <ColorTokenInput
        label={t('inspector.fields.textColor', { defaultValue: 'Text Color' })}
        cssProp="color"
        prop="textColor"
        fallbackHex={
          element.type === 'heading' ? effectiveTheme.colors.heading : effectiveTheme.colors.text
        }
        tokenDefault={textColorTokenDefault}
        tokenPlaceholder="var(--color-text)"
        element={element}
        deviceMode={deviceMode}
        pseudoState={pseudoState}
        effectiveTheme={effectiveTheme}
        isOverlay={isOverlay}
        onChange={(v) => onUpdateStyles({ textColor: v })}
        onReset={onResetProp}
      />

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.fields.fontStyle', { defaultValue: 'Style' })}
            cssProp="font-style"
            prop="fontStyle"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Font Style"
            value={val('fontStyle', 'normal')}
            onChange={(e) => onUpdateStyles({ fontStyle: e.target.value })}
            className={selectCls}
          >
            <option value="normal">normal</option>
            <option value="italic">italic</option>
            <option value="oblique">oblique</option>
          </select>
        </div>

        <div>
          <FieldHeader
            label={t('inspector.fields.textTransform', { defaultValue: 'Transform' })}
            cssProp="text-transform"
            prop="textTransform"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Text Transform"
            value={val('textTransform', 'none')}
            onChange={(e) => onUpdateStyles({ textTransform: e.target.value })}
            className={selectCls}
          >
            <option value="none">none</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize</option>
          </select>
        </div>

        <div>
          <FieldHeader
            label={t('inspector.fields.textDecoration', { defaultValue: 'Decoration' })}
            cssProp="text-decoration-line"
            prop="textDecorationLine"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Text Decoration Line"
            value={val('textDecorationLine', 'none')}
            onChange={(e) => onUpdateStyles({ textDecorationLine: e.target.value })}
            className={selectCls}
          >
            <option value="none">none</option>
            <option value="underline">underline</option>
            <option value="line-through">line-through</option>
            <option value="overline">overline</option>
          </select>
        </div>

        <div>
          <FieldHeader
            label={t('inspector.fields.decoStyle', { defaultValue: 'Deco Style' })}
            cssProp="text-decoration-style"
            prop="textDecorationStyle"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Text Decoration Style"
            value={val('textDecorationStyle', 'solid')}
            onChange={(e) => onUpdateStyles({ textDecorationStyle: e.target.value })}
            className={selectCls}
          >
            <option value="solid">solid</option>
            <option value="dashed">dashed</option>
            <option value="dotted">dotted</option>
            <option value="wavy">wavy</option>
            <option value="double">double</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-medium text-[var(--builder-text-secondary)]">
          {t('inspector.fields.advancedTypeToggle', { defaultValue: 'Wrapping, Indent, Shadow & Clamp' })}
        </span>
        <button
          type="button"
          onClick={() => setShowAdvancedType((p) => !p)}
          className="text-xs font-medium text-[var(--builder-primary)] hover:underline shrink-0"
        >
          {showAdvancedType
            ? t('inspector.common.hide', { defaultValue: 'Hide' })
            : t('inspector.common.show', { defaultValue: 'Show' })}
        </button>
      </div>

      {showAdvancedType && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <CssUnitInput
              label={t('inspector.fields.wordSpacing', { defaultValue: 'Word Spacing' })}
              cssProp="word-spacing"
              prop="wordSpacing"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              keywords={['normal']}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ wordSpacing: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.fields.textIndent', { defaultValue: 'Text Indent' })}
              cssProp="text-indent"
              prop="textIndent"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              keywords={[]}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ textIndent: v })}
              onReset={onResetProp}
            />
            <div>
              <FieldHeader
                label={t('inspector.fields.whiteSpace', { defaultValue: 'White Space' })}
                cssProp="white-space"
                prop="whiteSpace"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="White Space"
                value={val('whiteSpace', 'normal')}
                onChange={(e) => onUpdateStyles({ whiteSpace: e.target.value })}
                className={selectCls}
              >
                <option value="normal">normal</option>
                <option value="nowrap">nowrap</option>
                <option value="pre">pre</option>
                <option value="pre-wrap">pre-wrap</option>
                <option value="pre-line">pre-line</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.fields.wordBreak', { defaultValue: 'Word Break' })}
                cssProp="word-break"
                prop="wordBreak"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Word Break"
                value={val('wordBreak', 'normal')}
                onChange={(e) => onUpdateStyles({ wordBreak: e.target.value })}
                className={selectCls}
              >
                <option value="normal">normal</option>
                <option value="break-all">break-all</option>
                <option value="keep-all">keep-all</option>
                <option value="break-word">break-word</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.fields.overflowWrap', { defaultValue: 'Overflow Wrap' })}
                cssProp="overflow-wrap"
                prop="overflowWrap"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Overflow Wrap"
                value={val('overflowWrap', 'normal')}
                onChange={(e) => onUpdateStyles({ overflowWrap: e.target.value })}
                className={selectCls}
              >
                <option value="normal">normal</option>
                <option value="anywhere">anywhere</option>
                <option value="break-word">break-word</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.fields.lineClamp', { defaultValue: 'Line Clamp' })}
                cssProp="-webkit-line-clamp"
                prop="lineClamp"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="none / 2 / 3"
                value={val('lineClamp')}
                onChange={(e) => onUpdateStyles({ lineClamp: e.target.value })}
                className={monoCls}
              />
            </div>
            <div>
              <FieldHeader
                label={t('inspector.fields.hyphens', { defaultValue: 'Hyphens' })}
                cssProp="hyphens"
                prop="hyphens"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Hyphens"
                value={val('hyphens', 'none')}
                onChange={(e) => onUpdateStyles({ hyphens: e.target.value })}
                className={selectCls}
              >
                <option value="none">none</option>
                <option value="manual">manual</option>
                <option value="auto">auto</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.fields.fontStretch', { defaultValue: 'Font Stretch' })}
                cssProp="font-stretch"
                prop="fontStretch"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Font Stretch"
                value={val('fontStretch', 'normal')}
                onChange={(e) => onUpdateStyles({ fontStretch: e.target.value })}
                className={selectCls}
              >
                <option value="normal">normal</option>
                <option value="condensed">condensed</option>
                <option value="expanded">expanded</option>
              </select>
            </div>
            <CssUnitInput
              label={t('inspector.fields.decoThickness', { defaultValue: 'Deco Thickness' })}
              cssProp="text-decoration-thickness"
              prop="textDecorationThickness"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={['auto', 'from-font']}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ textDecorationThickness: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.fields.underlineOffset', { defaultValue: 'Underline Offset' })}
              cssProp="text-underline-offset"
              prop="textUnderlineOffset"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              keywords={['auto']}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ textUnderlineOffset: v })}
              onReset={onResetProp}
            />
          </div>

          <div>
            <FieldHeader
              label={t('inspector.fields.textShadow', { defaultValue: 'Text Shadow' })}
              cssProp="text-shadow"
              prop="textShadow"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <input
              type="text"
              placeholder="e.g. 0 2px 8px rgba(0,0,0,0.25)"
              value={val('textShadow')}
              onChange={(e) => onUpdateStyles({ textShadow: e.target.value })}
              className={monoCls}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface GradientStop {
  color: string;
  pos: string;
}

export const BackgroundSection: React.FC<
  StyleContextProps & { mediaAssets?: MediaAsset[]; site?: SiteDocument }
> = ({
  element,
  deviceMode,
  pseudoState,
  effectiveTheme,
  isOverlay,
  mediaAssets = [],
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const [gradType, setGradType] = useState<'linear' | 'radial' | 'conic'>('linear');
  const [gradAngle, setGradAngle] = useState('135');
  const [stops, setStops] = useState<GradientStop[]>([
    { color: '#2563EB', pos: '0' },
    { color: '#7C3AED', pos: '100' },
  ]);
  const [showGradientBuilder, setShowGradientBuilder] = useState(false);

  const selectCls = useSelectCls(isOverlay);
  const monoCls = useMonoInputCls(isOverlay);
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const bgTokenDefault =
    element.type === 'button'
      ? 'var(--color-button-primary-bg)'
      : element.type === 'project-card'
      ? 'var(--color-surface)'
      : element.type === 'divider'
      ? 'var(--color-divider)'
      : undefined;

  const applyGradient = (type = gradType, angle = gradAngle, nextStops = stops) => {
    const safeAngle = angle.trim() === '' ? '0' : angle.trim();
    const stopStr = nextStops
      .map((s) => `${s.color} ${s.pos.trim() === '' ? '0' : s.pos.trim()}%`)
      .join(', ');
    let css = '';
    if (type === 'linear') css = `linear-gradient(${safeAngle}deg, ${stopStr})`;
    else if (type === 'radial') css = `radial-gradient(circle at center, ${stopStr})`;
    else css = `conic-gradient(from ${safeAngle}deg at center, ${stopStr})`;
    onUpdateStyles({ backgroundGradient: css });
  };

  return (
    <div className="space-y-3.5">
      <ColorTokenInput
        label={t('inspector.fields.backgroundColor', { defaultValue: 'Background Color' })}
        cssProp="background-color"
        prop="backgroundColor"
        fallbackHex={effectiveTheme.colors.surface}
        tokenDefault={bgTokenDefault}
        tokenPlaceholder="var(--color-surface)"
        element={element}
        deviceMode={deviceMode}
        pseudoState={pseudoState}
        effectiveTheme={effectiveTheme}
        isOverlay={isOverlay}
        onChange={(v) => onUpdateStyles({ backgroundColor: v })}
        onReset={onResetProp}
      />

      {/* Gradient Builder (flat subtle section divider instead of card-in-card) */}
      <div className="pt-3 border-t border-[var(--builder-border)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--builder-text-primary)]">
            {t('inspector.fields.gradientLayer', { defaultValue: 'Gradient Layer' })}
          </span>
          <button
            type="button"
            onClick={() => setShowGradientBuilder((p) => !p)}
            className="text-xs font-medium text-[var(--builder-primary)] hover:underline"
          >
            {showGradientBuilder
              ? t('inspector.fields.closeBuilder', { defaultValue: 'Close Builder' })
              : t('inspector.fields.openBuilder', { defaultValue: 'Visual Builder' })}
          </button>
        </div>

        <input
          type="text"
          aria-label="Background Gradient CSS"
          placeholder="linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)"
          value={val('backgroundGradient')}
          onChange={(e) => onUpdateStyles({ backgroundGradient: e.target.value })}
          className={monoCls}
        />

        {showGradientBuilder && (
          <div className="space-y-2.5 pt-1">
            <div className="grid grid-cols-2 gap-2.5">
              <select
                aria-label="Gradient type"
                value={gradType}
                onChange={(e) => {
                  const gt = e.target.value as 'linear' | 'radial' | 'conic';
                  setGradType(gt);
                  applyGradient(gt, gradAngle, stops);
                }}
                className={selectCls}
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
                <option value="conic">Conic</option>
              </select>
              {gradType !== 'radial' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Gradient angle"
                    value={gradAngle}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGradAngle(v);
                      if (/^-?\d*\.?\d+$/.test(v.trim())) {
                        applyGradient(gradType, v.trim(), stops);
                      }
                    }}
                    className={`${monoCls} flex-1`}
                  />
                  <span className="text-xs font-mono text-[var(--builder-text-muted)] shrink-0">deg</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              {stops.map((stop, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={stop.color}
                    onChange={(e) => {
                      const next = stops.map((s, i) =>
                        i === idx ? { ...s, color: e.target.value.toUpperCase() } : s
                      );
                      setStops(next);
                      applyGradient(gradType, gradAngle, next);
                    }}
                    className="w-9 h-9 rounded-[6px] border border-[var(--builder-border)] cursor-pointer shrink-0 bg-white p-0.5"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={stop.pos}
                    onChange={(e) => {
                      const v = e.target.value;
                      const next = stops.map((s, i) => (i === idx ? { ...s, pos: v } : s));
                      setStops(next);
                      if (/^\d+$/.test(v.trim())) {
                        applyGradient(gradType, gradAngle, next);
                      }
                    }}
                    className="w-20 h-9 px-2 border border-[var(--builder-border)] rounded-[6px] bg-white text-sm font-mono tabular-nums"
                  />
                  <span className="text-xs text-[var(--builder-text-muted)]">%</span>
                  {stops.length > 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = stops.filter((_, i) => i !== idx);
                        setStops(next);
                        applyGradient(gradType, gradAngle, next);
                      }}
                      className="p-1.5 text-[var(--builder-text-muted)] hover:text-[var(--builder-danger)]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const next = [...stops, { color: '#0EA5E9', pos: '50' }];
                  setStops(next);
                  applyGradient(gradType, gradAngle, next);
                }}
                className="text-xs font-medium text-[var(--builder-primary)] flex items-center gap-1 pt-0.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('inspector.fields.addColorStop', { defaultValue: 'Add Color Stop' })}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Background Image */}
      <div>
        <FieldHeader
          label={t('inspector.fields.backgroundImage', { defaultValue: 'Background Image URL' })}
          cssProp="background-image"
          prop="backgroundImage"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          onResetProp={onResetProp}
        />
        <input
          type="text"
          placeholder="https://... or /assets/..."
          value={val('backgroundImage')}
          onChange={(e) => onUpdateStyles({ backgroundImage: e.target.value })}
          className={monoCls}
        />
        {mediaAssets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {mediaAssets.slice(0, 4).map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => onUpdateStyles({ backgroundImage: asset.url })}
                className="px-2 py-1 bg-[var(--builder-surface-muted)] hover:bg-[var(--builder-surface-hover)] border border-[var(--builder-border)] rounded-[5px] text-[11px] text-[var(--builder-text-secondary)] truncate max-w-[120px]"
                title={asset.name}
              >
                {asset.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.fields.bgSize', { defaultValue: 'BG Size' })}
            cssProp="background-size"
            prop="backgroundSize"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Background Size"
            value={val('backgroundSize', 'cover')}
            onChange={(e) => onUpdateStyles({ backgroundSize: e.target.value })}
            className={selectCls}
          >
            <option value="auto">auto</option>
            <option value="cover">cover</option>
            <option value="contain">contain</option>
            <option value="100% 100%">100% 100%</option>
          </select>
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.bgRepeat', { defaultValue: 'BG Repeat' })}
            cssProp="background-repeat"
            prop="backgroundRepeat"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Background Repeat"
            value={val('backgroundRepeat', 'no-repeat')}
            onChange={(e) => onUpdateStyles({ backgroundRepeat: e.target.value })}
            className={selectCls}
          >
            <option value="no-repeat">no-repeat</option>
            <option value="repeat">repeat</option>
            <option value="repeat-x">repeat-x</option>
            <option value="repeat-y">repeat-y</option>
            <option value="space">space</option>
            <option value="round">round</option>
          </select>
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.bgPosition', { defaultValue: 'BG Position' })}
            cssProp="background-position"
            prop="backgroundPosition"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <input
            type="text"
            placeholder="center center"
            value={val('backgroundPosition')}
            onChange={(e) => onUpdateStyles({ backgroundPosition: e.target.value })}
            className={monoCls}
          />
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.bgAttachment', { defaultValue: 'Attachment' })}
            cssProp="background-attachment"
            prop="backgroundAttachment"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Background Attachment"
            value={val('backgroundAttachment', 'scroll')}
            onChange={(e) => onUpdateStyles({ backgroundAttachment: e.target.value })}
            className={selectCls}
          >
            <option value="scroll">scroll</option>
            <option value="fixed">fixed</option>
            <option value="local">local</option>
          </select>
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.bgClip', { defaultValue: 'BG Clip' })}
            cssProp="background-clip"
            prop="backgroundClip"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Background Clip"
            value={val('backgroundClip', 'border-box')}
            onChange={(e) => onUpdateStyles({ backgroundClip: e.target.value })}
            className={selectCls}
          >
            <option value="border-box">border-box</option>
            <option value="padding-box">padding-box</option>
            <option value="content-box">content-box</option>
            <option value="text">text</option>
          </select>
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.blendMode', { defaultValue: 'Blend Mode' })}
            cssProp="background-blend-mode"
            prop="backgroundBlendMode"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Background Blend Mode"
            value={val('backgroundBlendMode', 'normal')}
            onChange={(e) => onUpdateStyles({ backgroundBlendMode: e.target.value })}
            className={selectCls}
          >
            <option value="normal">normal</option>
            <option value="multiply">multiply</option>
            <option value="screen">screen</option>
            <option value="overlay">overlay</option>
            <option value="darken">darken</option>
            <option value="lighten">lighten</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export const BorderOutlineSection: React.FC<StyleContextProps> = ({
  element,
  deviceMode,
  pseudoState,
  effectiveTheme,
  isOverlay,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const [borderSide, setBorderSide] = useState<'all' | 'Top' | 'Right' | 'Bottom' | 'Left'>('all');
  const [perCorner, setPerCorner] = useState(false);
  const selectCls = useSelectCls(isOverlay);

  const widthProp = (borderSide === 'all' ? 'borderWidth' : `border${borderSide}Width`) as keyof ElementStyles;
  const styleProp = (borderSide === 'all' ? 'borderStyle' : `border${borderSide}Style`) as keyof ElementStyles;
  const colorProp = (borderSide === 'all' ? 'borderColor' : `border${borderSide}Color`) as keyof ElementStyles;

  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const sideLabel =
    borderSide === 'all'
      ? t('inspector.fields.borderSideAll', { defaultValue: 'All' })
      : t(`inspector.fields.borderSide${borderSide}`, { defaultValue: borderSide });

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-5 gap-1 bg-[var(--builder-surface-muted)] p-0.5 rounded-[7px] border border-[var(--builder-border)]">
        {(['all', 'Top', 'Right', 'Bottom', 'Left'] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setBorderSide(side)}
            className={`py-1.5 rounded-[5px] text-xs font-medium transition-colors ${
              borderSide === side
                ? 'bg-white text-[var(--builder-text-primary)] shadow-xs'
                : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)]'
            }`}
          >
            {side === 'all'
              ? t('inspector.fields.borderSideAll', { defaultValue: 'All' })
              : t(`inspector.fields.borderSide${side}`, { defaultValue: side })}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <CssUnitInput
          label={`${t('inspector.fields.borderWidth', { defaultValue: 'Width' })} (${sideLabel})`}
          cssProp="border-width"
          prop={widthProp}
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={[]}
          placeholder="0"
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ [widthProp]: v })}
          onReset={onResetProp}
        />
        <div>
          <FieldHeader
            label={`${t('inspector.fields.borderStyle', { defaultValue: 'Style' })} (${sideLabel})`}
            cssProp="border-style"
            prop={styleProp}
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Border Style"
            value={val(styleProp, 'solid')}
            onChange={(e) => onUpdateStyles({ [styleProp]: e.target.value })}
            className={selectCls}
          >
            <option value="none">none</option>
            <option value="solid">solid</option>
            <option value="dashed">dashed</option>
            <option value="dotted">dotted</option>
            <option value="double">double</option>
          </select>
        </div>
      </div>

      <ColorTokenInput
        label={`${t('inspector.fields.borderColor', { defaultValue: 'Border Color' })} (${sideLabel})`}
        prop={colorProp}
        fallbackHex={effectiveTheme.colors.border}
        tokenDefault="var(--color-border)"
        tokenPlaceholder="var(--color-border)"
        element={element}
        deviceMode={deviceMode}
        pseudoState={pseudoState}
        effectiveTheme={effectiveTheme}
        isOverlay={isOverlay}
        onChange={(v) => onUpdateStyles({ [colorProp]: v })}
        onReset={onResetProp}
      />

      {/* Border Radius */}
      <div className="pt-3 border-t border-[var(--builder-border)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--builder-text-primary)]">
            {t('inspector.fields.borderRadius', { defaultValue: 'Border Radius' })}
          </span>
          <button
            type="button"
            onClick={() => setPerCorner((p) => !p)}
            className="text-xs font-medium text-[var(--builder-primary)] hover:underline"
          >
            {perCorner
              ? t('inspector.fields.linkedAll', { defaultValue: 'Linked All' })
              : t('inspector.fields.perCorner', { defaultValue: 'Per Corner' })}
          </button>
        </div>

        {!perCorner ? (
          <CssUnitInput
            label={t('inspector.fields.radius', { defaultValue: 'Radius' })}
            cssProp="border-radius"
            prop="borderRadius"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            keywords={[]}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ borderRadius: v })}
            onReset={onResetProp}
          />
        ) : (
          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <CssUnitInput
              label={t('inspector.fields.topLeft', { defaultValue: 'Top Left' })}
              prop="borderTopLeftRadius"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ borderTopLeftRadius: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.fields.topRight', { defaultValue: 'Top Right' })}
              prop="borderTopRightRadius"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ borderTopRightRadius: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.fields.bottomLeft', { defaultValue: 'Bottom Left' })}
              prop="borderBottomLeftRadius"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ borderBottomLeftRadius: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.fields.bottomRight', { defaultValue: 'Bottom Right' })}
              prop="borderBottomRightRadius"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ borderBottomRightRadius: v })}
              onReset={onResetProp}
            />
          </div>
        )}
      </div>

      {/* Outline in 2-col responsive grid */}
      <div className="pt-3 border-t border-[var(--builder-border)] space-y-2.5">
        <span className="text-xs font-semibold text-[var(--builder-text-primary)] block">
          {t('inspector.fields.outlineTitle', { defaultValue: 'Outline (Accessible Focus / Highlight)' })}
        </span>
        <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
          <CssUnitInput
            label={t('inspector.fields.borderWidth', { defaultValue: 'Width' })}
            cssProp="outline-width"
            prop="outlineWidth"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            keywords={[]}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ outlineWidth: v })}
            onReset={onResetProp}
          />
          <div>
            <FieldHeader
              label={t('inspector.fields.borderStyle', { defaultValue: 'Style' })}
              cssProp="outline-style"
              prop="outlineStyle"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <select
              aria-label="Outline Style"
              value={val('outlineStyle', 'none')}
              onChange={(e) => onUpdateStyles({ outlineStyle: e.target.value })}
              className={selectCls}
            >
              <option value="none">none</option>
              <option value="solid">solid</option>
              <option value="dashed">dashed</option>
              <option value="dotted">dotted</option>
            </select>
          </div>
          <CssUnitInput
            label={t('inspector.fields.outlineOffset', { defaultValue: 'Offset' })}
            cssProp="outline-offset"
            prop="outlineOffset"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            allowNegative={true}
            keywords={[]}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ outlineOffset: v })}
            onReset={onResetProp}
          />
        </div>
        <ColorTokenInput
          label={t('inspector.fields.outlineColor', { defaultValue: 'Outline Color' })}
          cssProp="outline-color"
          prop="outlineColor"
          fallbackHex={effectiveTheme.colors.focusRing}
          tokenDefault="var(--color-focus-ring)"
          tokenPlaceholder="var(--color-focus-ring)"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          effectiveTheme={effectiveTheme}
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ outlineColor: v })}
          onReset={onResetProp}
        />
      </div>
    </div>
  );
};

interface ShadowLayer {
  inset: boolean;
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
}

function parseShadowLayers(raw: string): ShadowLayer[] {
  if (!raw.trim()) {
    return [{ inset: false, x: '0', y: '8', blur: '24', spread: '-4', color: 'rgba(15, 23, 42, 0.14)' }];
  }
  const chunks: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of raw) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  const parsed = chunks.map((chunk) => {
    const inset = /\binset\b/i.test(chunk);
    const cleaned = chunk.replace(/\binset\b/gi, '').trim();
    const nums = cleaned.match(/-?\d*\.?\d+(?=px|\b)/g) || [];
    const colorMatch = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8})/i.exec(cleaned);
    return {
      inset,
      x: nums[0] ?? '0',
      y: nums[1] ?? '4',
      blur: nums[2] ?? '16',
      spread: nums[3] ?? '0',
      color: colorMatch?.[1] ?? 'rgba(15, 23, 42, 0.14)',
    };
  });
  return parsed.length > 0
    ? parsed
    : [{ inset: false, x: '0', y: '8', blur: '24', spread: '-4', color: 'rgba(15, 23, 42, 0.14)' }];
}

function parseFilterValues(raw: string) {
  const num = (re: RegExp, fb: number) => {
    const m = re.exec(raw);
    return m ? Number(m[1]) : fb;
  };
  return {
    blur: num(/blur\(\s*(-?\d*\.?\d+)px\s*\)/i, 0),
    brightness: num(/brightness\(\s*(-?\d*\.?\d+)%\s*\)/i, 100),
    contrast: num(/contrast\(\s*(-?\d*\.?\d+)%\s*\)/i, 100),
    grayscale: num(/grayscale\(\s*(-?\d*\.?\d+)%\s*\)/i, 0),
    saturate: num(/saturate\(\s*(-?\d*\.?\d+)%\s*\)/i, 100),
    hueRotate: num(/hue-rotate\(\s*(-?\d*\.?\d+)deg\s*\)/i, 0),
  };
}

export const EffectsFiltersSection: React.FC<StyleContextProps> = ({
  element,
  deviceMode,
  pseudoState,
  isOverlay,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const selectCls = useSelectCls(isOverlay);
  const monoCls = useMonoInputCls(isOverlay);
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const rawBoxShadow = val('boxShadow');
  const rawFilter = val('filter');

  const [shadowLayers, setShadowLayers] = useState<ShadowLayer[]>(() =>
    parseShadowLayers(rawBoxShadow)
  );
  const [showShadowBuilder, setShowShadowBuilder] = useState(false);

  const [filterVals, setFilterVals] = useState(() => parseFilterValues(rawFilter));
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

  useEffect(() => {
    setShadowLayers(parseShadowLayers(rawBoxShadow));
  }, [element.id, deviceMode, pseudoState, rawBoxShadow]);

  useEffect(() => {
    setFilterVals(parseFilterValues(rawFilter));
  }, [element.id, deviceMode, pseudoState, rawFilter]);

  const commitShadows = (layers: ShadowLayer[], emitCss = true) => {
    setShadowLayers(layers);
    if (!emitCss) return;
    const css = layers
      .map((l) => {
        const n = (v: string) => (/^-?\d*\.?\d+$/.test(v.trim()) ? v.trim() : '0');
        return `${l.inset ? 'inset ' : ''}${n(l.x)}px ${n(l.y)}px ${n(l.blur)}px ${n(l.spread)}px ${l.color}`;
      })
      .join(', ');
    onUpdateStyles({ boxShadow: css });
  };

  const commitFilters = (next: typeof filterVals) => {
    setFilterVals(next);
    const fns: string[] = [];
    if (next.blur > 0) fns.push(`blur(${next.blur}px)`);
    if (next.brightness !== 100) fns.push(`brightness(${next.brightness}%)`);
    if (next.contrast !== 100) fns.push(`contrast(${next.contrast}%)`);
    if (next.grayscale > 0) fns.push(`grayscale(${next.grayscale}%)`);
    if (next.saturate !== 100) fns.push(`saturate(${next.saturate}%)`);
    if (next.hueRotate !== 0) fns.push(`hue-rotate(${next.hueRotate}deg)`);
    onUpdateStyles({ filter: fns.length > 0 ? fns.join(' ') : '' });
  };

  const opacityRaw = val('opacity', '');
  const opacityNum =
    opacityRaw.trim() === '' || Number.isNaN(Number(opacityRaw)) ? 1 : Math.min(1, Math.max(0, Number(opacityRaw)));

  return (
    <div className="space-y-4">
      {/* Opacity */}
      <div>
        <FieldHeader
          label={t('inspector.fields.opacity', { defaultValue: 'Opacity' })}
          cssProp="opacity"
          prop="opacity"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          onResetProp={onResetProp}
        />
        <div className="flex items-center gap-2.5">
          <input
            type="range"
            aria-label="Opacity slider"
            min={0}
            max={1}
            step={0.05}
            value={opacityNum}
            onChange={(e) => onUpdateStyles({ opacity: e.target.value })}
            className="flex-1 accent-[var(--builder-primary)]"
          />
          <input
            type="text"
            inputMode="decimal"
            aria-label="Opacity value"
            placeholder="1"
            value={opacityRaw}
            onChange={(e) => onUpdateStyles({ opacity: e.target.value })}
            className="w-20 h-[38px] px-2.5 border border-[var(--builder-border)] rounded-[7px] text-sm font-mono tabular-nums bg-white text-[var(--builder-text-primary)]"
          />
        </div>
      </div>

      {/* Box Shadow Builder (subtle divider, zero card-in-card nesting) */}
      <div className="pt-3 border-t border-[var(--builder-border)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--builder-text-primary)]">
            {t('inspector.fields.boxShadow', { defaultValue: 'Box Shadow' })}
          </span>
          <button
            type="button"
            onClick={() => setShowShadowBuilder((p) => !p)}
            className="text-xs font-medium text-[var(--builder-primary)] hover:underline"
          >
            {showShadowBuilder
              ? t('inspector.fields.hideBuilder', { defaultValue: 'Hide Builder' })
              : t('inspector.fields.layerBuilder', { defaultValue: 'Layer Builder' })}
          </button>
        </div>

        <input
          type="text"
          aria-label="Box Shadow CSS"
          placeholder="0 10px 30px rgba(0,0,0,0.12)"
          value={rawBoxShadow}
          onChange={(e) => onUpdateStyles({ boxShadow: e.target.value })}
          className={monoCls}
        />

        {showShadowBuilder && (
          <div className="space-y-3 pt-1">
            {shadowLayers.map((layer, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] rounded-[7px] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--builder-text-primary)]">
                    <input
                      type="checkbox"
                      checked={layer.inset}
                      onChange={(e) =>
                        commitShadows(
                          shadowLayers.map((l, i) =>
                            i === idx ? { ...l, inset: e.target.checked } : l
                          )
                        )
                      }
                      className="accent-[var(--builder-primary)]"
                    />
                    <span>{t('inspector.fields.inset', { defaultValue: 'Inset' })}</span>
                  </label>
                  {shadowLayers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => commitShadows(shadowLayers.filter((_, i) => i !== idx))}
                      className="text-[var(--builder-text-muted)] hover:text-[var(--builder-danger)] p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 2-col layout so X, Y, Blur, Spread values never clip */}
                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y', 'blur', 'spread'] as const).map((field) => (
                    <div key={field}>
                      <span className="text-[11px] font-medium text-[var(--builder-text-secondary)] uppercase block mb-1">
                        {field}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label={`Shadow ${field}`}
                        value={layer[field]}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next = shadowLayers.map((l, i) =>
                            i === idx ? { ...l, [field]: v } : l
                          );
                          const isValidComplete = /^-?\d*\.?\d+$/.test(v.trim());
                          commitShadows(next, isValidComplete);
                        }}
                        className="w-full px-2.5 h-9 border border-[var(--builder-border)] rounded-[6px] bg-white text-sm font-mono tabular-nums"
                      />
                    </div>
                  ))}
                </div>
                <input
                  type="text"
                  aria-label="Shadow color"
                  value={layer.color}
                  onChange={(e) =>
                    commitShadows(
                      shadowLayers.map((l, i) => (i === idx ? { ...l, color: e.target.value } : l))
                    )
                  }
                  className="w-full px-2.5 h-9 border border-[var(--builder-border)] rounded-[6px] bg-white text-xs font-mono"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                commitShadows([
                  ...shadowLayers,
                  { inset: false, x: '0', y: '2', blur: '6', spread: '0', color: 'rgba(0,0,0,0.08)' },
                ])
              }
              className="text-xs font-medium text-[var(--builder-primary)] flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('inspector.fields.addShadowLayer', { defaultValue: 'Add Shadow Layer' })}</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters & Backdrop Filter */}
      <div className="pt-3 border-t border-[var(--builder-border)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--builder-text-primary)]">
            {t('inspector.fields.cssFilter', { defaultValue: 'CSS Filter' })}
          </span>
          <button
            type="button"
            onClick={() => setShowFilterBuilder((p) => !p)}
            className="text-xs font-medium text-[var(--builder-primary)] hover:underline"
          >
            {showFilterBuilder
              ? t('inspector.fields.hideSliders', { defaultValue: 'Hide Sliders' })
              : t('inspector.fields.filterSliders', { defaultValue: 'Filter Sliders' })}
          </button>
        </div>

        <input
          type="text"
          aria-label="Filter CSS"
          placeholder="blur(8px) saturate(120%) drop-shadow(...)"
          value={rawFilter}
          onChange={(e) => onUpdateStyles({ filter: e.target.value })}
          className={monoCls}
        />

        {showFilterBuilder && (
          <div className="space-y-2 pt-1">
            {[
              { key: 'blur' as const, label: 'Blur (px)', min: 0, max: 40 },
              { key: 'brightness' as const, label: 'Brightness (%)', min: 20, max: 200 },
              { key: 'contrast' as const, label: 'Contrast (%)', min: 20, max: 200 },
              { key: 'grayscale' as const, label: 'Grayscale (%)', min: 0, max: 100 },
              { key: 'saturate' as const, label: 'Saturate (%)', min: 0, max: 250 },
              { key: 'hueRotate' as const, label: 'Hue (deg)', min: 0, max: 360 },
            ].map((item) => (
              <div key={item.key} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--builder-text-secondary)] w-24 shrink-0">
                  {item.label}
                </span>
                <input
                  type="range"
                  min={item.min}
                  max={item.max}
                  value={filterVals[item.key]}
                  onChange={(e) =>
                    commitFilters({ ...filterVals, [item.key]: Number(e.target.value) })
                  }
                  className="flex-1 accent-[var(--builder-primary)]"
                />
                <span className="text-xs font-mono tabular-nums w-9 text-right">
                  {filterVals[item.key]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div>
          <FieldHeader
            label={t('inspector.fields.backdropFilter', { defaultValue: 'Backdrop Filter' })}
            cssProp="backdrop-filter"
            prop="backdropFilter"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <input
            type="text"
            placeholder="e.g. blur(12px) saturate(160%)"
            value={val('backdropFilter')}
            onChange={(e) => onUpdateStyles({ backdropFilter: e.target.value })}
            className={monoCls}
          />
        </div>
        <p className="text-[11px] text-[var(--builder-text-muted)]">
          {t('inspector.fields.gpuBlurWarning', {
            defaultValue: 'Heavy blur and backdrop-filter layers can increase GPU load on mobile.',
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.fields.mixBlendMode', { defaultValue: 'Mix Blend Mode' })}
            cssProp="mix-blend-mode"
            prop="mixBlendMode"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Mix Blend Mode"
            value={val('mixBlendMode', 'normal')}
            onChange={(e) => onUpdateStyles({ mixBlendMode: e.target.value })}
            className={selectCls}
          >
            <option value="normal">normal</option>
            <option value="multiply">multiply</option>
            <option value="screen">screen</option>
            <option value="overlay">overlay</option>
            <option value="difference">difference</option>
            <option value="luminosity">luminosity</option>
          </select>
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.isolation', { defaultValue: 'Isolation' })}
            cssProp="isolation"
            prop="isolation"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Isolation"
            value={val('isolation', 'auto')}
            onChange={(e) => onUpdateStyles({ isolation: e.target.value })}
            className={selectCls}
          >
            <option value="auto">auto</option>
            <option value="isolate">isolate</option>
          </select>
        </div>
      </div>

      <div>
        <FieldHeader
          label={t('inspector.fields.clipPath', { defaultValue: 'Clip Path' })}
          cssProp="clip-path"
          prop="clipPath"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          onResetProp={onResetProp}
        />
        <div className="flex flex-wrap gap-1.5 mb-2">
          {[
            { label: t('inspector.common.none', { defaultValue: 'None' }), v: 'none' },
            { label: 'Circle', v: 'circle(50% at 50% 50%)' },
            { label: 'Inset', v: 'inset(8px round 16px)' },
            { label: 'Slant', v: 'polygon(0 0, 100% 0, 100% 88%, 0 100%)' },
          ].map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => onUpdateStyles({ clipPath: p.v })}
              className="px-2.5 py-1 border border-[var(--builder-border)] bg-[var(--builder-surface-muted)] hover:bg-[var(--builder-surface-hover)] rounded-[6px] text-[11px] text-[var(--builder-text-primary)]"
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="e.g. circle(50%) or polygon(...)"
          value={val('clipPath')}
          onChange={(e) => onUpdateStyles({ clipPath: e.target.value })}
          className={monoCls}
        />
      </div>
    </div>
  );
};

export const OverflowMediaSection: React.FC<
  StyleContextProps & { layoutCtx: ElementLayoutContext }
> = ({ element, deviceMode, pseudoState, isOverlay, layoutCtx, onUpdateStyles, onResetProp }) => {
  const { t } = useTranslation();
  const selectCls = useSelectCls(isOverlay);
  const monoCls = useMonoInputCls(isOverlay);
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  return (
    <div className="space-y-3.5">
      <div>
        <FieldHeader
          label={t('inspector.fields.overflow', { defaultValue: 'Overflow' })}
          cssProp="overflow"
          prop="overflow"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          onResetProp={onResetProp}
        />
        <select
          aria-label="Overflow"
          value={val('overflow', 'visible')}
          onChange={(e) => onUpdateStyles({ overflow: e.target.value })}
          className={selectCls}
        >
          <option value="visible">visible</option>
          <option value="hidden">hidden</option>
          <option value="clip">clip</option>
          <option value="scroll">scroll</option>
          <option value="auto">auto</option>
        </select>
      </div>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.fields.overflowX', { defaultValue: 'Overflow X' })}
            cssProp="overflow-x"
            prop="overflowX"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Overflow X"
            value={val('overflowX', '')}
            onChange={(e) => onUpdateStyles({ overflowX: e.target.value })}
            className={selectCls}
          >
            <option value="">{t('inspector.common.default', { defaultValue: 'Default' })}</option>
            <option value="visible">visible</option>
            <option value="hidden">hidden</option>
            <option value="clip">clip</option>
            <option value="scroll">scroll</option>
            <option value="auto">auto</option>
          </select>
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.overflowY', { defaultValue: 'Overflow Y' })}
            cssProp="overflow-y"
            prop="overflowY"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Overflow Y"
            value={val('overflowY', '')}
            onChange={(e) => onUpdateStyles({ overflowY: e.target.value })}
            className={selectCls}
          >
            <option value="">{t('inspector.common.default', { defaultValue: 'Default' })}</option>
            <option value="visible">visible</option>
            <option value="hidden">hidden</option>
            <option value="clip">clip</option>
            <option value="scroll">scroll</option>
            <option value="auto">auto</option>
          </select>
        </div>
      </div>

      <p className="text-[11px] text-[var(--builder-text-muted)] leading-snug">
        {t('inspector.fields.overflowHint', {
          defaultValue: 'hidden/clip hide overflow without scrollbars; auto/scroll create a scrollable area.',
        })}
      </p>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.fields.scrollBehavior', { defaultValue: 'Scroll Behavior' })}
            cssProp="scroll-behavior"
            prop="scrollBehavior"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Scroll Behavior"
            value={val('scrollBehavior', 'auto')}
            onChange={(e) => onUpdateStyles({ scrollBehavior: e.target.value })}
            className={selectCls}
          >
            <option value="auto">auto</option>
            <option value="smooth">smooth</option>
          </select>
        </div>
        <div>
          <FieldHeader
            label={t('inspector.fields.overscroll', { defaultValue: 'Overscroll' })}
            cssProp="overscroll-behavior"
            prop="overscrollBehavior"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label="Overscroll Behavior"
            value={val('overscrollBehavior', 'auto')}
            onChange={(e) => onUpdateStyles({ overscrollBehavior: e.target.value })}
            className={selectCls}
          >
            <option value="auto">auto</option>
            <option value="contain">contain</option>
            <option value="none">none</option>
          </select>
        </div>
      </div>

      {layoutCtx.isMediaElement && (
        <div className="pt-3 border-t border-[var(--builder-border)] space-y-2.5">
          <span className="text-xs font-semibold text-[var(--builder-text-primary)] block">
            {t('inspector.fields.mediaFitTitle', { defaultValue: 'Media Fit & Position' })}
          </span>
          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <div>
              <FieldHeader
                label={t('inspector.fields.objectFit', { defaultValue: 'Object Fit' })}
                cssProp="object-fit"
                prop="objectFit"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Object Fit"
                value={val('objectFit', element.content?.objectFit || 'cover')}
                onChange={(e) => onUpdateStyles({ objectFit: e.target.value })}
                className={selectCls}
              >
                <option value="cover">cover</option>
                <option value="contain">contain</option>
                <option value="fill">fill</option>
                <option value="none">none</option>
                <option value="scale-down">scale-down</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.fields.objectPosition', { defaultValue: 'Object Position' })}
                cssProp="object-position"
                prop="objectPosition"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="center center / top"
                value={val('objectPosition')}
                onChange={(e) => onUpdateStyles({ objectPosition: e.target.value })}
                className={monoCls}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
