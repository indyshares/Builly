import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DeviceMode, ElementNode, ElementStyles, PseudoStateKey } from '../../../types/builder';
import { getStyleSource } from '../../../services/responsiveStyleModel';
import {
  isThemeTokenReference,
  ResolvedEffectiveTheme,
  resolveColorValue,
} from '../../../services/themeService';
import {
  parseNumericUnit,
  STANDARD_LENGTH_UNITS,
  validateStyleValue,
} from '../../../services/styleValidator';
import { loadBuilderUiPrefs, updateAccordionUiPref } from '../../../services/builderUiPrefs';

export interface StyleContextProps {
  element: ElementNode;
  deviceMode: DeviceMode;
  pseudoState: PseudoStateKey;
  effectiveTheme: ResolvedEffectiveTheme;
  isOverlay: boolean;
  onUpdateStyles: (updates: Partial<ElementStyles>) => void;
  onResetProp: (prop: keyof ElementStyles) => void;
  onResetGroup: (props: (keyof ElementStyles)[]) => void;
}

const COMPACT_KEYWORD_LABELS: Record<string, string> = {
  auto: 'auto',
  none: 'none',
  normal: 'norm',
  'min-content': 'min-c',
  'max-content': 'max-c',
  'fit-content': 'fit',
  'from-font': 'font',
  inherit: 'inh',
  unset: 'unset',
};

function formatCompactUnitLabel(unitOrKw: string): string {
  const lower = unitOrKw.toLowerCase();
  if (COMPACT_KEYWORD_LABELS[lower]) return COMPACT_KEYWORD_LABELS[lower];
  return unitOrKw.length > 5 ? unitOrKw.slice(0, 5) : unitOrKw;
}

