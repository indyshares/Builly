import {
  BuildRelease,
  ElementNode,
  GoogleWorkspaceState,
  PageDocument,
  PublishedRouteEntry,
  RegionResponsiveVisibility,
  SiteDocument,
  SiteThemeConfig,
} from '../../types/builder';
import {
  CmsContentRecord,
  CmsContentTypeSchema,
  CmsDocument,
  CmsFormField,
  CmsFormSettings,
  CmsGeneratedRoute,
  CmsRelationshipDef,
  CmsRichContentDoc,
  CmsSettings,
  CmsTaxonomy,
  CmsTerm,
} from '../../types/cms';
import { sanitizePublicRecord } from '../cms/cmsQueryEngine';
import { isSafeRedirectUrl } from '../cms/cmsValidation';
import { resolvePageSlotComponent } from '../componentLibraryService';
import { compilePublishedPageCss } from '../cssCompiler';
import { resolvePageFullPath } from '../pageService';
import { buildThemeCssVariablesText, resolveEffectiveTheme } from '../themeService';
import { validateRuntimeNodeTree } from './componentRuntimeRegistry';

export const PUBLISHED_CONFIG_SCHEMA_VERSION = 1;
export const RUNTIME_MIN_VERSION = '1.0.0';
export const RUNTIME_COMPATIBILITY_RANGE = '>=1.0.0 <2.0.0';
export const RUNTIME_CURRENT_VERSION = '1.0.0';

export interface CompiledRuntimePage {
  id: string;
  name: string;
  slug: string;
  fullPath: string;
  isHome: boolean;
  parentPageId: string | null;
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  noIndex: boolean;
  headerMode: 'global' | 'local' | 'none';
  footerMode: 'global' | 'local' | 'none';
  headerVisibility: RegionResponsiveVisibility;
  footerVisibility: RegionResponsiveVisibility;
  headerTree: ElementNode | null;
  tree: ElementNode;
  footerTree: ElementNode | null;
  compiledCss: string;
  compiledAt: string;
}

export interface PublicFormDefinition {
  formId: string;
  name: string;
  description?: string;
  publicCategoryId?: string;
  status: 'active';
  fields: CmsFormField[];
  settings: CmsFormSettings;
}

export interface PublicCmsSnapshot {
  schemaVersion: number;
  revision: number;
  contentTypes: CmsContentTypeSchema[];
  records: CmsContentRecord[];
  taxonomies: CmsTaxonomy[];
  terms: CmsTerm[];
  relationships: CmsRelationshipDef[];
  richDocs: Record<string, Pick<CmsRichContentDoc, 'docId' | 'recordId' | 'fieldKey' | 'format' | 'content' | 'updatedAt'>>;
  settings: CmsSettings;
}

export interface PublicAssetReference {
  id: string;
  name: string;
  mimeType?: string;
  category: string;
  dimensions?: { width: number; height: number };
  altText?: string;
  svgSanitized?: boolean;
  driveFileId?: string;
  publicUrl: string;
}

export interface PublishedRuntimeSnapshot {
  schemaVersion: number;
  runtimeMinVersion: string;
  runtimeCompatibility: string;
  siteId: string;
  siteSlug: string;
  siteName: string;
  publishVersion: string;
  buildId: string;
  createdAt: string;
  integrityHash: string;
  themeConfig?: SiteThemeConfig;
  themeCssVars: Record<string, string>;
  themeCssText: string;
  routes: Record<string, string>;
  publishedRoutes: PublishedRouteEntry[];
  cmsGeneratedRoutes: CmsGeneratedRoute[];
  sitemapXml: string;
  pages: Record<string, CompiledRuntimePage>;
  publicCms?: PublicCmsSnapshot;
  publicForms: Record<string, PublicFormDefinition>;
  publicAssets: Record<string, PublicAssetReference>;
  warnings: string[];
}

