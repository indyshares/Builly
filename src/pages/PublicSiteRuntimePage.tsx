import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { ElementRenderer } from '../components/builder/ElementRenderer';
import { BuillyMadeWithBadge } from '../components/common/BuillyMadeWithBadge';
import { useEditorViewport } from '../config/breakpoints';
import { isRegionVisibleOnDevice } from '../services/componentLibraryService';
import {
  loadPublicRuntimeSnapshot,
  submitPublicRuntimeForm,
} from '../services/runtime/publishRuntimeClient';
import {
  CompiledRuntimePage,
  PublishedRuntimeSnapshot,
} from '../services/runtime/publishedSnapshotContract';
import { CmsContentRecord, CmsDocument } from '../types/cms';
import { ElementNode, PageDocument, SiteDocument } from '../types/builder';

interface PublicSiteRuntimePageProps {
  siteSlug: string;
  initialSubPath: string;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
}

function normalizePath(p: string): string {
  const cleaned = (p || '/').replace(/\/+$/, '');
  return cleaned.startsWith('/') ? cleaned || '/' : `/${cleaned}`;
}

export const PublicSiteRuntimePage: React.FC<PublicSiteRuntimePageProps> = ({
  siteSlug,
  initialSubPath,
  onNavigate,
}) => {
  const { viewportMode } = useEditorViewport();
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<PublishedRuntimeSnapshot | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string>(() => normalizePath(initialSubPath));

  useEffect(() => {
    setActivePath(normalizePath(initialSubPath));
  }, [initialSubPath]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);

    loadPublicRuntimeSnapshot(siteSlug).then((res) => {
      if (!active) return;
      if (res.found && res.snapshot) {
        setSnapshot(res.snapshot);
      } else {
        setSnapshot(null);
        setErrorMsg(res.error || null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [siteSlug]);

  // Reconstruct read-only public CmsDocument strictly from sanitized publicCms
  const publicCmsDoc = useMemo<CmsDocument | undefined>(() => {
    if (!snapshot?.publicCms) return undefined;
    return {
      schemaVersion: snapshot.publicCms.schemaVersion,
      revision: snapshot.publicCms.revision,
      contentTypes: snapshot.publicCms.contentTypes,
      records: snapshot.publicCms.records,
      taxonomies: snapshot.publicCms.taxonomies,
      terms: snapshot.publicCms.terms,
      relationships: snapshot.publicCms.relationships,
      richDocs: snapshot.publicCms.richDocs as CmsDocument['richDocs'],
      migrationLog: [],
      operationalLogs: [],
      storageHealth: { syncStatus: 'idle', syncedTabNames: [] },
      settings: snapshot.publicCms.settings,
    };
  }, [snapshot]);

  // Match either compiled static page or CMS archive/single detail route
  const resolvedRoute = useMemo<{
    page: CompiledRuntimePage | null;
    cmsRecord?: CmsContentRecord;
  }>(() => {
    if (!snapshot) return { page: null };
    const norm = normalizePath(activePath);
    const directPageId = snapshot.routes[norm];
    if (directPageId && snapshot.pages[directPageId]) {
      return { page: snapshot.pages[directPageId] };
    }

    // Check CMS generated single/archive routes
    const cmsRoute = (snapshot.cmsGeneratedRoutes || []).find(
      (r) => normalizePath(r.fullPath) === norm
    );
    if (cmsRoute && publicCmsDoc) {
      const rec = cmsRoute.recordId
        ? publicCmsDoc.records.find((r) => r.recordId === cmsRoute.recordId)
        : undefined;
      // Render using matching template/list page or fallback to home page shell
      const homePage =
        Object.values(snapshot.pages).find((p) => p.isHome) ||
        Object.values(snapshot.pages)[0] ||
        null;
      return { page: homePage, cmsRecord: rec };
    }

    return { page: null };
  }, [snapshot, activePath, publicCmsDoc]);

  // Minimal SiteDocument shell purely for theme/navigation prop compatibility in ElementRenderer
  const runtimeSiteShell = useMemo<SiteDocument | undefined>(() => {
    if (!snapshot) return undefined;
    const pages: PageDocument[] = Object.values(snapshot.pages).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      parentPageId: p.parentPageId,
      isHome: p.isHome,
      title: p.title,
      description: p.description,
      lastModified: p.compiledAt,
      status: 'published',
      navigation: {
        visible: snapshot.publishedRoutes.some((r) => r.pageId === p.id && r.navVisible),
        label: snapshot.publishedRoutes.find((r) => r.pageId === p.id)?.navLabel || p.name,
        order: snapshot.publishedRoutes.find((r) => r.pageId === p.id)?.order ?? 0,
      },
      rootElement: p.tree,
    }));

    return {
      id: snapshot.siteId,
      name: snapshot.siteName,
      portfolioSlug: snapshot.siteSlug,
      activeThemeId: snapshot.themeConfig?.themeId || 'default',
      themeConfig: snapshot.themeConfig,
      pages,
      activePageId: resolvedRoute.page?.id || pages[0]?.id || '',
      savedBlocks: [],
      mediaAssets: [],
      releases: [],
      cms: publicCmsDoc,
    };
  }, [snapshot, resolvedRoute.page, publicCmsDoc]);

  // Apply document title & SEO meta tags for visitor route
  useEffect(() => {
    if (!snapshot) return;
    const title = resolvedRoute.cmsRecord
      ? `${resolvedRoute.cmsRecord.title} — ${snapshot.siteName}`
      : resolvedRoute.page?.title || snapshot.siteName;
    document.title = title;
  }, [snapshot, resolvedRoute]);

  const handleNavigateInSite = (targetSlugOrPath: string) => {
    if (/^https?:\/\//i.test(targetSlugOrPath)) {
      window.open(targetSlugOrPath, '_blank', 'noopener,noreferrer');
      return;
    }
    const norm = normalizePath(targetSlugOrPath);
    setActivePath(norm);
    const fullUrl = norm === '/' ? `/${siteSlug}` : `/${siteSlug}${norm}`;
    onNavigate(fullUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRuntimeFormSubmit = async (
    formId: string,
    values: Record<string, any>,
    sourcePage?: string
  ): Promise<boolean> => {
    const res = await submitPublicRuntimeForm({
      siteSlug,
      formId,
      fields: values,
      sourcePage: sourcePage || activePath,
    });
    return res.ok;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 className="w-6 h-6 text-[#6C2CEB] animate-spin" />
        <p className="text-sm font-medium text-slate-600">Loading published site…</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Site Not Published</h1>
          <p className="text-sm text-slate-600">
            {errorMsg ||
              `No active published snapshot was found for "/${siteSlug}". Unpublished drafts remain private to the owner.`}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6C2CEB] text-white text-sm font-semibold hover:bg-[#5B21D6]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Builly</span>
          </button>
        </div>
      </div>
    );
  }

  const activePage = resolvedRoute.page;
  const navPages = snapshot.publishedRoutes.map((r) => ({
    id: r.pageId,
    name: r.navLabel || r.name,
    fullPath: r.fullPath,
    navVisible: r.navVisible,
    parentPageId: r.parentPageId,
  }));

  const showHeader =
    activePage &&
    activePage.headerTree &&
    isRegionVisibleOnDevice(activePage.headerVisibility, viewportMode);
  const showFooter =
    activePage &&
    activePage.footerTree &&
    isRegionVisibleOnDevice(activePage.footerVisibility, viewportMode);

  const fallbackHome =
    Object.values(snapshot.pages).find((p) => p.isHome) || Object.values(snapshot.pages)[0];
  const shellHeader: ElementNode | null = activePage
    ? showHeader
      ? activePage.headerTree
      : null
    : fallbackHome?.headerTree || null;
  const shellFooter: ElementNode | null = activePage
    ? showFooter
      ? activePage.footerTree
      : null
    : fallbackHome?.footerTree || null;

  return (
    <div
      className="min-h-screen portfolio-theme portfolio-site-surface flex flex-col"
      style={{
        ...(snapshot.themeCssVars as React.CSSProperties),
        backgroundColor: 'var(--color-background, #ffffff)',
        color: 'var(--color-text, #0f172a)',
        fontFamily: 'var(--font-body, system-ui, sans-serif)',
      }}
    >
      <style>{`${snapshot.themeCssText}\n${activePage?.compiledCss || ''}`}</style>

      {shellHeader && runtimeSiteShell && (
        <ElementRenderer
          node={shellHeader}
          isEditor={false}
          isRoot
          site={runtimeSiteShell}
          deviceMode={viewportMode}
          cms={publicCmsDoc}
          sitePages={navPages}
          activePagePath={activePath}
          onNavigatePage={handleNavigateInSite}
          onSubmitForm={handleRuntimeFormSubmit}
        />
      )}

      <main className="flex-1 w-full">
        {activePage && runtimeSiteShell ? (
          resolvedRoute.cmsRecord ? (
            <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
              <button
                type="button"
                onClick={() => handleNavigateInSite('/')}
                className="inline-flex items-center gap-1.5 text-sm font-medium opacity-75 hover:opacity-100"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <h1 className="text-3xl font-bold">{resolvedRoute.cmsRecord.title}</h1>
              {typeof resolvedRoute.cmsRecord.fields.summary === 'string' &&
                resolvedRoute.cmsRecord.fields.summary && (
                  <p className="text-lg opacity-80">
                    {resolvedRoute.cmsRecord.fields.summary}
                  </p>
                )}
              {typeof resolvedRoute.cmsRecord.fields.cover_image === 'string' &&
                resolvedRoute.cmsRecord.fields.cover_image && (
                  <img
                    src={resolvedRoute.cmsRecord.fields.cover_image}
                    alt={resolvedRoute.cmsRecord.title}
                    className="w-full rounded-xl object-cover max-h-[460px]"
                  />
                )}
            </div>
          ) : (
            <ElementRenderer
              node={activePage.tree}
              isEditor={false}
              isRoot
              site={runtimeSiteShell}
              deviceMode={viewportMode}
              cms={publicCmsDoc}
              sitePages={navPages}
              activePagePath={activePath}
              onNavigatePage={handleNavigateInSite}
              onSubmitForm={handleRuntimeFormSubmit}
            />
          )
        ) : (
          <div className="max-w-lg mx-auto py-24 px-6 text-center space-y-4">
            <h1 className="text-2xl font-bold">Page Not Found</h1>
            <p className="text-sm opacity-75">
              The route "{activePath}" is not part of this published site release.
            </p>
            <button
              type="button"
              onClick={() => handleNavigateInSite('/')}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            >
              Return Home
            </button>
          </div>
        )}
      </main>

      {shellFooter && runtimeSiteShell && (
        <ElementRenderer
          node={shellFooter}
          isEditor={false}
          isRoot
          site={runtimeSiteShell}
          deviceMode={viewportMode}
          cms={publicCmsDoc}
          sitePages={navPages}
          activePagePath={activePath}
          onNavigatePage={handleNavigateInSite}
          onSubmitForm={handleRuntimeFormSubmit}
        />
      )}

      <BuillyMadeWithBadge
        variant={shellFooter ? 'footer' : 'floating'}
        className={shellFooter ? undefined : 'fixed bottom-4 left-4 z-40'}
      />
    </div>
  );
};
