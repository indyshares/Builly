import React, { useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Info,
  Plus,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ElementNode, ElementStyles } from '../../../types/builder';
import { ElementLayoutContext } from '../../../services/propertyCatalog';
import { getStyleSource } from '../../../services/responsiveStyleModel';
import { STANDARD_LENGTH_UNITS } from '../../../services/styleValidator';
import { CssUnitInput, FieldHeader, StyleContextProps } from './CssUnitInput';

interface AlignmentSectionProps extends StyleContextProps {
  parentElement: ElementNode | null;
  layoutCtx: ElementLayoutContext;
}

export const ALIGNMENT_PROPS: (keyof ElementStyles)[] = [
  'textAlign',
  'textAlignLast',
  'verticalAlign',
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'alignContent',
  'gap',
  'rowGap',
  'columnGap',
  'alignSelf',
  'order',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'flex',
  'gridColumns',
  'gridTemplateRows',
  'gridTemplateAreas',
  'gridAutoFlow',
  'gridAutoColumns',
  'gridAutoRows',
  'justifyItems',
  'placeItems',
  'placeContent',
  'gridColumn',
  'gridRow',
  'gridColumnStart',
  'gridColumnEnd',
  'gridRowStart',
  'gridRowEnd',
  'justifySelf',
  'placeSelf',
];

function parseSimpleTracks(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const repeatMatch = /^repeat\(\s*(\d+)\s*,\s*([^)]+)\)$/i.exec(trimmed);
  if (repeatMatch) {
    const count = Math.min(12, Math.max(1, parseInt(repeatMatch[1], 10)));
    const track = repeatMatch[2].trim();
    return Array.from({ length: count }, () => track);
  }
  const parts: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of trimmed) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ' ' && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

