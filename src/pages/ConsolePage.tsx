import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRight,
  Building2,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FolderKanban,
  FolderOpen,
  Globe,
  History,
  Inbox,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BuillyLogo } from '../components/common/BuillyLogo';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { OrgOnboardingCard } from '../components/console/OrgOnboardingCard';
import { LegacyMigrationWizard } from '../components/console/LegacyMigrationWizard';
import { validatePortfolioSlug } from '../config/breakpoints';
import {
  createOperationKey,
  workspaceHierarchyClient,
} from '../features/console/workspaceHierarchyClient';
import { useAuth } from '../features/identity/AuthContext';
import { WorkerApiError } from '../features/workspace-connection/workspaceApiClient';
import { saveActiveProjectContext, storageService } from '../services/storageService';
import { ProjectDashboardPage } from './ProjectDashboardPage';
import { ProjectAssetsPage } from './modules/ProjectAssetsPage';
import { ProjectCmsPage } from './modules/ProjectCmsPage';
import { ProjectInboxPage } from './modules/ProjectInboxPage';
import { ProjectPublishingPage } from './modules/ProjectPublishingPage';
import { ProjectSettingsPage } from './modules/ProjectSettingsPage';
import { ProjectVersionsPage } from './modules/ProjectVersionsPage';
import {
  buildBuilderUrl,
  buildConsoleUrl,
  parseConsoleRoute,
} from '../utils/routes';
import {
  ALL_PROJECT_MODULES,
  ConsoleBootstrapResponse,
  ProjectModuleKey,
  ProjectRecord,
  SiteRecord,
} from '../types/workspace';

interface ConsolePageProps {
  pathname?: string;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
}

type StarterPresetKey = 'website_cms' | 'headless_cms' | 'minimal';

const STARTER_PRESETS: ReadonlyArray<{
  key: StarterPresetKey;
  titleKey: string;
  descKey: string;
  modules: ProjectModuleKey[];
}> = [
  {
    key: 'website_cms',
    titleKey: 'console.starterPresets.websiteCmsTitle',
    descKey: 'console.starterPresets.websiteCmsDesc',
    modules: ['builder', 'cms', 'inbox', 'assets', 'publishing', 'versions', 'settings'],
  },
  {
    key: 'headless_cms',
    titleKey: 'console.starterPresets.headlessCmsTitle',
    descKey: 'console.starterPresets.headlessCmsDesc',
    modules: ['cms', 'inbox', 'assets', 'settings'],
  },
  {
    key: 'minimal',
    titleKey: 'console.starterPresets.minimalTitle',
    descKey: 'console.starterPresets.minimalDesc',
    modules: ['builder', 'assets', 'settings'],
  },
];

const MODULE_ICONS: Record<ProjectModuleKey, React.ComponentType<{ className?: string }>> = {
  builder: Layers,
  cms: Database,
  inbox: Inbox,
  assets: FolderOpen,
  publishing: Globe,
  versions: History,
  settings: Settings,
};