export interface PublishManifest {
  manifestVersion: number;
  schemaVersion: number;
  runtimeMinVersion: string;
  runtimeCompatibility: string;
  siteId: string;
  siteSlug: string;
  publishVersion: string;
  buildId: string;
  commitMessage: string;
  createdAt: string;
  integrityHash: string;
  runtimeConfigFileName: string;
  runtimeConfigDriveFileId?: string;
  pageCount: number;
  routePaths: string[];
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function validateRuntimeSnapshotCompatibility(snapshot: {
  schemaVersion?: number;
  runtimeMinVersion?: string;
}): { compatible: boolean; reason?: string } {
  if (typeof snapshot.schemaVersion !== 'number' || snapshot.schemaVersion > PUBLISHED_CONFIG_SCHEMA_VERSION) {
    return {
      compatible: false,
      reason: `Unsupported published schemaVersion (${snapshot.schemaVersion ?? 'missing'}). Current runtime supports up to v${PUBLISHED_CONFIG_SCHEMA_VERSION}.`,
    };
  }
  if (
    snapshot.runtimeMinVersion &&
    compareSemver(snapshot.runtimeMinVersion, RUNTIME_CURRENT_VERSION) > 0
  ) {
    return {
      compatible: false,
      reason: `Snapshot requires runtime >= ${snapshot.runtimeMinVersion}, current runtime is ${RUNTIME_CURRENT_VERSION}.`,
    };
  }
  return { compatible: true };
}

export function computeDeterministicShaLikeHash(input: string): string {
  // Deterministic 64-hex hash representation usable synchronously in browser/tests
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fnv_${part1}${part2}_${input.length.toString(16)}`;
}

export async function computeSnapshotIntegrityHashAsync(
  snapshotWithoutHash: Omit<PublishedRuntimeSnapshot, 'integrityHash'>
): Promise<string> {
  const serialized = JSON.stringify(snapshotWithoutHash);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(serialized);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256_${hex}`;
  }
  return computeDeterministicShaLikeHash(serialized);
}

/**
 * Produces a strictly secret-free PublicCmsSnapshot:
 * - Only enabled & publiclyPublishable content types
 * - Only publiclyExposed !== false fields
 * - Only status === 'published' records
 * - Never includes Inbox submissions, notes, activities, operational logs, or form destinations
 */
export function buildSanitizedPublicCmsSnapshot(cms?: CmsDocument): PublicCmsSnapshot | undefined {
  if (!cms) return undefined;

  const rawTypeMap = new Map<string, CmsContentTypeSchema>();
  cms.contentTypes
    .filter((ct) => ct.enabled && ct.publiclyPublishable)
    .forEach((ct) => rawTypeMap.set(ct.id, ct));

  const publicContentTypes = Array.from(rawTypeMap.values()).map((ct) => ({
    ...ct,
    fields: ct.fields.filter((f) => f.publiclyExposed !== false),
  }));

  const publishedRecordIds = new Set<string>();
  const rawPublished = cms.records.filter(
    (rec) => rec.status === 'published' && rawTypeMap.has(rec.contentTypeId)
  );
  rawPublished.forEach((r) => publishedRecordIds.add(r.recordId));

  const publicRecords: CmsContentRecord[] = rawPublished.map((rec) => {
    const rawSchema = rawTypeMap.get(rec.contentTypeId);
    const sanitized = sanitizePublicRecord(rec, rawSchema);
    // Strip relation IDs pointing to non-published records when required
    const filteredRelations: Record<string, string[]> = {};
    Object.entries(sanitized.relationIdsByField || {}).forEach(([fieldKey, targetIds]) => {
      const validIds = cms.settings.requirePublishedRelationsForPublic
        ? targetIds.filter((tid) => publishedRecordIds.has(tid))
        : targetIds;
      if (validIds.length > 0) filteredRelations[fieldKey] = validIds;
    });
    return {
      ...sanitized,
      relationIdsByField: filteredRelations,
    };
  });

  const referencedRichDocIds = new Set<string>();
  publicRecords.forEach((rec) => {
    Object.values(rec.richContentRefs || {}).forEach((docId) => {
      if (docId) referencedRichDocIds.add(docId);
    });
  });

  const publicRichDocs: PublicCmsSnapshot['richDocs'] = {};
  referencedRichDocIds.forEach((docId) => {
    const doc = cms.richDocs?.[docId];
    if (doc) {
      publicRichDocs[docId] = {
        docId: doc.docId,
        recordId: doc.recordId,
        fieldKey: doc.fieldKey,
        format: doc.format,
        content: doc.content,
        updatedAt: doc.updatedAt,
      };
    }
  });

  return {
    schemaVersion: cms.schemaVersion,
    revision: cms.revision,
    contentTypes: JSON.parse(JSON.stringify(publicContentTypes)),
    records: JSON.parse(JSON.stringify(publicRecords)),
    taxonomies: JSON.parse(JSON.stringify(cms.taxonomies || [])),
    terms: JSON.parse(JSON.stringify(cms.terms || [])),
    relationships: JSON.parse(JSON.stringify(cms.relationships || [])),
    richDocs: JSON.parse(JSON.stringify(publicRichDocs)),
    settings: JSON.parse(JSON.stringify(cms.settings)),
  };
}

