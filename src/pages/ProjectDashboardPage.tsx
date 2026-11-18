import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FolderOpen,
  Globe,
  History,
  Inbox,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BuillyLogo } from '../components/common/BuillyLogo';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { validatePortfolioSlug } from '../config/breakpoints';
import { saveActiveProjectContext, storageService } from '../services/storageService';
import {
  ALL_PROJECT_MODULES,
  OrganizationRecord,
  ProjectModuleKey,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
  WorkspaceResourceRecord,
} from '../types/workspace';
import { buildBuilderUrl, buildConsoleUrl } from '../utils/routes';

interface ProjectDashboardPageProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
  sites: SiteRecord[];
  resources: WorkspaceResourceRecord[];
  googleWorkspaceConnected: boolean;
  googleWorkspaceNeedsReauth: boolean;
  togglingModuleKey: string | null;
  provisioningDrive: boolean;
  savingSite: boolean;
  driveNotice: string | null;
  actionError: string | null;
  authBusy: boolean;
  onDismissError: () => void;
  onToggleModule: (modKey: ProjectModuleKey, currentlyEnabled: boolean) => Promise<void>;
  onProvisionDrive: (verifyRemote: boolean) => Promise<void>;
  onAddSite: (siteName: string, siteSlug: string) => Promise<boolean>;
  onUpdateSite: (siteId: string, siteName: string, siteSlug: string) => Promise<boolean>;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onSignOut: () => Promise<void>;
}

const MODULE_ICONS: Record<ProjectModuleKey, React.ComponentType<{ className?: string }>> = {
  builder: Layers,
  cms: Database,
  inbox: Inbox,
  assets: FolderOpen,
  publishing: Globe,
  versions: History,
  settings: Settings,
};

