import React, { useRef, useState } from 'react';
import { Link2, Unlink2, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ElementStyles } from '../../../types/builder';
import { getStyleSource } from '../../../services/responsiveStyleModel';
import { CssUnitInput, StyleContextProps } from './CssUnitInput';
import { STANDARD_LENGTH_UNITS } from '../../../services/styleValidator';

type SpacingMode = '4side' | 'shorthand' | 'logical';

const SPACING_PROPS: (keyof ElementStyles)[] = [
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
];

export const BoxModelEditor: React.FC<StyleContextProps> = ({
  element,
  deviceMode,
  pseudoState,
  isOverlay,
  onUpdateStyles,
  onResetProp,
  onResetGroup,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<SpacingMode>('4side');
  const [sideTab, setSideTab] = useState<'padding' | 'margin'>('padding');
  const [linkMargin, setLinkMargin] = useState(false);
  const [linkPadding, setLinkPadding] = useState(false);
  const [activeField, setActiveField] = useState<keyof ElementStyles | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const marginTopRef = useRef<HTMLInputElement>(null);
  const marginRightRef = useRef<HTMLInputElement>(null);
  const marginBottomRef = useRef<HTMLInputElement>(null);
  const marginLeftRef = useRef<HTMLInputElement>(null);
  const paddingTopRef = useRef<HTMLInputElement>(null);
  const paddingRightRef = useRef<HTMLInputElement>(null);
  const paddingBottomRef = useRef<HTMLInputElement>(null);
  const paddingLeftRef = useRef<HTMLInputElement>(null);

  const val = (prop: keyof ElementStyles, fallback = 'auto') => {
    const v = getStyleSource(element, prop, deviceMode, pseudoState).value as string | undefined;
    return v && v !== '' ? v : fallback;
  };

  const focusBoxSide = (
    kind: 'margin' | 'padding',
    prop: keyof ElementStyles,
    ref: React.RefObject<HTMLInputElement | null>
  ) => {
    setMode('4side');
    setSideTab(kind);
    setActiveField(prop);
    setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 0);
  };

  const handleBoxInput = (
    kind: 'margin' | 'padding',
    sideProp: keyof ElementStyles,
    raw: string
  ) => {
    const clean = raw.trim();
    if (kind === 'padding' && /^-\d/.test(clean)) return;

    if (kind === 'margin' && linkMargin) {
      onUpdateStyles({
        marginTop: raw,
        marginRight: raw,
        marginBottom: raw,
        marginLeft: raw,
      });
    } else if (kind === 'padding' && linkPadding) {
      onUpdateStyles({
        paddingTop: raw,
        paddingRight: raw,
        paddingBottom: raw,
        paddingLeft: raw,
      });
    } else {
      onUpdateStyles({ [sideProp]: raw });
    }
  };

  const renderBoxCell = (
    kind: 'margin' | 'padding',
    prop: keyof ElementStyles,
    label: string,
    ref: React.RefObject<HTMLInputElement | null>
  ) => {
    const current = (getStyleSource(element, prop, deviceMode, pseudoState).value as string) ?? '';
    const isFocused = activeField === prop;
    return (
      <input
        ref={ref}
        type="text"
        aria-label={label}
        title={label}
        value={current}
        placeholder="0"
        onFocus={() => setActiveField(prop)}
        onChange={(e) => handleBoxInput(kind, prop, e.target.value)}
        className={`min-w-[60px] max-w-[76px] h-7 px-1 text-center text-xs font-mono tabular-nums rounded-[5px] border transition-colors focus:outline-none ${
          isFocused
            ? 'border-[var(--builder-primary)] bg-white text-[var(--builder-text-primary)] shadow-xs'
            : 'border-[var(--builder-border)]/70 hover:border-[var(--builder-border-strong)] bg-white text-[var(--builder-text-primary)]'
        }`}
      />
    );
  };

  const wLabel = val('width', 'auto');
  const hLabel = val('height', 'auto');
  const fieldHeight = isOverlay ? 'min-h-[40px]' : 'h-[38px]';

  return (
    <div className="space-y-3.5">
      {/* Mode selector + Safe Clear */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex bg-[var(--builder-surface-muted)] p-0.5 rounded-[7px] border border-[var(--builder-border)]">
          {(
            [
              { id: '4side', label: t('inspector.spacing.boxMode', { defaultValue: 'Box / 4-Side' }) },
              { id: 'shorthand', label: t('inspector.spacing.shorthandMode', { defaultValue: 'Shorthand' }) },
              { id: 'logical', label: t('inspector.spacing.logicalMode', { defaultValue: 'Logical' }) },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`px-2.5 py-1 text-[11.5px] font-medium rounded-[5px] transition-colors ${
                mode === item.id
                  ? 'bg-white text-[var(--builder-text-primary)] shadow-xs'
                  : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-[11px] font-medium text-[var(--builder-text-secondary)] hover:text-[var(--builder-primary)] flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[var(--builder-surface-muted)]"
            title={t('inspector.spacing.clearSpacing', { defaultValue: 'Clear Spacing' })}
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('inspector.spacing.clearSpacing', { defaultValue: 'Clear Spacing' })}</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onResetGroup(SPACING_PROPS);
                setConfirmClear(false);
              }}
              className="text-[11px] font-semibold text-[var(--builder-danger)] px-2 py-0.5 rounded bg-red-50 hover:bg-red-100"
            >
              {t('inspector.spacing.confirmClear', { defaultValue: 'Confirm Clear?' })}
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="text-[11px] text-[var(--builder-text-muted)] hover:text-[var(--builder-text-primary)] px-1"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        )}
      </div>

      {/* Calm Interactive Box Model Diagram (Subtle contrast: Margin vs Padding only) */}
      <div className="rounded-[8px] border border-[var(--builder-border)] bg-[var(--builder-surface-muted)] p-2.5 select-none">
        <div className="flex items-center justify-between mb-1.5 px-0.5">
          <span className="text-[11px] font-semibold text-[var(--builder-text-secondary)]">
            {t('inspector.spacing.margin', { defaultValue: 'Margin' })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdateStyles({ marginLeft: 'auto', marginRight: 'auto' })}
              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white border border-[var(--builder-border)] hover:border-[var(--builder-primary)] text-[var(--builder-text-secondary)] hover:text-[var(--builder-primary)]"
              title="margin-inline: auto"
            >
              {t('inspector.spacing.autoX', { defaultValue: 'auto-x' })}
            </button>
            <button
              type="button"
              onClick={() => setLinkMargin((p) => !p)}
              aria-label={t('inspector.spacing.linkMargin', { defaultValue: 'Link margin sides' })}
              title={
                linkMargin
                  ? t('inspector.spacing.unlinkMargin', { defaultValue: 'Unlink margin sides' })
                  : t('inspector.spacing.linkMargin', { defaultValue: 'Link margin sides' })
              }
              className={`p-1 rounded transition-colors ${
                linkMargin
                  ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)]'
                  : 'text-[var(--builder-text-muted)] hover:text-[var(--builder-text-primary)]'
              }`}
            >
              {linkMargin ? <Link2 className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <div onClick={() => focusBoxSide('margin', 'marginTop', marginTopRef)}>
            {renderBoxCell(
              'margin',
              'marginTop',
              t('inspector.spacing.marginTop', { defaultValue: 'Margin Top' }),
              marginTopRef
            )}
          </div>

          <div className="flex items-center gap-1.5 w-full justify-between">
            <div onClick={() => focusBoxSide('margin', 'marginLeft', marginLeftRef)}>
              {renderBoxCell(
                'margin',
                'marginLeft',
                t('inspector.spacing.marginLeft', { defaultValue: 'Margin Left' }),
                marginLeftRef
              )}
            </div>

            {/* Inner Padding Box */}
            <div className="flex-1 min-w-0 rounded-[7px] border border-[var(--builder-primary)]/25 bg-[var(--builder-primary-soft)] p-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-[var(--builder-primary)]">
                  {t('inspector.spacing.padding', { defaultValue: 'Padding' })}
                </span>
                <button
                  type="button"
                  onClick={() => setLinkPadding((p) => !p)}
                  aria-label={t('inspector.spacing.linkPadding', { defaultValue: 'Link padding sides' })}
                  title={
                    linkPadding
                      ? t('inspector.spacing.unlinkPadding', { defaultValue: 'Unlink padding sides' })
                      : t('inspector.spacing.linkPadding', { defaultValue: 'Link padding sides' })
                  }
                  className={`p-1 rounded transition-colors ${
                    linkPadding
                      ? 'bg-white text-[var(--builder-primary)]'
                      : 'text-[var(--builder-text-muted)] hover:text-[var(--builder-primary)]'
                  }`}
                >
                  {linkPadding ? <Link2 className="w-3.5 h-3.5" /> : <Unlink2 className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <div onClick={() => focusBoxSide('padding', 'paddingTop', paddingTopRef)}>
                  {renderBoxCell(
                    'padding',
                    'paddingTop',
                    t('inspector.spacing.paddingTop', { defaultValue: 'Padding Top' }),
                    paddingTopRef
                  )}
                </div>

                <div className="flex items-center gap-1.5 w-full justify-between">
                  <div onClick={() => focusBoxSide('padding', 'paddingLeft', paddingLeftRef)}>
                    {renderBoxCell(
                      'padding',
                      'paddingLeft',
                      t('inspector.spacing.paddingLeft', { defaultValue: 'Padding Left' }),
                      paddingLeftRef
                    )}
                  </div>

                  {/* Content Core */}
                  <div className="flex-1 min-w-[46px] min-h-[30px] rounded-[5px] border border-[var(--builder-border)] bg-white flex items-center justify-center px-1.5 text-center">
                    <span className="text-[10.5px] font-mono tabular-nums text-[var(--builder-text-secondary)] truncate">
                      {wLabel} × {hLabel}
                    </span>
                  </div>

                  <div onClick={() => focusBoxSide('padding', 'paddingRight', paddingRightRef)}>
                    {renderBoxCell(
                      'padding',
                      'paddingRight',
                      t('inspector.spacing.paddingRight', { defaultValue: 'Padding Right' }),
                      paddingRightRef
                    )}
                  </div>
                </div>

                <div onClick={() => focusBoxSide('padding', 'paddingBottom', paddingBottomRef)}>
                  {renderBoxCell(
                    'padding',
                    'paddingBottom',
                    t('inspector.spacing.paddingBottom', { defaultValue: 'Padding Bottom' }),
                    paddingBottomRef
                  )}
                </div>
              </div>
            </div>

            <div onClick={() => focusBoxSide('margin', 'marginRight', marginRightRef)}>
              {renderBoxCell(
                'margin',
                'marginRight',
                t('inspector.spacing.marginRight', { defaultValue: 'Margin Right' }),
                marginRightRef
              )}
            </div>
          </div>

          <div onClick={() => focusBoxSide('margin', 'marginBottom', marginBottomRef)}>
            {renderBoxCell(
              'margin',
              'marginBottom',
              t('inspector.spacing.marginBottom', { defaultValue: 'Margin Bottom' }),
              marginBottomRef
            )}
          </div>
        </div>
      </div>

      {/* Mode-specific precision inputs */}
      {mode === '4side' && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-1 bg-[var(--builder-surface-muted)] p-0.5 rounded-[7px] border border-[var(--builder-border)]">
            <button
              type="button"
              onClick={() => setSideTab('padding')}
              className={`py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                sideTab === 'padding'
                  ? 'bg-white text-[var(--builder-primary)] shadow-xs'
                  : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)]'
              }`}
            >
              {t('inspector.spacing.paddingSides', { defaultValue: 'Padding Sides' })}
            </button>
            <button
              type="button"
              onClick={() => setSideTab('margin')}
              className={`py-1.5 text-xs font-medium rounded-[5px] transition-colors ${
                sideTab === 'margin'
                  ? 'bg-white text-[var(--builder-primary)] shadow-xs'
                  : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)]'
              }`}
            >
              {t('inspector.spacing.marginSides', { defaultValue: 'Margin Sides' })}
            </button>
          </div>

          {sideTab === 'padding' ? (
            <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
              <CssUnitInput
                label={t('inspector.spacing.paddingTop', { defaultValue: 'Padding Top' })}
                cssProp="padding-top"
                prop="paddingTop"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={[]}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('padding', 'paddingTop', v)}
                onReset={onResetProp}
              />
              <CssUnitInput
                label={t('inspector.spacing.paddingBottom', { defaultValue: 'Padding Bottom' })}
                cssProp="padding-bottom"
                prop="paddingBottom"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={[]}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('padding', 'paddingBottom', v)}
                onReset={onResetProp}
              />
              <CssUnitInput
                label={t('inspector.spacing.paddingLeft', { defaultValue: 'Padding Left' })}
                cssProp="padding-left"
                prop="paddingLeft"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={[]}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('padding', 'paddingLeft', v)}
                onReset={onResetProp}
              />
              <CssUnitInput
                label={t('inspector.spacing.paddingRight', { defaultValue: 'Padding Right' })}
                cssProp="padding-right"
                prop="paddingRight"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={[]}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('padding', 'paddingRight', v)}
                onReset={onResetProp}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
              <CssUnitInput
                label={t('inspector.spacing.marginTop', { defaultValue: 'Margin Top' })}
                cssProp="margin-top"
                prop="marginTop"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={['auto']}
                allowNegative={true}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('margin', 'marginTop', v)}
                onReset={onResetProp}
              />
              <CssUnitInput
                label={t('inspector.spacing.marginBottom', { defaultValue: 'Margin Bottom' })}
                cssProp="margin-bottom"
                prop="marginBottom"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={['auto']}
                allowNegative={true}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('margin', 'marginBottom', v)}
                onReset={onResetProp}
              />
              <CssUnitInput
                label={t('inspector.spacing.marginLeft', { defaultValue: 'Margin Left' })}
                cssProp="margin-left"
                prop="marginLeft"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={['auto']}
                allowNegative={true}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('margin', 'marginLeft', v)}
                onReset={onResetProp}
              />
              <CssUnitInput
                label={t('inspector.spacing.marginRight', { defaultValue: 'Margin Right' })}
                cssProp="margin-right"
                prop="marginRight"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                units={STANDARD_LENGTH_UNITS}
                keywords={['auto']}
                allowNegative={true}
                placeholder="0"
                isOverlay={isOverlay}
                onChange={(v) => handleBoxInput('margin', 'marginRight', v)}
                onReset={onResetProp}
              />
            </div>
          )}
        </div>
      )}

      {mode === 'shorthand' && (
        <div className="space-y-3 pt-1">
          <div>
            <label
              className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5"
              title="padding"
            >
              {t('inspector.spacing.paddingShorthand', { defaultValue: 'Padding Shorthand' })}
            </label>
            <input
              type="text"
              placeholder="e.g. 16px 24px"
              value={(getStyleSource(element, 'padding', deviceMode, pseudoState).value as string) ?? ''}
              onChange={(e) => {
                if (/^-\d/.test(e.target.value.trim())) return;
                onUpdateStyles({ padding: e.target.value });
              }}
              className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] text-sm font-mono bg-white ${fieldHeight}`}
            />
          </div>
          <div>
            <label
              className="text-[12.5px] font-medium text-[var(--builder-text-primary)] block mb-1.5"
              title="margin"
            >
              {t('inspector.spacing.marginShorthand', { defaultValue: 'Margin Shorthand' })}
            </label>
            <input
              type="text"
              placeholder="e.g. 0 auto or -12px 0 24px"
              value={(getStyleSource(element, 'margin', deviceMode, pseudoState).value as string) ?? ''}
              onChange={(e) => onUpdateStyles({ margin: e.target.value })}
              className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] text-sm font-mono bg-white ${fieldHeight}`}
            />
          </div>
        </div>
      )}

      {mode === 'logical' && (
        <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5 pt-1">
          <CssUnitInput
            label={t('inspector.spacing.paddingInline', { defaultValue: 'Padding Inline' })}
            cssProp="padding-inline"
            prop="paddingInline"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            keywords={[]}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ paddingInline: v })}
            onReset={onResetProp}
          />
          <CssUnitInput
            label={t('inspector.spacing.paddingBlock', { defaultValue: 'Padding Block' })}
            cssProp="padding-block"
            prop="paddingBlock"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            keywords={[]}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ paddingBlock: v })}
            onReset={onResetProp}
          />
          <CssUnitInput
            label={t('inspector.spacing.marginInline', { defaultValue: 'Margin Inline' })}
            cssProp="margin-inline"
            prop="marginInline"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            allowNegative={true}
            keywords={['auto']}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ marginInline: v })}
            onReset={onResetProp}
          />
          <CssUnitInput
            label={t('inspector.spacing.marginBlock', { defaultValue: 'Margin Block' })}
            cssProp="margin-block"
            prop="marginBlock"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            allowNegative={true}
            keywords={['auto']}
            placeholder="0"
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ marginBlock: v })}
            onReset={onResetProp}
          />
        </div>
      )}
    </div>
  );
};
