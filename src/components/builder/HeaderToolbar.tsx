import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceMode, GoogleWorkspaceState, PageDocument, SiteDocument } from '../../types/builder';
import { resolvePageFullPath, sortPagesForTree } from '../../services/pageService';
import { BuillyLogo } from '../common/BuillyLogo';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { BuillyOwnerIdentity } from '../../features/identity/authService';
import {
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Globe,
  Save,
  Rocket,
  FileText,
  ChevronDown,
  Cloud,
  Layers,
  Sliders,
  MoreVertical,
  FileSpreadsheet,
  Download,
  Check,
  PanelLeft,
  PanelRight,
  Home,
  FilePlus2,
  BookOpen,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface HeaderToolbarProps {
  site: SiteDocument;
  activePage: PageDocument | null;
  deviceMode: DeviceMode; // Simulated website preview breakpoint
  editorViewportMode: DeviceMode; // Actual physical editor viewport layout
  isPreviewMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges: boolean;
  lastSavedTime: string;
  workspace: GoogleWorkspaceState;
  isLeftDrawerOpen?: boolean;
  isRightDrawerOpen?: boolean;
  isFocusMode?: boolean;
  onSelectPage: (pageId: string) => void;
  onOpenCreatePageModal?: () => void;
  onSetDeviceMode: (mode: DeviceMode) => void;
  onTogglePreview: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveDraft: () => void;
  onOpenPublishModal: () => void;
  onOpenPublicSiteModal: () => void;
  onOpenGoogleSetupModal: () => void;
  onOpenSheetsEditorModal: () => void;
  onOpenExportModal: () => void;
  onOpenCmsModal: () => void;
  onToggleSidebar: () => void;
  onToggleInspector: () => void;
  onToggleFocusMode?: () => void;
  buillyOwner?: BuillyOwnerIdentity | null;
  projectName?: string;
  onNavigateConsole?: () => void;
  onNavigateLanding?: () => void;
  onOpenWorkspaceConnect?: () => void;
  onSignOutOwner?: () => void;
}

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({
  site,
  activePage,
  deviceMode,
  editorViewportMode,
  isPreviewMode,
  canUndo,
  canRedo,
  hasUnsavedChanges,
  lastSavedTime,
  workspace,
  isLeftDrawerOpen = false,
  isRightDrawerOpen = false,
  isFocusMode = false,
  onSelectPage,
  onOpenCreatePageModal,
  onSetDeviceMode,
  onTogglePreview,
  onUndo,
  onRedo,
  onSaveDraft,
  onOpenPublishModal,
  onOpenPublicSiteModal,
  onOpenGoogleSetupModal,
  onOpenSheetsEditorModal,
  onOpenExportModal,
  onOpenCmsModal,
  onToggleSidebar,
  onToggleInspector,
  onToggleFocusMode,
  buillyOwner = null,
  projectName,
  onNavigateConsole,
  onNavigateLanding,
  onOpenWorkspaceConnect,
  onSignOutOwner,
}) => {
  const { t } = useTranslation();
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const pageMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
        setIsPageMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const isMobile = editorViewportMode === 'mobile';
  const isTablet = editorViewportMode === 'tablet';
  const isDesktop = editorViewportMode === 'desktop';

  return (
    <header
      className={`${
        isMobile ? 'h-13 px-2.5' : 'h-14 px-4'
      } bg-[var(--builder-panel-bg)] border-b border-[var(--builder-border)] flex items-center justify-between gap-2 z-40 select-none shrink-0`}
    >
      {/* Left: Brand, Drawer Toggle (Tablet/Desktop), & Page Selector */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        {!isMobile && !isPreviewMode && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={
              isLeftDrawerOpen
                ? t('builder.canvas.hideLeftPanel')
                : t('builder.canvas.showLeftPanel')
            }
            aria-label={t('builder.toggleLeftPanel')}
            aria-pressed={isLeftDrawerOpen}
            className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-md transition-colors shrink-0 ${
              isLeftDrawerOpen
                ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)]'
                : 'text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)] hover:text-[var(--builder-text-primary)]'
            }`}
          >
            {isTablet ? <Layers className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        )}

        <div className="flex items-center shrink-0">
          {onNavigateLanding ? (
            <button
              type="button"
              onClick={onNavigateLanding}
              title={t('builder.returnHome')}
              aria-label={t('builder.returnHome')}
              className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
            >
              <BuillyLogo mode={editorViewportMode} theme="light" />
            </button>
          ) : (
            <BuillyLogo mode={editorViewportMode} theme="light" />
          )}
        </div>

        {onNavigateConsole && (
          <button
            type="button"
            onClick={onNavigateConsole}
            title={t('builder.backToProjectDashboard')}
            className="hidden sm:inline-flex items-center gap-1 min-h-[34px] px-2.5 py-1 rounded-md border border-[var(--builder-border)] bg-[var(--builder-surface-hover)] hover:bg-slate-200/70 text-xs font-medium text-[var(--builder-text-primary)] whitespace-nowrap shrink-0 max-w-[140px]"
          >
            <span className="truncate">{projectName || t('builder.backToConsole')}</span>
          </button>
        )}

        <div className="h-4 w-px bg-slate-200 mx-0.5 sm:mx-1.5 shrink-0" />

        {/* Click-Toggled Page Selector */}
        <div className="relative" ref={pageMenuRef}>
          <button
            type="button"
            onClick={() => setIsPageMenuOpen((prev) => !prev)}
            className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
          >
            {activePage?.isHome ? (
              <Home className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            <span className="truncate max-w-[78px] sm:max-w-[120px]">
              {activePage ? activePage.name : t('builder.noPages')}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {isPageMenuOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-68 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50">
              <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 flex items-center justify-between">
                <span>{t('builder.switchPage')}</span>
                <span className="font-mono tabular-nums">{site.pages.length}</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {sortPagesForTree(site.pages).map((p) => {
                  const fullPath = resolvePageFullPath(p, site.pages);
                  const status = p.status || 'published';
                  const isActive = activePage?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelectPage(p.id);
                        setIsPageMenuOpen(false);
                      }}
                      className={`w-full min-h-[40px] text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors ${
                        isActive ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {p.parentPageId && (
                          <span className="text-slate-300 pl-2 shrink-0">└</span>
                        )}
                        {p.isHome && <Home className="w-3 h-3 text-blue-600 shrink-0" />}
                        <span className="truncate">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {status !== 'published' && (
                          <span className="text-[10px] capitalize text-amber-700 font-medium">
                            {status}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-mono truncate max-w-[90px]">
                          {fullPath}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {onOpenCreatePageModal && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsPageMenuOpen(false);
                      onOpenCreatePageModal();
                    }}
                    className="w-full min-h-[40px] px-3 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50/60 flex items-center gap-2"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    <span>{t('builder.newPage')}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: Website Preview Breakpoint Switcher + Undo/Redo (Tablet & Desktop) */}
      {!isMobile && (
        <div className="flex items-center gap-2 lg:gap-3 shrink-0">
          <div
            className="flex items-center bg-[var(--builder-surface-muted)] border border-[var(--builder-border)] p-0.5 rounded-lg"
            role="group"
            aria-label={t('builder.previewBreakpointAria')}
          >
            {(
              [
                { id: 'desktop', label: t('common.desktop'), icon: Monitor },
                { id: 'tablet', label: t('common.tablet'), icon: Tablet },
                { id: 'mobile', label: t('common.mobile'), icon: Smartphone },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSetDeviceMode(id)}
                title={t('builder.previewDeviceTitle', { device: label })}
                className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  deviceMode === id
                    ? 'bg-[var(--builder-panel-bg)] text-[var(--builder-primary)] shadow-xs font-semibold'
                    : 'text-[var(--builder-text-secondary)] hover:text-[var(--builder-text-primary)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {isDesktop && <span>{label}</span>}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title={t('builder.undo')}
              aria-label={t('builder.undo')}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md disabled:opacity-40 transition-colors"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title={t('builder.redo')}
              aria-label={t('builder.redo')}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md disabled:opacity-40 transition-colors"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Right: Save State, Quick Utilities, Preview & Publish */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Explicit Save Status + Action */}
        <button
          type="button"
          onClick={onSaveDraft}
          title={
            hasUnsavedChanges
              ? t('builder.saveDraftTitle')
              : t('builder.savedTitle', { time: lastSavedTime })
          }
          className={`min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            hasUnsavedChanges
              ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {hasUnsavedChanges ? (
            <Save className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          )}
          <span>{hasUnsavedChanges ? t('common.save') : t('common.saved')}</span>
        </button>

        {/* Tablet Properties Drawer Toggle */}
        {isTablet && !isPreviewMode && (
          <button
            type="button"
            onClick={onToggleInspector}
            title={t('builder.toggleProperties')}
            aria-label={t('builder.toggleProperties')}
            className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-md transition-colors ${
              isRightDrawerOpen
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
          </button>
        )}

        {/* Desktop-only Secondary Workspace Shortcuts */}
        {isDesktop && (
          <>
            <button
              type="button"
              onClick={onOpenCmsModal}
              title={t('builder.openCmsTooltip')}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-white bg-[var(--builder-primary)] hover:bg-[var(--builder-primary-hover)] rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>CMS</span>
            </button>

            <button
              type="button"
              onClick={onOpenSheetsEditorModal}
              title={t('builder.openSheetsTooltip')}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sheets</span>
            </button>

            <button
              type="button"
              onClick={onOpenGoogleSetupModal}
              title={
                buillyOwner?.email
                  ? workspace.connected && workspace.userEmail
                    ? t('builder.ownerWithWorkspaceTooltip', {
                        owner: buillyOwner.email,
                        workspace: workspace.userEmail,
                      })
                    : t('builder.ownerOnlyTooltip', { owner: buillyOwner.email })
                  : workspace.connected && workspace.userEmail
                  ? t('builder.workspaceOnlyTooltip', { workspace: workspace.userEmail })
                  : t('builder.googleWorkspaceSetup')
              }
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Cloud
                className={`w-3.5 h-3.5 ${
                  workspace.connected && workspace.spreadsheetLinked
                    ? 'text-emerald-600'
                    : workspace.connected
                    ? 'text-blue-600'
                    : workspace.connectionStatus === 'needs_reauth' || workspace.isDemoMode
                    ? 'text-amber-600'
                    : 'text-slate-500'
                }`}
              />
              <span className="truncate max-w-[120px]">
                {workspace.connected && workspace.spreadsheetLinked
                  ? workspace.userEmail.split('@')[0] || t('builder.sheetsLinked')
                  : workspace.connected
                  ? t('builder.chooseSheet')
                  : workspace.connectionStatus === 'needs_reauth'
                  ? t('builder.reconnectGoogle')
                  : workspace.isDemoMode
                  ? t('builder.demoData')
                  : t('builder.connectGoogle')}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenPublicSiteModal}
              title={t('builder.viewLiveSite')}
              className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>{t('builder.live')}</span>
            </button>

            <button
              type="button"
              onClick={onOpenExportModal}
              title={t('builder.exportBackup')}
              aria-label={t('builder.exportBackup')}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-md shrink-0"
            >
              <Download className="w-4 h-4" />
            </button>

            {!isPreviewMode && onToggleFocusMode && (
              <button
                type="button"
                onClick={onToggleFocusMode}
                title={`${
                  isFocusMode
                    ? t('builder.canvas.exitFocusMode')
                    : t('builder.canvas.focusMode')
                } (Ctrl+\\ / ⌘\\)`}
                aria-label={
                  isFocusMode
                    ? t('builder.canvas.exitFocusMode')
                    : t('builder.canvas.focusMode')
                }
                aria-pressed={isFocusMode}
                className={`min-h-[38px] px-2.5 flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors shrink-0 ${
                  isFocusMode
                    ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)]'
                    : 'text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)] hover:text-[var(--builder-text-primary)]'
                }`}
              >
                {isFocusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                {isFocusMode && <span>{t('builder.canvas.exitFocusMode')}</span>}
              </button>
            )}

            {!isPreviewMode && (
              <button
                type="button"
                onClick={onToggleInspector}
                title={
                  isRightDrawerOpen
                    ? t('builder.canvas.hideInspector')
                    : t('builder.canvas.showInspector')
                }
                aria-label={t('builder.togglePropertiesPanel')}
                aria-pressed={isRightDrawerOpen}
                className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-md transition-colors shrink-0 ${
                  isRightDrawerOpen
                    ? 'bg-[var(--builder-primary-soft)] text-[var(--builder-primary)]'
                    : 'text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)] hover:text-[var(--builder-text-primary)]'
                }`}
              >
                <PanelRight className="w-4 h-4" />
              </button>
            )}
            {buillyOwner && onOpenWorkspaceConnect && (
              <button
                type="button"
                onClick={onOpenWorkspaceConnect}
                title={t('builder.accountTooltip', {
                  user: buillyOwner.email || buillyOwner.displayName,
                })}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-[#6C2CEB] bg-[#6C2CEB]/10 hover:bg-[#6C2CEB]/15 rounded-md whitespace-nowrap shrink-0"
              >
                {t('navigation.account')}
              </button>
            )}
            {buillyOwner && onSignOutOwner && (
              <button
                type="button"
                onClick={onSignOutOwner}
                title={t('builder.signOutTooltip', {
                  user: buillyOwner.email || buillyOwner.displayName,
                })}
                className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-[var(--builder-text-secondary)] hover:bg-[var(--builder-surface-hover)] hover:text-[var(--builder-text-primary)] rounded-md whitespace-nowrap shrink-0"
              >
                {t('navigation.signOut')}
              </button>
            )}

            <LanguageSwitcher size="sm" showIcon={false} />
          </>
        )}

        {/* Preview Toggle */}
        <button
          type="button"
          onClick={onTogglePreview}
          title={isPreviewMode ? t('builder.exitPreview') : t('builder.previewPage')}
          className={`min-h-[38px] px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            isPreviewMode
              ? 'bg-[var(--builder-primary)] text-white'
              : 'text-[var(--builder-text-primary)] hover:bg-[var(--builder-surface-hover)]'
          }`}
        >
          {isPreviewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {!isMobile && <span>{isPreviewMode ? t('builder.edit') : t('builder.preview')}</span>}
        </button>

        {/* Publish / Update Primary Action */}
        <button
          type="button"
          onClick={onOpenPublishModal}
          className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-white bg-[#211B2E] hover:bg-[#312844] rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <Rocket className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{site.releases.length > 0 ? t('builder.update') : t('builder.publish')}</span>
        </button>

        {/* Mobile & Tablet Overflow Menu */}
        {!isDesktop && (
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              aria-label={t('builder.moreActions')}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-md"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isMoreMenuOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50">
                <div className="px-3.5 py-2 flex items-center justify-between gap-2 border-b border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {t('language.label')}
                  </span>
                  <LanguageSwitcher size="sm" showIcon={false} />
                </div>

                {isMobile && (
                  <>
                    <button
                      type="button"
                      disabled={!canUndo}
                      onClick={() => {
                        onUndo();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full min-h-[42px] px-3.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5"
                    >
                      <Undo2 className="w-4 h-4 text-slate-500" />
                      <span>{t('builder.undo')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canRedo}
                      onClick={() => {
                        onRedo();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full min-h-[42px] px-3.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5"
                    >
                      <Redo2 className="w-4 h-4 text-slate-500" />
                      <span>{t('builder.redo')}</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onOpenSheetsEditorModal();
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full min-h-[42px] px-3.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>{t('builder.editGoogleSheets')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenGoogleSetupModal();
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full min-h-[42px] px-3.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Cloud className="w-4 h-4 text-blue-600" />
                  <span>{t('builder.googleWorkspace')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenPublicSiteModal();
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full min-h-[42px] px-3.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Globe className="w-4 h-4 text-slate-500" />
                  <span>{t('builder.viewLiveSite')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenExportModal();
                    setIsMoreMenuOpen(false);
                  }}
                  className="w-full min-h-[42px] px-3.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>{t('builder.exportArchive')}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