/**
 * Produces strictly public Form definitions for runtime rendering & validation.
 * Strips destination (spreadsheetId, driveFolderId, worksheetName) and fieldMappings.
 */
export function buildSanitizedPublicForms(cms?: CmsDocument): Record<string, PublicFormDefinition> {
  const result: Record<string, PublicFormDefinition> = {};
  if (!cms?.forms) return result;

  for (const form of cms.forms) {
    if (form.status !== 'active') continue;
    const safeRedirect =
      form.settings.successAction === 'redirect' && form.settings.redirectUrl
        ? isSafeRedirectUrl(form.settings.redirectUrl)
          ? form.settings.redirectUrl
          : undefined
        : undefined;

    result[form.formId] = {
      formId: form.formId,
      name: form.name,
      description: form.description,
      publicCategoryId: form.categoryId,
      status: 'active',
      fields: JSON.parse(JSON.stringify(form.fields || [])),
      settings: {
        ...form.settings,
        ...(safeRedirect
          ? { redirectUrl: safeRedirect }
          : form.settings.successAction === 'redirect'
          ? { successAction: 'message' as const, redirectUrl: undefined }
          : {}),
      },
    };
  }
  return result;
}

export function buildPublicAssetRegistry(site: SiteDocument): Record<string, PublicAssetReference> {
  const map: Record<string, PublicAssetReference> = {};
  const slug = site.portfolioSlug || 'site';
  for (const asset of site.mediaAssets || []) {
    const hasRealDriveId =
      Boolean(asset.driveFileId) &&
      !asset.driveFileId!.startsWith('local_asset_') &&
      !asset.driveFileId!.startsWith('drv_agent_');
    const publicUrl = hasRealDriveId
      ? `/api/public/sites/${encodeURIComponent(slug)}/assets/${encodeURIComponent(asset.driveFileId!)}`
      : asset.url;

    map[asset.id] = {
      id: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      category: asset.category || 'other',
      dimensions: asset.dimensions,
      altText: asset.altText,
      svgSanitized: asset.svgSanitized,
      ...(hasRealDriveId ? { driveFileId: asset.driveFileId } : {}),
      publicUrl,
    };
  }
  return map;
}

