import { BREAKPOINTS } from '../config/breakpoints';
import {
  DeviceMode,
  ElementNode,
  ElementStyles,
  NonDefaultPseudoState,
  PageDocument,
  SiteDocument,
} from '../types/builder';
import { STYLE_PROP_TO_CSS } from './propertyCatalog';
import {
  resolvePseudoDeltaForBreakpoint,
  resolveStylesForBreakpoint,
} from './responsiveStyleModel';
import { resolvePageSlotComponent, isRegionVisibleOnDevice } from './componentLibraryService';
import { hasBalancedDelimiters } from './styleValidator';

const PSEUDO_STATES: NonDefaultPseudoState[] = [
  'hover',
  'focus',
  'focus-visible',
  'active',
  'disabled',
];

const ORDERED_STYLE_KEYS = Object.keys(STYLE_PROP_TO_CSS) as (keyof typeof STYLE_PROP_TO_CSS)[];

function escapeCssUrl(url: string): string {
  return url.replace(/"/g, '\\"');
}

function serializeStyleDeclarations(
  styles: Partial<ElementStyles>,
  options?: { isMobileFallbackNode?: ElementNode; isEditor?: boolean }
): string[] {
  const decls: string[] = [];

  for (const key of ORDERED_STYLE_KEYS) {
    const val = styles[key];
    if (val === undefined || val === '') continue;

    if (key === 'backgroundImage') {
      // Handled alongside backgroundGradient/backgroundLayers below
      continue;
    }

    if (key === 'lineClamp') {
      const n = String(val).trim();
      if (n && n !== 'none' && n !== '0') {
        decls.push('display: -webkit-box');
        decls.push('-webkit-box-orient: vertical');
        decls.push('overflow: hidden');
        decls.push(`-webkit-line-clamp: ${n}`);
      }
      continue;
    }

    const cssProp = STYLE_PROP_TO_CSS[key];
    decls.push(`${cssProp}: ${String(val).trim()}`);
  }

  // Combined background-image (layers / gradient / image URL)
  const bgLayers = styles.backgroundLayers?.trim();
  const bgGrad = styles.backgroundGradient?.trim();
  const bgImg = styles.backgroundImage?.trim();
  if (bgLayers) {
    decls.push(`background-image: ${bgLayers}`);
  } else if (bgGrad && bgImg) {
    decls.push(`background-image: ${bgGrad}, url("${escapeCssUrl(bgImg)}")`);
  } else if (bgGrad) {
    decls.push(`background-image: ${bgGrad}`);
  } else if (bgImg) {
    const formatted =
      /^url\(/i.test(bgImg) || /^(linear|radial|conic)-gradient\(/i.test(bgImg)
        ? bgImg
        : `url("${escapeCssUrl(bgImg)}")`;
    decls.push(`background-image: ${formatted}`);
  }

  // Automatic mobile-friendly collapse fallback when not explicitly overridden on mobile
  if (options?.isMobileFallbackNode) {
    const node = options.isMobileFallbackNode;
    const hasExplicitMobileGrid = Boolean(node.responsiveStyles?.mobile?.gridColumns);
    if (
      !hasExplicitMobileGrid &&
      styles.display === 'grid' &&
      styles.gridColumns &&
      (styles.gridColumns.includes(' ') || styles.gridColumns.includes('repeat('))
    ) {
      decls.push('grid-template-columns: 1fr');
    }

    if (
      styles.display === 'flex' &&
      styles.flexDirection === 'row' &&
      !node.responsiveStyles?.mobile?.flexWrap &&
      !styles.flexWrap
    ) {
      decls.push('flex-wrap: wrap');
    }
  }

  // Preserved raw / unknown CSS declarations
  if (styles.rawDeclarations) {
    Object.entries(styles.rawDeclarations).forEach(([prop, val]) => {
      const p = prop.trim();
      const v = String(val ?? '').trim();
      if (p && v && !/[{}]/.test(p) && !/[{}]/.test(v)) {
        decls.push(`${p}: ${v}`);
      }
    });
  }

  return decls;
}

export const SITE_CSS_SCOPE_ROOT = '.portfolio-site-surface';

export interface ExtractedEmbedAssets {
  bodyHtml: string;
  extractedCss: string;
  styleBlocks: string[];
  hadScript: boolean;
  hadExternalStylesheet: boolean;
}

/**
 * Extracts <style> blocks from Embedded HTML so they can be compiled & scoped safely
 * rather than injected raw into the global document. Optionally strips <script>,
 * external stylesheet <link>, and inline event attributes in Editor/Preview.
 */
export function extractEmbeddedHtmlAndCss(
  rawHtml: string | undefined,
  options?: { stripScripts?: boolean }
): ExtractedEmbedAssets {
  const input = rawHtml || '';
  if (!input.trim()) {
    return {
      bodyHtml: '',
      extractedCss: '',
      styleBlocks: [],
      hadScript: false,
      hadExternalStylesheet: false,
    };
  }

  const styleBlocks: string[] = [];
  let working = input.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_match, cssContent: string) => {
      const cleaned = (cssContent || '')
        .replace(/^\s*<!--/, '')
        .replace(/-->\s*$/, '')
        .trim();
      if (cleaned) styleBlocks.push(cleaned);
      return '';
    }
  );

  const hadScript = /<script\b/i.test(working) || /\son[a-z]+\s*=/i.test(working);
  const hadExternalStylesheet = /<link\b[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/i.test(
    working
  );

  if (options?.stripScripts !== false) {
    working = working
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<link\b[^>]*rel\s*=\s*["']?stylesheet["']?[^>]*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }

  return {
    bodyHtml: working.trim(),
    extractedCss: styleBlocks.join('\n\n'),
    styleBlocks,
    hadScript,
    hadExternalStylesheet,
  };
}

export interface BuildEmbedSrcDocOptions {
  embedId: string;
  htmlCode: string;
  themeMode: 'follow-theme' | 'independent';
  themeCssVars?: Record<string, string>;
}

/**
 * Builds an isolated HTML document for a sandboxed `<iframe sandbox="allow-scripts allow-forms">`
 * so HTML, <style> CSS, and <script> JS run exclusively inside the Custom HTML element
 * with zero leakage to other elements or the Page Builder UI.
 */
export function buildIsolatedEmbedSrcDoc({
  embedId,
  htmlCode,
  themeMode,
  themeCssVars,
}: BuildEmbedSrcDocOptions): string {
  const varsLines =
    themeMode === 'follow-theme' && themeCssVars
      ? Object.entries(themeCssVars)
          .map(([k, v]) => `  ${k}: ${v};`)
          .join('\n')
      : '';

  const baseCss =
    themeMode === 'follow-theme'
      ? `
:root {
${varsLines}
}
:where(*, *::before, *::after) { box-sizing: border-box; }
:where(html, body) {
  margin: 0;
  padding: 0;
  background: transparent;
  color: var(--color-text, #1c1917);
  font-family: var(--font-body, 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif);
}
:where(h1, h2, h3, h4, h5, h6) {
  color: var(--color-heading, var(--color-text, #1c1917));
  font-family: var(--font-display, var(--font-body, sans-serif));
}
:where(a) { color: var(--color-link, var(--color-primary, #2563eb)); }
:where(hr) { border-color: var(--color-divider, var(--color-border, #e7e5e4)); }
:where(code, pre) { font-family: var(--font-mono, monospace); }
`.trim()
      : `
:where(*, *::before, *::after) { box-sizing: border-box; }
:where(html, body) {
  margin: 0;
  padding: 0;
  background: transparent;
  color: #111827;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}
`.trim();

  const fontLink =
    themeMode === 'follow-theme'
      ? `<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Playfair+Display:wght@500;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />`
      : '';

  const headInject = `${fontLink}\n<style data-indy-embed-base="true">\n${baseCss}\n</style>`;

  const resizeScript = `<script data-indy-embed-bridge="true">
(function(){
  var id = ${JSON.stringify(embedId)};
  var lastH = 0;
  var burstCount = 0;
  var burstTimer = null;
  function measure() {
    var b = document.body;
    var d = document.documentElement;
    if (!b && !d) return 0;
    var bodyRectH = b ? Math.ceil(b.getBoundingClientRect().height) : 0;
    var bodyScrollH = b ? b.scrollHeight : 0;
    return Math.max(bodyRectH, bodyScrollH);
  }
  function send(fromResize) {
    try {
      if (fromResize) {
        burstCount++;
        if (burstCount > 12) return;
        clearTimeout(burstTimer);
        burstTimer = setTimeout(function(){ burstCount = 0; }, 400);
      }
      var h = measure();
      if (h > 0 && Math.abs(h - lastH) >= 2 && h <= 8000) {
        lastH = h;
        parent.postMessage({ type: 'indy-embed-resize', embedId: id, height: h }, '*');
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ send(false); });
  } else {
    send(false);
  }
  window.addEventListener('load', function(){ send(false); });
  window.addEventListener('resize', function(){ send(true); });
  if (typeof ResizeObserver !== 'undefined') {
    try {
      var ro = new ResizeObserver(function(){ send(true); });
      if (document.body) ro.observe(document.body);
      else if (document.documentElement) ro.observe(document.documentElement);
    } catch (e) {}
  }
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    try {
      new MutationObserver(function(){ burstCount = 0; send(false); }).observe(
        document.documentElement,
        { childList: true, subtree: true, attributes: true, characterData: true }
      );
    } catch (e) {}
  }
  setTimeout(function(){ send(false); }, 50);
  setTimeout(function(){ send(false); }, 250);
})();
</script>`;

  const raw = (htmlCode || '').trim();
  const isFullDoc = /<!doctype\s+html/i.test(raw) || /<html[\s>]/i.test(raw);

  if (isFullDoc) {
    let doc = raw;
    if (/<head[\s>]/i.test(doc)) {
      doc = doc.replace(/<head([^>]*)>/i, `<head$1>\n${headInject}`);
    } else if (/<html[\s>]/i.test(doc)) {
      doc = doc.replace(/<html([^>]*)>/i, `<html$1><head>${headInject}</head>`);
    } else {
      doc = `<head>${headInject}</head>${doc}`;
    }

    if (/<\/body>/i.test(doc)) {
      doc = doc.replace(/<\/body>/i, `${resizeScript}\n</body>`);
    } else {
      doc = `${doc}\n${resizeScript}`;
    }
    return doc;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${headInject}
</head>
<body>
${raw}
${resizeScript}
</body>
</html>`;
}

export interface ScopeCustomCssOptions {
  isEmbedBlock?: boolean;
  excludeEditorChrome?: boolean;
  blockImports?: boolean;
}

/**
 * Splits a CSS selector list by top-level commas (respecting parentheses, brackets, strings, and comments).
 */
function splitCssSelectors(selectorList: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inComment = false;

  for (let i = 0; i < selectorList.length; i++) {
    const ch = selectorList[i];
    const next = selectorList[i + 1];

    if (inComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += '/';
        inComment = false;
        i++;
      }
      continue;
    }

    if (!inSingle && !inDouble && ch === '/' && next === '*') {
      inComment = true;
      current += '/*';
      i++;
      continue;
    }

    if (ch === '\\') {
      current += ch + (next ?? '');
      i++;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }
    if (inSingle || inDouble) {
      current += ch;
      continue;
    }

    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

/**
 * Appends `:not([data-indy-editor-chrome]):not([data-indy-editor-chrome] *)` before any trailing pseudo-element
 * so user CSS rules never match editor chrome overlays inside the canvas.
 */
function appendChromeExclusion(selector: string): string {
  const exclusion = ':not([data-indy-editor-chrome]):not([data-indy-editor-chrome] *)';
  let parenDepth = 0;
  let bracketDepth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;

    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (parenDepth === 0 && bracketDepth === 0 && ch === ':') {
      const rest = selector.slice(i);
      if (
        rest.startsWith('::') ||
        /^:(before|after|first-line|first-letter)\b/i.test(rest)
      ) {
        return selector.slice(0, i) + exclusion + selector.slice(i);
      }
    }
  }

  return selector + exclusion;
}

/**
 * Replaces global document root tokens (`html`, `body`, `:root`) outside strings/brackets.
 */
function replaceGlobalRootTokens(selector: string, target: string): string {
  const replaced = selector
    .replace(/(^|[\s>+~])(?:html|body|:root)(?=$|[\s>+~.:[#])/gi, `$1${target}`)
    .trim();
  // Collapse redundant `target target` (e.g. `html body` -> `target`)
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return replaced.replace(new RegExp(`^${escaped}\\s+${escaped}(?=$|[\\s>+~.:[#])`), target);
}

/**
 * Checks whether a selector targets a class, ID, or attribute (or explicit &/:scope element selector)
 * rather than being a bare global tag / universal reset (e.g. `*`, `p`, `body`, `h1`).
 */
function hasExplicitClassIdOrAttr(selector: string): boolean {
  return /[.#[]|\[data-indy-el=/.test(selector);
}

/**
 * Scopes user Custom CSS strictly under `.portfolio-site-surface` (and optionally an element selector)
 * so custom styles never leak to the IndyShares Page Builder UI while allowing cross-element / parent / child
 * class & ID selectors inside the website.
 */
export function scopeCustomCss(
  rawCss: string | undefined,
  scopeRoot = SITE_CSS_SCOPE_ROOT,
  elementSelector?: string,
  options?: ScopeCustomCssOptions
): string {
  const input = (rawCss || '').trim();
  if (!input) return '';
  if (/javascript\s*:|expression\s*\(/i.test(input)) return '';
  if (!hasBalancedDelimiters(input).valid) return '';

  const isEmbedBlock = Boolean(options?.isEmbedBlock);
  const excludeEditorChrome = options?.excludeEditorChrome !== false;
  const blockImports = options?.blockImports !== false;

  // If element-level CSS has bare declarations with no '{', wrap inside elementSelector
  if (elementSelector && !input.includes('{') && !isEmbedBlock) {
    return `${scopeRoot} ${elementSelector} {\n  ${input}\n}`;
  }

  // Replace '&' or ':scope' inside element / embed custom CSS
  let working = input;
  if (elementSelector) {
    working = working.replace(/&/g, elementSelector).replace(/:scope\b/g, elementSelector);
  }

  let idx = 0;

  const readBalancedBody = (): string => {
    let body = '';
    let depth = 1;
    let inSingle = false;
    let inDouble = false;
    let inComment = false;

    while (idx < working.length && depth > 0) {
      const ch = working[idx++];
      const next = working[idx];

      if (inComment) {
        body += ch;
        if (ch === '*' && next === '/') {
          body += working[idx++];
          inComment = false;
        }
        continue;
      }

      if (!inSingle && !inDouble && ch === '/' && next === '*') {
        inComment = true;
        body += ch + working[idx++];
        continue;
      }

      if (ch === '\\') {
        body += ch + (working[idx++] ?? '');
        continue;
      }

      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        body += ch;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        body += ch;
        continue;
      }
      if (inSingle || inDouble) {
        body += ch;
        continue;
      }

      if (ch === '{') depth++;
      else if (ch === '}') depth--;

      if (depth > 0) body += ch;
    }
    return body;
  };

  const parseBlock = (inAtRule: boolean): string => {
    let out = '';
    while (idx < working.length) {
      while (idx < working.length && /\s/.test(working[idx])) {
        out += working[idx++];
      }
      if (idx >= working.length) break;
      if (working[idx] === '}') {
        idx++;
        return out;
      }

      // Preserve comments
      if (working[idx] === '/' && working[idx + 1] === '*') {
        const end = working.indexOf('*/', idx + 2);
        if (end === -1) {
          out += working.slice(idx);
          idx = working.length;
          break;
        }
        out += working.slice(idx, end + 2);
        idx = end + 2;
        continue;
      }

      // Read header up to '{' or ';' (respecting strings & comments)
      let header = '';
      let inSingle = false;
      let inDouble = false;
      while (idx < working.length) {
        const ch = working[idx];
        const next = working[idx + 1];
        if (!inSingle && !inDouble && ch === '/' && next === '*') {
          const end = working.indexOf('*/', idx + 2);
          if (end === -1) {
            idx = working.length;
            break;
          }
          idx = end + 2;
          continue;
        }
        if (ch === '\\') {
          header += ch + (next ?? '');
          idx += 2;
          continue;
        }
        if (ch === "'" && !inDouble) {
          inSingle = !inSingle;
          header += ch;
          idx++;
          continue;
        }
        if (ch === '"' && !inSingle) {
          inDouble = !inDouble;
          header += ch;
          idx++;
          continue;
        }
        if (!inSingle && !inDouble && (ch === '{' || ch === ';' || ch === '}')) {
          break;
        }
        header += ch;
        idx++;
      }

      if (idx >= working.length || working[idx] === '}') {
        if (working[idx] === '}') {
          idx++;
          return out;
        }
        break;
      }

      if (working[idx] === ';') {
        const trimmedStmt = header.trim();
        idx++;
        if (blockImports && /^@import\b/i.test(trimmedStmt)) {
          continue;
        }
        if (/^@(charset|namespace)\b/i.test(trimmedStmt)) {
          continue;
        }
        out += trimmedStmt + ';';
        continue;
      }

      // Found '{'
      idx++;
      const trimmedHeader = header.trim();
      if (/^@(keyframes|-webkit-keyframes|font-face|property)\b/i.test(trimmedHeader)) {
        const body = readBalancedBody();
        out += `${trimmedHeader} {${body}}`;
      } else if (/^@(media|supports|container|layer|scope)\b/i.test(trimmedHeader)) {
        const inner = parseBlock(true);
        if (inner.trim()) {
          out += `${trimmedHeader} {\n${inner}\n}`;
        }
      } else {
        const body = readBalancedBody();
        const scopedSelectors = splitCssSelectors(trimmedHeader)
          .map((sel) => {
            const s = sel.trim();
            if (!s) return '';

            let scoped = '';
            if (isEmbedBlock && elementSelector) {
              if (/^(html|body|:root)(\s+(html|body|:root))*$/i.test(s)) {
                scoped = `${scopeRoot} ${elementSelector}`;
              } else if (!hasExplicitClassIdOrAttr(s)) {
                // Bare universal or tag-only selector (e.g. `*`, `p`, `h1`, `div > span`)
                // inside an HTML embed is scoped to the embed container so snippet resets
                // don't wipe out unrelated Builder elements on the page.
                const normalized = replaceGlobalRootTokens(s, elementSelector);
                if (normalized === elementSelector || normalized.startsWith(`${elementSelector} `)) {
                  scoped = `${scopeRoot} ${normalized}`;
                } else {
                  scoped = `${scopeRoot} ${elementSelector} ${normalized}`;
                }
              } else {
                // Class, ID, or attribute selectors scope to the shared website surface,
                // enabling cross-element / parent / child / sibling targeting across the site.
                const withRoot = replaceGlobalRootTokens(s, scopeRoot);
                scoped = withRoot.startsWith(scopeRoot) ? withRoot : `${scopeRoot} ${withRoot}`;
              }
            } else {
              const withRoot = replaceGlobalRootTokens(s, scopeRoot);
              scoped = withRoot.startsWith(scopeRoot) ? withRoot : `${scopeRoot} ${withRoot}`;
            }

            if (excludeEditorChrome && scoped && scoped !== scopeRoot) {
              scoped = appendChromeExclusion(scoped);
            }
            return scoped;
          })
          .filter(Boolean)
          .join(', ');

        if (scopedSelectors) {
          out += `${inAtRule ? '  ' : ''}${scopedSelectors} {${body}}`;
        }
      }
    }
    return out;
  };

  return parseBlock(false).trim();
}

function collectNodesPreorder(root: ElementNode): ElementNode[] {
  const list: ElementNode[] = [];
  const walk = (n: ElementNode) => {
    list.push(n);
    n.children?.forEach(walk);
  };
  walk(root);
  return list;
}

const ANIMATION_KEYFRAMES_CSS = `
@keyframes indyFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes indySlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes indyScaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
`;

const EMBED_THEME_INTEGRATION_CSS = `
:where(${SITE_CSS_SCOPE_ROOT} [data-indy-embed-theme="follow"]) {
  color: var(--color-text, #1c1917);
  font-family: var(--font-body, 'Plus Jakarta Sans', sans-serif);
}
:where(${SITE_CSS_SCOPE_ROOT} [data-indy-embed-theme="follow"] :is(h1, h2, h3, h4, h5, h6)) {
  color: var(--color-heading, var(--color-text));
  font-family: var(--font-display, var(--font-body));
}
:where(${SITE_CSS_SCOPE_ROOT} [data-indy-embed-theme="follow"] a) {
  color: var(--color-link, var(--color-primary));
}
:where(${SITE_CSS_SCOPE_ROOT} [data-indy-embed-theme="follow"] hr) {
  border-color: var(--color-divider, var(--color-border));
}
:where(${SITE_CSS_SCOPE_ROOT} [data-indy-embed-theme="follow"] code) {
  font-family: var(--font-mono, monospace);
}
:where(${SITE_CSS_SCOPE_ROOT} [data-indy-embed-theme="independent"]) {
  color: #111827;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: normal;
  text-transform: none;
}
`.trim();

const INDEPENDENT_SURFACE_RESET_CSS = `
:where(${SITE_CSS_SCOPE_ROOT}) {
  color: #111827;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`.trim();

function buildMotionPresetRule(node: ElementNode, selector: string): string {
  const preset = node.advanced?.animation;
  if (!preset || preset === 'none') return '';
  if (preset === 'fade-in') {
    return `${selector} { animation: indyFadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }`;
  }
  if (preset === 'slide-up') {
    return `${selector} { animation: indySlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }`;
  }
  if (preset === 'scale-in') {
    return `${selector} { animation: indyScaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }`;
  }
  return '';
}

/**
 * Compiles deterministic scoped CSS for the simulated canvas or live preview modal
 * for a specific `deviceMode` (`desktop` | `tablet` | `mobile`).
 */
export function compilePreviewPageCss(
  page: PageDocument,
  site: SiteDocument,
  deviceMode: DeviceMode,
  options?: { isEditor?: boolean; reduceMotion?: boolean }
): string {
  const chunks: string[] = [ANIMATION_KEYFRAMES_CSS.trim()];
  chunks.push(
    `${SITE_CSS_SCOPE_ROOT} [data-indy-el] { box-sizing: border-box; }`
  );

  if (
    site.globalCssThemeMode === 'independent' ||
    page.customCssThemeMode === 'independent'
  ) {
    chunks.push(INDEPENDENT_SURFACE_RESET_CSS);
  }

  const headerResolved = resolvePageSlotComponent(page, site, 'header');
  const footerResolved = resolvePageSlotComponent(page, site, 'footer');
  const nodes: ElementNode[] = [
    ...(headerResolved.component ? collectNodesPreorder(headerResolved.component.rootElement) : []),
    ...collectNodesPreorder(page.rootElement),
    ...(footerResolved.component ? collectNodesPreorder(footerResolved.component.rootElement) : []),
  ];

  for (const node of nodes) {
    const baseSel = `${SITE_CSS_SCOPE_ROOT} [data-indy-el="${node.id}"]`;
    const resolved = resolveStylesForBreakpoint(node, deviceMode, 'default');
    const baseDecls = serializeStyleDeclarations(resolved, {
      isMobileFallbackNode: deviceMode === 'mobile' ? node : undefined,
      isEditor: options?.isEditor,
    });

    if (node.content?.stickyMode === 'sticky' && !resolved.position) {
      baseDecls.push('position: sticky', 'top: 0px', 'z-index: 40');
    } else if (node.content?.stickyMode === 'fixed' && !resolved.position) {
      baseDecls.push('position: sticky', 'top: 0px', 'z-index: 45');
    }

    if (baseDecls.length > 0) {
      chunks.push(`${baseSel} {\n  ${baseDecls.join(';\n  ')};\n}`);
    }

    if (node.type === 'image' && (resolved.objectFit || resolved.objectPosition)) {
      const imgDecls: string[] = [];
      if (resolved.objectFit) imgDecls.push(`object-fit: ${resolved.objectFit}`);
      if (resolved.objectPosition) imgDecls.push(`object-position: ${resolved.objectPosition}`);
      chunks.push(`${baseSel} > img {\n  ${imgDecls.join(';\n  ')};\n}`);
    }

    const motionRule = buildMotionPresetRule(node, baseSel);
    if (motionRule) chunks.push(motionRule);

    // Pseudo-states (:hover, :focus, :focus-visible, :active, :disabled)
    for (const pseudo of PSEUDO_STATES) {
      const pStyles = resolvePseudoDeltaForBreakpoint(node, deviceMode, pseudo);
      const pDecls = serializeStyleDeclarations(pStyles);
      if (pDecls.length > 0) {
        chunks.push(`${baseSel}:${pseudo} {\n  ${pDecls.join(';\n  ')};\n}`);
      }
    }

    // Element-scoped custom CSS
    if (node.advanced?.customCss) {
      const scopedElCss = scopeCustomCss(
        node.advanced.customCss,
        SITE_CSS_SCOPE_ROOT,
        `[data-indy-el="${node.id}"]`,
        { excludeEditorChrome: true, blockImports: true }
      );
      if (scopedElCss) chunks.push(scopedElCss);
    }
  }

  // Region-level responsive visibility in preview / simulated viewport
  if (
    headerResolved.component &&
    !isRegionVisibleOnDevice(headerResolved.responsiveVisibility, deviceMode)
  ) {
    chunks.push(
      `${SITE_CSS_SCOPE_ROOT} [data-indy-el="${headerResolved.component.rootElement.id}"] { display: none; }`
    );
  }
  if (
    footerResolved.component &&
    !isRegionVisibleOnDevice(footerResolved.responsiveVisibility, deviceMode)
  ) {
    chunks.push(
      `${SITE_CSS_SCOPE_ROOT} [data-indy-el="${footerResolved.component.rootElement.id}"] { display: none; }`
    );
  }

  // Site & Page Custom CSS
  if (site.globalCss) {
    const scopedSite = scopeCustomCss(site.globalCss, SITE_CSS_SCOPE_ROOT, undefined, {
      excludeEditorChrome: true,
      blockImports: true,
    });
    if (scopedSite) chunks.push(scopedSite);
  }
  if (page.customCss) {
    const scopedPage = scopeCustomCss(page.customCss, SITE_CSS_SCOPE_ROOT, undefined, {
      excludeEditorChrome: true,
      blockImports: true,
    });
    if (scopedPage) chunks.push(scopedPage);
  }

  if (options?.reduceMotion) {
    chunks.push(
      `${SITE_CSS_SCOPE_ROOT} [data-indy-el] { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }`
    );
  } else {
    chunks.push(
      `@media (prefers-reduced-motion: reduce) {\n  ${SITE_CSS_SCOPE_ROOT} [data-indy-el] { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }\n}`
    );
  }

  return chunks.join('\n\n').replace(/<\/style/gi, '<\\/style');
}

/**
 * Compiles deterministic, responsive @media-query CSS for published/exported static pages
 * matching the canonical breakpoints in src/config/breakpoints.ts.
 */
export function compilePublishedPageCss(page: PageDocument, site: SiteDocument): string {
  const chunks: string[] = [ANIMATION_KEYFRAMES_CSS.trim()];
  chunks.push(`${SITE_CSS_SCOPE_ROOT} [data-indy-el] { box-sizing: border-box; }`);
  chunks.push(EMBED_THEME_INTEGRATION_CSS);

  if (
    site.globalCssThemeMode === 'independent' ||
    page.customCssThemeMode === 'independent'
  ) {
    chunks.push(INDEPENDENT_SURFACE_RESET_CSS);
  }

  const headerResolved = resolvePageSlotComponent(page, site, 'header');
  const footerResolved = resolvePageSlotComponent(page, site, 'footer');
  const nodes: ElementNode[] = [
    ...(headerResolved.component ? collectNodesPreorder(headerResolved.component.rootElement) : []),
    ...collectNodesPreorder(page.rootElement),
    ...(footerResolved.component ? collectNodesPreorder(footerResolved.component.rootElement) : []),
  ];
  const tabletRules: string[] = [];
  const mobileRules: string[] = [];
  const desktopHideRules: string[] = [];
  const tabletHideRules: string[] = [];
  const mobileHideRules: string[] = [];

  for (const node of nodes) {
    const baseSel = `${SITE_CSS_SCOPE_ROOT} [data-indy-el="${node.id}"]`;

    // 1. Desktop (Base)
    const desktopStyles = node.styles || {};
    const desktopDecls = serializeStyleDeclarations(desktopStyles);
    if (node.content?.stickyMode === 'sticky' && !desktopStyles.position) {
      desktopDecls.push('position: sticky', 'top: 0px', 'z-index: 40');
    } else if (node.content?.stickyMode === 'fixed' && !desktopStyles.position) {
      desktopDecls.push('position: fixed', 'top: 0px', 'left: 0px', 'right: 0px', 'z-index: 45');
    }
    if (desktopDecls.length > 0) {
      chunks.push(`${baseSel} {\n  ${desktopDecls.join(';\n  ')};\n}`);
    }
    if (node.type === 'image' && (desktopStyles.objectFit || desktopStyles.objectPosition)) {
      const imgDecls: string[] = [];
      if (desktopStyles.objectFit) imgDecls.push(`object-fit: ${desktopStyles.objectFit}`);
      if (desktopStyles.objectPosition) imgDecls.push(`object-position: ${desktopStyles.objectPosition}`);
      chunks.push(`${baseSel} > img {\n  ${imgDecls.join(';\n  ')};\n}`);
    }
    const motionRule = buildMotionPresetRule(node, baseSel);
    if (motionRule) chunks.push(motionRule);

    for (const pseudo of PSEUDO_STATES) {
      const pStyles = node.pseudoStyles?.[pseudo];
      if (pStyles) {
        const pDecls = serializeStyleDeclarations(pStyles);
        if (pDecls.length > 0) {
          chunks.push(`${baseSel}:${pseudo} {\n  ${pDecls.join(';\n  ')};\n}`);
        }
      }
    }

    // 2. Tablet overrides (<= 1023px)
    const tabletStyles = node.responsiveStyles?.tablet;
    if (tabletStyles) {
      const tDecls = serializeStyleDeclarations(tabletStyles);
      if (tDecls.length > 0) {
        tabletRules.push(`  ${baseSel} { ${tDecls.join('; ')}; }`);
      }
    }
    for (const pseudo of PSEUDO_STATES) {
      const tpStyles = node.responsivePseudoStyles?.tablet?.[pseudo];
      if (tpStyles) {
        const tpDecls = serializeStyleDeclarations(tpStyles);
        if (tpDecls.length > 0) {
          tabletRules.push(`  ${baseSel}:${pseudo} { ${tpDecls.join('; ')}; }`);
        }
      }
    }

    // 3. Mobile overrides (<= 767px)
    const mobileResolved = resolveStylesForBreakpoint(node, 'mobile', 'default');
    const mobileExplicit = node.responsiveStyles?.mobile || {};
    const autoMobileDecls: string[] = [];
    if (
      !mobileExplicit.gridColumns &&
      mobileResolved.display === 'grid' &&
      mobileResolved.gridColumns &&
      (mobileResolved.gridColumns.includes(' ') || mobileResolved.gridColumns.includes('repeat('))
    ) {
      autoMobileDecls.push('grid-template-columns: 1fr');
    }
    if (
      mobileResolved.display === 'flex' &&
      mobileResolved.flexDirection === 'row' &&
      !mobileExplicit.flexWrap &&
      !mobileResolved.flexWrap
    ) {
      autoMobileDecls.push('flex-wrap: wrap');
    }

    const mDecls = [...serializeStyleDeclarations(mobileExplicit), ...autoMobileDecls];
    if (mDecls.length > 0) {
      mobileRules.push(`  ${baseSel} { ${mDecls.join('; ')}; }`);
    }
    for (const pseudo of PSEUDO_STATES) {
      const mpStyles = node.responsivePseudoStyles?.mobile?.[pseudo];
      if (mpStyles) {
        const mpDecls = serializeStyleDeclarations(mpStyles);
        if (mpDecls.length > 0) {
          mobileRules.push(`  ${baseSel}:${pseudo} { ${mpDecls.join('; ')}; }`);
        }
      }
    }

    // 4. Responsive visibility
    if (node.hidden) {
      chunks.push(`${baseSel} { display: none; }`);
    } else {
      if (node.advanced?.hideOnDesktop) desktopHideRules.push(`  ${baseSel} { display: none; }`);
      if (node.advanced?.hideOnTablet) tabletHideRules.push(`  ${baseSel} { display: none; }`);
      if (node.advanced?.hideOnMobile) mobileHideRules.push(`  ${baseSel} { display: none; }`);
    }

    if (node.advanced?.customCss) {
      const scopedElCss = scopeCustomCss(
        node.advanced.customCss,
        SITE_CSS_SCOPE_ROOT,
        `[data-indy-el="${node.id}"]`,
        { excludeEditorChrome: false, blockImports: false }
      );
      if (scopedElCss) chunks.push(scopedElCss);
    }
  }

  // Region responsive visibility for published build
  [headerResolved, footerResolved].forEach((slotRes) => {
    if (!slotRes.component) return;
    const sel = `${SITE_CSS_SCOPE_ROOT} [data-indy-el="${slotRes.component.rootElement.id}"]`;
    if (slotRes.responsiveVisibility.desktop === false) {
      desktopHideRules.push(`  ${sel} { display: none; }`);
    }
    if (slotRes.responsiveVisibility.tablet === false) {
      tabletHideRules.push(`  ${sel} { display: none; }`);
    }
    if (slotRes.responsiveVisibility.mobile === false) {
      mobileHideRules.push(`  ${sel} { display: none; }`);
    }
  });

  const tabletMax = BREAKPOINTS.tablet.max ?? 1023;
  const tabletMin = BREAKPOINTS.tablet.min ?? 768;
  const mobileMax = BREAKPOINTS.mobile.max ?? 767;
  const desktopMin = BREAKPOINTS.desktop.min ?? 1024;

  if (tabletRules.length > 0) {
    chunks.push(`@media (max-width: ${tabletMax}px) {\n${tabletRules.join('\n')}\n}`);
  }
  if (mobileRules.length > 0) {
    chunks.push(`@media (max-width: ${mobileMax}px) {\n${mobileRules.join('\n')}\n}`);
  }
  if (desktopHideRules.length > 0) {
    chunks.push(`@media (min-width: ${desktopMin}px) {\n${desktopHideRules.join('\n')}\n}`);
  }
  if (tabletHideRules.length > 0) {
    chunks.push(
      `@media (min-width: ${tabletMin}px) and (max-width: ${tabletMax}px) {\n${tabletHideRules.join('\n')}\n}`
    );
  }
  if (mobileHideRules.length > 0) {
    chunks.push(`@media (max-width: ${mobileMax}px) {\n${mobileHideRules.join('\n')}\n}`);
  }

  if (site.globalCss) {
    const scopedSite = scopeCustomCss(site.globalCss, SITE_CSS_SCOPE_ROOT, undefined, {
      excludeEditorChrome: false,
      blockImports: false,
    });
    if (scopedSite) chunks.push(scopedSite);
  }
  if (page.customCss) {
    const scopedPage = scopeCustomCss(page.customCss, SITE_CSS_SCOPE_ROOT, undefined, {
      excludeEditorChrome: false,
      blockImports: false,
    });
    if (scopedPage) chunks.push(scopedPage);
  }

  chunks.push(
    `@media (prefers-reduced-motion: reduce) {\n  ${SITE_CSS_SCOPE_ROOT} [data-indy-el] { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }\n}`
  );

  return chunks.join('\n\n').replace(/<\/style/gi, '<\\/style');
}
