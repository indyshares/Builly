import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  FolderOpen,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BuillyLogo } from '../components/common/BuillyLogo';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { useAuth } from '../features/identity/AuthContext';
import { useWorkspaceConnection } from '../features/workspace-connection/useWorkspaceConnection';

interface WorkspaceConnectPageProps {
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
}

export const WorkspaceConnectPage: React.FC<WorkspaceConnectPageProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { status: authStatus, owner, signOut, isBusy: authBusy } = useAuth();
  const workspaceConn = useWorkspaceConnection();
  const [callbackBanner, setCallbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const wsSuccess = params.get('workspace');
    const wsErr = params.get('workspaceError');

    if (wsSuccess === 'connected') {
      setCallbackBanner({
        type: 'success',
        message: t('workspace.connectedSuccess'),
      });
      workspaceConn.refreshStatus();
    } else if (wsErr) {
      setCallbackBanner({
        type: 'error',
        message:
          wsErr === 'consent_cancelled' || wsErr === 'access_denied'
            ? t('workspace.consentCancelled')
            : t('workspace.authNotice', { error: wsErr }),
      });
    }
  }, [t]);

  if (authStatus !== 'authenticated' || !owner) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      <header className="px-4 sm:px-6 lg:px-8 h-16 border-b border-[#211B2E]/10 bg-[#F7F6FA] flex items-center justify-between gap-4">
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

        <div className="flex items-center gap-2.5">
          <LanguageSwitcher size="sm" />
          <button
            type="button"
            onClick={() => onNavigate('/console')}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('navigation.console')}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/builder')}
            className="min-h-[40px] px-3 py-2 rounded-lg border border-[#211B2E]/15 bg-white hover:bg-[#FAF9FC] text-xs sm:text-sm font-medium text-[#211B2E] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>{t('navigation.openBuilder')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div className="space-y-2">
          <h1 className="font-['Outfit',sans-serif] text-2xl sm:text-3xl font-semibold text-[#211B2E]">
            {t('workspace.title')}
          </h1>
          <p className="text-sm sm:text-base text-[#4A435C] leading-relaxed">
            {t('workspace.subtitle')}
          </p>
        </div>

        {callbackBanner && (
          <div
            role={callbackBanner.type === 'error' ? 'alert' : 'status'}
            className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
              callbackBanner.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-950'
            }`}
          >
            {callbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <span>{callbackBanner.message}</span>
          </div>
        )}

        {/* Step 1: Verified Builly Owner Identity */}
        <section className="rounded-2xl border border-[#211B2E]/10 bg-white p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {owner.avatarUrl ? (
                <img
                  src={owner.avatarUrl}
                  alt={owner.displayName}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-[#211B2E]/15 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#211B2E] text-white text-sm font-bold flex items-center justify-center shrink-0">
                  {owner.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#6C2CEB]">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('workspace.step1Title')}</span>
                </div>
                <div className="text-sm font-semibold text-[#211B2E] truncate">
                  {owner.displayName} · {owner.email}
                </div>
                <div className="text-[11px] font-mono text-[#574F6B] truncate">
                  {t('workspace.ownerId', { id: owner.ownerId })}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={authBusy}
              onClick={async () => {
                await signOut();
                onNavigate('/', { replace: true });
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#4A435C] hover:text-[#211B2E] inline-flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('navigation.signOut')}</span>
            </button>
          </div>
        </section>

        {/* Step 2: Separate Google Workspace OAuth Status */}
        <section className="rounded-2xl border border-[#211B2E]/10 bg-white p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#6C2CEB]">
              <Cloud className="w-4 h-4 shrink-0" />
              <span>{t('workspace.step2Title')}</span>
            </div>
            <button
              type="button"
              onClick={() => workspaceConn.refreshStatus()}
              disabled={workspaceConn.phase === 'loading'}
              className="text-xs font-medium text-[#574F6B] hover:text-[#211B2E] inline-flex items-center gap-1"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${workspaceConn.phase === 'loading' ? 'animate-spin' : ''}`}
              />
              <span>{t('common.refresh')}</span>
            </button>
          </div>

          {workspaceConn.error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-900 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{workspaceConn.error}</span>
            </div>
          )}

          {workspaceConn.phase === 'loading' || workspaceConn.phase === 'connecting' ? (
            <div className="py-6 flex items-center gap-3 text-sm text-[#4A435C]">
              <Loader2 className="w-5 h-5 text-[#6C2CEB] animate-spin shrink-0" />
              <span>
                {workspaceConn.phase === 'connecting'
                  ? t('workspace.redirecting')
                  : t('workspace.checkingStatus')}
              </span>
            </div>
          ) : workspaceConn.phase === 'worker_unconfigured' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-2 text-xs text-amber-950">
                <div className="font-semibold">
                  {t('workspace.workerUnconfiguredTitle')}
                </div>
                <p className="leading-relaxed text-amber-900">
                  {t('workspace.workerUnconfiguredDesc1')}
                </p>
                <p className="leading-relaxed text-amber-900">
                  {t('workspace.workerUnconfiguredDesc2')}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('/builder')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <span>{t('workspace.continueToBuilder')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : workspaceConn.connected && workspaceConn.account ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{t('workspace.connectedTitle')}</span>
                  </div>
                </div>
                <div className="text-xs text-emerald-900">
                  {t('workspace.accountLabel')} <strong>{workspaceConn.account.displayName}</strong> (
                  {workspaceConn.account.email})
                </div>
                {workspaceConn.grantedScopes.length > 0 && (
                  <div className="text-[11px] font-mono text-emerald-800 break-all">
                    {t('workspace.scopesLabel', { scopes: workspaceConn.grantedScopes.join(' · ') })}
                  </div>
                )}
              </div>

              {workspaceConn.differentAccountNotice && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-950">
                  {workspaceConn.differentAccountNotice}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => workspaceConn.disconnectWorkspace()}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg border border-[#211B2E]/15 text-xs font-medium text-[#4A435C] hover:text-red-700 hover:border-red-200 inline-flex items-center gap-1.5"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>{t('workspace.disconnectBtn')}</span>
                </button>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate('/builder')}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-[#211B2E]/15 bg-white hover:bg-[#FAF9FC] text-xs sm:text-sm font-medium text-[#211B2E] inline-flex items-center gap-1.5"
                  >
                    <span>{t('workspace.continueToBuilder')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/console')}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <span>{t('workspace.returnToConsole')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {workspaceConn.needsReauth && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-950">
                  {t('workspace.reauthWarning')}
                </div>
              )}

              <p className="text-sm text-[#4A435C] leading-relaxed">
                {t('workspace.consentDesc')}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    workspaceConn.connectWorkspace({
                      returnTo: '/workspace',
                      forceConsent: true,
                    })
                  }
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-sm font-semibold inline-flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>
                    {workspaceConn.needsReauth
                      ? t('workspace.reconnectBtn')
                      : t('workspace.connectBtn')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('/builder')}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#211B2E]/20 bg-white hover:bg-[#FAF9FC] text-sm font-medium text-[#211B2E]"
                >
                  {t('workspace.skipForNow')}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