export function buildPublishedRuntimeSnapshot(params: {
  site: SiteDocument;
  release: BuildRelease;
  workspace?: GoogleWorkspaceState;
  resolvedTreesByPage?: Record<
    string,
    { headerTree: ElementNode | null; tree: ElementNode; footerTree: ElementNode | null }
  >;
}): PublishedRuntimeSnapshot {
  const { site, release, resolvedTreesByPage } = params;
  const warnings: string[] = [];
  const effectiveTheme = resolveEffectiveTheme(site);
  const themeCssText = buildThemeCssVariablesText(effectiveTheme.colors, effectiveTheme.baseTheme);

  const routes: Record<string, string> = {};
  const pages: Record<string, CompiledRuntimePage> = {};

  const sourcePages: PageDocument[] =
    release.pagesSnapshot && release.pagesSnapshot.length > 0 ? release.pagesSnapshot : site.pages;

  Object.entries(release.compiledPages || {}).forEach(([fullPath, rawJson]) => {
    try {
      const parsed = JSON.parse(rawJson) as {
        id: string;
        name: string;
        slug: string;
        fullPath: string;
        isHome: boolean;
        parentPageId: string | null;
        title: string;
        description: string;
        canonicalPath?: string;
        ogImage?: string;
        noIndex: boolean;
        headerMode: 'global' | 'local' | 'none';
        footerMode: 'global' | 'local' | 'none';
        headerTree: ElementNode | null;
        tree: ElementNode;
        footerTree: ElementNode | null;
        compiledCss: string;
        compiledAt: string;
      };

      const sourcePage = sourcePages.find((p) => p.id === parsed.id);
      const headerSlot = resolvePageSlotComponent(sourcePage, site, 'header');
      const footerSlot = resolvePageSlotComponent(sourcePage, site, 'footer');

      const treeInput = resolvedTreesByPage?.[parsed.id]?.tree || parsed.tree;
      const headerInput = resolvedTreesByPage?.[parsed.id]?.headerTree ?? parsed.headerTree;
      const footerInput = resolvedTreesByPage?.[parsed.id]?.footerTree ?? parsed.footerTree;

      const bodyCheck = validateRuntimeNodeTree(treeInput);
      warnings.push(...bodyCheck.warnings);

      const headerCheck = headerInput ? validateRuntimeNodeTree(headerInput) : null;
      if (headerCheck) warnings.push(...headerCheck.warnings);

      const footerCheck = footerInput ? validateRuntimeNodeTree(footerInput) : null;
      if (footerCheck) warnings.push(...footerCheck.warnings);

      const normalizedPath = fullPath || resolvePageFullPath(sourcePage || ({} as PageDocument), sourcePages);
      routes[normalizedPath] = parsed.id;

      pages[parsed.id] = {
        id: parsed.id,
        name: parsed.name,
        slug: parsed.slug,
        fullPath: normalizedPath,
        isHome: Boolean(parsed.isHome),
        parentPageId: parsed.parentPageId || null,
        title: parsed.title,
        description: parsed.description,
        canonicalPath: parsed.canonicalPath,
        ogImage: parsed.ogImage,
        noIndex: Boolean(parsed.noIndex),
        headerMode: parsed.headerMode || headerSlot.mode,
        footerMode: parsed.footerMode || footerSlot.mode,
        headerVisibility: headerSlot.responsiveVisibility,
        footerVisibility: footerSlot.responsiveVisibility,
        headerTree: headerCheck ? headerCheck.sanitizedTree : null,
        tree: bodyCheck.sanitizedTree,
        footerTree: footerCheck ? footerCheck.sanitizedTree : null,
        compiledCss: parsed.compiledCss || (sourcePage ? compilePublishedPageCss(sourcePage, site) : ''),
        compiledAt: parsed.compiledAt || release.timestamp,
      };
    } catch {
      warnings.push(`Skipped malformed compiled page payload for route "${fullPath}".`);
    }
  });

  const baseSnapshot: Omit<PublishedRuntimeSnapshot, 'integrityHash'> = {
    schemaVersion: PUBLISHED_CONFIG_SCHEMA_VERSION,
    runtimeMinVersion: RUNTIME_MIN_VERSION,
    runtimeCompatibility: RUNTIME_COMPATIBILITY_RANGE,
    siteId: release.site_id || site.id || site.portfolioSlug,
    siteSlug: site.portfolioSlug,
    siteName: site.name,
    publishVersion: release.version,
    buildId: release.build_id || `bld_${release.version}`,
    createdAt: new Date().toISOString(),
    themeConfig: site.themeConfig ? JSON.parse(JSON.stringify(site.themeConfig)) : undefined,
    themeCssVars: { ...effectiveTheme.cssVars },
    themeCssText,
    routes,
    publishedRoutes: JSON.parse(JSON.stringify(release.publishedRoutes || [])),
    cmsGeneratedRoutes: JSON.parse(JSON.stringify(release.cmsGeneratedRoutes || [])),
    sitemapXml: release.sitemapXml || '',
    pages,
    publicCms: buildSanitizedPublicCmsSnapshot(release.cmsSnapshot || site.cms),
    publicForms: buildSanitizedPublicForms(site.cms || release.cmsSnapshot),
    publicAssets: buildPublicAssetRegistry(site),
    warnings: Array.from(new Set(warnings)),
  };

  return {
    ...baseSnapshot,
    integrityHash: computeDeterministicShaLikeHash(JSON.stringify(baseSnapshot)),
  };
}

