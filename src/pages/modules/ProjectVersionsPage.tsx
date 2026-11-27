import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectModuleHeader } from '../../components/console/ProjectModuleHeader';
import { workspaceHierarchyClient } from '../../features/console/workspaceHierarchyClient';
import { rollbackSiteOnSharedRuntime } from '../../services/runtime/publishRuntimeClient';
import { storageService } from '../../services/storageService';
import {
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
} from '../../types/workspace';
import { buildConsoleUrl } from '../../utils/routes';

interface ProjectVersionsPageProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
  sites: SiteRecord[];
  accessToken: string;
  readOnly?: boolean;
  outageStale?: boolean;
  outageLastSyncedAt?: string | null;
  authBusy: boolean;
  onRefreshBootstrap: () => Promise<void>;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onSignOut: () => Promise<void>;
}

interface UnifiedReleaseRow {
  key: string;
  version: string;
  buildId: string;
  siteSlug: string;
  commitMessage: string;
  createdAt: string;
  driveFileId: string;
  integrityHash: string;
  source: 'server_d1' | 'local_draft';
  isActive: boolean;
}

export const ProjectVersionsPage: React.FC<ProjectVersionsPageProps> = ({
  organization,
  project,
  modules,
  sites,
  accessToken,
  readOnly = false,
  outageStale = false,
  outageLastSyncedAt = null,
  authBusy,
  onRefreshBootstrap,
  onNavigate,
  onSignOut,
}) => {
  const { t } = useTranslation();
  const writesLocked = Boolean(readOnly || project.status === 'archived');

  const [loading, setLoading] = useState(false);
  const [serverReleases, setServerReleases] = useState<
    Array<{
      id: string;
      site_id: string;
      site_slug: string;
      publish_version: string;
      build_id: string;
      runtime_config_drive_file_id: string;
      integrity_hash: string;
      commit_message: string;
      created_at: string;
    }>
  >([]);
  const [confirmRollback, setConfirmRollback] = useState<UnifiedReleaseRow | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const localDoc = useMemo(() => storageService.loadSite(project.project_id), [project.project_id]);

  const loadReleases = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await workspaceHierarchyClient.listProjectReleases(
        accessToken,
        project.project_id
      );
      setServerReleases(res.releases || []);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to load server release history.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, project.project_id]);

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  const rows: UnifiedReleaseRow[] = useMemo(() => {
    const activeBySlug = new Map<string, string>();
    sites.forEach((s) => {
      if (s.active_publish_version) activeBySlug.set(s.site_slug, s.active_publish_version);
    });

    const map = new Map<string, UnifiedReleaseRow>();

    serverReleases.forEach((rel) => {
      const activeVer = activeBySlug.get(rel.site_slug) || '';
      const key = `${rel.site_slug}::${rel.publish_version}`;
      map.set(key, {
        key,
        version: rel.publish_version,
        buildId: rel.build_id,
        siteSlug: rel.site_slug,
        commitMessage: rel.commit_message || t('console.versions.noCommitMessage'),
        createdAt: rel.created_at,
        driveFileId: rel.runtime_config_drive_file_id,
        integrityHash: rel.integrity_hash,
        source: 'server_d1',
        isActive: activeVer === rel.publish_version,
      });
    });

    (localDoc.releases || []).forEach((rel) => {
      const fallbackSlug = sites[0]?.site_slug || localDoc.portfolioSlug || project.project_slug;
      const key = `${fallbackSlug}::${rel.version}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          version: rel.version,
          buildId: rel.build_id || rel.version_id || rel.version,
          siteSlug: fallbackSlug,
          commitMessage: rel.commitMessage || rel.description || t('console.versions.noCommitMessage'),
          createdAt: rel.created_at || rel.timestamp || '',
          driveFileId: rel.driveFileId || '',
          integrityHash: '',
          source: 'local_draft',
          isActive:
            localDoc.activeReleaseVersion === rel.version ||
            Boolean(rel.is_active) ||
            rel.status === 'Active',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  }, [serverReleases, localDoc, sites, project.project_slug, t]);

  const handleConfirmRollback = async () => {
    if (!confirmRollback) return;
    setRollingBack(true);
    setErrorBanner(null);
    setNotice(null);

    try {
      if (confirmRollback.source === 'server_d1') {
        const res = await rollbackSiteOnSharedRuntime({
          siteSlug: confirmRollback.siteSlug,
          targetVersion: confirmRollback.version,
          workerSessionToken: accessToken,
        });
        if (!res.ok) {
          setErrorBanner(res.error || 'Server rollback failed.');
          setRollingBack(false);
          return;
        }
      }

      // Reconcile local project draft release status too if present
      const currentDoc = storageService.loadSite(project.project_id);
      const updatedReleases = currentDoc.releases.map((r) => {
        const match = r.version === confirmRollback.version;
        return {
          ...r,
          status: match ? ('Active' as const) : ('Archived' as const),
          is_active: match,
        };
      });
      storageService.saveSiteDraft(
        {
          ...currentDoc,
          activeReleaseVersion: confirmRollback.version,
          releases: updatedReleases,
        },
        project.project_id
      );

      await Promise.all([onRefreshBootstrap(), loadReleases()]);
      setNotice(
        t('console.versions.rollbackSuccess', {
          version: confirmRollback.version,
          slug: confirmRollback.siteSlug,
        })
      );
      setConfirmRollback(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      <ProjectModuleHeader
        organization={organization}
        project={project}
        modules={modules}
        activeModule="versions"
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
              {t('console.versions.heading')}
            </h1>
            <p className="text-xs sm:text-sm text-[#4A435C]">
              {t('console.versions.subtitle', { projectName: project.name })}
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadReleases()}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>{t('common.refresh')}</span>
          </button>
        </div>

        {(readOnly || outageStale) && (
          <section
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs">
                <div className="font-semibold text-amber-950">{t('console.outage.readOnlyTitle')}</div>
                <div className="text-amber-900">{t('console.outage.readOnlyDesc')}</div>
                <div className="font-mono tabular-nums text-[11px] text-amber-800">
                  {t('console.outage.lastSyncedLabel')}:{' '}
                  {outageLastSyncedAt
                    ? new Date(outageLastSyncedAt).toLocaleString()
                    : t('console.cms.neverSynced')}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/workspace')}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-[#211B2E] text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {t('console.outage.reconnectGoogleBtn')}
            </button>
          </section>
        )}

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

        <section className="rounded-xl border border-[#211B2E]/10 bg-white overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-10 text-center space-y-2.5">
              <History className="w-9 h-9 text-[#574F6B]/50 mx-auto" />
              <div className="text-sm font-semibold text-[#211B2E]">
                {t('console.versions.emptyTitle')}
              </div>
              <p className="text-xs text-[#4A435C] max-w-md mx-auto">
                {t('console.versions.emptyDesc')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#211B2E]/10 bg-[#FAF9FC] text-[#574F6B] font-semibold">
                    <th className="py-3 px-4">{t('console.versions.colVersion')}</th>
                    <th className="py-3 px-4">{t('console.versions.colSite')}</th>
                    <th className="py-3 px-4">{t('console.versions.colCommit')}</th>
                    <th className="py-3 px-4">{t('console.versions.colTimestamp')}</th>
                    <th className="py-3 px-4">{t('console.versions.colSource')}</th>
                    <th className="py-3 px-4 text-right">{t('console.versions.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#211B2E]/8 tabular-nums">
                  {rows.map((row) => (
                    <tr key={row.key} className="hover:bg-[#F7F6FA]">
                      <td className="py-3 px-4 font-mono font-semibold text-[#211B2E]">
                        <div className="flex items-center gap-2">
                          <span>{row.version}</span>
                          {row.isActive && (
                            <span className="text-[11px] font-sans font-semibold text-emerald-700">
                              · {t('console.versions.activeLabel')}
                            </span>
                          )}
                        </div>
                        {row.driveFileId && (
                          <div className="text-[11px] font-normal text-[#574F6B] truncate max-w-[170px]">
                            {row.driveFileId}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#211B2E]">/s/{row.siteSlug}</td>
                      <td className="py-3 px-4 text-[#211B2E] max-w-[260px] truncate">
                        {row.commitMessage}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#574F6B] whitespace-nowrap">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-[#574F6B]">
                        {row.source === 'server_d1'
                          ? t('console.versions.sourceServer')
                          : t('console.versions.sourceLocal')}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        {row.isActive ? (
                          <button
                            type="button"
                            onClick={() => onNavigate(`/s/${row.siteSlug}`)}
                            className="min-h-[32px] px-2.5 py-1 rounded border border-[#211B2E]/15 text-[#211B2E] hover:bg-white font-semibold inline-flex items-center gap-1"
                          >
                            <span>{t('console.versions.openSite')}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={writesLocked}
                            onClick={() => setConfirmRollback(row)}
                            className="min-h-[32px] px-3 py-1 rounded bg-[#211B2E] hover:bg-[#322944] text-white font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{t('console.versions.rollbackBtn')}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {confirmRollback && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-[#211B2E]/50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl border border-[#211B2E]/15 max-w-md w-full p-5 space-y-4">
              <h3 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
                {t('console.versions.confirmRollbackTitle', { version: confirmRollback.version })}
              </h3>
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.versions.confirmRollbackDesc', {
                  slug: confirmRollback.siteSlug,
                  version: confirmRollback.version,
                })}
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={rollingBack}
                  onClick={() => setConfirmRollback(null)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#211B2E]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={rollingBack}
                  onClick={() => void handleConfirmRollback()}
                  className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {rollingBack && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('console.versions.rollbackBtn')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
