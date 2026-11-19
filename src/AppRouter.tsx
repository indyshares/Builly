import React, { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import App from './App';
import { AuthProvider, useAuth } from './features/identity/AuthContext';
import { ConsolePage } from './pages/ConsolePage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PublicSiteRuntimePage } from './pages/PublicSiteRuntimePage';
import { WorkspaceConnectPage } from './pages/WorkspaceConnectPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { BuillyLogo } from './components/common/BuillyLogo';
import { loadActiveProjectContext } from './services/storageService';
import {
  buildConsoleUrl,
  buildLoginUrl,
  parseBuilderProjectParams,
  useAppRouter,
} from './utils/routes';

const RouterContent: React.FC = () => {
  const { t } = useTranslation();
  const { route, navigate } = useAppRouter();
  const { status, isConfigured, owner, accessToken, signOut } = useAuth();
  const [allowUnconfiguredLocalPreview, setAllowUnconfiguredLocalPreview] = useState(false);

  if (route.kind === 'public-site' && route.siteSlug) {
    return (
      <PublicSiteRuntimePage
        siteSlug={route.siteSlug}
        initialSubPath={route.sitePagePath || '/'}
        onNavigate={navigate}
      />
    );
  }

  if (route.kind === 'privacy') {
    return <PrivacyPolicyPage onNavigate={navigate} />;
  }

  if (route.kind === 'terms') {
    return <TermsOfServicePage onNavigate={navigate} />;
  }

  if (route.kind === 'landing') {
    return <LandingPage onNavigate={navigate} />;
  }

  if (route.kind === 'login') {
    const params = new URLSearchParams(route.search);
    const returnTo = params.get('returnTo') || '/console';
    return (
      <LoginPage
        mode="login"
        returnTo={returnTo}
        onNavigate={navigate}
        onEnterLocalPreview={
          !isConfigured
            ? () => {
                setAllowUnconfiguredLocalPreview(true);
                navigate('/builder');
              }
            : undefined
        }
      />
    );
  }

  if (route.kind === 'auth-callback') {
    return <LoginPage mode="callback" onNavigate={navigate} />;
  }

  if (route.kind === 'console') {
    if (status === 'loading') {
      return (
        <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col items-center justify-center gap-4 p-6">
          <BuillyLogo variant="full" size="lg" theme="light" />
          <div className="flex items-center gap-3 text-sm font-medium">
            <Loader2 className="w-5 h-5 text-[#6C2CEB] animate-spin" />
            <span>{t('router.restoringOwner')}</span>
          </div>
        </div>
      );
    }

    if (status !== 'authenticated') {
      return (
        <LoginPage
          mode="login"
          returnTo={route.fullPath}
          protectedBuilderNotice
          onNavigate={navigate}
          onEnterLocalPreview={
            !isConfigured
              ? () => {
                  setAllowUnconfiguredLocalPreview(true);
                  navigate('/builder');
                }
              : undefined
          }
        />
      );
    }

    return <ConsolePage pathname={route.pathname} onNavigate={navigate} />;
  }

  if (route.kind === 'workspace') {
    if (status === 'loading') {
      return (
        <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col items-center justify-center gap-4 p-6">
          <BuillyLogo variant="full" size="lg" theme="light" />
          <div className="flex items-center gap-3 text-sm font-medium">
            <Loader2 className="w-5 h-5 text-[#6C2CEB] animate-spin" />
            <span>{t('router.restoringOwner')}</span>
          </div>
        </div>
      );
    }

    if (status !== 'authenticated') {
      return (
        <LoginPage
          mode="login"
          returnTo="/workspace"
          protectedBuilderNotice
          onNavigate={navigate}
          onEnterLocalPreview={
            !isConfigured
              ? () => {
                  setAllowUnconfiguredLocalPreview(true);
                  navigate('/builder');
                }
              : undefined
          }
        />
      );
    }

    return <WorkspaceConnectPage onNavigate={navigate} />;
  }

  // Protected Visual Builder route (/builder, /editor, /app, or legacy ?page=...)
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] flex flex-col items-center justify-center gap-4 p-6">
        <BuillyLogo variant="full" size="lg" theme="light" />
        <div className="flex items-center gap-3 text-sm font-medium">
          <Loader2 className="w-5 h-5 text-[#6C2CEB] animate-spin" />
          <span>{t('router.restoringBuilder')}</span>
        </div>
      </div>
    );
  }

  // When Supabase Auth IS configured, strictly require authenticated Builly owner session
  if (isConfigured && status !== 'authenticated') {
    return (
      <LoginPage
        mode="login"
        returnTo={route.fullPath}
        protectedBuilderNotice
        onNavigate={navigate}
      />
    );
  }

  // When Supabase Auth is NOT configured, show honest setup gate unless user explicitly chooses local draft preview
  if (!isConfigured && !allowUnconfiguredLocalPreview) {
    return (
      <LoginPage
        mode="login"
        returnTo={route.fullPath}
        protectedBuilderNotice
        onNavigate={navigate}
        onEnterLocalPreview={() => setAllowUnconfiguredLocalPreview(true)}
      />
    );
  }

  const builderQuery = parseBuilderProjectParams(route.search);
  const storedProjectCtx = loadActiveProjectContext();
  const effectiveOrgId = builderQuery.orgId || storedProjectCtx?.orgId;
  const effectiveProjectId = builderQuery.projectId || storedProjectCtx?.projectId;
  const projectContext =
    effectiveOrgId || effectiveProjectId
      ? {
          orgId: effectiveOrgId,
          projectId: effectiveProjectId,
          orgName:
            storedProjectCtx?.orgId === effectiveOrgId ? storedProjectCtx?.orgName : undefined,
          projectName:
            storedProjectCtx?.projectId === effectiveProjectId
              ? storedProjectCtx?.projectName
              : undefined,
        }
      : null;
  const initialPanel = new URLSearchParams(route.search || '').get('panel');

  return (
    <div className="relative h-[100dvh] w-full flex flex-col">
      {!isConfigured && allowUnconfiguredLocalPreview && (
        <div
          role="status"
          className="bg-[#211B2E] text-[#F7F6FA] px-4 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-2 shrink-0"
        >
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#C4B5FD] shrink-0" />
            <span>{t('router.localDraftBanner')}</span>
          </div>
          <button
            type="button"
            onClick={() => navigate(buildLoginUrl(route.fullPath))}
            className="text-[#C4B5FD] hover:underline font-semibold whitespace-nowrap"
          >
            {t('router.setupGuide')}
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <App
          buillyOwner={owner}
          supabaseAccessToken={accessToken}
          projectContext={projectContext}
          initialPanel={initialPanel}
          onNavigateConsole={() =>
            navigate(
              buildConsoleUrl({
                orgId: effectiveOrgId,
                projectId: effectiveProjectId,
              })
            )
          }
          onNavigateLanding={() => navigate('/')}
          onOpenWorkspaceConnect={() => navigate('/workspace')}
          onOpenRuntimeRoute={(path) => navigate(path)}
          onSignOutOwner={
            owner
              ? async () => {
                  await signOut();
                  navigate('/', { replace: true });
                }
              : undefined
          }
        />
      </div>
    </div>
  );
};

export const AppRouter: React.FC = () => {
  return (
    <AuthProvider>
      <RouterContent />
    </AuthProvider>
  );
};
