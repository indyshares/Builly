import {
  BuildRelease,
  ElementNode,
  GoogleWorkspaceState,
  PageDocument,
  SiteDocument,
} from '../types/builder';
import { CmsContentRecord, CmsDocument } from '../types/cms';
import { createThemeSnapshot } from './themeService';
import { compilePublishedPageCss } from './cssCompiler';
import { validateCustomCss } from './styleValidator';
import { resolvePageSlotComponent } from './componentLibraryService';
import {
  buildSiteNavigation,
  buildSitemapXml,
  resolvePageFullPath,
  validatePageSlug,
} from './pageService';
import {
  executeCmsQuery,
  resolveCmsDynamicFieldValue,
  resolveCmsRecordUrl,
} from './cms/cmsQueryEngine';
import { generateAndCheckCmsRoutes } from './cms/cmsValidation';
import {
  buildPublishedRuntimeSnapshot,
  buildSanitizedPublicCmsSnapshot,
} from './runtime/publishedSnapshotContract';

export interface PreflightReport {
  passed: boolean;
  pageCount: number;
  selectedPageCount: number;
  publishedRouteCount: number;
  cmsRouteCount: number;
  totalElements: number;
  dynamicBindingsCount: number;
  sheetsConnected: boolean;
  warnings: string[];
  errors: string[];
}

export function getDefaultPublishPageIds(site: SiteDocument): string[] {
  const eligible = site.pages.filter(
    (p) => p.status !== 'unpublished' && p.status !== 'archived'
  );
  return eligible.map((p) => p.id);
}

