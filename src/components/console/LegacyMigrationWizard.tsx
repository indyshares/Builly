import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Database,
  FolderOpen,
  Globe,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Table2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  createOperationKey,
  extractLocalOnboardingContext,
  workspaceHierarchyClient,
} from '../../features/console/workspaceHierarchyClient';
import { storageService } from '../../services/storageService';
import {
  LegacyMigrationCleanupResult,
  LegacyMigrationExecuteResult,
  LegacyMigrationPlan,
  OrganizationRecord,
  ProjectRecord,
} from '../../types/workspace';

interface LegacyMigrationWizardProps {
  accessToken: string;
  activeOrgId: string;
  activeProjectId: string;
  organizations: OrganizationRecord[];
  projects: ProjectRecord[];
  initialPlan?: LegacyMigrationPlan | null;
  onMigrated: () => Promise<void>;
  onClose?: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

export const LegacyMigrationWizard: React.FC<LegacyMigrationWizardProps> = ({
  accessToken,
  activeOrgId,
  activeProjectId,
  organizations,
  projects,
  initialPlan = null,
  onMigrated,
  onClose,
}) => {
  const { t } = useTranslation();

  const [step, setStep] = useState<WizardStep>(1);
  const [loadingPlan, setLoadingPlan] = useState(!initialPlan);
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<LegacyMigrationPlan | null>(initialPlan);

  // Target selection state
  const [targetOrgId, setTargetOrgId] = useState<string>(
    activeOrgId || organizations[0]?.org_id || ''
  );
  const orgProjects = useMemo(
    () => projects.filter((p) => p.org_id === targetOrgId),
    [projects, targetOrgId]
  );

  const [strategy, setStrategy] = useState<'attach_to_project' | 'create_new_project'>(
    orgProjects.length > 0 ? 'attach_to_project' : 'create_new_project'
  );
  const [targetProjectId, setTargetProjectId] = useState<string>(
    activeProjectId || orgProjects[0]?.project_id || ''
  );
  const [newProjectName, setNewProjectName] = useState<string>('Migrated Workspace');

  // Item selection checkboxes
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(
    () => initialPlan?.unattachedSites.map((s) => s.siteId) || []
  );
  const [selectedPartitionKeys, setSelectedPartitionKeys] = useState<string[]>(
    () =>
      initialPlan?.spreadsheetPartitions
        .filter((p) => !p.alreadyMigrated)
        .map((p) => `${p.sourceSpreadsheetId}::${p.sourceTab}`) || []
  );
  const [copyLegacyDriveConfigs, setCopyLegacyDriveConfigs] = useState<boolean>(
    () => Boolean(initialPlan?.driveLegacy.legacyRegistryFile)
  );
  const [importLocalDraft, setImportLocalDraft] = useState<boolean>(() =>
    Boolean(initialPlan?.localDraftSummary?.portfolioSlug)
  );

  // Execute & cleanup state
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<LegacyMigrationExecuteResult | null>(null);

  const [confirmCleanupChecked, setConfirmCleanupChecked] = useState(false);
  const [clearBrowserLegacyChecked, setClearBrowserLegacyChecked] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<LegacyMigrationCleanupResult | null>(null);

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true);
    setPlanError(null);
    try {
      const localCtx = extractLocalOnboardingContext();
      const nextPlan = await workspaceHierarchyClient.getMigrationPlan(accessToken, {
        localContext: localCtx,
        targetOrgId: targetOrgId || undefined,
      });
      setPlan(nextPlan);
      setSelectedSiteIds(nextPlan.unattachedSites.map((s) => s.siteId));
      setSelectedPartitionKeys(
        nextPlan.spreadsheetPartitions
          .filter((p) => !p.alreadyMigrated)
          .map((p) => `${p.sourceSpreadsheetId}::${p.sourceTab}`)
      );
      setCopyLegacyDriveConfigs(Boolean(nextPlan.driveLegacy.legacyRegistryFile));
      setImportLocalDraft(Boolean(nextPlan.localDraftSummary?.portfolioSlug));
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : t('console.migration.planError'));
    } finally {
      setLoadingPlan(false);
    }
  }, [accessToken, targetOrgId, t]);

  useEffect(() => {
    if (!initialPlan) {
      loadPlan();
    }
  }, [initialPlan, loadPlan]);

  useEffect(() => {
    const firstProj = projects.find((p) => p.org_id === targetOrgId);
    if (firstProj && !projects.some((p) => p.org_id === targetOrgId && p.project_id === targetProjectId)) {
      setTargetProjectId(firstProj.project_id);
    }
  }, [targetOrgId, projects, targetProjectId]);

  const toggleSiteSelection = (siteId: string) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  };

  const togglePartitionSelection = (key: string) => {
    setSelectedPartitionKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleExecuteMigration = async () => {
    if (!plan || !targetOrgId) return;
    setExecuting(true);
    setExecuteError(null);

    try {
      const selectedPartitions = plan.spreadsheetPartitions
        .filter((p) => selectedPartitionKeys.includes(`${p.sourceSpreadsheetId}::${p.sourceTab}`))
        .map((p) => ({
          sourceSpreadsheetId: p.sourceSpreadsheetId,
          sourceTab: p.sourceTab,
          domain: p.domain,
          targetDatasetKey: p.targetDatasetKey,
        }));

      const localDraftSite =
        importLocalDraft && plan.localDraftSummary?.portfolioSlug
          ? {
              siteId: plan.localDraftSummary.siteId,
              siteSlug: plan.localDraftSummary.portfolioSlug,
              siteName: plan.localDraftSummary.siteName || plan.localDraftSummary.portfolioSlug,
            }
          : null;

      const result = await workspaceHierarchyClient.executeMigration(accessToken, {
        operationKey: createOperationKey('mig_exec'),
        targetOrgId,
        strategy,
        targetProjectId: strategy === 'attach_to_project' ? targetProjectId : undefined,
        newProjectName: strategy === 'create_new_project' ? newProjectName.trim() : undefined,
        attachSiteIds: selectedSiteIds,
        partitionSpreadsheets: selectedPartitions,
        copyLegacyDriveConfigs,
        localDraftSite,
      });

      // Also mirror legacy browser draft non-destructively into the resolved Project's isolated local cache
      if (importLocalDraft && result.targetProjectId) {
        storageService.importLegacyDraftToProject(result.targetProjectId);
      }

      setExecuteResult(result);
      setStep(3);
      await onMigrated();
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : t('console.migration.executeError'));
    } finally {
      setExecuting(false);
    }
  };

  const handleCompleteCleanup = async () => {
    if (!executeResult || !confirmCleanupChecked) return;
    setCleaningUp(true);
    setExecuteError(null);

    try {
      const res = await workspaceHierarchyClient.completeMigrationCleanup(accessToken, {
        operationKey: createOperationKey('mig_clean'),
        targetOrgId: executeResult.targetOrgId,
        confirmOwnerReviewed: true,
        reconciliationPassed: executeResult.reconciliation.passed,
        archiveLegacyResourceIds: plan?.legacyResourceIds || [],
      });

      if (clearBrowserLegacyChecked) {
        storageService.clearLegacyBrowserDrafts();
      }

      setCleanupResult(res);
      await onMigrated();
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : t('console.migration.cleanupError'));
    } finally {
      setCleaningUp(false);
    }
  };

  const selectedOrg = organizations.find((o) => o.org_id === targetOrgId) || organizations[0];
  const resolvedTargetProjectName =
    strategy === 'create_new_project'
      ? newProjectName.trim() || 'Migrated Workspace'
      : orgProjects.find((p) => p.project_id === targetProjectId)?.name || targetProjectId;

  const steps: Array<{ id: WizardStep; titleKey: string }> = [
    { id: 1, titleKey: 'console.migration.stepInventory' },
    { id: 2, titleKey: 'console.migration.stepMapping' },
    { id: 3, titleKey: 'console.migration.stepReconcile' },
    { id: 4, titleKey: 'console.migration.stepCleanup' },
  ];

  return (
    <section
      aria-label={t('console.migration.wizardTitle')}
      className="rounded-2xl border border-[#211B2E]/15 bg-white p-5 sm:p-6 space-y-5"
    >
      {/* Header & Close / Refresh */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#211B2E]/10 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6C2CEB]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{t('console.migration.wizardBadge')}</span>
          </div>
          <h2 className="font-['Outfit',sans-serif] text-lg sm:text-xl font-semibold text-[#211B2E]">
            {t('console.migration.wizardTitle')}
          </h2>
          <p className="text-xs sm:text-sm text-[#4A435C] leading-relaxed">
            {t('console.migration.wizardSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={loadingPlan || executing}
            onClick={loadPlan}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs font-medium text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPlan ? 'animate-spin' : ''}`} />
            <span>{t('console.migration.rescanBtn')}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('console.migration.closeBtn')}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[#211B2E]/15 hover:bg-[#F7F6FA] text-xs text-[#4A435C] inline-flex items-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stepper Bar */}
      <nav
        aria-label={t('console.migration.stepsAria')}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2"
      >
        {steps.map((s) => {
          const isCurrent = step === s.id;
          const isComplete = step > s.id || (s.id === 4 && Boolean(cleanupResult));
          const isDisabled =
            (s.id === 3 && !executeResult) ||
            (s.id === 4 && (!executeResult || !executeResult.reconciliation.passed));
          return (
            <button
              key={s.id}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && setStep(s.id)}
              className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors flex items-center justify-between gap-2 ${
                isCurrent
                  ? 'border-[#6C2CEB] bg-[#F4EFFF] text-[#211B2E] font-semibold'
                  : isComplete
                  ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950 font-medium'
                  : 'border-[#211B2E]/10 bg-[#F7F6FA] text-[#574F6B] disabled:opacity-50'
              }`}
            >
              <span className="truncate">
                <span className="font-mono tabular-nums mr-1.5">0{s.id}.</span>
                {t(s.titleKey)}
              </span>
              {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            </button>
          );
        })}
      </nav>

      {/* Error / Status Messages */}
      {(planError || executeError) && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3.5 flex items-start gap-2.5 text-xs sm:text-sm text-red-900"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{executeError || planError}</span>
        </div>
      )}

      {loadingPlan && (
        <div className="py-10 flex flex-col items-center justify-center gap-3 text-sm text-[#4A435C]">
          <Loader2 className="w-6 h-6 text-[#6C2CEB] animate-spin" />
          <span>{t('console.migration.scanning')}</span>
        </div>
      )}

      {/* STEP 1: Inventory & Ambiguities */}
      {!loadingPlan && plan && step === 1 && (
        <div className="space-y-4">
          {!plan.hasPendingMigration ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-emerald-950">
                  {t('console.migration.nothingPendingTitle')}
                </div>
                <p className="text-xs text-emerald-900 leading-relaxed">
                  {t('console.migration.nothingPendingDesc')}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#211B2E]/10 bg-[#F7F6FA] p-3.5">
                  <div className="text-[11px] font-medium text-[#574F6B]">
                    {t('console.migration.statUnattachedSites')}
                  </div>
                  <div className="text-xl font-semibold font-mono tabular-nums text-[#211B2E] mt-1">
                    {plan.unattachedSites.length}
                  </div>
                </div>
                <div className="rounded-xl border border-[#211B2E]/10 bg-[#F7F6FA] p-3.5">
                  <div className="text-[11px] font-medium text-[#574F6B]">
                    {t('console.migration.statSpreadsheetTabs')}
                  </div>
                  <div className="text-xl font-semibold font-mono tabular-nums text-[#211B2E] mt-1">
                    {plan.spreadsheetPartitions.length}
                  </div>
                </div>
                <div className="rounded-xl border border-[#211B2E]/10 bg-[#F7F6FA] p-3.5">
                  <div className="text-[11px] font-medium text-[#574F6B]">
                    {t('console.migration.statDriveFolders')}
                  </div>
                  <div className="text-xl font-semibold font-mono tabular-nums text-[#211B2E] mt-1">
                    {plan.driveLegacy.legacySiteFolders.length +
                      (plan.driveLegacy.legacyRegistryFile ? 1 : 0) +
                      (plan.driveLegacy.legacyCmsFolder ? 1 : 0)}
                  </div>
                </div>
                <div className="rounded-xl border border-[#211B2E]/10 bg-[#F7F6FA] p-3.5">
                  <div className="text-[11px] font-medium text-[#574F6B]">
                    {t('console.migration.statLocalDraft')}
                  </div>
                  <div className="text-sm font-semibold text-[#211B2E] mt-2 truncate">
                    {plan.localDraftSummary?.portfolioSlug
                      ? `/${plan.localDraftSummary.portfolioSlug}`
                      : t('console.migration.noneFound')}
                  </div>
                </div>
              </div>

              {plan.ambiguities.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{t('console.migration.advisoriesHeading')}</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-amber-900 list-disc pl-5">
                    {plan.ambiguities.map((amb, idx) => (
                      <li key={idx}>{amb.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.spreadsheetPartitions.length > 0 && (
                <div className="rounded-xl border border-[#211B2E]/10 overflow-hidden">
                  <div className="bg-[#F7F6FA] px-4 py-2.5 border-b border-[#211B2E]/10 text-xs font-semibold text-[#211B2E] flex items-center gap-2">
                    <Table2 className="w-3.5 h-3.5 text-[#6C2CEB]" />
                    <span>{t('console.migration.partitionPreviewHeading')}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9FC] text-[#574F6B] border-b border-[#211B2E]/10">
                        <tr>
                          <th className="px-4 py-2 font-medium">{t('console.migration.colSourceTab')}</th>
                          <th className="px-4 py-2 font-medium">{t('console.migration.colDomain')}</th>
                          <th className="px-4 py-2 font-medium">{t('console.migration.colTargetSheet')}</th>
                          <th className="px-4 py-2 font-medium text-right">
                            {t('console.migration.colRows')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#211B2E]/10">
                        {plan.spreadsheetPartitions.map((part) => (
                          <tr key={`${part.sourceSpreadsheetId}::${part.sourceTab}`}>
                            <td className="px-4 py-2.5 font-mono text-[#211B2E]">{part.sourceTab}</td>
                            <td className="px-4 py-2.5 uppercase font-semibold text-[#574F6B]">
                              {part.domain}
                            </td>
                            <td className="px-4 py-2.5 text-[#211B2E]">{part.targetSpreadsheetTitle}</td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-right text-[#4A435C]">
                              {part.estimatedRowCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <span>{t('console.migration.nextMappingBtn')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 2: Target Mapping & Partition Selection */}
      {!loadingPlan && plan && step === 2 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="migration-target-org"
                className="block text-xs font-semibold text-[#211B2E]"
              >
                {t('console.migration.targetOrgLabel')}
              </label>
              <select
                id="migration-target-org"
                value={targetOrgId}
                onChange={(e) => setTargetOrgId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#211B2E]/20 bg-[#F7F6FA] text-sm text-[#211B2E]"
              >
                {organizations.map((org) => (
                  <option key={org.org_id} value={org.org_id}>
                    {org.name} ({org.org_slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#211B2E]">
                {t('console.migration.projectStrategyLabel')}
              </span>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] cursor-pointer">
                  <input
                    type="radio"
                    name="migrationStrategy"
                    checked={strategy === 'attach_to_project'}
                    onChange={() => setStrategy('attach_to_project')}
                    disabled={orgProjects.length === 0}
                    className="accent-[#6C2CEB]"
                  />
                  <span>{t('console.migration.strategyExisting')}</span>
                </label>
                <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] cursor-pointer">
                  <input
                    type="radio"
                    name="migrationStrategy"
                    checked={strategy === 'create_new_project'}
                    onChange={() => setStrategy('create_new_project')}
                    className="accent-[#6C2CEB]"
                  />
                  <span>{t('console.migration.strategyNew')}</span>
                </label>
              </div>
            </div>
          </div>

          {strategy === 'attach_to_project' ? (
            <div className="space-y-1.5">
              <label
                htmlFor="migration-target-project"
                className="block text-xs font-semibold text-[#211B2E]"
              >
                {t('console.migration.targetProjectLabel')}
              </label>
              <select
                id="migration-target-project"
                value={targetProjectId}
                onChange={(e) => setTargetProjectId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#211B2E]/20 bg-[#F7F6FA] text-sm text-[#211B2E]"
              >
                {orgProjects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name} ({p.project_slug})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor="migration-new-project-name"
                className="block text-xs font-semibold text-[#211B2E]"
              >
                {t('console.migration.newProjectNameLabel')}
              </label>
              <input
                id="migration-new-project-name"
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                maxLength={80}
                className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-[#211B2E]/20 bg-white text-sm text-[#211B2E]"
              />
            </div>
          )}

          {/* Selection check-lists */}
          <div className="space-y-3 rounded-xl border border-[#211B2E]/10 bg-[#FAF9FC] p-4">
            <div className="text-xs font-semibold text-[#211B2E]">
              {t('console.migration.itemsToMigrateHeading')}
            </div>

            {plan.unattachedSites.map((s) => (
              <label
                key={s.siteId}
                className="flex items-start gap-2.5 text-xs text-[#211B2E] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedSiteIds.includes(s.siteId)}
                  onChange={() => toggleSiteSelection(s.siteId)}
                  className="mt-0.5 accent-[#6C2CEB]"
                />
                <span>
                  <Globe className="w-3.5 h-3.5 inline mr-1.5 text-[#6C2CEB]" />
                  <strong>{s.siteName}</strong>{' '}
                  <span className="font-mono text-[#574F6B]">(/s/{s.siteSlug})</span>
                </span>
              </label>
            ))}

            {plan.spreadsheetPartitions.map((p) => {
              const key = `${p.sourceSpreadsheetId}::${p.sourceTab}`;
              return (
                <label
                  key={key}
                  className="flex items-start gap-2.5 text-xs text-[#211B2E] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPartitionKeys.includes(key)}
                    onChange={() => togglePartitionSelection(key)}
                    className="mt-0.5 accent-[#6C2CEB]"
                  />
                  <span>
                    <Database className="w-3.5 h-3.5 inline mr-1.5 text-[#6C2CEB]" />
                    <strong>{p.sourceTab}</strong> →{' '}
                    <span className="font-mono text-[#574F6B]">
                      {p.domain === 'inbox' ? 'Data/Inbox/' : 'Data/CMS/'}
                      {p.targetDatasetKey}
                    </span>
                  </span>
                </label>
              );
            })}

            {plan.driveLegacy.legacyRegistryFile && (
              <label className="flex items-start gap-2.5 text-xs text-[#211B2E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyLegacyDriveConfigs}
                  onChange={(e) => setCopyLegacyDriveConfigs(e.target.checked)}
                  className="mt-0.5 accent-[#6C2CEB]"
                />
                <span>
                  <FolderOpen className="w-3.5 h-3.5 inline mr-1.5 text-[#6C2CEB]" />
                  {t('console.migration.copyLegacyRegistryLabel', {
                    fileName: plan.driveLegacy.legacyRegistryFile.name,
                  })}
                </span>
              </label>
            )}

            {plan.localDraftSummary?.portfolioSlug && (
              <label className="flex items-start gap-2.5 text-xs text-[#211B2E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={importLocalDraft}
                  onChange={(e) => setImportLocalDraft(e.target.checked)}
                  className="mt-0.5 accent-[#6C2CEB]"
                />
                <span>
                  {t('console.migration.importLocalDraftLabel', {
                    slug: plan.localDraftSummary.portfolioSlug,
                  })}
                </span>
              </label>
            )}
          </div>

          <div className="rounded-lg border border-[#211B2E]/10 bg-[#F7F6FA] px-3.5 py-2.5 text-xs text-[#4A435C]">
            {t('console.migration.targetPathPreview', {
              orgSlug: selectedOrg?.org_slug || 'org',
              projectName: resolvedTargetProjectName,
            })}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#211B2E]"
            >
              {t('console.migration.backBtn')}
            </button>
            <button
              type="button"
              disabled={executing}
              onClick={handleExecuteMigration}
              className="min-h-[40px] px-5 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              {executing && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {executing
                  ? t('console.migration.executingBtn')
                  : t('console.migration.executeBtn')}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Reconciliation Verification Report */}
      {!loadingPlan && step === 3 && executeResult && (
        <div className="space-y-4">
          <div
            className={`rounded-xl border p-4 flex items-start gap-3 ${
              executeResult.reconciliation.passed
                ? 'border-emerald-200 bg-emerald-50/60'
                : 'border-amber-200 bg-amber-50'
            }`}
          >
            {executeResult.reconciliation.passed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[#211B2E]">
                {executeResult.reconciliation.passed
                  ? t('console.migration.reconcilePassedTitle')
                  : t('console.migration.reconcileWarningTitle')}
              </div>
              <p className="text-xs text-[#4A435C]">
                {t('console.migration.reconcileSummary', {
                  projectName: executeResult.project.name,
                  sitesCount: executeResult.attachedSitesCount,
                  sheetsCount: executeResult.partitionedDatasets.length,
                })}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[#211B2E]/10 divide-y divide-[#211B2E]/10">
            {executeResult.reconciliation.checks.map((chk) => (
              <div key={chk.id} className="px-4 py-3 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold text-[#211B2E] flex items-center gap-1.5">
                    {chk.status === 'pass' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    )}
                    <span>{chk.label}</span>
                  </div>
                  <p className="text-[#4A435C] pl-5">{chk.detail}</p>
                </div>
                {chk.sourceCount !== undefined && chk.migratedCount !== undefined && (
                  <span className="font-mono tabular-nums text-[11px] px-2 py-0.5 rounded-md bg-[#F7F6FA] border border-[#211B2E]/10 text-[#211B2E] shrink-0">
                    {chk.migratedCount}/{chk.sourceCount}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#211B2E]"
            >
              {t('console.migration.backBtn')}
            </button>
            <button
              type="button"
              disabled={!executeResult.reconciliation.passed}
              onClick={() => setStep(4)}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#211B2E] hover:bg-[#322944] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>{t('console.migration.nextCleanupBtn')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Owner-Confirmed Legacy Marker Archival */}
      {!loadingPlan && step === 4 && executeResult && (
        <div className="space-y-4">
          {cleanupResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-emerald-950">
                  {t('console.migration.cleanupDoneTitle')}
                </div>
                <p className="text-xs text-emerald-900">
                  {t('console.migration.cleanupDoneDesc', {
                    count: cleanupResult.archivedResourcesCount,
                  })}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-[#211B2E]/10 bg-[#FAF9FC] p-4 space-y-3 text-xs text-[#211B2E]">
                <div className="font-semibold flex items-center gap-2">
                  <Archive className="w-4 h-4 text-[#6C2CEB]" />
                  <span>{t('console.migration.cleanupTitle')}</span>
                </div>
                <p className="text-[#4A435C] leading-relaxed">
                  {t('console.migration.cleanupDesc')}
                </p>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmCleanupChecked}
                    onChange={(e) => setConfirmCleanupChecked(e.target.checked)}
                    className="mt-0.5 accent-[#6C2CEB]"
                  />
                  <span>{t('console.migration.confirmArchiveCheckbox')}</span>
                </label>

                {plan?.localDraftSummary && (
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clearBrowserLegacyChecked}
                      onChange={(e) => setClearBrowserLegacyChecked(e.target.checked)}
                      className="mt-0.5 accent-[#6C2CEB]"
                    />
                    <span>{t('console.migration.clearLocalDraftCheckbox')}</span>
                  </label>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#211B2E]"
                >
                  {t('console.migration.backBtn')}
                </button>
                <button
                  type="button"
                  disabled={!confirmCleanupChecked || cleaningUp}
                  onClick={handleCompleteCleanup}
                  className="min-h-[40px] px-5 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {cleaningUp && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {cleaningUp
                      ? t('console.migration.archivingBtn')
                      : t('console.migration.completeCleanupBtn')}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