function formatNumberClean(n: number): string {
  if (!Number.isFinite(n)) return '';
  const rounded = Number(n.toFixed(4));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/**
 * Converts a numeric value cleanly across commensurable CSS unit families.
 * Returns null for incommensurable unit transitions (e.g. px <-> %, vw, vh, fr)
 * so we NEVER silently reinterpret e.g. 100px as 100%.
 */
export function convertCssUnitValue(
  numericValue: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();
  if (from === to) return numericValue;

  // Font-relative & pixel conversions (16px root baseline)
  const pxScale: Record<string, number> = {
    px: 1,
    rem: 16,
    em: 16,
  };
  if (from in pxScale && to in pxScale) {
    return (numericValue * pxScale[from]) / pxScale[to];
  }

  // Duration conversions
  const msScale: Record<string, number> = {
    ms: 1,
    s: 1000,
  };
  if (from in msScale && to in msScale) {
    return (numericValue * msScale[from]) / msScale[to];
  }

  // Angle conversions
  const degScale: Record<string, number> = {
    deg: 1,
    rad: 180 / Math.PI,
    turn: 360,
  };
  if (from in degScale && to in degScale) {
    return (numericValue * degScale[from]) / degScale[to];
  }

  // Equivalent viewport height variants
  const vhUnits = new Set(['vh', 'svh', 'dvh', 'lvh']);
  if (vhUnits.has(from) && vhUnits.has(to)) {
    return numericValue;
  }

  // Equivalent viewport width variants
  const vwUnits = new Set(['vw', 'svw']);
  if (vwUnits.has(from) && vwUnits.has(to)) {
    return numericValue;
  }

  // Incommensurable unit switch (e.g., px -> %, vh, vw, ch, fr)
  return null;
}

export const FieldHeader: React.FC<{
  label: string;
  cssProp?: string;
  prop?: keyof ElementStyles;
  element: ElementNode;
  deviceMode: DeviceMode;
  pseudoState: PseudoStateKey;
  onResetProp: (prop: keyof ElementStyles) => void;
}> = ({ label, cssProp, prop, element, deviceMode, pseudoState, onResetProp }) => {
  const { t } = useTranslation();
  const meta = prop ? getStyleSource(element, prop, deviceMode, pseudoState) : null;
  const canReset =
    Boolean(prop && meta) &&
    ((deviceMode !== 'desktop' && meta?.isOverriddenOnCurrent) ||
      (pseudoState !== 'default' && meta?.value !== undefined));

  const inheritedDeviceLabel = meta?.inheritedFrom
    ? t(`common.${meta.inheritedFrom}`, { defaultValue: meta.inheritedFrom })
    : '';

  return (
    <div className="flex items-center justify-between gap-1.5 mb-1.5 min-h-[18px]">
      <span
        className="text-[12.5px] leading-[1.35] font-medium text-[var(--builder-text-primary)] truncate"
        title={cssProp ? `${label} (${cssProp})` : label}
      >
        {label}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {deviceMode !== 'desktop' && meta?.isOverriddenOnCurrent && (
          <span
            className="text-[11px] font-medium text-[var(--builder-primary)]"
            title={t('inspector.common.overriddenHint', {
              defaultValue: 'Overridden on this breakpoint',
            })}
          >
            {t('inspector.common.override', { defaultValue: 'Override' })}
          </span>
        )}
        {deviceMode !== 'desktop' && !meta?.isOverriddenOnCurrent && meta?.inheritedFrom && (
          <span className="text-[11px] text-[var(--builder-text-muted)] whitespace-nowrap">
            {t('inspector.common.fromDevice', {
              device: inheritedDeviceLabel,
              defaultValue: `from ${inheritedDeviceLabel}`,
            })}
          </span>
        )}
        {canReset && prop && (
          <button
            type="button"
            onClick={() => onResetProp(prop)}
            aria-label={t('inspector.common.resetField', { label, defaultValue: `Reset ${label}` })}
            title={t('inspector.common.resetField', { label, defaultValue: `Reset ${label}` })}
            className="p-1 text-[var(--builder-text-muted)] hover:text-[var(--builder-primary)] hover:bg-[var(--builder-primary-soft)] rounded transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export interface CssUnitInputProps {
  label: string;
  cssProp?: string;
  prop: keyof ElementStyles;
  element: ElementNode;
  deviceMode: DeviceMode;
  pseudoState: PseudoStateKey;
  units?: readonly string[];
  keywords?: string[];
  allowNegative?: boolean;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  isOverlay?: boolean;
  onChange: (val: string) => void;
  onCommit?: () => void;
  onReset: (prop: keyof ElementStyles) => void;
}

const VALID_NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;
const INTERMEDIATE_NUMBER_RE = /^-?$|^-?\d*\.$/;

export const CssUnitInput: React.FC<CssUnitInputProps> = ({
  label,
  cssProp,
  prop,
  element,
  deviceMode,
  pseudoState,
  units = STANDARD_LENGTH_UNITS,
  keywords = ['auto'],
  allowNegative = false,
  step = 1,
  min,
  max,
  placeholder = 'auto',
  disabled = false,
  isOverlay = false,
  onChange,
  onCommit,
  onReset,
}) => {
  const { t } = useTranslation();
  const meta = getStyleSource(element, prop, deviceMode, pseudoState);
  const rawValue = (meta.value as string) ?? '';
  const defaultUnit = units[0] || 'px';
  const parsed = parseNumericUnit(rawValue, defaultUnit);

  const [forceRawMode, setForceRawMode] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [activeUnit, setActiveUnit] = useState<string>(parsed.unit || defaultUnit);
  const [draftText, setDraftText] = useState<string>(
    parsed.isKeyword ? rawValue : parsed.isNumeric ? parsed.number : ''
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [unitChangeNotice, setUnitChangeNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRawMode = forceRawMode || parsed.isExpression;
  const diagnostic = validateStyleValue(prop, rawValue);

  // Sync draft when external selection / breakpoint / value changes while not actively editing
  useEffect(() => {
    const nextParsed = parseNumericUnit(rawValue, defaultUnit);
    setDraftText(nextParsed.isKeyword ? rawValue : nextParsed.isNumeric ? nextParsed.number : '');
    if (nextParsed.isNumeric && nextParsed.unit) {
      setActiveUnit(nextParsed.unit);
    } else if (!rawValue) {
      setActiveUnit(units[0] || 'px');
    }
    setLocalError(null);
    setUnitChangeNotice(null);
  }, [element.id, deviceMode, pseudoState, rawValue, defaultUnit]);

  const effectiveHeight = isOverlay ? 'min-h-[42px]' : 'h-[38px]';
  const inputError = localError || (!diagnostic.valid ? diagnostic.error : null);

  const validateNumericBounds = (num: number): string | null => {
    if (!allowNegative && num < 0) {
      return t('inspector.validation.negativeNotAllowed', {
        defaultValue: 'Negative values are not allowed here.',
      });
    }
    if (typeof min === 'number' && num < min) {
      return t('inspector.validation.minValue', {
        min,
        defaultValue: `Minimum value is ${min}.`,
      });
    }
    if (typeof max === 'number' && num > max) {
      return t('inspector.validation.maxValue', {
        max,
        defaultValue: `Maximum value is ${max}.`,
      });
    }
    return null;
  };

  const commitTextValue = (text: string, unitToUse: string, isFinalCommit: boolean) => {
    const trimmed = text.trim();
    setUnitChangeNotice(null);

    if (trimmed === '') {
      setLocalError(null);
      if (isFinalCommit) {
        onChange('');
      }
      return;
    }

    const lower = trimmed.toLowerCase();
    if (keywords.includes(lower)) {
      setLocalError(null);
      onChange(lower);
      return;
    }

    // Check inline unit expression typed directly by user, e.g. "24px" or "50%"
    const inlineWithUnit = /^(-?(?:\d+\.?\d*|\.\d+))\s*([a-z%]+)$/i.exec(trimmed);
    if (inlineWithUnit) {
      const typedNum = Number(inlineWithUnit[1]);
      const typedUnit = inlineWithUnit[2].toLowerCase();
      if (units.map((u) => u.toLowerCase()).includes(typedUnit)) {
        const boundErr = validateNumericBounds(typedNum);
        if (boundErr) {
          setLocalError(boundErr);
          return;
        }
        setLocalError(null);
        setActiveUnit(typedUnit);
        setDraftText(inlineWithUnit[1]);
        onChange(`${inlineWithUnit[1]}${typedUnit}`);
        return;
      }
    }

    if (INTERMEDIATE_NUMBER_RE.test(trimmed)) {
      if (!allowNegative && trimmed.startsWith('-')) {
        setLocalError(
          t('inspector.validation.negativeNotAllowed', {
            defaultValue: 'Negative values are not allowed here.',
          })
        );
      } else {
        setLocalError(null);
      }
      if (isFinalCommit) {
        // Complete trailing dot like "1." -> "1", or revert bare "-" / "."
        if (/^-?\d+\.$/.test(trimmed)) {
          const clean = trimmed.slice(0, -1);
          const num = Number(clean);
          const boundErr = validateNumericBounds(num);
          if (!boundErr) {
            setDraftText(clean);
            setLocalError(null);
            onChange(`${clean}${unitToUse}`);
            return;
          }
        }
        // Revert incomplete token without corrupting stored CSS
        const fallbackParsed = parseNumericUnit(rawValue, defaultUnit);
        setDraftText(
          fallbackParsed.isKeyword ? rawValue : fallbackParsed.isNumeric ? fallbackParsed.number : ''
        );
        setLocalError(null);
      }
      return;
    }

    if (!VALID_NUMBER_RE.test(trimmed)) {
      setLocalError(
        t('inspector.validation.invalidNumber', {
          defaultValue: 'Enter a valid number or keyword.',
        })
      );
      if (isFinalCommit) {
        const fallbackParsed = parseNumericUnit(rawValue, defaultUnit);
        setDraftText(
          fallbackParsed.isKeyword ? rawValue : fallbackParsed.isNumeric ? fallbackParsed.number : ''
        );
      }
      return;
    }

    const num = Number(trimmed);
    const boundErr = validateNumericBounds(num);
    if (boundErr) {
      setLocalError(boundErr);
      if (isFinalCommit) {
        const fallbackParsed = parseNumericUnit(rawValue, defaultUnit);
        setDraftText(
          fallbackParsed.isKeyword ? rawValue : fallbackParsed.isNumeric ? fallbackParsed.number : ''
        );
        setLocalError(null);
      }
      return;
    }

    setLocalError(null);
    onChange(`${trimmed}${unitToUse}`);
  };

  const handleUnitChange = (newUnit: string) => {
    if (disabled) return;
    setLocalError(null);
    setUnitChangeNotice(null);

    if (keywords.includes(newUnit)) {
      setDraftText(newUnit);
      onChange(newUnit);
      return;
    }

    const currentTrimmed = draftText.trim();
    const isCurrentNumeric = VALID_NUMBER_RE.test(currentTrimmed);

    // If current value is empty or a keyword (e.g. auto), switch unit readiness cleanly
    // without inventing "0px".
    if (!isCurrentNumeric) {
      setActiveUnit(newUnit);
      if (keywords.includes(currentTrimmed.toLowerCase())) {
        setDraftText('');
        onChange('');
      }
      inputRef.current?.focus();
      return;
    }

    const currentNumeric = Number(currentTrimmed);
    const converted = convertCssUnitValue(currentNumeric, activeUnit, newUnit);

    if (converted !== null) {
      const formatted = formatNumberClean(converted);
      setActiveUnit(newUnit);
      setDraftText(formatted);
      onChange(`${formatted}${newUnit}`);
      return;
    }

    // Incommensurable conversion (e.g. 100px -> %): NEVER silently turn 100px into 100%.
    setActiveUnit(newUnit);
    setDraftText('');
    setUnitChangeNotice(
      t('inspector.validation.enterValueForUnit', {
        unit: newUnit,
        defaultValue: `Enter a value for ${newUnit}`,
      })
    );
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      commitTextValue(draftText, activeUnit, true);
      onCommit?.();
      return;
    }

    if (e.key === 'Escape') {
      const resetParsed = parseNumericUnit(rawValue, defaultUnit);
      setDraftText(resetParsed.isKeyword ? rawValue : resetParsed.isNumeric ? resetParsed.number : '');
      setLocalError(null);
      setUnitChangeNotice(null);
      inputRef.current?.blur();
      return;
    }

    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();

    const trimmed = draftText.trim();
    const baseNum = VALID_NUMBER_RE.test(trimmed) ? Number(trimmed) : 0;
    const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 10 : step);
    let nextNum = baseNum + delta;
    if (!allowNegative && nextNum < 0) nextNum = 0;
    if (typeof min === 'number' && nextNum < min) nextNum = min;
    if (typeof max === 'number' && nextNum > max) nextNum = max;

    const clean = formatNumberClean(nextNum);
    setDraftText(clean);
    setLocalError(null);
    setUnitChangeNotice(null);
    onChange(`${clean}${activeUnit}`);
  };

  const selectValue = keywords.includes(draftText.trim().toLowerCase())
    ? draftText.trim().toLowerCase()
    : parsed.isKeyword
    ? rawValue.toLowerCase()
    : activeUnit;

  const badgeText = formatCompactUnitLabel(
    keywords.includes(selectValue) ? selectValue : activeUnit
  );

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-1">
        <div className="flex-1 min-w-0">
          <FieldHeader
            label={label}
            cssProp={cssProp}
            prop={prop}
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onReset}
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setForceRawMode((prev) => !prev)}
          title={
            isRawMode
              ? t('inspector.common.switchToNumeric', { defaultValue: 'Switch to numeric + unit mode' })
              : t('inspector.common.switchToRawCss', { defaultValue: 'Enter raw CSS expression (calc, clamp, var)' })
          }
          aria-label={t('inspector.common.toggleExpressionMode', {
            label,
            defaultValue: `Toggle CSS expression mode for ${label}`,
          })}
          className={`text-[11px] font-mono px-1.5 py-0.5 rounded mb-1.5 shrink-0 transition-colors ${
            isRawMode
              ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)] font-semibold'
              : 'text-[var(--builder-text-muted)] hover:text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-muted)]'
          }`}
        >
          fx
        </button>
      </div>

      {isRawMode ? (
        <input
          type="text"
          disabled={disabled}
          aria-label={`${label} raw CSS value`}
          value={rawValue}
          placeholder={`e.g. clamp(1rem, 2vw, 2rem) or ${placeholder}`}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit?.()}
          className={`w-full px-2.5 border rounded-[7px] font-mono text-sm bg-white text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] ${effectiveHeight} ${
            inputError
              ? 'border-[var(--builder-danger)] focus:border-[var(--builder-danger)]'
              : 'border-[var(--builder-border)] focus:border-[var(--builder-primary)]'
          } focus:outline-none disabled:opacity-50`}
        />
      ) : (
        <div
          className={`flex items-stretch border rounded-[7px] overflow-hidden bg-white transition-colors ${effectiveHeight} ${
            disabled ? 'opacity-50 bg-[var(--builder-surface-muted)]' : ''
          } ${
            inputError
              ? 'border-[var(--builder-danger)] focus-within:border-[var(--builder-danger)]'
              : 'border-[var(--builder-border)] focus-within:border-[var(--builder-primary)]'
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            disabled={disabled}
            aria-label={label}
            value={draftText}
            placeholder={placeholder}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            onChange={(e) => {
              const v = e.target.value;
              setDraftText(v);
              commitTextValue(v, activeUnit, false);
            }}
            onBlur={() => {
              setIsFocused(false);
              commitTextValue(draftText, activeUnit, true);
              onCommit?.();
            }}
            className="flex-1 min-w-[78px] px-2.5 text-sm font-mono tabular-nums bg-transparent text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:outline-none"
          />
          <div className="relative w-[64px] shrink-0 border-l border-[var(--builder-border)] bg-[var(--builder-surface-muted)] hover:bg-[var(--builder-surface-hover)] flex items-center justify-between px-2 transition-colors">
            <span
              className="text-xs font-mono font-medium text-[var(--builder-text-secondary)] truncate pointer-events-none select-none"
              aria-hidden="true"
            >
              {badgeText}
            </span>
            <ChevronDown className="w-3 h-3 text-[var(--builder-text-muted)] shrink-0 pointer-events-none" />
            <select
              disabled={disabled}
              aria-label={`${label} unit`}
              value={selectValue}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
              {keywords.map((kw) => (
                <option key={kw} value={kw}>
                  {kw}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {inputError && (
        <p role="alert" className="text-[11px] text-[var(--builder-danger)] mt-1 leading-snug">
          {inputError}
        </p>
      )}
      {!inputError && unitChangeNotice && (
        <p className="text-[11px] text-[var(--builder-primary)] mt-1 leading-snug">
          {unitChangeNotice}
        </p>
      )}
      {!inputError && !unitChangeNotice && diagnostic.valid && diagnostic.warning && (
        <p className="text-[11px] text-[var(--builder-warning)] mt-1 leading-snug">
          {diagnostic.warning}
        </p>
      )}
    </div>
  );
};

export const ColorTokenInput: React.FC<{
  label: string;
  cssProp?: string;
  prop: keyof ElementStyles;
  fallbackHex: string;
  tokenDefault?: string;
  tokenPlaceholder?: string;
  element: ElementNode;
  deviceMode: DeviceMode;
  pseudoState: PseudoStateKey;
  effectiveTheme: ResolvedEffectiveTheme;
  isOverlay?: boolean;
  onChange: (val: string | undefined) => void;
  onReset: (prop: keyof ElementStyles) => void;
}> = ({
  label,
  cssProp,
  prop,
  fallbackHex,
  tokenDefault,
  tokenPlaceholder = 'var(--color-text)',
  element,
  deviceMode,
  pseudoState,
  effectiveTheme,
  isOverlay = false,
  onChange,
  onReset,
}) => {
  const { t } = useTranslation();
  const meta = getStyleSource(element, prop, deviceMode, pseudoState);
  const rawVal = (meta.value as string) ?? '';
  const resolvedHex = resolveColorValue(rawVal, effectiveTheme.colors, fallbackHex);
  const usesTheme = !rawVal || isThemeTokenReference(rawVal);

  return (
    <div>
      <FieldHeader
        label={label}
        cssProp={cssProp}
        prop={prop}
        element={element}
        deviceMode={deviceMode}
        pseudoState={pseudoState}
        onResetProp={onReset}
      />
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={resolvedHex}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="w-10 h-[38px] rounded-[7px] border border-[var(--builder-border)] cursor-pointer shrink-0 bg-white p-0.5"
        />
        <input
          type="text"
          aria-label={`${label} value`}
          value={rawVal}
          placeholder={tokenPlaceholder}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono text-sm bg-white text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:outline-none focus:border-[var(--builder-primary)] ${
            isOverlay ? 'min-h-[42px]' : 'h-[38px]'
          }`}
        />
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <span
          className={`text-[11px] font-medium ${
            usesTheme ? 'text-[var(--builder-text-muted)]' : 'text-[var(--builder-primary)]'
          }`}
        >
          {usesTheme
            ? t('inspector.common.themeTokenHex', {
                hex: resolvedHex,
                defaultValue: `Theme token (${resolvedHex})`,
              })
            : t('inspector.common.localOverride', { defaultValue: 'Local override' })}
        </span>
        {!usesTheme && (
          <button
            type="button"
            onClick={() => {
              if (deviceMode !== 'desktop' || pseudoState !== 'default') {
                onReset(prop);
              } else {
                onChange(tokenDefault);
              }
            }}
            className="text-[11px] font-semibold text-[var(--builder-primary)] hover:text-[var(--builder-primary-hover)] flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('inspector.common.resetToTheme', { defaultValue: 'Reset to theme' })}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export const CollapsibleStyleGroup: React.FC<{
  sectionId?: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  onResetGroup?: () => void;
  hasGroupOverrides?: boolean;
  children: React.ReactNode;
}> = ({
  sectionId,
  title,
  subtitle,
  defaultOpen = false,
  forceOpen = false,
  onResetGroup,
  hasGroupOverrides = false,
  children,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState<boolean>(() => {
    if (sectionId) {
      const prefs = loadBuilderUiPrefs();
      if (typeof prefs.accordionStates[sectionId] === 'boolean') {
        return prefs.accordionStates[sectionId];
      }
    }
    return defaultOpen;
  });

  const isExpanded = forceOpen || open;

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (sectionId) {
        updateAccordionUiPref(sectionId, next);
      }
      return next;
    });
  };

  return (
    <section className="border-t border-[var(--builder-border)] pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2 py-1">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={isExpanded}
          className="flex-1 flex items-center gap-2 text-left min-h-[36px] px-1 rounded-[6px] hover:bg-[var(--builder-surface-muted)] transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--builder-text-secondary)] shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--builder-text-secondary)] shrink-0" />
          )}
          <span className="text-[13.5px] font-semibold text-[var(--builder-text-primary)]">
            {title}
          </span>
          {subtitle && (
            <span className="text-[11px] text-[var(--builder-text-muted)] truncate font-normal">
              {subtitle}
            </span>
          )}
        </button>

        {hasGroupOverrides && onResetGroup && (
          <button
            type="button"
            onClick={onResetGroup}
            title={t('inspector.common.resetField', {
              label: title,
              defaultValue: `Reset ${title}`,
            })}
            className="text-[11px] font-medium text-[var(--builder-primary)] hover:text-[var(--builder-primary-hover)] flex items-center gap-1 px-2 py-1 rounded-[6px] hover:bg-[var(--builder-primary-soft)] shrink-0 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('common.reset', { defaultValue: 'Reset' })}</span>
          </button>
        )}
      </div>

      {isExpanded && <div className="pt-2 pb-4 px-1 space-y-3.5">{children}</div>}
    </section>
  );
};
