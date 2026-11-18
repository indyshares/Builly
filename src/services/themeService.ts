import React from 'react';
import {
  ElementNode,
  SemanticThemeColors,
  SiteDocument,
  SiteThemeConfig,
  ThemeSnapshot,
  ThemeTokens,
} from '../types/builder';
import { THEMES } from '../data/themes';

export const DEFAULT_SEMANTIC_COLORS: SemanticThemeColors = {
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  secondary: '#1C1917',
  accent: '#2563EB',
  background: '#FAFAF9',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F4',
  text: '#1C1917',
  textMuted: '#645F5A',
  textInverse: '#FAFAF9',
  heading: '#1C1917',
  border: '#E7E5E4',
  divider: '#E7E5E4',
  link: '#1D4ED8',
  buttonPrimaryBg: '#2563EB',
  buttonPrimaryText: '#FFFFFF',
  buttonSecondaryBg: '#FFFFFF',
  focusRing: '#2563EB',
};

export const SEMANTIC_COLOR_FIELDS: {
  key: keyof SemanticThemeColors;
  label: string;
  group: 'brand' | 'surfaces' | 'typography';
  cssVar: string;
}[] = [
  { key: 'primary', label: 'Primary', group: 'brand', cssVar: '--color-primary' },
  { key: 'primaryHover', label: 'Primary Hover', group: 'brand', cssVar: '--color-primary-hover' },
  { key: 'secondary', label: 'Secondary', group: 'brand', cssVar: '--color-secondary' },
  { key: 'accent', label: 'Accent', group: 'brand', cssVar: '--color-accent' },
  { key: 'buttonPrimaryBg', label: 'Primary Button', group: 'brand', cssVar: '--color-button-primary-bg' },
  { key: 'buttonPrimaryText', label: 'Primary Button Text', group: 'brand', cssVar: '--color-button-primary-text' },
  { key: 'buttonSecondaryBg', label: 'Secondary Button', group: 'brand', cssVar: '--color-button-secondary-bg' },
  { key: 'link', label: 'Link', group: 'brand', cssVar: '--color-link' },
  { key: 'background', label: 'Page Background', group: 'surfaces', cssVar: '--color-background' },
  { key: 'surface', label: 'Surface / Card', group: 'surfaces', cssVar: '--color-surface' },
  { key: 'surfaceAlt', label: 'Subtle Surface', group: 'surfaces', cssVar: '--color-surface-alt' },
  { key: 'border', label: 'Border', group: 'surfaces', cssVar: '--color-border' },
  { key: 'divider', label: 'Divider', group: 'surfaces', cssVar: '--color-divider' },
  { key: 'heading', label: 'Heading Text', group: 'typography', cssVar: '--color-heading' },
  { key: 'text', label: 'Body Text', group: 'typography', cssVar: '--color-text' },
  { key: 'textMuted', label: 'Muted Text', group: 'typography', cssVar: '--color-text-muted' },
  { key: 'textInverse', label: 'Inverse Text', group: 'typography', cssVar: '--color-text-inverse' },
  { key: 'focusRing', label: 'Focus Ring', group: 'typography', cssVar: '--color-focus-ring' },
];

export interface ResolvedEffectiveTheme {
  baseTheme: ThemeTokens;
  config: SiteThemeConfig;
  colors: SemanticThemeColors;
  overrideCount: number;
  cssVars: Record<string, string>;
}

/**
 * Validates and normalizes a 3- or 6-digit HEX color string.
 */
export function normalizeHexColor(
  raw: string
): { valid: boolean; hex: string; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, hex: '', error: 'HEX value is required.' };
  }
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(withHash);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return { valid: true, hex: `#${r}${r}${g}${g}${b}${b}`.toUpperCase() };
  }
  const fullMatch = /^#([0-9a-fA-F]{6})$/.exec(withHash);
  if (fullMatch) {
    return { valid: true, hex: `#${fullMatch[1].toUpperCase()}` };
  }
  return {
    valid: false,
    hex: '',
    error: 'Enter a valid 3- or 6-digit HEX color (e.g. #2563EB).',
  };
}

/**
 * Finds the active base theme definition from built-in presets or site custom themes.
 */
