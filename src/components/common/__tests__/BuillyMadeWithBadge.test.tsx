import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BUILLY_ATTRIBUTION_LOGO_SRC,
  BUILLY_ATTRIBUTION_URL,
  BuillyMadeWithBadge,
  buildStaticBuillyAttributionCss,
  buildStaticBuillyAttributionHtml,
} from '../BuillyMadeWithBadge';

describe('BuillyMadeWithBadge', () => {
  it('renders in-footer attribution with rounded full_logo_bg.webp linking to builly.indyshares.com', () => {
    const html = renderToStaticMarkup(<BuillyMadeWithBadge variant="footer" />);
    expect(html).toContain('Made with');
    expect(html).toContain(`src="${BUILLY_ATTRIBUTION_LOGO_SRC}"`);
    expect(html).toContain('rounded-md');
    expect(html).toContain(`href="${BUILLY_ATTRIBUTION_URL}"`);
    expect(html).toContain('data-builly-attribution="footer"');
  });

  it('renders compact bottom-left floating overlay badge when footer is disabled/hidden', () => {
    const html = renderToStaticMarkup(
      <BuillyMadeWithBadge variant="floating" className="absolute left-3 bottom-3" />
    );
    expect(html).toContain('Made with');
    expect(html).toContain(`src="${BUILLY_ATTRIBUTION_LOGO_SRC}"`);
    expect(html).toContain('rounded-[5px]');
    expect(html).toContain(`href="${BUILLY_ATTRIBUTION_URL}"`);
    expect(html).toContain('data-builly-attribution="floating"');
  });

  it('emits static HTML and responsive CSS switching to floating bottom-left badge when footer is off or hidden on mobile', () => {
    const cssDisabled = buildStaticBuillyAttributionCss(false);
    expect(cssDisabled).toContain('position: fixed;');
    expect(cssDisabled).toContain('left: 16px;');
    expect(cssDisabled).toContain('bottom: 16px;');
    expect(cssDisabled).toContain('display: inline-flex;');

    const htmlDisabled = buildStaticBuillyAttributionHtml(false);
    expect(htmlDisabled.footerHtml).toBe('');
    expect(htmlDisabled.floatingHtml).toContain(BUILLY_ATTRIBUTION_URL);
    expect(htmlDisabled.floatingHtml).toContain(BUILLY_ATTRIBUTION_LOGO_SRC);

    const cssMobileHidden = buildStaticBuillyAttributionCss(true, {
      desktop: true,
      tablet: true,
      mobile: false,
    });
    expect(cssMobileHidden).toContain('@media (max-width: 767px)');
    expect(cssMobileHidden).toContain('.builly-footer-attribution { display: none; }');
    expect(cssMobileHidden).toContain('.builly-floating-badge { display: inline-flex; }');
  });
});
