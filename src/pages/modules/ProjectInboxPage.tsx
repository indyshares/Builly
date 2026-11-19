import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CmsInboxView } from '../../components/cms/CmsInboxView';
import { ProjectModuleHeader } from '../../components/console/ProjectModuleHeader';
import { WorkerApiError } from '../../features/workspace-connection/workspaceApiClient';
import { workspaceHierarchyClient } from '../../features/console/workspaceHierarchyClient';
import { cmsRepository } from '../../services/cms/cmsRepository';
import { escapeSheetFormulaCell } from '../../services/cms/cmsValidation';
import { CmsDocument, InboxSubmission } from '../../types/cms';
import {
  DatasetSpreadsheetRef,
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
} from '../../types/workspace';
import { buildConsoleUrl } from '../../utils/routes';

interface ProjectInboxPageProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
  sites: SiteRecord[];
  accessToken: string;
  googleWorkspaceConnected: boolean;
  googleWorkspaceNeedsReauth: boolean;
  readOnly?: boolean;
  outageStale?: boolean;
  outageLastSyncedAt?: string | null;
  authBusy: boolean;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onSignOut: () => Promise<void>;
}

export function mergeRemoteInboxIntoCms(
  currentCms: CmsDocument,
  remoteData: {
    savedState?: {
      inboxSubmissions?: InboxSubmission[];
      inboxCategories?: CmsDocument['inboxCategories'];
      inboxNotes?: CmsDocument['inboxNotes'];
      inboxActivities?: CmsDocument['inboxActivities'];
      forms?: CmsDocument['forms'];
    } | null;
    remoteSubmissions?: Array<{
      inbox_item_id: string;
      submission_id: string;
      site_id: string;
      form_id: string;
      form_name_snapshot: string;
      category_id: string;
      destination_spreadsheet_id: string;
      destination_worksheet_id: string;
      submitted_at: string;
      source_page: string;
      fields: Record<string, unknown>;
    }>;
  }
): { nextCms: CmsDocument; addedCount: number } {
  const saved = remoteData.savedState;
  const localSubs = currentCms.inboxSubmissions || [];
  const mergedMap = new Map<string, InboxSubmission>();

  localSubs.forEach((s) => mergedMap.set(s.submission_id || s.inbox_item_id, s));

  // Apply remote triage savedState if any items missing locally
  let addedCount = 0;
  if (saved?.inboxSubmissions) {
    saved.inboxSubmissions.forEach((remoteSub) => {
      const key = remoteSub.submission_id || remoteSub.inbox_item_id;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, remoteSub);
        addedCount++;
      }
    });
  }

  // Merge live public runtime submissions appended to destination Sheets
  (remoteData.remoteSubmissions || []).forEach((rs) => {
    const key = rs.submission_id || rs.inbox_item_id;
    if (!mergedMap.has(key)) {
      const nowIso = new Date().toISOString();
      mergedMap.set(key, {
        inbox_item_id: rs.inbox_item_id,
        submission_id: rs.submission_id,
        site_id: rs.site_id,
        form_id: rs.form_id,
        form_name_snapshot: rs.form_name_snapshot,
        category_id: rs.category_id,
        destination_spreadsheet_id: rs.destination_spreadsheet_id,
        destination_worksheet_id: rs.destination_worksheet_id,
        read_status: 'unread',
        starred: false,
        archived: false,
        spam_status: 'ham',
        submitted_at: rs.submitted_at,
        source_page: rs.source_page || '/',
        fields: rs.fields || {},
        created_at: rs.submitted_at || nowIso,
        updated_at: nowIso,
      });
      addedCount++;
    }
  });

  const mergedCategories = [...(currentCms.inboxCategories || [])];
  const existingCatIds = new Set(mergedCategories.map((c) => c.category_id));
  (saved?.inboxCategories || []).forEach((cat) => {
    if (!existingCatIds.has(cat.category_id)) {
      mergedCategories.push(cat);
      existingCatIds.add(cat.category_id);
    }
  });

  const mergedNotes = [...(currentCms.inboxNotes || [])];
  const existingNoteIds = new Set(mergedNotes.map((n) => n.note_id));
  (saved?.inboxNotes || []).forEach((note) => {
    if (!existingNoteIds.has(note.note_id)) {
      mergedNotes.push(note);
      existingNoteIds.add(note.note_id);
    }
  });

  const mergedActivities = [...(currentCms.inboxActivities || [])];
  const existingActIds = new Set(mergedActivities.map((a) => a.activity_id));
  (saved?.inboxActivities || []).forEach((act) => {
    if (!existingActIds.has(act.activity_id)) {
      mergedActivities.push(act);
      existingActIds.add(act.activity_id);
    }
  });

  const sortedSubmissions = Array.from(mergedMap.values()).sort((a, b) =>
    (b.submitted_at || '').localeCompare(a.submitted_at || '')
  );

  return {
    addedCount,
    nextCms: {
      ...currentCms,
      inboxSubmissions: sortedSubmissions,
      inboxCategories: mergedCategories,
      inboxNotes: mergedNotes,
      inboxActivities: mergedActivities,
    },
  };
}

