import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FolderOpen,
  Loader2,
  LogOut,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BuillyLogo } from '../components/common/BuillyLogo';
import { GoogleSignInButton } from '../components/common/GoogleSignInButton';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { useAuth } from '../features/identity/AuthContext';
import {
  completeAuthCallback,
  consumePendingReturnTo,
  isEmbeddedIframe,
} from '../features/identity/authService';
import { buildLoginUrl, sanitizeReturnTo } from '../utils/routes';

interface LoginPageProps {
  mode: 'login' | 'callback';
  returnTo?: string;
  protectedBuilderNotice?: boolean;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onEnterLocalPreview?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  mode,
  returnTo,
  protectedBuilderNotice = false,
  onNavigate,
  onEnterLocalPreview,
}) => {
  const { t } = useTranslation();
  const { status, isConfigured, owner, error, isBusy, signInWithGoogle, signOut, clearError } =
    useAuth();
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [callbackBusy, setCallbackBusy] = useState<boolean>(mode === 'callback');
  const [localError, setLocalError] = useState<string | null>(null);

  const safeReturnTo = sanitizeReturnTo(returnTo, '/console');
  const embeddedInIframe = isEmbeddedIframe();
  const standaloneLoginHref =
    typeof window !== 'undefined'
      ? `${window.location.origin}${buildLoginUrl(safeReturnTo)}`
      : buildLoginUrl(safeReturnTo);

  // If AuthContext already restored or completed session on /auth/callback, navigate immediately
  useEffect(() => {
    if (mode !== 'callback') return;
    if (status === 'authenticated' && owner) {
      const dest = consumePendingReturnTo();
      onNavigate(dest, { replace: true });
    }
  }, [mode, status, owner, onNavigate]);

  useEffect(() => {
    if (mode !== 'callback') return;
    let active = true;
    setCallbackBusy(true);
    setCallbackError(null);

    completeAuthCallback()
      .then((res) => {
        if (!active) return;
        if (res.error) {
          setCallbackError(res.error);
          setCallbackBusy(false);
          return;
        }
        if (res.session?.user) {
          const dest = consumePendingReturnTo();
          onNavigate(dest, { replace: true });
        } else {
          setCallbackError(t('auth.callbackNoSession'));
          setCallbackBusy(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        setCallbackError(err instanceof Error ? err.message : t('auth.callbackFailed'));
        setCallbackBusy(false);
      });

    return () => {
      active = false;
    };
  }, [mode, onNavigate, t]);

  const handleGoogleLogin = async () => {
    setLocalError(null);
    clearError();
    try {
      await signInWithGoogle(safeReturnTo);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : t('auth.couldNotStartSignIn'));
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col">
      {/* Top Bar */}
      <header className="px-4 sm:px-6 lg:px-8 h-16 border-b border-[#211B2E]/10 bg-[#F7F6FA] flex items-center justify-between gap-3">
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
            onClick={() => onNavigate('/')}
            className="min-h-[40px] px-3 py-2 text-xs sm:text-sm font-medium text-[#4A435C] hover:text-[#211B2E] inline-flex items-center gap-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('auth.backToHome')}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-[#211B2E]/12 shadow-sm p-6 sm:p-8 space-y-6">
          {mode === 'callback' ? (
            <div className="space-y-4 text-center py-4">
              {callbackBusy ? (
                <>
                  <Loader2 className="w-8 h-8 text-[#6C2CEB] animate-spin mx-auto" />
                  <h1 className="font-['Outfit',sans-serif] text-xl font-semibold text-[#211B2E]">
                    {t('auth.completingTitle')}
                  </h1>
                  <p className="text-sm text-[#4A435C]">
                    {t('auth.completingSubtitle')}
                  </p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
                  <h1 className="font-['Outfit',sans-serif] text-xl font-semibold text-[#211B2E]">
                    {t('auth.callbackFailedTitle')}
                  </h1>
                  <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3.5 text-left leading-relaxed">
                    {callbackError || t('auth.callbackInvalidSession')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(buildLoginUrl(safeReturnTo), { replace: true });
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-sm font-semibold"
                    >
                      {t('auth.restartSignIn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('/', { replace: true })}
                      className="min-h-[42px] px-4 py-2 rounded-lg border border-[#211B2E]/15 text-sm font-medium text-[#211B2E]"
                    >
                      {t('auth.returnHome')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : !isConfigured ? (
            /* Honest Unconfigured State — Never a Fake Login */
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-800">
                  <Terminal className="w-4 h-4 shrink-0" />
                  <span>{t('auth.unconfiguredBadge')}</span>
                </div>
                <h1 className="font-['Outfit',sans-serif] text-2xl font-semibold text-[#211B2E]">
                  {protectedBuilderNotice
                    ? t('auth.unconfiguredProtectedTitle')
                    : t('auth.unconfiguredTitle')}
                </h1>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  {t('auth.unconfiguredDesc')}
                </p>
              </div>

              <div className="rounded-xl border border-[#211B2E]/12 bg-[#FAF9FC] p-4 space-y-2.5 text-xs text-[#211B2E]">
                <div className="font-semibold">{t('auth.envVarsTitle')}</div>
                <pre className="p-2.5 rounded-lg bg-[#211B2E] text-[#F7F6FA] font-mono text-[11px] overflow-x-auto">
{`VITE_CONSOLE_API_BASE_URL="https://builly-project.mycloudsfireworks.workers.dev"`}
                </pre>
                <p className="text-[#4A435C] leading-relaxed">
                  {t('auth.envVarsDescBefore')}{' '}
                  <code className="font-mono text-[#6C2CEB]">
                    https://builly.indyshares.com/api/auth/google/callback
                  </code>{' '}
                  {t('auth.envVarsDescAfter')}
                </p>
              </div>

              {onEnterLocalPreview && (
                <div className="pt-2 border-t border-[#211B2E]/10 space-y-2.5">
                  <p className="text-xs text-[#574F6B]">
                    {t('auth.localDraftHint')}
                  </p>
                  <button
                    type="button"
                    onClick={onEnterLocalPreview}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[#211B2E]/20 bg-white hover:bg-[#FAF9FC] text-sm font-semibold text-[#211B2E] inline-flex items-center justify-center gap-2"
                  >
                    <span>{t('auth.openLocalDraft')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : status === 'loading' ? (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-7 h-7 text-[#6C2CEB] animate-spin mx-auto" />
              <p className="text-sm text-[#4A435C]">{t('auth.restoringSession')}</p>
            </div>
          ) : status === 'authenticated' && owner ? (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6C2CEB]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('auth.sessionActiveBadge')}</span>
                </div>
                <h1 className="font-['Outfit',sans-serif] text-2xl font-semibold text-[#211B2E]">
                  {t('auth.welcomeBack', { name: owner.displayName })}
                </h1>
              </div>

              <div className="p-4 rounded-xl border border-[#211B2E]/10 bg-[#FAF9FC] flex items-center gap-3">
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
                  <div className="text-sm font-semibold text-[#211B2E] truncate">
                    {owner.displayName}
                  </div>
                  <div className="text-xs text-[#4A435C] truncate">{owner.email}</div>
                  <div className="text-[11px] font-mono text-[#574F6B] truncate">
                    {t('auth.ownerIdLabel', { id: owner.ownerId })}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate(safeReturnTo)}
                  className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                >
                  <span>{t('auth.openConsole')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/builder')}
                  className="min-h-[44px] w-full px-4 py-2.5 rounded-xl border border-[#211B2E]/15 bg-white hover:bg-[#FAF9FC] text-[#211B2E] text-sm font-medium inline-flex items-center justify-center gap-2"
                >
                  <span>{t('auth.openMyBuilder')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/workspace')}
                  className="min-h-[44px] w-full px-4 py-2.5 rounded-xl border border-[#211B2E]/15 bg-white hover:bg-[#FAF9FC] text-[#211B2E] text-sm font-medium inline-flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4 text-[#6C2CEB]" />
                  <span>{t('auth.manageWorkspaceConnection')}</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => signOut()}
                  className="min-h-[40px] w-full px-4 py-2 text-xs font-medium text-[#574F6B] hover:text-[#211B2E] inline-flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t('auth.signOutBuilly')}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Signed Out — Direct Builly Worker → Google OAuth entry */
            <div className="space-y-6">
              <div className="space-y-2">
                <h1 className="font-['Outfit',sans-serif] text-2xl font-semibold text-[#211B2E]">
                  {protectedBuilderNotice
                    ? t('auth.signInToOpenBuilder')
                    : t('auth.signInToBuilly')}
                </h1>
                <p className="text-sm text-[#4A435C] leading-relaxed">
                  {t('auth.signInSubtitle')}
                </p>
              </div>

              {embeddedInIframe && (
                <div className="p-4 rounded-xl border border-[#6C2CEB]/25 bg-[#6C2CEB]/5 space-y-3 text-xs text-[#211B2E]">
                  <div className="font-semibold">
                    {t('auth.iframeTitle')}
                  </div>
                  <p className="text-[#4A435C] leading-relaxed">
                    {t('auth.iframeDesc')}
                  </p>
                  <a
                    href={standaloneLoginHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <span>{t('auth.openInTab')}</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              )}

              {(localError || error) && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-900 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{localError || error}</span>
                </div>
              )}

              <div className="space-y-3">
                <GoogleSignInButton
                  label={t('auth.continueWithGoogle')}
                  isLoading={isBusy}
                  disabled={isBusy}
                  onClick={handleGoogleLogin}
                  className="w-full justify-center min-h-[46px]"
                />
                <p className="text-[11px] text-[#574F6B] leading-relaxed">
                  {t('auth.identityOnlyNote')}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