export function getThemeDefinition(site: SiteDocument): ThemeTokens {
  const themeId = site.themeConfig?.themeId || site.activeThemeId || THEMES[0].id;
  const allThemes = [...THEMES, ...(site.customThemes || [])];
  return allThemes.find((t) => t.id === themeId) || THEMES[0];
}

/**
 * Resolves effective theme tokens following precedence:
 * 1. Built-in platform defaults
 * 2. Selected preset / custom theme tokens
 * 3. Site-level colorOverrides
 */
export function resolveEffectiveTheme(site: SiteDocument): ResolvedEffectiveTheme {
  const baseTheme = getThemeDefinition(site);
  const config: SiteThemeConfig = site.themeConfig || {
    schemaVersion: 1,
    themeId: baseTheme.id,
    themeVersion: baseTheme.version,
    colorOverrides: {},
    updatedAt: new Date().toISOString(),
  };

  const mergedColors: SemanticThemeColors = {
    ...DEFAULT_SEMANTIC_COLORS,
    ...baseTheme.semantic,
  };

  let overrideCount = 0;
  for (const key of Object.keys(config.colorOverrides || {}) as (keyof SemanticThemeColors)[]) {
    const val = config.colorOverrides[key];
    if (val) {
      const check = normalizeHexColor(val);
      if (check.valid) {
        mergedColors[key] = check.hex;
        overrideCount++;
      }
    }
  }

  const cssVars = buildThemeCssVarsMap(mergedColors, baseTheme);

  return {
    baseTheme,
    config,
    colors: mergedColors,
    overrideCount,
    cssVars,
  };
}

export function buildThemeCssVarsMap(
  colors: SemanticThemeColors,
  theme: Pick<ThemeTokens, 'fontDisplay' | 'fontBody' | 'fontMono' | 'borderRadius' | 'containerMaxWidth'>
): Record<string, string> {
  const vars: Record<string, string> = {};
  SEMANTIC_COLOR_FIELDS.forEach((f) => {
    vars[f.cssVar] = colors[f.key];
  });
  vars['--font-display'] = theme.fontDisplay;
  vars['--font-body'] = theme.fontBody;
  vars['--font-mono'] = theme.fontMono;
  vars['--theme-radius'] = theme.borderRadius;
  vars['--theme-max-width'] = theme.containerMaxWidth;
  return vars;
}

export function buildThemeCssVariablesText(
  colors: SemanticThemeColors,
  theme: Pick<ThemeTokens, 'fontDisplay' | 'fontBody' | 'fontMono' | 'borderRadius' | 'containerMaxWidth'>
): string {
  const vars = buildThemeCssVarsMap(colors, theme);
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `.portfolio-theme {\n${lines.join('\n')}\n}`;
}

export function createThemeSnapshot(site: SiteDocument): ThemeSnapshot {
  const resolved = resolveEffectiveTheme(site);
  return {
    themeId: resolved.baseTheme.id,
    themeVersion: resolved.baseTheme.version,
    themeName: resolved.baseTheme.name,
    colors: resolved.colors,
    colorOverrides: { ...resolved.config.colorOverrides },
    fontDisplay: resolved.baseTheme.fontDisplay,
    fontBody: resolved.baseTheme.fontBody,
    fontMono: resolved.baseTheme.fontMono,
    borderRadius: resolved.baseTheme.borderRadius,
    containerMaxWidth: resolved.baseTheme.containerMaxWidth,
    cssVariablesText: buildThemeCssVariablesText(resolved.colors, resolved.baseTheme),
  };
}

/**
 * Resolves CSS variable strings (e.g. "var(--color-heading)") to a concrete HEX color
 * for native color pickers and contrast checks.
 */
export function resolveColorValue(
  rawValue: string | undefined,
  themeColors: SemanticThemeColors,
  fallback = '#0F172A'
): string {
  if (!rawValue) return fallback;
  const trimmed = rawValue.trim();
  if (trimmed.startsWith('var(')) {
    const match = /^var\(\s*(--[a-zA-Z0-9-]+)(?:\s*,\s*([^)]+))?\s*\)$/.exec(trimmed);
    if (match) {
      const cssVar = match[1];
      const field = SEMANTIC_COLOR_FIELDS.find((f) => f.cssVar === cssVar);
      if (field) return themeColors[field.key];
      if (match[2]) return match[2].trim();
    }
    return fallback;
  }
  const normalized = normalizeHexColor(trimmed);
  return normalized.valid ? normalized.hex : fallback;
}

