import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectModuleHeader } from '../../components/console/ProjectModuleHeader';
import { workspaceHierarchyClient } from '../../features/console/workspaceHierarchyClient';
import { storageService } from '../../services/storageService';
import {
  ALL_PROJECT_MODULES,
  OrganizationRecord,
  ProjectModuleKey,
  ProjectModuleRecord,
  ProjectRecord,
  WorkspaceResourceRecord,
} from '../../types/workspace';
import { buildConsoleUrl } from '../../utils/routes';

interface ProjectSettingsPageProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
  resources: WorkspaceResourceRecord[];
  accessToken: string;
  googleWorkspaceConnected: boolean;
  googleWorkspaceNeedsReauth: boolean;
  readOnly?: boolean;
  outageStale?: boolean;
  outageLastSyncedAt?: string | null;
  togglingModuleKey: string | null;
  provisioningDrive: boolean;
  authBusy: boolean;
  onToggleModule: (modKey: ProjectModuleKey, currentlyEnabled: boolean) => Promise<void>;
  onProvisionDrive: (verifyRemote: boolean) => Promise<void>;
  onRefreshBootstrap: () => Promise<void>;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onSignOut: () => Promise<void>;
}

export const ProjectSettingsPage: React.FC<ProjectSettingsPageProps> = ({
  organization,
  project,
  modules,
  resources,
  accessToken,
  googleWorkspaceConnected,
  googleWorkspaceNeedsReauth,
  readOnly = false,
  outageStale = false,
  outageLastSyncedAt = null,
  togglingModuleKey,
  provisioningDrive,
  authBusy,
  onToggleModule,
  onProvisionDrive,
  onRefreshBootstrap,
  onNavigate,
  onSignOut,
}) => {
  const { t } = useTranslation();
  const writesLocked = Boolean(readOnly || project.status === 'archived');

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [savingMeta, setSavingMeta] = useState(false);

  const [archivingProject, setArchivingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);
  const [confirmClearLocal, setConfirmClearLocal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (writesLocked) return;
    setErrorBanner(null);
    setNotice(null);
    if (name.trim().length < 2) {
      setErrorBanner(t('console.settings.nameTooShort'));
      return;
    }
    setSavingMeta(true);
    try {
      await workspaceHierarchyClient.updateProject(accessToken, project.project_id, {
        name: name.trim(),
        description: description.trim(),
        expectedRevision: project.canonical_revision,
      });
      await onRefreshBootstrap();
      setNotice(t('console.settings.savedSuccess'));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to update Project metadata.');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleArchiveProject = async () => {
    if (readOnly || project.status === 'archived') return;
    setErrorBanner(null);
    setNotice(null);
    setArchivingProject(true);
    try {
      await workspaceHierarchyClient.archiveProject(accessToken, project.project_id, {
        expectedRevision: project.canonical_revision,
      });
      await onRefreshBootstrap();
      setNotice(t('console.settings.projectArchivedSuccess'));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to archive Project.');
    } finally {
      setArchivingProject(false);
    }
  };

  const handleDeleteProjectPermanently = async () => {
    if (readOnly || project.status !== 'archived') return;
    setErrorBanner(null);
    setNotice(null);
    setDeletingProject(true);
    try {
      await workspaceHierarchyClient.deleteProject(accessToken, project.project_id, {
        confirmPermanentDelete: true,
      });
      setConfirmPermanentDelete(false);
      await onRefreshBootstrap();
      onNavigate(buildConsoleUrl({ orgId: organization.org_id }));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to delete Project permanently.');
    } finally {
      setDeletingProject(false);
    }
  };

  const handleResetLocalCache = () => {
    storageService.resetToDefault(project.project_id);
    setConfirmClearLocal(false);
    setNotice(t('console.settings.localResetSuccess'));
  };

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      <ProjectModuleHeader
        organization={organization}
        project={project}
        modules={modules}
        activeModule="settings"
        authBusy={authBusy}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
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
            {t('console.settings.heading')}
          </h1>
          <p className="text-xs sm:text-sm text-[#4A435C]">
            {t('console.settings.subtitle', { projectName: project.name })}
          </p>
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

        {/* Project Metadata Form */}
        <section className="rounded-xl border border-[#211B2E]/10 bg-white p-6 space-y-4">
          <div>
            <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
              {t('console.settings.generalTitle')}
            </h2>
            <div className="text-xs font-mono text-[#574F6B] mt-0.5">
              {organization.org_slug} / {project.project_slug}
            </div>
          </div>

          <form onSubmit={handleSaveMetadata} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#211B2E]">
                  {t('console.projects.nameLabel')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  required
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#211B2E]">
                  {t('console.projects.descLabel')}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  placeholder={t('console.projects.descPlaceholder')}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingMeta || writesLocked}
              className="min-h-[38px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {savingMeta ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{t('common.save')}</span>
            </button>
          </form>
        </section>

        {/* Enabled Modules Matrix */}
        <section className="rounded-xl border border-[#211B2E]/10 bg-white p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
              {t('console.projects.modulesHeading')}
            </h2>
            <p className="text-xs text-[#4A435C]">{t('console.dashboard.launcherSubtitle')}</p>
          </div>

          <div className="border-t border-[#211B2E]/10 divide-y divide-[#211B2E]/8">
            {ALL_PROJECT_MODULES.map((modKey) => {
              const modRecord = modules.find((m) => m.module_key === modKey);
              const enabled = modRecord ? modRecord.enabled === 1 : true;
              const busy = togglingModuleKey === modKey;
              return (
                <div
                  key={modKey}
                  className="py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#211B2E]">
                      {t(`console.modules.${modKey}`)}
                    </div>
                    <div className="text-[#4A435C]">
                      {t(`console.dashboard.moduleDescriptions.${modKey}`)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy || modKey === 'settings' || writesLocked}
                    onClick={() => void onToggleModule(modKey, enabled)}
                    className={`min-h-[34px] px-3 py-1 rounded border text-xs font-semibold shrink-0 disabled:opacity-50 ${
                      enabled
                        ? 'bg-[#F4EFFF] border-[#6C2CEB]/30 text-[#6C2CEB]'
                        : 'bg-[#F7F6FA] border-[#211B2E]/15 text-[#574F6B]'
                    }`}
                  >
                    {busy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : enabled ? (
                      t('common.enabled')
                    ) : (
                      t('common.disabled')
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Drive Isolation & Resources */}
        <section className="rounded-xl border border-[#211B2E]/10 bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#6C2CEB]" />
                <span>{t('console.drive.heading')}</span>
              </h2>
              <div className="text-xs font-mono text-[#574F6B]">
                Builly/{organization.org_slug}/{project.project_slug}/
              </div>
            </div>

            {googleWorkspaceConnected && !googleWorkspaceNeedsReauth ? (
              <button
                type="button"
                disabled={provisioningDrive || writesLocked}
                onClick={() => void onProvisionDrive(Boolean(project.drive_folder_id))}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {provisioningDrive && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {provisioningDrive
                    ? t('console.drive.provisioning')
                    : project.drive_folder_id
                    ? t('console.drive.verifyBtn')
                    : t('console.drive.provisionBtn')}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('/workspace')}
                className="min-h-[38px] px-4 py-2 rounded-lg border border-[#211B2E]/15 text-xs font-semibold text-[#211B2E]"
              >
                {t('console.connectWorkspaceBtn')}
              </button>
            )}
          </div>

          {resources.length > 0 && (
            <div className="border-t border-[#211B2E]/10 divide-y divide-[#211B2E]/8">
              {resources.map((resItem) => (
                <div
                  key={resItem.resource_id}
                  className="py-2.5 flex items-center justify-between gap-4 text-xs"
                >
                  <span className="font-medium text-[#211B2E] truncate">{resItem.title}</span>
                  <span className="font-mono text-[#574F6B] shrink-0">{resItem.resource_kind}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Project Lifecycle: Archive & Permanent Delete */}
        <section className="rounded-xl border border-[#211B2E]/15 bg-white p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
              {t('console.settings.lifecycleTitle')}
            </h2>
            <p className="text-xs text-[#4A435C] leading-relaxed">
              {project.status === 'archived'
                ? t('console.settings.lifecycleArchivedDesc')
                : t('console.settings.lifecycleActiveDesc')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {project.status === 'active' ? (
              <button
                type="button"
                disabled={archivingProject || readOnly}
                onClick={() => void handleArchiveProject()}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {archivingProject ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Archive className="w-3.5 h-3.5" />
                )}
                <span>{t('console.settings.archiveProjectBtn')}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={deletingProject || readOnly}
                onClick={() => setConfirmPermanentDelete(true)}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('console.settings.deleteProjectPermanentBtn')}</span>
              </button>
            )}
          </div>
        </section>

        {/* Danger Zone (Browser Local Cache Only — Non-Destructive to Remote Drive / D1) */}
        <section className="rounded-xl border border-red-200 bg-white p-6 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-red-900">
                {t('console.settings.dangerTitle')}
              </h2>
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.settings.dangerDesc')}
              </p>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setConfirmClearLocal(true)}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('console.settings.resetLocalCacheBtn')}</span>
            </button>
          </div>
        </section>

        {confirmPermanentDelete && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-[#211B2E]/50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl border border-[#211B2E]/15 max-w-md w-full p-5 space-y-4">
              <h3 className="font-['Outfit',sans-serif] text-base font-semibold text-red-900">
                {t('console.settings.confirmDeleteProjectTitle', { name: project.name })}
              </h3>
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.settings.confirmDeleteProjectDesc')}
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deletingProject}
                  onClick={() => setConfirmPermanentDelete(false)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#211B2E]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={deletingProject || readOnly}
                  onClick={() => void handleDeleteProjectPermanently()}
                  className="min-h-[36px] px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {deletingProject && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('console.settings.deleteProjectPermanentBtn')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmClearLocal && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-[#211B2E]/50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl border border-[#211B2E]/15 max-w-md w-full p-5 space-y-4">
              <h3 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
                {t('console.settings.confirmResetTitle')}
              </h3>
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.settings.confirmResetDesc')}
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearLocal(false)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#211B2E]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleResetLocalCache}
                  className="min-h-[36px] px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
