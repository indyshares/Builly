import { PageDocument } from '../../types/builder';
import {
  CmsContentRecord,
  CmsContentTypeSchema,
  CmsDocument,
  CmsFieldDefinition,
  CmsFieldType,
  CmsGeneratedRoute,
  CmsTerm,
} from '../../types/cms';
import { resolvePageFullPath } from '../pageService';

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/**
 * Neutralizes spreadsheet formula injection when writing user-entered strings into Google Sheets.
 */
export function escapeSheetFormulaCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (!str) return '';
  if (FORMULA_PREFIX_RE.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Restores formula-escaped strings read back from Google Sheets.
 */
export function unescapeSheetFormulaCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw);
  if (str.startsWith("'") && FORMULA_PREFIX_RE.test(str.slice(1))) {
    return str.slice(1);
  }
  return str;
}

/**
 * Checks whether a redirect URL uses a safe relative path or http/https protocol.
 */
export function isSafeRedirectUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Strips potentially dangerous elements, event handlers, and scriptable URL schemes from rich HTML.
 */
export function sanitizeRichHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  let clean = String(rawHtml);

  const dangerousTagPattern =
    /<(script|iframe|object|embed|applet|svg|math|style|link|meta|base|form)\b[\s\S]*?(?:<\/\1\s*>|>)/gi;
  let prev = '';
  // Loop to defeat nested tag reconstructions such as <scr<script>ipt>
  while (clean !== prev) {
    prev = clean;
    clean = clean
      .replace(
        /<(script|iframe|object|embed|applet|svg|math|style|link|meta|base|form)\b[\s\S]*?<\/\1\s*>/gi,
        ''
      )
      .replace(
        /<\/?(script|iframe|object|embed|applet|svg|math|style|link|meta|base|form)\b[^>]*>/gi,
        ''
      )
      .replace(dangerousTagPattern, '');
  }

  // Remove inline event handlers (on*) and dangerous attributes like srcdoc / formaction
  clean = clean
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Neutralize scriptable URI protocols inside attributes (including HTML entity/whitespace obfuscation)
  clean = clean.replace(
    /(\b(?:href|src|action|xlink:href|poster|data)\s*=\s*)(["']?)([\s\S]*?)\2(?=[\s>])/gi,
    (_m, attrPrefix: string, quote: string, rawUrl: string) => {
      const normalized = rawUrl
        .replace(/&#x([0-9a-f]+);?/gi, (_e, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);?/g, (_e, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/[\u0000-\u0020]+/g, '')
        .toLowerCase();
      if (
        normalized.startsWith('javascript:') ||
        normalized.startsWith('vbscript:') ||
        normalized.startsWith('data:text/html') ||
        normalized.startsWith('data:image/svg+xml')
      ) {
        return `${attrPrefix}${quote}#blocked${quote}`;
      }
      return `${attrPrefix}${quote}${rawUrl}${quote}`;
    }
  );

  // Fallback strip for standalone protocol tokens outside recognized attributes
  clean = clean.replace(/(?:javascript|vbscript)\s*:/gi, '');

  return clean;
}

export function sanitizeCmsKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function sanitizeCmsSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ensureUniqueRecordSlug(
  rawSlugOrTitle: string,
  contentTypeId: string,
  records: CmsContentRecord[],
  excludeRecordId?: string
): string {
  const base = sanitizeCmsSlug(rawSlugOrTitle) || 'item';
  const siblings = new Set(
    records
      .filter((r) => r.contentTypeId === contentTypeId && r.recordId !== excludeRecordId)
      .map((r) => r.slug.toLowerCase())
  );
  if (!siblings.has(base)) return base;
  let n = 2;
  while (siblings.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export interface RecordValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
  generalErrors: string[];
}

function isEmptyFieldValue(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

function validateSingleFieldValue(
  field: CmsFieldDefinition,
  value: unknown,
  allRecords: CmsContentRecord[],
  record: CmsContentRecord
): string | null {
  if (field.required && isEmptyFieldValue(value)) {
    return `${field.label} is required.`;
  }
  if (isEmptyFieldValue(value)) return null;

  const valRules = field.validation || {};

  switch (field.type) {
    case 'short_text':
    case 'long_text':
    case 'rich_text': {
      const text = String(value);
      const plainLen = field.type === 'rich_text' ? text.replace(/<[^>]+>/g, '').trim().length : text.length;
      if (field.required && plainLen === 0) return `${field.label} cannot be empty.`;
      if (valRules.minLength !== undefined && plainLen < valRules.minLength) {
        return `${field.label} must be at least ${valRules.minLength} characters.`;
      }
      if (valRules.maxLength !== undefined && plainLen > valRules.maxLength) {
        return `${field.label} exceeds ${valRules.maxLength} characters.`;
      }
      if (valRules.pattern) {
        try {
          const re = new RegExp(valRules.pattern);
          if (!re.test(text)) {
            return valRules.patternMessage || `${field.label} format is invalid.`;
          }
        } catch {
          // Ignore invalid user regex
        }
      }
      break;
    }
    case 'number':
    case 'currency': {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) {
        return `${field.label} must be a valid number.`;
      }
      if (valRules.min !== undefined && num < valRules.min) {
        return `${field.label} must be at least ${valRules.min}.`;
      }
      if (valRules.max !== undefined && num > valRules.max) {
        return `${field.label} must be at most ${valRules.max}.`;
      }
      break;
    }
    case 'boolean': {
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        return `${field.label} must be a boolean.`;
      }
      break;
    }
    case 'url': {
      const s = String(value).trim();
      const isRelativeOrAnchor = s.startsWith('/') || s.startsWith('#');
      if (!isRelativeOrAnchor) {
        try {
          const parsed = new URL(s);
          if (!['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
            return `${field.label} must use http, https, mailto, or a relative /path.`;
          }
        } catch {
          return `${field.label} must be a valid URL or /path.`;
        }
      }
      break;
    }
    case 'email': {
      const s = String(value).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        return `${field.label} must be a valid email address.`;
      }
      break;
    }
    case 'phone': {
      const s = String(value).trim();
      if (!/^[+()\d\s.-]{6,24}$/.test(s)) {
        return `${field.label} must be a valid phone number.`;
      }
      break;
    }
    case 'color': {
      const s = String(value).trim();
      if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) && !s.startsWith('var(--')) {
        return `${field.label} must be a valid hex color or CSS token.`;
      }
      break;
    }
    case 'single_select': {
      if (field.options && field.options.length > 0) {
        const allowed = new Set(field.options.map((o) => o.value));
        if (!allowed.has(String(value))) {
          return `${field.label} has an unsupported option.`;
        }
      }
      break;
    }
    case 'multi_select': {
      const arr = Array.isArray(value) ? value : [value];
      if (valRules.maxItems !== undefined && arr.length > valRules.maxItems) {
        return `${field.label} allows at most ${valRules.maxItems} selections.`;
      }
      if (field.options && field.options.length > 0) {
        const allowed = new Set(field.options.map((o) => o.value));
        const bad = arr.find((item) => !allowed.has(String(item)));
        if (bad !== undefined) return `${field.label} includes an invalid option "${String(bad)}".`;
      }
      break;
    }
    case 'gallery': {
      const arr = Array.isArray(value) ? value : [];
      if (valRules.maxItems !== undefined && arr.length > valRules.maxItems) {
        return `${field.label} allows at most ${valRules.maxItems} media items.`;
      }
      break;
    }
    case 'json': {
      if (typeof value === 'string') {
        try {
          JSON.parse(value);
        } catch {
          return `${field.label} must contain valid JSON.`;
        }
      }
      break;
    }
    case 'relation': {
      const relIds = record.relationIdsByField[field.key] || (Array.isArray(value) ? value : [value]);
      if (field.relationConfig?.cardinality === 'one_to_one' && relIds.length > 1) {
        return `${field.label} allows only 1 linked record.`;
      }
      if (
        field.relationConfig?.maxSelections !== undefined &&
        relIds.length > field.relationConfig.maxSelections
      ) {
        return `${field.label} allows at most ${field.relationConfig.maxSelections} linked records.`;
      }
      break;
    }
    default:
      break;
  }

  if (field.unique) {
    const normalized = String(value).trim().toLowerCase();
    const dup = allRecords.find(
      (r) =>
        r.contentTypeId === record.contentTypeId &&
        r.recordId !== record.recordId &&
        r.status !== 'trash' &&
        String(r.fields[field.key] ?? '').trim().toLowerCase() === normalized
    );
    if (dup) {
      return `${field.label} must be unique across records (conflicts with "${dup.title}").`;
    }
  }

  return null;
}