export function isThemeTokenReference(value: string | undefined): boolean {
  return Boolean(value && value.trim().startsWith('var(--color-'));
}

// --- WCAG 2.2 Contrast & Accessibility Helpers ---

function hexToRgb(hex: string): [number, number, number] | null {
  const norm = normalizeHexColor(hex);
  if (!norm.valid) return null;
  const clean = norm.hex.slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

export function getContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = getRelativeLuminance(fgHex);
  const l2 = getRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function suggestAccessibleForeground(bgHex: string, minRatio = 4.5): string {
  const bgLum = getRelativeLuminance(bgHex);
  const whiteContrast = getContrastRatio('#FFFFFF', bgHex);
  const darkContrast = getContrastRatio('#0F172A', bgHex);

  if (bgLum < 0.35 && whiteContrast >= minRatio) return '#F8FAFC';
  if (darkContrast >= minRatio) return '#0F172A';
  return whiteContrast >= darkContrast ? '#FFFFFF' : '#090A0F';
}

export interface ContrastAuditItem {
  id: string;
  label: string;
  fgKey: keyof SemanticThemeColors;
  bgKey: keyof SemanticThemeColors;
  fgHex: string;
  bgHex: string;
  ratio: number;
  target: number;
  passes: boolean;
  suggestedFgHex: string;
}

export function auditThemeContrast(colors: SemanticThemeColors): ContrastAuditItem[] {
  const pairs: {
    id: string;
    label: string;
    fgKey: keyof SemanticThemeColors;
    bgKey: keyof SemanticThemeColors;
    target: number;
  }[] = [
    {
      id: 'body-bg',
      label: 'Body Text on Page Background',
      fgKey: 'text',
      bgKey: 'background',
      target: 4.5,
    },
    {
      id: 'heading-bg',
      label: 'Heading Text on Page Background',
      fgKey: 'heading',
      bgKey: 'background',
      target: 3.0,
    },
    {
      id: 'body-surface',
      label: 'Body Text on Card Surface',
      fgKey: 'text',
      bgKey: 'surface',
      target: 4.5,
    },
    {
      id: 'muted-surface',
      label: 'Muted Text on Card Surface',
      fgKey: 'textMuted',
      bgKey: 'surface',
      target: 4.5,
    },
    {
      id: 'button-primary',
      label: 'Button Text on Primary Button',
      fgKey: 'buttonPrimaryText',
      bgKey: 'buttonPrimaryBg',
      target: 4.5,
    },
    {
      id: 'link-bg',
      label: 'Link Color on Page Background',
      fgKey: 'link',
      bgKey: 'background',
      target: 4.5,
    },
  ];

  return pairs.map((p) => {
    const fgHex = colors[p.fgKey];
    const bgHex = colors[p.bgKey];
    const ratio = getContrastRatio(fgHex, bgHex);
    const passes = ratio >= p.target;
    return {
      ...p,
      fgHex,
      bgHex,
      ratio,
      passes,
      suggestedFgHex: suggestAccessibleForeground(bgHex, p.target),
    };
  });
}

// --- Legacy Site Draft Migration to Semantic Tokens ---
// Converts known built-in template hex defaults to CSS variables so pre-existing
// saved drafts respond to theme selection without overwriting genuine user overrides.

const LEGACY_TEXT_COLOR_MAP: Record<string, string> = {
  '#1C1917': 'var(--color-text)',
  '#0F172A': 'var(--color-text)',
  '#78716C': 'var(--color-text-muted)',
  '#64748B': 'var(--color-text-muted)',
  '#44403C': 'var(--color-text)',
  '#334155': 'var(--color-text)',
  '#2563EB': 'var(--color-link)',
  '#FFFFFF': 'var(--color-button-primary-text)',
  '#F8FAFC': 'var(--color-text-inverse)',
  '#A8A29E': 'var(--color-text-muted)',
};

const LEGACY_BG_COLOR_MAP: Record<string, string> = {
  '#FFFFFF': 'var(--color-surface)',
  '#FAFAF9': 'var(--color-background)',
  '#F5F5F4': 'var(--color-surface-alt)',
  '#F1F5F9': 'var(--color-surface-alt)',
  '#2563EB': 'var(--color-button-primary-bg)',
  '#1C1917': 'var(--color-secondary)',
  '#0F172A': 'var(--color-secondary)',
};

const LEGACY_BORDER_COLOR_MAP: Record<string, string> = {
  '#E7E5E4': 'var(--color-border)',
  '#E2E8F0': 'var(--color-border)',
  '#F5F5F4': 'var(--color-divider)',
};

function migrateElementNodeTokens(node: ElementNode, isRoot = false): ElementNode {
  const styles = { ...(node.styles || {}) };

  if (isRoot) {
    // Root inherits page background/text from .portfolio-theme wrapper unless user set something custom
    if (
      styles.backgroundColor &&
      Object.values(THEMES).some((t) => t.colors.canvas.toUpperCase() === styles.backgroundColor?.toUpperCase())
    ) {
      delete styles.backgroundColor;
    }
    if (
      styles.textColor &&
      Object.values(THEMES).some((t) => t.colors.textPrimary.toUpperCase() === styles.textColor?.toUpperCase())
    ) {
      delete styles.textColor;
    }
  } else {
    if (styles.textColor) {
      const upper = styles.textColor.toUpperCase();
      if (node.type === 'heading' && (upper === '#1C1917' || upper === '#0F172A')) {
        styles.textColor = 'var(--color-heading)';
      } else if (node.type === 'button' && upper === '#FFFFFF') {
        styles.textColor = 'var(--color-button-primary-text)';
      } else if (node.type === 'button' && (upper === '#1C1917' || upper === '#0F172A')) {
        styles.textColor = 'var(--color-text)';
      } else if (LEGACY_TEXT_COLOR_MAP[upper]) {
        styles.textColor = LEGACY_TEXT_COLOR_MAP[upper];
      }
    }

    if (styles.backgroundColor) {
      const upper = styles.backgroundColor.toUpperCase();
      if (node.id === 'contact_section' && upper === '#1C1917') {
        styles.backgroundColor = 'var(--color-secondary)';
      } else if (node.id === 'cta_secondary' && upper === '#FFFFFF') {
        styles.backgroundColor = 'var(--color-button-secondary-bg)';
      } else if (LEGACY_BG_COLOR_MAP[upper]) {
        styles.backgroundColor = LEGACY_BG_COLOR_MAP[upper];
      }
    }

    if (styles.borderColor) {
      const upper = styles.borderColor.toUpperCase();
      if (LEGACY_BORDER_COLOR_MAP[upper]) {
        styles.borderColor = LEGACY_BORDER_COLOR_MAP[upper];
      }
    }
  }

  return {
    ...node,
    styles,
    children: node.children?.map((c) => migrateElementNodeTokens(c, false)),
  };
}

export function migrateSiteToThemeConfig(site: SiteDocument): SiteDocument {
  const baseTheme =
    THEMES.find((t) => t.id === (site.themeConfig?.themeId || site.activeThemeId)) || THEMES[0];

  if (site.themeConfig && site.themeConfig.schemaVersion >= 2) {
    return site;
  }

  return {
    ...site,
    activeThemeId: baseTheme.id,
    themeConfig: {
      schemaVersion: 2,
      themeId: baseTheme.id,
      themeVersion: baseTheme.version,
      colorOverrides: site.themeConfig?.colorOverrides || {},
      updatedAt: new Date().toISOString(),
    },
    pages: site.pages.map((p) => ({
      ...p,
      rootElement: migrateElementNodeTokens(p.rootElement, true),
    })),
  };
}

export const portfolioThemeRootStyle = (
  cssVars: Record<string, string>
): React.CSSProperties => ({
  ...(cssVars as React.CSSProperties),
  backgroundColor: 'var(--color-background)',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-body)',
});
