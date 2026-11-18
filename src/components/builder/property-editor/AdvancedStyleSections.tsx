import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ElementStyles } from '../../../types/builder';
import { getStyleSource } from '../../../services/responsiveStyleModel';
import { validateCustomCss, ANGLE_UNITS, DURATION_UNITS } from '../../../services/styleValidator';
import { CssUnitInput, FieldHeader, StyleContextProps } from './CssUnitInput';

export const POSITION_PROPS: (keyof ElementStyles)[] = [
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'insetInline',
  'insetBlock',
  'zIndex',
];

export const TRANSFORM_PROPS: (keyof ElementStyles)[] = [
  'transform',
  'transformOrigin',
  'transformBox',
  'perspective',
];

export const TRANSITION_PROPS: (keyof ElementStyles)[] = [
  'transition',
  'transitionProperty',
  'transitionDuration',
  'transitionDelay',
  'transitionTimingFunction',
  'animation',
  'animationName',
  'animationDuration',
  'animationDelay',
  'animationTimingFunction',
  'animationIterationCount',
  'animationDirection',
  'animationFillMode',
  'animationPlayState',
];

function parseTransformTokens(raw: string) {
  const tx = /translateX\(\s*([^)]+)\s*\)/i.exec(raw)?.[1]?.trim() ?? '0px';
  const ty = /translateY\(\s*([^)]+)\s*\)/i.exec(raw)?.[1]?.trim() ?? '0px';
  const tz = /translateZ\(\s*([^)]+)\s*\)/i.exec(raw)?.[1]?.trim() ?? '0px';
  const rot = /rotate\(\s*([^)]+)\s*\)/i.exec(raw)?.[1]?.trim() ?? '0deg';
  const scaleMatch = /scale\(\s*([^,)]+)(?:\s*,\s*([^)]+))?\s*\)/i.exec(raw);
  const sx = scaleMatch?.[1]?.trim() ?? '1';
  const sy = scaleMatch?.[2]?.trim() ?? scaleMatch?.[1]?.trim() ?? '1';
  const skewX = /skewX\(\s*([^)]+)\s*\)/i.exec(raw)?.[1]?.trim() ?? '0deg';
  return { tx, ty, tz, rot, sx, sy, skewX };
}

export const PositioningSection: React.FC<StyleContextProps> = ({
  element,
  deviceMode,
  pseudoState,
  isOverlay,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const position = val('position', 'static');
  const fieldHeight = isOverlay ? 'min-h-[42px]' : 'h-[38px]';
  const selectCls = `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white text-sm text-[var(--builder-text-primary)] focus:outline-none focus:border-[var(--builder-primary)] ${fieldHeight}`;
  const inputCls = `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white font-mono text-sm text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:outline-none focus:border-[var(--builder-primary)] ${fieldHeight}`;

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.advanced.position', { defaultValue: 'Position' })}
            cssProp="position"
            prop="position"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <select
            aria-label={t('inspector.advanced.position', { defaultValue: 'Position' })}
            value={position}
            onChange={(e) => onUpdateStyles({ position: e.target.value })}
            className={selectCls}
          >
            <option value="static">static (Flow)</option>
            <option value="relative">relative</option>
            <option value="absolute">absolute</option>
            <option value="fixed">fixed</option>
            <option value="sticky">sticky</option>
          </select>
        </div>

        <div>
          <FieldHeader
            label={t('inspector.advanced.zIndex', { defaultValue: 'Z-Index' })}
            cssProp="z-index"
            prop="zIndex"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="auto"
            value={val('zIndex')}
            onChange={(e) => onUpdateStyles({ zIndex: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      {position === 'absolute' && (
        <div className="p-2.5 rounded-[7px] bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] text-[11.5px] text-[var(--builder-text-secondary)] flex items-start gap-2">
          <Info className="w-4 h-4 text-[var(--builder-primary)] shrink-0 mt-0.5" />
          <span>
            {t('inspector.advanced.absoluteHint', {
              defaultValue: 'Absolute positions relative to the nearest positioned ancestor (not static).',
            })}
          </span>
        </div>
      )}

      {position === 'sticky' && (
        <div className="p-2.5 rounded-[7px] bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] text-[11.5px] text-[var(--builder-text-secondary)]">
          {t('inspector.advanced.stickyHint', {
            defaultValue:
              'Set a Top offset (e.g. 16px) for sticky scrolling. Avoid overflow: hidden on ancestors.',
          })}
        </div>
      )}

      {position !== 'static' && (
        <>
          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <CssUnitInput
              label={t('inspector.advanced.top', { defaultValue: 'Top' })}
              cssProp="top"
              prop="top"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ top: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.advanced.right', { defaultValue: 'Right' })}
              cssProp="right"
              prop="right"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ right: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.advanced.bottom', { defaultValue: 'Bottom' })}
              cssProp="bottom"
              prop="bottom"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ bottom: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.advanced.left', { defaultValue: 'Left' })}
              cssProp="left"
              prop="left"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ left: v })}
              onReset={onResetProp}
            />
          </div>

          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5 pt-1 border-t border-[var(--builder-border)]">
            <CssUnitInput
              label={t('inspector.advanced.inset', { defaultValue: 'Inset' })}
              cssProp="inset"
              prop="inset"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ inset: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.advanced.insetInline', { defaultValue: 'Inset Inline' })}
              cssProp="inset-inline"
              prop="insetInline"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ insetInline: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.advanced.insetBlock', { defaultValue: 'Inset Block' })}
              cssProp="inset-block"
              prop="insetBlock"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              allowNegative={true}
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ insetBlock: v })}
              onReset={onResetProp}
            />
          </div>
        </>
      )}
    </div>
  );
};