export const ProjectDashboardPage: React.FC<ProjectDashboardPageProps> = ({
  organization,
  project,
  modules,
  sites,
  resources,
  googleWorkspaceConnected,
  googleWorkspaceNeedsReauth,
  togglingModuleKey,
  provisioningDrive,
  savingSite,
  driveNotice,
  actionError,
  authBusy,
  onDismissError,
  onToggleModule,
  onProvisionDrive,
  onAddSite,
  onUpdateSite,
  onNavigate,
  onSignOut,
}) => {
  const { t } = useTranslation();

  const [showAddSite, setShowAddSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteSlug, setNewSiteSlug] = useState('');
  const [localFormError, setLocalFormError] = useState<string | null>(null);

  const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteSlug, setEditSiteSlug] = useState('');

  const [hasIsolatedDraft, setHasIsolatedDraft] = useState(() =>
    storageService.hasProjectDraft(project.project_id)
  );
  const [legacyImportNotice, setLegacyImportNotice] = useState<string | null>(null);

  const legacyDraftInfo = useMemo(() => storageService.inspectLegacyDraft(), []);

  const enabledModulesCount = useMemo(
    () =>
      ALL_PROJECT_MODULES.filter((key) => {
        const rec = modules.find((m) => m.module_key === key);
        return rec ? rec.enabled === 1 : true;
      }).length,
    [modules]
  );

  const isBuilderEnabled = useMemo(() => {
    const rec = modules.find((m) => m.module_key === 'builder');
    return rec ? rec.enabled === 1 : true;
  }, [modules]);

  const handleOpenBuilder = (extraSearch?: string) => {
    saveActiveProjectContext({
      orgId: organization.org_id,
      orgName: organization.name,
      projectId: project.project_id,
      projectName: project.name,
    });
    const base = buildBuilderUrl({
      orgId: organization.org_id,
      projectId: project.project_id,
    });
    onNavigate(extraSearch ? `${base}&${extraSearch}` : base);
  };

  const handleImportLegacyDraft = () => {
    const imported = storageService.importLegacyDraftToProject(project.project_id);
    if (imported) {
      setHasIsolatedDraft(true);
      setLegacyImportNotice(t('console.dashboard.legacyDraftImported'));
    }
  };

  const handleCreateSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalFormError(null);
    const slugCheck = validatePortfolioSlug(newSiteSlug);
    if (!slugCheck.valid) {
      setLocalFormError(slugCheck.error || 'Invalid site slug.');
      return;
    }
    if (!newSiteName.trim()) {
      setLocalFormError('Site name is required.');
      return;
    }
    const ok = await onAddSite(newSiteName.trim(), slugCheck.normalized);
    if (ok) {
      setNewSiteName('');
      setNewSiteSlug('');
      setShowAddSite(false);
    }
  };

  const handleEditSiteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite) return;
    setLocalFormError(null);
    const slugCheck = validatePortfolioSlug(editSiteSlug);
    if (!slugCheck.valid) {
      setLocalFormError(slugCheck.error || 'Invalid site slug.');
      return;
    }
    if (!editSiteName.trim()) {
      setLocalFormError('Site name is required.');
      return;
    }
    const ok = await onUpdateSite(editingSite.site_id, editSiteName.trim(), slugCheck.normalized);
    if (ok) {
      setEditingSite(null);
    }
  };

  const handleModulePrimaryAction = (modKey: ProjectModuleKey) => {
    if (modKey === 'builder') {
      handleOpenBuilder();
      return;
    }
    onNavigate(
      buildConsoleUrl({
        orgId: organization.org_id,
        projectId: project.project_id,
        moduleSlug: modKey,
      })
    );
  };

  const combinedError = localFormError || actionError;

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      {/* Top Bar: Breadcrumbs Left + Concise Actions Right */}
      <header className="px-4 sm:px-6 lg:px-8 h-16 border-b border-[#211B2E]/10 bg-white flex items-center justify-between gap-6">
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
            aria-label="Project breadcrumbs"
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
              className="hover:text-[#211B2E] font-medium truncate max-w-[160px] hover:underline"
            >
              {organization.name}
            </button>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[#211B2E] truncate max-w-[200px]">
              {project.name}
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <LanguageSwitcher size="sm" />
          <button
            type="button"
            onClick={() => onNavigate('/workspace')}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] hover:bg-[#EDEAF5] text-xs font-medium text-[#211B2E] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Cloud className="w-3.5 h-3.5 text-[#6C2CEB]" />
            <span className="hidden md:inline">{t('navigation.workspace')}</span>
          </button>
          {isBuilderEnabled && (
            <button
              type="button"
              onClick={() => handleOpenBuilder()}
              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
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

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Project Header + Back Link */}
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => onNavigate(buildConsoleUrl({ orgId: organization.org_id }))}
            className="text-xs font-medium text-[#574F6B] hover:text-[#211B2E] inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('console.dashboard.backToOrg', { orgName: organization.name })}</span>
          </button>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-mono text-[#574F6B]">
                {organization.org_slug} / {project.project_slug}
              </div>
              <h1 className="font-['Outfit',sans-serif] text-2xl sm:text-3xl font-semibold tracking-tight text-[#211B2E]">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-sm text-[#4A435C] max-w-2xl">{project.description}</p>
              )}
            </div>
          </div>

          {/* Summary Strip (Single-Elevation, Tabular Numerals, Hairline Separators) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#211B2E]/10 bg-white rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#211B2E]/10">
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('console.dashboard.modulesEnabledStat')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
                {enabledModulesCount} / {ALL_PROJECT_MODULES.length}
              </div>
            </div>
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('console.dashboard.sitesAttachedStat')}</div>
              <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
                {sites.length}
              </div>
            </div>
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('console.dashboard.driveStatusStat')}</div>
              <div className="text-sm font-semibold text-[#211B2E] pt-0.5">
                {project.drive_folder_id
                  ? t('console.drive.provisioned')
                  : t('console.drive.notProvisioned')}
              </div>
            </div>
            <div className="p-4 space-y-1">
              <div className="text-xs text-[#574F6B]">{t('console.dashboard.localDraftStat')}</div>
              <div className="text-sm font-semibold text-[#211B2E] pt-0.5">
                {hasIsolatedDraft
                  ? t('console.dashboard.draftIsolated')
                  : t('console.dashboard.draftTemplateDefault')}
              </div>
            </div>
          </div>
        </section>

        {combinedError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-900"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{combinedError}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocalFormError(null);
                onDismissError();
              }}
              className="text-xs font-semibold underline shrink-0"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        {/* Safe Opt-In Legacy Draft Import Banner */}
        {!hasIsolatedDraft && legacyDraftInfo.exists && (
          <section className="rounded-xl border border-[#6C2CEB]/25 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <h2 className="text-sm font-semibold text-[#211B2E]">
                {t('console.dashboard.legacyDraftTitle')}
              </h2>
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.dashboard.legacyDraftDesc', {
                  name: legacyDraftInfo.siteName || 'Untitled Site',
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={handleImportLegacyDraft}
              className="min-h-[38px] px-4 py-2 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {t('console.dashboard.importLegacyDraftBtn')}
            </button>
          </section>
        )}

        {legacyImportNotice && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{legacyImportNotice}</span>
          </div>
        )}

        {/* Project Modules Launcher Grid */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="font-['Outfit',sans-serif] text-lg font-semibold text-[#211B2E]">
              {t('console.dashboard.launcherHeading')}
            </h2>
            <p className="text-xs sm:text-sm text-[#4A435C]">
              {t('console.dashboard.launcherSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_PROJECT_MODULES.map((modKey) => {
              const modRecord = modules.find((m) => m.module_key === modKey);
              const enabled = modRecord ? modRecord.enabled === 1 : true;
              const Icon = MODULE_ICONS[modKey];
              const busy = togglingModuleKey === modKey;
              return (
                <article
                  key={modKey}
                  className={`rounded-xl border bg-white p-5 flex flex-col justify-between gap-4 ${
                    enabled ? 'border-[#211B2E]/12' : 'border-[#211B2E]/10 bg-[#FAF9FC] opacity-75'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-[#6C2CEB] shrink-0" />
                        <h3 className="text-sm font-semibold text-[#211B2E] truncate">
                          {t(`console.modules.${modKey}`)}
                        </h3>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onToggleModule(modKey, enabled)}
                        className="text-xs font-medium text-[#574F6B] hover:text-[#211B2E] px-2 py-1 rounded border border-[#211B2E]/12 bg-[#F7F6FA] whitespace-nowrap shrink-0"
                      >
                        {busy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                        ) : enabled ? (
                          t('common.enabled')
                        ) : (
                          t('common.disabled')
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-[#4A435C] leading-relaxed">
                      {t(`console.dashboard.moduleDescriptions.${modKey}`)}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[#211B2E]/8 flex items-center justify-between gap-2">
                    {enabled ? (
                      <button
                        type="button"
                        onClick={() => handleModulePrimaryAction(modKey)}
                        className="text-xs font-semibold text-[#6C2CEB] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <span>
                          {modKey === 'builder'
                            ? t('console.dashboard.launchBuilder')
                            : modKey === 'cms'
                            ? t('console.dashboard.openCmsModule')
                            : t('console.dashboard.openModuleBtn')}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-xs text-[#574F6B]">
                        {t('console.dashboard.moduleDisabledHint')}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Drive Folder Isolation Section */}
        <section
          id="project-drive-section"
          className="rounded-xl border border-[#211B2E]/10 bg-white p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#6C2CEB]" />
                <span>{t('console.drive.heading')}</span>
              </h2>
              <div className="text-xs font-mono text-[#574F6B]">
                Builly/{organization.org_slug}/{project.project_slug}/ ·{' '}
                {project.drive_folder_id
                  ? t('console.drive.provisioned')
                  : t('console.drive.notProvisioned')}
              </div>
            </div>

            {googleWorkspaceConnected && !googleWorkspaceNeedsReauth ? (
              <button
                type="button"
                disabled={provisioningDrive}
                onClick={() => onProvisionDrive(Boolean(project.drive_folder_id))}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
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
                className="min-h-[38px] px-4 py-2 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] whitespace-nowrap shrink-0"
              >
                {t('console.connectWorkspaceBtn')}
              </button>
            )}
          </div>

          {driveNotice && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{driveNotice}</span>
            </div>
          )}

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

        {/* Attached Public Sites Section */}
        <section
          id="project-sites-section"
          className="rounded-xl border border-[#211B2E]/10 bg-white p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E] flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#6C2CEB]" />
              <span>{t('console.projects.sitesHeading')}</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowAddSite((v) => !v)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#6C2CEB]" />
              <span>{t('console.projects.addSiteBtn')}</span>
            </button>
          </div>

          {showAddSite && (
            <form
              onSubmit={handleCreateSiteSubmit}
              className="pt-4 border-t border-[#211B2E]/10 grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#211B2E]">
                  {t('console.projects.siteNameLabel')}
                </label>
                <input
                  type="text"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value)}
                  placeholder="Studio Portfolio"
                  maxLength={80}
                  required
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 bg-white text-xs sm:text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#211B2E]">
                  {t('console.projects.siteSlugLabel')}
                </label>
                <input
                  type="text"
                  value={newSiteSlug}
                  onChange={(e) => setNewSiteSlug(e.target.value)}
                  placeholder={t('console.projects.siteSlugPlaceholder')}
                  maxLength={48}
                  required
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 bg-white text-xs sm:text-sm font-mono"
                />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingSite}
                  className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingSite && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('console.projects.saveSite')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSite(false)}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white text-xs text-[#4A435C]"
                >
                  {t('console.orgs.cancel')}
                </button>
              </div>
            </form>
          )}

          {sites.length === 0 ? (
            <p className="text-xs text-[#4A435C] leading-relaxed">{t('console.projects.noSites')}</p>
          ) : (
            <div className="border-t border-[#211B2E]/10 divide-y divide-[#211B2E]/10">
              {sites.map((site) => {
                const isEditingThis = editingSite?.site_id === site.site_id;
                return (
                  <div key={site.site_id} className="py-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-semibold text-[#211B2E] truncate">
                          {site.site_name}
                        </div>
                        <div className="text-xs font-mono text-[#574F6B]">
                          {site.status === 'published'
                            ? t('console.projects.statusPublished')
                            : t('console.projects.statusDraft')}{' '}
                          · /s/{site.site_slug}
                          {site.active_publish_version ? ` · ${site.active_publish_version}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
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
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white text-xs font-medium text-[#211B2E] inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>{t('console.projects.renameSite')}</span>
                        </button>
                        {site.status === 'published' && (
                          <button
                            type="button"
                            onClick={() => onNavigate(`/s/${site.site_slug}`)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#211B2E] text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>
                              {t('console.projects.viewLiveSite', { slug: site.site_slug })}
                            </span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditingThis && (
                      <form
                        onSubmit={handleEditSiteSubmit}
                        className="pt-3 border-t border-[#211B2E]/10 grid grid-cols-1 sm:grid-cols-2 gap-3"
                      >
                        <input
                          type="text"
                          value={editSiteName}
                          onChange={(e) => setEditSiteName(e.target.value)}
                          placeholder={t('console.projects.siteNameLabel')}
                          maxLength={80}
                          required
                          className="w-full min-h-[36px] px-3 py-1 rounded-lg border border-[#211B2E]/20 bg-white text-xs sm:text-sm"
                        />
                        <input
                          type="text"
                          value={editSiteSlug}
                          onChange={(e) => setEditSiteSlug(e.target.value)}
                          placeholder={t('console.projects.siteSlugPlaceholder')}
                          maxLength={48}
                          required
                          className="w-full min-h-[36px] px-3 py-1 rounded-lg border border-[#211B2E]/20 bg-white text-xs sm:text-sm font-mono"
                        />
                        <div className="sm:col-span-2 flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={savingSite}
                            className="min-h-[36px] px-3.5 py-1 rounded-lg bg-[#6C2CEB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {savingSite && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            <span>{t('console.projects.saveSite')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSite(null)}
                            className="min-h-[36px] px-3 py-1 rounded-lg border border-[#211B2E]/15 bg-white text-xs text-[#4A435C]"
                          >
                            {t('console.orgs.cancel')}
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
      </main>
    </div>
  );
};
