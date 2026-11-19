import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Edit2,
  FileSpreadsheet,
  FolderTree,
  Layers,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CmsContentTypeBuilder } from '../../components/cms/CmsContentTypeBuilder';
import { CmsRecordEditor } from '../../components/cms/CmsRecordEditor';
import { CmsTaxonomiesView } from '../../components/cms/CmsTaxonomiesView';
import { BuillyLogo } from '../../components/common/BuillyLogo';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';
import { cmsRepository } from '../../services/cms/cmsRepository';
import { saveActiveProjectContext } from '../../services/storageService';
import { CmsContentRecord, CmsDocument } from '../../types/cms';
import {
  DatasetSpreadsheetRef,
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
} from '../../types/workspace';
import { WorkerApiError } from '../../features/workspace-connection/workspaceApiClient';
import { buildBuilderUrl, buildConsoleUrl } from '../../utils/routes';

type StandaloneCmsTab = 'overview' | 'content' | 'taxonomies' | 'types' | 'settings';

interface ProjectCmsPageProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
  sites: SiteRecord[];
  accessToken: string;
  ownerId: string;
  googleWorkspaceConnected: boolean;
  googleWorkspaceNeedsReauth: boolean;
  readOnly?: boolean;
  outageStale?: boolean;
  outageLastSyncedAt?: string | null;
  authBusy: boolean;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onSignOut: () => Promise<void>;
}

