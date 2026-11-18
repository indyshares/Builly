import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ElementNode,
  GoogleWorkspaceState,
  HeaderFooterComponentDef,
  LayoutMode,
  PageDocument,
  PageLayoutSlot,
  PageStatus,
  RegionResponsiveVisibility,
  SiteDocument,
} from '../../types/builder';
import { validatePortfolioSlug } from '../../config/breakpoints';
import {
  PageCreationMethod,
  cloneElementTreeWithNewIds,
  resolvePageFullPath,
  resolvePublicPortfolioUrl,
  sortPagesForTree,
  validatePageSlug,
  wouldCreateParentCycle,
} from '../../services/pageService';
import {
  DEFAULT_REGION_VISIBILITY,
  cloneHeaderFooterAsLocal,
  createBlankHeaderFooterDef,
  getAllLibraryItems,
  getPagesReferencingGlobalComponent,
  normalizeRegionVisibility,
  resolvePageSlotComponent,
} from '../../services/componentLibraryService';
import { HEADER_PRESETS, FOOTER_PRESETS } from '../../data/headerFooterPresets';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookmarkPlus,
  Check,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FilePlus2,
  FolderInput,
  Globe,
  Home,
  LayoutTemplate,
  MoreVertical,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

export interface PageSettingsPatch {
  name: string;
  slug: string;
  parentPageId: string | null;
  navigationVisible: boolean;
  navigationLabel: string;
  status: PageStatus;
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  noIndex?: boolean;
  customCss?: string;
  customJs?: string;
}

interface PageManagementPanelProps {
  site: SiteDocument;
  activePage: PageDocument | null;
  workspace: GoogleWorkspaceState;
  isDriveSyncing: boolean;
  driveConflictRevision?: number | null;
  onSelectPage: (pageId: string) => void;
  onOpenCreateModal: (opts?: {
    forceHome?: boolean;
    method?: PageCreationMethod;
    sourcePageId?: string;
  }) => void;
  onOpenDeleteModal: (page: PageDocument) => void;
  onDuplicatePage: (pageId: string) => void;
  onRenamePage: (pageId: string, newName: string) => void;
  onSetHomePage: (pageId: string) => void;
  onMovePageOrder: (pageId: string, direction: 'up' | 'down') => void;
  onReorderPageDrop: (draggedPageId: string, targetPageId: string) => void;
  onChangePageParent: (pageId: string, parentPageId: string | null) => void;
  onTogglePageNavVisibility: (pageId: string) => void;
  onUpdatePageStatus: (pageId: string, status: PageStatus) => void;
  onSavePageSettings: (pageId: string, patch: PageSettingsPatch) => void;
  onUpdateSiteMeta: (updates: { name?: string; portfolioSlug?: string }) => void;
  onRequestDriveSync: (forceOverwrite?: boolean) => void;
  onRequestDriveLoad: () => void;
  onOpenGoogleSetup?: () => void;
  openLayoutForPageId?: string | null;
  onClearOpenLayoutTrigger?: () => void;
  onUpdatePageLayoutSlot: (
    pageId: string,
    slot: 'header' | 'footer',
    nextSlot: PageLayoutSlot
  ) => void;
  onSelectGlobalComponent: (slot: 'header' | 'footer', componentId: string) => void;
  onCreateGlobalVariant: (
    slot: 'header' | 'footer',
    name: string,
    sourceDef?: HeaderFooterComponentDef,
    presetId?: string
  ) => void;
  onRenameGlobalVariant: (slot: 'header' | 'footer', componentId: string, name: string) => void;
  onDeleteGlobalVariant: (slot: 'header' | 'footer', componentId: string) => void;
  onToggleGlobalRegionEnabled: (slot: 'header' | 'footer', componentId: string) => void;
  onToggleRegionPageEnabled: (slot: 'header' | 'footer') => void;
  onUpdateSlotVisibility: (slot: 'header' | 'footer', vis: RegionResponsiveVisibility) => void;
  onSaveSlotAsTemplate: (slot: 'header' | 'footer', rootNode: ElementNode) => void;
}

type SettingsTab = 'general' | 'layout' | 'seo' | 'advanced';

const STATUS_CLASS: Record<PageStatus, string> = {
  published: 'text-emerald-700',
  draft: 'text-amber-700',
  unpublished: 'text-slate-500',
  archived: 'text-slate-400',
};

