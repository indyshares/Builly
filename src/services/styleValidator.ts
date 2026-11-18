export const STANDARD_LENGTH_UNITS = [
  'px',
  '%',
  'rem',
  'em',
  'vw',
  'vh',
  'svw',
  'svh',
  'lvh',
  'dvh',
  'ch',
] as const;

export const GRID_UNITS = [...STANDARD_LENGTH_UNITS, 'fr'] as const;

export const DURATION_UNITS = ['ms', 's'] as const;

export const ANGLE_UNITS = ['deg', 'rad', 'turn'] as const;

export interface ParsedNumericUnit {
  isNumeric: boolean;
  number: string;
  unit: string;
  isExpression: boolean;
  isKeyword: boolean;
}

const CSS_KEYWORDS = new Set([
  'auto',
  'none',
  'normal',
  'inherit',
  'initial',
  'unset',
  'revert',
  'min-content',
  'max-content',
  'fit-content',
  'stretch',
  'content',
  'contain',
  'cover',
  'fill',
]);

export function parseNumericUnit(
  raw: string | undefined | null,
  defaultUnit = 'px'
): ParsedNumericUnit {
  const value = (raw || '').trim();
  if (!value) {
    return { isNumeric: false, number: '', unit: defaultUnit, isExpression: false, isKeyword: false };
  }
  if (CSS_KEYWORDS.has(value.toLowerCase())) {
    return { isNumeric: false, number: '', unit: defaultUnit, isExpression: false, isKeyword: true };
  }
  if (
    /^(calc|min|max|clamp|var|fit-content|minmax|repeat|env)\s*\(/i.test(value) ||
    value.includes(' ')
  ) {
    return { isNumeric: false, number: '', unit: defaultUnit, isExpression: true, isKeyword: false };
  }
  const match = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value);
  if (match) {
    return {
      isNumeric: true,
      number: match[1],
      unit: match[2] || defaultUnit,
      isExpression: false,
      isKeyword: false,
    };
  }
  return { isNumeric: false, number: '', unit: defaultUnit, isExpression: true, isKeyword: false };
}

export function hasBalancedDelimiters(input: string): { valid: boolean; error?: string } {
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inSingle = false;
  let inDouble = false;
  let inComment = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false;
        i++;
      }
      continue;
    }

    if (!inSingle && !inDouble && ch === '/' && next === '*') {
      inComment = true;
      i++;
      continue;
    }

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
    else if (ch === ')') parenDepth--;
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth--;

    if (parenDepth < 0) return { valid: false, error: 'Unexpected closing parenthesis ")".' };
    if (braceDepth < 0) return { valid: false, error: 'Unexpected closing brace "}".' };
    if (bracketDepth < 0) return { valid: false, error: 'Unexpected closing bracket "]".' };
  }

  if (inComment) return { valid: false, error: 'Unclosed CSS comment "/*".' };
  if (inSingle || inDouble) return { valid: false, error: 'Unclosed string literal.' };
  if (parenDepth > 0) return { valid: false, error: 'Unclosed parenthesis "(". ' };
  if (braceDepth > 0) return { valid: false, error: 'Unclosed brace "{".' };
  if (bracketDepth > 0) return { valid: false, error: 'Unclosed bracket "[".' };

  return { valid: true };
}

const NON_NEGATIVE_PROPS = new Set([
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingInline',
  'paddingBlock',
  'gap',
  'rowGap',
  'columnGap',
  'width',
  'minWidth',
  'maxWidth',
  'height',
  'minHeight',
  'maxHeight',
  'inlineSize',
  'blockSize',
  'fontSize',
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRadius',
  'flexGrow',
  'flexShrink',
  'opacity',
]);

export interface StyleValueDiagnostic {
  valid: boolean;
  error?: string;
  warning?: string;
  hasImportant?: boolean;
}

export function validateStyleValue(prop: string, rawValue: string): StyleValueDiagnostic {
  const val = rawValue.trim();
  if (!val) return { valid: true };

  if (/[{}]/.test(val)) {
    return { valid: false, error: 'Braces "{ }" are not allowed inside a property value.' };
  }

  const delim = hasBalancedDelimiters(val);
  if (!delim.valid) {
    return { valid: false, error: delim.error };
  }

  const hasImportant = /!important\b/i.test(val);
  const cleanVal = val.replace(/!important\b/gi, '').trim();

  if (NON_NEGATIVE_PROPS.has(prop) && /^-\d/.test(cleanVal)) {
    return {
      valid: false,
      error: `Negative values are not valid for ${prop} in CSS.`,
      hasImportant,
    };
  }

  if (prop === 'opacity') {
    const num = Number(cleanVal);
    if (!Number.isNaN(num) && (num < 0 || num > 1)) {
      return { valid: false, error: 'Opacity must be between 0 and 1.', hasImportant };
    }
  }

  if (hasImportant) {
    return {
      valid: true,
      warning: 'Uses !important — prefer specificity or responsive overrides unless strictly needed.',
      hasImportant: true,
    };
  }

  return { valid: true, hasImportant: false };
}

export interface CustomCssValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateCustomCss(rawCss: string): CustomCssValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trimmed = rawCss.trim();
  if (!trimmed) return { valid: true, errors, warnings };

  const delim = hasBalancedDelimiters(trimmed);
  if (!delim.valid && delim.error) {
    errors.push(delim.error);
  }

  if (/!important\b/i.test(trimmed)) {
    warnings.push('Contains !important declarations. Use sparingly to avoid override conflicts.');
  }

  if (/javascript\s*:/i.test(trimmed) || /expression\s*\(/i.test(trimmed)) {
    errors.push('Unsafe CSS url/expression pattern detected and blocked.');
  }

  if (/@import\b/i.test(trimmed)) {
    warnings.push(
      '@import inside scoped Custom CSS is blocked in the editor so external stylesheets cannot affect Page Builder UI.'
    );
  }

  if (/\b(html|body|:root)\b/i.test(trimmed)) {
    warnings.push(
      'Global selectors (html, body, :root) are strictly scoped to the website surface (.portfolio-site-surface) and never affect Page Builder UI.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
