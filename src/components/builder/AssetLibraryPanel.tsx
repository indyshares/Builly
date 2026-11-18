import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AssetCategory,
  ElementNode,
  GoogleWorkspaceState,
  MediaAsset,
  SiteDocument,
} from '../../types/builder';
import {
  AgentAssetCandidate,
  createAssetFromAgentCandidate,
  generateAgentAssetCandidates,
  processAndSaveUploadedAsset,
} from '../../services/assetService';
import { getGoogleAccessToken } from '../../services/googleAuthService';
import { ENV_CONFIG } from '../../config/env';
import {
  AlertCircle,
  Check,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Music,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';

interface AssetLibraryPanelProps {
  site: SiteDocument;
  workspace: GoogleWorkspaceState;
  selectedNode: ElementNode | null;
  onAddAsset: (asset: MediaAsset) => void;
  onUpdateAsset: (asset: MediaAsset) => void;
  onDeleteAsset: (assetId: string) => void;
  onApplyAssetToSelection: (asset: MediaAsset) => void;
}

const ASSET_CATEGORY_IDS: ('all' | AssetCategory)[] = [
  'all',
  'images',
  'logos',
  'icons',
  'video-audio',
  'fonts',
  'documents',
];

export const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({
  site,
  workspace,
  selectedNode,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onApplyAssetToSelection,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categoryFilter, setCategoryFilter] = useState<'all' | AssetCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Agent-Assisted Asset Workflow state
  const [showAgentAssistant, setShowAgentAssistant] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState(() => t('assetLibrary.defaultPrompt'));
  const [agentTargetCategory, setAgentTargetCategory] = useState<'logos' | 'icons'>('logos');
  const [candidates, setCandidates] = useState<AgentAssetCandidate[]>([]);

  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return site.mediaAssets.filter((asset) => {
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
  }, [site.mediaAssets, categoryFilter, searchQuery]);

  const inspectedAsset = useMemo(
    () => site.mediaAssets.find((a) => a.id === selectedAssetId) || null,
    [site.mediaAssets, selectedAssetId]
  );

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);
    setIsUploading(true);

    try {
      const accessToken = workspace.connected ? getGoogleAccessToken() : null;
      for (const file of Array.from(files)) {
        const res = await processAndSaveUploadedAsset({
          file,
          preferredCategory: categoryFilter !== 'all' ? categoryFilter : undefined,
          accessToken,
          driveFolderId: workspace.driveFolder.id || undefined,
        });
        if (res.error) {
          setUploadError(res.error);
        } else if (res.asset) {
          onAddAsset(res.asset);
          setSelectedAssetId(res.asset.id);
        }
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleGenerateCandidates = (e: React.FormEvent) => {
    e.preventDefault();
    const list = generateAgentAssetCandidates(agentPrompt, agentTargetCategory);
    setCandidates(list);
  };

  const handleApproveCandidate = (candidate: AgentAssetCandidate, alsoInsert: boolean) => {
    const res = createAssetFromAgentCandidate(candidate);
    if (res.error || !res.asset) {
      setUploadError(res.error || t('assetLibrary.couldNotApprove'));
      return;
    }
    onAddAsset(res.asset);
    setSelectedAssetId(res.asset.id);
    if (alsoInsert) {
      onApplyAssetToSelection(res.asset);
    }
    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
  };

  const canDirectApply = Boolean(
    selectedNode &&
      ['image', 'logo', 'icon', 'svg-graphic', 'video', 'audio', 'background-media'].includes(
        selectedNode.type
      )
  );

  return (
    <div className="space-y-3.5">
      {/* Header Action Bar */}
      <div className="grid grid-cols-2 gap-1.5">
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
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
        >
          <Upload className="w-3.5 h-3.5 shrink-0" />
          <span>{isUploading ? t('assetLibrary.validating') : t('assetLibrary.uploadAsset')}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowAgentAssistant((prev) => !prev)}
          className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border whitespace-nowrap ${
            showAgentAssistant
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>{t('assetLibrary.vectorStudio')}</span>
        </button>
      </div>

      {uploadError && (
        <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-[11px] text-red-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Agent-Assisted Asset Workflow (Explicit User Approval Required) */}
      {showAgentAssistant && (
        <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-indigo-950">
              {t('assetLibrary.brandGeneratorTitle')}
            </span>
            <span className="text-[10px] font-mono text-indigo-700">{t('assetLibrary.approvalRequired')}</span>
          </div>
          <p className="text-[11px] text-indigo-900 leading-snug">
            {t('assetLibrary.brandGeneratorDesc')}
          </p>
          <form onSubmit={handleGenerateCandidates} className="space-y-2">
            <input
              type="text"
              value={agentPrompt}
              onChange={(e) => setAgentPrompt(e.target.value)}
              placeholder={t('assetLibrary.brandPromptPlaceholder')}
              className="w-full min-h-[36px] text-xs px-2.5 py-1 border border-indigo-200 rounded-md bg-white"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={agentTargetCategory}
                onChange={(e) => setAgentTargetCategory(e.target.value as 'logos' | 'icons')}
                className="min-h-[36px] text-xs px-2 py-1 border border-indigo-200 rounded-md bg-white"
              >
                <option value="logos">{t('assetLibrary.logoMarksOption')}</option>
                <option value="icons">{t('assetLibrary.vectorGraphicsOption')}</option>
              </select>
              <button
                type="submit"
                className="flex-1 min-h-[36px] px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-semibold whitespace-nowrap"
              >
                {t('assetLibrary.generateCandidatesBtn')}
              </button>
            </div>
          </form>

          {candidates.length > 0 && (
            <div className="space-y-2 pt-1">
              {candidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-2.5 rounded-lg border border-indigo-200 bg-white space-y-2"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={cand.previewDataUrl}
                      alt={cand.name}
                      className="w-12 h-12 rounded border border-slate-200 bg-slate-50 object-contain shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">{cand.name}</div>
                      <div className="text-[10px] text-slate-500">{cand.provenance}</div>
                      <div className="text-[10px] font-mono text-emerald-700">{cand.license}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApproveCandidate(cand, false)}
                      className="min-h-[34px] px-2 py-1 border border-slate-200 hover:bg-slate-50 rounded text-[11px] font-semibold text-slate-800 flex items-center justify-center gap-1"
                    >
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span>{t('assetLibrary.approveAndSave')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveCandidate(cand, true)}
                      className="min-h-[34px] px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-semibold whitespace-nowrap"
                    >
                      {t('assetLibrary.approveAndInsert')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & Category Tabs */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('assetLibrary.searchPlaceholder')}
          className="w-full min-h-[38px] text-xs pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {ASSET_CATEGORY_IDS.map((catId) => (
          <button
            key={catId}
            type="button"
            onClick={() => setCategoryFilter(catId)}
            className={`min-h-[30px] px-2 py-1 rounded text-[11px] transition-colors whitespace-nowrap ${
              categoryFilter === catId
                ? 'bg-slate-900 text-white font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t(`assetLibrary.categories.${catId}`)}
          </button>
        ))}
      </div>

      {/* Selected Asset Detail Inspector */}
      {inspectedAsset && (
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/35 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900 truncate">{inspectedAsset.name}</div>
              <div className="text-[10px] font-mono text-slate-500">
                {inspectedAsset.size}
                {inspectedAsset.dimensions
                  ? ` · ${inspectedAsset.dimensions.width}×${inspectedAsset.dimensions.height}px`
                  : ''}
                {inspectedAsset.mimeType ? ` · ${inspectedAsset.mimeType}` : ''}
              </div>
              {inspectedAsset.driveFolder && (
                <div className="text-[10px] font-mono text-blue-700 truncate">
                  {inspectedAsset.driveFolder}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDeleteAsset(inspectedAsset.id)}
              title={t('assetLibrary.removeAssetTitle')}
              className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-600 block mb-1">
              {t('assetLibrary.altTextLabel')}
            </label>
            <input
              type="text"
              value={inspectedAsset.altText || ''}
              onChange={(e) =>
                onUpdateAsset({
                  ...inspectedAsset,
                  altText: e.target.value,
                  updatedAt: new Date().toISOString(),
                })
              }
              className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
            />
          </div>

          {inspectedAsset.licenseNote && (
            <div className="text-[10px] text-slate-600 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{inspectedAsset.licenseNote}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => onApplyAssetToSelection(inspectedAsset)}
            className="w-full min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold"
          >
            {canDirectApply
              ? t('assetLibrary.applyToSelected', { name: selectedNode?.name })
              : t('assetLibrary.insertOntoPage')}
          </button>
        </div>
      )}

      {/* Assets Grid */}
      <div className="text-[11px] text-slate-500">
        {canDirectApply
          ? t('assetLibrary.gridHintApply', { name: selectedNode?.name })
          : t('assetLibrary.gridHintDefault')}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {filteredAssets.map((asset) => {
          const isSelected = asset.id === selectedAssetId;
          const isImageLike =
            asset.type === 'image' || asset.mimeType?.startsWith('image/');

          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => setSelectedAssetId(isSelected ? null : asset.id)}
              className={`text-left border rounded-lg overflow-hidden transition-all bg-white ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-100'
                  : 'border-slate-200 hover:border-blue-400'
              }`}
            >
              <div className="aspect-video relative overflow-hidden bg-slate-100 flex items-center justify-center">
                {isImageLike ? (
                  <img
                    src={asset.url}
                    alt={asset.altText || asset.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : asset.mimeType?.startsWith('video/') ? (
                  <Film className="w-6 h-6 text-slate-500" />
                ) : asset.mimeType?.startsWith('audio/') ? (
                  <Music className="w-6 h-6 text-slate-500" />
                ) : asset.category === 'fonts' ? (
                  <Type className="w-6 h-6 text-slate-500" />
                ) : (
                  <FileText className="w-6 h-6 text-slate-500" />
                )}
              </div>
              <div className="p-2">
                <span className="text-[11px] font-semibold text-slate-800 truncate block">
                  {asset.name}
                </span>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                  <span>{asset.size}</span>
                  <span>{asset.category || asset.type}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {filteredAssets.length === 0 && (
        <div className="p-4 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-center space-y-1">
          <ImageIcon className="w-5 h-5 text-slate-400 mx-auto" />
          <div className="text-xs font-semibold text-slate-700">{t('assetLibrary.noMatchingTitle')}</div>
          <p className="text-[11px] text-slate-500">
            {t('assetLibrary.noMatchingDesc')}
          </p>
        </div>
      )}

      <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
        <Layers className="w-3 h-3 shrink-0" />
        <span>
          {workspace.connected
            ? t('assetLibrary.syncDriveNotice', { folder: ENV_CONFIG.driveFolderName })
            : t('assetLibrary.savedLocallyNotice')}
        </span>
      </div>
    </div>
  );
};
