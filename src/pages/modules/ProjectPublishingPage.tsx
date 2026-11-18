import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  FileArchive,
  FileJson,
  Globe,
  Loader2,
  Pencil,
  Plus,
  Rocket,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectModuleHeader } from '../../components/console/ProjectModuleHeader';
import { validatePortfolioSlug } from '../../config/breakpoints';
import {
  createOperationKey,
  workspaceHierarchyClient,
} from '../../features/console/workspaceHierarchyClient';
import { compilerService, getDefaultPublishPageIds } from '../../services/compilerService';
import { sortPagesForTree, resolvePageFullPath } from '../../services/pageService';
import {
  publishSiteToSharedRuntime,
  SharedRuntimePublishOutcome,
} from '../../services/runtime/publishRuntimeClient';
import { generateSiteSourceZip } from '../../services/sourceExportService';
import { storageService } from '../../services/storageService';
import { SiteDocument } from '../../types/builder';
import {
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
} from '../../types/workspace';
import { buildConsoleUrl } from '../../utils/routes';

interface ProjectPublishingPageProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
  sites: SiteRecord[];
  accessToken: string;
  googleWorkspaceConnected: boolean;
  googleWorkspaceNeedsReauth: boolean;
  authBusy: boolean;
  onRefreshBootstrap: () => Promise<void>;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onSignOut: () => Promise<void>;
}