export const ConsolePage: React.FC<ConsolePageProps> = ({
  pathname = '/console',
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { status: authStatus, owner, accessToken, signOut, isBusy: authBusy } = useAuth();

  const consoleRoute = useMemo(() => parseConsoleRoute(pathname), [pathname]);

  const [loading, setLoading] = useState(true);
  const [workerUnavailable, setWorkerUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<ConsoleBootstrapResponse | null>(null);

  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Create Organization inline state
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Rename / Archive / Delete Organization inline state
  const [renamingOrg, setRenamingOrg] = useState(false);
  const [renameOrgValue, setRenameOrgValue] = useState('');
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState(false);
  const [archivingOrg, setArchivingOrg] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);

  // Runtime Index & Recovery state
  const [rebuildingProjection, setRebuildingProjection] = useState(false);
  const [processingRepairs, setProcessingRepairs] = useState(false);
  const [recoveringOpId, setRecoveringOpId] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  // Create Project inline state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectPreset, setNewProjectPreset] = useState<StarterPresetKey>('website_cms');
  const [creatingProject, setCreatingProject] = useState(false);

  // Add / Edit Site inline state
  const [showAddSite, setShowAddSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteSlug, setNewSiteSlug] = useState('');
  const [savingSite, setSavingSite] = useState(false);

  const [editingSite, setEditingSite] = useState<SiteRecord | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteSlug, setEditSiteSlug] = useState('');

  const [togglingModuleKey, setTogglingModuleKey] = useState<string | null>(null);
  const [provisioningDrive, setProvisioningDrive] = useState(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showMigrationWizard, setShowMigrationWizard] = useState(false);

  const loadBootstrap = useCallback(async () => {
    if (authStatus !== 'authenticated' || !accessToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setWorkerUnavailable(false);

    try {
      const data = await workspaceHierarchyClient.getBootstrap(accessToken);
      setBootstrap(data);

      setSelectedOrgId((prev) => {
        if (consoleRoute.orgId && data.organizations.some((o) => o.org_id === consoleRoute.orgId)) {
          return consoleRoute.orgId;
        }
        if (consoleRoute.projectId) {
          const matchedProj = data.projects.find((p) => p.project_id === consoleRoute.projectId);
          if (matchedProj) return matchedProj.org_id;
        }
        if (prev && data.organizations.some((o) => o.org_id === prev)) return prev;
        return data.organizations[0]?.org_id || '';
      });
    } catch (err) {
      if (
        err instanceof WorkerApiError &&
        (err.code === 'WORKER_UNAVAILABLE' || err.code === 'WORKER_UNREACHABLE')
      ) {
        setWorkerUnavailable(true);
      }
      setError(err instanceof Error ? err.message : 'Unable to load Workspace Console.');
    } finally {
      setLoading(false);
    }
  }, [authStatus, accessToken, consoleRoute.orgId, consoleRoute.projectId]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  // Sync URL target changes to selected org/project state
  useEffect(() => {
    if (!bootstrap) return;
    if (consoleRoute.orgId && bootstrap.organizations.some((o) => o.org_id === consoleRoute.orgId)) {
      setSelectedOrgId(consoleRoute.orgId);
    }
    if (consoleRoute.projectId) {
      const targetProj = bootstrap.projects.find((p) => p.project_id === consoleRoute.projectId);
      if (targetProj) {
        setSelectedOrgId(targetProj.org_id);
        setSelectedProjectId(targetProj.project_id);
      }
    }
  }, [bootstrap, consoleRoute.orgId, consoleRoute.projectId]);

  const activeOrg = useMemo(
    () => bootstrap?.organizations.find((o) => o.org_id === selectedOrgId) || bootstrap?.organizations[0] || null,
    [bootstrap, selectedOrgId]
  );

  const orgProjects = useMemo(() => {
    if (!bootstrap || !activeOrg) return [];
    return bootstrap.projects.filter((p) => p.org_id === activeOrg.org_id);
  }, [bootstrap, activeOrg]);

  useEffect(() => {
    if (orgProjects.length === 0) {
      setSelectedProjectId('');
      return;
    }
    if (!orgProjects.some((p) => p.project_id === selectedProjectId)) {
      setSelectedProjectId(orgProjects[0].project_id);
    }
  }, [orgProjects, selectedProjectId]);

  const activeProject: ProjectRecord | null = useMemo(
    () => orgProjects.find((p) => p.project_id === selectedProjectId) || orgProjects[0] || null,
    [orgProjects, selectedProjectId]
  );

  const activeProjectModules = useMemo(() => {
    if (!bootstrap || !activeProject) return [];
    return bootstrap.modules.filter((m) => m.project_id === activeProject.project_id);
  }, [bootstrap, activeProject]);

  const activeProjectSites = useMemo(() => {
    if (!bootstrap || !activeProject) return [];
    return bootstrap.sites.filter((s) => s.project_id === activeProject.project_id);
  }, [bootstrap, activeProject]);

  const activeProjectResources = useMemo(() => {
    if (!bootstrap || !activeProject) return [];
    return bootstrap.resources.filter(
      (r) => r.project_id === activeProject.project_id && r.status === 'active'
    );
  }, [bootstrap, activeProject]);

  const legacyResourcesCount = useMemo(
    () => (bootstrap?.resources || []).filter((r) => r.status === 'legacy').length,
    [bootstrap]
  );

  const hasBrowserLegacyDraft = useMemo(
    () => storageService.inspectLegacyDraft().exists,
    [bootstrap]
  );

  const hasLegacyItemsToMigrate =
    (bootstrap?.unattachedLegacySites.length || 0) > 0 ||
    legacyResourcesCount > 0 ||
    hasBrowserLegacyDraft;

  const isReadOnlyOutage = Boolean(bootstrap?.readOnly);
  const orgQuotaCount = bootstrap?.organizations.length || 0;
  const projectQuotaCount = orgProjects.length;
  const orgQuotaReached = orgQuotaCount >= 10;
  const projectQuotaReached = projectQuotaCount >= 10;

  if (authStatus !== 'authenticated' || !owner || !accessToken) {
    return null;
  }

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (newOrgName.trim().length < 2) {
      setActionError('Organization name must be at least 2 characters.');
      return;
    }
    setCreatingOrg(true);
    try {
      const res = await workspaceHierarchyClient.createOrganization(accessToken, {
        name: newOrgName.trim(),
        operationKey: createOperationKey('org'),
      });
      setNewOrgName('');
      setShowCreateOrg(false);
      await loadBootstrap();
      setSelectedOrgId(res.organization.org_id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create Organization.');
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleRenameOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || isReadOnlyOutage) return;
    setActionError(null);
    if (renameOrgValue.trim().length < 2) {
      setActionError('Organization name must be at least 2 characters.');
      return;
    }
    try {
      await workspaceHierarchyClient.updateOrganization(accessToken, activeOrg.org_id, {
        name: renameOrgValue.trim(),
        expectedRevision: activeOrg.canonical_revision,
      });
      setRenamingOrg(false);
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename Organization.');
    }
  };

  const handleArchiveOrg = async () => {
    if (!activeOrg || isReadOnlyOutage) return;
    setActionError(null);
    setArchivingOrg(true);
    try {
      await workspaceHierarchyClient.archiveOrganization(accessToken, activeOrg.org_id, {
        expectedRevision: activeOrg.canonical_revision,
      });
      setConfirmDeleteOrg(false);
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to archive Organization.');
    } finally {
      setArchivingOrg(false);
    }
  };

  const handleDeleteOrg = async () => {
    if (!activeOrg || isReadOnlyOutage) return;
    setActionError(null);
    setDeletingOrg(true);
    try {
      await workspaceHierarchyClient.deleteOrganization(accessToken, activeOrg.org_id, {
        confirmPermanentDelete: true,
      });
      setConfirmDeleteOrg(false);
      setSelectedOrgId('');
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to permanently delete Organization.');
    } finally {
      setDeletingOrg(false);
    }
  };

  const handleRebuildProjection = async () => {
    if (isReadOnlyOutage) return;
    setActionError(null);
    setRecoveryNotice(null);
    setRebuildingProjection(true);
    try {
      const summary = await workspaceHierarchyClient.rebuildProjection(accessToken);
      setRecoveryNotice(
        t('console.recovery.rebuildSuccess', {
          orgs: summary.organizationsRebuilt,
          projects: summary.projectsRebuilt,
          sites: summary.sitesRebuilt,
        })
      );
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rebuild runtime index from Drive.');
    } finally {
      setRebuildingProjection(false);
    }
  };

  const handleProcessRepairs = async () => {
    setActionError(null);
    setRecoveryNotice(null);
    setProcessingRepairs(true);
    try {
      const res = await workspaceHierarchyClient.processRepairQueue(accessToken);
      setRecoveryNotice(
        t('console.recovery.repairQueueSuccess', {
          completed: res.completed,
          processed: res.processed,
        })
      );
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to process projection repair queue.');
    } finally {
      setProcessingRepairs(false);
    }
  };

  const handleRecoverOperation = async (operationId: string) => {
    if (isReadOnlyOutage) return;
    setActionError(null);
    setRecoveryNotice(null);
    setRecoveringOpId(operationId);
    try {
      const res = await workspaceHierarchyClient.recoverOperation(accessToken, operationId);
      setRecoveryNotice(
        t('console.recovery.recoverOpResult', {
          opId: res.operationId,
          status: res.status,
        })
      );
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to recover operation.');
    } finally {
      setRecoveringOpId(null);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || isReadOnlyOutage) return;
    setActionError(null);
    if (newProjectName.trim().length < 2) {
      setActionError('Project name must be at least 2 characters.');
      return;
    }
    const presetDef = STARTER_PRESETS.find((p) => p.key === newProjectPreset);
    setCreatingProject(true);
    try {
      const res = await workspaceHierarchyClient.createProject(accessToken, activeOrg.org_id, {
        name: newProjectName.trim(),
        description: newProjectDesc.trim(),
        enabledModules: presetDef?.modules,
        operationKey: createOperationKey('prj'),
      });
      setNewProjectName('');
      setNewProjectDesc('');
      setNewProjectPreset('website_cms');
      setShowCreateProject(false);
      await loadBootstrap();
      setSelectedProjectId(res.project.project_id);
      onNavigate(
        buildConsoleUrl({
          orgId: activeOrg.org_id,
          projectId: res.project.project_id,
        })
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create Project.');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleToggleModule = async (modKey: ProjectModuleKey, currentlyEnabled: boolean) => {
    if (!activeProject || isReadOnlyOutage) return;
    setActionError(null);
    setTogglingModuleKey(modKey);
    try {
      await workspaceHierarchyClient.updateProjectModules(
        accessToken,
        activeProject.project_id,
        [{ moduleKey: modKey, enabled: !currentlyEnabled }],
        { expectedRevision: activeProject.canonical_revision }
      );
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update module setting.');
    } finally {
      setTogglingModuleKey(null);
    }
  };

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || isReadOnlyOutage) return;
    setActionError(null);

    const slugCheck = validatePortfolioSlug(newSiteSlug);
    if (!slugCheck.valid) {
      setActionError(slugCheck.error || 'Invalid site slug.');
      return;
    }
    if (!newSiteName.trim()) {
      setActionError('Site name is required.');
      return;
    }

    setSavingSite(true);
    try {
      await workspaceHierarchyClient.createSiteInProject(accessToken, activeProject.project_id, {
        siteName: newSiteName.trim(),
        siteSlug: slugCheck.normalized,
        operationKey: createOperationKey('site'),
      });
      setNewSiteName('');
      setNewSiteSlug('');
      setShowAddSite(false);
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create site.');
    } finally {
      setSavingSite(false);
    }
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSite || isReadOnlyOutage) return;
    setActionError(null);

    const slugCheck = validatePortfolioSlug(editSiteSlug);
    if (!slugCheck.valid) {
      setActionError(slugCheck.error || 'Invalid site slug.');
      return;
    }
    if (!editSiteName.trim()) {
      setActionError('Site name is required.');
      return;
    }

    setSavingSite(true);
    try {
      await workspaceHierarchyClient.updateSiteInProject(accessToken, editingSite.site_id, {
        siteName: editSiteName.trim(),
        siteSlug: slugCheck.normalized,
        expectedRevision: editingSite.canonical_revision,
      });
      setEditingSite(null);
      await loadBootstrap();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update site.');
    } finally {
      setSavingSite(false);
    }
  };

  const handleProvisionProjectDrive = async (verifyRemote = false) => {
    if (!activeProject) return;
    setActionError(null);
    setDriveNotice(null);
    setProvisioningDrive(true);
    try {
      const res = await workspaceHierarchyClient.provisionProjectDrive(
        accessToken,
        activeProject.project_id,
        { verifyRemote }
      );
      setDriveNotice(
        t('console.drive.provisionSuccess', {
          count: res.createdFoldersCount,
          total: res.resources.length,
        })
      );
      await loadBootstrap();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to provision Project Drive folders.'
      );
    } finally {
      setProvisioningDrive(false);
    }
  };

  const handleOpenProjectBuilder = (orgId: string, orgName: string, project: ProjectRecord) => {
    saveActiveProjectContext({
      orgId,
      orgName,
      projectId: project.project_id,
      projectName: project.name,
    });
    onNavigate(buildBuilderUrl({ orgId, projectId: project.project_id }));
  };

  // Dedicated Project views when URL targets a specific project or module
  if (
    !loading &&
    bootstrap &&
    !bootstrap.needsOnboarding &&
    consoleRoute.view === 'project' &&
    activeOrg &&
    activeProject
  ) {
    if (consoleRoute.moduleSlug === 'cms') {
      return (
        <ProjectCmsPage
          organization={activeOrg}
          project={activeProject}
          modules={activeProjectModules}
          sites={activeProjectSites}
          accessToken={accessToken}
          ownerId={owner.ownerId}
          googleWorkspaceConnected={bootstrap.googleWorkspace.connected}
          googleWorkspaceNeedsReauth={bootstrap.googleWorkspace.needsReauth}
          readOnly={isReadOnlyOutage}
          outageStale={Boolean(bootstrap.stale)}
          outageLastSyncedAt={bootstrap.lastSyncedAt || null}
          authBusy={authBusy}
          onNavigate={onNavigate}
          onSignOut={signOut}
        />
      );
    }

    if (consoleRoute.moduleSlug === 'inbox') {
      return (
        <ProjectInboxPage
          organization={activeOrg}
          project={activeProject}
          modules={activeProjectModules}
          sites={activeProjectSites}
          accessToken={accessToken}
          googleWorkspaceConnected={bootstrap.googleWorkspace.connected}
          googleWorkspaceNeedsReauth={bootstrap.googleWorkspace.needsReauth}
          readOnly={isReadOnlyOutage}
          outageStale={Boolean(bootstrap.stale)}
          outageLastSyncedAt={bootstrap.lastSyncedAt || null}
          authBusy={authBusy}
          onNavigate={onNavigate}
          onSignOut={signOut}
        />
      );
    }

    if (consoleRoute.moduleSlug === 'assets') {
      return (
        <ProjectAssetsPage
          organization={activeOrg}
          project={activeProject}
          modules={activeProjectModules}
          accessToken={accessToken}
          googleWorkspaceConnected={bootstrap.googleWorkspace.connected}
          googleWorkspaceNeedsReauth={bootstrap.googleWorkspace.needsReauth}
          readOnly={isReadOnlyOutage}
          outageStale={Boolean(bootstrap.stale)}
          outageLastSyncedAt={bootstrap.lastSyncedAt || null}
          authBusy={authBusy}
          onNavigate={onNavigate}
          onSignOut={signOut}
        />
      );
    }

    if (consoleRoute.moduleSlug === 'publishing') {
      return (
        <ProjectPublishingPage
          organization={activeOrg}
          project={activeProject}
          modules={activeProjectModules}
          sites={activeProjectSites}
          accessToken={accessToken}
          googleWorkspaceConnected={bootstrap.googleWorkspace.connected}
          googleWorkspaceNeedsReauth={bootstrap.googleWorkspace.needsReauth}
          readOnly={isReadOnlyOutage}
          outageStale={Boolean(bootstrap.stale)}
          outageLastSyncedAt={bootstrap.lastSyncedAt || null}
          authBusy={authBusy}
          onRefreshBootstrap={loadBootstrap}
          onNavigate={onNavigate}
          onSignOut={signOut}
        />
      );
    }

    if (consoleRoute.moduleSlug === 'versions') {
      return (
        <ProjectVersionsPage
          organization={activeOrg}
          project={activeProject}
          modules={activeProjectModules}
          sites={activeProjectSites}
          accessToken={accessToken}
          readOnly={isReadOnlyOutage}
          outageStale={Boolean(bootstrap.stale)}
          outageLastSyncedAt={bootstrap.lastSyncedAt || null}
          authBusy={authBusy}
          onRefreshBootstrap={loadBootstrap}
          onNavigate={onNavigate}
          onSignOut={signOut}
        />
      );
    }

    if (consoleRoute.moduleSlug === 'settings') {
      return (
        <ProjectSettingsPage
          organization={activeOrg}
          project={activeProject}
          modules={activeProjectModules}
          resources={activeProjectResources}
          accessToken={accessToken}
          googleWorkspaceConnected={bootstrap.googleWorkspace.connected}
          googleWorkspaceNeedsReauth={bootstrap.googleWorkspace.needsReauth}
          readOnly={isReadOnlyOutage}
          outageStale={Boolean(bootstrap.stale)}
          outageLastSyncedAt={bootstrap.lastSyncedAt || null}
          togglingModuleKey={togglingModuleKey}
          provisioningDrive={provisioningDrive}
          authBusy={authBusy}
          onToggleModule={handleToggleModule}
          onProvisionDrive={handleProvisionProjectDrive}
          onRefreshBootstrap={loadBootstrap}
          onNavigate={onNavigate}
          onSignOut={signOut}
        />
      );
    }

    return (
      <ProjectDashboardPage
        organization={activeOrg}
        project={activeProject}
        modules={activeProjectModules}
        sites={activeProjectSites}
        resources={activeProjectResources}
        googleWorkspaceConnected={bootstrap.googleWorkspace.connected}
        googleWorkspaceNeedsReauth={bootstrap.googleWorkspace.needsReauth}
        readOnly={isReadOnlyOutage}
        outageStale={Boolean(bootstrap.stale)}
        outageLastSyncedAt={bootstrap.lastSyncedAt || null}
        togglingModuleKey={togglingModuleKey}
        provisioningDrive={provisioningDrive}
        savingSite={savingSite}
        driveNotice={driveNotice}
        actionError={actionError}
        authBusy={authBusy}
        onDismissError={() => setActionError(null)}
        onToggleModule={handleToggleModule}
        onProvisionDrive={handleProvisionProjectDrive}
        onAddSite={async (siteName, siteSlug) => {
          if (!activeProject || isReadOnlyOutage) return false;
          setActionError(null);
          setSavingSite(true);
          try {
            await workspaceHierarchyClient.createSiteInProject(accessToken, activeProject.project_id, {
              siteName,
              siteSlug,
              operationKey: createOperationKey('site'),
            });
            await loadBootstrap();
            return true;
          } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to create site.');
            return false;
          } finally {
            setSavingSite(false);
          }
        }}
        onUpdateSite={async (siteId, siteName, siteSlug) => {
          if (isReadOnlyOutage) return false;
          setActionError(null);
          setSavingSite(true);
          try {
            const targetSite = activeProjectSites.find((s) => s.site_id === siteId);
            await workspaceHierarchyClient.updateSiteInProject(accessToken, siteId, {
              siteName,
              siteSlug,
              expectedRevision: targetSite?.canonical_revision,
            });
            await loadBootstrap();
            return true;
          } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to update site.');
            return false;
          } finally {
            setSavingSite(false);
          }
        }}
        onNavigate={onNavigate}
        onSignOut={signOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      {/* Header */}
      <header className="px-4 sm:px-6 lg:px-8 h-16 border-b border-[#211B2E]/10 bg-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="inline-flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB]"
          >
            <BuillyLogo mode="responsive" theme="light" />
          </a>
          <span className="hidden sm:inline-block text-[#211B2E]/20">/</span>
          <span className="hidden sm:inline-block text-sm font-semibold text-[#211B2E] truncate">
            {t('console.title')}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <LanguageSwitcher size="sm" />
          <button
            type="button"
            onClick={() => onNavigate('/workspace')}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] hover:bg-[#EDEAF5] text-xs font-medium text-[#211B2E] inline-flex items-center gap-1.5"
          >
            <Cloud className="w-3.5 h-3.5 text-[#6C2CEB]" />
            <span className="hidden md:inline">{t('console.manageWorkspaceBtn')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/builder')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <span>{t('console.openBuilderLegacyBtn')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={authBusy}
            onClick={async () => {
              await signOut();
              onNavigate('/', { replace: true });
            }}
            title={t('auth.signOut')}
            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#211B2E]/15 text-[#4A435C] hover:text-[#211B2E] hover:bg-[#F7F6FA] inline-flex items-center"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {loading && (
          <div className="rounded-2xl border border-[#211B2E]/10 bg-white p-10 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 text-[#6C2CEB] animate-spin" />
            <p className="text-sm text-[#4A435C]">{t('workspace.checking')}</p>
          </div>
        )}

        {!loading && workerUnavailable && (
          <div className="max-w-2xl mx-auto rounded-2xl border border-amber-300 bg-white p-6 sm:p-8 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h2 className="font-['Outfit',sans-serif] text-lg font-semibold text-[#211B2E]">
                  {t('console.workerUnavailableTitle')}
                </h2>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  {error || t('console.workerUnavailableDesc')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => loadBootstrap()}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[#211B2E]/20 text-xs font-semibold text-[#211B2E] hover:bg-[#F7F6FA] inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('console.retryBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/builder')}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <span>{t('console.openBuilderLegacyBtn')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {!loading && !workerUnavailable && error && !bootstrap && (
          <div
            role="alert"
            className="max-w-2xl mx-auto rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-2.5 text-sm text-red-900">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => loadBootstrap()}
              className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-semibold text-red-900 shrink-0"
            >
              {t('console.retryBtn')}
            </button>
          </div>
        )}

        {!loading && bootstrap && bootstrap.needsOnboarding && (
          <OrgOnboardingCard
            accessToken={accessToken}
            ownerEmail={owner.email}
            onCompleted={loadBootstrap}
            onOpenWorkspaceConnect={() => onNavigate('/workspace')}
          />
        )}

        {!loading && bootstrap && !bootstrap.needsOnboarding && (
          <>
            {/* Account-Level Google Workspace Status */}
            <section className="rounded-2xl border border-[#211B2E]/10 bg-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    bootstrap.googleWorkspace.connected && !bootstrap.googleWorkspace.needsReauth
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <Cloud className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#211B2E]">
                    {t('console.accountWorkspaceTitle')}
                  </div>
                  <p className="text-xs text-[#4A435C] mt-0.5">
                    {bootstrap.googleWorkspace.connected
                      ? bootstrap.googleWorkspace.needsReauth
                        ? t('console.accountWorkspaceNeedsReauth', {
                            email: bootstrap.googleWorkspace.account?.email || owner.email,
                          })
                        : t('console.accountWorkspaceConnected', {
                            email: bootstrap.googleWorkspace.account?.email || owner.email,
                          })
                      : t('console.accountWorkspaceDisconnected')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/workspace')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <span>
                  {bootstrap.googleWorkspace.connected
                    ? t('console.manageWorkspaceBtn')
                    : t('console.connectWorkspaceBtn')}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </section>

            {/* OAuth Outage / Read-Only Stale Cache Banner */}
            {(isReadOnlyOutage || bootstrap.stale || bootstrap.unavailable) && (
              <section
                role="status"
                className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-amber-950">
                      {t('console.outage.readOnlyTitle')}
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      {bootstrap.outageReason || t('console.outage.readOnlyDesc')}
                    </p>
                    <div className="text-[11px] font-mono tabular-nums text-amber-800">
                      {t('console.outage.lastSyncedLabel')}:{' '}
                      {bootstrap.lastSyncedAt
                        ? new Date(bootstrap.lastSyncedAt).toLocaleString()
                        : t('console.cms.neverSynced')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void loadBootstrap()}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-xs font-semibold text-amber-950 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('console.retryBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/workspace')}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    {t('console.outage.reconnectGoogleBtn')}
                  </button>
                </div>
              </section>
            )}

            {/* Runtime Index & Recovery Panel */}
            {((bootstrap.pendingRepairsCount || 0) > 0 ||
              (bootstrap.needsReconciliationCount || 0) > 0 ||
              recoveryNotice ||
              bootstrap.googleWorkspace.connected) && (
              <section className="rounded-2xl border border-[#211B2E]/10 bg-white p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Wrench className="w-4 h-4 text-[#6C2CEB] shrink-0" />
                    <div className="min-w-0">
                      <h2 className="text-xs sm:text-sm font-semibold text-[#211B2E]">
                        {t('console.recovery.heading')}
                      </h2>
                      <p className="text-xs text-[#574F6B] font-mono tabular-nums">
                        {t('console.recovery.statusSummary', {
                          repairs: bootstrap.pendingRepairsCount || 0,
                          reconcile: bootstrap.needsReconciliationCount || 0,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(bootstrap.pendingRepairsCount || 0) > 0 && (
                      <button
                        type="button"
                        disabled={processingRepairs || isReadOnlyOutage}
                        onClick={() => void handleProcessRepairs()}
                        className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] hover:bg-[#EDEAF5] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        {processingRepairs && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{t('console.recovery.processRepairsBtn')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={rebuildingProjection || isReadOnlyOutage || !bootstrap.googleWorkspace.connected}
                      onClick={() => void handleRebuildProjection()}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 bg-white hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      {rebuildingProjection ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-[#6C2CEB]" />
                      )}
                      <span>{t('console.recovery.rebuildIndexBtn')}</span>
                    </button>
                  </div>
                </div>

                {recoveryNotice && (
                  <div
                    role="status"
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{recoveryNotice}</span>
                  </div>
                )}

                {bootstrap.needsReconciliationOps && bootstrap.needsReconciliationOps.length > 0 && (
                  <div className="border-t border-[#211B2E]/10 pt-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-900">
                      {t('console.recovery.needsReconciliationHeading')}
                    </div>
                    <div className="divide-y divide-[#211B2E]/8 border border-amber-200 rounded-lg bg-amber-50/40">
                      {bootstrap.needsReconciliationOps.map((op) => (
                        <div
                          key={op.operationId}
                          className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-semibold text-[#211B2E]">
                              {op.operationType} · {op.operationId}
                            </span>
                            {op.error?.message && (
                              <div className="text-[11px] text-amber-900 truncate">
                                {op.error.message}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={recoveringOpId === op.operationId || isReadOnlyOutage}
                            onClick={() => void handleRecoverOperation(op.operationId)}
                            className="min-h-[30px] px-2.5 py-1 rounded bg-[#211B2E] text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            {recoveringOpId === op.operationId && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            <span>{t('console.recovery.recoverBtn')}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Legacy Migration Detection Banner & Guided Wizard */}
            {hasLegacyItemsToMigrate && !showMigrationWizard && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-[#211B2E]">
                      {t('console.migration.bannerTitle')}
                    </div>
                    <p className="text-xs text-[#4A435C] mt-0.5 leading-relaxed">
                      {t('console.migration.bannerDesc', {
                        sitesCount: bootstrap.unattachedLegacySites.length,
                        legacyCount: legacyResourcesCount + (hasBrowserLegacyDraft ? 1 : 0),
                      })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMigrationWizard(true)}
                  className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <span>{t('console.migration.launchWizardBtn')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </section>
            )}

            {showMigrationWizard && activeOrg && (
              <LegacyMigrationWizard
                accessToken={accessToken}
                activeOrgId={activeOrg.org_id}
                activeProjectId={activeProject?.project_id || ''}
                organizations={bootstrap.organizations}
                projects={bootstrap.projects}
                onMigrated={loadBootstrap}
                onClose={() => setShowMigrationWizard(false)}
              />
            )}

            {actionError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-900"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="text-xs font-semibold underline shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Organization Switcher & Actions */}
            <section className="rounded-2xl border border-[#211B2E]/10 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#574F6B]">
                    <Building2 className="w-4 h-4 text-[#6C2CEB]" />
                    <span>{t('console.orgs.label')}</span>
                  </div>
                  <select
                    aria-label={t('console.orgs.label')}
                    value={activeOrg?.org_id || ''}
                    onChange={(e) => {
                      setSelectedOrgId(e.target.value);
                      setRenamingOrg(false);
                      setConfirmDeleteOrg(false);
                    }}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 bg-[#F7F6FA] text-sm font-semibold text-[#211B2E]"
                  >
                    {bootstrap.organizations.map((org) => (
                      <option key={org.org_id} value={org.org_id}>
                        {org.name}
                        {org.status === 'archived' ? ` (${t('console.orgs.archivedBadge')})` : ''}
                      </option>
                    ))}
                  </select>
                  <span className="px-2 py-1 rounded-md bg-[#F7F6FA] border border-[#211B2E]/10 text-[11px] font-mono tabular-nums text-[#4A435C]">
                    {orgQuotaCount} / 10
                  </span>
                  {activeOrg?.status === 'archived' && (
                    <span className="px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-900">
                      {t('console.orgs.archivedBadge')}
                    </span>
                  )}
                  {activeOrg?.canonical_revision !== undefined && (
                    <span className="text-[11px] font-mono tabular-nums text-[#574F6B]">
                      rev {activeOrg.canonical_revision}
                    </span>
                  )}
                  {activeOrg?.role && (
                    <span className="px-2 py-1 rounded-md bg-[#F7F6FA] border border-[#211B2E]/10 text-[11px] font-medium text-[#4A435C]">
                      {t('console.orgs.roleBadge', { role: activeOrg.role })}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeOrg && activeOrg.status === 'active' && (
                    <button
                      type="button"
                      disabled={isReadOnlyOutage}
                      onClick={() => {
                        setRenamingOrg((v) => !v);
                        setRenameOrgValue(activeOrg.name);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{t('console.orgs.renameBtn')}</span>
                    </button>
                  )}
                  {activeOrg && activeOrg.status === 'active' && (
                    <button
                      type="button"
                      disabled={isReadOnlyOutage || archivingOrg}
                      onClick={() => void handleArchiveOrg()}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      {archivingOrg ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Archive className="w-3.5 h-3.5" />
                      )}
                      <span>{t('console.orgs.archiveBtn')}</span>
                    </button>
                  )}
                  {activeOrg && activeOrg.status === 'archived' && (
                    <button
                      type="button"
                      disabled={isReadOnlyOutage || deletingOrg || orgProjects.length > 0}
                      title={
                        orgProjects.length > 0
                          ? t('console.orgs.deleteRequiresEmptyHint')
                          : undefined
                      }
                      onClick={() => setConfirmDeleteOrg((v) => !v)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('console.orgs.deletePermanentBtn')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isReadOnlyOutage || orgQuotaReached}
                    onClick={() => setShowCreateOrg((v) => !v)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('console.orgs.newBtn')}</span>
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-[#574F6B]">
                {t('console.orgs.quotaNote')}
              </div>

              {confirmDeleteOrg && activeOrg && activeOrg.status === 'archived' && (
                <div className="pt-3 border-t border-red-200 flex flex-wrap items-center justify-between gap-3 bg-red-50/50 rounded-lg p-3">
                  <div className="text-xs text-red-900">
                    {t('console.orgs.confirmDeleteDesc', { orgName: activeOrg.name })}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={deletingOrg}
                      onClick={() => setConfirmDeleteOrg(false)}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 bg-white text-xs font-medium text-[#211B2E]"
                    >
                      {t('console.orgs.cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={deletingOrg || orgProjects.length > 0 || isReadOnlyOutage}
                      onClick={() => void handleDeleteOrg()}
                      className="min-h-[34px] px-3.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {deletingOrg && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{t('console.orgs.deletePermanentBtn')}</span>
                    </button>
                  </div>
                </div>
              )}

              {renamingOrg && activeOrg && (
                <form
                  onSubmit={handleRenameOrg}
                  className="pt-3 border-t border-[#211B2E]/10 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    value={renameOrgValue}
                    onChange={(e) => setRenameOrgValue(e.target.value)}
                    placeholder={t('console.orgs.namePlaceholder')}
                    maxLength={80}
                    className="flex-1 min-w-[200px] min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-sm"
                  />
                  <button
                    type="submit"
                    className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] text-white text-xs font-semibold"
                  >
                    {t('console.projects.saveSite').split(' ')[0]}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingOrg(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#4A435C]"
                  >
                    {t('console.orgs.cancel')}
                  </button>
                </form>
              )}

              {showCreateOrg && (
                <form
                  onSubmit={handleCreateOrg}
                  className="pt-3 border-t border-[#211B2E]/10 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder={t('console.orgs.namePlaceholder')}
                    maxLength={80}
                    className="flex-1 min-w-[220px] min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={creatingOrg}
                    className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {creatingOrg && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{t('console.orgs.createSubmit')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateOrg(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#4A435C]"
                  >
                    {t('console.orgs.cancel')}
                  </button>
                </form>
              )}
            </section>

            {/* Projects & Selected Project Workspace */}
            {activeOrg && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Projects List */}
                <section className="lg:col-span-4 rounded-2xl border border-[#211B2E]/10 bg-white p-5 space-y-4 h-fit">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E] flex items-center gap-2">
                        <FolderKanban className="w-4 h-4 text-[#6C2CEB] shrink-0" />
                        <span className="truncate">{t('console.projects.heading', { orgName: activeOrg.name })}</span>
                      </h2>
                      <div className="text-[11px] font-mono tabular-nums text-[#574F6B] mt-0.5">
                        {projectQuotaCount} / 10 · {t('console.projects.quotaNote')}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isReadOnlyOutage || activeOrg.status === 'archived' || projectQuotaReached}
                      onClick={() => setShowCreateProject((v) => !v)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#F7F6FA] hover:bg-[#EDEAF5] border border-[#211B2E]/10 text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1 disabled:opacity-50 shrink-0 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#6C2CEB]" />
                      <span>{t('console.projects.newBtn')}</span>
                    </button>
                  </div>

                  {showCreateProject && (
                    <form
                      onSubmit={handleCreateProject}
                      className="rounded-xl border border-[#211B2E]/12 bg-[#F7F6FA] p-3.5 space-y-2.5"
                    >
                      <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder={t('console.projects.namePlaceholder')}
                        maxLength={80}
                        required
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 bg-white text-xs sm:text-sm"
                      />
                      <input
                        type="text"
                        value={newProjectDesc}
                        onChange={(e) => setNewProjectDesc(e.target.value)}
                        placeholder={t('console.projects.descPlaceholder')}
                        maxLength={200}
                        className="w-full min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 bg-white text-xs"
                      />
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-semibold text-[#211B2E]">
                          {t('console.starterPresets.label')}
                        </div>
                        <div className="space-y-1.5">
                          {STARTER_PRESETS.map((preset) => (
                            <label
                              key={preset.key}
                              className={`block rounded-lg border p-2.5 cursor-pointer transition-colors ${
                                newProjectPreset === preset.key
                                  ? 'border-[#6C2CEB] bg-white'
                                  : 'border-[#211B2E]/12 bg-white/70 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="starterPreset"
                                  value={preset.key}
                                  checked={newProjectPreset === preset.key}
                                  onChange={() => setNewProjectPreset(preset.key)}
                                  className="accent-[#6C2CEB]"
                                />
                                <span className="text-xs font-semibold text-[#211B2E]">
                                  {t(preset.titleKey)}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#574F6B] mt-0.5 pl-5 leading-snug">
                                {t(preset.descKey)}
                              </p>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={creatingProject}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#6C2CEB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {creatingProject && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>{t('console.projects.createSubmit')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCreateProject(false)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white text-xs text-[#4A435C]"
                        >
                          {t('console.orgs.cancel')}
                        </button>
                      </div>
                    </form>
                  )}

                  {orgProjects.length === 0 ? (
                    <p className="text-xs text-[#4A435C] leading-relaxed">
                      {t('console.projects.empty')}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {orgProjects.map((project) => {
                        const isSelected = activeProject?.project_id === project.project_id;
                        const projSitesCount = bootstrap.sites.filter(
                          (s) => s.project_id === project.project_id
                        ).length;
                        return (
                          <button
                            key={project.project_id}
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(project.project_id);
                              setEditingSite(null);
                              setShowAddSite(false);
                            }}
                            className={`w-full text-left rounded-xl border p-3.5 transition-colors ${
                              isSelected
                                ? 'border-[#6C2CEB] bg-[#F4EFFF]'
                                : 'border-[#211B2E]/10 bg-white hover:bg-[#F7F6FA]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-[#211B2E] truncate">
                                {project.name}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {project.status === 'archived' && (
                                  <span className="px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-[10px] font-semibold text-amber-900">
                                    {t('console.orgs.archivedBadge')}
                                  </span>
                                )}
                                <span className="text-[11px] font-mono tabular-nums text-[#574F6B]">
                                  {projSitesCount} site{projSitesCount === 1 ? '' : 's'}
                                </span>
                              </div>
                            </div>
                            {project.description && (
                              <p className="text-xs text-[#4A435C] mt-1 line-clamp-2">
                                {project.description}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Right Column: Selected Project Modules & Sites */}
                <section className="lg:col-span-8 space-y-6">
                  {activeProject && (
                    <>
                      {/* Project Overview + Module Toggles */}
                      <div className="rounded-2xl border border-[#211B2E]/10 bg-white p-5 sm:p-6 space-y-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-mono text-[#574F6B]">
                              {activeOrg.org_slug} / {activeProject.project_slug}
                            </div>
                            <h3 className="font-['Outfit',sans-serif] text-xl font-semibold text-[#211B2E]">
                              {activeProject.name}
                            </h3>
                            {activeProject.description && (
                              <p className="text-xs text-[#4A435C] mt-1">
                                {activeProject.description}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {activeProjectModules.find((m) => m.module_key === 'cms')?.enabled !==
                              0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onNavigate(
                                    buildConsoleUrl({
                                      orgId: activeOrg.org_id,
                                      projectId: activeProject.project_id,
                                      moduleSlug: 'cms',
                                    })
                                  )
                                }
                                className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 whitespace-nowrap"
                              >
                                <Database className="w-3.5 h-3.5 text-[#6C2CEB]" />
                                <span>{t('console.dashboard.openCmsModule')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                onNavigate(
                                  buildConsoleUrl({
                                    orgId: activeOrg.org_id,
                                    projectId: activeProject.project_id,
                                  })
                                )
                              }
                              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <span>{t('console.dashboard.openDashboardBtn')}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenProjectBuilder(
                                  activeOrg.org_id,
                                  activeOrg.name,
                                  activeProject
                                )
                              }
                              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>{t('console.projects.openBuilder')}</span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs font-semibold text-[#211B2E]">
                            <SlidersHorizontal className="w-3.5 h-3.5 text-[#6C2CEB]" />
                            <span>{t('console.projects.modulesHeading')}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                            {ALL_PROJECT_MODULES.map((modKey) => {
                              const record = activeProjectModules.find(
                                (m) => m.module_key === modKey
                              );
                              const enabled = record ? record.enabled === 1 : true;
                              const Icon = MODULE_ICONS[modKey];
                              const busy = togglingModuleKey === modKey;
                              return (
                                <button
                                  key={modKey}
                                  type="button"
                                  disabled={busy || isReadOnlyOutage || activeProject.status === 'archived'}
                                  onClick={() => handleToggleModule(modKey, enabled)}
                                  className={`rounded-xl border p-3 text-left flex items-center justify-between gap-2 transition-colors disabled:opacity-60 ${
                                    enabled
                                      ? 'border-[#6C2CEB]/30 bg-[#F9F7FF]'
                                      : 'border-[#211B2E]/10 bg-[#F7F6FA] opacity-70'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Icon className="w-4 h-4 text-[#6C2CEB] shrink-0" />
                                    <span className="text-xs font-semibold text-[#211B2E] truncate">
                                      {t(`console.modules.${modKey}`)}
                                    </span>
                                  </div>
                                  {busy ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6C2CEB] shrink-0" />
                                  ) : enabled ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  ) : (
                                    <span className="text-[10px] font-semibold text-[#574F6B]">
                                      Off
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Project Drive Folder Isolation */}
                      <div className="rounded-2xl border border-[#211B2E]/10 bg-white p-5 sm:p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <h3 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E] flex items-center gap-2">
                              <FolderOpen className="w-4 h-4 text-[#6C2CEB]" />
                              <span>{t('console.drive.heading')}</span>
                            </h3>
                            <div className="text-xs font-mono text-[#574F6B]">
                              {t('console.drive.pathLabel')}: Builly/{activeOrg.org_slug}/
                              {activeProject.project_slug}/
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                                activeProject.drive_folder_id
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-[#211B2E]/10 text-[#4A435C]'
                              }`}
                            >
                              {activeProject.drive_folder_id
                                ? t('console.drive.provisioned')
                                : t('console.drive.notProvisioned')}
                            </span>

                            {bootstrap.googleWorkspace.connected &&
                              !bootstrap.googleWorkspace.needsReauth && (
                                <button
                                  type="button"
                                  disabled={
                                    provisioningDrive ||
                                    isReadOnlyOutage ||
                                    activeProject.status === 'archived'
                                  }
                                  onClick={() =>
                                    handleProvisionProjectDrive(
                                      Boolean(activeProject.drive_folder_id)
                                    )
                                  }
                                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  {provisioningDrive && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  )}
                                  <span>
                                    {provisioningDrive
                                      ? t('console.drive.provisioning')
                                      : activeProject.drive_folder_id
                                      ? t('console.drive.verifyBtn')
                                      : t('console.drive.provisionBtn')}
                                  </span>
                                </button>
                              )}
                          </div>
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

                        {(!bootstrap.googleWorkspace.connected ||
                          bootstrap.googleWorkspace.needsReauth) && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                            <span>{t('console.drive.connectFirst')}</span>
                            <button
                              type="button"
                              onClick={() => onNavigate('/workspace')}
                              className="font-semibold text-[#6C2CEB] hover:underline"
                            >
                              {t('console.connectWorkspaceBtn')}
                            </button>
                          </div>
                        )}

                        {activeProjectResources.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {activeProjectResources.map((resItem) => (
                              <div
                                key={resItem.resource_id}
                                className="rounded-lg border border-[#211B2E]/10 bg-[#F7F6FA] px-3 py-2"
                              >
                                <div className="text-[11px] font-semibold text-[#211B2E] truncate">
                                  {resItem.title}
                                </div>
                                <div className="text-[10px] font-mono text-[#574F6B] truncate">
                                  {resItem.resource_kind}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Attached Sites inside Project */}
                      <div className="rounded-2xl border border-[#211B2E]/10 bg-white p-5 sm:p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E] flex items-center gap-2">
                            <Globe className="w-4 h-4 text-[#6C2CEB]" />
                            <span>{t('console.projects.sitesHeading')}</span>
                          </h3>
                          <button
                            type="button"
                            disabled={isReadOnlyOutage || activeProject.status === 'archived'}
                            onClick={() => setShowAddSite((v) => !v)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#6C2CEB]" />
                            <span>{t('console.projects.addSiteBtn')}</span>
                          </button>
                        </div>

                        {showAddSite && (
                          <form
                            onSubmit={handleAddSite}
                            className="rounded-xl border border-[#211B2E]/12 bg-[#F7F6FA] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
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

                        {activeProjectSites.length === 0 ? (
                          <p className="text-xs text-[#4A435C] leading-relaxed">
                            {t('console.projects.noSites')}
                          </p>
                        ) : (
                          <div className="space-y-2.5">
                            {activeProjectSites.map((site) => {
                              const isEditingThis = editingSite?.site_id === site.site_id;
                              return (
                                <div
                                  key={site.site_id}
                                  className="rounded-xl border border-[#211B2E]/10 bg-[#F7F6FA] p-4 space-y-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-[#211B2E] truncate">
                                          {site.site_name}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                            site.status === 'published'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : 'bg-[#211B2E]/10 text-[#4A435C]'
                                          }`}
                                        >
                                          {site.status === 'published'
                                            ? t('console.projects.statusPublished')
                                            : t('console.projects.statusDraft')}
                                        </span>
                                      </div>
                                      <div className="text-xs font-mono text-[#574F6B] mt-0.5">
                                        /s/{site.site_slug}
                                        {site.active_publish_version
                                          ? ` · ${site.active_publish_version}`
                                          : ''}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={isReadOnlyOutage || activeProject.status === 'archived'}
                                        onClick={() => {
                                          if (isEditingThis) {
                                            setEditingSite(null);
                                          } else {
                                            setEditingSite(site);
                                            setEditSiteName(site.site_name);
                                            setEditSiteSlug(site.site_slug);
                                          }
                                        }}
                                        className="min-h-[34px] px-3 py-1 rounded-lg border border-[#211B2E]/15 bg-white text-xs font-medium text-[#211B2E] inline-flex items-center gap-1 disabled:opacity-50"
                                      >
                                        <Pencil className="w-3 h-3" />
                                        <span>{t('console.projects.renameSite')}</span>
                                      </button>
                                      {site.status === 'published' && (
                                        <button
                                          type="button"
                                          onClick={() => onNavigate(`/s/${site.site_slug}`)}
                                          className="min-h-[34px] px-3 py-1 rounded-lg bg-[#211B2E] text-white text-xs font-semibold inline-flex items-center gap-1"
                                        >
                                          <span>
                                            {t('console.projects.viewLiveSite', {
                                              slug: site.site_slug,
                                            })}
                                          </span>
                                          <ExternalLink className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {isEditingThis && (
                                    <form
                                      onSubmit={handleUpdateSite}
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
                                          {savingSite && (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          )}
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
                      </div>
                    </>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