export const ProjectInboxPage: React.FC<ProjectInboxPageProps> = ({
  organization,
  project,
  modules,
  sites,
  accessToken,
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
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [syncingRemote, setSyncingRemote] = useState(false);
  const [destinationsCount, setDestinationsCount] = useState(0);
  const [deliveryIssueCount, setDeliveryIssueCount] = useState(0);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [datasetSpreadsheets, setDatasetSpreadsheets] = useState<DatasetSpreadsheetRef[]>([]);
  const [remoteRevision, setRemoteRevision] = useState<number | undefined>(undefined);
  const [remoteReadOnly, setRemoteReadOnly] = useState(readOnly);
  const [remoteStale, setRemoteStale] = useState(outageStale);
  const [remoteUnavailable, setRemoteUnavailable] = useState(false);
  const [remoteLastSyncedAt, setRemoteLastSyncedAt] = useState<string | null>(outageLastSyncedAt);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const effectiveReadOnly = Boolean(
    readOnly || remoteReadOnly || remoteUnavailable || project.status === 'archived'
  );

  useEffect(() => {
    setCms(cmsRepository.getCms(project.project_id));
    return cmsRepository.subscribe(project.project_id, (updated) => {
      setCms(updated);
    });
  }, [project.project_id]);

  const fetchRemoteInbox = useCallback(async () => {
    if (!accessToken) return;
    setLoadingRemote(true);
    setErrorBanner(null);
    setRemoteUnavailable(false);
    try {
      const data = await workspaceHierarchyClient.getProjectInbox(accessToken, project.project_id);
      setDestinationsCount(data.destinations.length);
      setSpreadsheetId(data.spreadsheetId || '');
      setDatasetSpreadsheets(data.datasetSpreadsheets || []);
      setRemoteRevision(data.revision);
      setRemoteReadOnly(Boolean(readOnly || data.readOnly));
      setRemoteStale(Boolean(outageStale || data.stale));
      setRemoteLastSyncedAt(data.lastSyncedAt ?? outageLastSyncedAt ?? null);
      setDeliveryIssueCount(
        data.deliveryLogs.filter((d) => d.status === 'partial_error').length
      );
      const current = cmsRepository.getCms(project.project_id);
      const { nextCms, addedCount } = mergeRemoteInboxIntoCms(current, data);
      if (addedCount > 0 || data.savedState) {
        const saved = cmsRepository.saveCms(project.project_id, nextCms);
        setCms(saved);
      }
      if (addedCount > 0) {
        setNotice(t('console.inbox.pulledNewCount', { count: addedCount }));
      }
    } catch (err) {
      if (
        err instanceof WorkerApiError &&
        (err.status === 503 || err.code === 'WRITE_DISABLED_OAUTH_UNAVAILABLE')
      ) {
        setRemoteUnavailable(true);
        setRemoteReadOnly(true);
      }
      setErrorBanner(err instanceof Error ? err.message : 'Unable to load remote Inbox.');
    } finally {
      setLoadingRemote(false);
    }
  }, [accessToken, project.project_id, readOnly, outageStale, outageLastSyncedAt, t]);

  useEffect(() => {
    void fetchRemoteInbox();
  }, [fetchRemoteInbox]);

  const handleUpdateCms = useCallback(
    (nextCms: CmsDocument) => {
      const saved = cmsRepository.saveCms(project.project_id, nextCms);
      setCms(saved);
    },
    [project.project_id]
  );

  const handleSyncToDriveAndSheets = async () => {
    if (effectiveReadOnly) {
      setErrorBanner(t('console.outage.readOnlyDesc'));
      return;
    }
    if (!googleWorkspaceConnected || googleWorkspaceNeedsReauth) {
      setErrorBanner(t('console.inbox.workspaceNotConnected'));
      return;
    }
    setSyncingRemote(true);
    setErrorBanner(null);
    setNotice(null);

    try {
      const submissions = cms.inboxSubmissions || [];
      const registryRows = submissions.map((s) => [
        escapeSheetFormulaCell(s.inbox_item_id),
        escapeSheetFormulaCell(s.submission_id),
        escapeSheetFormulaCell(s.form_id),
        escapeSheetFormulaCell(s.form_name_snapshot),
        escapeSheetFormulaCell(s.category_id),
        escapeSheetFormulaCell(s.read_status),
        s.starred ? 'TRUE' : 'FALSE',
        s.archived ? 'TRUE' : 'FALSE',
        escapeSheetFormulaCell(s.spam_status),
        escapeSheetFormulaCell(s.submitted_at),
        escapeSheetFormulaCell(s.source_page || '/'),
        escapeSheetFormulaCell(String(s.fields?.full_name || s.fields?.name || '')),
        escapeSheetFormulaCell(String(s.fields?.email || '')),
        escapeSheetFormulaCell(String(s.fields?.message || '')),
      ]);

      const res = await workspaceHierarchyClient.syncProjectInbox(accessToken, project.project_id, {
        ...(remoteRevision !== undefined ? { expectedRevision: remoteRevision } : {}),
        inboxState: {
          forms: cms.forms || [],
          inboxCategories: cms.inboxCategories || [],
          inboxSubmissions: submissions,
          inboxNotes: cms.inboxNotes || [],
          inboxActivities: cms.inboxActivities || [],
        },
        syncSheets: true,
        title: `Builly Inbox — ${project.name}`,
        tables: [
          {
            title: 'INBOX_REGISTRY',
            headers: [
              'inbox_item_id',
              'submission_id',
              'form_id',
              'form_name',
              'category_id',
              'read_status',
              'starred',
              'archived',
              'spam_status',
              'submitted_at',
              'source_page',
              'sender_name',
              'sender_email',
              'message_preview',
            ],
            rows: registryRows,
          },
        ],
      });

      setSpreadsheetId(res.spreadsheetId || '');
      setDatasetSpreadsheets(res.datasetSpreadsheets || []);
      if (res.revision !== undefined) setRemoteRevision(res.revision);
      setRemoteLastSyncedAt(res.syncedAt);
      setNotice(t('console.inbox.syncSuccess'));
    } catch (err) {
      if (err instanceof WorkerApiError && err.status === 503) {
        setRemoteReadOnly(true);
      }
      setErrorBanner(err instanceof Error ? err.message : 'Failed to sync Project Inbox.');
    } finally {
      setSyncingRemote(false);
    }
  };

  const unreadCount = useMemo(
    () =>
      (cms.inboxSubmissions || []).filter(
        (s) => s.read_status === 'unread' && !s.archived && s.spam_status !== 'spam'
      ).length,
    [cms.inboxSubmissions]
  );

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      <ProjectModuleHeader
        organization={organization}
        project={project}
        modules={modules}
        activeModule="inbox"
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
              {t('console.inbox.heading')}
            </h1>
            <p className="text-xs sm:text-sm text-[#4A435C]">
              {t('console.inbox.subtitle', { projectName: project.name })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loadingRemote}
              onClick={() => void fetchRemoteInbox()}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {loadingRemote ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{t('console.inbox.pullBtn')}</span>
            </button>

            <button
              type="button"
              disabled={
                syncingRemote ||
                !googleWorkspaceConnected ||
                googleWorkspaceNeedsReauth ||
                effectiveReadOnly
              }
              onClick={handleSyncToDriveAndSheets}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {syncingRemote ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{t('console.inbox.syncBtn')}</span>
            </button>
          </div>
        </div>

        {/* Single-Elevation Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#211B2E]/10 bg-white rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#211B2E]/10">
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.inbox.unreadStat')}</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
              {unreadCount} / {(cms.inboxSubmissions || []).length}
            </div>
          </div>
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.inbox.formsStat')}</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
              {(cms.forms || []).length}
            </div>
          </div>
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.inbox.destinationsStat')}</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
              {destinationsCount}
            </div>
          </div>
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.inbox.deliveryStat')}</div>
            <div className="text-sm font-semibold text-[#211B2E] pt-0.5 tabular-nums">
              {deliveryIssueCount > 0
                ? t('console.inbox.deliveryIssues', { count: deliveryIssueCount })
                : spreadsheetId
                ? t('console.inbox.sheetsLinked')
                : sites.length > 0
                ? t('console.inbox.readyStatus')
                : t('console.inbox.localOnlyStatus')}
            </div>
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
                onClick={() => void fetchRemoteInbox()}
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

        {datasetSpreadsheets.length > 0 && (
          <div className="rounded-xl border border-[#211B2E]/10 bg-white px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[#211B2E]">
              {t('console.cms.datasetSpreadsheetsLabel')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {datasetSpreadsheets.map((ds) => (
                <span
                  key={`${ds.datasetKey}:${ds.spreadsheetId}`}
                  className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#F7F6FA] border border-[#211B2E]/10 text-[#4A435C]"
                >
                  {ds.title || ds.datasetKey}: {ds.spreadsheetId}
                </span>
              ))}
            </div>
          </div>
        )}

        <section className="rounded-xl border border-[#211B2E]/10 bg-white overflow-hidden min-h-[580px] flex flex-col">
          {remoteUnavailable && (cms.inboxSubmissions || []).length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
              <ShieldAlert className="w-10 h-10 text-amber-600" />
              <div className="text-sm font-semibold text-[#211B2E]">
                {t('console.outage.unavailableTitle')}
              </div>
              <p className="text-xs text-[#4A435C] max-w-md">{t('console.outage.unavailableDesc')}</p>
            </div>
          ) : (cms.inboxSubmissions || []).length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
              <Inbox className="w-10 h-10 text-[#574F6B]/50" />
              <div className="text-sm font-semibold text-[#211B2E]">
                {t('console.inbox.emptyTitle')}
              </div>
              <p className="text-xs text-[#4A435C] max-w-md">{t('console.inbox.emptyDesc')}</p>
            </div>
          ) : (
            <CmsInboxView
              siteCms={cms}
              onUpdateCms={handleUpdateCms}
              showToast={(msg) => setNotice(msg)}
            />
          )}
        </section>
      </main>
    </div>
  );
};