export const ProjectPublishingPage: React.FC<ProjectPublishingPageProps> = ({
  organization,
  project,
  modules,
  sites,
  accessToken,
  googleWorkspaceConnected,
  googleWorkspaceNeedsReauth,
  authBusy,
  onRefreshBootstrap,
  onNavigate,
  onSignOut,
}) => {
  const { t, i18n } = useTranslation();

  const [siteDoc, setSiteDoc] = useState<SiteDocument>(() =>
    storageService.loadSite(project.project_id)
  );
  const workspace = useMemo(() => storageService.loadGoogleWorkspace(), []);

  const [selectedSiteId, setSelectedSiteId] = useState<string>(() => sites[0]?.site_id || '');
  const selectedSite = useMemo(
    () => sites.find((s) => s.site_id === selectedSiteId) || sites[0] || null,
    [sites, selectedSiteId]
  );

  // Attach / Edit Site forms
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteSlug, setNewSiteSlug] = useState('');
  const [savingSite, setSavingSite] = useState(false);

  const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteSlug, setEditSiteSlug] = useState('');

  // Publish state
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>(() =>
    getDefaultPublishPageIds(siteDoc)
  );
  const [commitMessage, setCommitMessage] = useState(() =>
    t('modals.publish.defaultCommit', {
      date: new Date().toLocaleDateString(i18n.language === 'th' ? 'th-TH' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    })
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishOutcome, setPublishOutcome] = useState<SharedRuntimePublishOutcome | null>(null);

  // Source export state
  const [savingExportToDrive, setSavingExportToDrive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const targetSiteForCompile: SiteDocument = useMemo(() => {
    if (!selectedSite) return siteDoc;
    return {
      ...siteDoc,
      id: selectedSite.site_id,
      name: selectedSite.site_name,
      portfolioSlug: selectedSite.site_slug,
    };
  }, [siteDoc, selectedSite]);

  const orderedPages = useMemo(
    () => sortPagesForTree(targetSiteForCompile.pages),
    [targetSiteForCompile.pages]
  );

  const preflight = useMemo(
    () => compilerService.runPreflightCheck(targetSiteForCompile, workspace, selectedPageIds),
    [targetSiteForCompile, workspace, selectedPageIds]
  );

  const handleTogglePage = (pageId: string, isHome?: boolean) => {
    if (isHome) return;
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setNotice(null);
    const slugCheck = validatePortfolioSlug(newSiteSlug);
    if (!slugCheck.valid) {
      setErrorBanner(slugCheck.error || 'Invalid site slug.');
      return;
    }
    if (!newSiteName.trim()) {
      setErrorBanner('Site name is required.');
      return;
    }
    setSavingSite(true);
    try {
      const res = await workspaceHierarchyClient.createSiteInProject(
        accessToken,
        project.project_id,
        {
          siteName: newSiteName.trim(),
          siteSlug: slugCheck.normalized,
          operationKey: createOperationKey('site'),
        }
      );
      setNewSiteName('');
      setNewSiteSlug('');
      setShowAddSite(false);
      setSelectedSiteId(res.site.site_id);
      await onRefreshBootstrap();
      setNotice(t('console.publishing.siteAttachedNotice', { slug: res.site.site_slug }));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to attach Site.');
    } finally {
      setSavingSite(false);
    }
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite) return;
    setErrorBanner(null);
    setNotice(null);
    const slugCheck = validatePortfolioSlug(editSiteSlug);
    if (!slugCheck.valid) {
      setErrorBanner(slugCheck.error || 'Invalid site slug.');
      return;
    }
    if (!editSiteName.trim()) {
      setErrorBanner('Site name is required.');
      return;
    }
    setSavingSite(true);
    try {
      await workspaceHierarchyClient.updateSiteInProject(accessToken, editingSite.site_id, {
        siteName: editSiteName.trim(),
        siteSlug: slugCheck.normalized,
      });
      setEditingSite(null);
      await onRefreshBootstrap();
      setNotice(t('console.publishing.siteUpdatedNotice'));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update Site.');
    } finally {
      setSavingSite(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedSite) {
      setErrorBanner(t('console.publishing.attachSiteFirst'));
      return;
    }
    setErrorBanner(null);
    setNotice(null);
    setIsPublishing(true);
    try {
      const outcome = await publishSiteToSharedRuntime({
        site: targetSiteForCompile,
        workspace,
        commitMessage,
        selectedPageIds,
        supabaseAccessToken: accessToken,
        orgId: organization.org_id,
        projectId: project.project_id,
      });

      const publishedSet = new Set(selectedPageIds);
      const updatedDoc: SiteDocument = {
        ...targetSiteForCompile,
        pages: targetSiteForCompile.pages.map((p) =>
          publishedSet.has(p.id) ? { ...p, status: 'published' as const } : p
        ),
        releases: [
          outcome.release,
          ...siteDoc.releases.filter((r) => r.version !== outcome.release.version),
        ],
        activeReleaseVersion: outcome.release.version,
      };
      storageService.saveSiteDraft(updatedDoc, project.project_id);
      setSiteDoc(updatedDoc);
      setPublishOutcome(outcome);
      await onRefreshBootstrap();
      setNotice(
        t('console.publishing.publishSuccessNotice', {
          version: outcome.release.version,
          slug: selectedSite.site_slug,
        })
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Publishing failed.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDownloadSourceZip = () => {
    const result = generateSiteSourceZip({
      site: targetSiteForCompile,
      workspace,
      includeDraftPages: false,
    });
    const arrayBuffer = result.zipBytes.buffer.slice(
      result.zipBytes.byteOffset,
      result.zipBytes.byteOffset + result.zipBytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadBackupJson = () => {
    const jsonStr = storageService.exportProjectJson(targetSiteForCompile, workspace);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetSiteForCompile.portfolioSlug || project.project_slug}-builly-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleArchiveExportToDrive = async () => {
    if (!googleWorkspaceConnected || googleWorkspaceNeedsReauth) {
      setErrorBanner(t('console.cms.workspaceNotConnected'));
      return;
    }
    setSavingExportToDrive(true);
    setErrorBanner(null);
    setNotice(null);
    try {
      const result = generateSiteSourceZip({
        site: targetSiteForCompile,
        workspace,
        includeDraftPages: false,
      });
      const res = await workspaceHierarchyClient.saveProjectExportToDrive(
        accessToken,
        project.project_id,
        {
          fileName: `${targetSiteForCompile.portfolioSlug || project.project_slug}-${
            result.manifest.publishVersion
          }-export.json`,
          manifest: result.manifest as unknown as Record<string, unknown>,
          snapshot: result.snapshot as unknown as Record<string, unknown>,
        }
      );
      setNotice(t('console.publishing.exportSavedDrive', { fileName: res.fileName }));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to save export to Drive.');
    } finally {
      setSavingExportToDrive(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      <ProjectModuleHeader
        organization={organization}
        project={project}
        modules={modules}
        activeModule="publishing"
        authBusy={authBusy}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() =>
                onNavigate(
                  buildConsoleUrl({
                    orgId: organization.org_id,
                    projectId: project.project_id,
                  })
                )
              }
              className="text-xs font-medium text-[#574F6B] hover:text-[#211B2E] inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('console.cms.backToProject', { projectName: project.name })}</span>
            </button>
            <h1 className="font-['Outfit',sans-serif] text-2xl font-semibold tracking-tight text-[#211B2E]">
              {t('console.publishing.heading')}
            </h1>
            <p className="text-xs sm:text-sm text-[#4A435C]">
              {t('console.publishing.subtitle', { projectName: project.name })}
            </p>
          </div>
        </div>

        {notice && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        {errorBanner && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Attached Sites & Public Routing */}
          <section className="lg:col-span-5 rounded-xl border border-[#211B2E]/10 bg-white p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E] flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#6C2CEB]" />
                <span>{t('console.projects.sitesHeading')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowAddSite((v) => !v)}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 text-[#6C2CEB]" />
                <span>{t('console.projects.addSiteBtn')}</span>
              </button>
            </div>

            {showAddSite && (
              <form
                onSubmit={handleCreateSite}
                className="rounded-xl border border-[#211B2E]/12 bg-[#F7F6FA] p-3.5 space-y-2.5"
              >
                <input
                  type="text"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder={t('console.projects.siteNameLabel')}
                  required
                  maxLength={80}
                  className="w-full min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 bg-white text-xs"
                />
                <input
                  type="text"
                  value={newSiteSlug}
                  onChange={(e) => setNewSiteSlug(e.target.value)}
                  placeholder={t('console.projects.siteSlugPlaceholder')}
                  required
                  maxLength={48}
                  className="w-full min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 bg-white text-xs font-mono"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingSite}
                    className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[#6C2CEB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingSite && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{t('console.projects.saveSite')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddSite(false)}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 bg-white text-xs"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}

            {sites.length === 0 ? (
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.projects.noSites')}
              </p>
            ) : (
              <div className="divide-y divide-[#211B2E]/10 border-t border-[#211B2E]/10">
                {sites.map((site) => {
                  const isSelected = selectedSite?.site_id === site.site_id;
                  const isEditingThis = editingSite?.site_id === site.site_id;
                  return (
                    <div key={site.site_id} className="py-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedSiteId(site.site_id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <div className="text-sm font-semibold text-[#211B2E] flex items-center gap-2">
                            <span className="truncate">{site.site_name}</span>
                            {isSelected && (
                              <span className="text-[11px] font-mono text-[#6C2CEB]">
                                · {t('console.publishing.targetLabel')}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-[#574F6B] mt-0.5">
                            {site.status === 'published'
                              ? t('console.projects.statusPublished')
                              : t('console.projects.statusDraft')}{' '}
                            · /s/{site.site_slug}
                            {site.active_publish_version ? ` · ${site.active_publish_version}` : ''}
                          </div>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (isEditingThis) {
                                setEditingSite(null);
                              } else {
                                setEditingSite(site);
                                setEditSiteName(site.site_name);
                                setEditSiteSlug(site.site_slug);
                              }
                            }}
                            aria-label={`${t('console.projects.renameSite')} ${site.site_name}`}
                            className="p-1.5 rounded border border-[#211B2E]/15 text-[#4A435C] hover:text-[#211B2E]"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {site.status === 'published' && (
                            <button
                              type="button"
                              onClick={() => onNavigate(`/s/${site.site_slug}`)}
                              aria-label={t('console.projects.viewLiveSite', { slug: site.site_slug })}
                              className="p-1.5 rounded bg-[#211B2E] text-white"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditingThis && (
                        <form onSubmit={handleUpdateSite} className="space-y-2 pt-2 border-t border-[#211B2E]/10">
                          <input
                            type="text"
                            value={editSiteName}
                            onChange={(e) => setEditSiteName(e.target.value)}
                            maxLength={80}
                            required
                            className="w-full min-h-[34px] px-2.5 py-1 rounded border border-[#211B2E]/20 text-xs"
                          />
                          <input
                            type="text"
                            value={editSiteSlug}
                            onChange={(e) => setEditSiteSlug(e.target.value)}
                            maxLength={48}
                            required
                            className="w-full min-h-[34px] px-2.5 py-1 rounded border border-[#211B2E]/20 text-xs font-mono"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="submit"
                              disabled={savingSite}
                              className="min-h-[32px] px-3 py-1 rounded bg-[#6C2CEB] text-white text-xs font-semibold"
                            >
                              {t('console.projects.saveSite')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSite(null)}
                              className="min-h-[32px] px-3 py-1 rounded border border-[#211B2E]/15 text-xs"
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right: Publish Snapshot & On-Demand Source Export */}
          <div className="lg:col-span-7 space-y-6">
            <section className="rounded-xl border border-[#211B2E]/10 bg-white p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
                    {t('console.publishing.publishPanelTitle')}
                  </h2>
                  <p className="text-xs text-[#4A435C]">
                    {selectedSite
                      ? t('console.publishing.publishTargetDesc', {
                          slug: selectedSite.site_slug,
                        })
                      : t('console.publishing.attachSiteFirst')}
                  </p>
                </div>
                {preflight.passed ? (
                  <span className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('modals.publish.allPassed')}</span>
                  </span>
                ) : (
                  <span className="text-xs font-medium text-red-700 inline-flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{t('modals.publish.errorsFound')}</span>
                  </span>
                )}
              </div>

              {/* Pages Checklist */}
              <div className="border border-[#211B2E]/12 rounded-lg divide-y divide-[#211B2E]/8 max-h-48 overflow-y-auto">
                {orderedPages.map((p) => {
                  const checked = selectedPageIds.includes(p.id);
                  const fullPath = resolvePageFullPath(p, targetSiteForCompile.pages);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-[#F7F6FA] cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={Boolean(p.isHome) || isPublishing}
                          onChange={() => handleTogglePage(p.id, p.isHome)}
                          className="accent-[#6C2CEB]"
                        />
                        <span className="font-medium text-[#211B2E] truncate">{p.name}</span>
                      </div>
                      <span className="font-mono text-[11px] text-[#574F6B] shrink-0">
                        {fullPath}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Preflight warnings / errors */}
              {preflight.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{preflight.warnings[0]}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#211B2E]">
                  {t('modals.publish.commitLabel')}
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  disabled={isPublishing}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-xs"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#211B2E]/10">
                <div className="text-xs font-mono text-[#574F6B] tabular-nums">
                  {t('modals.publish.routesCount', { count: preflight.publishedRouteCount })} ·{' '}
                  {t('modals.publish.elementsCount', { count: preflight.totalElements })}
                </div>
                <button
                  type="button"
                  disabled={isPublishing || !preflight.passed || !selectedSite}
                  onClick={() => void handlePublish()}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isPublishing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Rocket className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isPublishing
                      ? t('modals.publish.compilingBtn')
                      : t('modals.publish.confirmPublishBtn')}
                  </span>
                </button>
              </div>

              {publishOutcome && (
                <div className="rounded-lg border border-[#211B2E]/12 bg-[#F7F6FA] p-3.5 text-xs font-mono space-y-1 tabular-nums">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#574F6B]">{t('modals.publish.activeVersion')}</span>
                    <span className="font-semibold text-[#211B2E]">
                      {publishOutcome.release.version}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#574F6B]">Drive Artifact:</span>
                    <span className="text-[#211B2E] truncate max-w-[220px]">
                      {publishOutcome.release.driveFileId}
                    </span>
                  </div>
                </div>
              )}
            </section>

            {/* On-Demand Portable Source Export */}
            <section className="rounded-xl border border-[#211B2E]/10 bg-white p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
                  {t('console.publishing.exportHeading')}
                </h2>
                <p className="text-xs text-[#4A435C] mt-0.5">
                  {t('console.publishing.exportSubtitle')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadSourceZip}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <FileArchive className="w-3.5 h-3.5" />
                  <span>{t('console.publishing.downloadZipBtn')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBackupJson}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>{t('console.publishing.downloadJsonBtn')}</span>
                </button>

                <button
                  type="button"
                  disabled={
                    savingExportToDrive || !googleWorkspaceConnected || googleWorkspaceNeedsReauth
                  }
                  onClick={() => void handleArchiveExportToDrive()}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingExportToDrive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5 text-[#6C2CEB]" />
                  )}
                  <span>{t('console.publishing.archiveExportsDriveBtn')}</span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};