export const PageManagementPanel: React.FC<PageManagementPanelProps> = ({
  site,
  activePage,
  workspace,
  isDriveSyncing,
  driveConflictRevision,
  onSelectPage,
  onOpenCreateModal,
  onOpenDeleteModal,
  onDuplicatePage,
  onRenamePage,
  onSetHomePage,
  onMovePageOrder,
  onReorderPageDrop,
  onChangePageParent,
  onTogglePageNavVisibility,
  onUpdatePageStatus,
  onSavePageSettings,
  onUpdateSiteMeta,
  onRequestDriveSync,
  onRequestDriveLoad,
  onOpenGoogleSetup,
  openLayoutForPageId,
  onClearOpenLayoutTrigger,
  onUpdatePageLayoutSlot,
  onSelectGlobalComponent,
  onCreateGlobalVariant,
  onRenameGlobalVariant,
  onDeleteGlobalVariant,
  onToggleGlobalRegionEnabled,
  onSaveSlotAsTemplate,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuPageId, setOpenMenuPageId] = useState<string | null>(null);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [showSiteLayoutManager, setShowSiteLayoutManager] = useState(false);
  const [renamingGlobalId, setRenamingGlobalId] = useState<string | null>(null);
  const [globalRenameDraft, setGlobalRenameDraft] = useState('');
  const [confirmDeleteGlobalId, setConfirmDeleteGlobalId] = useState<string | null>(null);

  // Portfolio slug local edit state
  const [slugInput, setSlugInput] = useState(site.portfolioSlug);
  const [slugError, setSlugError] = useState<string | null>(null);
  useEffect(() => {
    setSlugInput(site.portfolioSlug);
  }, [site.portfolioSlug]);

  // View 2: Page Settings Sub-View state
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');

  useEffect(() => {
    if (openLayoutForPageId) {
      setShowSiteLayoutManager(false);
      setSettingsPageId(openLayoutForPageId);
      setSettingsTab('layout');
      onClearOpenLayoutTrigger?.();
    }
  }, [openLayoutForPageId, onClearOpenLayoutTrigger]);

  const settingsPage = useMemo(
    () => site.pages.find((p) => p.id === settingsPageId) || null,
    [site.pages, settingsPageId]
  );

  // Settings form state synchronized when opening a page's settings
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formParentId, setFormParentId] = useState<string>('');
  const [formNavVisible, setFormNavVisible] = useState(true);
  const [formNavLabel, setFormNavLabel] = useState('');
  const [formStatus, setFormStatus] = useState<PageStatus>('draft');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCanonicalPath, setFormCanonicalPath] = useState('');
  const [formOgImage, setFormOgImage] = useState('');
  const [formNoIndex, setFormNoIndex] = useState(false);
  const [formCustomCss, setFormCustomCss] = useState('');
  const [formCustomJs, setFormCustomJs] = useState('');

  useEffect(() => {
    if (!settingsPage) return;
    setFormName(settingsPage.name);
    setFormSlug(settingsPage.slug);
    setFormParentId(settingsPage.parentPageId || '');
    setFormNavVisible(settingsPage.navigation?.visible ?? true);
    setFormNavLabel(settingsPage.navigation?.label || settingsPage.name);
    setFormStatus(settingsPage.status || 'published');
    setFormTitle(settingsPage.title || '');
    setFormDescription(settingsPage.description || '');
    setFormCanonicalPath(settingsPage.canonicalPath || '');
    setFormOgImage(settingsPage.ogImage || '');
    setFormNoIndex(Boolean(settingsPage.noIndex));
    setFormCustomCss(settingsPage.customCss || '');
    setFormCustomJs(settingsPage.customJs || '');
  }, [settingsPage?.id]);

  // Close row menu when clicking outside
  useEffect(() => {
    if (!openMenuPageId) return;
    const handleDocClick = () => setOpenMenuPageId(null);
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [openMenuPageId]);

  const sortedPages = useMemo(() => sortPagesForTree(site.pages), [site.pages]);

  // Build hierarchical display list preserving parent -> children grouping
  const orderedTreeEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      return sortedPages
        .filter((p) => {
          const fullPath = resolvePageFullPath(p, site.pages);
          return (
            p.name.toLowerCase().includes(query) ||
            fullPath.toLowerCase().includes(query) ||
            (p.status || 'published').toLowerCase().includes(query)
          );
        })
        .map((page) => ({ page, depth: page.parentPageId ? 1 : 0 }));
    }

    const result: { page: PageDocument; depth: number }[] = [];
    const visited = new Set<string>();

    const appendSubtree = (page: PageDocument, depth: number) => {
      if (visited.has(page.id)) return;
      visited.add(page.id);
      result.push({ page, depth });
      const children = sortedPages.filter((c) => c.parentPageId === page.id);
      children.forEach((child) => appendSubtree(child, Math.min(depth + 1, 2)));
    };

    const topLevel = sortedPages.filter(
      (p) => !p.parentPageId || !sortedPages.some((parent) => parent.id === p.parentPageId)
    );
    topLevel.forEach((p) => appendSubtree(p, 0));
    sortedPages.forEach((p) => appendSubtree(p, 0));
    return result;
  }, [sortedPages, site.pages, searchQuery]);

  // PAGE SETTINGS SUB-VIEW (View 2)
  if (settingsPage) {
    const isHome = Boolean(settingsPage.isHome);
    const slugValidation = validatePageSlug(
      isHome ? '/' : formSlug,
      site.pages,
      settingsPage.id,
      isHome ? null : formParentId || null,
      isHome
    );
    const parentCandidates = sortedPages.filter(
      (p) =>
        p.id !== settingsPage.id &&
        !wouldCreateParentCycle(settingsPage.id, p.id, site.pages) &&
        p.status !== 'archived'
    );
    const originalFullPath = resolvePageFullPath(settingsPage, site.pages);
    const slugChanged =
      !isHome && slugValidation.valid && slugValidation.fullPath !== originalFullPath;

    const handleSaveSettings = (e: React.FormEvent) => {
      e.preventDefault();
      if (!slugValidation.valid || !formName.trim()) return;
      onSavePageSettings(settingsPage.id, {
        name: formName.trim(),
        slug: isHome ? '/' : slugValidation.normalized,
        parentPageId: isHome ? null : formParentId || null,
        navigationVisible: formNavVisible,
        navigationLabel: formNavLabel.trim() || formName.trim(),
        status: formStatus,
        title: formTitle.trim() || `${formName.trim()} — ${site.name}`,
        description: formDescription.trim(),
        canonicalPath: formCanonicalPath.trim() || undefined,
        ogImage: formOgImage.trim() || undefined,
        noIndex: formNoIndex,
        customCss: formCustomCss,
        customJs: formCustomJs,
      });
      setSettingsPageId(null);
    };

    const previewTitle = formTitle.trim() || `${formName || settingsPage.name} — ${site.name}`;
    const previewDesc =
      formDescription.trim() ||
      t('pagesPanel.settings.defaultMetaDesc');

    return (
      <form onSubmit={handleSaveSettings} className="space-y-4">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setSettingsPageId(null)}
            className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-md flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('pagesPanel.settings.backToPages')}</span>
          </button>
          <span className="text-[11px] font-mono text-slate-500 truncate">
            {t('pagesPanel.settings.revLabel', { rev: settingsPage.revision ?? 1 })}
          </span>
        </div>

        <div>
          <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
            {isHome && <Home className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
            <span>{settingsPage.name}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
            {resolvePublicPortfolioUrl(site.portfolioSlug, originalFullPath)}
          </div>
        </div>

        {/* Settings Sub-tabs */}
        <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
          {(
            [
              { id: 'general', label: t('pagesPanel.settings.tabs.general') },
              { id: 'layout', label: t('pagesPanel.settings.tabs.layout') },
              { id: 'seo', label: t('pagesPanel.settings.tabs.seo') },
              { id: 'advanced', label: t('pagesPanel.settings.tabs.advanced') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`min-h-[34px] rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                settingsTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* GENERAL TAB */}
        {settingsTab === 'general' && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                {t('pagesPanel.settings.pageNameLabel')}
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                {t('pagesPanel.settings.urlSlugLabel')}
              </label>
              <input
                type="text"
                disabled={isHome}
                value={isHome ? '/' : formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white font-mono disabled:bg-slate-100 disabled:text-slate-500"
              />
              {!slugValidation.valid && (
                <div className="flex items-center gap-1 text-[11px] text-red-600 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{slugValidation.error}</span>
                </div>
              )}
              {slugValidation.valid && (
                <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">
                  {resolvePublicPortfolioUrl(site.portfolioSlug, slugValidation.fullPath)}
                </div>
              )}
              {slugChanged && (
                <div className="mt-1.5 p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                  {t('pagesPanel.settings.slugRedirectPrefix')}{' '}
                  <code className="font-mono">{originalFullPath}</code>{' '}
                  {t('pagesPanel.settings.slugRedirectSuffix')}
                </div>
              )}
            </div>

            {!isHome && (
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  {t('pagesPanel.settings.parentPageLabel')}
                </label>
                <select
                  value={formParentId}
                  onChange={(e) => setFormParentId(e.target.value)}
                  className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white"
                >
                  <option value="">{t('pagesPanel.settings.topLevelOption')}</option>
                  {parentCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  {t('pagesPanel.settings.publicationStatusLabel')}
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as PageStatus)}
                  className="w-full min-h-[38px] text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white"
                >
                  <option value="published">{t('pagesPanel.status.published')}</option>
                  <option value="draft">{t('pagesPanel.status.draft')}</option>
                  <option value="unpublished">{t('pagesPanel.status.unpublished')}</option>
                  <option value="archived">{t('pagesPanel.status.archived')}</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  {t('pagesPanel.settings.navLabelLabel')}
                </label>
                <input
                  type="text"
                  value={formNavLabel}
                  onChange={(e) => setFormNavLabel(e.target.value)}
                  placeholder={formName}
                  className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 border border-slate-200 rounded-md bg-slate-50 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={formNavVisible}
                onChange={(e) => setFormNavVisible(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>{t('pagesPanel.settings.showInNav')}</span>
            </label>

            {!isHome && (
              <button
                type="button"
                onClick={() => {
                  onSetHomePage(settingsPage.id);
                  setSettingsPageId(null);
                }}
                className="w-full min-h-[38px] px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5 text-blue-600" />
                <span>{t('pagesPanel.settings.designateHome')}</span>
              </button>
            )}
          </div>
        )}

        {/* LAYOUT TAB (Per-page Header & Footer Slots) */}
        {settingsTab === 'layout' && (
          <div className="space-y-4">
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
              {t('pagesPanel.settings.layoutIntroPrefix')} <strong>{settingsPage.name}</strong>.{' '}
              {t('pagesPanel.settings.layoutIntroSuffix')}
            </div>

            {(['header', 'footer'] as const).map((slotKey) => {
              const slotVal = settingsPage.layout?.[slotKey] || {
                mode: 'global' as LayoutMode,
                enabled: true,
                globalComponentId: null,
                localComponentId: null,
                localComponent: null,
                responsiveVisibility: { ...DEFAULT_REGION_VISIBILITY },
              };
              const resolved = resolvePageSlotComponent(settingsPage, site, slotKey);
              const templates = getAllLibraryItems(site).filter(
                (i) => i.type === (slotKey === 'header' ? 'header-template' : 'footer-template')
              );
              const globalList =
                slotKey === 'header'
                  ? site.globalComponents?.headers || []
                  : site.globalComponents?.footers || [];
              const siteActiveId =
                slotKey === 'header'
                  ? site.globalComponents?.activeHeaderId
                  : site.globalComponents?.activeFooterId;
              const activeGlobal =
                globalList.find(
                  (c) => c.componentId === (slotVal.globalComponentId || siteActiveId)
                ) || globalList[0];
              const slotVisibility = normalizeRegionVisibility(slotVal.responsiveVisibility);
              const slotEnabled = slotVal.enabled !== false;

              const handleModeChange = (mode: LayoutMode) => {
                if (mode === 'global') {
                  onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                    ...slotVal,
                    mode: 'global',
                    enabled: slotEnabled,
                    responsiveVisibility: slotVisibility,
                    localComponentId: slotVal.localComponentId || null,
                    localComponent: slotVal.localComponent || null,
                  });
                } else if (mode === 'none') {
                  onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                    ...slotVal,
                    mode: 'none',
                    enabled: slotEnabled,
                    responsiveVisibility: slotVisibility,
                    localComponentId: slotVal.localComponentId || null,
                    localComponent: slotVal.localComponent || null,
                  });
                } else {
                  const existingLocal = slotVal.localComponent;
                  const nextLocal =
                    existingLocal ||
                    (activeGlobal
                      ? cloneHeaderFooterAsLocal(
                          activeGlobal,
                          `${settingsPage.name} ${slotKey === 'header' ? 'Header' : 'Footer'}`
                        )
                      : createBlankHeaderFooterDef(
                          slotKey,
                          `${settingsPage.name} ${slotKey === 'header' ? 'Header' : 'Footer'}`
                        ));
                  onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                    ...slotVal,
                    mode: 'local',
                    enabled: slotEnabled,
                    responsiveVisibility: slotVisibility,
                    localComponentId: nextLocal.componentId,
                    localComponent: nextLocal,
                  });
                }
              };

              const slotLabel = t(`pagesPanel.settings.slotNames.${slotKey}`);

              return (
                <div
                  key={slotKey}
                  className="p-3 rounded-lg border border-slate-200 bg-white space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {t('pagesPanel.settings.slotTitle', { slot: slotLabel })}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {t(`pagesPanel.settings.modes.${slotVal.mode}`).toUpperCase()}
                      {slotVal.mode !== 'none' && !slotEnabled
                        ? t('pagesPanel.settings.disabledOnPageBadge')
                        : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-md">
                    {(['global', 'local', 'none'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleModeChange(m)}
                        className={`min-h-[34px] rounded text-[11px] font-semibold transition-colors ${
                          slotVal.mode === m
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:bg-white'
                        }`}
                      >
                        {t(`pagesPanel.settings.modes.${m}`)}
                      </button>
                    ))}
                  </div>

                  {slotVal.mode !== 'none' && (
                    <div className="space-y-2 pt-1">
                      <label className="flex items-center justify-between gap-2 min-h-[34px] px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-800 cursor-pointer">
                        <span>{t('pagesPanel.settings.enabledOnThisPage')}</span>
                        <input
                          type="checkbox"
                          checked={slotEnabled}
                          onChange={(e) =>
                            onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                              ...slotVal,
                              enabled: e.target.checked,
                            })
                          }
                          className="w-4 h-4 rounded text-slate-900"
                        />
                      </label>

                      <div className="space-y-1">
                        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                          {t('pagesPanel.settings.breakpointVisibility')}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {(['desktop', 'tablet', 'mobile'] as const).map((bp) => (
                            <label
                              key={bp}
                              className="flex items-center gap-1.5 min-h-[30px] px-2 rounded border border-slate-200 bg-white text-[11px] text-slate-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={slotVisibility[bp]}
                                onChange={(e) =>
                                  onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                                    ...slotVal,
                                    responsiveVisibility: {
                                      ...slotVisibility,
                                      [bp]: e.target.checked,
                                    },
                                  })
                                }
                                className="rounded text-slate-900"
                              />
                              <span>{t(`pagesPanel.settings.breakpoints.${bp}`)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {slotVal.mode === 'global' && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                          {t('pagesPanel.settings.globalVariantLabel', { slot: slotLabel })}
                        </label>
                        <select
                          value={slotVal.globalComponentId || ''}
                          onChange={(e) =>
                            onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                              ...slotVal,
                              globalComponentId: e.target.value || null,
                            })
                          }
                          className="w-full min-h-[34px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                        >
                          <option value="">
                            {t('pagesPanel.settings.siteDefaultOption', {
                              name:
                                globalList.find((g) => g.componentId === siteActiveId)?.name ||
                                t('pagesPanel.settings.primaryFallback'),
                            })}
                          </option>
                          {globalList.map((g) => (
                            <option key={g.componentId} value={g.componentId}>
                              {g.name}
                              {g.enabled === false ? t('pagesPanel.settings.disabledSiteWideSuffix') : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      {activeGlobal?.enabled === false && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                          {t('pagesPanel.settings.disabledSiteWideAlert', { slot: slotLabel })}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsPageId(null);
                          setShowSiteLayoutManager(true);
                        }}
                        className="w-full min-h-[36px] px-2.5 py-1.5 border border-slate-200 rounded-md bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 flex items-center justify-center gap-1.5"
                      >
                        <LayoutTemplate className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{t('pagesPanel.settings.manageGlobalChrome')}</span>
                      </button>
                    </div>
                  )}

                  {slotVal.mode === 'local' && (
                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] text-slate-700 font-medium">
                        {t('pagesPanel.settings.localComponentLabel')}{' '}
                        <span className="font-semibold text-slate-900">
                          {slotVal.localComponent?.name || t('pagesPanel.settings.noneOption')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {activeGlobal && (
                          <button
                            type="button"
                            onClick={() => {
                              const cloned = cloneHeaderFooterAsLocal(
                                activeGlobal,
                                `${settingsPage.name} ${slotKey === 'header' ? 'Header' : 'Footer'}`
                              );
                              onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                                mode: 'local',
                                localComponentId: cloned.componentId,
                                localComponent: cloned,
                              });
                            }}
                            className="min-h-[34px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] font-semibold"
                          >
                            {t('pagesPanel.settings.copyCurrentGlobal')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const blank = createBlankHeaderFooterDef(
                              slotKey,
                              `${settingsPage.name} ${slotKey === 'header' ? 'Header' : 'Footer'}`
                            );
                            onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                              mode: 'local',
                              localComponentId: blank.componentId,
                              localComponent: blank,
                            });
                          }}
                          className="min-h-[34px] px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-semibold"
                        >
                          {t('pagesPanel.settings.resetBlank')}
                        </button>
                        {resolved.component && (
                          <button
                            type="button"
                            onClick={() =>
                              onSaveSlotAsTemplate(slotKey, resolved.component!.rootElement)
                            }
                            className="min-h-[34px] px-2.5 py-1 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-800 rounded text-[11px] font-semibold flex items-center gap-1"
                          >
                            <BookmarkPlus className="w-3 h-3" />
                            <span>{t('pagesPanel.settings.saveAsTemplate')}</span>
                          </button>
                        )}
                      </div>

                      {templates.length > 0 && (
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                            {t('pagesPanel.settings.applyTemplateLabel', { slot: slotLabel })}
                          </label>
                          <select
                            value=""
                            onChange={(e) => {
                              const tpl = templates.find((tplItem) => tplItem.id === e.target.value);
                              if (!tpl?.rootNode) return;
                              const now = new Date().toISOString();
                              const nextDef: HeaderFooterComponentDef = {
                                schemaVersion: 1,
                                componentId: `local_${slotKey}_${Date.now().toString(36)}`,
                                componentType: slotKey,
                                name: `${tpl.name} (${settingsPage.name})`,
                                revision: 1,
                                engineVersion: '2.0.0',
                                rootElement: cloneElementTreeWithNewIds(tpl.rootNode),
                                createdAt: now,
                                updatedAt: now,
                              };
                              onUpdatePageLayoutSlot(settingsPage.id, slotKey, {
                                mode: 'local',
                                localComponentId: nextDef.componentId,
                                localComponent: nextDef,
                              });
                            }}
                            className="w-full min-h-[36px] text-xs px-2 py-1 border border-slate-200 rounded bg-white"
                          >
                            <option value="">
                              {t('pagesPanel.settings.chooseTemplateOption', { slot: slotLabel })}
                            </option>
                            {templates.map((tplItem) => (
                              <option key={tplItem.id} value={tplItem.id}>
                                {tplItem.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {slotVal.mode === 'none' && (
                    <div className="text-[11px] text-slate-500">
                      {t('pagesPanel.settings.noneModeDesc', { slot: slotLabel })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* SEO & SOCIAL TAB */}
        {settingsTab === 'seo' && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  {t('pagesPanel.settings.seoTitleLabel')}
                </label>
                <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                  {formTitle.length}/65
                </span>
              </div>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  {t('pagesPanel.settings.metaDescLabel')}
                </label>
                <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                  {formDescription.length}/160
                </span>
              </div>
              <textarea
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-md bg-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                {t('pagesPanel.settings.canonicalPathLabel')}
              </label>
              <input
                type="text"
                placeholder={originalFullPath}
                value={formCanonicalPath}
                onChange={(e) => setFormCanonicalPath(e.target.value)}
                className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                {t('pagesPanel.settings.ogImageLabel')}
              </label>
              <select
                value={formOgImage}
                onChange={(e) => setFormOgImage(e.target.value)}
                className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-md bg-white"
              >
                <option value="">{t('pagesPanel.settings.defaultSitePreview')}</option>
                {site.mediaAssets.map((asset) => (
                  <option key={asset.id} value={asset.url}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 border border-slate-200 rounded-md bg-slate-50 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={formNoIndex}
                onChange={(e) => setFormNoIndex(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>{t('pagesPanel.settings.noindexLabel')}</span>
            </label>

            {/* Search Snippet Preview */}
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-1">
              <div className="text-[10px] font-semibold text-slate-400">
                {t('pagesPanel.settings.searchSnippetPreview')}
              </div>
              <div className="text-[11px] font-mono text-emerald-700 truncate">
                {resolvePublicPortfolioUrl(site.portfolioSlug, slugValidation.fullPath)}
              </div>
              <div className="text-xs font-semibold text-blue-700 truncate">{previewTitle}</div>
              <div className="text-[11px] text-slate-600 line-clamp-2">{previewDesc}</div>
            </div>
          </div>
        )}

        {/* ADVANCED TAB */}
        {settingsTab === 'advanced' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="text-[11px]">
                {t('pagesPanel.settings.sandboxAlert')}
              </span>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                {t('pagesPanel.settings.pageCssLabel')}
              </label>
              <textarea
                rows={4}
                value={formCustomCss}
                onChange={(e) => setFormCustomCss(e.target.value)}
                placeholder={t('pagesPanel.settings.pageCssPlaceholder')}
                className="w-full font-mono text-xs p-2.5 border border-slate-200 rounded-md bg-slate-950 text-slate-100"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                {t('pagesPanel.settings.pageJsLabel')}
              </label>
              <textarea
                rows={4}
                value={formCustomJs}
                onChange={(e) => setFormCustomJs(e.target.value)}
                placeholder={t('pagesPanel.settings.pageJsPlaceholder')}
                className="w-full font-mono text-xs p-2.5 border border-slate-200 rounded-md bg-slate-950 text-slate-100"
              />
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setSettingsPageId(null)}
            className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!slugValidation.valid || !formName.trim()}
            className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md disabled:opacity-40"
          >
            {t('pagesPanel.settings.saveSettingsBtn')}
          </button>
        </div>
      </form>
    );
  }

  // SITE LAYOUT MANAGER VIEW (View 3: Global Header & Footer Variants)
  if (showSiteLayoutManager) {
    const gc = site.globalComponents;
    const globalHeaderPagesCount = site.pages.filter(
      (p) => (p.layout?.header.mode || 'global') === 'global'
    ).length;
    const globalFooterPagesCount = site.pages.filter(
      (p) => (p.layout?.footer.mode || 'global') === 'global'
    ).length;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setShowSiteLayoutManager(false)}
            className="min-h-[38px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-md flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('pagesPanel.settings.backToPages')}</span>
          </button>
          <span className="text-[11px] font-bold text-slate-900">{t('pagesPanel.siteLayout.title')}</span>
        </div>

        <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 text-[11px] text-indigo-950 leading-relaxed">
          {t('pagesPanel.siteLayout.introPrefix')}{' '}
          <strong>{t('pagesPanel.siteLayout.introStrong')}</strong>{' '}
          {t('pagesPanel.siteLayout.introSuffix')}
        </div>

        {(
          [
            {
              slot: 'header' as const,
              title: t('pagesPanel.siteLayout.globalHeaders'),
              list: gc?.headers || [],
              activeId: gc?.activeHeaderId,
              pagesUsing: globalHeaderPagesCount,
            },
            {
              slot: 'footer' as const,
              title: t('pagesPanel.siteLayout.globalFooters'),
              list: gc?.footers || [],
              activeId: gc?.activeFooterId,
              pagesUsing: globalFooterPagesCount,
            },
          ] as const
        ).map((group) => {
          const slotPresets = group.slot === 'header' ? HEADER_PRESETS : FOOTER_PRESETS;
          const slotName = t(`pagesPanel.settings.slotNames.${group.slot}`);
          return (
          <div key={group.slot} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-900">{group.title}</div>
                <div className="text-[10px] text-slate-500">
                  {group.pagesUsing === 1
                    ? t('pagesPanel.siteLayout.usedByPageOne', { count: group.pagesUsing })
                    : t('pagesPanel.siteLayout.usedByPagesMany', { count: group.pagesUsing })}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value=""
                  aria-label={t('pagesPanel.siteLayout.createPresetAria', { slot: slotName })}
                  onChange={(e) => {
                    const pid = e.target.value;
                    if (!pid) return;
                    const preset = slotPresets.find((pr) => pr.presetId === pid);
                    onCreateGlobalVariant(
                      group.slot,
                      preset?.name || t('pagesPanel.siteLayout.newSlotFallback', { slot: slotName }),
                      undefined,
                      pid
                    );
                  }}
                  className="min-h-[34px] max-w-[115px] text-[10px] font-semibold px-1.5 py-1 border border-slate-300 rounded-md bg-white text-slate-700"
                >
                  <option value="">{t('pagesPanel.siteLayout.fromPresetOption')}</option>
                  {slotPresets.map((pr) => (
                    <option key={pr.presetId} value={pr.presetId}>
                      {pr.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onCreateGlobalVariant(
                      group.slot,
                      t('pagesPanel.siteLayout.newSlotIndexed', {
                        slot: slotName,
                        index: group.list.length + 1,
                      })
                    )
                  }
                  className="min-h-[34px] px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  <span>{t('pagesPanel.siteLayout.blankBtn')}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              {group.list.map((def) => {
                const isActive = def.componentId === group.activeId;
                const isRenaming = renamingGlobalId === def.componentId;
                const refPages = getPagesReferencingGlobalComponent(site, group.slot, def.componentId);
                const isSiteEnabled = def.enabled !== false;
                const canDelete = group.list.length > 1;
                const isConfirmingDelete = confirmDeleteGlobalId === def.componentId;

                return (
                  <div
                    key={def.componentId}
                    className={`p-2.5 rounded-lg border space-y-2 ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50/30'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {isRenaming ? (
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="text"
                            autoFocus
                            value={globalRenameDraft}
                            onChange={(e) => setGlobalRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && globalRenameDraft.trim()) {
                                onRenameGlobalVariant(
                                  group.slot,
                                  def.componentId,
                                  globalRenameDraft.trim()
                                );
                                setRenamingGlobalId(null);
                              } else if (e.key === 'Escape') {
                                setRenamingGlobalId(null);
                              }
                            }}
                            className="flex-1 min-w-0 min-h-[32px] text-xs px-2 py-1 border border-indigo-400 rounded bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (globalRenameDraft.trim()) {
                                onRenameGlobalVariant(
                                  group.slot,
                                  def.componentId,
                                  globalRenameDraft.trim()
                                );
                              }
                              setRenamingGlobalId(null);
                            }}
                            className="min-h-[32px] px-2 bg-slate-900 text-white text-[11px] font-semibold rounded"
                          >
                            {t('common.save')}
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {def.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {t('pagesPanel.siteLayout.revBlocks', {
                              rev: def.revision,
                              count: def.rootElement.children?.length ?? 0,
                              status: isSiteEnabled
                                ? t('pagesPanel.siteLayout.enabledSiteWide')
                                : t('pagesPanel.siteLayout.disabledSiteWide'),
                            })}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5 truncate">
                            {refPages.length > 0
                              ? refPages.length === 1
                                ? t('pagesPanel.siteLayout.pagesCountOne', {
                                    count: refPages.length,
                                    names: refPages.map((p) => p.name).join(', '),
                                  })
                                : t('pagesPanel.siteLayout.pagesCountMany', {
                                    count: refPages.length,
                                    names: refPages.map((p) => p.name).join(', '),
                                  })
                              : t('pagesPanel.siteLayout.notReferenced')}
                          </div>
                        </div>
                      )}

                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          <span>{t('pagesPanel.siteLayout.activeBadge')}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectGlobalComponent(group.slot, def.componentId)}
                          className="min-h-[32px] px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-[11px] font-semibold text-slate-800 shrink-0"
                        >
                          {t('pagesPanel.siteLayout.setActiveBtn')}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => onToggleGlobalRegionEnabled(group.slot, def.componentId)}
                        className={`min-h-[30px] px-2 py-1 rounded text-[10px] font-semibold ${
                          isSiteEnabled
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {isSiteEnabled
                          ? t('pagesPanel.siteLayout.disableSiteWideBtn')
                          : t('pagesPanel.siteLayout.enableSiteWideBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingGlobalId(def.componentId);
                          setGlobalRenameDraft(def.name);
                        }}
                        className="min-h-[30px] px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-semibold text-slate-700"
                      >
                        {t('pagesPanel.siteLayout.renameBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onCreateGlobalVariant(
                            group.slot,
                            t('pagesPanel.siteLayout.copySuffix', { name: def.name }),
                            def
                          )
                        }
                        className="min-h-[30px] px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[10px] font-semibold text-slate-700"
                      >
                        {t('pagesPanel.siteLayout.duplicateBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveSlotAsTemplate(group.slot, def.rootElement)}
                        className="min-h-[30px] px-2 py-1 bg-indigo-50 hover:bg-indigo-100 rounded text-[10px] font-semibold text-indigo-800 flex items-center gap-1"
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        <span>{t('pagesPanel.siteLayout.saveTemplateBtn')}</span>
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteGlobalId(isConfirmingDelete ? null : def.componentId)
                          }
                          className="min-h-[30px] px-2 py-1 bg-red-50 hover:bg-red-100 rounded text-[10px] font-semibold text-red-700 ml-auto"
                        >
                          {t('pagesPanel.siteLayout.deleteBtn')}
                        </button>
                      )}
                    </div>

                    {isConfirmingDelete && (
                      <div className="p-2 rounded bg-red-50 border border-red-200 text-[11px] text-red-900 space-y-1.5">
                        <div>
                          {t('pagesPanel.siteLayout.confirmDeletePrompt')}{' '}
                          <strong>{def.name}</strong>?{' '}
                          {refPages.length > 0
                            ? t('pagesPanel.siteLayout.confirmDeleteUsed', {
                                count: refPages.length,
                                pages: refPages.map((p) => p.name).join(', '),
                              })
                            : t('pagesPanel.siteLayout.confirmDeleteUnused')}
                        </div>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGlobalId(null)}
                            className="px-2 py-1 rounded bg-white border border-red-200 text-[10px] font-semibold text-slate-700"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteGlobalVariant(group.slot, def.componentId);
                              setConfirmDeleteGlobalId(null);
                            }}
                            className="px-2 py-1 rounded bg-red-600 text-white text-[10px] font-semibold"
                          >
                            {t('pagesPanel.siteLayout.confirmDeleteBtn')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  // PAGE TREE & LIST VIEW (View 1)
  return (
    <div className="space-y-4">
      {/* Site Layout (Global Header & Footer) Trigger */}
      <button
        type="button"
        onClick={() => setShowSiteLayoutManager(true)}
        className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-left flex items-center justify-between gap-2 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <LayoutTemplate className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 truncate">
              {t('pagesPanel.tree.siteLayoutTitle')}
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {t('pagesPanel.tree.siteLayoutSubtitle')}
            </div>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-indigo-700 shrink-0">
          {t('pagesPanel.tree.configureBtn')}
        </span>
      </button>

      {/* Portfolio Public URL Slug */}
      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Globe className="w-3.5 h-3.5 text-blue-600" />
          <span>{t('pagesPanel.tree.publicUrlTitle')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-500 shrink-0">builly.me/</span>
          <input
            type="text"
            value={slugInput}
            onChange={(e) => {
              setSlugInput(e.target.value);
              const check = validatePortfolioSlug(e.target.value);
              setSlugError(check.valid ? null : check.error || t('pagesPanel.tree.invalidSlug'));
            }}
            className="flex-1 min-w-0 min-h-[38px] text-xs px-2 py-1 border border-slate-200 rounded bg-white font-mono"
          />
          <button
            type="button"
            disabled={Boolean(slugError) || slugInput === site.portfolioSlug}
            onClick={() => {
              const check = validatePortfolioSlug(slugInput);
              if (check.valid) {
                onUpdateSiteMeta({ portfolioSlug: check.normalized });
              }
            }}
            className="min-h-[38px] px-2.5 bg-slate-900 text-white text-xs font-semibold rounded disabled:opacity-40 whitespace-nowrap"
          >
            {t('pagesPanel.tree.applyBtn')}
          </button>
        </div>
        {slugError && (
          <div className="flex items-center gap-1 text-[11px] text-red-600">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{slugError}</span>
          </div>
        )}
      </div>

      {/* Google Drive Page Registry Sync Bar */}
      <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 min-w-0">
            <Cloud
              className={`w-3.5 h-3.5 shrink-0 ${
                workspace.connected ? 'text-emerald-600' : 'text-slate-400'
              }`}
            />
            <span className="truncate">{t('pagesPanel.tree.driveRegistryTitle')}</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0">
            {t('pagesPanel.settings.revLabel', { rev: site.pageRegistryRevision ?? 1 })}
          </span>
        </div>

        {driveConflictRevision && (
          <div className="p-2.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] text-amber-950 space-y-2">
            <div>
              {t('pagesPanel.tree.conflictNotice', { rev: driveConflictRevision })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={isDriveSyncing}
                onClick={onRequestDriveLoad}
                className="min-h-[34px] px-2.5 py-1 bg-white border border-amber-300 rounded text-[11px] font-semibold text-amber-900"
              >
                {t('pagesPanel.tree.loadRemoteBtn')}
              </button>
              <button
                type="button"
                disabled={isDriveSyncing}
                onClick={() => onRequestDriveSync(true)}
                className="min-h-[34px] px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-semibold"
              >
                {t('pagesPanel.tree.forceSyncLocalBtn')}
              </button>
            </div>
          </div>
        )}

        {workspace.connected ? (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isDriveSyncing}
              onClick={() => onRequestDriveSync(false)}
              className="min-h-[38px] px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isDriveSyncing ? t('pagesPanel.tree.syncingBtn') : t('pagesPanel.tree.syncDriveBtn')}
              </span>
            </button>
            <button
              type="button"
              disabled={isDriveSyncing}
              onClick={onRequestDriveLoad}
              className="min-h-[38px] px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <CloudDownload className="w-3.5 h-3.5 shrink-0" />
              <span>{t('pagesPanel.tree.loadDriveBtn')}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>{t('pagesPanel.tree.savedLocallyHint')}</span>
            {onOpenGoogleSetup && (
              <button
                type="button"
                onClick={onOpenGoogleSetup}
                className="min-h-[34px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-semibold whitespace-nowrap shrink-0"
              >
                {t('pagesPanel.tree.connectBtn')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pages Header + Search */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800 tabular-nums">
            {t('pagesPanel.tree.sitePagesTitle', { count: site.pages.length })}
          </span>
          <button
            type="button"
            onClick={() => onOpenCreateModal({ forceHome: site.pages.length === 0 })}
            className="min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5 shrink-0" />
            <span>{t('pagesPanel.tree.newPageBtn')}</span>
          </button>
        </div>

        {site.pages.length > 0 && (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('pagesPanel.tree.searchPlaceholder')}
              className="w-full min-h-[38px] text-xs pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* Empty State */}
      {site.pages.length === 0 ? (
        <div className="p-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center space-y-3">
          <Home className="w-7 h-7 text-slate-400 mx-auto" />
          <div className="space-y-1">
            <div className="text-xs font-bold text-slate-900">{t('pagesPanel.tree.noPagesYetTitle')}</div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {t('pagesPanel.tree.noPagesYetDescPrefix')}
              <code className="font-mono">/</code>
              {t('pagesPanel.tree.noPagesYetDescSuffix')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenCreateModal({ forceHome: true })}
            className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>{t('pagesPanel.tree.createHomeBtn')}</span>
          </button>
        </div>
      ) : orderedTreeEntries.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500 border border-slate-200 rounded-lg bg-slate-50">
          {t('pagesPanel.tree.noPagesMatch', { query: searchQuery })}
        </div>
      ) : (
        <div className="space-y-1.5">
          {orderedTreeEntries.map(({ page, depth }, idx) => {
            const isActive = activePage?.id === page.id;
            const fullPath = resolvePageFullPath(page, site.pages);
            const status = (page.status || 'published') as PageStatus;
            const statusClass = STATUS_CLASS[status];
            const navHidden = page.navigation?.visible === false;
            const isMenuOpen = openMenuPageId === page.id;
            const isRenaming = renamingPageId === page.id;

            const topLevelParents = sortedPages.filter(
              (p) =>
                p.id !== page.id &&
                !p.isHome &&
                !wouldCreateParentCycle(page.id, p.id, site.pages) &&
                !p.parentPageId
            );

            return (
              <div
                key={page.id}
                draggable={!isRenaming}
                onDragStart={(e) => {
                  setDraggedPageId(page.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedPageId && draggedPageId !== page.id) {
                    onReorderPageDrop(draggedPageId, page.id);
                  }
                  setDraggedPageId(null);
                }}
                style={{ marginLeft: `${depth * 16}px` }}
                onClick={() => {
                  if (!isRenaming) onSelectPage(page.id);
                }}
                className={`relative p-2.5 rounded-lg border transition-colors cursor-pointer ${
                  isActive
                    ? 'border-blue-500 bg-blue-50/45'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (renameDraft.trim()) onRenamePage(page.id, renameDraft.trim());
                              setRenamingPageId(null);
                            } else if (e.key === 'Escape') {
                              setRenamingPageId(null);
                            }
                          }}
                          className="flex-1 min-w-0 min-h-[34px] text-xs px-2 py-1 border border-blue-400 rounded bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (renameDraft.trim()) onRenamePage(page.id, renameDraft.trim());
                            setRenamingPageId(null);
                          }}
                          className="min-h-[34px] px-2 bg-slate-900 text-white text-[11px] font-semibold rounded"
                        >
                          {t('common.save')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        {page.isHome && (
                          <Home
                            className="w-3.5 h-3.5 text-blue-600 shrink-0"
                            aria-label={t('pagesPanel.tree.homePageAria')}
                          />
                        )}
                        <span className="font-semibold text-xs text-slate-900 truncate">
                          {page.name}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[11px]">
                      <span className="font-mono text-slate-500 truncate max-w-[140px]">
                        {fullPath}
                      </span>
                      <span className={`font-semibold ${statusClass}`}>
                        {t(`pagesPanel.status.${status}`)}
                      </span>
                      {navHidden && (
                        <span
                          className="inline-flex items-center gap-0.5 text-slate-400"
                          title={t('pagesPanel.tree.hiddenFromNavTitle')}
                        >
                          <EyeOff className="w-3 h-3" />
                          <span>{t('pagesPanel.tree.hiddenBadge')}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row Action Menu Trigger (never changes active page selection) */}
                  <button
                    type="button"
                    aria-label={t('pagesPanel.tree.actionsForAria', { name: page.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuPageId((prev) => (prev === page.id ? null : page.id));
                    }}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 shrink-0"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {/* Dropdown Row Actions */}
                {isMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-2 top-11 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-40 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectPage(page.id);
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-800 hover:bg-slate-50 flex items-center gap-2 font-medium"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('pagesPanel.tree.menuOpenEdit')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRenamingPageId(page.id);
                        setRenameDraft(page.name);
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('pagesPanel.tree.menuRename')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onDuplicatePage(page.id);
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('pagesPanel.tree.menuDuplicate')}</span>
                    </button>

                    {!page.isHome && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetHomePage(page.id);
                          setOpenMenuPageId(null);
                        }}
                        className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Home className="w-3.5 h-3.5 text-blue-600" />
                        <span>{t('pagesPanel.tree.menuSetHome')}</span>
                      </button>
                    )}

                    <div className="my-1 border-t border-slate-100" />

                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => {
                        onMovePageOrder(page.id, 'up');
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2"
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('pagesPanel.tree.menuMoveUp')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={idx === orderedTreeEntries.length - 1}
                      onClick={() => {
                        onMovePageOrder(page.id, 'down');
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2"
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('pagesPanel.tree.menuMoveDown')}</span>
                    </button>

                    {!page.isHome && page.parentPageId && (
                      <button
                        type="button"
                        onClick={() => {
                          onChangePageParent(page.id, null);
                          setOpenMenuPageId(null);
                        }}
                        className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <FolderInput className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('pagesPanel.tree.menuMakeTopLevel')}</span>
                      </button>
                    )}

                    {!page.isHome && !page.parentPageId && topLevelParents.length > 0 && (
                      <div className="px-3 py-1.5">
                        <select
                          value=""
                          aria-label={t('pagesPanel.tree.menuMoveUnderAria', { name: page.name })}
                          onChange={(e) => {
                            if (e.target.value) {
                              onChangePageParent(page.id, e.target.value);
                              setOpenMenuPageId(null);
                            }
                          }}
                          className="w-full min-h-[34px] text-[11px] px-2 py-1 border border-slate-200 rounded bg-slate-50 text-slate-700"
                        >
                          <option value="">{t('pagesPanel.tree.menuMoveToParent')}</option>
                          {topLevelParents.map((p) => (
                            <option key={p.id} value={p.id}>
                              {t('pagesPanel.tree.menuUnderOption', { name: p.name })}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onTogglePageNavVisibility(page.id);
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      {navHidden ? (
                        <>
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          <span>{t('pagesPanel.tree.menuShowInNav')}</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>{t('pagesPanel.tree.menuHideFromNav')}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSettingsPageId(page.id);
                        setSettingsTab('general');
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('pagesPanel.tree.menuPageSettings')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onUpdatePageStatus(
                          page.id,
                          status === 'published' ? 'unpublished' : 'draft'
                        );
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {status === 'published'
                          ? t('pagesPanel.tree.menuUnpublish')
                          : t('pagesPanel.tree.menuMoveToDraft')}
                      </span>
                    </button>

                    <div className="my-1 border-t border-slate-100" />

                    <button
                      type="button"
                      onClick={() => {
                        onOpenDeleteModal(page);
                        setOpenMenuPageId(null);
                      }}
                      className="w-full min-h-[38px] px-3 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('pagesPanel.tree.menuDeletePage')}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
