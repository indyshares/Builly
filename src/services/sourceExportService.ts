import {
  ElementNode,
  GoogleWorkspaceState,
  PageDocument,
  SiteDocument,
} from '../types/builder';
import { sanitizeSvgMarkup } from './assetService';
import { compilerService, getDefaultPublishPageIds } from './compilerService';
import { buildIsolatedEmbedSrcDoc } from './cssCompiler';
import {
  buildStaticBuillyAttributionCss,
  buildStaticBuillyAttributionHtml,
} from '../components/common/BuillyMadeWithBadge';
import {
  buildPublishedRuntimeSnapshot,
  CompiledRuntimePage,
  PublicCmsSnapshot,
  PublishedRuntimeSnapshot,
} from './runtime/publishedSnapshotContract';

export interface ZipEntryInput {
  path: string;
  content: string | Uint8Array;
}

export interface ExportManifest {
  exporter: 'builly-on-demand-source-export';
  exportSchemaVersion: number;
  siteSlug: string;
  siteName: string;
  publishVersion: string;
  buildId: string;
  exportedAt: string;
  pages: Array<{
    pageId: string;
    name: string;
    fullPath: string;
    htmlFile: string;
    cssFile: string;
  }>;
  assets: string[];
  runtimeDependentFeatures: string[];
}

export interface SiteSourceExportResult {
  fileName: string;
  zipBytes: Uint8Array;
  filePaths: string[];
  manifest: ExportManifest;
  snapshot: PublishedRuntimeSnapshot;
}

// ─── Pure TypeScript IEEE 802.3 CRC-32 + STORE PKZIP Builder ────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const textEncoder = new TextEncoder();

export function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanPath = entry.path.replace(/^\/+/, '');
    const nameBytes = textEncoder.encode(cleanPath);
    const rawBytes =
      typeof entry.content === 'string' ? textEncoder.encode(entry.content) : entry.content;
    const sum = crc32(rawBytes);

    // Local file header (30 bytes + name + data)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // STORE (0)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x5421, true); // mod date
    lv.setUint32(14, sum, true);
    lv.setUint32(18, rawBytes.length, true);
    lv.setUint32(22, rawBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, rawBytes);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, sum, true);
    cv.setUint32(20, rawBytes.length, true);
    cv.setUint32(24, rawBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + rawBytes.length;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);
  return output;
}

// ─── HTML / CSS / Asset Helpers ─────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHref(rawUrl?: string): string {
  const val = (rawUrl || '#').trim();
  if (!val) return '#';
  if (/^(javascript|vbscript|data:text\/html):/i.test(val)) return '#';
  return val;
}

function pageSlugFileKey(page: CompiledRuntimePage): string {
  if (page.isHome || page.fullPath === '/') return 'home';
  return (
    page.fullPath
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^a-zA-Z0-9/_-]+/g, '-')
      .replace(/\//g, '__') || page.id
  );
}

function pageHtmlRelativePath(page: CompiledRuntimePage): string {
  if (page.isHome || page.fullPath === '/') return 'index.html';
  return `pages/${pageSlugFileKey(page)}.html`;
}

function mapSiteRouteToExportHref(
  rawUrl: string | undefined,
  fromHtmlPath: string,
  routeToHtmlMap: Map<string, string>
): string {
  const safe = sanitizeHref(rawUrl);
  if (!safe.startsWith('/') || safe.startsWith('//')) return safe;
  const targetHtml = routeToHtmlMap.get(safe);
  if (!targetHtml) return safe;
  if (fromHtmlPath === 'index.html') {
    return targetHtml === 'index.html' ? './index.html' : `./${targetHtml}`;
  }
  return targetHtml === 'index.html' ? '../index.html' : `../${targetHtml}`;
}

interface DataUriAssetCollector {
  files: Map<string, Uint8Array>;
  rewriteSrc: (src: string, hintName?: string) => string;
}