export const compilerService = {
  /**
   * Preflight validation before multi-page + CMS release compilation
   */
  runPreflightCheck(
    site: SiteDocument,
    workspace: GoogleWorkspaceState,
    selectedPageIds?: string[]
  ): PreflightReport {
    const warnings: string[] = [];
    const errors: string[] = [];
    let totalElements = 0;
    let dynamicBindingsCount = 0;

    if (workspace.isDemoMode) {
      warnings.push(
        'Using local Demo sample data. Connect Google Workspace and link a spreadsheet for live production data.'
      );
    } else if (!workspace.connected) {
      errors.push(
        'Google Workspace is not connected. Connect your Google account and select a spreadsheet (or enable Demo Preview) before publishing.'
      );
    } else if (!workspace.spreadsheetLinked || !workspace.spreadsheet.id) {
      errors.push(
        'No Google Spreadsheet is linked to this portfolio. Choose or create a portfolio spreadsheet first.'
      );
    }

    if (site.pages.length === 0) {
      errors.push('Portfolio has no pages. Create a Home page before publishing.');
    } else if (!site.pages.some((p) => p.isHome)) {
      errors.push('Portfolio must have a designated Home page (/).');
    }

    const targetIds = new Set(selectedPageIds ?? getDefaultPublishPageIds(site));
    const targetPages = site.pages.filter((p) => targetIds.has(p.id));

    if (site.pages.length > 0 && targetPages.length === 0) {
      errors.push('Select at least one page to publish.');
    }

    const homePage = site.pages.find((p) => p.isHome);
    if (homePage && targetPages.length > 0 && !targetIds.has(homePage.id)) {
      errors.push(`Home page "${homePage.name}" must be included in the published site.`);
    }

    const seenPaths = new Map<string, string>();
    targetPages.forEach((page) => {
      const slugCheck = validatePageSlug(
        page.slug,
        targetPages,
        page.id,
        page.parentPageId,
        Boolean(page.isHome)
      );
      if (!slugCheck.valid) {
        errors.push(`Page "${page.name}": ${slugCheck.error}`);
      } else {
        const existingOwner = seenPaths.get(slugCheck.fullPath);
        if (existingOwner) {
          errors.push(
            `Route "${slugCheck.fullPath}" is duplicated between "${existingOwner}" and "${page.name}".`
          );
        } else {
          seenPaths.set(slugCheck.fullPath, page.name);
        }
      }

      if (page.parentPageId) {
        const parent = site.pages.find((p) => p.id === page.parentPageId);
        if (parent && !targetIds.has(parent.id)) {
          warnings.push(
            `Child page "${page.name}" is selected while its parent "${parent.name}" is excluded from publish.`
          );
        }
      }
    });

    const cms = site.cms;
    let cmsRouteCount = 0;
    if (cms) {
      const routeCheck = generateAndCheckCmsRoutes(cms, targetPages);
      cmsRouteCount = routeCheck.routes.length;
      routeCheck.collisions.forEach((c) => warnings.push(c.reason));
    }

    const traverse = (node: ElementNode) => {
      totalElements++;
      if (node.dynamicBinding?.enabled) {
        dynamicBindingsCount++;
        const binding = node.dynamicBinding;
        if (binding.source === 'cms') {
          const typeId = binding.contentTypeId || binding.tab;
          const schema = cms?.contentTypes.find((ct) => ct.id === typeId);
          if (!schema) {
            warnings.push(
              `Element "${node.name}" binds to missing CMS Content Type "${typeId}".`
            );
          } else if (
            !binding.field.startsWith('$') &&
            !binding.field.includes('.') &&
            !schema.fields.some((f) => f.key === binding.field)
          ) {
            warnings.push(
              `CMS field "${binding.field}" was not found in "${schema.pluralLabel}" for element "${node.name}".`
            );
          }
        } else if (binding.source === 'sheets' && workspace.spreadsheet.tabs.length > 0) {
          const tab = workspace.spreadsheet.tabs.find((t) => t.name === binding.tab);
          if (!tab) {
            warnings.push(
              `Element "${node.name}" binds to tab "${binding.tab}", which is not yet in the spreadsheet.`
            );
          } else if (!tab.columns.includes(binding.field)) {
            warnings.push(
              `Field "${binding.field}" not found in tab "${tab.name}" for element "${node.name}".`
            );
          }
        }
      }

      if (node.content?.cmsQuery) {
        const q = node.content.cmsQuery;
        const schema = cms?.contentTypes.find((ct) => ct.id === q.contentTypeId);
        if (!schema) {
          warnings.push(
            `Widget "${node.name}" queries missing CMS Content Type "${q.contentTypeId}".`
          );
        } else {
          const res = executeCmsQuery(cms, q, { mode: 'public_build' });
          if (res.records.length === 0) {
            warnings.push(
              `Widget "${node.name}" (${schema.pluralLabel}) currently matches 0 published CMS records.`
            );
          }
        }
      }

      if (
        node.type === 'repeater' &&
        (node.content?.repeaterSource || 'sheets') === 'sheets' &&
        node.content?.repeaterCollection &&
        workspace.spreadsheet.tabs.length > 0
      ) {
        const tab = workspace.spreadsheet.tabs.find(
          (t) => t.name === node.content?.repeaterCollection
        );
        if (!tab) {
          warnings.push(
            `Repeater "${node.name}" targets collection "${node.content.repeaterCollection}" which is not yet present.`
          );
        } else if (tab.rows.length === 0) {
          warnings.push(
            `Collection "${node.content.repeaterCollection}" currently has 0 rows.`
          );
        }
      }

      if (node.advanced?.customCss) {
        const cssCheck = validateCustomCss(node.advanced.customCss);
        cssCheck.errors.forEach((err) =>
          errors.push(`Element "${node.name}" Custom CSS: ${err}`)
        );
      }

      if (
        (node.type === 'navbar' || node.type === 'nav-menu') &&
        node.content?.navSource !== 'site-pages' &&
        node.content?.navLinks?.length
      ) {
        const checkLink = (lnk: { label: string; url: string; children?: any[] }) => {
          const url = (lnk.url || '').trim();
          if (
            url.startsWith('/') &&
            !url.startsWith('/#') &&
            !seenPaths.has(url) &&
            !targetPages.some((p) => resolvePageFullPath(p, targetPages) === url || p.slug === url)
          ) {
            warnings.push(
              `Navigation link "${lnk.label}" targets internal path "${url}" which is not in the published pages.`
            );
          }
          lnk.children?.forEach(checkLink);
        };
        node.content.navLinks.forEach(checkLink);
      }

      node.children?.forEach(traverse);
    };

    if (site.globalCss) {
      const siteCssCheck = validateCustomCss(site.globalCss);
      siteCssCheck.errors.forEach((err) => errors.push(`Site Custom CSS: ${err}`));
    }

    targetPages.forEach((page) => {
      if (page.customCss) {
        const pageCssCheck = validateCustomCss(page.customCss);
        pageCssCheck.errors.forEach((err) =>
          errors.push(`Page "${page.name}" Custom CSS: ${err}`)
        );
      }

      const hdrSlot = resolvePageSlotComponent(page, site, 'header');
      if (hdrSlot.missingError) errors.push(hdrSlot.missingError);
      else if (hdrSlot.component) traverse(hdrSlot.component.rootElement);

      traverse(page.rootElement);

      const ftrSlot = resolvePageSlotComponent(page, site, 'footer');
      if (ftrSlot.missingError) errors.push(ftrSlot.missingError);
      else if (ftrSlot.component) traverse(ftrSlot.component.rootElement);
    });

    return {
      passed: errors.length === 0,
      pageCount: site.pages.length,
      selectedPageCount: targetPages.length,
      publishedRouteCount: seenPaths.size + cmsRouteCount,
      cmsRouteCount,
      totalElements,
      dynamicBindingsCount,
      sheetsConnected: workspace.connected && workspace.spreadsheetLinked,
      warnings,
      errors,
    };
  },

  /**
   * Resolves dynamic bindings within an ElementNode tree against Sheets rows or immutable CMS records
   */
  resolveElementTree(
    node: ElementNode,
    workspace: GoogleWorkspaceState,
    contextRow?: Record<string, any>,
    cms?: CmsDocument,
    contextRecord?: CmsContentRecord
  ): ElementNode {
    const cloned: ElementNode = JSON.parse(JSON.stringify(node));
    const currentYear = String(new Date().getFullYear());
    if (cloned.content?.text && cloned.content.text.includes('{year}')) {
      cloned.content.text = cloned.content.text.replace(/\{year\}/gi, currentYear);
    }

    if (cloned.dynamicBinding?.enabled) {
      const binding = cloned.dynamicBinding;
      let val: unknown = undefined;

      if (binding.source === 'cms' || binding.source === 'context') {
        val = resolveCmsDynamicFieldValue(cms, binding, contextRecord, 'public_build');
      } else {
        const { tab: tabName, field } = binding;
        if (contextRow && contextRow[field] !== undefined) {
          val = contextRow[field];
        } else {
          const tab = workspace.spreadsheet.tabs.find((t) => t.name === tabName);
          if (tab && tab.rows.length > 0) {
            val = tab.rows[0][field];
          }
        }
      }

      if (val !== undefined && val !== null) {
        if (!cloned.content) cloned.content = {};
        if (cloned.type === 'image') {
          cloned.content.imageSrc = String(val);
        } else if (cloned.type === 'icon') {
          cloned.content.iconName = String(val);
        } else if (cloned.type === 'button' || cloned.type === 'link') {
          if (
            binding.field === '$url' ||
            cloned.content.dynamicLinkTarget === 'record-detail' ||
            binding.field.toLowerCase().includes('url') ||
            binding.field.toLowerCase().includes('link')
          ) {
            cloned.content.url =
              cloned.content.dynamicLinkTarget === 'record-detail' && contextRecord
                ? resolveCmsRecordUrl(cms, contextRecord)
                : String(val);
          } else {
            cloned.content.text = String(val);
          }
        } else {
          cloned.content.text = String(val);
        }
      }
    }

    // Handle Repeater elements (supports both CMS Content Types and Google Sheets tabs)
    if (cloned.type === 'repeater') {
      const templateChild = cloned.children?.[0];
      const useCms =
        cloned.content?.repeaterSource === 'cms' || Boolean(cloned.content?.cmsQuery);

      if (useCms && cms && templateChild) {
        const query = cloned.content?.cmsQuery || {
          contentTypeId: cloned.content?.repeaterCollection || 'project',
          statusFilter: 'published_only' as const,
          sortBy: cloned.content?.repeaterSortBy || 'sortOrder',
          sortDirection: cloned.content?.repeaterOrder || 'asc',
          limit: cloned.content?.repeaterLimit || 6,
        };
        const res = executeCmsQuery(cms, query, { mode: 'public_build' });
        cloned.children = res.records.map((rec, index) => {
          const childInstance = JSON.parse(JSON.stringify(templateChild));
          childInstance.id = `${childInstance.id}_cms_${index}`;
          return this.resolveElementTree(childInstance, workspace, contextRow, cms, rec);
        });
        return cloned;
      }

      if (cloned.content?.repeaterCollection && templateChild) {
        const tab = workspace.spreadsheet.tabs.find(
          (t) => t.name === cloned.content?.repeaterCollection
        );
        if (tab) {
          let rows = [...tab.rows];
          if (cloned.content.repeaterSortBy) {
            const sortBy = cloned.content.repeaterSortBy;
            const order = cloned.content.repeaterOrder === 'desc' ? -1 : 1;
            rows.sort((a, b) => {
              const va = a[sortBy] ?? '';
              const vb = b[sortBy] ?? '';
              return va > vb ? order : va < vb ? -order : 0;
            });
          }
          const limit = cloned.content.repeaterLimit || 10;
          rows = rows.slice(0, limit);
          cloned.children = rows.map((row, index) => {
            const childInstance = JSON.parse(JSON.stringify(templateChild));
            childInstance.id = `${childInstance.id}_rep_${index}`;
            return this.resolveElementTree(childInstance, workspace, row, cms, contextRecord);
          });
          return cloned;
        }
      }
    }

    if (cloned.children && cloned.children.length > 0) {
      cloned.children = cloned.children.map((child) =>
        this.resolveElementTree(child, workspace, contextRow, cms, contextRecord)
      );
    }

    return cloned;
  },

  /**
   * Compiles selected pages + immutable CMS snapshot & generated routes into a release artifact
   */
  compileRelease(
    site: SiteDocument,
    workspace: GoogleWorkspaceState,
    commitMessage: string,
    selectedPageIds?: string[]
  ): BuildRelease {
    const nextVersionNum = site.releases.length + 1;
    const version = `v1.0.${nextVersionNum - 1}`;
    const targetIds = new Set(selectedPageIds ?? getDefaultPublishPageIds(site));

    const updatedPages: PageDocument[] = site.pages.map((page) => {
      if (targetIds.has(page.id)) {
        return { ...page, status: 'published' };
      }
      return page;
    });

    const compiledSourcePages = updatedPages.filter((p) => targetIds.has(p.id));
    const compiledPages: Record<string, string> = {};
    const compiledAt = new Date().toISOString();

    compiledSourcePages.forEach((page) => {
      const fullPath = resolvePageFullPath(page, updatedPages);
      const resolvedTree = this.resolveElementTree(
        page.rootElement,
        workspace,
        undefined,
        site.cms
      );
      const headerSlot = resolvePageSlotComponent(page, site, 'header');
      const footerSlot = resolvePageSlotComponent(page, site, 'footer');
      const resolvedHeaderTree = headerSlot.component
        ? this.resolveElementTree(headerSlot.component.rootElement, workspace, undefined, site.cms)
        : null;
      const resolvedFooterTree = footerSlot.component
        ? this.resolveElementTree(footerSlot.component.rootElement, workspace, undefined, site.cms)
        : null;
      const resolvedPage: PageDocument = { ...page, rootElement: resolvedTree };
      const compiledCss = compilePublishedPageCss(resolvedPage, site);
      compiledPages[fullPath] = JSON.stringify({
        id: page.id,
        name: page.name,
        slug: page.slug,
        fullPath,
        isHome: Boolean(page.isHome),
        parentPageId: page.parentPageId || null,
        title: page.title,
        description: page.description,
        canonicalPath: page.canonicalPath,
        ogImage: page.ogImage,
        noIndex: Boolean(page.noIndex),
        headerMode: headerSlot.mode,
        footerMode: footerSlot.mode,
        headerTree: resolvedHeaderTree,
        tree: resolvedTree,
        footerTree: resolvedFooterTree,
        compiledCss,
        compiledAt,
      });
    });

    const publishedRoutes = buildSiteNavigation(updatedPages, { includeDrafts: false });
    const cmsRouteAnalysis = site.cms
      ? generateAndCheckCmsRoutes(site.cms, compiledSourcePages)
      : { routes: [], collisions: [] };

    const allPublishedEntries = [
      ...compiledSourcePages.map((p, idx) => ({
        pageId: p.id,
        name: p.name,
        fullPath: resolvePageFullPath(p, updatedPages),
        navLabel: p.navigation?.label || p.name,
        navVisible: p.navigation?.visible !== false,
        parentPageId: p.parentPageId || null,
        isHome: Boolean(p.isHome),
        order: p.navigation?.order ?? idx,
        title: p.title,
        noIndex: p.noIndex,
      })),
      ...cmsRouteAnalysis.routes.map((r, idx) => ({
        pageId: `cms_${r.contentTypeId}_${r.recordId || r.termId || idx}`,
        name: r.title,
        fullPath: r.fullPath,
        navLabel: r.title,
        navVisible: false,
        parentPageId: null,
        isHome: false,
        order: 1000 + idx,
        title: r.title,
        noIndex: false,
      })),
    ];

    const sitemapXml = buildSitemapXml(site.portfolioSlug, allPublishedEntries);

    const sanitizedPublicCms = buildSanitizedPublicCmsSnapshot(site.cms);
    const cmsSnapshot: CmsDocument | undefined =
      site.cms && sanitizedPublicCms
        ? {
            schemaVersion: sanitizedPublicCms.schemaVersion,
            revision: sanitizedPublicCms.revision,
            contentTypes: sanitizedPublicCms.contentTypes,
            records: sanitizedPublicCms.records,
            taxonomies: sanitizedPublicCms.taxonomies,
            terms: sanitizedPublicCms.terms,
            relationships: sanitizedPublicCms.relationships,
            richDocs: sanitizedPublicCms.richDocs as CmsDocument['richDocs'],
            migrationLog: [],
            operationalLogs: [],
            storageHealth: { syncStatus: 'idle', syncedTabNames: [] },
            settings: sanitizedPublicCms.settings,
          }
        : undefined;

    const versionId = `ver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const buildId = `bld_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const timestampStr = nowIso.replace('T', ' ').substring(0, 16) + ' UTC';
    const commitMsg = commitMessage || `Automated build ${version} with resolved Workspace & CMS data`;

    const releaseBase: BuildRelease = {
      version_id: versionId,
      site_id: site.portfolioSlug || 'site_builly_default',
      version_number: version,
      release_name: `Release ${version}`,
      description: commitMsg,
      build_id: buildId,
      artifact_url: `local_stage_${buildId}`,
      snapshot_id: `local_cms_${version}`,
      manifest_url: `local_manifest_${buildId}`,
      artifact_hash: '',
      status: 'Active',
      is_active: true,
      created_at: timestampStr,
      created_by: workspace.userEmail || 'owner@builly.indyshares.com',
      deleted_at: null,
      deleted_by: null,

      version,
      timestamp: timestampStr,
      commitMessage: commitMsg,
      pageCount: compiledSourcePages.length,
      artifactSize: `${Math.floor(
        240 + compiledSourcePages.length * 45 + cmsRouteAnalysis.routes.length * 8
      )} KB`,
      driveFileId: `local_stage_${buildId}`,
      publishTarget: 'local_staging',
      compiledPages,
      publishedRoutes,
      sitemapXml,
      pagesSnapshot: JSON.parse(JSON.stringify(updatedPages)),
      themeSnapshot: createThemeSnapshot(site),
      globalComponentsSnapshot: site.globalComponents
        ? JSON.parse(JSON.stringify(site.globalComponents))
        : undefined,
      cmsSnapshot,
      cmsGeneratedRoutes: cmsRouteAnalysis.routes,
    };

    const runtimeSnapshot = buildPublishedRuntimeSnapshot({
      site,
      release: releaseBase,
      workspace,
    });
    const runtimeSnapshotJson = JSON.stringify(runtimeSnapshot);
    const byteKb = Math.max(1, Math.round(new Blob([runtimeSnapshotJson]).size / 1024));

    const release: BuildRelease = {
      ...releaseBase,
      artifact_hash: runtimeSnapshot.integrityHash,
      artifactSize: `${byteKb} KB`,
      runtimeSnapshotJson,
    };

    return release;
  },
};
