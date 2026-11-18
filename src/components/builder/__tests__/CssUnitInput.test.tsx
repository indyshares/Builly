import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../i18n';
import { CssUnitInput, convertCssUnitValue } from '../property-editor/CssUnitInput';
import { parseNumericUnit, validateStyleValue } from '../../../services/styleValidator';
import { ElementNode } from '../../../types/builder';

function makeElement(styles: Record<string, string>): ElementNode {
  return {
    id: 'el_test_box',
    type: 'container',
    name: 'Test Box',
    tag: 'div',
    content: {},
    styles,
  };
}

describe('convertCssUnitValue', () => {
  it('converts commensurable font-relative, duration, angle, and viewport unit families accurately', () => {
    expect(convertCssUnitValue(16, 'px', 'rem')).toBe(1);
    expect(convertCssUnitValue(2, 'rem', 'px')).toBe(32);
    expect(convertCssUnitValue(1.5, 'em', 'px')).toBe(24);
    expect(convertCssUnitValue(500, 'ms', 's')).toBe(0.5);
    expect(convertCssUnitValue(0.25, 's', 'ms')).toBe(250);
    expect(convertCssUnitValue(180, 'deg', 'turn')).toBe(0.5);
    expect(convertCssUnitValue(1, 'turn', 'deg')).toBe(360);
    expect(convertCssUnitValue(100, 'vh', 'dvh')).toBe(100);
    expect(convertCssUnitValue(80, 'vw', 'svw')).toBe(80);
  });

  it('returns null for incommensurable transitions so 100px is never silently converted to 100%', () => {
    expect(convertCssUnitValue(100, 'px', '%')).toBeNull();
    expect(convertCssUnitValue(50, '%', 'px')).toBeNull();
    expect(convertCssUnitValue(240, 'px', 'vh')).toBeNull();
    expect(convertCssUnitValue(2, 'rem', 'vw')).toBeNull();
    expect(convertCssUnitValue(1, 'fr', '%')).toBeNull();
  });
});

describe('parseNumericUnit & validateStyleValue edge cases', () => {
  it('parses zero, negative, decimals, large numbers, keywords, and expressions safely', () => {
    expect(parseNumericUnit('0px')).toMatchObject({ isNumeric: true, number: '0', unit: 'px' });
    expect(parseNumericUnit('-24px')).toMatchObject({ isNumeric: true, number: '-24', unit: 'px' });
    expect(parseNumericUnit('12.5rem')).toMatchObject({ isNumeric: true, number: '12.5', unit: 'rem' });
    expect(parseNumericUnit('12800px')).toMatchObject({ isNumeric: true, number: '12800', unit: 'px' });
    expect(parseNumericUnit('.5em')).toMatchObject({ isNumeric: true, number: '.5', unit: 'em' });
    expect(parseNumericUnit('auto')).toMatchObject({ isKeyword: true, isNumeric: false });
    expect(parseNumericUnit('fit-content')).toMatchObject({ isKeyword: true, isNumeric: false });
    expect(parseNumericUnit('clamp(1rem, 2vw, 2rem)')).toMatchObject({
      isExpression: true,
      isNumeric: false,
    });
  });

  it('rejects negative values on non-negative properties and malformed delimiters', () => {
    expect(validateStyleValue('width', '-10px').valid).toBe(false);
    expect(validateStyleValue('paddingTop', '-4px').valid).toBe(false);
    expect(validateStyleValue('marginLeft', '-24px').valid).toBe(true);
    expect(validateStyleValue('opacity', '1.5').valid).toBe(false);
    expect(validateStyleValue('width', 'calc(100% - 20px').valid).toBe(false);
  });
});

describe('CssUnitInput rendering', () => {
  it('renders readable numeric inputs for zero, decimals, large integers, negative margins, and keywords', () => {
    const cases: Array<{ prop: 'width' | 'marginLeft' | 'maxWidth'; value: string; expectedText: string; unitText?: string }> = [
      { prop: 'width', value: '0px', expectedText: 'value="0"' },
      { prop: 'marginLeft', value: '-24px', expectedText: 'value="-24"' },
      { prop: 'width', value: '12.5rem', expectedText: 'value="12.5"', unitText: '>rem<' },
      { prop: 'width', value: '12800px', expectedText: 'value="12800"', unitText: '>px<' },
      { prop: 'width', value: 'auto', expectedText: 'value="auto"' },
      { prop: 'maxWidth', value: 'fit-content', expectedText: 'value="fit-content"', unitText: '>fit<' },
    ];

    for (const c of cases) {
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <CssUnitInput
            label="Width"
            cssProp="width"
            prop={c.prop}
            element={makeElement({ [c.prop]: c.value })}
            deviceMode="desktop"
            pseudoState="default"
            allowNegative={c.prop === 'marginLeft'}
            keywords={['auto', 'fit-content', 'none']}
            onChange={vi.fn()}
            onReset={vi.fn()}
          />
        </I18nextProvider>
      );

      expect(html).toContain(c.expectedText);
      expect(html).toContain('min-w-[78px]');
      expect(html).toContain('h-[38px]');
      if (c.unitText) {
        expect(html).toContain(c.unitText);
      }
    }
  });

  it('switches automatically to raw expression mode for CSS calc/clamp/var values', () => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <CssUnitInput
          label="Width"
          cssProp="width"
          prop="width"
          element={makeElement({ width: 'clamp(280px, 50vw, 1200px)' })}
          deviceMode="desktop"
          pseudoState="default"
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(html).toContain('aria-label="Width raw CSS value"');
    expect(html).toContain('clamp(280px, 50vw, 1200px)');
  });
});