export const ProjectCmsPage: React.FC<ProjectCmsPageProps> = ({
  organization,
  project,
  modules,
  sites,
  accessToken,
  ownerId,
  googleWorkspaceConnected,
  googleWorkspaceNeedsReauth,
  readOnly = false,
  outageStale = false,
  outageLastSyncedAt = null,
  authBusy,
  onNavigate,
  onSignOut,
}) => {
  const { t } = useTranslation();

  const [cms, setCms] = useState<CmsDocument>(() => cmsRepository.getCms(project.project_id));
  const [activeTab, setActiveTab] = useState<StandaloneCmsTab>('content');
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>(
    () => cmsRepository.getCms(project.project_id).contentTypes[0]?.id || 'post'
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);

  const [editingRecord, setEditingRecord] = useState<CmsContentRecord | null>(null);
  const [isRecordEditorOpen, setIsRecordEditorOpen] = useState(false);

  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<CmsContentRecord | null>(null);
  const [confirmBulkTrash, setConfirmBulkTrash] = useState(false);

  const [loadingRemoteMeta, setLoadingRemoteMeta] = useState(false);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [pullingRemote, setPullingRemote] = useState(false);
  const [remoteReadOnly, setRemoteReadOnly] = useState<boolean>(readOnly);
  const [remoteStale, setRemoteStale] = useState<boolean>(outageStale);
  const [remoteUnavailable, setRemoteUnavailable] = useState<boolean>(false);
  const [remoteLastSyncedAt, setRemoteLastSyncedAt] = useState<string | null>(outageLastSyncedAt);
  const [remoteInfo, setRemoteInfo] = useState<{
    folderId: string;
    manifestFileId: string;
    spreadsheetId: string;
    datasetSpreadsheets: DatasetSpreadsheetRef[];
    found: boolean;
  }>({ folderId: '', manifestFileId: '', spreadsheetId: '', datasetSpreadsheets: [], found: false });

  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const effectiveReadOnly = Boolean(readOnly || remoteReadOnly || remoteUnavailable || project.status === 'archived');

  const showNotice = useCallback((msg: string) => {
    setErrorBanner(null);
    setStatusNotice(msg);
  }, []);

  // Keep reactive live subscription synced with unified cmsRepository
  useEffect(() => {
    setCms(cmsRepository.getCms(project.project_id));
    setSelectedRecordIds([]);
    const unsubscribe = cmsRepository.subscribe(project.project_id, (updated) => {
      setCms(updated);
    });
    return unsubscribe;
  }, [project.project_id]);

  // Initial non-destructive check against Project Drive CMS manifest
  const checkRemoteMeta = useCallback(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoadingRemoteMeta(true);
    setRemoteUnavailable(false);
    cmsRepository
      .loadFromProjectServer(project.project_id, accessToken)
      .then((res) => {
        if (cancelled) return;
        setRemoteReadOnly(Boolean(readOnly || res.readOnly));
        setRemoteStale(Boolean(outageStale || res.stale));
        setRemoteLastSyncedAt(res.lastSyncedAt ?? outageLastSyncedAt ?? null);
        setRemoteInfo({
          folderId: res.folderId,
          manifestFileId: res.manifestFileId,
          spreadsheetId: res.spreadsheetId,
          datasetSpreadsheets: res.datasetSpreadsheets || [],
          found: res.found,
        });
        if (res.adoptedRemote) {
          setCms(res.cms);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (
          err instanceof WorkerApiError &&
          (err.status === 503 || err.code === 'WRITE_DISABLED_OAUTH_UNAVAILABLE')
        ) {
          setRemoteUnavailable(true);
          setRemoteReadOnly(true);
          setErrorBanner(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRemoteMeta(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.project_id, accessToken, readOnly, outageStale, outageLastSyncedAt]);

  useEffect(() => {
    return checkRemoteMeta();
  }, [checkRemoteMeta]);

  const isBuilderEnabled = useMemo(() => {
    const rec = modules.find((m) => m.module_key === 'builder');
    return rec ? rec.enabled === 1 : true;
  }, [modules]);

  const currentContentType = useMemo(
    () => cms.contentTypes.find((ct) => ct.id === selectedContentTypeId) || cms.contentTypes[0],
    [cms.contentTypes, selectedContentTypeId]
  );

  const activeContentTypeId = currentContentType?.id || selectedContentTypeId;

  const filteredRecords = useMemo(() => {
    return (cms.records || []).filter((rec) => {
      if (rec.contentTypeId !== activeContentTypeId) return false;
      if (statusFilter === 'all') {
        if (rec.status === 'trash') return false;
      } else if (rec.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!rec.title.toLowerCase().includes(q) && !rec.slug.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [cms.records, activeContentTypeId, statusFilter, searchQuery]);

  const handleOpenBuilder = () => {
    saveActiveProjectContext({
      orgId: organization.org_id,
      orgName: organization.name,
      projectId: project.project_id,
      projectName: project.name,
    });
    onNavigate(buildBuilderUrl({ orgId: organization.org_id, projectId: project.project_id }));
  };

  const handleUpdateCmsFromSubView = useCallback(
    (nextCms: CmsDocument) => {
      const saved = cmsRepository.saveCms(project.project_id, nextCms);
      setCms(saved);
    },
    [project.project_id]
  );

  const handleSaveRecord = (record: CmsContentRecord) => {
    const res = cmsRepository.saveRecordObject(project.project_id, record, {
      isEditing: Boolean(editingRecord),
      expectedRevision: editingRecord?.revision,
    });
    if (res.error) {
      setErrorBanner(res.error);
      return;
    }
    setCms(res.cms);
    setIsRecordEditorOpen(false);
    setEditingRecord(null);
    showNotice(t('cms.content.savedToast', { title: res.record?.title || record.title }));
  };

  const handleDuplicateRecord = (rec: CmsContentRecord) => {
    const res = cmsRepository.duplicateRecord(project.project_id, rec.recordId);
    if (res.error) {
      setErrorBanner(res.error);
      return;
    }
    setCms(res.cms);
    showNotice(t('cms.content.duplicatedToast', { title: rec.title }));
  };

  const handleStatusChange = (
    rec: CmsContentRecord,
    targetStatus: 'published' | 'draft' | 'trash'
  ) => {
    const res = cmsRepository.transitionRecordStatus(project.project_id, rec.recordId, targetStatus);
    if (res.error) {
      setErrorBanner(res.error);
      return;
    }
    setCms(res.cms);
    setSelectedRecordIds((prev) => prev.filter((id) => id !== rec.recordId));
    if (targetStatus === 'trash') {
      showNotice(t('cms.content.deletedToast'));
    } else if (targetStatus === 'published') {
      showNotice(t('console.cms.publishedToast', { title: rec.title }));
    } else {
      showNotice(t('console.cms.restoredToast', { title: rec.title }));
    }
  };

  const handlePermanentDelete = () => {
    if (!confirmPermanentDelete) return;
    const res = cmsRepository.deleteRecordPermanently(
      project.project_id,
      confirmPermanentDelete.recordId,
      { detachReferences: true }
    );
    if (res.error) {
      setErrorBanner(res.error);
      return;
    }
    setCms(res.cms);
    setSelectedRecordIds((prev) => prev.filter((id) => id !== confirmPermanentDelete.recordId));
    setConfirmPermanentDelete(null);
    showNotice(t('console.cms.deletedForeverToast'));
  };

  const handleBulkAction = (action: 'publish' | 'draft' | 'trash') => {
    if (selectedRecordIds.length === 0) return;
    const res = cmsRepository.bulkActionRecords(project.project_id, selectedRecordIds, action);
    setCms(res.cms);
    setSelectedRecordIds([]);
    setConfirmBulkTrash(false);
    if (action === 'trash') {
      showNotice(t('cms.content.bulkDeletedToast', { count: res.succeededIds.length }));
    } else {
      showNotice(`${res.succeededIds.length} record(s) updated.`);
    }
  };

  const handlePushSync = async () => {
    if (effectiveReadOnly) {
      setErrorBanner(t('console.outage.readOnlyDesc'));
      return;
    }
    if (!googleWorkspaceConnected || googleWorkspaceNeedsReauth) {
      setErrorBanner(t('console.cms.workspaceNotConnected'));
      return;
    }
    setSyncingRemote(true);
    setErrorBanner(null);
    try {
      const res = await cmsRepository.syncToProjectServer(project.project_id, accessToken, {
        syncSheets: true,
        projectName: project.name,
        siteId: sites[0]?.site_id || project.project_id,
        ownerAccountId: ownerId,
      });
      setCms(res.cms);
      setRemoteInfo({
        folderId: res.folderId,
        manifestFileId: res.manifestFileId,
        spreadsheetId: res.spreadsheetId,
        datasetSpreadsheets: res.datasetSpreadsheets || [],
        found: true,
      });
      setRemoteLastSyncedAt(res.syncedAt);
      showNotice(t('console.cms.syncSuccess', { count: res.tabsSynced.length }));
    } catch (err) {
      if (err instanceof WorkerApiError && err.status === 503) {
        setRemoteReadOnly(true);
      }
      setErrorBanner(err instanceof Error ? err.message : 'Failed to sync Project CMS.');
    } finally {
      setSyncingRemote(false);
    }
  };

  const handlePullRemote = async () => {
    if (!googleWorkspaceConnected || googleWorkspaceNeedsReauth) {
      setErrorBanner(t('console.cms.workspaceNotConnected'));
      return;
    }
    setPullingRemote(true);
    setErrorBanner(null);
    try {
      const res = await cmsRepository.loadFromProjectServer(project.project_id, accessToken, {
        forceAdoptRemote: true,
      });
      setRemoteReadOnly(Boolean(readOnly || res.readOnly));
      setRemoteStale(Boolean(outageStale || res.stale));
      setRemoteLastSyncedAt(res.lastSyncedAt ?? outageLastSyncedAt ?? null);
      setRemoteUnavailable(false);
      setRemoteInfo({
        folderId: res.folderId,
        manifestFileId: res.manifestFileId,
        spreadsheetId: res.spreadsheetId,
        datasetSpreadsheets: res.datasetSpreadsheets || [],
        found: res.found,
      });
      if (!res.found) {
        showNotice(t('console.cms.pullEmpty'));
        return;
      }
      setCms(res.cms);
      showNotice(t('console.cms.pullSuccess', { count: res.cms.records.length }));
    } catch (err) {
      if (err instanceof WorkerApiError && err.status === 503) {
        setRemoteUnavailable(true);
        setRemoteReadOnly(true);
      }
      setErrorBanner(err instanceof Error ? err.message : 'Failed to pull Project CMS from Drive.');
    } finally {
      setPullingRemote(false);
    }
  };

  const publishedCount = useMemo(
    () => (cms.records || []).filter((r) => r.status === 'published').length,
    [cms.records]
  );

  const activeRecordsCount = useMemo(
    () => (cms.records || []).filter((r) => r.status !== 'trash').length,
    [cms.records]
  );

  const allFilteredSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((r) => selectedRecordIds.includes(r.recordId));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredRecords.map((r) => r.recordId));
      setSelectedRecordIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const merged = new Set([
        ...selectedRecordIds,
        ...filteredRecords.map((r) => r.recordId),
      ]);
      setSelectedRecordIds(Array.from(merged));
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      {/* 3-Zone Header: Brand + Breadcrumbs Left | Actions Right */}
      <header className="px-4 sm:px-6 lg:px-8 h-16 border-b border-[#211B2E]/10 bg-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="inline-flex items-center rounded-md shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB]"
          >
            <BuillyLogo mode="responsive" theme="light" />
          </a>

          <nav
            aria-label="CMS module breadcrumbs"
            className="hidden sm:flex items-center gap-2 text-xs text-[#574F6B] min-w-0"
          >
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => onNavigate(buildConsoleUrl())}
              className="hover:text-[#211B2E] font-medium whitespace-nowrap shrink-0 hover:underline"
            >
              {t('console.dashboard.breadcrumbConsole')}
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => onNavigate(buildConsoleUrl({ orgId: organization.org_id }))}
              className="hover:text-[#211B2E] font-medium truncate max-w-[140px] hover:underline"
            >
              {organization.name}
            </button>
            <span aria-hidden="true">/</span>
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
              className="hover:text-[#211B2E] font-medium truncate max-w-[160px] hover:underline"
            >
              {project.name}
            </button>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[#211B2E] whitespace-nowrap shrink-0">
              {t('console.cms.breadcrumbLabel')}
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <LanguageSwitcher size="sm" />
          {isBuilderEnabled && (
            <button
              type="button"
              onClick={handleOpenBuilder}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('console.dashboard.launchBuilder')}</span>
            </button>
          )}
          <button
            type="button"
            disabled={authBusy}
            onClick={async () => {
              await onSignOut();
              onNavigate('/', { replace: true });
            }}
            title={t('auth.signOut')}
            aria-label={t('auth.signOut')}
            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#211B2E]/15 text-[#4A435C] hover:text-[#211B2E] hover:bg-[#F7F6FA] inline-flex items-center shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back link + Title + Sync Action */}
        <section className="space-y-4">
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

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-[#574F6B] flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-[#6C2CEB]" />
                <span>
                  {organization.org_slug} / {project.project_slug} ·{' '}
                  {t('console.cms.revisionLabel', { rev: cms.revision || 1 })}
                </span>
              </div>
              <h1 className="font-['Outfit',sans-serif] text-2xl sm:text-3xl font-semibold tracking-tight text-[#211B2E]">
                {t('console.cms.standaloneHeading')}
              </h1>
              <p className="text-xs sm:text-sm text-[#4A435C] max-w-2xl">
                {t('console.cms.standaloneSubtitle', { projectName: project.name })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={pullingRemote || syncingRemote}
                onClick={handlePullRemote}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              >
                {pullingRemote ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-[#574F6B]" />
                )}
                <span>{t('console.cms.syncPullBtn')}</span>
              </button>
              <button
                type="button"
                disabled={syncingRemote || pullingRemote || effectiveReadOnly}
                onClick={handlePushSync}
                className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              >
                {syncingRemote ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>{t('console.cms.syncPushBtn')}</span>
              </button>
            </div>
          </div>

          {/* Metrics Strip (Single-Elevation, Tabular Numerals) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#211B2E]/10 bg-white rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#211B2E]/10">
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('cms.overview.contentTypes')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
                {cms.contentTypes.length}
              </div>
            </div>
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('cms.overview.totalRecords')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
                {activeRecordsCount}
              </div>
            </div>
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('cms.overview.publishedEntries')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-emerald-700">
                {publishedCount}
              </div>
            </div>
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('console.cms.taxonomyStat')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
                {cms.taxonomies.length} / {cms.terms.length}
              </div>
            </div>
          </div>
        </section>

        {/* Sub-Navigation Tabs */}
        <nav
          aria-label="Project CMS views"
          className="border-b border-[#211B2E]/10 flex items-center gap-1 overflow-x-auto"
        >
          {(
            [
              { id: 'overview', label: t('cms.nav.overview'), icon: BookOpen },
              { id: 'content', label: t('cms.nav.content'), icon: Layers },
              { id: 'taxonomies', label: t('cms.nav.taxonomies'), icon: FolderTree },
              { id: 'types', label: t('cms.nav.types'), icon: Database },
              { id: 'settings', label: t('cms.nav.settings'), icon: Settings },
            ] as Array<{
              id: StandaloneCmsTab;
              label: string;
              icon: React.ComponentType<{ className?: string }>;
            }>
          ).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-3.5 py-2.5 text-xs font-semibold inline-flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-[#6C2CEB] text-[#6C2CEB]'
                    : 'border-transparent text-[#574F6B] hover:text-[#211B2E]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Asynchronous Status / Outage / Error Banners */}
        {(remoteReadOnly || remoteStale || remoteUnavailable) && accessToken && (
          <section
            role="status"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs">
                <div className="font-semibold text-amber-950">
                  {remoteUnavailable
                    ? t('console.outage.unavailableTitle')
                    : t('console.outage.readOnlyTitle')}
                </div>
                <div className="text-amber-900">
                  {remoteUnavailable
                    ? t('console.outage.unavailableDesc')
                    : t('console.outage.readOnlyDesc')}
                </div>
                <div className="font-mono tabular-nums text-[11px] text-amber-800">
                  {t('console.outage.lastSyncedLabel')}:{' '}
                  {remoteLastSyncedAt
                    ? new Date(remoteLastSyncedAt).toLocaleString()
                    : t('console.cms.neverSynced')}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void checkRemoteMeta()}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-950 whitespace-nowrap"
              >
                {t('console.retryBtn')}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/workspace')}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[#211B2E] text-white text-xs font-semibold whitespace-nowrap"
              >
                {t('console.outage.reconnectGoogleBtn')}
              </button>
            </div>
          </section>
        )}

        {loadingRemoteMeta && (
          <div className="rounded-xl border border-[#211B2E]/10 bg-white px-4 py-3 text-xs text-[#4A435C] flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-[#6C2CEB] animate-spin shrink-0" />
            <span>{t('console.cms.syncChecking')}</span>
          </div>
        )}

        {errorBanner && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-3 text-xs text-red-900"
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

        {statusNotice && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-900"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        {/* Destructive Action Confirmation Dialogs (Inline Safe Confirmations) */}
        {confirmPermanentDelete && (
          <div
            role="dialog"
            aria-label={t('console.cms.confirmPermanentDeleteTitle', {
              title: confirmPermanentDelete.title,
            })}
            className="rounded-xl border border-red-300 bg-white p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-red-900">
              {t('console.cms.confirmPermanentDeleteTitle', {
                title: confirmPermanentDelete.title,
              })}
            </h2>
            <p className="text-xs text-[#4A435C]">{t('console.cms.confirmPermanentDeleteDesc')}</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handlePermanentDelete}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {t('console.cms.deleteForever')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmPermanentDelete(null)}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white text-xs font-medium text-[#4A435C]"
              >
                {t('console.orgs.cancel')}
              </button>
            </div>
          </div>
        )}

        {confirmBulkTrash && selectedRecordIds.length > 0 && (
          <div
            role="dialog"
            aria-label={t('console.cms.confirmBulkTrashTitle', {
              count: selectedRecordIds.length,
            })}
            className="rounded-xl border border-amber-300 bg-white p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-[#211B2E]">
              {t('console.cms.confirmBulkTrashTitle', { count: selectedRecordIds.length })}
            </h2>
            <p className="text-xs text-[#4A435C]">{t('console.cms.confirmBulkTrashDesc')}</p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleBulkAction('trash')}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                {t('console.cms.bulkTrash', { count: selectedRecordIds.length })}
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulkTrash(false)}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white text-xs font-medium text-[#4A435C]"
              >
                {t('console.orgs.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* OVERVIEW VIEW */}
        {activeTab === 'overview' && (
          <section className="space-y-6">
            <div className="rounded-xl border border-[#211B2E]/10 bg-white overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#211B2E]/10 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#211B2E]">
                  {t('cms.overview.countsHeading')}
                </h2>
                <span className="text-xs text-[#574F6B] font-mono tabular-nums">
                  {cms.contentTypes.length}
                </span>
              </div>
              <div className="divide-y divide-[#211B2E]/8">
                {cms.contentTypes.map((ct) => {
                  const total = (cms.records || []).filter(
                    (r) => r.contentTypeId === ct.id && r.status !== 'trash'
                  ).length;
                  const pub = (cms.records || []).filter(
                    (r) => r.contentTypeId === ct.id && r.status === 'published'
                  ).length;
                  return (
                    <div
                      key={ct.id}
                      className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[#211B2E]">{ct.pluralLabel}</div>
                        <div className="font-mono text-[#574F6B] text-[11px]">
                          {ct.routeBasePath} · {ct.sheetTableId}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <span className="font-mono tabular-nums text-[#4A435C]">
                          {pub}/{total} published
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContentTypeId(ct.id);
                            setActiveTab('content');
                          }}
                          className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] font-semibold text-[#211B2E]"
                        >
                          {t('cms.overview.manage')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-[#211B2E]/10 bg-white px-5 py-4 text-xs text-[#4A435C] flex items-center justify-between gap-4">
              <span>{t('console.cms.sharedRepoNotice')}</span>
              {isBuilderEnabled && (
                <button
                  type="button"
                  onClick={handleOpenBuilder}
                  className="text-xs font-semibold text-[#6C2CEB] hover:underline whitespace-nowrap shrink-0"
                >
                  {t('console.dashboard.launchBuilder')}
                </button>
              )}
            </div>
          </section>
        )}

        {/* CONTENT RECORDS VIEW */}
        {activeTab === 'content' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {cms.contentTypes.map((ct) => {
                  const count = (cms.records || []).filter(
                    (r) => r.contentTypeId === ct.id && r.status !== 'trash'
                  ).length;
                  const selected = activeContentTypeId === ct.id;
                  return (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => {
                        setSelectedContentTypeId(ct.id);
                        setSelectedRecordIds([]);
                      }}
                      className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors font-mono-count ${
                        selected
                          ? 'bg-[#211B2E] text-white'
                          : 'bg-white border border-[#211B2E]/15 text-[#4A435C] hover:bg-[#F7F6FA]'
                      }`}
                    >
                      <span>{ct.pluralLabel}</span>{' '}
                      <span className="font-mono tabular-nums opacity-80">({count})</span>
                    </button>
                  );
                })}
              </div>

              {currentContentType && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRecord(null);
                    setIsRecordEditorOpen(true);
                  }}
                  className="min-h-[38px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('cms.content.addItem', { type: currentContentType.singularLabel })}</span>
                </button>
              )}
            </div>

            {/* Search, Filter & Bulk Actions Bar */}
            <div className="rounded-xl border border-[#211B2E]/10 bg-white p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[220px]">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-[#574F6B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('cms.content.searchPlaceholder')}
                    aria-label={t('cms.content.searchPlaceholder')}
                    className="w-full min-h-[36px] pl-9 pr-3 py-1.5 border border-[#211B2E]/15 rounded-lg text-xs bg-[#F7F6FA] focus:bg-white focus:outline-none"
                  />
                </div>
                <select
                  aria-label={t('cms.content.colStatus')}
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setSelectedRecordIds([]);
                  }}
                  className="min-h-[36px] px-3 py-1.5 border border-[#211B2E]/15 rounded-lg text-xs bg-white text-[#211B2E]"
                >
                  <option value="all">{t('cms.content.allStatuses')}</option>
                  <option value="published">{t('cms.recordEditor.statusPublished')}</option>
                  <option value="draft">{t('cms.recordEditor.statusDraft')}</option>
                  <option value="archived">{t('cms.recordEditor.statusArchived')}</option>
                  <option value="trash">{t('console.cms.statusTrash')}</option>
                </select>
              </div>

              {selectedRecordIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleBulkAction('publish')}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-semibold"
                  >
                    {t('console.cms.bulkPublish', { count: selectedRecordIds.length })}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('draft')}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] text-[#211B2E] text-xs font-semibold"
                  >
                    {t('console.cms.bulkDraft', { count: selectedRecordIds.length })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulkTrash(true)}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t('console.cms.bulkTrash', { count: selectedRecordIds.length })}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Records Table */}
            <div className="rounded-xl border border-[#211B2E]/10 bg-white overflow-hidden">
              <div className="px-4 py-3 bg-[#FAF9FC] border-b border-[#211B2E]/10 grid grid-cols-12 items-center text-xs font-semibold text-[#574F6B]">
                <div className="col-span-6 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label={t('console.cms.selectAll')}
                    className="accent-[#6C2CEB]"
                  />
                  <span>{t('cms.content.colTitleSlug')}</span>
                </div>
                <div className="col-span-2">{t('cms.content.colStatus')}</div>
                <div className="col-span-4 text-right">{t('cms.content.colActions')}</div>
              </div>

              {filteredRecords.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-xs text-[#4A435C]">
                    {t('cms.content.noRecords', { type: currentContentType?.pluralLabel })}
                  </p>
                  {currentContentType && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRecord(null);
                        setIsRecordEditorOpen(true);
                      }}
                      className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {t('cms.content.addItem', { type: currentContentType.singularLabel })}
                      </span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-[#211B2E]/8">
                  {filteredRecords.map((rec) => {
                    const isChecked = selectedRecordIds.includes(rec.recordId);
                    return (
                      <div
                        key={rec.recordId}
                        className="px-4 py-3 grid grid-cols-12 items-center text-xs hover:bg-[#FAF9FC]"
                      >
                        <div className="col-span-6 flex items-center gap-3 min-w-0 pr-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRecordIds((prev) => [...prev, rec.recordId]);
                              } else {
                                setSelectedRecordIds((prev) =>
                                  prev.filter((id) => id !== rec.recordId)
                                );
                              }
                            }}
                            aria-label={rec.title}
                            className="accent-[#6C2CEB] shrink-0"
                          />
                          <div className="min-w-0 space-y-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecord(rec);
                                setIsRecordEditorOpen(true);
                              }}
                              className="font-semibold text-[#211B2E] hover:text-[#6C2CEB] block truncate text-left"
                            >
                              {rec.title}
                            </button>
                            <div className="font-mono text-[11px] text-[#574F6B] truncate">
                              /{rec.slug} · rev {rec.revision}
                            </div>
                          </div>
                        </div>

                        <div className="col-span-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-medium ${
                              rec.status === 'published'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : rec.status === 'draft'
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-[#211B2E]/15 bg-[#F7F6FA] text-[#4A435C]'
                            }`}
                          >
                            {rec.status === 'published'
                              ? t('cms.recordEditor.statusPublished')
                              : rec.status === 'draft'
                              ? t('cms.recordEditor.statusDraft')
                              : rec.status === 'trash'
                              ? t('console.cms.statusTrash')
                              : t('cms.recordEditor.statusArchived')}
                          </span>
                        </div>

                        <div className="col-span-4 flex items-center justify-end gap-1">
                          {rec.status === 'trash' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(rec, 'draft')}
                                title={t('console.cms.restore')}
                                className="px-2.5 py-1.5 rounded-md border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-[#211B2E] inline-flex items-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{t('console.cms.restore')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmPermanentDelete(rec)}
                                title={t('console.cms.deleteForever')}
                                className="p-1.5 hover:bg-red-50 rounded-md text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDuplicateRecord(rec)}
                                title={t('common.duplicate')}
                                className="p-1.5 hover:bg-[#EDEAF5] rounded-md text-[#4A435C]"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRecord(rec);
                                  setIsRecordEditorOpen(true);
                                }}
                                title={t('common.edit')}
                                className="p-1.5 hover:bg-[#EDEAF5] rounded-md text-[#4A435C]"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(rec, 'trash')}
                                title={t('common.delete')}
                                className="p-1.5 hover:bg-red-50 rounded-md text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAXONOMIES VIEW */}
        {activeTab === 'taxonomies' && (
          <CmsTaxonomiesView
            cms={cms}
            onUpdateCms={handleUpdateCmsFromSubView}
            showToast={showNotice}
          />
        )}

        {/* CONTENT TYPES VIEW */}
        {activeTab === 'types' && (
          <CmsContentTypeBuilder
            cms={cms}
            onUpdateCms={handleUpdateCmsFromSubView}
            showToast={showNotice}
          />
        )}

        {/* SETTINGS & SYNC VIEW */}
        {activeTab === 'settings' && (
          <section className="rounded-xl border border-[#211B2E]/10 bg-white p-6 space-y-6">
            <div className="space-y-1">
              <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
                {t('console.cms.syncHeading')}
              </h2>
              <p className="text-xs text-[#4A435C]">{t('console.cms.syncSubtitle')}</p>
            </div>

            {(!googleWorkspaceConnected || googleWorkspaceNeedsReauth) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-amber-900">{t('console.cms.workspaceNotConnected')}</p>
                <button
                  type="button"
                  onClick={() => onNavigate('/workspace')}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-900"
                >
                  {t('console.connectWorkspaceBtn')}
                </button>
              </div>
            )}

            <div className="border-t border-[#211B2E]/10 divide-y divide-[#211B2E]/8 text-xs">
              <div className="py-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[#574F6B]">{t('console.drive.pathLabel')}</span>
                <span className="font-mono text-[#211B2E]">
                  Builly/{organization.org_slug}/{project.project_slug}/Data/CMS/
                </span>
              </div>
              <div className="py-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[#574F6B]">{t('console.cms.manifestFileLabel')}</span>
                <span className="font-mono text-[#211B2E]">
                  {remoteInfo.manifestFileId || cms.storageHealth.manifestDriveFileId || '—'}
                </span>
              </div>
              <div className="py-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[#574F6B]">{t('console.cms.spreadsheetLabel')}</span>
                <span className="font-mono text-[#211B2E]">
                  {remoteInfo.spreadsheetId || 'Auto-created on first Drive + Sheets sync'}
                </span>
              </div>
              <div className="py-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[#574F6B]">{t('console.cms.lastSyncedAt')}</span>
                <span className="font-mono text-[#211B2E]">
                  {remoteLastSyncedAt || cms.storageHealth.lastCmsSyncAt || t('console.cms.neverSynced')}
                </span>
              </div>
              {remoteInfo.datasetSpreadsheets.length > 0 && (
                <div className="py-3 space-y-2">
                  <div className="text-[#574F6B]">{t('console.cms.datasetSpreadsheetsLabel')}</div>
                  <div className="space-y-1.5">
                    {remoteInfo.datasetSpreadsheets.map((ds) => (
                      <div
                        key={`${ds.datasetKey}:${ds.spreadsheetId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#F7F6FA] px-3 py-1.5 border border-[#211B2E]/10"
                      >
                        <span className="font-semibold text-[#211B2E]">{ds.title || ds.datasetKey}</span>
                        <span className="font-mono text-[11px] text-[#574F6B]">{ds.spreadsheetId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={syncingRemote || pullingRemote || effectiveReadOnly}
                onClick={handlePushSync}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {syncingRemote ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                <span>{t('console.cms.syncPushBtn')}</span>
              </button>
              <button
                type="button"
                disabled={pullingRemote || syncingRemote}
                onClick={handlePullRemote}
                className="min-h-[38px] px-4 py-2 rounded-lg border border-[#211B2E]/15 bg-white hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {pullingRemote ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>{t('console.cms.syncPullBtn')}</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {isRecordEditorOpen && currentContentType && (
        <CmsRecordEditor
          cms={cms}
          contentType={currentContentType}
          recordToEdit={editingRecord}
          onSave={handleSaveRecord}
          onClose={() => {
            setIsRecordEditorOpen(false);
            setEditingRecord(null);
          }}
          showToast={showNotice}
        />
      )}
    </div>
  );
};
