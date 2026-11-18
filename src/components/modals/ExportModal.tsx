import React from 'react';
import { useTranslation } from 'react-i18next';
import { ElementNode, GoogleWorkspaceState, SiteDocument } from '../../types/builder';
import { storageService } from '../../services/storageService';
import { buildThemeCssVariablesText, resolveEffectiveTheme } from '../../services/themeService';
import { buildIsolatedEmbedSrcDoc, compilePublishedPageCss } from '../../services/cssCompiler';
import { compilerService } from '../../services/compilerService';
import { resolvePageSlotComponent } from '../../services/componentLibraryService';
import { sanitizeSvgMarkup } from '../../services/assetService';
import { generateSiteSourceZip } from '../../services/sourceExportService';
import {
  buildStaticBuillyAttributionCss,
  buildStaticBuillyAttributionHtml,
} from '../common/BuillyMadeWithBadge';
import { Download, FileJson, FileCode, FileArchive, X, ShieldCheck } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  site: SiteDocument;
  workspace: GoogleWorkspaceState;
  onClose: () => void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderNodeToStaticHtml(node: ElementNode, themeCssVars?: Record<string, string>): string {
  const attrs = [
    `data-indy-el="${escapeHtml(node.id)}"`,
    node.advanced?.htmlId || node.htmlId ? `id="${escapeHtml(node.advanced?.htmlId || node.htmlId || '')}"` : '',
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
    const href = escapeHtml(node.content?.url || '#');
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
    const href = escapeHtml(node.content?.url || '/');
    return `<a ${attrs} href="${href}"><strong>${escapeHtml(node.content?.logoText || node.name)}</strong></a>`;
  }
  if (node.type === 'navbar' || node.type === 'nav-menu' || node.type === 'breadcrumbs' || node.type === 'pagination' || node.type === 'social-links') {
    const linksHtml = (node.content?.navLinks || [])
      .map((l) => `<a href="${escapeHtml(l.url)}" style="margin-right:16px;text-decoration:none;color:inherit;">${escapeHtml(l.label)}</a>`)
      .join('');
    const brandHtml = node.type === 'navbar' ? `<strong>${escapeHtml(node.content?.logoText || '')}</strong>` : '';
    const ctaHtml =
      node.type === 'navbar' && node.content?.ctaLabel
        ? `<a href="${escapeHtml(node.content.ctaUrl || '/contact')}" style="padding:8px 14px;background:var(--color-button-primary-bg);color:var(--color-button-primary-text);border-radius:var(--theme-radius);text-decoration:none;">${escapeHtml(node.content.ctaLabel)}</a>`
        : '';
    return `<nav ${attrs}>${brandHtml}<div>${linksHtml}</div>${ctaHtml}</nav>`;
  }
  if (node.type === 'image') {
    const src = escapeHtml(node.content?.imageSrc || '');
    const alt = escapeHtml(node.content?.imageAlt || node.name);
    return `<div ${attrs}><img src="${src}" alt="${alt}" style="width:100%;height:100%;display:block;" /></div>`;
  }
  if (node.type === 'svg-graphic') {
    const check = sanitizeSvgMarkup(node.content?.svgMarkup || '');
    return `<div ${attrs}>${check.valid && check.sanitized ? check.sanitized : ''}</div>`;
  }
  if (node.type === 'html-embed') {
    const rawHtmlCode = node.content?.htmlCode || '';
    if (!rawHtmlCode.trim()) {
      return `<div ${attrs}></div>`;
    }
    const srcDoc = buildIsolatedEmbedSrcDoc({
      embedId: node.id,
      htmlCode: rawHtmlCode,
      themeMode: node.content?.embedThemeMode || 'follow-theme',
      themeCssVars,
    });
    const hasExplicitHeight = Boolean(node.styles?.height && node.styles.height !== 'auto');
    const iframeStyle = hasExplicitHeight
      ? 'width:100%;height:100%;border:0;display:block;background:transparent;overflow:hidden;'
      : 'width:100%;min-height:48px;height:140px;border:0;display:block;background:transparent;overflow:hidden;';
    return `<div ${attrs}><iframe title="${escapeHtml(node.name)}" data-indy-embed-id="${escapeHtml(node.id)}" sandbox="allow-scripts allow-forms" srcdoc="${escapeHtml(srcDoc)}" style="${iframeStyle}"></iframe></div>`;
  }
  if (node.type === 'data-table') {
    const cols = node.content?.tableColumns || [];
    const rows = node.content?.tableRows || [];
    const head = `<thead><tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    return `<div ${attrs}><table style="width:100%;border-collapse:collapse;">${head}${body}</table></div>`;
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
    return `<div ${attrs} data-indy-cms-widget="${node.type}"></div>`;
  }

  const tag = node.tag || 'div';
  const childrenHtml = (node.children || []).map((c) => renderNodeToStaticHtml(c, themeCssVars)).join('\n');
  return `<${tag} ${attrs}>${childrenHtml}</${tag}>`;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, site, workspace, onClose }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const handleDownloadSourceZip = () => {
    const result = generateSiteSourceZip({
      site,
      workspace,
      includeDraftPages: false,
    });
    const arrayBuffer = result.zipBytes.buffer.slice(
      result.zipBytes.byteOffset,
      result.zipBytes.byteOffset + result.zipBytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const jsonStr = storageService.exportProjectJson(site, workspace);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${site.portfolioSlug}-builly-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtmlPackage = () => {
    const activePage = site.pages.find((p) => p.id === site.activePageId) || site.pages[0];
    const resolvedTree = compilerService.resolveElementTree(activePage.rootElement, workspace);
    const headerSlot = resolvePageSlotComponent(activePage, site, 'header');
    const footerSlot = resolvePageSlotComponent(activePage, site, 'footer');
    const resolvedHeaderTree = headerSlot.component
      ? compilerService.resolveElementTree(headerSlot.component.rootElement, workspace)
      : null;
    const resolvedFooterTree = footerSlot.component
      ? compilerService.resolveElementTree(footerSlot.component.rootElement, workspace)
      : null;
    const resolvedPage = { ...activePage, rootElement: resolvedTree };
    const effective = resolveEffectiveTheme(site);
    const themeCss = buildThemeCssVariablesText(effective.colors, effective.baseTheme);
    const pageCss = compilePublishedPageCss(resolvedPage, site);
    const hasFooterComponent = Boolean(resolvedFooterTree);
    const attributionCss = buildStaticBuillyAttributionCss(
      hasFooterComponent,
      footerSlot.responsiveVisibility
    );
    const { footerHtml, floatingHtml } = buildStaticBuillyAttributionHtml(hasFooterComponent);
    const bodyHtml = [
      resolvedHeaderTree ? renderNodeToStaticHtml(resolvedHeaderTree, effective.cssVars) : '',
      renderNodeToStaticHtml(resolvedTree, effective.cssVars),
      resolvedFooterTree ? renderNodeToStaticHtml(resolvedFooterTree, effective.cssVars) : '',
      footerHtml,
    ]
      .filter(Boolean)
      .join('\n');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(activePage.title)}</title>
  <meta name="description" content="${escapeHtml(activePage.description)}">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Playfair+Display:wght@500;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
${themeCss}
    body.portfolio-theme {
      margin: 0;
      background-color: var(--color-background);
      color: var(--color-text);
      font-family: var(--font-body);
    }
    .portfolio-heading {
      color: var(--color-heading);
      font-family: var(--font-display);
    }
${pageCss}
${attributionCss}
  </style>
</head>
<body class="portfolio-theme">
  <div class="portfolio-site-surface">
${bodyHtml}
  </div>
  ${floatingHtml}
  <script>
    window.addEventListener('message', function(e) {
      var d = e.data;
      if (!d || d.type !== 'indy-embed-resize' || !d.embedId || typeof d.height !== 'number') return;
      var frames = document.querySelectorAll('iframe[data-indy-embed-id]');
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow === e.source && frames[i].getAttribute('data-indy-embed-id') === d.embedId) {
          frames[i].style.height = Math.max(32, Math.min(8000, Math.ceil(d.height))) + 'px';
        }
      }
    });
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${site.portfolioSlug}-static-site.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{t('modals.export.title')}</h3>
              <p className="text-xs text-slate-500">
                {t('modals.export.subtitle')}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="p-1 text-slate-400 hover:text-slate-700 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">{t('modals.export.shieldTitle')}</span>
              <p className="text-[11px] text-emerald-800">
                {t('modals.export.shieldDesc')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleDownloadSourceZip}
              className="w-full text-left p-3.5 border border-purple-200 hover:border-purple-500 rounded-lg flex items-center justify-between group cursor-pointer transition-all bg-purple-50/40 hover:shadow-xs"
            >
              <div className="flex items-center gap-3">
                <FileArchive className="w-5 h-5 text-purple-600 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-900 group-hover:text-purple-700 block">
                    Multi-Page Source Code ZIP ({site.portfolioSlug}-source.zip)
                  </span>
                  <span className="text-[11px] text-slate-600 block">
                    Generated on demand: HTML pages, modular CSS, vanilla JS, exported assets, README &amp; sanitized manifest (zero secrets).
                  </span>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400 group-hover:text-purple-600 shrink-0" />
            </button>

            <div
              onClick={handleDownloadJson}
              className="p-3.5 border border-slate-200 hover:border-blue-500 rounded-lg flex items-center justify-between group cursor-pointer transition-all bg-white hover:shadow-xs"
            >
              <div className="flex items-center gap-3">
                <FileJson className="w-5 h-5 text-blue-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 block">
                    {t('modals.export.jsonTitle')}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t('modals.export.jsonDesc', { count: site.pages.length })}
                  </span>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
            </div>

            <div
              onClick={handleDownloadHtmlPackage}
              className="p-3.5 border border-slate-200 hover:border-blue-500 rounded-lg flex items-center justify-between group cursor-pointer transition-all bg-white hover:shadow-xs"
            >
              <div className="flex items-center gap-3">
                <FileCode className="w-5 h-5 text-emerald-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-600 block">
                    {t('modals.export.htmlTitle')}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {t('modals.export.htmlDesc')}
                  </span>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