export const AlignmentSection: React.FC<AlignmentSectionProps> = ({
  element,
  parentElement,
  deviceMode,
  pseudoState,
  isOverlay,
  layoutCtx,
  onUpdateStyles,
  onResetProp,
}) => {
  const { t } = useTranslation();
  const [showAdvancedTextAlign, setShowAdvancedTextAlign] = useState(false);
  const [showRawGridCols, setShowRawGridCols] = useState(false);

  const val = (prop: keyof ElementStyles, fallback = ''): string => {
    const v = getStyleSource(element, prop, deviceMode, pseudoState).value as string | undefined;
    return v !== undefined && v !== '' ? v : fallback;
  };

  const fieldHeight = isOverlay ? 'min-h-[42px]' : 'h-[38px]';
  const selectCls = `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white text-sm text-[var(--builder-text-primary)] focus:outline-none focus:border-[var(--builder-primary)] ${fieldHeight}`;
  const inputCls = `w-full px-2.5 border border-[var(--builder-border)] rounded-[7px] bg-white font-mono text-sm text-[var(--builder-text-primary)] placeholder:text-[var(--builder-text-muted)] focus:outline-none focus:border-[var(--builder-primary)] ${fieldHeight}`;

  const flexDir = val('flexDirection', 'column');
  const flexWrap = val('flexWrap', 'nowrap');
  const justifyContent = val('justifyContent', 'flex-start');
  const alignItems = val('alignItems', 'stretch');
  const alignContent = val('alignContent', 'normal');
  const textAlign = val('textAlign', '');

  const isRowAxis = flexDir === 'row' || flexDir === 'row-reverse';
  const isReversed = flexDir === 'row-reverse' || flexDir === 'column-reverse';

  const rawGridCols = val('gridColumns', '');
  const gridColTracks = parseSimpleTracks(rawGridCols);

  const updateTracks = (nextTracks: string[]) => {
    if (nextTracks.length === 0) {
      onUpdateStyles({ gridColumns: '' });
      return;
    }
    onUpdateStyles({ gridColumns: nextTracks.join(' ') });
  };

  return (
    <div className="space-y-4">
      {/* 1. TEXT ALIGNMENT */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--builder-text-secondary)]">
            {t('inspector.alignment.textAlignment', { defaultValue: 'Text Alignment' })}
          </span>
          <button
            type="button"
            onClick={() => setShowAdvancedTextAlign((p) => !p)}
            className="text-[11px] font-medium text-[var(--builder-primary)] hover:underline shrink-0"
          >
            {showAdvancedTextAlign
              ? t('inspector.alignment.hideOptions', { defaultValue: 'Hide options' })
              : t('inspector.alignment.lastLineVertical', { defaultValue: 'Last line / Vertical' })}
          </button>
        </div>

        <div>
          <FieldHeader
            label={t('inspector.alignment.textAlign', { defaultValue: 'Text Align' })}
            cssProp="text-align"
            prop="textAlign"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            onResetProp={onResetProp}
          />
          <div className="grid grid-cols-6 gap-1">
            {(
              [
                { v: 'start', label: 'Start', icon: null },
                { v: 'left', label: 'Left', icon: AlignLeft },
                { v: 'center', label: 'Center', icon: AlignCenter },
                { v: 'right', label: 'Right', icon: AlignRight },
                { v: 'end', label: 'End', icon: null },
                { v: 'justify', label: 'Justify', icon: AlignJustify },
              ] as const
            ).map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                aria-label={`Text align ${label}`}
                title={`text-align: ${v}`}
                onClick={() => onUpdateStyles({ textAlign: v })}
                className={`min-h-[36px] rounded-[6px] border text-[11px] font-medium flex items-center justify-center transition-colors ${
                  textAlign === v
                    ? 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                    : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:bg-[var(--builder-surface-hover)] hover:text-[var(--builder-text-primary)]'
                }`}
              >
                {Icon ? <Icon className="w-3.5 h-3.5" /> : <span>{label}</span>}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[var(--builder-text-muted)] mt-1.5">
            {t('inspector.alignment.textAlignHint', {
              defaultValue: 'Aligns inline text inside this element (supports logical start/end for RTL).',
            })}
          </p>
        </div>

        {showAdvancedTextAlign && (
          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5 pt-1">
            <div>
              <FieldHeader
                label={t('inspector.alignment.lastLine', { defaultValue: 'Last Line' })}
                cssProp="text-align-last"
                prop="textAlignLast"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label={t('inspector.alignment.lastLine', { defaultValue: 'Last Line' })}
                value={val('textAlignLast', '')}
                onChange={(e) => onUpdateStyles({ textAlignLast: e.target.value })}
                className={selectCls}
              >
                <option value="">{t('inspector.common.default', { defaultValue: 'Default' })} (auto)</option>
                <option value="auto">auto</option>
                <option value="start">start</option>
                <option value="end">end</option>
                <option value="left">left</option>
                <option value="right">right</option>
                <option value="center">center</option>
                <option value="justify">justify</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.verticalAlign', { defaultValue: 'Vertical Align' })}
                cssProp="vertical-align"
                prop="verticalAlign"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label={t('inspector.alignment.verticalAlign', { defaultValue: 'Vertical Align' })}
                value={val('verticalAlign', '')}
                onChange={(e) => onUpdateStyles({ verticalAlign: e.target.value })}
                className={selectCls}
              >
                <option value="">{t('inspector.common.default', { defaultValue: 'Default' })} (baseline)</option>
                <option value="baseline">baseline</option>
                <option value="middle">middle</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
                <option value="text-top">text-top</option>
                <option value="text-bottom">text-bottom</option>
                <option value="sub">sub</option>
                <option value="super">super</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 2. FLEX CONTAINER CONTENT ALIGNMENT */}
      {layoutCtx.isFlexContainer && (
        <div className="space-y-3 pt-3 border-t border-[var(--builder-border)]">
          <span className="text-xs font-semibold text-[var(--builder-primary)] block">
            {t('inspector.alignment.flexContainerTitle', { defaultValue: 'Flex Container Alignment' })}
          </span>

          {/* Calm Main Axis / Cross Axis Summary */}
          <div className="p-2.5 rounded-[7px] bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[var(--builder-text-primary)]">
              {isRowAxis ? (
                isReversed ? (
                  <ArrowLeft className="w-3.5 h-3.5 text-[var(--builder-primary)]" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 text-[var(--builder-primary)]" />
                )
              ) : isReversed ? (
                <ArrowUp className="w-3.5 h-3.5 text-[var(--builder-primary)]" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5 text-[var(--builder-primary)]" />
              )}
              <span>
                {t('inspector.alignment.mainAxis', { defaultValue: 'Main Axis' })}:{' '}
                {isRowAxis
                  ? t('inspector.alignment.horizontal', { defaultValue: 'Horizontal' })
                  : t('inspector.alignment.vertical', { defaultValue: 'Vertical' })}
                {isReversed ? ` (${t('inspector.alignment.reversed', { defaultValue: 'Reversed' })})` : ''}
              </span>
            </span>
            <span className="text-[11px] font-mono text-[var(--builder-text-secondary)]">
              {t('inspector.alignment.crossAxis', { defaultValue: 'Cross Axis' })}:{' '}
              {isRowAxis
                ? t('inspector.alignment.vertical', { defaultValue: 'Vertical' })
                : t('inspector.alignment.horizontal', { defaultValue: 'Horizontal' })}
            </span>
          </div>

          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <div>
              <FieldHeader
                label={t('inspector.alignment.direction', { defaultValue: 'Direction' })}
                cssProp="flex-direction"
                prop="flexDirection"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label={t('inspector.alignment.direction', { defaultValue: 'Direction' })}
                value={flexDir}
                onChange={(e) => onUpdateStyles({ flexDirection: e.target.value })}
                className={selectCls}
              >
                <option value="row">Row (→)</option>
                <option value="row-reverse">Row Reverse (←)</option>
                <option value="column">Column (↓)</option>
                <option value="column-reverse">Column Reverse (↑)</option>
              </select>
            </div>

            <div>
              <FieldHeader
                label={t('inspector.alignment.wrap', { defaultValue: 'Wrap' })}
                cssProp="flex-wrap"
                prop="flexWrap"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label={t('inspector.alignment.wrap', { defaultValue: 'Wrap' })}
                value={flexWrap}
                onChange={(e) => onUpdateStyles({ flexWrap: e.target.value })}
                className={selectCls}
              >
                <option value="nowrap">nowrap (Single line)</option>
                <option value="wrap">wrap (Multi-line)</option>
                <option value="wrap-reverse">wrap-reverse</option>
              </select>
            </div>
          </div>

          <div>
            <FieldHeader
              label={t('inspector.alignment.justifyContentMain', {
                defaultValue: 'Justify Content (Main Axis)',
              })}
              cssProp="justify-content"
              prop="justifyContent"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <div className="grid grid-cols-5 gap-1 mb-1.5">
              {[
                { v: 'flex-start', label: 'Start' },
                { v: 'center', label: 'Center' },
                { v: 'flex-end', label: 'End' },
                { v: 'space-between', label: 'Between' },
                { v: 'space-evenly', label: 'Evenly' },
              ].map((preset) => (
                <button
                  key={preset.v}
                  type="button"
                  onClick={() => onUpdateStyles({ justifyContent: preset.v })}
                  className={`min-h-[32px] text-[11px] font-medium rounded-[6px] border transition-colors ${
                    justifyContent === preset.v
                      ? 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                      : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:bg-[var(--builder-surface-hover)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <select
              aria-label="Justify Content"
              value={justifyContent}
              onChange={(e) => onUpdateStyles({ justifyContent: e.target.value })}
              className={selectCls}
            >
              <option value="normal">normal</option>
              <option value="flex-start">flex-start</option>
              <option value="center">center</option>
              <option value="flex-end">flex-end</option>
              <option value="start">start</option>
              <option value="end">end</option>
              <option value="left">left</option>
              <option value="right">right</option>
              <option value="space-between">space-between</option>
              <option value="space-around">space-around</option>
              <option value="space-evenly">space-evenly</option>
              <option value="stretch">stretch</option>
            </select>
          </div>

          <div>
            <FieldHeader
              label={t('inspector.alignment.alignItemsCross', {
                defaultValue: 'Align Items (Cross Axis)',
              })}
              cssProp="align-items"
              prop="alignItems"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <div className="grid grid-cols-5 gap-1 mb-1.5">
              {[
                { v: 'flex-start', label: 'Start' },
                { v: 'center', label: 'Center' },
                { v: 'flex-end', label: 'End' },
                { v: 'stretch', label: 'Stretch' },
                { v: 'baseline', label: 'Base' },
              ].map((preset) => (
                <button
                  key={preset.v}
                  type="button"
                  onClick={() => onUpdateStyles({ alignItems: preset.v })}
                  className={`min-h-[32px] text-[11px] font-medium rounded-[6px] border transition-colors ${
                    alignItems === preset.v
                      ? 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                      : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:bg-[var(--builder-surface-hover)]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <select
              aria-label="Align Items"
              value={alignItems}
              onChange={(e) => onUpdateStyles({ alignItems: e.target.value })}
              className={selectCls}
            >
              <option value="normal">normal</option>
              <option value="stretch">stretch</option>
              <option value="flex-start">flex-start</option>
              <option value="center">center</option>
              <option value="flex-end">flex-end</option>
              <option value="start">start</option>
              <option value="end">end</option>
              <option value="self-start">self-start</option>
              <option value="self-end">self-end</option>
              <option value="baseline">baseline</option>
              <option value="first baseline">first baseline</option>
              <option value="last baseline">last baseline</option>
            </select>
          </div>

          <div>
            <FieldHeader
              label={t('inspector.alignment.alignContentMulti', {
                defaultValue: 'Align Content (Multi-line)',
              })}
              cssProp="align-content"
              prop="alignContent"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <select
              aria-label="Align Content"
              value={alignContent}
              onChange={(e) => onUpdateStyles({ alignContent: e.target.value })}
              className={selectCls}
            >
              <option value="normal">normal</option>
              <option value="start">start</option>
              <option value="end">end</option>
              <option value="flex-start">flex-start</option>
              <option value="center">center</option>
              <option value="flex-end">flex-end</option>
              <option value="stretch">stretch</option>
              <option value="space-between">space-between</option>
              <option value="space-around">space-around</option>
              <option value="space-evenly">space-evenly</option>
              <option value="baseline">baseline</option>
            </select>
            {flexWrap === 'nowrap' && (
              <p className="text-[11px] text-[var(--builder-text-muted)] mt-1">
                {t('inspector.alignment.wrapHint', {
                  defaultValue: 'Takes effect when Wrap is set to wrap / wrap-reverse.',
                })}
              </p>
            )}
          </div>

          {/* Gaps in 2-col responsive grid so digits never clip */}
          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <CssUnitInput
              label={t('inspector.alignment.gap', { defaultValue: 'Gap' })}
              cssProp="gap"
              prop="gap"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ gap: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.alignment.rowGap', { defaultValue: 'Row Gap' })}
              cssProp="row-gap"
              prop="rowGap"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ rowGap: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.alignment.columnGap', { defaultValue: 'Col Gap' })}
              cssProp="column-gap"
              prop="columnGap"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ columnGap: v })}
              onReset={onResetProp}
            />
          </div>
        </div>
      )}

      {/* 3. GRID CONTAINER ALIGNMENT & TRACK BUILDER */}
      {layoutCtx.isGridContainer && (
        <div className="space-y-3 pt-3 border-t border-[var(--builder-border)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--builder-primary)]">
              {t('inspector.alignment.gridContainerTitle', {
                defaultValue: 'Grid Container Tracks & Alignment',
              })}
            </span>
            <button
              type="button"
              onClick={() => setShowRawGridCols((p) => !p)}
              className="text-[11px] font-mono text-[var(--builder-primary)] hover:underline"
            >
              {showRawGridCols
                ? t('inspector.common.visualTracks', { defaultValue: 'Visual Tracks' })
                : t('inspector.common.rawCss', { defaultValue: 'Raw CSS' })}
            </button>
          </div>

          <div className="space-y-2.5">
            <FieldHeader
              label={t('inspector.alignment.templateColumns', { defaultValue: 'Template Columns' })}
              cssProp="grid-template-columns"
              prop="gridColumns"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />

            <div className="grid grid-cols-4 gap-1">
              {[
                { label: '1 Col', val: '1fr' },
                { label: '2 Cols', val: 'repeat(2, 1fr)' },
                { label: '3 Cols', val: 'repeat(3, 1fr)' },
                { label: 'Auto Fit', val: 'repeat(auto-fit, minmax(240px, 1fr))' },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => onUpdateStyles({ gridColumns: p.val })}
                  className={`min-h-[32px] text-[11px] font-medium rounded-[6px] border transition-colors ${
                    rawGridCols === p.val
                      ? 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                      : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:bg-[var(--builder-surface-hover)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {!showRawGridCols &&
            !rawGridCols.includes('auto-fit') &&
            !rawGridCols.includes('auto-fill') ? (
              <div className="space-y-1.5">
                {gridColTracks.map((track, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-[var(--builder-text-muted)] w-9 shrink-0">
                      C{idx + 1}
                    </span>
                    <input
                      type="text"
                      aria-label={`Grid column ${idx + 1} track`}
                      value={track}
                      onChange={(e) => {
                        const copy = [...gridColTracks];
                        copy[idx] = e.target.value;
                        updateTracks(copy);
                      }}
                      className="flex-1 min-w-0 px-2.5 h-9 text-xs font-mono border border-[var(--builder-border)] rounded-[6px] bg-white"
                    />
                    <select
                      aria-label={`Column ${idx + 1} preset`}
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const copy = [...gridColTracks];
                        copy[idx] = e.target.value;
                        updateTracks(copy);
                      }}
                      className="text-xs px-1.5 h-9 border border-[var(--builder-border)] rounded-[6px] bg-white text-[var(--builder-text-secondary)]"
                    >
                      <option value="">{t('inspector.common.preset', { defaultValue: 'Preset' })}</option>
                      <option value="1fr">1fr</option>
                      <option value="2fr">2fr</option>
                      <option value="auto">auto</option>
                      <option value="250px">250px</option>
                      <option value="minmax(200px, 1fr)">minmax(200px, 1fr)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => updateTracks(gridColTracks.filter((_, i) => i !== idx))}
                      aria-label={`Remove column ${idx + 1}`}
                      className="p-1.5 text-[var(--builder-text-muted)] hover:text-[var(--builder-danger)] rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => updateTracks([...gridColTracks, '1fr'])}
                  className="w-full min-h-[34px] border border-dashed border-[var(--builder-border-strong)] rounded-[7px] text-xs font-medium text-[var(--builder-text-secondary)] hover:border-[var(--builder-primary)] hover:text-[var(--builder-primary)] flex items-center justify-center gap-1.5 bg-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('inspector.alignment.addColumnTrack', { defaultValue: 'Add Column Track' })}</span>
                </button>
              </div>
            ) : (
              <input
                type="text"
                aria-label="Grid template columns CSS"
                placeholder="e.g. repeat(4, minmax(180px, 1fr))"
                value={rawGridCols}
                onChange={(e) => onUpdateStyles({ gridColumns: e.target.value })}
                className={inputCls}
              />
            )}
          </div>

          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <div>
              <FieldHeader
                label={t('inspector.alignment.templateRows', { defaultValue: 'Template Rows' })}
                cssProp="grid-template-rows"
                prop="gridTemplateRows"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="e.g. auto 1fr auto"
                value={val('gridTemplateRows', '')}
                onChange={(e) => onUpdateStyles({ gridTemplateRows: e.target.value })}
                className={inputCls}
              />
            </div>

            <div>
              <FieldHeader
                label={t('inspector.alignment.autoFlow', { defaultValue: 'Auto Flow' })}
                cssProp="grid-auto-flow"
                prop="gridAutoFlow"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label={t('inspector.alignment.autoFlow', { defaultValue: 'Auto Flow' })}
                value={val('gridAutoFlow', 'row')}
                onChange={(e) => onUpdateStyles({ gridAutoFlow: e.target.value })}
                className={selectCls}
              >
                <option value="row">row</option>
                <option value="column">column</option>
                <option value="dense">dense</option>
                <option value="row dense">row dense</option>
                <option value="column dense">column dense</option>
              </select>
            </div>

            <div>
              <FieldHeader
                label={t('inspector.alignment.autoColumns', { defaultValue: 'Auto Columns' })}
                cssProp="grid-auto-columns"
                prop="gridAutoColumns"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="auto / minmax(0, 1fr)"
                value={val('gridAutoColumns', '')}
                onChange={(e) => onUpdateStyles({ gridAutoColumns: e.target.value })}
                className={inputCls}
              />
            </div>

            <div>
              <FieldHeader
                label={t('inspector.alignment.autoRows', { defaultValue: 'Auto Rows' })}
                cssProp="grid-auto-rows"
                prop="gridAutoRows"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="auto / minmax(120px, auto)"
                value={val('gridAutoRows', '')}
                onChange={(e) => onUpdateStyles({ gridAutoRows: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <FieldHeader
              label={t('inspector.alignment.templateAreas', { defaultValue: 'Template Areas' })}
              cssProp="grid-template-areas"
              prop="gridTemplateAreas"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <textarea
              rows={2}
              placeholder={'"header header"\n"sidebar main"'}
              value={val('gridTemplateAreas', '')}
              onChange={(e) => onUpdateStyles({ gridTemplateAreas: e.target.value })}
              className="w-full p-2.5 border border-[var(--builder-border)] rounded-[7px] font-mono text-xs bg-white"
            />
          </div>

          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <div>
              <FieldHeader
                label={t('inspector.alignment.justifyItems', { defaultValue: 'Justify Items' })}
                cssProp="justify-items"
                prop="justifyItems"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Justify Items"
                value={val('justifyItems', '')}
                onChange={(e) => onUpdateStyles({ justifyItems: e.target.value })}
                className={selectCls}
              >
                <option value="">{t('inspector.common.default', { defaultValue: 'Default' })} (stretch)</option>
                <option value="stretch">stretch</option>
                <option value="start">start</option>
                <option value="center">center</option>
                <option value="end">end</option>
                <option value="baseline">baseline</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.alignItems', { defaultValue: 'Align Items' })}
                cssProp="align-items"
                prop="alignItems"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Grid Align Items"
                value={val('alignItems', '')}
                onChange={(e) => onUpdateStyles({ alignItems: e.target.value })}
                className={selectCls}
              >
                <option value="">{t('inspector.common.default', { defaultValue: 'Default' })} (stretch)</option>
                <option value="stretch">stretch</option>
                <option value="start">start</option>
                <option value="center">center</option>
                <option value="end">end</option>
                <option value="baseline">baseline</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.justifyContent', { defaultValue: 'Justify Content' })}
                cssProp="justify-content"
                prop="justifyContent"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Grid Justify Content"
                value={val('justifyContent', '')}
                onChange={(e) => onUpdateStyles({ justifyContent: e.target.value })}
                className={selectCls}
              >
                <option value="">{t('inspector.common.default', { defaultValue: 'Default' })} (normal)</option>
                <option value="start">start</option>
                <option value="center">center</option>
                <option value="end">end</option>
                <option value="stretch">stretch</option>
                <option value="space-between">space-between</option>
                <option value="space-around">space-around</option>
                <option value="space-evenly">space-evenly</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.alignContent', { defaultValue: 'Align Content' })}
                cssProp="align-content"
                prop="alignContent"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Grid Align Content"
                value={val('alignContent', '')}
                onChange={(e) => onUpdateStyles({ alignContent: e.target.value })}
                className={selectCls}
              >
                <option value="">{t('inspector.common.default', { defaultValue: 'Default' })} (normal)</option>
                <option value="start">start</option>
                <option value="center">center</option>
                <option value="end">end</option>
                <option value="stretch">stretch</option>
                <option value="space-between">space-between</option>
                <option value="space-around">space-around</option>
                <option value="space-evenly">space-evenly</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.placeItems', { defaultValue: 'Place Items' })}
                cssProp="place-items"
                prop="placeItems"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="e.g. center / start stretch"
                value={val('placeItems', '')}
                onChange={(e) => onUpdateStyles({ placeItems: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.placeContent', { defaultValue: 'Place Content' })}
                cssProp="place-content"
                prop="placeContent"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="e.g. center space-between"
                value={val('placeContent', '')}
                onChange={(e) => onUpdateStyles({ placeContent: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <CssUnitInput
              label={t('inspector.alignment.gap', { defaultValue: 'Gap' })}
              cssProp="gap"
              prop="gap"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ gap: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.alignment.rowGap', { defaultValue: 'Row Gap' })}
              cssProp="row-gap"
              prop="rowGap"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ rowGap: v })}
              onReset={onResetProp}
            />
            <CssUnitInput
              label={t('inspector.alignment.columnGap', { defaultValue: 'Col Gap' })}
              cssProp="column-gap"
              prop="columnGap"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              keywords={[]}
              placeholder="0"
              isOverlay={isOverlay}
              onChange={(v) => onUpdateStyles({ columnGap: v })}
              onReset={onResetProp}
            />
          </div>
        </div>
      )}

      {/* 4. BLOCK / NORMAL FLOW GUIDANCE */}
      {layoutCtx.isBlockContainer && (
        <div className="p-2.5 rounded-[7px] bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] space-y-2">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-[var(--builder-text-secondary)] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-[var(--builder-text-primary)]">
                {t('inspector.alignment.blockFlowTitle', {
                  display: layoutCtx.effectiveDisplay,
                  defaultValue: `Block / Normal Flow (${layoutCtx.effectiveDisplay})`,
                })}
              </div>
              <p className="text-[11px] text-[var(--builder-text-secondary)] leading-snug">
                {t('inspector.alignment.blockFlowHint', {
                  defaultValue: 'Change Display to Flex or Grid to align child elements as a group.',
                })}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateStyles({ marginInline: 'auto' })}
              className="px-2.5 py-1 rounded-[6px] border border-[var(--builder-border)] bg-white hover:bg-[var(--builder-surface-hover)] text-[11px] font-medium text-[var(--builder-text-primary)]"
            >
              {t('inspector.alignment.centerBlock', { defaultValue: 'Center Block' })}
            </button>
            <button
              type="button"
              onClick={() => onUpdateStyles({ display: 'flex', flexDirection: 'column', gap: '16px' })}
              className="px-2.5 py-1 rounded-[6px] bg-[var(--builder-primary-soft)] hover:bg-[var(--builder-primary)] hover:text-white text-[11px] font-semibold text-[var(--builder-primary)] transition-colors"
            >
              {t('inspector.alignment.switchToFlex', { defaultValue: 'Switch to Flex' })}
            </button>
            <button
              type="button"
              onClick={() => onUpdateStyles({ display: 'grid', gridColumns: '1fr 1fr', gap: '16px' })}
              className="px-2.5 py-1 rounded-[6px] bg-[var(--builder-primary-soft)] hover:bg-[var(--builder-primary)] hover:text-white text-[11px] font-semibold text-[var(--builder-primary)] transition-colors"
            >
              {t('inspector.alignment.switchToGrid', { defaultValue: 'Switch to Grid' })}
            </button>
          </div>
        </div>
      )}

      {/* 5. FLEX ITEM SELF ALIGNMENT */}
      {layoutCtx.isFlexItem && parentElement && (
        <div className="space-y-3 pt-3 border-t border-[var(--builder-border)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--builder-primary)]">
              {t('inspector.alignment.flexItemTitle', { defaultValue: 'Flex Item Alignment' })}
            </span>
            <span className="text-[11px] text-[var(--builder-text-muted)] truncate">
              {t('inspector.alignment.parentLabel', {
                name: parentElement.name,
                defaultValue: `Parent: ${parentElement.name}`,
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <div>
              <FieldHeader
                label={t('inspector.alignment.alignSelf', { defaultValue: 'Align Self' })}
                cssProp="align-self"
                prop="alignSelf"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Flex Align Self"
                value={val('alignSelf', 'auto')}
                onChange={(e) => onUpdateStyles({ alignSelf: e.target.value })}
                className={selectCls}
              >
                <option value="auto">auto</option>
                <option value="normal">normal</option>
                <option value="stretch">stretch</option>
                <option value="flex-start">flex-start</option>
                <option value="center">center</option>
                <option value="flex-end">flex-end</option>
                <option value="start">start</option>
                <option value="end">end</option>
                <option value="self-start">self-start</option>
                <option value="self-end">self-end</option>
                <option value="baseline">baseline</option>
              </select>
            </div>

            <div>
              <FieldHeader
                label={t('inspector.alignment.order', { defaultValue: 'Order' })}
                cssProp="order"
                prop="order"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                inputMode="numeric"
                aria-label="Flex Order"
                placeholder="0"
                value={val('order', '')}
                onChange={(e) => onUpdateStyles({ order: e.target.value })}
                className={inputCls}
              />
            </div>

            <div>
              <FieldHeader
                label={t('inspector.alignment.grow', { defaultValue: 'Grow' })}
                cssProp="flex-grow"
                prop="flexGrow"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={val('flexGrow', '')}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^-\d/.test(v.trim())) return;
                  onUpdateStyles({ flexGrow: v });
                }}
                className={inputCls}
              />
            </div>

            <div>
              <FieldHeader
                label={t('inspector.alignment.shrink', { defaultValue: 'Shrink' })}
                cssProp="flex-shrink"
                prop="flexShrink"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="1"
                value={val('flexShrink', '')}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^-\d/.test(v.trim())) return;
                  onUpdateStyles({ flexShrink: v });
                }}
                className={inputCls}
              />
            </div>
          </div>

          <CssUnitInput
            label={t('inspector.alignment.basis', { defaultValue: 'Basis' })}
            cssProp="flex-basis"
            prop="flexBasis"
            element={element}
            deviceMode={deviceMode}
            pseudoState={pseudoState}
            units={STANDARD_LENGTH_UNITS}
            keywords={['auto', 'content', '0']}
            isOverlay={isOverlay}
            onChange={(v) => onUpdateStyles({ flexBasis: v })}
            onReset={onResetProp}
          />

          <div>
            <FieldHeader
              label={t('inspector.alignment.flexPresets', { defaultValue: 'Flex Shorthand Presets' })}
              cssProp="flex"
              prop="flex"
              element={element}
              deviceMode={deviceMode}
              pseudoState={pseudoState}
              onResetProp={onResetProp}
            />
            <div className="grid grid-cols-4 gap-1 mb-1.5">
              {[
                { label: 'Default', v: '0 1 auto' },
                { label: 'Grow 1', v: '1 1 0%' },
                { label: 'Fixed', v: '0 0 auto' },
                { label: 'Fill', v: '1 0 auto' },
              ].map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => onUpdateStyles({ flex: p.v })}
                  className={`min-h-[30px] text-[11px] font-medium rounded-[6px] border transition-colors ${
                    val('flex') === p.v
                      ? 'bg-[var(--builder-primary)] text-white border-[var(--builder-primary)]'
                      : 'bg-[var(--builder-surface-muted)] text-[var(--builder-text-secondary)] border-[var(--builder-border)] hover:bg-[var(--builder-surface-hover)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="e.g. 1 1 280px"
              value={val('flex', '')}
              onChange={(e) => onUpdateStyles({ flex: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* 6. GRID ITEM SELF ALIGNMENT & PLACEMENT */}
      {layoutCtx.isGridItem && parentElement && (
        <div className="space-y-3 pt-3 border-t border-[var(--builder-border)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--builder-primary)]">
              {t('inspector.alignment.gridItemTitle', {
                defaultValue: 'Grid Item Alignment & Placement',
              })}
            </span>
            <span className="text-[11px] text-[var(--builder-text-muted)] truncate">
              {t('inspector.alignment.parentLabel', {
                name: parentElement.name,
                defaultValue: `Parent: ${parentElement.name}`,
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 @[300px]:grid-cols-2 gap-2.5">
            <div>
              <FieldHeader
                label={t('inspector.alignment.justifySelf', { defaultValue: 'Justify Self' })}
                cssProp="justify-self"
                prop="justifySelf"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Grid Justify Self"
                value={val('justifySelf', 'auto')}
                onChange={(e) => onUpdateStyles({ justifySelf: e.target.value })}
                className={selectCls}
              >
                <option value="auto">auto</option>
                <option value="stretch">stretch</option>
                <option value="start">start</option>
                <option value="center">center</option>
                <option value="end">end</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.alignSelf', { defaultValue: 'Align Self' })}
                cssProp="align-self"
                prop="alignSelf"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <select
                aria-label="Grid Align Self"
                value={val('alignSelf', 'auto')}
                onChange={(e) => onUpdateStyles({ alignSelf: e.target.value })}
                className={selectCls}
              >
                <option value="auto">auto</option>
                <option value="stretch">stretch</option>
                <option value="start">start</option>
                <option value="center">center</option>
                <option value="end">end</option>
                <option value="baseline">baseline</option>
              </select>
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.gridColumn', { defaultValue: 'Grid Column' })}
                cssProp="grid-column"
                prop="gridColumn"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="e.g. span 2 or 1 / 3"
                value={val('gridColumn', '')}
                onChange={(e) => onUpdateStyles({ gridColumn: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.gridRow', { defaultValue: 'Grid Row' })}
                cssProp="grid-row"
                prop="gridRow"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="e.g. span 2 or 1 / 3"
                value={val('gridRow', '')}
                onChange={(e) => onUpdateStyles({ gridRow: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.placeSelf', { defaultValue: 'Place Self' })}
                cssProp="place-self"
                prop="placeSelf"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                placeholder="e.g. center stretch"
                value={val('placeSelf', '')}
                onChange={(e) => onUpdateStyles({ placeSelf: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <FieldHeader
                label={t('inspector.alignment.order', { defaultValue: 'Order' })}
                cssProp="order"
                prop="order"
                element={element}
                deviceMode={deviceMode}
                pseudoState={pseudoState}
                onResetProp={onResetProp}
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={val('order', '')}
                onChange={(e) => onUpdateStyles({ order: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              title="grid-column-start"
              placeholder="col-start"
              value={val('gridColumnStart', '')}
              onChange={(e) => onUpdateStyles({ gridColumnStart: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              title="grid-column-end"
              placeholder="col-end"
              value={val('gridColumnEnd', '')}
              onChange={(e) => onUpdateStyles({ gridColumnEnd: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              title="grid-row-start"
              placeholder="row-start"
              value={val('gridRowStart', '')}
              onChange={(e) => onUpdateStyles({ gridRowStart: e.target.value })}
              className={inputCls}
            />
            <input
              type="text"
              title="grid-row-end"
              placeholder="row-end"
              value={val('gridRowEnd', '')}
              onChange={(e) => onUpdateStyles({ gridRowEnd: e.target.value })}
              className={inputCls}
            />
          </div>
        </div>
      )}
    </div>
  );
};