export function buildPublishManifest(
  snapshot: PublishedRuntimeSnapshot,
  commitMessage: string,
  runtimeConfigDriveFileId?: string
): PublishManifest {
  return {
    manifestVersion: 1,
    schemaVersion: snapshot.schemaVersion,
    runtimeMinVersion: snapshot.runtimeMinVersion,
    runtimeCompatibility: snapshot.runtimeCompatibility,
    siteId: snapshot.siteId,
    siteSlug: snapshot.siteSlug,
    publishVersion: snapshot.publishVersion,
    buildId: snapshot.buildId,
    commitMessage,
    createdAt: snapshot.createdAt,
    integrityHash: snapshot.integrityHash,
    runtimeConfigFileName: 'runtime-config.json',
    ...(runtimeConfigDriveFileId ? { runtimeConfigDriveFileId } : {}),
    pageCount: Object.keys(snapshot.pages).length,
    routePaths: Object.keys(snapshot.routes),
  };
}

/**
 * Defensive server/runtime scrubber ensuring no private Inbox, OAuth, or Spreadsheet IDs
 * can ever leak through a loaded PublishedRuntimeSnapshot object.
 */
const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  'ownerId',
  'owner_id',
  'owner_account_id',
  'accessToken',
  'refreshToken',
  'spreadsheetId',
  'spreadsheet_id',
  'destination_spreadsheet_id',
  'inbox_registry_spreadsheet_id',
  'inboxSubmissions',
  'inboxCategories',
  'inboxNotes',
  'inboxActivities',
  'operationalLogs',
  'storageHealth',
  'destination',
  'fieldMappings',
  'driveFolderId',
]);

function scrubForbiddenKeysDeep(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 20) return;
  if (Array.isArray(value)) {
    for (const item of value) scrubForbiddenKeysDeep(item, depth + 1);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_SNAPSHOT_KEYS.has(key)) {
      delete obj[key];
    } else {
      scrubForbiddenKeysDeep(obj[key], depth + 1);
    }
  }
}

export function stripSecretsFromPublishedSnapshot(
  raw: PublishedRuntimeSnapshot & Record<string, unknown>
): PublishedRuntimeSnapshot {
  const copy = JSON.parse(JSON.stringify(raw)) as PublishedRuntimeSnapshot & Record<string, unknown>;
  scrubForbiddenKeysDeep(copy);
  if (copy.publicCms) {
    const cmsAny = copy.publicCms as unknown as Record<string, unknown>;
    delete cmsAny.forms;
    if (Array.isArray(copy.publicCms.records)) {
      copy.publicCms.records = copy.publicCms.records.filter((r) => r.status === 'published');
    }
  }
  return copy;
}

