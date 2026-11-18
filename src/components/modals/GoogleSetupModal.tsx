import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleWorkspaceState } from '../../types/builder';
import { PORTFOLIO_SHEET_SCHEMA } from '../../services/googleWorkspaceApi';
import { ENV_CONFIG } from '../../config/env';
import { GoogleSignInButton } from '../common/GoogleSignInButton';
import { WorkspaceConfirmModal } from './WorkspaceConfirmModal';
import {
  Cloud,
  CheckCircle2,
  Folder,
  RefreshCw,
  ExternalLink,
  X,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  FolderOpen,
  PlusCircle,
  Link2,
  LogOut,
  Database,
  Sparkles,
} from 'lucide-react';

interface GoogleSetupModalProps {
  isOpen: boolean;
  workspace: GoogleWorkspaceState;
  siteName: string;
  onClose: () => void;
  onConnectGoogle: (forceConsent?: boolean) => Promise<void>;
  onCancelConnectGoogle?: () => void;
  onDisconnectGoogle: () => Promise<void>;
  onPickSpreadsheet: () => Promise<void>;
  onLinkSpreadsheetById: (idOrUrl: string) => Promise<void>;
  onCreateSpreadsheet: (includeStarterData: boolean) => Promise<void>;
  onInitializeMissingTabs: () => Promise<void>;
  onRefreshFromSheets: () => Promise<void>;
  onUpdateMode: (mode: 'auto' | 'existing') => void;
  onToggleDemoMode: (enabled: boolean) => void;
  onOpenSheetsEditor: () => void;
}

type ConfirmActionType =
  | 'create-spreadsheet'
  | 'initialize-tabs'
  | 'change-spreadsheet'
  | 'disconnect'
  | null;

