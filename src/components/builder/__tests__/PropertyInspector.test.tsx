import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../i18n';
import { PropertyInspector } from '../PropertyInspector';
import { INITIAL_GOOGLE_WORKSPACE, INITIAL_SITE } from '../../../data/initialSite';
import { resolveEffectiveTheme } from '../../../services/themeService';
import { migrateSiteComponentsAndLayout } from '../../../services/componentLibraryService';
import { ElementNode } from '../../../types/builder';

describe('PropertyInspector Hooks order & rendering stability', () => {
  const site = migrateSiteComponentsAndLayout(INITIAL_SITE);
  const effectiveTheme = resolveEffectiveTheme(site);
  const baseProps = {
    parentElement: site.pages[0].rootElement,
    site,
    effectiveTheme,
    workspace: INITIAL_GOOGLE_WORKSPACE,
    deviceMode: 'desktop' as const,
    editorViewportMode: 'desktop' as const,
    onSetDeviceMode: vi.fn(),
    onUpdateElement: vi.fn(),
    onDeleteElement: vi.fn(),
    onDuplicateElement: vi.fn(),
  };

  it('renders cleanly across null, leaf, header, nav-menu, and footer elements under StrictMode without hook-order warnings', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const headingElement: ElementNode = {
        id: 'el_heading',
        type: 'heading',
        name: 'Hero Title',
        tag: 'h1',
        content: { text: 'Hello Builly' },
        styles: { fontSize: '36px' },
      };

      const headerElement = site.globalComponents!.headers[0].rootElement;
      const footerElement = site.globalComponents!.footers[0].rootElement;
      const navElement: ElementNode = {
        id: 'el_nav',
        type: 'nav-menu',
        name: 'Navigation Links',
        tag: 'nav',
        content: { navLinks: [{ id: '1', label: 'Home', url: '/' }] },
        styles: {},
      };

      const sequence: Array<{ element: ElementNode | null; editingRegionLabel?: string }> = [
        { element: null },
        { element: headingElement },
        { element: null },
        { element: headerElement, editingRegionLabel: 'Global Header' },
        { element: navElement },
        { element: footerElement, editingRegionLabel: 'Global Footer' },
        { element: headingElement },
        { element: null },
      ];

      for (const step of sequence) {
        const html = renderToStaticMarkup(
          <React.StrictMode>
            <I18nextProvider i18n={i18n}>
              <PropertyInspector
                {...baseProps}
                element={step.element}
                editingRegionLabel={step.editingRegionLabel}
              />
            </I18nextProvider>
          </React.StrictMode>
        );
        if (!step.element) {
          expect(html).toContain('No Element Selected');
        } else {
          expect(html).toContain(step.element.name);
        }
      }

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
