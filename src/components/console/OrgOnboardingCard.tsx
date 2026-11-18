import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  FolderOpen,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { validatePortfolioSlug } from '../../config/breakpoints';
import {
  createOperationKey,
  extractLocalOnboardingContext,
  workspaceHierarchyClient,
} from '../../features/console/workspaceHierarchyClient';
import { OnboardingInspectionResult } from '../../types/workspace';

interface OrgOnboardingCardProps {
  accessToken: string;
  ownerEmail: string;
  onCompleted: () => Promise<void> | void;
  onOpenWorkspaceConnect: () => void;
}

export const OrgOnboardingCard: React.FC<OrgOnboardingCardProps> = ({
  accessToken,
  ownerEmail,
  onCompleted,
  onOpenWorkspaceConnect,
}) => {
  const { t } = useTranslation();
  const [inspecting, setInspecting] = useState(true);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<OnboardingInspectionResult | null>(null);

  const [orgName, setOrgName] = useState('');
  const [projectName, setProjectName] = useState('My Workspace');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectedDriveRootId, setSelectedDriveRootId] = useState<string>('');
  const [attachLocalDraft, setAttachLocalDraft] = useState<boolean>(false);
  const [ambiguityConfirmed, setAmbiguityConfirmed] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const operationKeyRef = useRef<string>(createOperationKey('onboard'));

  useEffect(() => {
    let active = true;
    const localCtx = extractLocalOnboardingContext();
    setInspecting(true);
    setInspectError(null);

    workspaceHierarchyClient
      .inspectOnboarding(accessToken, localCtx)
      .then((res) => {
        if (!active) return;
        setInspection(res);
        setOrgName(res.suggestedOrgName || 'Personal Organization');
        setProjectName(res.suggestedProjectName || 'My Workspace');

        if (res.unattachedRegistrySites.length === 1) {
          setSelectedSiteIds([res.unattachedRegistrySites[0].siteId]);
        } else if (res.unattachedRegistrySites.length > 1) {
          // Wait for explicit user selection or pre-select non-conflicting ones only when ambiguity exists
          setSelectedSiteIds(res.unattachedRegistrySites.map((s) => s.siteId));
        }

        if (res.driveDiscovery.rootFolders.length === 1) {
          setSelectedDriveRootId(res.driveDiscovery.rootFolders[0].id);
        } else {
          setSelectedDriveRootId('');
        }

        const localSlug = res.localDraftSummary?.portfolioSlug || '';
        const slugCheck = localSlug ? validatePortfolioSlug(localSlug) : { valid: false };
        const matchesRemote = res.unattachedRegistrySites.some((s) => s.siteSlug === localSlug);
        setAttachLocalDraft(
          Boolean(slugCheck.valid && !matchesRemote && res.unattachedRegistrySites.length === 0)
        );
        setInspecting(false);
      })
      .catch((err) => {
        if (!active) return;
        const emailPrefix = ownerEmail.split('@')[0]?.trim();
        setOrgName(emailPrefix ? `${emailPrefix}'s Organization` : 'Personal Organization');
        setInspectError(
          err instanceof Error ? err.message : 'Could not inspect existing Workspace resources.'
        );
        setInspecting(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, ownerEmail]);

  const toggleSiteSelection = (siteId: string) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const trimmedOrg = orgName.trim();
    if (trimmedOrg.length < 2 || trimmedOrg.length > 80) {
      setSubmitError('Organization name must be between 2 and 80 characters.');
      return;
    }

    if (inspection?.requiresUserConfirmation && !ambiguityConfirmed) {
      setSubmitError('Please review and confirm the discovered resource notice before continuing.');
      return;
    }

    const localSlug = inspection?.localDraftSummary?.portfolioSlug?.trim().toLowerCase() || '';
    const localSlugValid = localSlug ? validatePortfolioSlug(localSlug).valid : false;

    setSubmitting(true);
    try {
      await workspaceHierarchyClient.completeOnboarding(accessToken, {
        operationKey: operationKeyRef.current,
        organizationName: trimmedOrg,
        projectName: projectName.trim() || 'My Workspace',
        attachSiteIds: selectedSiteIds,
        driveRootFolderId: selectedDriveRootId || undefined,
        legacySpreadsheetId: inspection?.localDraftSummary?.spreadsheetId || undefined,
        legacySpreadsheetName: inspection?.localDraftSummary?.spreadsheetName || undefined,
        localDraftSite:
          attachLocalDraft && localSlugValid
            ? {
                siteId: inspection?.localDraftSummary?.siteId,
                siteSlug: localSlug,
                siteName:
                  inspection?.localDraftSummary?.siteName?.trim() || localSlug,
              }
            : undefined,
      });

      await onCompleted();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to create Organization. You can safely retry.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const localSlug = inspection?.localDraftSummary?.portfolioSlug?.trim().toLowerCase() || '';
  const localSlugValid = localSlug ? validatePortfolioSlug(localSlug).valid : false;

  return (
    <section className="max-w-2xl mx-auto rounded-2xl border border-[#211B2E]/12 bg-white p-6 sm:p-8 shadow-sm space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#6C2CEB]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('console.onboarding.badge')}</span>
        </div>
        <h1 className="font-['Outfit',sans-serif] text-2xl sm:text-3xl font-semibold text-[#211B2E]">
          {t('console.onboarding.title')}
        </h1>
        <p className="text-sm text-[#4A435C] leading-relaxed">
          {t('console.onboarding.subtitle')}
        </p>
      </div>

      {inspecting && (
        <div className="rounded-xl border border-[#211B2E]/10 bg-[#F7F6FA] p-4 flex items-center gap-3 text-sm text-[#4A435C]">
          <Loader2 className="w-4 h-4 text-[#6C2CEB] animate-spin shrink-0" />
          <span>{t('console.onboarding.inspecting')}</span>
        </div>
      )}

      {inspectError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-2.5 text-xs sm:text-sm text-amber-950"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{inspectError}</span>
        </div>
      )}

      {!inspecting && inspection && (
        <div className="rounded-xl border border-[#211B2E]/10 bg-[#F7F6FA] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#211B2E]">
              <ShieldCheck className="w-4 h-4 text-[#6C2CEB]" />
              <span>{t('console.onboarding.inspectionFindingsTitle')}</span>
            </div>
            {!inspection.googleWorkspace.connected && (
              <button
                type="button"
                onClick={onOpenWorkspaceConnect}
                className="text-xs font-semibold text-[#6C2CEB] hover:underline"
              >
                {t('console.connectWorkspaceBtn')}
              </button>
            )}
          </div>

          {inspection.unattachedRegistrySites.length === 0 &&
            inspection.driveDiscovery.rootFolders.length === 0 &&
            !inspection.localDraftSummary && (
              <p className="text-xs text-[#4A435C]">
                {t('console.onboarding.noExistingResources')}
              </p>
            )}

          {inspection.unattachedRegistrySites.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#211B2E]">
                {t('console.onboarding.attachSitesLabel')}
              </div>
              <div className="space-y-1.5">
                {inspection.unattachedRegistrySites.map((site) => (
                  <label
                    key={site.siteId}
                    className="flex items-start gap-2.5 rounded-lg border border-[#211B2E]/10 bg-white p-2.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSiteIds.includes(site.siteId)}
                      onChange={() => toggleSiteSelection(site.siteId)}
                      className="mt-0.5 accent-[#6C2CEB]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#211B2E]">
                        <Globe className="w-3.5 h-3.5 text-[#6C2CEB] shrink-0" />
                        <span className="truncate">{site.siteName}</span>
                        <span className="font-mono text-[11px] text-[#574F6B]">
                          /{site.siteSlug}
                        </span>
                      </div>
                      {site.hasReservedSlug && (
                        <p className="text-[11px] text-amber-800 mt-1">
                          {t('console.onboarding.reservedSlugNotice', { slug: site.siteSlug })}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {inspection.driveDiscovery.rootFolders.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#211B2E] flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-[#6C2CEB]" />
                <span>{t('console.onboarding.selectDriveRoot')}</span>
              </div>
              <div className="space-y-1.5">
                {inspection.driveDiscovery.rootFolders.map((folder) => (
                  <label
                    key={folder.id}
                    className="flex items-center gap-2 rounded-lg border border-[#211B2E]/10 bg-white p-2.5 text-xs cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="driveRootFolder"
                      checked={selectedDriveRootId === folder.id}
                      onChange={() => setSelectedDriveRootId(folder.id)}
                      className="accent-[#6C2CEB]"
                    />
                    <span className="font-medium text-[#211B2E]">{folder.name}</span>
                    <span className="font-mono text-[11px] text-[#574F6B] truncate">
                      ({folder.id})
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 rounded-lg border border-[#211B2E]/10 bg-white p-2.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="driveRootFolder"
                    checked={selectedDriveRootId === ''}
                    onChange={() => setSelectedDriveRootId('')}
                    className="accent-[#6C2CEB]"
                  />
                  <span className="text-[#4A435C]">
                    {t('console.onboarding.keepDriveUnattached')}
                  </span>
                </label>
              </div>
            </div>
          )}

          {localSlug && localSlugValid && (
            <label className="flex items-start gap-2.5 rounded-lg border border-[#211B2E]/10 bg-white p-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={attachLocalDraft}
                onChange={(e) => setAttachLocalDraft(e.target.checked)}
                className="mt-0.5 accent-[#6C2CEB]"
              />
              <span className="text-[#211B2E]">
                {t('console.onboarding.attachLocalDraftLabel', { slug: localSlug })}
              </span>
            </label>
          )}

          {inspection.ambiguities.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>{t('console.onboarding.ambiguityWarningTitle')}</span>
              </div>
              <ul className="space-y-1.5 text-xs text-amber-900 list-disc pl-4">
                {inspection.ambiguities.map((amb, idx) => (
                  <li key={`${amb.code}-${idx}`}>{amb.message}</li>
                ))}
              </ul>
              <label className="flex items-start gap-2 pt-1 text-xs font-medium text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ambiguityConfirmed}
                  onChange={(e) => setAmbiguityConfirmed(e.target.checked)}
                  className="mt-0.5 accent-[#6C2CEB]"
                />
                <span>{t('console.onboarding.confirmAmbiguityCheckbox')}</span>
              </label>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="onboarding-org-name"
            className="block text-xs font-semibold text-[#211B2E]"
          >
            {t('console.onboarding.orgNameLabel')}
          </label>
          <div className="relative">
            <Building2 className="w-4 h-4 text-[#574F6B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="onboarding-org-name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder={t('console.onboarding.orgNamePlaceholder')}
              maxLength={80}
              required
              className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-lg border border-[#211B2E]/20 bg-white text-sm text-[#211B2E] focus:outline-none focus:border-[#6C2CEB]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="onboarding-project-name"
            className="block text-xs font-semibold text-[#211B2E]"
          >
            {t('console.onboarding.projectNameLabel')}
          </label>
          <input
            id="onboarding-project-name"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={t('console.onboarding.projectNamePlaceholder')}
            maxLength={80}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-[#211B2E]/20 bg-white text-sm text-[#211B2E] focus:outline-none focus:border-[#6C2CEB]"
          />
        </div>

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={inspecting || submitting || !orgName.trim()}
          className="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-[#6C2CEB] hover:bg-[#5920CB] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('console.onboarding.submittingBtn')}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('console.onboarding.submitBtn')}</span>
            </>
          )}
        </button>
      </form>
    </section>
  );
};
