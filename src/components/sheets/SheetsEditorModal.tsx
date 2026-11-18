import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleWorkspaceState, SheetsTab } from '../../types/builder';
import { GoogleSignInButton } from '../common/GoogleSignInButton';
import { WorkspaceConfirmModal } from '../modals/WorkspaceConfirmModal';
import {
  Plus,
  Trash2,
  Check,
  X,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  AlertTriangle,
  FolderOpen,
  Sparkles,
} from 'lucide-react';

interface SheetsEditorModalProps {
  isOpen: boolean;
  workspace: GoogleWorkspaceState;
  onClose: () => void;
  onRefreshFromSheets: () => Promise<void>;
  onSaveTabsToSheets: (tabs: SheetsTab[]) => Promise<void>;
  onSaveDemoTabs: (tabs: SheetsTab[]) => void;
  onOpenGoogleSetup: () => void;
  onConnectGoogle: (forceConsent?: boolean) => Promise<void>;
  onCancelConnectGoogle?: () => void;
}

export const SheetsEditorModal: React.FC<SheetsEditorModalProps> = ({
  isOpen,
  workspace,
  onClose,
  onRefreshFromSheets,
  onSaveTabsToSheets,
  onSaveDemoTabs,
  onOpenGoogleSetup,
  onConnectGoogle,
  onCancelConnectGoogle,
}) => {
  const { t } = useTranslation();
  const [activeTabName, setActiveTabName] = useState<string>('PROJECTS');
  const [localTabs, setLocalTabs] = useState<SheetsTab[]>([]);
  const [hasDirtyEdits, setHasDirtyEdits] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'save-sheets' | 'discard-refresh' | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Sync local draft from workspace when modal opens or remote tabs update while clean
  useEffect(() => {
    if (!isOpen) return;
    if (!hasDirtyEdits) {
      const cloned: SheetsTab[] = JSON.parse(JSON.stringify(workspace.spreadsheet.tabs || []));
      setLocalTabs(cloned);
      if (cloned.length > 0 && !cloned.some((t) => t.name === activeTabName)) {
        setActiveTabName(cloned[0].name);
      }
    }
  }, [isOpen, workspace.spreadsheet.tabs, hasDirtyEdits, activeTabName]);

  // Reset modal transient error state on open
  useEffect(() => {
    if (isOpen) {
      setSaveError(null);
      setHasDirtyEdits(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConnected = workspace.connected && workspace.connectionStatus === 'connected';
  const needsReauth = workspace.connectionStatus === 'needs_reauth';
  const isConnecting = workspace.connectionStatus === 'connecting';
  const isSyncing = workspace.syncStatus === 'syncing';
  const hasSpreadsheet = workspace.spreadsheetLinked && Boolean(workspace.spreadsheet.id);
  const canEditLive = isConnected && hasSpreadsheet;
  const showTableWorkspace = canEditLive || workspace.isDemoMode;

  const currentTab = localTabs.find((t) => t.name === activeTabName) || localTabs[0];

  const handleCellChange = (rowIndex: number, column: string, value: string) => {
    setHasDirtyEdits(true);
    setSaveError(null);
    setLocalTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.name !== (currentTab?.name || activeTabName)) return tab;
        const newRows = [...tab.rows];
        newRows[rowIndex] = { ...newRows[rowIndex], [column]: value };
        return { ...tab, rows: newRows };
      })
    );
  };

  const handleAddRow = () => {
    if (!currentTab) return;
    setHasDirtyEdits(true);
    setSaveError(null);
    setLocalTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.name !== currentTab.name) return tab;
        const newRow: Record<string, any> = {};
        tab.columns.forEach((col) => {
          newRow[col] = col === 'id' ? `item_${Date.now()}` : '';
        });
        return { ...tab, rows: [...tab.rows, newRow] };
      })
    );
  };

  const handleDeleteRow = (rowIndex: number) => {
    if (!currentTab) return;
    setHasDirtyEdits(true);
    setSaveError(null);
    setLocalTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.name !== currentTab.name) return tab;
        const newRows = tab.rows.filter((_, idx) => idx !== rowIndex);
        return { ...tab, rows: newRows };
      })
    );
  };

  const handleRefreshClick = async () => {
    if (hasDirtyEdits) {
      setConfirmAction('discard-refresh');
      return;
    }
    setIsBusy(true);
    setSaveError(null);
    try {
      await onRefreshFromSheets();
      setHasDirtyEdits(false);
    } catch (err: any) {
      setSaveError(err?.message || t('modals.sheetsEditor.refreshError'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setIsBusy(true);
    setSaveError(null);

    try {
      if (confirmAction === 'discard-refresh') {
        setHasDirtyEdits(false);
        await onRefreshFromSheets();
        setConfirmAction(null);
      } else if (confirmAction === 'save-sheets') {
        await onSaveTabsToSheets(localTabs);
        setHasDirtyEdits(false);
        setConfirmAction(null);
      }
    } catch (err: any) {
      // Preserve unsaved local edits in localTabs on failure!
      setSaveError(err?.message || t('modals.sheetsEditor.syncError'));
      setConfirmAction(null);
    } finally {
      setIsBusy(false);
    }
  };

  const totalRowsCount = localTabs.reduce((sum, t) => sum + t.rows.length, 0);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none">
        <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full h-[92dvh] sm:h-[660px] flex flex-col overflow-hidden border border-slate-200">
          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {canEditLive
                      ? workspace.spreadsheet.name
                      : workspace.isDemoMode
                      ? t('modals.sheetsEditor.demoTitle')
                      : t('modals.sheetsEditor.defaultTitle')}
                  </h3>
                  {hasDirtyEdits && (
                    <span className="text-[11px] font-semibold text-amber-700 whitespace-nowrap">
                      {t('modals.sheetsEditor.unsavedEdits')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">
                  {canEditLive
                    ? t('modals.sheetsEditor.liveSubtitle', { email: workspace.userEmail })
                    : workspace.isDemoMode
                    ? t('modals.sheetsEditor.demoSubtitle')
                    : t('modals.sheetsEditor.disconnectedSubtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
              {showTableWorkspace && currentTab && (
                <button
                  type="button"
                  disabled={isBusy || isSyncing}
                  onClick={handleAddRow}
                  className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t('modals.sheetsEditor.addRow')}</span>
                </button>
              )}

              {canEditLive && (
                <>
                  <button
                    type="button"
                    disabled={isBusy || isSyncing}
                    onClick={handleRefreshClick}
                    className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-slate-600 ${
                        isSyncing ? 'animate-spin' : ''
                      }`}
                    />
                    <span className="hidden sm:inline">{t('common.refresh')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy || isSyncing || localTabs.length === 0}
                    onClick={() => setConfirmAction('save-sheets')}
                    className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('modals.sheetsEditor.saveToSheets')}</span>
                  </button>
                </>
              )}

              {!canEditLive && workspace.isDemoMode && (
                <button
                  type="button"
                  onClick={() => {
                    onSaveDemoTabs(localTabs);
                    setHasDirtyEdits(false);
                    onClose();
                  }}
                  className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-md transition-colors whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{t('modals.sheetsEditor.saveDemo')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label={t('modals.sheetsEditor.closeAria')}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Demo Mode Notice Banner */}
          {!canEditLive && workspace.isDemoMode && (
            <div className="px-4 sm:px-6 py-2 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{t('modals.sheetsEditor.demoBannerTitle')}</strong>{' '}
                  {t('modals.sheetsEditor.demoBannerDesc')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGoogleSetup();
                }}
                className="text-xs font-semibold text-amber-900 underline hover:text-amber-950 whitespace-nowrap"
              >
                {t('modals.sheetsEditor.connectRealSheet')}
              </button>
            </div>
          )}

          {/* Error Banner (while preserving unsaved edits) */}
          {(saveError || (workspace.syncError && canEditLive)) && (
            <div className="px-4 sm:px-6 py-2.5 bg-red-50 border-b border-red-200 flex flex-wrap items-center justify-between gap-2 text-xs text-red-900 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span className="truncate">{saveError || workspace.syncError}</span>
              </div>
              {hasDirtyEdits && (
                <span className="text-[11px] font-medium text-red-700 whitespace-nowrap">
                  {t('modals.sheetsEditor.unsavedPreserved')}
                </span>
              )}
            </div>
          )}

          {/* Disconnected / Needs Reauth / Unlinked Empty States */}
          {!showTableWorkspace ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center bg-slate-50/60">
              <div className="max-w-md w-full bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
                {needsReauth ? (
                  <>
                    <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">
                        {t('modals.sheetsEditor.reauthTitle')}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {t('modals.sheetsEditor.reauthDesc', {
                          sheet:
                            workspace.spreadsheet.name ||
                            t('modals.sheetsEditor.yourLinkedSheet'),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 pt-1">
                      <GoogleSignInButton
                        label={t('modals.sheetsEditor.reconnectGoogle')}
                        isLoading={isConnecting}
                        onClick={() => onConnectGoogle(false)}
                      />
                      {isConnecting && onCancelConnectGoogle && (
                        <button
                          type="button"
                          onClick={onCancelConnectGoogle}
                          className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                        >
                          {t('common.cancel')}
                        </button>
                      )}
                    </div>
                  </>
                ) : isConnected && !hasSpreadsheet ? (
                  <>
                    <FolderOpen className="w-10 h-10 text-blue-600 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">
                        {t('modals.sheetsEditor.noSheetTitle')}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {t('modals.sheetsEditor.noSheetDesc', { email: workspace.userEmail })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenGoogleSetup();
                      }}
                      className="min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md inline-flex items-center gap-2"
                    >
                      <FolderOpen className="w-4 h-4" />
                      <span>{t('modals.sheetsEditor.chooseOrCreateSheet')}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-900">
                        {t('modals.sheetsEditor.connectTitle')}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {t('modals.sheetsEditor.connectDesc')}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 pt-1">
                      <GoogleSignInButton
                        label={t('modals.sheetsEditor.connectGoogle')}
                        isLoading={isConnecting}
                        onClick={() => onConnectGoogle(false)}
                      />
                      {isConnecting && onCancelConnectGoogle && (
                        <button
                          type="button"
                          onClick={onCancelConnectGoogle}
                          className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap"
                        >
                          {t('common.cancel')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenGoogleSetup();
                        }}
                        className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                      >
                        {t('modals.sheetsEditor.openSetupOptions')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Sheets Tab Bar */}
              <div className="flex items-center gap-1 px-4 sm:px-6 border-b border-slate-200 bg-slate-100/60 shrink-0 pt-2 overflow-x-auto">
                {localTabs.map((tab) => (
                  <button
                    key={tab.name}
                    type="button"
                    onClick={() => setActiveTabName(tab.name)}
                    className={`min-h-[38px] px-3 py-2 text-xs font-mono font-medium rounded-t-lg transition-all border-t border-x whitespace-nowrap tabular-nums ${
                      currentTab?.name === tab.name
                        ? 'bg-white text-slate-900 border-slate-200 font-bold -mb-px'
                        : 'text-slate-500 hover:text-slate-800 border-transparent hover:bg-slate-200/50'
                    }`}
                  >
                    {tab.name} ({tab.rows.length})
                  </button>
                ))}
              </div>

              {/* Table Body */}
              <div className="flex-1 overflow-auto p-4 bg-slate-50/50">
                {!currentTab ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    {t('modals.sheetsEditor.noTabs')}
                  </div>
                ) : currentTab.rows.length === 0 ? (
                  <div className="h-full min-h-[240px] border border-dashed border-slate-300 rounded-xl bg-white p-6 flex flex-col items-center justify-center text-center space-y-3">
                    <FileSpreadsheet className="w-8 h-8 text-slate-300" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {t('modals.sheetsEditor.zeroRowsTitle', { tab: currentTab.name })}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 max-w-sm">
                        {t('modals.sheetsEditor.zeroRowsDesc', {
                          cols: currentTab.columns.join(', '),
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-semibold flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('modals.sheetsEditor.addFirstRow')}</span>
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-auto bg-white shadow-xs">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-200 font-mono text-slate-600 sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 w-12 text-center text-slate-400">#</th>
                          {currentTab.columns.map((col) => (
                            <th
                              key={col}
                              className="p-2.5 font-semibold border-r border-slate-200 whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                          <th className="p-2.5 w-16 text-center">
                            {t('modals.sheetsEditor.actionCol')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {currentTab.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-blue-50/20 group">
                            <td className="p-2 text-center text-slate-400 text-[11px] tabular-nums">
                              {rowIdx + 1}
                            </td>
                            {currentTab.columns.map((col) => (
                              <td key={col} className="p-1 border-r border-slate-100 min-w-[140px]">
                                <input
                                  type="text"
                                  value={row[col] ?? ''}
                                  onChange={(e) => handleCellChange(rowIdx, col, e.target.value)}
                                  className="w-full min-h-[36px] px-2 py-1.5 text-xs text-slate-800 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:outline-none"
                                />
                              </td>
                            ))}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(rowIdx)}
                                title={t('modals.sheetsEditor.deleteRecordTitle')}
                                aria-label={t('modals.sheetsEditor.deleteRowAria', { row: rowIdx + 1 })}
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-400 hover:text-red-600 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="px-4 sm:px-6 py-2.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono shrink-0">
            <div className="truncate max-w-full sm:max-w-[65%]">
              {canEditLive && workspace.spreadsheet.url ? (
                <a
                  href={workspace.spreadsheet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 hover:underline inline-flex items-center gap-1"
                >
                  <span className="truncate">{workspace.spreadsheet.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ) : workspace.isDemoMode ? (
                <span>{t('modals.sheetsEditor.footerDemo')}</span>
              ) : (
                <span>{t('modals.sheetsEditor.footerNoSheet')}</span>
              )}
            </div>

            <span className="tabular-nums">
              {currentTab
                ? t('modals.sheetsEditor.footerRowsInTab', {
                    count: currentTab.rows.length,
                    tab: currentTab.name,
                  })
                : t('modals.sheetsEditor.footerZeroTabs')}
              {workspace.lastReadAt
                ? ` ${t('modals.sheetsEditor.footerReadAt', { time: workspace.lastReadAt })}`
                : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Confirmation Dialogs */}
      {confirmAction === 'save-sheets' && (
        <WorkspaceConfirmModal
          isOpen
          title={t('modals.sheetsEditor.confirmSaveTitle')}
          description={t('modals.sheetsEditor.confirmSaveDesc', {
            sheet: workspace.spreadsheet.name,
          })}
          details={[
            t('modals.sheetsEditor.confirmSaveIdDetail', { id: workspace.spreadsheet.id }),
            t('modals.sheetsEditor.confirmSaveTabsDetail', {
              tabs: localTabs.map((tab) => `${tab.name} (${tab.rows.length})`).join(', '),
            }),
            t('modals.sheetsEditor.confirmSaveTotalDetail', { count: totalRowsCount }),
          ]}
          confirmLabel={t('modals.sheetsEditor.saveToSheets')}
          isBusy={isBusy}
          onConfirm={handleConfirmAction}
          onCancel={() => {
            if (!isBusy) setConfirmAction(null);
          }}
        />
      )}

      {confirmAction === 'discard-refresh' && (
        <WorkspaceConfirmModal
          isOpen
          title={t('modals.sheetsEditor.confirmDiscardTitle')}
          description={t('modals.sheetsEditor.confirmDiscardDesc')}
          confirmLabel={t('modals.sheetsEditor.confirmDiscardBtn')}
          isDanger
          isBusy={isBusy}
          onConfirm={handleConfirmAction}
          onCancel={() => {
            if (!isBusy) setConfirmAction(null);
          }}
        />
      )}
    </>
  );
};