export function validateCmsRecord(
  schema: CmsContentTypeSchema,
  record: CmsContentRecord,
  allRecords: CmsContentRecord[]
): RecordValidationResult {
  const fieldErrors: Record<string, string> = {};
  const generalErrors: string[] = [];

  if (!record.slug || !sanitizeCmsSlug(record.slug)) {
    generalErrors.push('Record URL slug is required.');
  } else {
    const cleanSlug = sanitizeCmsSlug(record.slug);
    const slugConflict = allRecords.find(
      (r) =>
        r.contentTypeId === schema.id &&
        r.recordId !== record.recordId &&
        r.slug.toLowerCase() === cleanSlug
    );
    if (slugConflict) {
      generalErrors.push(`Slug "/${cleanSlug}" is already used by "${slugConflict.title}".`);
    }
  }

  schema.fields.forEach((f) => {
    const rawVal =
      f.type === 'relation'
        ? record.relationIdsByField[f.key] ?? record.fields[f.key]
        : record.fields[f.key];
    const err = validateSingleFieldValue(f, rawVal, allRecords, record);
    if (err) {
      fieldErrors[f.key] = err;
    }
  });

  return {
    valid: Object.keys(fieldErrors).length === 0 && generalErrors.length === 0,
    fieldErrors,
    generalErrors,
  };
}

