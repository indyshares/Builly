import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { RegionResponsiveVisibility } from '../../types/builder';
import { BREAKPOINTS } from '../../config/breakpoints';

export const BUILLY_ATTRIBUTION_URL = 'https://builly.indyshares.com';
export const BUILLY_ATTRIBUTION_LOGO_SRC = '/full_logo_bg.webp';

interface BuillyMadeWithBadgeProps {
  variant: 'footer' | 'floating';
  className?: string;
}

export const BuillyMadeWithBadge: React.FC<BuillyMadeWithBadgeProps> = ({
  variant,
  className = '',
}) => {
  const { t } = useTranslation();

  if (variant === 'footer') {
    return (
      <div
        data-builly-attribution="footer"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderTopColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
        }}
        className={`w-full border-t px-6 py-2.5 flex items-center justify-center select-none ${className}`}
      >
        <a
          href={BUILLY_ATTRIBUTION_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('common.madeWithAria')}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-[11px] font-medium opacity-85 hover:opacity-100 transition-opacity"
        >
          <span>{t('common.madeWith')}</span>
          <img
            src={BUILLY_ATTRIBUTION_LOGO_SRC}
            alt="Builly"
            className="h-5 w-auto object-contain rounded-md ring-1 ring-slate-900/10 bg-white"
          />
        </a>
      </div>
    );
  }

  return (
    <a
      data-builly-attribution="floating"
      href={BUILLY_ATTRIBUTION_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={t('common.madeWithAria')}
      className={`inline-flex items-center gap-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 px-2.5 py-1.5 shadow-lg hover:shadow-xl text-[11px] font-medium text-slate-600 hover:text-slate-900 transition-all select-none ${className}`}
    >
      <span className="leading-none whitespace-nowrap">{t('common.madeWith')}</span>
      <img
        src={BUILLY_ATTRIBUTION_LOGO_SRC}
        alt="Builly"
        className="h-[18px] w-auto object-contain rounded-[5px] shrink-0"
      />
    </a>
  );
};

export function buildStaticBuillyAttributionCss(
  hasFooterComponent: boolean,
  footerVisibility?: RegionResponsiveVisibility
): string {
  const tabletMax = BREAKPOINTS.tablet.max ?? 1023;
  const tabletMin = BREAKPOINTS.tablet.min ?? 768;
  const mobileMax = BREAKPOINTS.mobile.max ?? 767;
  const desktopMin = BREAKPOINTS.desktop.min ?? 1024;

  const baseCss = `
    .builly-footer-attribution {
      width: 100%;
      border-top: 1px solid var(--color-border, #e2e8f0);
      background-color: var(--color-surface, #ffffff);
      color: var(--color-text-muted, #64748b);
      padding: 10px 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .builly-footer-attribution a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 500;
      color: inherit;
      text-decoration: none;
      opacity: 0.88;
      transition: opacity 0.15s ease;
    }
    .builly-footer-attribution a:hover {
      opacity: 1;
    }
    .builly-footer-attribution img {
      height: 20px;
      width: auto;
      object-fit: contain;
      border-radius: 6px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: #ffffff;
      display: block;
    }
    .builly-floating-badge {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 9999;
      display: ${hasFooterComponent ? 'none' : 'inline-flex'};
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(226, 232, 240, 0.9);
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 4px 10px -4px rgba(15, 23, 42, 0.08);
      font-size: 11px;
      font-weight: 500;
      color: #475569;
      text-decoration: none;
      line-height: 1;
    }
    .builly-floating-badge img {
      height: 18px;
      width: auto;
      object-fit: contain;
      border-radius: 5px;
      display: block;
    }
  `.trim();

  if (!hasFooterComponent || !footerVisibility) {
    return baseCss;
  }

  const breakpointOverrides: string[] = [];
  if (footerVisibility.desktop === false) {
    breakpointOverrides.push(
      `@media (min-width: ${desktopMin}px) {\n  .builly-footer-attribution { display: none; }\n  .builly-floating-badge { display: inline-flex; }\n}`
    );
  }
  if (footerVisibility.tablet === false) {
    breakpointOverrides.push(
      `@media (min-width: ${tabletMin}px) and (max-width: ${tabletMax}px) {\n  .builly-footer-attribution { display: none; }\n  .builly-floating-badge { display: inline-flex; }\n}`
    );
  }
  if (footerVisibility.mobile === false) {
    breakpointOverrides.push(
      `@media (max-width: ${mobileMax}px) {\n  .builly-footer-attribution { display: none; }\n  .builly-floating-badge { display: inline-flex; }\n}`
    );
  }

  return [baseCss, ...breakpointOverrides].join('\n\n');
}

export function buildStaticBuillyAttributionHtml(hasFooterComponent: boolean): {
  footerHtml: string;
  floatingHtml: string;
} {
  const madeWithText = i18n.t('common.madeWith');
  const madeWithAria = i18n.t('common.madeWithAria');
  const footerHtml = hasFooterComponent
    ? `<div class="builly-footer-attribution" data-builly-attribution="footer">
    <a href="${BUILLY_ATTRIBUTION_URL}" target="_blank" rel="noopener noreferrer" aria-label="${madeWithAria}">
      <span>${madeWithText}</span>
      <img src="${BUILLY_ATTRIBUTION_LOGO_SRC}" alt="Builly" />
    </a>
  </div>`
    : '';

  const floatingHtml = `<a class="builly-floating-badge" data-builly-attribution="floating" href="${BUILLY_ATTRIBUTION_URL}" target="_blank" rel="noopener noreferrer" aria-label="${madeWithAria}">
    <span>${madeWithText}</span>
    <img src="${BUILLY_ATTRIBUTION_LOGO_SRC}" alt="Builly" />
  </a>`;

  return { footerHtml, floatingHtml };
}