function decodeBase64Bytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const bin = atob(cleaned);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return Uint8Array.from(Buffer.from(cleaned, 'base64'));
}

function createAssetCollector(fromHtmlPath: string): DataUriAssetCollector {
  const files = new Map<string, Uint8Array>();
  const urlToAssetPath = new Map<string, string>();
  let index = 1;

  const prefix = fromHtmlPath === 'index.html' ? './' : '../';

  const rewriteSrc = (rawSrc: string, hintName?: string): string => {
    const src = (rawSrc || '').trim();
    if (!src) return '';
    if (!src.startsWith('data:image/')) return src;

    const existing = urlToAssetPath.get(src);
    if (existing) return `${prefix}${existing}`;

    const match = src.match(/^data:image\/([a-zA-Z0-9+.-]+)(;base64)?,([\s\S]*)$/);
    if (!match) return src;
    const rawSub = match[1].toLowerCase();
    const ext = rawSub.includes('svg') ? 'svg' : rawSub.replace(/[^a-z0-9]/g, '') || 'png';
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || '';
    const safeHint = (hintName || `asset-${index++}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    const relPath = `assets/${safeHint || `asset-${index++}`}.${ext}`;

    try {
      const bytes = isBase64
        ? decodeBase64Bytes(payload)
        : textEncoder.encode(decodeURIComponent(payload));
      files.set(relPath, bytes);
      urlToAssetPath.set(src, relPath);
      return `${prefix}${relPath}`;
    } catch {
      return src;
    }
  };

  return { files, rewriteSrc };
}

function renderStaticCmsWidget(
  node: ElementNode,
  cms: PublicCmsSnapshot | undefined
): string {
  if (!cms) {
    return `<div data-indy-cms-widget="${escapeHtml(node.type)}"></div>`;
  }
  const typeId =
    node.content?.cmsQuery?.contentTypeId ||
    node.content?.repeaterCollection ||
    cms.contentTypes[0]?.id;
  const maxItems = node.content?.cmsQuery?.limit || node.content?.repeaterLimit || 6;
  const records = cms.records
    .filter((r) => (!typeId || r.contentTypeId === typeId) && r.status === 'published')
    .slice(0, maxItems);

  if (node.type === 'content-counter') {
    return `<div data-indy-el="${escapeHtml(node.id)}"><strong>${records.length}</strong></div>`;
  }

  if (records.length === 0) {
    return `<div data-indy-el="${escapeHtml(node.id)}" data-indy-cms-widget="${escapeHtml(node.type)}"></div>`;
  }

  const cards = records
    .map((rec) => {
      const f = rec.fields || {};
      const title = String(rec.title || f.title || f.name || rec.slug || 'Entry');
      const excerpt = String(f.excerpt || f.summary || f.description || '');
      return `<article class="builly-cms-card"><h3>${escapeHtml(title)}</h3>${
        excerpt ? `<p>${escapeHtml(excerpt)}</p>` : ''
      }</article>`;
    })
    .join('\n');

  return `<div data-indy-el="${escapeHtml(node.id)}" data-indy-cms-widget="${escapeHtml(node.type)}" class="builly-cms-grid">${cards}</div>`;
}

function renderNodeToExportHtml(
  node: ElementNode,
  context: {
    fromHtmlPath: string;
    routeToHtmlMap: Map<string, string>;
    themeCssVars: Record<string, string>;
    publicCms?: PublicCmsSnapshot;
    rewriteSrc: (src: string, hintName?: string) => string;
  }
): string {
  const attrs = [
    `data-indy-el="${escapeHtml(node.id)}"`,
    node.advanced?.htmlId || node.htmlId
      ? `id="${escapeHtml(node.advanced?.htmlId || node.htmlId || '')}"`
      : '',
    node.advanced?.ariaLabel ? `aria-label="${escapeHtml(node.advanced.ariaLabel)}"` : '',
    node.advanced?.role ? `role="${escapeHtml(node.advanced.role)}"` : '',
    node.advanced?.customClasses ? `class="${escapeHtml(node.advanced.customClasses)}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const currentYear = String(new Date().getFullYear());
  const formatText = (val?: string) => (val || '').replace(/\{year\}/g, currentYear);

  if (node.type === 'heading') {
    const tag = node.content?.headingLevel || 'h2';
    return `<${tag} ${attrs}>${escapeHtml(formatText(node.content?.text))}</${tag}>`;
  }
  if (node.type === 'text' || node.type === 'rich-text') {
    return `<p ${attrs}>${escapeHtml(formatText(node.content?.text))}</p>`;
  }
  if (node.type === 'label') {
    return `<span ${attrs}>${escapeHtml(formatText(node.content?.text))}</span>`;
  }
  if (node.type === 'button' || node.type === 'link' || node.type === 'anchor-link') {
    const href = escapeHtml(
      mapSiteRouteToExportHref(node.content?.url, context.fromHtmlPath, context.routeToHtmlMap)
    );
    const target = node.content?.targetBlank ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a ${attrs} href="${href}"${target}>${escapeHtml(node.content?.text || '')}</a>`;
  }
  if (node.type === 'list') {
    const tag = node.content?.orderedList ? 'ol' : 'ul';
    const items = (node.content?.items || [])
      .map((i) => `<li>${escapeHtml(i.title)}</li>`)
      .join('');
    return `<${tag} ${attrs}>${items}</${tag}>`;
  }
  if (node.type === 'blockquote') {
    return `<blockquote ${attrs}><p>${escapeHtml(node.content?.text || '')}</p>${
      node.content?.caption ? `<footer>— ${escapeHtml(node.content.caption)}</footer>` : ''
    }</blockquote>`;
  }
  if (node.type === 'code') {
    return `<pre ${attrs}><code>${escapeHtml(node.content?.text || '')}</code></pre>`;
  }
  if (node.type === 'logo') {
    const href = escapeHtml(
      mapSiteRouteToExportHref(node.content?.url || '/', context.fromHtmlPath, context.routeToHtmlMap)
    );
    return `<a ${attrs} href="${href}"><strong>${escapeHtml(node.content?.logoText || node.name)}</strong></a>`;
  }
  if (
    node.type === 'navbar' ||
    node.type === 'nav-menu' ||
    node.type === 'breadcrumbs' ||
    node.type === 'pagination' ||
    node.type === 'social-links'
  ) {
    const linksHtml = (node.content?.navLinks || [])
      .map((l) => {
        const mapped = mapSiteRouteToExportHref(l.url, context.fromHtmlPath, context.routeToHtmlMap);
        return `<a href="${escapeHtml(mapped)}">${escapeHtml(l.label)}</a>`;
      })
      .join('');
    const brandHtml =
      node.type === 'navbar'
        ? `<a href="${escapeHtml(
            mapSiteRouteToExportHref('/', context.fromHtmlPath, context.routeToHtmlMap)
          )}"><strong>${escapeHtml(node.content?.logoText || '')}</strong></a>`
        : '';
    const ctaHtml =
      node.type === 'navbar' && node.content?.ctaLabel
        ? `<a class="builly-nav-cta" href="${escapeHtml(
            mapSiteRouteToExportHref(
              node.content.ctaUrl || '/contact',
              context.fromHtmlPath,
              context.routeToHtmlMap
            )
          )}">${escapeHtml(node.content.ctaLabel)}</a>`
        : '';
    const toggleBtn =
      node.type === 'navbar'
        ? `<button type="button" class="builly-nav-toggle" data-builly-nav-toggle aria-expanded="false" aria-label="Toggle Menu">☰</button>`
        : '';
    return `<nav ${attrs} data-builly-nav>${brandHtml}${toggleBtn}<div class="builly-nav-links" data-builly-nav-links>${linksHtml}</div>${ctaHtml}</nav>`;
  }
  if (node.type === 'tabs') {
    const items = node.content?.items || [];
    const btns = items
      .map(
        (item, idx) =>
          `<button type="button" class="builly-tab-btn${idx === 0 ? ' is-active' : ''}" data-builly-tab-trigger="${idx}">${escapeHtml(item.title)}</button>`
      )
      .join('');
    const panels = items
      .map(
        (item, idx) =>
          `<div class="builly-tab-panel${idx === 0 ? ' is-active' : ''}" data-builly-tab-panel="${idx}">${escapeHtml(item.description || item.title)}</div>`
      )
      .join('');
    return `<div ${attrs} data-builly-tabs><div class="builly-tab-list">${btns}</div>${panels}</div>`;
  }
  if (node.type === 'accordion') {
    const items = node.content?.items || [];
    const rows = items
      .map(
        (item, idx) =>
          `<div class="builly-acc-item" data-builly-acc-item><button type="button" class="builly-acc-trigger" data-builly-acc-trigger aria-expanded="${
            idx === 0 ? 'true' : 'false'
          }">${escapeHtml(item.title)}</button><div class="builly-acc-body"${
            idx === 0 ? '' : ' hidden'
          }>${escapeHtml(item.description || '')}</div></div>`
      )
      .join('');
    return `<div ${attrs} data-builly-accordion>${rows}</div>`;
  }
  if (node.type === 'image') {
    const src = escapeHtml(context.rewriteSrc(node.content?.imageSrc || '', node.name));
    const alt = escapeHtml(node.content?.imageAlt || node.name);
    return `<div ${attrs}><img src="${src}" alt="${alt}" loading="lazy" /></div>`;
  }
  if (node.type === 'svg-graphic') {
    const check = sanitizeSvgMarkup(node.content?.svgMarkup || '');
    return `<div ${attrs}>${check.valid && check.sanitized ? check.sanitized : ''}</div>`;
  }
  if (node.type === 'html-embed') {
    const rawHtmlCode = node.content?.htmlCode || '';
    if (!rawHtmlCode.trim()) return `<div ${attrs}></div>`;
    const srcDoc = buildIsolatedEmbedSrcDoc({
      embedId: node.id,
      htmlCode: rawHtmlCode,
      themeMode: node.content?.embedThemeMode || 'follow-theme',
      themeCssVars: context.themeCssVars,
    });
    return `<div ${attrs}><iframe title="${escapeHtml(node.name)}" data-indy-embed-id="${escapeHtml(
      node.id
    )}" sandbox="allow-scripts allow-forms" srcdoc="${escapeHtml(
      srcDoc
    )}" style="width:100%;min-height:120px;border:0;display:block;"></iframe></div>`;
  }
  if (node.type === 'data-table') {
    const cols = node.content?.tableColumns || [];
    const rows = node.content?.tableRows || [];
    const head = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody>`;
    return `<div ${attrs}><table>${head}${body}</table></div>`;
  }
  if (node.type === 'form' || node.type === 'contact-form' || node.type === 'newsletter-form') {
    return `<form ${attrs} data-builly-static-form><p class="builly-static-notice">Form submission requires Builly Shared Runtime or your own form endpoint (action attribute).</p><button type="submit">${escapeHtml(
      node.content?.newsletterButtonLabel || node.content?.text || 'Submit'
    )}</button></form>`;
  }
  if (
    node.type === 'post-grid' ||
    node.type === 'post-list' ||
    node.type === 'related-content' ||
    node.type === 'post-carousel' ||
    node.type === 'post-slider' ||
    node.type === 'slide-carousel' ||
    node.type === 'custom-carousel' ||
    node.type === 'media-carousel' ||
    node.type === 'taxonomy-list' ||
    node.type === 'taxonomy-filter' ||
    node.type === 'content-counter' ||
    node.type === 'cms-pagination'
  ) {
    return renderStaticCmsWidget(node, context.publicCms);
  }

  const tag = node.tag || 'div';
  const childrenHtml = (node.children || [])
    .map((c) => renderNodeToExportHtml(c, context))
    .join('\n');
  return `<${tag} ${attrs}>${childrenHtml}</${tag}>`;
}

const RESET_CSS = `*, *::before, *::after { box-sizing: border-box; }
html { line-height: 1.5; -webkit-text-size-adjust: 100%; }
body { margin: 0; padding: 0; min-height: 100vh; }
img, svg, video, canvas { display: block; max-width: 100%; }
img { height: auto; }
button, input, select, textarea { font: inherit; }
`;

const GLOBAL_CSS = `body.portfolio-theme {
  margin: 0;
  background-color: var(--color-background, #ffffff);
  color: var(--color-text, #1e293b);
  font-family: var(--font-body, system-ui, sans-serif);
}
.portfolio-heading {
  color: var(--color-heading, #0f172a);
  font-family: var(--font-display, system-ui, sans-serif);
}
.builly-nav-links { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.builly-nav-links a { text-decoration: none; color: inherit; }
.builly-nav-cta { padding: 8px 14px; background: var(--color-button-primary-bg, #0f172a); color: var(--color-button-primary-text, #ffffff); border-radius: var(--theme-radius, 8px); text-decoration: none; }
.builly-nav-toggle { display: none; background: transparent; border: 1px solid currentColor; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
@media (max-width: 767px) {
  .builly-nav-toggle { display: inline-flex; align-items: center; }
  .builly-nav-links { display: none; width: 100%; flex-direction: column; align-items: flex-start; padding-top: 8px; }
  .builly-nav-links.is-open { display: flex; }
}
.builly-tab-list { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.builly-tab-btn { padding: 6px 12px; border: 1px solid var(--color-border, #cbd5e1); background: transparent; cursor: pointer; border-radius: 6px; }
.builly-tab-btn.is-active { background: var(--color-primary, #0f172a); color: #ffffff; border-color: transparent; }
.builly-tab-panel { display: none; }
.builly-tab-panel.is-active { display: block; }
.builly-acc-item { border-bottom: 1px solid var(--color-border, #e2e8f0); padding: 10px 0; }
.builly-acc-trigger { width: 100%; text-align: left; font-weight: 600; background: transparent; border: 0; cursor: pointer; padding: 4px 0; }
.builly-cms-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.builly-cms-card { padding: 16px; border: 1px solid var(--color-border, #e2e8f0); border-radius: var(--theme-radius, 8px); }
.builly-static-notice { font-size: 12px; opacity: 0.75; }
`;

const MAIN_JS = `(function () {
  document.addEventListener('click', function (e) {
    var navToggle = e.target.closest('[data-builly-nav-toggle]');
    if (navToggle) {
      var nav = navToggle.closest('[data-builly-nav]');
      var links = nav && nav.querySelector('[data-builly-nav-links]');
      if (links) {
        var next = !links.classList.contains('is-open');
        links.classList.toggle('is-open', next);
        navToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
      }
      return;
    }

    var tabBtn = e.target.closest('[data-builly-tab-trigger]');
    if (tabBtn) {
      var tabsRoot = tabBtn.closest('[data-builly-tabs]');
      var idx = tabBtn.getAttribute('data-builly-tab-trigger');
      if (tabsRoot && idx !== null) {
        tabsRoot.querySelectorAll('[data-builly-tab-trigger]').forEach(function (el) {
          el.classList.toggle('is-active', el.getAttribute('data-builly-tab-trigger') === idx);
        });
        tabsRoot.querySelectorAll('[data-builly-tab-panel]').forEach(function (el) {
          el.classList.toggle('is-active', el.getAttribute('data-builly-tab-panel') === idx);
        });
      }
      return;
    }

    var accBtn = e.target.closest('[data-builly-acc-trigger]');
    if (accBtn) {
      var item = accBtn.closest('[data-builly-acc-item]');
      var body = item && item.querySelector('.builly-acc-body');
      if (body) {
        var expanded = accBtn.getAttribute('aria-expanded') === 'true';
        accBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        body.hidden = expanded;
      }
    }
  });

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'indy-embed-resize' || !d.embedId || typeof d.height !== 'number') return;
    var frames = document.querySelectorAll('iframe[data-indy-embed-id]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source && frames[i].getAttribute('data-indy-embed-id') === d.embedId) {
        frames[i].style.height = Math.max(32, Math.min(8000, Math.ceil(d.height))) + 'px';
      }
    }
  });
})();
`;

export function generateSiteSourceZip(params: {
  site: SiteDocument;
  workspace: GoogleWorkspaceState;
  includeDraftPages?: boolean;
}): SiteSourceExportResult {
  const { site, workspace, includeDraftPages = false } = params;

  const selectedPageIds = includeDraftPages
    ? site.pages
        .filter((p) => p.status !== 'archived' && p.status !== 'unpublished')
        .map((p) => p.id)
    : getDefaultPublishPageIds(site);

  const syntheticRelease = compilerService.compileRelease(
    site,
    workspace,
    'On-demand source export',
    selectedPageIds
  );

  const snapshot = buildPublishedRuntimeSnapshot({
    site,
    release: syntheticRelease,
    workspace,
  });

  const pagesList = Object.values(snapshot.pages);
  const routeToHtmlMap = new Map<string, string>();
  pagesList.forEach((p) => {
    routeToHtmlMap.set(p.fullPath, pageHtmlRelativePath(p));
  });

  const entries: ZipEntryInput[] = [];
  const assetFiles = new Map<string, Uint8Array>();
  const exportedPagesManifest: ExportManifest['pages'] = [];
  const runtimeFeatures = new Set<string>();

  if (Object.keys(snapshot.publicForms).length > 0) {
    runtimeFeatures.add('Public form submissions (Builly Worker + partitioned Inbox Sheet)');
  }
  if ((snapshot.publicCms?.records.length || 0) > 0) {
    runtimeFeatures.add('Live CMS dataset pagination/search (pre-rendered statically at export time)');
  }

  entries.push({ path: 'styles/reset.css', content: RESET_CSS });
  entries.push({
    path: 'styles/variables.css',
    content: snapshot.themeCssText || ':root {}',
  });
  entries.push({ path: 'scripts/main.js', content: MAIN_JS });

  let sharedAttributionCss = '';

  for (const page of pagesList) {
    const htmlPath = pageHtmlRelativePath(page);
    const key = pageSlugFileKey(page);
    const cssPath = `styles/pages/${key}.css`;
    const isRoot = htmlPath === 'index.html';
    const relPrefix = isRoot ? './' : '../';

    const collector = createAssetCollector(htmlPath);
    const renderCtx = {
      fromHtmlPath: htmlPath,
      routeToHtmlMap,
      themeCssVars: snapshot.themeCssVars,
      publicCms: snapshot.publicCms,
      rewriteSrc: collector.rewriteSrc,
    };

    const hasFooter = Boolean(page.footerTree);
    if (!sharedAttributionCss) {
      sharedAttributionCss = buildStaticBuillyAttributionCss(hasFooter, page.footerVisibility);
    }
    const { footerHtml, floatingHtml } = buildStaticBuillyAttributionHtml(hasFooter);

    const bodySections = [
      page.headerTree ? renderNodeToExportHtml(page.headerTree, renderCtx) : '',
      renderNodeToExportHtml(page.tree, renderCtx),
      page.footerTree ? renderNodeToExportHtml(page.footerTree, renderCtx) : '',
      footerHtml,
    ]
      .filter(Boolean)
      .join('\n');

    collector.files.forEach((bytes, assetPath) => {
      assetFiles.set(assetPath, bytes);
    });

    const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(page.title || page.name)}</title>
  <meta name="description" content="${escapeHtml(page.description || '')}" />
  <link rel="stylesheet" href="${relPrefix}styles/reset.css" />
  <link rel="stylesheet" href="${relPrefix}styles/variables.css" />
  <link rel="stylesheet" href="${relPrefix}styles/global.css" />
  <link rel="stylesheet" href="${relPrefix}${cssPath}" />
</head>
<body class="portfolio-theme">
  <div class="portfolio-site-surface">
${bodySections}
  </div>
  ${floatingHtml}
  <script src="${relPrefix}scripts/main.js" defer></script>
</body>
</html>
`;

    entries.push({ path: htmlPath, content: htmlDoc });
    entries.push({ path: cssPath, content: page.compiledCss || '' });
    exportedPagesManifest.push({
      pageId: page.id,
      name: page.name,
      fullPath: page.fullPath,
      htmlFile: htmlPath,
      cssFile: cssPath,
    });
  }

  entries.push({
    path: 'styles/global.css',
    content: `${GLOBAL_CSS}\n${sharedAttributionCss}`,
  });

  // Also bundle site mediaAssets data-URI assets cleanly under assets/
  (site.mediaAssets || []).forEach((asset) => {
    if (asset.url?.startsWith('data:image/')) {
      const dummyCollector = createAssetCollector('index.html');
      dummyCollector.rewriteSrc(asset.url, asset.name || asset.id);
      dummyCollector.files.forEach((bytes, assetPath) => {
        if (!assetFiles.has(assetPath)) assetFiles.set(assetPath, bytes);
      });
    }
  });

  const sortedAssets = Array.from(assetFiles.entries()).sort(([a], [b]) => a.localeCompare(b));
  sortedAssets.forEach(([assetPath, bytes]) => {
    entries.push({ path: assetPath, content: bytes });
  });

  const manifest: ExportManifest = {
    exporter: 'builly-on-demand-source-export',
    exportSchemaVersion: 1,
    siteSlug: snapshot.siteSlug,
    siteName: snapshot.siteName,
    publishVersion: snapshot.publishVersion,
    buildId: snapshot.buildId,
    exportedAt: new Date().toISOString(),
    pages: exportedPagesManifest,
    assets: sortedAssets.map(([assetPath]) => assetPath),
    runtimeDependentFeatures: Array.from(runtimeFeatures),
  };

  entries.push({
    path: 'export-manifest.json',
    content: JSON.stringify(manifest, null, 2),
  });

  const readme = `# ${snapshot.siteName} — Static Source Export

Exported on demand from Builly (${snapshot.publishVersion}).

## Important Note
Published Builly websites run on the **Builly Shared Runtime** from published JSON configuration — publishing does **not** require exporting or deploying this bundle. This ZIP archive is strictly an owner-requested portable source export.

## Structure
- \`index.html\` & \`pages/*.html\` — Multi-page static HTML documents
- \`styles/reset.css\`, \`styles/variables.css\`, \`styles/global.css\`, \`styles/pages/*.css\` — Modular theme tokens and responsive CSS
- \`scripts/main.js\` — Lightweight progressive enhancements (mobile navbar toggle, tabs, accordions, embed resize)
- \`assets/\` — Exported image & SVG assets
- \`export-manifest.json\` — Sanitized export inventory (zero OAuth tokens, Spreadsheet IDs, or private Inbox data)

## Hosting
Upload this folder to any static host (Cloudflare Pages, Netlify, Vercel Static, S3, or Nginx).
${
  manifest.runtimeDependentFeatures.length > 0
    ? `\n## Runtime-Dependent Features\n${manifest.runtimeDependentFeatures.map((f) => `- ${f}`).join('\n')}\n`
    : ''
}`;

  entries.push({ path: 'README.md', content: readme });

  const zipBytes = createZipArchive(entries);
  const safeSlug = (snapshot.siteSlug || 'builly-site').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const safeVer = (snapshot.publishVersion || 'v1').replace(/[^a-zA-Z0-9._-]+/g, '-');

  return {
    fileName: `${safeSlug}-${safeVer}-source.zip`,
    zipBytes,
    filePaths: entries.map((e) => e.path),
    manifest,
    snapshot,
  };
}
