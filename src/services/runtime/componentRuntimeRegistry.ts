import { ELEMENT_REGISTRY } from '../../data/elementRegistry';
import { ElementNode } from '../../types/builder';
import { isSafeRedirectUrl } from '../cms/cmsValidation';
import { extractEmbeddedHtmlAndCss } from '../cssCompiler';

export const RUNTIME_COMPONENT_SCHEMA_VERSION = 1;

export interface RuntimeComponentSpec {
  elementType: string;
  schemaVersion: number;
  isContainer: boolean;
  safeForPublic: boolean;
}

const BUILTIN_RUNTIME_SPECS: Record<string, RuntimeComponentSpec> = (() => {
  const map: Record<string, RuntimeComponentSpec> = {};
  for (const def of ELEMENT_REGISTRY) {
    map[def.elementType] = {
      elementType: def.elementType,
      schemaVersion: def.version,
      isContainer: def.isContainer,
      safeForPublic: def.safeForPublic !== false,
    };
  }
  // Built-in structural aliases that appear in pre-built templates/headers/footers
  const extraAliases: Array<[string, boolean]> = [
    ['columns', true],
    ['collection-list', true],
    ['collection-grid', true],
    ['project-grid', true],
    ['dynamic-text', false],
    ['dynamic-image', false],
    ['dynamic-link', false],
    ['dynamic-icon', false],
  ];
  for (const [type, isContainer] of extraAliases) {
    if (!map[type]) {
      map[type] = {
        elementType: type,
        schemaVersion: 1,
        isContainer,
        safeForPublic: true,
      };
    }
  }
  return map;
})();

export function getRuntimeComponentSpec(elementType: string): RuntimeComponentSpec | undefined {
  return BUILTIN_RUNTIME_SPECS[elementType];
}

export function isSupportedRuntimeComponentType(elementType: string): boolean {
  const spec = BUILTIN_RUNTIME_SPECS[elementType];
  return Boolean(spec && spec.safeForPublic);
}

export function listSupportedRuntimeComponentTypes(): string[] {
  return Object.keys(BUILTIN_RUNTIME_SPECS);
}

export interface NodeValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedTree: ElementNode;
  unsupportedTypes: string[];
}

function sanitizeSafeHref(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return trimmed;
  if (/^(mailto|tel):/i.test(trimmed)) return trimmed;
  if (isSafeRedirectUrl(trimmed)) return trimmed;
  return '#';
}

function sanitizeMediaUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Allow safe static image/svg/font/media data URIs; reject data:text/html
  if (/^data:(?:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)|font\/|audio\/|video\/)/i.test(trimmed)) {
    if (/data:image\/svg\+xml/i.test(trimmed) && /<script\b|javascript:/i.test(decodeURIComponent(trimmed))) {
      return '';
    }
    return trimmed;
  }
  return '';
}

function sanitizeNodeRecursive(
  node: ElementNode,
  errors: string[],
  warnings: string[],
  unsupportedTypes: Set<string>,
  depth = 0
): ElementNode {
  if (depth > 32) {
    warnings.push(`Maximum node depth reached at "${node.id}"; deeper children truncated.`);
    return { ...node, children: [] };
  }

  const spec = BUILTIN_RUNTIME_SPECS[node.type];
  if (!spec || !spec.safeForPublic) {
    unsupportedTypes.add(node.type);
    warnings.push(`Unsupported runtime component type "${node.type}" on "${node.name || node.id}".`);
  }

  const clonedContent = node.content ? { ...node.content } : undefined;
  if (clonedContent) {
    if (clonedContent.url) {
      clonedContent.url = sanitizeSafeHref(clonedContent.url);
    }
    if (clonedContent.ctaUrl) {
      clonedContent.ctaUrl = sanitizeSafeHref(clonedContent.ctaUrl);
    }
    if (clonedContent.imageSrc) {
      clonedContent.imageSrc = sanitizeMediaUrl(clonedContent.imageSrc);
    }
    if (clonedContent.videoPoster) {
      clonedContent.videoPoster = sanitizeMediaUrl(clonedContent.videoPoster);
    }
    if (clonedContent.embedUrl) {
      clonedContent.embedUrl = isSafeRedirectUrl(clonedContent.embedUrl) ? clonedContent.embedUrl : '';
    }
    if (Array.isArray(clonedContent.navLinks)) {
      clonedContent.navLinks = clonedContent.navLinks.map((lnk) => ({
        ...lnk,
        url: sanitizeSafeHref(lnk.url) || '#',
      }));
    }
    if (node.type === 'html-embed' && clonedContent.htmlCode) {
      // Strip scripts and event handlers cleanly for Shared Runtime security
      const extracted = extractEmbeddedHtmlAndCss(clonedContent.htmlCode, { stripScripts: true });
      if (extracted.hadScript) {
        warnings.push(
          `Stripped script/event handlers from HTML embed "${node.name || node.id}" in public runtime snapshot.`
        );
      }
      const styleTag = extracted.extractedCss ? `<style>${extracted.extractedCss}</style>\n` : '';
      clonedContent.htmlCode = `${styleTag}${extracted.bodyHtml}`;
    }
  }

  const sanitizedChildren = Array.isArray(node.children)
    ? node.children.map((child) =>
        sanitizeNodeRecursive(child, errors, warnings, unsupportedTypes, depth + 1)
      )
    : undefined;

  // Preserve runtime styling/layout/binding properties while omitting unknown/unsafe executable fields
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    tag: node.tag,
    htmlId: node.htmlId,
    hidden: node.hidden,
    styles: node.styles ? { ...node.styles } : {},
    responsiveStyles: node.responsiveStyles ? JSON.parse(JSON.stringify(node.responsiveStyles)) : undefined,
    pseudoStyles: node.pseudoStyles ? JSON.parse(JSON.stringify(node.pseudoStyles)) : undefined,
    responsivePseudoStyles: node.responsivePseudoStyles
      ? JSON.parse(JSON.stringify(node.responsivePseudoStyles))
      : undefined,
    styleSchemaVersion: node.styleSchemaVersion,
    advanced: node.advanced ? { ...node.advanced } : undefined,
    content: clonedContent,
    dynamicBinding: node.dynamicBinding ? { ...node.dynamicBinding } : undefined,
    componentRef: node.componentRef ? { ...node.componentRef } : undefined,
    children: sanitizedChildren,
  };
}

export function validateRuntimeNodeTree(rootNode: ElementNode): NodeValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unsupportedTypes = new Set<string>();
  const sanitizedTree = sanitizeNodeRecursive(rootNode, errors, warnings, unsupportedTypes, 0);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedTree,
    unsupportedTypes: Array.from(unsupportedTypes),
  };
}
