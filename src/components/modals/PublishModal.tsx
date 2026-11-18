import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleWorkspaceState, SiteDocument, BuildRelease } from '../../types/builder';
import {
  compilerService,
  getDefaultPublishPageIds,
  PreflightReport,
} from '../../services/compilerService';
import {
  publishSiteToSharedRuntime,
  SharedRuntimePublishOutcome,
} from '../../services/runtime/publishRuntimeClient';
import { resolvePageFullPath, sortPagesForTree } from '../../services/pageService';
import { resolveEffectiveTheme } from '../../services/themeService';
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  Home,
  X,
  ExternalLink,
} from 'lucide-react';

interface PublishModalProps {
  isOpen: boolean;
  site: SiteDocument;
  workspace: GoogleWorkspaceState;
  supabaseAccessToken?: string | null;
  orgId?: string;
  projectId?: string;
  onClose: () => void;
  onPublishSuccess: (release: BuildRelease, publishedPageIds: string[]) => void;
  onOpenPublicSite: () => void;
  onOpenRuntimeRoute?: () => void;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  site,
  workspace,
  supabaseAccessToken,
  orgId,
  projectId,
  onClose,
  onPublishSuccess,
  onOpenPublicSite,
  onOpenRuntimeRoute,
}) => {
  const { t, i18n } = useTranslation();
  const [commitMessage, setCommitMessage] = useState(
    t('modals.publish.defaultCommit', {
      date: new Date().toLocaleDateString(i18n.language === 'th' ? 'th-TH' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    })
  );
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>(() =>
    getDefaultPublishPageIds(site)
  );
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStep, setBuildStep] = useState<number>(0);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishOutcome, setPublishOutcome] = useState<SharedRuntimePublishOutcome | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedPageIds(getDefaultPublishPageIds(site));
      setPublishOutcome(null);
      setPublishError(null);
      setIsBuilding(false);
      setBuildStep(0);
    }
  }, [isOpen, site.pages.length]);

  if (!isOpen) return null;

  const report: PreflightReport = compilerService.runPreflightCheck(
    site,
    workspace,
    selectedPageIds
  );
  const effectiveTheme = resolveEffectiveTheme(site);
  const orderedPages = sortPagesForTree(site.pages);
  const completedRelease = publishOutcome?.release ?? null;

  const togglePageSelection = (pageId: string, isHome?: boolean) => {
    if (isHome) return; // Home page is always required in a coherent release
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    );
  };

  const handleStartPublish = async () => {
    setIsBuilding(true);
    setPublishError(null);
    setBuildStep(1);

    try {
      setBuildStep(2);
      const outcome = await publishSiteToSharedRuntime({
        site,
        workspace,
        commitMessage,
        selectedPageIds,
        supabaseAccessToken,
        orgId,
        projectId,
      });
      setBuildStep(4);
      setPublishOutcome(outcome);
      onPublishSuccess(outcome.release, selectedPageIds);
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : 'Unable to publish runtime snapshot.'
      );
      setBuildStep(0);
    } finally {
      setIsBuilding(false);
    }
  };

  const formatTargetLabel = (target: SharedRuntimePublishOutcome['publishTarget']) => {
    switch (target) {
      case 'cloudflare_drive':
        return 'Cloudflare Shared Runtime + Google Drive';
      case 'google_drive':
        return 'Google Drive Published Snapshot';
      case 'local_staging':
      default:
        return 'Local Staging Release (Connect Google / Sign In for Cloud Delivery)';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Rocket className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {completedRelease ? t('modals.publish.activatedTitle') : t('modals.publish.title')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('modals.publish.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modals.publish.closeAria')}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {!completedRelease ? (
            <>
              {/* Pages Included in Release */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>{t('modals.publish.pagesIncluded')}</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {t('modals.publish.selectedCount', {
                      selected: selectedPageIds.length,
                      total: orderedPages.length,
                    })}
                  </span>
                </div>
                <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {orderedPages.map((p) => {
                    const checked = selectedPageIds.includes(p.id);
                    const fullPath = resolvePageFullPath(p, site.pages);
                    const status = p.status || 'published';
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 text-xs ${
                          p.isHome ? 'bg-slate-50/70' : 'hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={Boolean(p.isHome) || isBuilding}
                            onChange={() => togglePageSelection(p.id, p.isHome)}
                            className="rounded border-slate-300"
                          />
                          {p.isHome && <Home className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                          <span className="font-medium text-slate-900 truncate">{p.name}</span>
                          {status !== 'published' && (
                            <span className="text-[10px] capitalize text-amber-700 font-medium shrink-0">
                              {status}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 truncate max-w-[130px]">
                          {fullPath}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Preflight Summary */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>{t('modals.publish.preflightTitle')}</span>
                  {report.passed ? (
                    <span className="text-emerald-600 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t('modals.publish.allPassed')}
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1 font-medium">
                      <XCircle className="w-3.5 h-3.5" /> {t('modals.publish.errorsFound')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-600 pt-1 border-t border-slate-200/60 tabular-nums">
                  <div>{t('modals.publish.routesCount', { count: report.publishedRouteCount })}</div>
                  <div>{t('modals.publish.elementsCount', { count: report.totalElements })}</div>
                  <div>{t('modals.publish.bindingsCount', { count: report.dynamicBindingsCount })}</div>
                </div>

                <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200/60 flex items-center justify-between gap-2">
                  <span>
                    {t('modals.publish.sharedTheme')}{' '}
                    <strong className="text-slate-900">{effectiveTheme.baseTheme.name}</strong>
                  </span>
                  <span className="font-mono text-slate-500">
                    {effectiveTheme.overrideCount > 0
                      ? t('modals.publish.customColors', { count: effectiveTheme.overrideCount })
                      : t('modals.publish.presetDefaults')}
                  </span>
                </div>

                {report.errors.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-red-200/70">
                    {report.errors.map((err, i) => (
                      <div key={i} className="text-[11px] text-red-700 flex items-start gap-1">
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{err}</span>
                      </div>
                    ))}
                  </div>
                )}

                {report.warnings.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {report.warnings.slice(0, 2).map((warn, i) => (
                      <div key={i} className="text-[11px] text-amber-700 flex items-start gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{warn}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Commit Message */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  {t('modals.publish.commitLabel')}
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  disabled={isBuilding}
                  className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-blue-500"
                />
              </div>

              {publishError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{publishError}</span>
                </div>
              )}

              {/* Build Process Status */}
              {isBuilding && (
                <div className="space-y-2 p-3 bg-slate-900 rounded-lg text-slate-300 font-mono text-xs">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('modals.publish.step1')}</span>
                  </div>
                  <div
                    className={`flex items-center gap-2 ${
                      buildStep >= 2 ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {buildStep >= 2 ? (
                      <div className="w-3.5 h-3.5 rounded-full border border-emerald-400 animate-spin" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-500" />
                    )}
                    <span>
                      {t('modals.publish.step2', { count: workspace.spreadsheet.tabs.length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                    <span>{t('modals.publish.step3', { count: selectedPageIds.length })}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                    <span>{t('modals.publish.step4')}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Build Success View */
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-900">
                  {t('modals.publish.releaseLive', { version: completedRelease.version })}
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 tabular-nums">
                  {t('modals.publish.releaseSummary', {
                    pages: completedRelease.pageCount,
                    routes: completedRelease.publishedRoutes?.length ?? completedRelease.pageCount,
                  })}
                </p>
              </div>

              {publishOutcome?.warning && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 text-left flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>{publishOutcome.warning}</span>
                </div>
              )}

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-left space-y-1.5 tabular-nums">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('modals.publish.activeVersion')}</span>
                  <span className="font-semibold text-slate-900">{completedRelease.version}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Runtime Target:</span>
                  <span className="text-slate-800 text-right">
                    {publishOutcome ? formatTargetLabel(publishOutcome.publishTarget) : 'Shared Runtime'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Runtime Route:</span>
                  <span className="text-emerald-700 font-semibold">/{site.portfolioSlug}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('modals.publish.compiledPages')}</span>
                  <span>{completedRelease.pageCount}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('modals.publish.artifactSize')}</span>
                  <span>{completedRelease.artifactSize}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">{t('modals.publish.driveArtifact')}</span>
                  <span className="text-blue-600 truncate max-w-[190px]">
                    {completedRelease.driveFileId}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
          {!completedRelease ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isBuilding}
                className="min-h-[38px] px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleStartPublish}
                disabled={isBuilding || !report.passed}
                className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded disabled:opacity-50 flex items-center gap-1.5"
              >
                <Rocket className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {isBuilding ? t('modals.publish.compilingBtn') : t('modals.publish.confirmPublishBtn')}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[38px] px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded font-medium"
              >
                {t('common.done')}
              </button>
              {onOpenRuntimeRoute && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRuntimeRoute();
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open /{site.portfolioSlug}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPublicSite();
                }}
                className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{t('modals.publish.openLiveBtn')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