export const TransformSection: React.FC<StyleContextProps> = ({
  element,
  deviceMode,
  pseudoState,
  isOverlay,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const rawTransform = val('transform');
  const [tx, setTx] = useState('0px');
  const [ty, setTy] = useState('0px');
  const [tz, setTz] = useState('0px');
  const [rot, setRot] = useState('0deg');
  const [sx, setSx] = useState('1');
  const [sy, setSy] = useState('1');
  const [skewX, setSkewX] = useState('0deg');

  useEffect(() => {
    const parsed = parseTransformTokens(rawTransform);
    setTx(parsed.tx);
    setTy(parsed.ty);
    setTz(parsed.tz);
    setRot(parsed.rot);
    setSx(parsed.sx);
    setSy(parsed.sy);
    setSkewX(parsed.skewX);
  }, [element.id, deviceMode, pseudoState, rawTransform]);

  const fieldHeight = isOverlay ? 'min-h-[42px]' : 'h-[38px]';
  const inputCls = `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white font-mono text-sm text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:outline-none focus:border-[var(--builder-primary)] ${fieldHeight}`;

  const composeTransform = (
    overrides: Partial<{ tx: string; ty: string; tz: string; rot: string; sx: string; sy: string; skewX: string }>
  ) => {
    const n = { tx, ty, tz, rot, sx, sy, skewX, ...overrides };
    setTx(n.tx);
    setTy(n.ty);
    setTz(n.tz);
    setRot(n.rot);
    setSx(n.sx);
    setSy(n.sy);
    setSkewX(n.skewX);

    const parts: string[] = [];
    if (n.tx !== '0px' && n.tx !== '0' && n.tx !== '') parts.push(`translateX(${n.tx})`);
    if (n.ty !== '0px' && n.ty !== '0' && n.ty !== '') parts.push(`translateY(${n.ty})`);
    if (n.tz !== '0px' && n.tz !== '0' && n.tz !== '') parts.push(`translateZ(${n.tz})`);
    if (n.rot !== '0deg' && n.rot !== '0' && n.rot !== '') parts.push(`rotate(${n.rot})`);
    if (n.sx !== '1' || n.sy !== '1') parts.push(`scale(${n.sx || '1'}, ${n.sy || '1'})`);
    if (n.skewX !== '0deg' && n.skewX !== '0' && n.skewX !== '') parts.push(`skewX(${n.skewX})`);
    onUpdateStyles({ transform: parts.join(' ') });
  };

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <label className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5">
            {t('inspector.advanced.translateX', { defaultValue: 'Translate X' })}
          </label>
          <input
            type="text"
            value={tx}
            onChange={(e) => composeTransform({ tx: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5">
            {t('inspector.advanced.translateY', { defaultValue: 'Translate Y' })}
          </label>
          <input
            type="text"
            value={ty}
            onChange={(e) => composeTransform({ ty: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5">
            {t('inspector.advanced.translateZ', { defaultValue: 'Translate Z' })}
          </label>
          <input
            type="text"
            value={tz}
            onChange={(e) => composeTransform({ tz: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5">
            {t('inspector.advanced.rotate', { defaultValue: 'Rotate' })}
          </label>
          <input
            type="text"
            value={rot}
            onChange={(e) => composeTransform({ rot: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5">
            {t('inspector.advanced.scaleX', { defaultValue: 'Scale X' })}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={sx}
            onChange={(e) => composeTransform({ sx: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5">
            {t('inspector.advanced.scaleY', { defaultValue: 'Scale Y' })}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={sy}
            onChange={(e) => composeTransform({ sy: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5">
            {t('inspector.advanced.skewX', { defaultValue: 'Skew X' })}
          </label>
          <input
            type="text"
            value={skewX}
            onChange={(e) => composeTransform({ skewX: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <FieldHeader
          label={t('inspector.advanced.rawTransform', { defaultValue: 'Raw Transform CSS' })}
          cssProp="transform"
          prop="transform"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          onResetProp={onResetProp}
        />
        <input
          type="text"
          placeholder="e.g. translateY(-4px) scale(1.02)"
          value={rawTransform}
          onChange={(e) => onUpdateStyles({ transform: e.target.value })}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
        <div>
          <FieldHeader
            label={t('inspector.advanced.origin', { defaultValue: 'Origin' })}
            cssProp="transform-origin"
            prop="transformOrigin"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <input
            type="text"
            placeholder="center center"
            value={val('transformOrigin')}
            onChange={(e) => onUpdateStyles({ transformOrigin: e.target.value })}
            className={inputCls}
          />
        </div>
        <CssUnitInput
          label={t('inspector.advanced.perspective', { defaultValue: 'Perspective' })}
          cssProp="perspective"
          prop="perspective"
          element={element}
          deviceMode={deviceMode}
          pseudoState={pseudoState}
          keywords={['none']}
          isOverlay={isOverlay}
          onChange={(v) => onUpdateStyles({ perspective: v })}
          onReset={onResetProp}
        />
      </div>
    </div>
  );
};

export const TransitionAnimationSection: React.FC<
  StyleContextProps & {
    reduceMotionPreview?: boolean;
    onToggleReduceMotion?: () => void;
  }
> = ({
  element,
  deviceMode,
  pseudoState,
  isOverlay,
  reduceMotionPreview,
  onToggleReduceMotion,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const val = (p: keyof ElementStyles, fb = '') =>
    ((getStyleSource(element, p, deviceMode, pseudoState).value as string) ?? '') || fb;

  const fieldHeight = isOverlay ? 'min-h-[42px]' : 'h-[38px]';
  const selectCls = `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white text-sm text-[var(--builder-text-primary)] focus:outline-none focus:border-[var(--builder-primary)] ${fieldHeight}`;
  const inputCls = `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white font-mono text-sm text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:outline-none focus:border-[var(--builder-primary)] ${fieldHeight}`;

  return (
    <div className="space-y-4">
      {onToggleReduceMotion && (
        <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-[7px] bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] text-xs text-[var(--builder-text-primary)] cursor-pointer">
          <span>
            {t('inspector.advanced.simulateReduceMotion', {
              defaultValue: 'Simulate prefers-reduced-motion',
            })}
          </span>
          <input
            type="checkbox"
            checked={Boolean(reduceMotionPreview)}
            onChange={onToggleReduceMotion}
            className="w-4 h-4 rounded accent-[var(--builder-primary)]"
          />
        </label>
      )}

      {/* Transition */}
      <div className="space-y-2.5">
        <span className="text-xs font-semibold text-[var(--builder-text-secondary)] block">
          {t('inspector.advanced.transition', { defaultValue: 'Transition' })}
        </span>
        <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
          <div>
            <FieldHeader
              label={t('inspector.advanced.property', { defaultValue: 'Property' })}
              cssProp="transition-property"
              prop="transitionProperty"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <input
              type="text"
              placeholder="all / transform, opacity"
              value={val('transitionProperty')}
              onChange={(e) => onUpdateStyles({ transitionProperty: e.target.value })}
              className={inputCls}
            />
          </div>
          <CssUnitInput
            label={t('inspector.advanced.duration', { defaultValue: 'Duration' })}
            cssProp="transition-duration"
            prop="transitionDuration"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            units={DURATION_UNITS}
            keywords={[]}
            placeholder="200"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ transitionDuration: v })}
            onReset={onResetProp}
          />
          <CssUnitInput
            label={t('inspector.advanced.delay', { defaultValue: 'Delay' })}
            cssProp="transition-delay"
            prop="transitionDelay"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            units={DURATION_UNITS}
            keywords={[]}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ transitionDelay: v })}
            onReset={onResetProp}
          />
          <div>
            <FieldHeader
              label={t('inspector.advanced.timingFunction', { defaultValue: 'Timing Function' })}
              cssProp="transition-timing-function"
              prop="transitionTimingFunction"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <input
              type="text"
              placeholder="cubic-bezier(0.16, 1, 0.3, 1)"
              value={val('transitionTimingFunction')}
              onChange={(e) => onUpdateStyles({ transitionTimingFunction: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Ease Out', v: 'ease-out' },
            { label: 'Smooth', v: 'cubic-bezier(0.16, 1, 0.3, 1)' },
            { label: 'Springy', v: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() =>
                onUpdateStyles({
                  transitionProperty: val('transitionProperty') || 'all',
                  transitionDuration: val('transitionDuration') || '250ms',
                  transitionTimingFunction: p.v,
                })
              }
              className="px-2.5 py-1 rounded-[6px] border border-[var(--builder-border)] bg-[var(--builder-surface-muted)] hover:bg-[var(--builder-surface-hover)] text-xs font-medium text-[var(--builder-text-primary)]"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Keyframe Animation */}
      <div className="space-y-2.5 pt-3 border-t border-[var(--builder-border)]">
        <span className="text-xs font-semibold text-[var(--builder-text-secondary)] block">
          {t('inspector.advanced.cssAnimation', { defaultValue: 'CSS Animation' })}
        </span>
        <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
          <div>
            <FieldHeader
              label={t('inspector.advanced.animationName', { defaultValue: 'Animation Name' })}
              cssProp="animation-name"
              prop="animationName"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <input
              type="text"
              placeholder="indyFadeIn / custom"
              value={val('animationName')}
              onChange={(e) => onUpdateStyles({ animationName: e.target.value })}
              className={inputCls}
            />
          </div>
          <CssUnitInput
            label={t('inspector.advanced.duration', { defaultValue: 'Duration' })}
            cssProp="animation-duration"
            prop="animationDuration"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            units={DURATION_UNITS}
            keywords={[]}
            placeholder="400"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ animationDuration: v })}
            onReset={onResetProp}
          />
          <div>
            <FieldHeader
              label={t('inspector.advanced.iterations', { defaultValue: 'Iterations' })}
              cssProp="animation-iteration-count"
              prop="animationIterationCount"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <input
              type="text"
              placeholder="1 / infinite"
              value={val('animationIterationCount')}
              onChange={(e) => onUpdateStyles({ animationIterationCount: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <FieldHeader
              label={t('inspector.advanced.fillMode', { defaultValue: 'Fill Mode' })}
              cssProp="animation-fill-mode"
              prop="animationFillMode"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <select
              aria-label={t('inspector.advanced.fillMode', { defaultValue: 'Fill Mode' })}
              value={val('animationFillMode', 'none')}
              onChange={(e) => onUpdateStyles({ animationFillMode: e.target.value })}
              className={selectCls}
            >
              <option value="none">none</option>
              <option value="forwards">forwards</option>
              <option value="backwards">backwards</option>
              <option value="both">both</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-[var(--builder-text-muted)]">
          Built-in keyframes: <code>indyFadeIn</code>, <code>indySlideUp</code>, <code>indyScaleIn</code>.
        </p>
      </div>

      <span className="hidden">{ANGLE_UNITS[0]}</span>
    </div>
  );
};

export const CustomCssAndRawSection: React.FC<
  StyleContextProps & {
    onUpdateCustomCss: (css: string) => void;
    onSetRawDeclaration: (prop: string, val: string | undefined) => void;
  }
> = ({
  element,
  deviceMode,
  pseudoState,
  onUpdateCustomCss,
  onSetRawDeclaration,
}) => {
  const { t } = useTranslation();
  const [newProp, setNewProp] = useState('');
  const [newVal, setNewVal] = useState('');

  const customCss = element.advanced?.customCss || '';
  const validation = validateCustomCss(customCss);

  const rawMap =
    (getStyleSource(element, 'rawDeclarations', deviceMode, pseudoState).value as Record<
      string,
      string
    >) || {};

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--builder-text-primary)]">
            {t('inspector.advanced.elementCustomCss', { defaultValue: 'Element Custom CSS' })}
          </span>
          <span className="text-[11px] font-mono text-[var(--builder-text-muted)] truncate">
            [data-indy-el=&quot;{element.id}&quot;]
          </span>
        </div>

        <textarea
          rows={5}
          aria-label={t('inspector.advanced.elementCustomCss', { defaultValue: 'Element Custom CSS' })}
          placeholder={`/* Bare declarations or & selectors */\nbackdrop-filter: blur(8px);\n&:hover { transform: translateY(-2px); }`}
          value={customCss}
          onChange={(e) => onUpdateCustomCss(e.target.value)}
          className="w-full p-2.5 rounded-[7px] border border-[var(--builder-border-strong)] bg-slate-950 text-slate-100 text-xs font-mono focus:outline-none focus:border-[var(--builder-primary)]"
        />

        {validation.errors.length > 0 && (
          <div className="p-2.5 rounded-[7px] bg-red-50 border border-red-200 text-xs text-red-700 space-y-1">
            {validation.errors.map((err, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}
        {validation.errors.length === 0 && validation.warnings.length > 0 && (
          <div className="p-2.5 rounded-[7px] bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
            {validation.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}
        {validation.errors.length === 0 && validation.warnings.length === 0 && customCss.trim() && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--builder-success)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Valid CSS (isolated to .portfolio-site-surface)</span>
          </div>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t border-[var(--builder-border)]">
        <div>
          <span className="text-xs font-semibold text-[var(--builder-text-primary)] block">
            {t('inspector.advanced.rawDeclarationsTitle', {
              defaultValue: 'Preserved Raw CSS Declarations & Variables',
            })}
          </span>
          <span className="text-[11px] text-[var(--builder-text-muted)]">
            {t('inspector.advanced.rawDeclarationsHint', {
              defaultValue: 'Unknown properties or CSS variables are preserved losslessly.',
            })}
          </span>
        </div>

        {Object.entries(rawMap).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <input
              type="text"
              readOnly
              value={k}
              className="w-2/5 px-2.5 h-9 bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] rounded-[6px] text-xs font-mono text-[var(--builder-text-secondary)]"
            />
            <input
              type="text"
              value={v}
              onChange={(e) => onSetRawDeclaration(k, e.target.value)}
              className="flex-1 px-2.5 h-9 border border-[var(--builder-border)] rounded-[6px] text-xs font-mono bg-white"
            />
            <button
              type="button"
              onClick={() => onSetRawDeclaration(k, undefined)}
              aria-label={`Remove declaration ${k}`}
              className="p-1.5 text-[var(--builder-text-muted)] hover:text-[var(--builder-danger)] rounded"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="property / --var"
            value={newProp}
            onChange={(e) => setNewProp(e.target.value)}
            className="w-2/5 px-2.5 h-[38px] border border-[var(--builder-border)] rounded-[7px] text-xs font-mono bg-white"
          />
          <input
            type="text"
            placeholder="value"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            className="flex-1 px-2.5 h-[38px] border border-[var(--builder-border)] rounded-[7px] text-xs font-mono bg-white"
          />
          <button
            type="button"
            onClick={() => {
              if (!newProp.trim() || !newVal.trim()) return;
              onSetRawDeclaration(newProp.trim(), newVal.trim());
              setNewProp('');
              setNewVal('');
            }}
            aria-label="Add raw CSS declaration"
            className="h-[38px] px-3 bg-[var(--builder-primary)] hover:bg-[var(--builder-primary-hover)] text-white rounded-[7px] text-xs font-semibold flex items-center gap-1 shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