export interface SchemaEvolutionReport {
  hasBreakingChanges: boolean;
  addedOptionalFields: string[];
  addedRequiredFieldsWithoutDefault: { key: string; label: string; missingCount: number }[];
  removedFieldsWithData: { key: string; label: string; populatedCount: number }[];
  typeChanges: { key: string; from: CmsFieldType; to: CmsFieldType; compatible: boolean }[];
}

function isTypeConversionCompatible(from: CmsFieldType, to: CmsFieldType): boolean {
  if (from === to) return true;
  const textSet = new Set<CmsFieldType>(['short_text', 'long_text', 'rich_text', 'url', 'email', 'phone']);
  if (textSet.has(from) && textSet.has(to)) return true;
  if ((from === 'number' || from === 'currency') && (to === 'number' || to === 'currency')) return true;
  if (from === 'date' && to === 'datetime') return true;
  return false;
}

export function analyzeSchemaEvolution(
  prevSchema: CmsContentTypeSchema,
  nextSchema: CmsContentTypeSchema,
  records: CmsContentRecord[]
): SchemaEvolutionReport {
  const typeRecords = records.filter((r) => r.contentTypeId === prevSchema.id);
  const prevById = new Map(prevSchema.fields.map((f) => [f.fieldId, f]));
  const nextById = new Map(nextSchema.fields.map((f) => [f.fieldId, f]));

  const addedOptionalFields: string[] = [];
  const addedRequiredFieldsWithoutDefault: { key: string; label: string; missingCount: number }[] = [];
  const removedFieldsWithData: { key: string; label: string; populatedCount: number }[] = [];
  const typeChanges: { key: string; from: CmsFieldType; to: CmsFieldType; compatible: boolean }[] = [];

  nextSchema.fields.forEach((nf) => {
    const pf = prevById.get(nf.fieldId);
    if (!pf) {
      if (nf.required && isEmptyFieldValue(nf.defaultValue) && typeRecords.length > 0) {
        addedRequiredFieldsWithoutDefault.push({
          key: nf.key,
          label: nf.label,
          missingCount: typeRecords.length,
        });
      } else {
        addedOptionalFields.push(nf.label);
      }
    } else if (pf.type !== nf.type) {
      typeChanges.push({
        key: nf.key,
        from: pf.type,
        to: nf.type,
        compatible: isTypeConversionCompatible(pf.type, nf.type),
      });
    }
  });

  prevSchema.fields.forEach((pf) => {
    if (!nextById.has(pf.fieldId)) {
      const populatedCount = typeRecords.filter((r) => !isEmptyFieldValue(r.fields[pf.key])).length;
      if (populatedCount > 0) {
        removedFieldsWithData.push({
          key: pf.key,
          label: pf.label,
          populatedCount,
        });
      }
    }
  });

  return {
    hasBreakingChanges:
      addedRequiredFieldsWithoutDefault.length > 0 ||
      removedFieldsWithData.length > 0 ||
      typeChanges.some((tc) => !tc.compatible),
    addedOptionalFields,
    addedRequiredFieldsWithoutDefault,
    removedFieldsWithData,
    typeChanges,
  };
}

