import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectModuleHeader } from '../../components/console/ProjectModuleHeader';
import { WorkerApiError } from '../../features/workspace-connection/workspaceApiClient';
import { workspaceHierarchyClient } from '../../features/console/workspaceHierarchyClient';
import {
  AgentAssetCandidate,
  createAssetFromAgentCandidate,
  generateAgentAssetCandidates,
  processAndSaveUploadedAsset,
} from '../../services/assetService';
import { assetRepository } from '../../services/assetRepository';
import { AssetCategory, MediaAsset } from '../../types/builder';
import {
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
} from '../../types/workspace';
import { buildConsoleUrl } from '../../utils/routes';

interface ProjectAssetsPageProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
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

const ASSET_CATEGORIES: ReadonlyArray<'all' | AssetCategory> = [
  'all',
  'images',
  'logos',
  'icons',
  'video-audio',
  'fonts',
  'documents',
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Unable to read file bytes.'));
    reader.readAsDataURL(file);
  });
}

export const ProjectAssetsPage: React.FC<ProjectAssetsPageProps> = ({
  organization,
  project,
  modules,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assets, setAssets] = useState<MediaAsset[]>(() =>
    assetRepository.getAssets(project.project_id)
  );
  const [categoryFilter, setCategoryFilter] = useState<'all' | AssetCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<MediaAsset | null>(null);

  const [isLoadingRemote, setIsLoadingRemote] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [remoteManifestId, setRemoteManifestId] = useState('');
  const [remoteRevision, setRemoteRevision] = useState<number | undefined>(undefined);
  const [remoteReadOnly, setRemoteReadOnly] = useState(readOnly);
  const [remoteStale, setRemoteStale] = useState(outageStale);
  const [remoteUnavailable, setRemoteUnavailable] = useState(false);
  const [remoteLastSyncedAt, setRemoteLastSyncedAt] = useState<string | null>(outageLastSyncedAt);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [showVectorStudio, setShowVectorStudio] = useState(false);
  const [vectorPrompt, setVectorPrompt] = useState(() => t('assetLibrary.defaultPrompt'));
  const [vectorCategory, setVectorCategory] = useState<'logos' | 'icons'>('logos');
  const [candidates, setCandidates] = useState<AgentAssetCandidate[]>([]);

  useEffect(() => {
    setAssets(assetRepository.getAssets(project.project_id));
    return assetRepository.subscribe(project.project_id, (updated) => {
      setAssets(updated);
    });
  }, [project.project_id]);

  const loadRemoteAssets = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingRemote(true);
    setRemoteUnavailable(false);
    try {
      const res = await workspaceHierarchyClient.listProjectAssets(
        accessToken,
        project.project_id
      );
      setRemoteManifestId(res.manifestFileId || '');
      setRemoteRevision(res.revision);
      setRemoteReadOnly(Boolean(readOnly || res.readOnly));
      setRemoteStale(Boolean(outageStale || res.stale));
      setRemoteLastSyncedAt(res.lastSyncedAt ?? outageLastSyncedAt ?? null);
      if (res.assets && res.assets.length > 0) {
        const merged = assetRepository.mergeRemoteAssets(project.project_id, res.assets);
        setAssets(merged);
      }
    } catch (err) {
      if (
        err instanceof WorkerApiError &&
        (err.status === 503 || err.code === 'WRITE_DISABLED_OAUTH_UNAVAILABLE')
      ) {
        setRemoteUnavailable(true);
        setRemoteReadOnly(true);
      }
      setErrorBanner(err instanceof Error ? err.message : 'Unable to list Project Drive assets.');
    } finally {
      setIsLoadingRemote(false);
    }
  }, [accessToken, project.project_id, readOnly, outageStale, outageLastSyncedAt]);

  useEffect(() => {
    void loadRemoteAssets();
  }, [loadRemoteAssets]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assets.filter((asset) => {
      const resolvedCat: AssetCategory =
        asset.category ||
        (asset.mimeType?.includes('svg')
          ? 'icons'
          : asset.type === 'video' || asset.type === 'audio'
          ? 'video-audio'
          : 'images');
      if (categoryFilter !== 'all' && resolvedCat !== categoryFilter) return false;
      if (!q) return true;
      return (
        asset.name.toLowerCase().includes(q) ||
        (asset.altText || '').toLowerCase().includes(q) ||
        (asset.tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [assets, categoryFilter, searchQuery]);

  const inspectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  const driveSyncedCount = useMemo(
    () =>
      assets.filter(
        (a) => a.driveFileId && !a.driveFileId.startsWith('local_') && !a.driveFileId.startsWith('drv_agent_')
      ).length,
    [assets]
  );

  const authenticatedOutage = Boolean(
    readOnly ||
      remoteReadOnly ||
      remoteUnavailable ||
      project.status === 'archived' ||
      (accessToken && (!googleWorkspaceConnected || googleWorkspaceNeedsReauth))
  );
  const canUploadRemote = Boolean(
    googleWorkspaceConnected && !googleWorkspaceNeedsReauth && accessToken && !authenticatedOutage
  );

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (authenticatedOutage) {
      setErrorBanner(t('console.outage.readOnlyDesc'));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setErrorBanner(null);
    setNotice(null);
    setIsUploading(true);

    try {
      for (const file of Array.from(files)) {
        const localRes = await processAndSaveUploadedAsset({
          file,
          preferredCategory: categoryFilter !== 'all' ? categoryFilter : undefined,
        });
        if (localRes.error || !localRes.asset) {
          setErrorBanner(localRes.error || 'Asset validation failed.');
          continue;
        }

        const validated = localRes.asset;
        if (canUploadRemote) {
          try {
            const base64Data =
              validated.mimeType === 'image/svg+xml' ? undefined : await fileToBase64(file);
            const remoteRes = await workspaceHierarchyClient.uploadProjectAsset(
              accessToken,
              project.project_id,
                {
                  ...(remoteRevision !== undefined ? { expectedRevision: remoteRevision } : {}),
                  name: validated.name,
                  mimeType: validated.mimeType || 'image/png',
                  category: validated.category || 'images',
                  altText: validated.altText,
                  licenseNote: validated.licenseNote,
                  sourceOrigin: validated.sourceOrigin,
                  tags: validated.tags,
                  dimensions: validated.dimensions,
                  svgMarkup: validated.svgMarkup,
                  base64Data,
                }
              );
              if (remoteRes.revision !== undefined) setRemoteRevision(remoteRes.revision);
              const mergedAsset: MediaAsset = {
                ...remoteRes.asset,
                url: validated.svgMarkup
                  ? validated.url
                  : validated.url || remoteRes.asset.url,
              };
              const next = assetRepository.addAsset(project.project_id, mergedAsset);
              setAssets(next);
              setSelectedAssetId(mergedAsset.id);
              setRemoteManifestId(remoteRes.manifestFileId || '');
              setNotice(t('console.assets.uploadedDriveSuccess', { name: mergedAsset.name }));
            } catch (uploadErr) {
              if (uploadErr instanceof WorkerApiError && uploadErr.status === 503) {
                setRemoteReadOnly(true);
              }
              setErrorBanner(
                uploadErr instanceof Error ? uploadErr.message : 'Drive asset upload failed.'
              );
            }
          } else if (!accessToken) {
            const next = assetRepository.addAsset(project.project_id, validated);
            setAssets(next);
            setSelectedAssetId(validated.id);
            setNotice(t('console.assets.savedLocalSuccess', { name: validated.name }));
          }
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateVectors = (e: React.FormEvent) => {
    e.preventDefault();
    setCandidates(generateAgentAssetCandidates(vectorPrompt, vectorCategory));
  };

  const handleApproveVectorCandidate = async (candidate: AgentAssetCandidate) => {
    if (authenticatedOutage) {
      setErrorBanner(t('console.outage.readOnlyDesc'));
      return;
    }
    setErrorBanner(null);
    const localRes = createAssetFromAgentCandidate(candidate);
    if (localRes.error || !localRes.asset) {
      setErrorBanner(localRes.error || t('assetLibrary.couldNotApprove'));
      return;
    }
    const created = localRes.asset;

    if (canUploadRemote) {
      try {
        const remoteRes = await workspaceHierarchyClient.uploadProjectAsset(
          accessToken,
          project.project_id,
          {
            ...(remoteRevision !== undefined ? { expectedRevision: remoteRevision } : {}),
            name: created.name,
            mimeType: 'image/svg+xml',
            category: created.category || vectorCategory,
            altText: created.altText,
            licenseNote: created.licenseNote,
            sourceOrigin: 'agent-generated',
            tags: created.tags,
            svgMarkup: created.svgMarkup,
          }
        );
        if (remoteRes.revision !== undefined) setRemoteRevision(remoteRes.revision);
        const merged = { ...remoteRes.asset, url: created.url };
        setAssets(assetRepository.addAsset(project.project_id, merged));
        setSelectedAssetId(merged.id);
        setNotice(t('console.assets.uploadedDriveSuccess', { name: merged.name }));
      } catch (err) {
        if (err instanceof WorkerApiError && err.status === 503) {
          setRemoteReadOnly(true);
        }
        setErrorBanner(err instanceof Error ? err.message : 'Failed to save SVG to Drive.');
        return;
      }
    } else if (!accessToken) {
      setAssets(assetRepository.addAsset(project.project_id, created));
      setSelectedAssetId(created.id);
      setNotice(t('console.assets.savedLocalSuccess', { name: created.name }));
    }

    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteAsset) return;
    if (authenticatedOutage) {
      setErrorBanner(t('console.outage.readOnlyDesc'));
      return;
    }
    setIsDeleting(true);
    setErrorBanner(null);
    try {
      const isRemote =
        canUploadRemote &&
        confirmDeleteAsset.driveFileId &&
        !confirmDeleteAsset.driveFileId.startsWith('local_') &&
        !confirmDeleteAsset.driveFileId.startsWith('drv_agent_');

      if (isRemote) {
        const delRes = await workspaceHierarchyClient.deleteProjectAsset(
          accessToken,
          project.project_id,
          confirmDeleteAsset.id,
          { ...(remoteRevision !== undefined ? { expectedRevision: remoteRevision } : {}) }
        );
        if (delRes.revision !== undefined) setRemoteRevision(delRes.revision);
      }

      const remaining = assetRepository.deleteAsset(project.project_id, confirmDeleteAsset.id);
      setAssets(remaining);
      if (selectedAssetId === confirmDeleteAsset.id) {
        setSelectedAssetId(null);
      }
      setNotice(t('console.assets.deletedToast', { name: confirmDeleteAsset.name }));
      setConfirmDeleteAsset(null);
    } catch (err) {
      if (err instanceof WorkerApiError && err.status === 503) {
        setRemoteReadOnly(true);
      }
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete asset.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      <ProjectModuleHeader
        organization={organization}
        project={project}
        modules={modules}
        activeModule="assets"
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
              {t('console.assets.heading')}
            </h1>
            <p className="text-xs sm:text-sm text-[#4A435C]">
              {t('console.assets.subtitle', { projectName: project.name })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.svg,.webp,.mp4,.webm,.mp3,.wav,.woff,.woff2,.pdf"
              onChange={handleFilesSelected}
              className="hidden"
            />
            <button
              type="button"
              disabled={isLoadingRemote}
              onClick={() => void loadRemoteAssets()}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-white hover:bg-[#F7F6FA] text-xs font-semibold text-[#211B2E] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isLoadingRemote ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{t('common.refresh')}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowVectorStudio((v) => !v)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                showVectorStudio
                  ? 'bg-[#211B2E] text-white border-[#211B2E]'
                  : 'bg-white border-[#211B2E]/15 text-[#211B2E] hover:bg-[#F7F6FA]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#6C2CEB]" />
              <span>{t('assetLibrary.vectorStudio')}</span>
            </button>
            <button
              type="button"
              disabled={isUploading || authenticatedOutage}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>
                {isUploading ? t('assetLibrary.validating') : t('assetLibrary.uploadAsset')}
              </span>
            </button>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-[#211B2E]/10 bg-white rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#211B2E]/10">
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.assets.totalStat')}</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
              {assets.length}
            </div>
          </div>
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.assets.driveSyncedStat')}</div>
            <div className="text-lg font-semibold font-mono tabular-nums text-[#211B2E]">
              {driveSyncedCount}
            </div>
          </div>
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.assets.drivePathLabel')}</div>
            <div className="text-xs font-mono text-[#211B2E] truncate pt-1">
              Builly/{organization.org_slug}/{project.project_slug}/Assets/
            </div>
          </div>
          <div className="p-4 space-y-1">
            <div className="text-xs text-[#574F6B]">{t('console.assets.storageModeLabel')}</div>
            <div className="text-xs font-semibold text-[#211B2E] pt-1">
              {canUploadRemote
                ? remoteManifestId
                  ? t('console.assets.driveActiveManifest')
                  : t('console.assets.driveConnectedReady')
                : t('console.assets.localPreviewOnly')}
            </div>
          </div>
        </div>

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
                onClick={() => void loadRemoteAssets()}
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

        {showVectorStudio && (
          <section className="rounded-xl border border-[#211B2E]/12 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[#211B2E]">
                  {t('assetLibrary.brandGeneratorTitle')}
                </h2>
                <p className="text-xs text-[#4A435C] mt-0.5">
                  {t('assetLibrary.brandGeneratorDesc')}
                </p>
              </div>
              <span className="text-xs font-mono text-[#574F6B]">
                {t('assetLibrary.approvalRequired')}
              </span>
            </div>

            <form onSubmit={handleGenerateVectors} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={vectorPrompt}
                onChange={(e) => setVectorPrompt(e.target.value)}
                placeholder={t('assetLibrary.brandPromptPlaceholder')}
                className="flex-1 min-w-[220px] min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-xs"
              />
              <select
                value={vectorCategory}
                onChange={(e) => setVectorCategory(e.target.value as 'logos' | 'icons')}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-xs bg-white"
              >
                <option value="logos">{t('assetLibrary.logoMarksOption')}</option>
                <option value="icons">{t('assetLibrary.vectorGraphicsOption')}</option>
              </select>
              <button
                type="submit"
                className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold"
              >
                {t('assetLibrary.generateCandidatesBtn')}
              </button>
            </form>

            {candidates.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#211B2E]/10">
                {candidates.map((cand) => (
                  <div
                    key={cand.id}
                    className="rounded-lg border border-[#211B2E]/12 p-3 flex flex-col justify-between gap-3 bg-[#F7F6FA]"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={cand.previewDataUrl}
                        alt={cand.name}
                        className="w-12 h-12 rounded border border-[#211B2E]/15 bg-white object-contain shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#211B2E] truncate">
                          {cand.name}
                        </div>
                        <div className="text-[11px] text-[#574F6B] line-clamp-2">
                          {cand.description}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleApproveVectorCandidate(cand)}
                      className="min-h-[34px] px-3 py-1 rounded bg-[#211B2E] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('assetLibrary.approveAndSave')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Filter & Search Bar + Grid + Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-8 rounded-xl border border-[#211B2E]/10 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#574F6B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('assetLibrary.searchPlaceholder')}
                  className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto">
                {ASSET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap ${
                      categoryFilter === cat
                        ? 'bg-[#211B2E] text-white border-[#211B2E]'
                        : 'bg-white border-[#211B2E]/12 text-[#4A435C] hover:bg-[#F7F6FA]'
                    }`}
                  >
                    {t(`assetLibrary.categories.${cat}`)}
                  </button>
                ))}
              </div>
            </div>

            {filteredAssets.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-[#211B2E]/15 rounded-xl">
                <FolderOpen className="w-8 h-8 text-[#574F6B]/50 mx-auto" />
                <div className="text-sm font-semibold text-[#211B2E]">
                  {t('assetLibrary.noMatchingTitle')}
                </div>
                <p className="text-xs text-[#4A435C]">{t('assetLibrary.noMatchingDesc')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredAssets.map((asset) => {
                  const isSelected = selectedAssetId === asset.id;
                  const isVisual = asset.type === 'image' || asset.mimeType?.startsWith('image/');
                  return (
                    <div
                      key={asset.id}
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`rounded-xl border p-3 space-y-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-[#6C2CEB] bg-[#F4EFFF]'
                          : 'border-[#211B2E]/10 bg-white hover:bg-[#F7F6FA]'
                      }`}
                    >
                      <div className="h-28 rounded-lg bg-[#F7F6FA] border border-[#211B2E]/8 flex items-center justify-center overflow-hidden">
                        {isVisual && asset.url && !asset.url.startsWith('/api/') ? (
                          <img
                            src={asset.url}
                            alt={asset.altText || asset.name}
                            className="w-full h-full object-contain"
                          />
                        ) : isVisual && asset.svgMarkup ? (
                          <img
                            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.svgMarkup)}`}
                            alt={asset.altText || asset.name}
                            className="w-full h-full object-contain"
                          />
                        ) : asset.type === 'video' ? (
                          <Film className="w-7 h-7 text-[#574F6B]" />
                        ) : asset.type === 'audio' ? (
                          <Music className="w-7 h-7 text-[#574F6B]" />
                        ) : asset.category === 'fonts' ? (
                          <Type className="w-7 h-7 text-[#574F6B]" />
                        ) : asset.type === 'document' ? (
                          <FileText className="w-7 h-7 text-[#574F6B]" />
                        ) : (
                          <ImageIcon className="w-7 h-7 text-[#574F6B]" />
                        )}
                      </div>

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#211B2E] truncate">
                            {asset.name}
                          </div>
                          <div className="text-[11px] font-mono text-[#574F6B] tabular-nums">
                            {asset.size} · {asset.category || asset.type}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={authenticatedOutage}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteAsset(asset);
                          }}
                          aria-label={`${t('common.delete')} ${asset.name}`}
                          className="p-1.5 rounded text-[#574F6B] hover:text-red-700 hover:bg-red-50 shrink-0 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Inspector Panel */}
          <aside className="lg:col-span-4 rounded-xl border border-[#211B2E]/10 bg-white p-5 space-y-4 h-fit">
            <h2 className="text-sm font-semibold text-[#211B2E]">
              {t('console.assets.inspectorHeading')}
            </h2>

            {inspectedAsset ? (
              <div className="space-y-3 text-xs">
                <div className="font-semibold text-[#211B2E] break-all">{inspectedAsset.name}</div>
                <div className="grid grid-cols-2 gap-2 py-2 border-y border-[#211B2E]/10 font-mono text-[11px] tabular-nums">
                  <span className="text-[#574F6B]">{t('common.type')}</span>
                  <span className="text-right text-[#211B2E]">
                    {inspectedAsset.mimeType || inspectedAsset.type}
                  </span>
                  <span className="text-[#574F6B]">{t('console.assets.sizeLabel')}</span>
                  <span className="text-right text-[#211B2E]">{inspectedAsset.size}</span>
                  <span className="text-[#574F6B]">Drive ID</span>
                  <span className="text-right text-[#211B2E] truncate">
                    {inspectedAsset.driveFileId || '—'}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-[#211B2E]">
                    {t('assetLibrary.altTextLabel')}
                  </label>
                  <input
                    type="text"
                    value={inspectedAsset.altText || ''}
                    onChange={(e) => {
                      const next = assetRepository.updateAsset(project.project_id, {
                        ...inspectedAsset,
                        altText: e.target.value,
                        updatedAt: new Date().toISOString(),
                      });
                      setAssets(next);
                    }}
                    className="w-full min-h-[36px] px-3 py-1.5 rounded-lg border border-[#211B2E]/20 text-xs"
                  />
                </div>

                {inspectedAsset.driveFolder && (
                  <div className="text-[11px] font-mono text-[#574F6B] break-all">
                    {inspectedAsset.driveFolder}
                  </div>
                )}

                <button
                  type="button"
                  disabled={authenticatedOutage}
                  onClick={() => setConfirmDeleteAsset(inspectedAsset)}
                  className="w-full min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('common.delete')}</span>
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.assets.inspectorEmpty')}
              </p>
            )}
          </aside>
        </div>

        {/* Inline Confirmation Dialog for Destructive Deletion */}
        {confirmDeleteAsset && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 bg-[#211B2E]/50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-xl border border-[#211B2E]/15 max-w-md w-full p-5 space-y-4">
              <h3 className="font-['Outfit',sans-serif] text-base font-semibold text-[#211B2E]">
                {t('console.assets.confirmDeleteTitle', { name: confirmDeleteAsset.name })}
              </h3>
              <p className="text-xs text-[#4A435C] leading-relaxed">
                {t('console.assets.confirmDeleteDesc')}
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setConfirmDeleteAsset(null)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#211B2E]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleConfirmDelete()}
                  className="min-h-[36px] px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t('common.delete')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
