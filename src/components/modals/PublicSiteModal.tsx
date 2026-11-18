import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceMode, GoogleWorkspaceState, SiteDocument } from '../../types/builder';
import { BREAKPOINTS } from '../../config/breakpoints';
import { portfolioThemeRootStyle, resolveEffectiveTheme } from '../../services/themeService';
import { compilePreviewPageCss } from '../../services/cssCompiler';
import {
  isRegionVisibleOnDevice,
  resolvePageSlotComponent,
} from '../../services/componentLibraryService';
import {
  buildSiteNavigation,
  resolvePageFullPath,
  resolvePublicPortfolioUrl,
} from '../../services/pageService';
import { ElementRenderer } from '../builder/ElementRenderer';
import { CmsSurfaceProvider } from '../builder/CmsDynamicWidgets';
import { BuillyMadeWithBadge } from '../common/BuillyMadeWithBadge';
import {
  Monitor,
  Tablet,
  Smartphone,
  X,
  ShieldCheck,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';

interface PublicSiteModalProps {
  isOpen: boolean;
  site: SiteDocument;
  workspace: GoogleWorkspaceState;
  onClose: () => void;
  previewReleaseVersion?: string | null;
  onOpenRuntimeRoute?: (path: string) => void;
  onSubmitForm?: (
    formId: string,
    values: Record<string, any>,
    sourcePage?: string
  ) => Promise<boolean | void> | boolean | void;
}

export const PublicSiteModal: React.FC<PublicSiteModalProps> = ({
  isOpen,
  site,
  workspace,
  onClose,
  previewReleaseVersion,
  onOpenRuntimeRoute,
  onSubmitForm,
}) => {
  const { t } = useTranslation();
  const [activePath, setActivePath] = useState<string>('/');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [previewDrafts, setPreviewDrafts] = useState<boolean>(false);

  const targetRelease = useMemo(() => {
    if (!previewReleaseVersion) return null;
    return site.releases.find((r) => r.version === previewReleaseVersion) || null;
  }, [site.releases, previewReleaseVersion]);

  const hasArtifactError = Boolean(previewReleaseVersion && (!targetRelease || !targetRelease.pagesSnapshot));

  const previewSite = useMemo<SiteDocument>(() => {
    if (!targetRelease || !targetRelease.pagesSnapshot) return site;
    const snap = targetRelease.themeSnapshot;
    return {
      ...site,
      pages: targetRelease.pagesSnapshot,
      globalComponents: targetRelease.globalComponentsSnapshot || site.globalComponents,
      cms: targetRelease.cmsSnapshot || site.cms,
      activeReleaseVersion: targetRelease.version,
      ...(snap
        ? {
            activeThemeId: snap.themeId,
            themeConfig: {
              schemaVersion: 2,
              themeId: snap.themeId,
              themeVersion: snap.themeVersion,
              colorOverrides: { ...snap.colorOverrides },
              updatedAt: new Date().toISOString(),
            },
          }
        : {}),
    };
  }, [site, targetRelease]);

  const activeSite = previewReleaseVersion ? previewSite : site;

  const activeRelease = useMemo(
    () => targetRelease || site.releases.find((r) => r.version === site.activeReleaseVersion) || site.releases[0],
    [targetRelease, site.releases, site.activeReleaseVersion]
  );
  const effectiveCms = previewDrafts ? activeSite.cms : activeRelease?.cmsSnapshot || activeSite.cms;

  const matchedCmsRoute = useMemo(() => {
    if (!activeRelease?.cmsGeneratedRoutes) return null;
    return activeRelease.cmsGeneratedRoutes.find((r) => r.fullPath === activePath);
  }, [activeRelease, activePath]);

  const matchedCmsRecord = useMemo(() => {
    if (!matchedCmsRoute || matchedCmsRoute.kind !== 'cms-single' || !effectiveCms) return null;
    return effectiveCms.records.find((rec) => rec.recordId === matchedCmsRoute.recordId) || null;
  }, [matchedCmsRoute, effectiveCms]);

  const navItems = useMemo(
    () => buildSiteNavigation(activeSite.pages, { includeDrafts: previewDrafts }),
    [activeSite.pages, previewDrafts]
  );

  const sitePagesNav = useMemo(
    () =>
      navItems.map((item) => ({
        id: item.pageId,
        name: item.navLabel,
        fullPath: item.fullPath,
        navVisible: item.navVisible,
        parentPageId: item.parentPageId || null,
      })),
    [navItems]
  );

  const currentPage = useMemo(() => {
    if (matchedCmsRoute) {
      return (
        activeSite.pages.find((p) => p.cmsTemplateTypeId === matchedCmsRoute.contentTypeId) ||
        activeSite.pages.find((p) => p.isHome) ||
        activeSite.pages[0] ||
        null
      );
    }

    const eligiblePages = activeSite.pages.filter((p) => {
      const status = p.status || 'published';
      if (status === 'unpublished' || status === 'archived') return false;
      if (!previewDrafts && status === 'draft') return false;
      return true;
    });

    const matchByPath = eligiblePages.find(
      (p) => resolvePageFullPath(p, activeSite.pages) === activePath || p.slug === activePath
    );
    if (matchByPath) return matchByPath;

    const matchByRedirect = eligiblePages.find((p) =>
      p.redirectFromSlugs?.includes(activePath)
    );
    if (matchByRedirect) return matchByRedirect;

    if (activePath === '/') {
      return eligiblePages.find((p) => p.isHome) || eligiblePages[0] || null;
    }
    return null;
  }, [activeSite.pages, activePath, previewDrafts, matchedCmsRoute]);

  const compiledCss = useMemo(() => {
    if (!currentPage) return '';
    return compilePreviewPageCss(currentPage, activeSite, deviceMode, { isEditor: false });
  }, [currentPage, activeSite, deviceMode]);

  const headerSlot = useMemo(
    () => (currentPage ? resolvePageSlotComponent(currentPage, activeSite, 'header') : null),
    [currentPage, activeSite]
  );
  const footerSlot = useMemo(
    () => (currentPage ? resolvePageSlotComponent(currentPage, activeSite, 'footer') : null),
    [currentPage, activeSite]
  );
  const hasVisibleFooter = Boolean(
    footerSlot?.component && isRegionVisibleOnDevice(footerSlot.responsiveVisibility, deviceMode)
  );

  if (!isOpen) return null;

  if (hasArtifactError) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-red-500/40 rounded-xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-400 font-bold text-xl">
            !
          </div>
          <h2 className="text-white font-semibold text-lg">{t('sidebar.releases.previewModeTitle')}</h2>
          <p className="text-xs text-red-300">
            {t('sidebar.releases.artifactMissingError', { version: previewReleaseVersion })}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {t('common.back', 'Back')}
          </button>
        </div>
      </div>
    );
  }

  const effectiveTheme = resolveEffectiveTheme(activeSite);
  const resolvedCurrentPath = currentPage ? resolvePageFullPath(currentPage, activeSite.pages) : activePath;
  const displayUrl = resolvePublicPortfolioUrl(activeSite.portfolioSlug, resolvedCurrentPath);

  const getContainerWidth = () => {
    switch (deviceMode) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      case 'desktop':
      default:
        return '100%';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col p-2 sm:p-4 select-none">
      {/* Top Browser Bar & Controls */}
      <div className="min-h-[48px] bg-slate-900 border border-slate-800 rounded-t-xl px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-4 shrink-0 text-slate-300">
        {/* Left: Home & Route Jump */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActivePath('/')}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center hover:text-white hover:bg-slate-800 rounded-md"
            title={t('modals.publicSite.homeTooltip')}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {navItems.length > 0 && (
            <select
              aria-label={t('modals.publicSite.routeAria')}
              value={resolvedCurrentPath}
              onChange={(e) => setActivePath(e.target.value)}
              className="hidden sm:block min-h-[34px] max-w-[160px] px-2 py-1 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200"
            >
              {navItems.map((item) => (
                <option key={item.pageId} value={item.fullPath}>
                  {item.navLabel} ({item.fullPath})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Center: Responsive Address Bar */}
        <div className="flex-1 min-w-0 max-w-xl mx-auto flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="truncate flex-1 min-w-0 text-slate-200">{displayUrl}</div>
          {previewReleaseVersion ? (
            <span className="hidden md:inline text-[11px] text-blue-300 bg-blue-500/20 border border-blue-500/40 px-2 py-0.5 rounded font-medium shrink-0">
              {previewReleaseVersion} (Preview)
            </span>
          ) : (
            <span className="hidden md:inline text-[11px] text-emerald-300 shrink-0">
              {previewDrafts ? t('modals.publicSite.draftPreviewBadge') : t('modals.publicSite.publishedBadge')}
            </span>
          )}
        </div>

        {/* Right: Runtime Route, Draft Toggle, Device Emulators & Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenRuntimeRoute && site.portfolioSlug && (
            <button
              type="button"
              onClick={() => {
                const sub = resolvedCurrentPath === '/' ? '' : resolvedCurrentPath;
                onClose();
                onOpenRuntimeRoute(`/${site.portfolioSlug}${sub}`);
              }}
              className="hidden md:flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 transition-colors whitespace-nowrap"
              title={`Open Shared Runtime at /${site.portfolioSlug}`}
            >
              <ExternalLink className="w-3 h-3" />
              <span>/{site.portfolioSlug}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreviewDrafts((prev) => !prev)}
            className={`min-h-[34px] px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
              previewDrafts
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {previewDrafts ? t('modals.publicSite.includingDrafts') : t('modals.publicSite.publishedOnly')}
          </button>

          <div className="hidden sm:flex items-center bg-slate-800 p-0.5 rounded-lg text-slate-400">
            <button
              type="button"
              onClick={() => setDeviceMode('desktop')}
              title={BREAKPOINTS.desktop.shortLabel}
              className={`p-1.5 rounded ${
                deviceMode === 'desktop' ? 'bg-slate-700 text-white' : 'hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDeviceMode('tablet')}
              title={BREAKPOINTS.tablet.shortLabel}
              className={`p-1.5 rounded ${
                deviceMode === 'tablet' ? 'bg-slate-700 text-white' : 'hover:text-white'
              }`}
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDeviceMode('mobile')}
              title={BREAKPOINTS.mobile.shortLabel}
              className={`p-1.5 rounded ${
                deviceMode === 'mobile' ? 'bg-slate-700 text-white' : 'hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('modals.publicSite.closeAria')}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Viewport Surface */}
      <div className="relative flex-1 flex flex-col min-h-0 bg-slate-900 border-x border-b border-slate-800 rounded-b-xl overflow-hidden">
        <div className="flex-1 overflow-auto p-2 sm:p-4 flex justify-center items-start">
        <div
          style={{
            ...portfolioThemeRootStyle(effectiveTheme.cssVars),
            width: getContainerWidth(),
            maxWidth: deviceMode === 'desktop' ? '1440px' : '100%',
            transform: 'translateZ(0)',
            isolation: 'isolate',
            contain: 'layout',
            transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className={`portfolio-theme relative min-h-full flex flex-col transition-all ${
            deviceMode !== 'desktop'
              ? 'rounded-2xl border-4 sm:border-8 border-slate-800 shadow-2xl overflow-hidden'
              : 'rounded-b-lg'
          }`}
        >
          {currentPage ? (
            <CmsSurfaceProvider>
              <div className="portfolio-site-surface flex-1 flex flex-col">
                <style dangerouslySetInnerHTML={{ __html: compiledCss }} />
                {headerSlot?.component && (
                  <ElementRenderer
                    node={headerSlot.component.rootElement}
                    isEditor={false}
                    deviceMode={deviceMode}
                    workspace={workspace}
                    cms={effectiveCms}
                    currentRecord={matchedCmsRecord || undefined}
                    sitePages={sitePagesNav}
                    activePagePath={resolvedCurrentPath}
                    themeCssVars={effectiveTheme.cssVars}
                    onNavigatePage={(slug) => setActivePath(slug)}
                    onSubmitForm={onSubmitForm}
                  />
                )}
                <div className="flex-1">
                  <ElementRenderer
                    node={currentPage.rootElement}
                    isEditor={false}
                    deviceMode={deviceMode}
                    workspace={workspace}
                    cms={effectiveCms}
                    currentRecord={matchedCmsRecord || undefined}
                    sitePages={sitePagesNav}
                    activePagePath={resolvedCurrentPath}
                    themeCssVars={effectiveTheme.cssVars}
                    onNavigatePage={(slug) => setActivePath(slug)}
                    onSubmitForm={onSubmitForm}
                  />
                </div>
                {footerSlot?.component && (
                  <>
                    <ElementRenderer
                      node={footerSlot.component.rootElement}
                      isEditor={false}
                      deviceMode={deviceMode}
                      workspace={workspace}
                      cms={effectiveCms}
                      currentRecord={matchedCmsRecord || undefined}
                      sitePages={sitePagesNav}
                      activePagePath={resolvedCurrentPath}
                      themeCssVars={effectiveTheme.cssVars}
                      onNavigatePage={(slug) => setActivePath(slug)}
                      onSubmitForm={onSubmitForm}
                    />
                    {hasVisibleFooter && <BuillyMadeWithBadge variant="footer" />}
                  </>
                )}
              </div>
            </CmsSurfaceProvider>
          ) : (
            <div className="p-12 text-center space-y-3">
              <div
                style={{ color: 'var(--color-heading)' }}
                className="text-lg font-bold"
              >
                {t('modals.publicSite.notAvailableTitle')}
              </div>
              <p
                style={{ color: 'var(--color-text-muted)' }}
                className="text-xs max-w-sm mx-auto"
              >
                {t('modals.publicSite.notAvailableDesc', { path: activePath })}
              </p>
              <button
                type="button"
                onClick={() => setActivePath('/')}
                style={{
                  backgroundColor: 'var(--color-button-primary-bg)',
                  color: 'var(--color-button-primary-text)',
                }}
                className="px-4 py-2 rounded-md text-xs font-semibold"
              >
                {t('modals.publicSite.returnHome')}
              </button>
            </div>
          )}
        </div>
        </div>
        {currentPage && !hasVisibleFooter && (
          <BuillyMadeWithBadge variant="floating" className="absolute left-4 bottom-4 z-40" />
        )}
      </div>
    </div>
  );
};