export function wouldTermCreateCycle(
  termId: string,
  candidateParentId: string | null | undefined,
  terms: CmsTerm[]
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === termId) return true;
  const visited = new Set<string>([termId]);
  let cursor: string | null | undefined = candidateParentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    const parent = terms.find((t) => t.termId === cursor);
    cursor = parent?.parentTermId || null;
  }
  return false;
}

export function collectDescendantTermIds(
  taxonomyId: string,
  rootTermIds: string[],
  terms: CmsTerm[]
): string[] {
  const taxTerms = terms.filter((t) => t.taxonomyId === taxonomyId);
  const result = new Set<string>(rootTermIds);
  let added = true;
  while (added) {
    added = false;
    for (const t of taxTerms) {
      if (t.parentTermId && result.has(t.parentTermId) && !result.has(t.termId)) {
        result.add(t.termId);
        added = true;
      }
    }
  }
  return Array.from(result);
}

export interface CmsRouteCollisionResult {
  routes: CmsGeneratedRoute[];
  collisions: { path: string; reason: string }[];
}

export function generateAndCheckCmsRoutes(
  cms: CmsDocument,
  pages: PageDocument[]
): CmsRouteCollisionResult {
  const routes: CmsGeneratedRoute[] = [];
  const collisions: { path: string; reason: string }[] = [];

  const staticPaths = new Map<string, string>();
  pages.forEach((p) => {
    if (p.pageKind && p.pageKind !== 'standard') return;
    const pPath = resolvePageFullPath(p, pages);
    staticPaths.set(pPath.toLowerCase(), p.name);
  });

  const seenCmsPaths = new Map<string, string>();

  const registerRoute = (route: CmsGeneratedRoute) => {
    const key = route.fullPath.toLowerCase();
    const staticOwner = staticPaths.get(key);
    if (staticOwner) {
      collisions.push({
        path: route.fullPath,
        reason: `CMS route "${route.fullPath}" collides with manual page "${staticOwner}".`,
      });
      return;
    }
    const existingCms = seenCmsPaths.get(key);
    if (existingCms) {
      collisions.push({
        path: route.fullPath,
        reason: `CMS route "${route.fullPath}" is duplicated between "${existingCms}" and "${route.title}".`,
      });
      return;
    }
    seenCmsPaths.set(key, route.title);
    routes.push(route);
  };

  if (cms.settings.enableArchiveRoutes) {
    cms.contentTypes
      .filter((ct) => ct.enabled && ct.routable && ct.publiclyPublishable)
      .forEach((ct) => {
        const basePath = ct.routeBasePath.startsWith('/')
          ? ct.routeBasePath
          : `/${ct.routeBasePath}`;
        registerRoute({
          fullPath: basePath,
          kind: 'cms-archive',
          contentTypeId: ct.id,
          title: ct.pluralLabel,
        });

        cms.records
          .filter((r) => r.contentTypeId === ct.id && r.status === 'published')
          .forEach((rec) => {
            registerRoute({
              fullPath: `${basePath.replace(/\/+$/, '')}/${rec.slug}`,
              kind: 'cms-single',
              contentTypeId: ct.id,
              recordId: rec.recordId,
              title: rec.title,
            });
          });
      });
  }

  if (cms.settings.enableTaxonomyRoutes) {
    cms.taxonomies.forEach((tax) => {
      if (!tax.archiveBasePath) return;
      const base = tax.archiveBasePath.startsWith('/')
        ? tax.archiveBasePath.replace(/\/+$/, '')
        : `/${tax.archiveBasePath.replace(/\/+$/, '')}`;
      cms.terms
        .filter((t) => t.taxonomyId === tax.id)
        .forEach((term) => {
          registerRoute({
            fullPath: `${base}/${term.slug}`,
            kind: 'taxonomy-archive',
            contentTypeId: tax.contentTypeIds[0] || 'post',
            taxonomyId: tax.id,
            termId: term.termId,
            title: `${tax.singularLabel}: ${term.name}`,
          });
        });
    });
  }

  return { routes, collisions };
}