export const GoogleSetupModal: React.FC<GoogleSetupModalProps> = ({
  isOpen,
  workspace,
  siteName,
  onClose,
  onConnectGoogle,
  onCancelConnectGoogle,
  onDisconnectGoogle,
  onPickSpreadsheet,
  onLinkSpreadsheetById,
  onCreateSpreadsheet,
  onInitializeMissingTabs,
  onRefreshFromSheets,
  onUpdateMode,
  onToggleDemoMode,
  onOpenSheetsEditor,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'overview' | 'sheets' | 'folders' | 'security'>(
    'overview'
  );
  const [includeStarterData, setIncludeStarterData] = useState(true);
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);
  const [manualIdOrUrl, setManualIdOrUrl] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null);
  const [isConfirmBusy, setIsConfirmBusy] = useState(false);

  if (!isOpen) return null;

  const isConnecting = workspace.connectionStatus === 'connecting';
  const isSyncing = workspace.syncStatus === 'syncing';
  const isBusy = isConnecting || isSyncing || isConfirmBusy;
  const isConnected = workspace.connected && workspace.connectionStatus === 'connected';
  const needsReauth = workspace.connectionStatus === 'needs_reauth';
  const hasSpreadsheet = workspace.spreadsheetLinked && Boolean(workspace.spreadsheet.id);
  const missingTabs = workspace.missingSchemaTabs || [];

  const getInitials = (name: string, email: string) => {
    const source = (name || email || 'G').trim();
    const parts = source.split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return source.slice(0, 2).toUpperCase();
  };

  const handleConfirmExecute = async () => {
    if (!confirmAction) return;
    setIsConfirmBusy(true);
    try {
      if (confirmAction === 'create-spreadsheet') {
        await onCreateSpreadsheet(includeStarterData);
      } else if (confirmAction === 'initialize-tabs') {
        await onInitializeMissingTabs();
      } else if (confirmAction === 'change-spreadsheet') {
        setConfirmAction(null);
        setIsConfirmBusy(false);
        await onPickSpreadsheet();
        return;
      } else if (confirmAction === 'disconnect') {
        await onDisconnectGoogle();
      }
      setConfirmAction(null);
    } catch {
      // Errors are surfaced via workspace.syncError in the modal body
      setConfirmAction(null);
    } finally {
      setIsConfirmBusy(false);
    }
  };

  const getConfirmConfig = () => {
    switch (confirmAction) {
      case 'create-spreadsheet':
        return {
          title: t('modals.googleSetup.confirmCreateTitle'),
          description: t('modals.googleSetup.confirmCreateDesc', {
            name: siteName || t('modals.googleSetup.defaultPortfolioName'),
            folder: ENV_CONFIG.driveFolderName,
          }),
          details: [
            t('modals.googleSetup.confirmCreateTabsDetail', {
              tabs: PORTFOLIO_SHEET_SCHEMA.map((s) => s.name).join(', '),
            }),
            includeStarterData
              ? t('modals.googleSetup.confirmCreateStarterOn')
              : t('modals.googleSetup.confirmCreateStarterOff'),
          ],
          confirmLabel: t('modals.googleSetup.confirmCreateBtn'),
          isDanger: false,
        };
      case 'initialize-tabs':
        return {
          title: t('modals.googleSetup.confirmInitTitle'),
          description: t('modals.googleSetup.confirmInitDesc', {
            sheet: workspace.spreadsheet.name,
          }),
          details: [
            t('modals.googleSetup.confirmInitSheetDetail', {
              sheet: workspace.spreadsheet.name,
            }),
            t('modals.googleSetup.confirmInitTabsDetail', {
              tabs: missingTabs.join(', '),
            }),
          ],
          confirmLabel: t('modals.googleSetup.confirmInitBtn'),
          isDanger: false,
        };
      case 'change-spreadsheet':
        return {
          title: t('modals.googleSetup.confirmChangeTitle'),
          description: t('modals.googleSetup.confirmChangeDesc'),
          details: [
            t('modals.googleSetup.confirmChangeSheetDetail', {
              sheet: workspace.spreadsheet.name,
            }),
            t('modals.googleSetup.confirmChangeIdDetail', {
              id: workspace.spreadsheet.id,
            }),
          ],
          confirmLabel: t('modals.googleSetup.confirmChangeBtn'),
          isDanger: false,
        };
      case 'disconnect':
        return {
          title: t('modals.googleSetup.confirmDisconnectTitle'),
          description: t('modals.googleSetup.confirmDisconnectDesc'),
          details: workspace.userEmail
            ? [t('modals.googleSetup.confirmDisconnectAccountDetail', { email: workspace.userEmail })]
            : [],
          confirmLabel: t('modals.googleSetup.confirmDisconnectBtn'),
          isDanger: true,
        };
      default:
        return null;
    }
  };

  const confirmConfig = getConfirmConfig();

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIdOrUrl.trim()) return;
    await onLinkSpreadsheetById(manualIdOrUrl.trim());
    setManualIdOrUrl('');
    setShowManualUrlInput(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Cloud className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {t('modals.googleSetup.title')}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {t('modals.googleSetup.subtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('modals.googleSetup.closeAria')}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Honest Connection Status Banner */}
          <div className="px-4 sm:px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
            {isConnected ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  {workspace.avatarUrl ? (
                    <img
                      src={workspace.avatarUrl}
                      alt={workspace.accountName || workspace.userEmail}
                      referrerPolicy="no-referrer"
                      className="w-9 h-9 rounded-full border border-slate-200 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {getInitials(workspace.accountName, workspace.userEmail)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {workspace.accountName || t('modals.googleSetup.googleAccount')}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
                        {t('modals.googleSetup.connectedDot')}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 truncate block">
                      {workspace.userEmail}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {hasSpreadsheet && (
                    <button
                      type="button"
                      onClick={() => onRefreshFromSheets()}
                      disabled={isBusy}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? t('modals.googleSetup.syncing') : t('common.refresh')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmAction('disconnect')}
                    disabled={isBusy}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('modals.googleSetup.disconnect')}</span>
                  </button>
                </div>
              </>
            ) : needsReauth ? (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      {t('modals.googleSetup.reauthRequired')}
                    </div>
                    <div className="text-[11px] text-slate-600 truncate">
                      {workspace.userEmail
                        ? t('modals.googleSetup.reauthReconnect', {
                            email: workspace.userEmail,
                            sheet:
                              workspace.spreadsheet.name ||
                              t('modals.googleSetup.yourSpreadsheetFallback'),
                          })
                        : t('modals.googleSetup.reauthExpired')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <GoogleSignInButton
                    label={t('modals.googleSetup.reconnectGoogle')}
                    isLoading={isConnecting}
                    disabled={isBusy}
                    onClick={() => onConnectGoogle(false)}
                  />
                  {isConnecting && onCancelConnectGoogle && (
                    <button
                      type="button"
                      onClick={onCancelConnectGoogle}
                      className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              </>
            ) : workspace.isDemoMode ? (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      {t('modals.googleSetup.demoModeTitle')}
                    </div>
                    <div className="text-[11px] text-slate-600">
                      {t('modals.googleSetup.demoModeDesc')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onToggleDemoMode(false)}
                    className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                  >
                    {t('modals.googleSetup.exitDemo')}
                  </button>
                  <GoogleSignInButton
                    label={t('modals.googleSetup.connectGoogle')}
                    isLoading={isConnecting}
                    disabled={isBusy}
                    onClick={() => onConnectGoogle(false)}
                  />
                  {isConnecting && onCancelConnectGoogle && (
                    <button
                      type="button"
                      onClick={onCancelConnectGoogle}
                      className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <Database className="w-5 h-5 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      {t('modals.googleSetup.notConnected')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {t('modals.googleSetup.notConnectedDesc')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <GoogleSignInButton
                    label={t('modals.googleSetup.connectGoogle')}
                    isLoading={isConnecting}
                    disabled={isBusy}
                    onClick={() => onConnectGoogle(false)}
                  />
                  {isConnecting && onCancelConnectGoogle && (
                    <button
                      type="button"
                      onClick={onCancelConnectGoogle}
                      className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Tab Controls */}
          <div className="grid grid-cols-4 border-b border-slate-200 text-xs font-semibold text-center bg-slate-50/70 shrink-0">
            {[
              { id: 'overview', label: t('modals.googleSetup.tabs.overview') },
              { id: 'sheets', label: t('modals.googleSetup.tabs.sheets') },
              { id: 'folders', label: t('modals.googleSetup.tabs.folders') },
              { id: 'security', label: t('modals.googleSetup.tabs.security') },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`min-h-[40px] py-2 px-1 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Scrollable Body Content */}
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            {/* Explicit API / Auth Error Banner */}
            {workspace.syncError && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold block">{t('modals.googleSetup.errorTitle')}</span>
                    <p className="text-[11px] text-red-800 mt-0.5 leading-relaxed">
                      {workspace.syncError}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  {hasSpreadsheet && isConnected && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onRefreshFromSheets()}
                      className="min-h-[36px] px-3 py-1 bg-white border border-red-300 text-red-800 hover:bg-red-100 rounded-md text-xs font-semibold"
                    >
                      {t('modals.googleSetup.retrySync')}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onConnectGoogle(true)}
                    className="min-h-[36px] px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold"
                  >
                    {t('modals.googleSetup.reconnectGrantScopes')}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 1: CONNECTION & SPREADSHEET HUB */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Case A: Not Connected & Not Demo */}
                {!isConnected && !needsReauth && !workspace.isDemoMode && (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{t('modals.googleSetup.ownDataTitle')}</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {t('modals.googleSetup.ownDataDesc')}
                      </p>
                      <div className="pt-1 border-t border-slate-200/80 space-y-1.5 text-[11px] text-slate-600">
                        <div className="font-semibold text-slate-800">
                          {t('modals.googleSetup.permissionsRequested')}
                        </div>
                        <ul className="space-y-1 list-disc pl-4">
                          <li>
                            <strong>{t('modals.googleSetup.permSheetsTitle')}</strong>{' '}
                            {t('modals.googleSetup.permSheetsDesc')}
                          </li>
                          <li>
                            <strong>{t('modals.googleSetup.permDriveTitle')}</strong>{' '}
                            {t('modals.googleSetup.permDriveDesc')}
                          </li>
                          <li>
                            <strong>{t('modals.googleSetup.permMetaTitle')}</strong>{' '}
                            {t('modals.googleSetup.permMetaDesc')}
                          </li>
                        </ul>
                      </div>
                      <div className="pt-2 flex flex-wrap items-center gap-2.5">
                        <GoogleSignInButton
                          label={t('modals.googleSetup.signInWithGoogle')}
                          isLoading={isConnecting}
                          disabled={isBusy}
                          onClick={() => onConnectGoogle(false)}
                        />
                        {isConnecting && onCancelConnectGoogle && (
                          <button
                            type="button"
                            onClick={onCancelConnectGoogle}
                            className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md whitespace-nowrap"
                          >
                            {t('common.cancel')}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onToggleDemoMode(true)}
                          className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md whitespace-nowrap"
                        >
                          {t('modals.googleSetup.loadDemoData')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Case B: Demo Mode Banner & Actions */}
                {!isConnected && workspace.isDemoMode && (
                  <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 space-y-3">
                    <div className="text-xs font-bold text-amber-950">
                      {t('modals.googleSetup.offlineDemoTitle')}
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed">
                      {t('modals.googleSetup.offlineDemoDesc')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenSheetsEditor();
                        }}
                        className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white rounded-md whitespace-nowrap"
                      >
                        {t('modals.googleSetup.editDemoRows')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleDemoMode(false)}
                        className="min-h-[40px] px-3.5 py-2 text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-md whitespace-nowrap"
                      >
                        {t('modals.googleSetup.clearDemoData')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Case C: Needs Reauth with previously linked spreadsheet */}
                {needsReauth && hasSpreadsheet && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="text-xs font-bold text-slate-900">
                      {t('modals.googleSetup.prevLinkedTitle')}
                    </div>
                    <div className="text-xs text-slate-700 font-medium">
                      {workspace.spreadsheet.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 break-all">
                      ID: {workspace.spreadsheet.id}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {t('modals.googleSetup.prevLinkedNote')}
                    </p>
                  </div>
                )}

                {/* Case D: Connected, No Spreadsheet Linked Yet */}
                {isConnected && !hasSpreadsheet && (
                  <div className="space-y-4">
                    {/* Mode preference selector */}
                    <div>
                      <span className="text-xs font-bold text-slate-800 block mb-2">
                        {t('modals.googleSetup.chooseHowToLink')}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => onUpdateMode('existing')}
                          className={`text-left p-3.5 rounded-xl border transition-all ${
                            workspace.mode === 'existing'
                              ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-500'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 mb-1">
                            <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
                            <span>{t('modals.googleSetup.useExistingTitle')}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {t('modals.googleSetup.useExistingDesc')}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => onUpdateMode('auto')}
                          className={`text-left p-3.5 rounded-xl border transition-all ${
                            workspace.mode === 'auto'
                              ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-500'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 mb-1">
                            <PlusCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>{t('modals.googleSetup.createNewTitle')}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {t('modals.googleSetup.createNewDesc')}
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* Primary Picker Action */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {t('modals.googleSetup.selectExistingTitle')}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {t('modals.googleSetup.selectExistingDesc')}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onPickSpreadsheet()}
                          className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                        >
                          <FolderOpen className="w-4 h-4 shrink-0" />
                          <span>{t('modals.googleSetup.chooseExistingBtn')}</span>
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-200/80">
                        <button
                          type="button"
                          onClick={() => setShowManualUrlInput((prev) => !prev)}
                          className="text-[11px] font-semibold text-blue-700 hover:underline flex items-center gap-1"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>
                            {showManualUrlInput
                              ? t('modals.googleSetup.hideManualUrl')
                              : t('modals.googleSetup.showManualUrl')}
                          </span>
                        </button>

                        {showManualUrlInput && (
                          <form onSubmit={handleManualSubmit} className="mt-2 flex gap-2">
                            <input
                              type="text"
                              value={manualIdOrUrl}
                              onChange={(e) => setManualIdOrUrl(e.target.value)}
                              placeholder={t('modals.googleSetup.urlPlaceholder')}
                              className="flex-1 min-w-0 min-h-[40px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-md bg-white focus:outline-none focus:border-blue-500"
                            />
                            <button
                              type="submit"
                              disabled={isBusy || !manualIdOrUrl.trim()}
                              className="min-h-[40px] px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-md disabled:opacity-40 whitespace-nowrap"
                            >
                              {t('modals.googleSetup.verifyAndLink')}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    {/* Create New Spreadsheet Card */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {t('modals.googleSetup.createNewCardTitle')}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {t('modals.googleSetup.createNewCardDesc', {
                              name: siteName || t('modals.googleSetup.defaultPortfolioName'),
                            })}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmAction('create-spreadsheet')}
                          className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
                        >
                          <PlusCircle className="w-4 h-4 shrink-0" />
                          <span>{t('modals.googleSetup.createNewBtn')}</span>
                        </button>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={includeStarterData}
                          onChange={(e) => setIncludeStarterData(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                        <span>{t('modals.googleSetup.populateStarter')}</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Case E: Connected & Spreadsheet Linked */}
                {isConnected && hasSpreadsheet && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {workspace.spreadsheet.name}
                            </div>
                            <a
                              href={workspace.spreadsheet.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-mono text-blue-700 hover:underline inline-flex items-center gap-1 mt-0.5 break-all"
                            >
                              <span>{t('modals.googleSetup.openInSheets')}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
                          {workspace.spreadsheetCanEdit === false
                            ? t('modals.googleSetup.readOnly')
                            : t('modals.googleSetup.readWrite')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-emerald-200/70 text-[11px] font-mono text-slate-700 tabular-nums">
                        <div>
                          <span className="text-slate-400 block text-[10px]">
                            {t('modals.googleSetup.lastRead')}
                          </span>
                          <span>{workspace.lastReadAt || workspace.lastSynced}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">
                            {t('modals.googleSetup.lastWrite')}
                          </span>
                          <span>
                            {workspace.lastWriteAt || t('modals.googleSetup.notWrittenYet')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">
                            {t('modals.googleSetup.tabsLoaded')}
                          </span>
                          <span>
                            {t('modals.googleSetup.tabsAndRows', {
                              tabs: workspace.spreadsheet.tabs.length,
                              rows: workspace.spreadsheet.tabs.reduce((acc, tab) => acc + tab.rows.length, 0),
                            })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Missing Schema Tabs Banner */}
                    {missingTabs.length > 0 && (
                      <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                        <div className="flex items-start gap-2 text-xs text-amber-950">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block">
                              {t('modals.googleSetup.missingTabsTitle', { count: missingTabs.length })}
                            </span>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                              {t('modals.googleSetup.missingTabsDesc', {
                                tabs: missingTabs.join(', '),
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="pl-6">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmAction('initialize-tabs')}
                            className="min-h-[38px] px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-md text-xs font-semibold disabled:opacity-50"
                          >
                            {t('modals.googleSetup.initMissingTabsBtn')}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Primary Actions for Linked Spreadsheet */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onRefreshFromSheets()}
                        className="min-h-[40px] px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{t('modals.googleSetup.refreshFromSheetsBtn')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenSheetsEditor();
                        }}
                        className="min-h-[40px] px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>{t('modals.googleSetup.openEditorBtn')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmAction('change-spreadsheet')}
                        className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>{t('modals.googleSetup.changeSheetBtn')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SCHEMA TABS */}
            {activeTab === 'sheets' && (
              <div className="space-y-3">
                <div className="text-xs text-slate-600">
                  {hasSpreadsheet ? (
                    <>
                      {t('modals.googleSetup.liveTabsFrom')}{' '}
                      <strong className="text-slate-900">{workspace.spreadsheet.name}</strong>:
                    </>
                  ) : (
                    <>
                      {t('modals.googleSetup.standardSchemaInfo', {
                        count: PORTFOLIO_SHEET_SCHEMA.length,
                      })}
                    </>
                  )}
                </div>

                {hasSpreadsheet || workspace.isDemoMode ? (
                  <div className="space-y-2">
                    {workspace.spreadsheet.tabs.map((tab) => (
                      <div key={tab.name} className="p-3 border border-slate-200 rounded-lg bg-white">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {tab.name}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {t('modals.googleSetup.rowsCount', { count: tab.rows.length })}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-1.5">{tab.description}</p>
                        <div className="text-[10px] font-mono text-slate-600 break-words">
                          {t('modals.googleSetup.columnsLabel', { cols: tab.columns.join(' · ') })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {PORTFOLIO_SHEET_SCHEMA.map((schema) => (
                      <div
                        key={schema.name}
                        className="p-3 border border-slate-200 rounded-lg bg-slate-50/70"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {schema.name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {t('modals.googleSetup.templateBadge')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mb-1.5">{schema.description}</p>
                        <div className="text-[10px] font-mono text-slate-600 break-words">
                          {t('modals.googleSetup.columnsLabel', {
                            cols: schema.columns.join(' · '),
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DRIVE FOLDER */}
            {activeTab === 'folders' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <Folder className="w-4 h-4 text-blue-600" />
                      <span>{workspace.driveFolder.name || ENV_CONFIG.driveFolderName}</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      {workspace.driveFolder.verified
                        ? t('modals.googleSetup.driveVerified')
                        : t('modals.googleSetup.driveNotCreated')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {workspace.driveFolder.verified
                      ? t('modals.googleSetup.driveFolderId', { id: workspace.driveFolder.id })
                      : t('modals.googleSetup.driveFolderHint', {
                          folder: ENV_CONFIG.driveFolderName,
                        })}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: PERMISSIONS & SECURITY */}
            {activeTab === 'security' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    {isConnected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span>
                      {t('modals.googleSetup.sessionStateLabel')}{' '}
                      {isConnected
                        ? t('modals.googleSetup.sessionAuth')
                        : needsReauth
                        ? t('modals.googleSetup.sessionReauth')
                        : workspace.isDemoMode
                        ? t('modals.googleSetup.sessionDemo')
                        : t('modals.googleSetup.sessionNone')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-1 font-mono">
                    <div>
                      {t('modals.googleSetup.grantedScopesLabel')}{' '}
                      {workspace.grantedScopes && workspace.grantedScopes.length > 0
                        ? workspace.grantedScopes.map((s) => s.split('/').pop()).join(', ')
                        : t('modals.googleSetup.noScopesGranted')}
                    </div>
                    <div>{t('modals.googleSetup.tokenPersistenceNote')}</div>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
                  <span className="font-semibold text-slate-900 block">
                    {t('modals.googleSetup.disconnectPolicyTitle')}
                  </span>
                  <p className="text-[11px] leading-relaxed">
                    {t('modals.googleSetup.disconnectPolicyDesc')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-slate-500 font-mono truncate">
              {workspace.lastSyncSummary
                ? t('modals.googleSetup.lastOpStatus', {
                    op: workspace.lastSyncSummary.operation,
                    time: workspace.lastSyncSummary.timestamp,
                  })
                : t('modals.googleSetup.statusPrefix', { status: workspace.lastSynced })}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      </div>

      {confirmConfig && (
        <WorkspaceConfirmModal
          isOpen={Boolean(confirmAction)}
          title={confirmConfig.title}
          description={confirmConfig.description}
          details={confirmConfig.details}
          confirmLabel={confirmConfig.confirmLabel}
          isDanger={confirmConfig.isDanger}
          isBusy={isConfirmBusy}
          onConfirm={handleConfirmExecute}
          onCancel={() => {
            if (!isConfirmBusy) setConfirmAction(null);
          }}
        />
      )}
    </>
  );
};
