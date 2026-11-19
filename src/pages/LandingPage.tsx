import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Database,
  FileSpreadsheet,
  FolderOpen,
  Layers,
  LayoutTemplate,
  Lock,
  Menu,
  Monitor,
  Palette,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BuillyLogo } from '../components/common/BuillyLogo';
import { LanguageSwitcher } from '../components/common/LanguageSwitcher';
import { useAuth } from '../features/identity/AuthContext';
import { isEmbeddedIframe } from '../features/identity/authService';
import { buildLoginUrl } from '../utils/routes';
import heroPreviewImg from '../assets/images/hero_creative_director_1794451337351.jpg';
import projectPreviewImg from '../assets/images/project_minimalist_fintech_1794451338248.jpg';

interface LandingPageProps {
  onNavigate: (to: string) => void;
}

type PreviewViewport = 'desktop' | 'tablet' | 'mobile';

const HOW_IT_WORKS_STEPS = [
  {
    number: '01',
    titleKey: 'landing.howItWorks.step1Title',
    descKey: 'landing.howItWorks.step1Desc',
    icon: ShieldCheck,
  },
  {
    number: '02',
    titleKey: 'landing.howItWorks.step2Title',
    descKey: 'landing.howItWorks.step2Desc',
    icon: FolderOpen,
  },
  {
    number: '03',
    titleKey: 'landing.howItWorks.step3Title',
    descKey: 'landing.howItWorks.step3Desc',
    icon: LayoutTemplate,
  },
  {
    number: '04',
    titleKey: 'landing.howItWorks.step4Title',
    descKey: 'landing.howItWorks.step4Desc',
    icon: Rocket,
  },
] as const;

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { status, owner, isConfigured, isBusy, signInWithGoogle, signOut, error, clearError } =
    useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('desktop');
  const [authActionError, setAuthActionError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [cardImgFailed, setCardImgFailed] = useState(false);

  const isAuthenticated = status === 'authenticated' && Boolean(owner);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handlePrimaryCta = async () => {
    setAuthActionError(null);
    clearError();

    if (isAuthenticated) {
      onNavigate('/console');
      return;
    }

    if (!isConfigured || isEmbeddedIframe()) {
      onNavigate(buildLoginUrl('/console'));
      return;
    }

    try {
      await signInWithGoogle('/console');
    } catch (err) {
      setAuthActionError(
        err instanceof Error ? err.message : t('landing.unableToSignIn')
      );
    }
  };

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6FA] text-[#211B2E] font-sans selection:bg-[#6C2CEB]/15 selection:text-[#211B2E]">
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#211B2E] focus:text-[#F7F6FA] focus:text-sm focus:font-semibold"
      >
        {t('landing.skipToMain')}
      </a>

      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-40 bg-[#F7F6FA]/95 backdrop-blur-sm border-b border-[#211B2E]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          {/* Zone 1: Brand Mark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="inline-flex items-center shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB]"
            aria-label={t('landing.homeAria')}
          >
            <BuillyLogo mode="responsive" theme="light" />
          </a>

          {/* Zone 2: Concise Single-Line Navigation Links */}
          <nav
            aria-label={t('landing.primaryNavAria')}
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#211B2E]/80"
          >
            <a
              href="#product"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('product');
              }}
              className="whitespace-nowrap shrink-0 hover:text-[#211B2E] underline-offset-4 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB] rounded"
            >
              {t('navigation.product')}
            </a>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('features');
              }}
              className="whitespace-nowrap shrink-0 hover:text-[#211B2E] underline-offset-4 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB] rounded"
            >
              {t('navigation.features')}
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('how-it-works');
              }}
              className="whitespace-nowrap shrink-0 hover:text-[#211B2E] underline-offset-4 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB] rounded"
            >
              {t('navigation.howItWorks')}
            </a>
            <a
              href="#data-ownership"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('data-ownership');
              }}
              className="whitespace-nowrap shrink-0 hover:text-[#211B2E] underline-offset-4 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB] rounded"
            >
              {t('navigation.dataOwnership')}
            </a>
          </nav>

          {/* Zone 3: Language Switcher + Primary Auth / Builder Action + Mobile Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageSwitcher size="sm" className="hidden sm:inline-flex" />

            {isAuthenticated ? (
              <div className="hidden md:flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('/workspace')}
                  className="text-sm font-medium text-[#211B2E]/80 hover:text-[#211B2E] whitespace-nowrap shrink-0 px-2 py-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
                >
                  {t('navigation.workspace')}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/console')}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-sm font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
                >
                  <span>{t('landing.openConsole')}</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            ) : (
              <div className="hidden md:flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate(buildLoginUrl('/console'))}
                  className="min-h-[40px] px-3 py-2 text-sm font-medium text-[#211B2E]/80 hover:text-[#211B2E] whitespace-nowrap shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
                >
                  {t('navigation.signIn')}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handlePrimaryCta}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] disabled:opacity-60 text-white text-sm font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
                >
                  <span>{t('landing.startBuilding')}</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-controls="landing-mobile-nav"
              aria-label={mobileMenuOpen ? t('landing.closeMenuAria') : t('landing.openMenuAria')}
              className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[#211B2E]/15 text-[#211B2E] hover:bg-[#211B2E]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Accessible Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            id="landing-mobile-nav"
            aria-label={t('landing.mobileNavAria')}
            className="md:hidden border-t border-[#211B2E]/10 bg-[#F7F6FA] px-4 py-4 space-y-2"
          >
            <div className="flex items-center justify-between px-3 pb-2 border-b border-[#211B2E]/10">
              <span className="text-xs font-semibold text-[#574F6B]">{t('language.label')}</span>
              <LanguageSwitcher size="sm" />
            </div>

            {[
              { id: 'product', label: t('navigation.product') },
              { id: 'features', label: t('navigation.features') },
              { id: 'how-it-works', label: t('navigation.howItWorks') },
              { id: 'data-ownership', label: t('navigation.dataOwnership') },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection(item.id);
                }}
                className="min-h-[44px] px-3 flex items-center text-sm font-medium text-[#211B2E] hover:bg-[#211B2E]/5 rounded-lg"
              >
                {item.label}
              </a>
            ))}

            <div className="pt-2 border-t border-[#211B2E]/10 flex flex-col gap-2">
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/console');
                    }}
                    className="min-h-[44px] w-full px-4 rounded-lg bg-[#6C2CEB] text-white text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <span>{t('landing.openConsole')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate('/workspace');
                    }}
                    className="min-h-[44px] w-full px-4 rounded-lg border border-[#211B2E]/15 text-[#211B2E] text-sm font-medium"
                  >
                    {t('navigation.manageWorkspace')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handlePrimaryCta();
                    }}
                    className="min-h-[44px] w-full px-4 rounded-lg bg-[#6C2CEB] text-white text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <span>{t('landing.startBuilding')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onNavigate(buildLoginUrl('/console'));
                    }}
                    className="min-h-[44px] w-full px-4 rounded-lg border border-[#211B2E]/15 text-[#211B2E] text-sm font-medium"
                  >
                    {t('navigation.signIn')}
                  </button>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main id="main-content">
        {/* Hero Section */}
        <section
          id="product"
          className="relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28"
        >
          {/* Restrained radial ambient highlight (strictly 10% accent mood) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-0 w-[620px] h-[520px] rounded-full opacity-30 blur-3xl"
            style={{
              background:
                'radial-gradient(circle at 60% 40%, rgba(108, 44, 235, 0.22), rgba(247, 246, 250, 0) 70%)',
            }}
          />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Left: Editorial Copy & Action */}
              <div className="lg:col-span-5 space-y-6">
                <p className="text-xs sm:text-sm font-medium text-[#574F6B] tracking-tight">
                  {t('landing.eyebrow')}
                </p>

                <h1
                  className="font-['Outfit',sans-serif] font-semibold tracking-tight text-[#211B2E] leading-[1.06]"
                  style={{ fontSize: 'clamp(2.4rem, 4.4vw, 3.85rem)', textWrap: 'balance' }}
                >
                  {t('landing.title')}
                </h1>

                <p className="text-base sm:text-lg text-[#4A435C] leading-relaxed max-w-xl">
                  {t('landing.subtitle')}
                </p>

                {/* Primary & Secondary Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handlePrimaryCta}
                    className="min-h-[48px] px-6 py-3 rounded-xl bg-[#6C2CEB] hover:bg-[#5920CB] disabled:opacity-60 text-white text-sm sm:text-base font-semibold inline-flex items-center gap-2.5 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
                  >
                    <span>
                      {isAuthenticated ? t('landing.openConsole') : t('landing.startBuilding')}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => scrollToSection('features')}
                    className="min-h-[48px] px-5 py-3 rounded-xl border border-[#211B2E]/20 bg-white/80 hover:bg-white text-[#211B2E] text-sm sm:text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
                  >
                    {t('landing.exploreFeatures')}
                  </button>
                </div>

                {/* Signed-in Owner Summary OR Config Error Feedback */}
                {isAuthenticated && owner && (
                  <div className="pt-2 border-t border-[#211B2E]/10 flex flex-wrap items-center justify-between gap-3 text-xs text-[#4A435C]">
                    <div className="min-w-0">
                      <span className="font-semibold text-[#211B2E]">
                        {t('landing.signedInLabel')}
                      </span>{' '}
                      <span className="truncate">{owner.email || owner.displayName}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => onNavigate('/workspace')}
                        className="font-semibold text-[#6C2CEB] hover:underline"
                      >
                        {t('landing.workspaceSetup')}
                      </button>
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="font-medium text-[#4A435C] hover:text-[#211B2E] hover:underline"
                      >
                        {t('landing.signOut')}
                      </button>
                    </div>
                  </div>
                )}

                {(authActionError || error) && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl border border-red-300 bg-red-50 text-xs text-red-900"
                  >
                    {authActionError || error}
                  </div>
                )}
              </div>

              {/* Right: Spatial Product Preview of Builly Visual Builder */}
              <div className="lg:col-span-7">
                <div
                  className="rounded-2xl p-[1px] shadow-xl"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(108, 44, 235, 0.28), rgba(33, 27, 46, 0.12) 48%, rgba(108, 44, 235, 0.18))',
                  }}
                >
                  <div className="rounded-[15px] bg-white overflow-hidden">
                    {/* Spatial Preview Chrome Bar */}
                    <div className="px-4 py-3 border-b border-[#211B2E]/10 bg-[#FAF9FC] flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <BuillyLogo variant="icon" size="sm" theme="light" />
                        <span className="text-xs font-semibold text-[#211B2E] truncate">
                          {t('landing.preview.canvasTitle')}
                        </span>
                        <span aria-hidden="true" className="text-[#211B2E]/30">
                          ·
                        </span>
                        <span className="text-xs text-[#574F6B] font-mono truncate">
                          /home
                        </span>
                      </div>

                      {/* Interactive Breakpoint Switcher inside Preview */}
                      <div
                        className="inline-flex items-center bg-[#EFEDF5] p-1 rounded-lg"
                        role="group"
                        aria-label={t('landing.preview.breakpointAria')}
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
                            onClick={() => setPreviewViewport(id)}
                            className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#6C2CEB] ${
                              previewViewport === id
                                ? 'bg-white text-[#211B2E] shadow-xs font-semibold'
                                : 'text-[#574F6B] hover:text-[#211B2E]'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden sm:inline">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Spatial 3-Pane Builder Preview */}
                    <div className="p-4 sm:p-5 bg-[#F2EFF8]/70">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
                        {/* Left Rail: Layers & Structure */}
                        <div className="hidden sm:flex sm:col-span-3 flex-col rounded-xl border border-[#211B2E]/10 bg-white p-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-[#574F6B] pb-1.5 border-b border-[#211B2E]/10">
                            <span>{t('landing.preview.layers')}</span>
                            <Layers className="w-3.5 h-3.5 text-[#6C2CEB]" />
                          </div>
                          {[
                            { name: t('landing.preview.layerGlobalHeader'), active: false },
                            { name: t('landing.preview.layerHeroSection'), active: true },
                            { name: t('landing.preview.layerPortfolioGrid'), active: false },
                            { name: t('landing.preview.layerFooterRegion'), active: false },
                          ].map((layer) => (
                            <div
                              key={layer.name}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium truncate ${
                                layer.active
                                  ? 'bg-[#6C2CEB]/10 text-[#6C2CEB] font-semibold'
                                  : 'text-[#4A435C]'
                              }`}
                            >
                              {layer.name}
                            </div>
                          ))}
                        </div>

                        {/* Center Canvas Surface */}
                        <div className="sm:col-span-6 flex justify-center">
                          <div
                            className={`w-full rounded-xl border border-[#211B2E]/12 bg-white p-3.5 space-y-3 shadow-xs motion-safe:transition-all duration-200 ${
                              previewViewport === 'desktop'
                                ? 'max-w-full'
                                : previewViewport === 'tablet'
                                ? 'max-w-[300px]'
                                : 'max-w-[220px]'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px] text-[#574F6B]">
                              <span className="font-semibold text-[#211B2E]">Alex Rivera</span>
                              <span>Works · About</span>
                            </div>

                            <div className="rounded-lg border border-[#6C2CEB]/40 p-2.5 space-y-2 bg-[#FAF9FC]">
                              <div className="flex items-center justify-between text-[10px] font-semibold text-[#6C2CEB]">
                                <span>{t('landing.preview.selectedHero')}</span>
                                <span className="font-mono tabular-nums">
                                  {previewViewport === 'desktop'
                                    ? '1280px'
                                    : previewViewport === 'tablet'
                                    ? '768px'
                                    : '390px'}
                                </span>
                              </div>
                              <div className="text-sm font-['Outfit',sans-serif] font-semibold text-[#211B2E] leading-snug">
                                {t('landing.preview.heroHeadline')}
                              </div>
                              <div
                                className={`grid gap-2 ${
                                  previewViewport === 'mobile' ? 'grid-cols-1' : 'grid-cols-2'
                                }`}
                              >
                                <div className="aspect-[16/10] rounded-md overflow-hidden bg-[#E7E3F2]">
                                  {!heroImgFailed ? (
                                    <img
                                      src={heroPreviewImg}
                                      alt="Portfolio studio scene preview"
                                      referrerPolicy="no-referrer"
                                      onError={() => setHeroImgFailed(true)}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-[#574F6B]">
                                      {t('landing.preview.heroMediaFallback')}
                                    </div>
                                  )}
                                </div>
                                <div className="aspect-[16/10] rounded-md overflow-hidden bg-[#E7E3F2]">
                                  {!cardImgFailed ? (
                                    <img
                                      src={projectPreviewImg}
                                      alt="Selected case study preview"
                                      referrerPolicy="no-referrer"
                                      onError={() => setCardImgFailed(true)}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-[#574F6B]">
                                      {t('landing.preview.projectCardFallback')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Rail: Style & Workspace Inspector */}
                        <div className="hidden sm:flex sm:col-span-3 flex-col rounded-xl border border-[#211B2E]/10 bg-white p-3 space-y-2.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-[#574F6B] pb-1.5 border-b border-[#211B2E]/10">
                            <span>{t('landing.preview.inspector')}</span>
                            <Palette className="w-3.5 h-3.5 text-[#6C2CEB]" />
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] text-[#574F6B]">
                              {t('landing.preview.layout')}
                            </div>
                            <div className="px-2 py-1 rounded bg-[#F7F6FA] text-[11px] font-mono text-[#211B2E]">
                              {t('landing.preview.layoutValue')}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] text-[#574F6B]">
                              {t('landing.preview.typography')}
                            </div>
                            <div className="px-2 py-1 rounded bg-[#F7F6FA] text-[11px] font-mono text-[#211B2E]">
                              {t('landing.preview.typographyValue')}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-[10px] text-[#574F6B]">
                              {t('landing.preview.sheetsSource')}
                            </div>
                            <div className="px-2 py-1 rounded bg-[#6C2CEB]/10 text-[11px] font-mono text-[#6C2CEB] truncate">
                              {t('landing.preview.projectsTab')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Sections (Asymmetric Spatial Bento Grid) */}
        <section id="features" className="py-16 sm:py-24 border-t border-[#211B2E]/10 bg-white/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="max-w-2xl space-y-3">
              <h2
                className="font-['Outfit',sans-serif] text-2xl sm:text-4xl font-semibold tracking-tight text-[#211B2E]"
                style={{ textWrap: 'balance' }}
              >
                {t('landing.featuresSection.heading')}
              </h2>
              <p className="text-base text-[#4A435C] leading-relaxed">
                {t('landing.featuresSection.subheading')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Feature 01 — Wide Primary Card */}
              <article className="lg:col-span-2 rounded-2xl border border-[#211B2E]/10 bg-white p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tabular-nums text-[#6C2CEB] font-semibold">
                      01
                    </span>
                    <LayoutTemplate className="w-5 h-5 text-[#6C2CEB]" aria-hidden="true" />
                  </div>
                  <h3 className="font-['Outfit',sans-serif] text-xl sm:text-2xl font-semibold text-[#211B2E]">
                    {t('landing.featuresSection.f1Title')}
                  </h3>
                  <p className="text-sm sm:text-base text-[#4A435C] leading-relaxed max-w-2xl">
                    {t('landing.featuresSection.f1Desc')}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-[#211B2E]/8 text-xs text-[#4A435C]">
                  <div>{t('landing.featuresSection.f1Tag1')}</div>
                  <div>{t('landing.featuresSection.f1Tag2')}</div>
                  <div>{t('landing.featuresSection.f1Tag3')}</div>
                </div>
              </article>

              {/* Feature 02 — Responsive */}
              <article className="rounded-2xl border border-[#211B2E]/10 bg-white p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tabular-nums text-[#6C2CEB] font-semibold">
                      02
                    </span>
                    <Monitor className="w-5 h-5 text-[#6C2CEB]" aria-hidden="true" />
                  </div>
                  <h3 className="font-['Outfit',sans-serif] text-xl font-semibold text-[#211B2E]">
                    {t('landing.featuresSection.f2Title')}
                  </h3>
                  <p className="text-sm text-[#4A435C] leading-relaxed">
                    {t('landing.featuresSection.f2Desc')}
                  </p>
                </div>
                <div className="pt-4 border-t border-[#211B2E]/8 text-xs text-[#4A435C]">
                  {t('landing.featuresSection.f2Foot')}
                </div>
              </article>

              {/* Feature 03 — Pages & CMS */}
              <article className="rounded-2xl border border-[#211B2E]/10 bg-white p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tabular-nums text-[#6C2CEB] font-semibold">
                      03
                    </span>
                    <Database className="w-5 h-5 text-[#6C2CEB]" aria-hidden="true" />
                  </div>
                  <h3 className="font-['Outfit',sans-serif] text-xl font-semibold text-[#211B2E]">
                    {t('landing.featuresSection.f3Title')}
                  </h3>
                  <p className="text-sm text-[#4A435C] leading-relaxed">
                    {t('landing.featuresSection.f3Desc')}
                  </p>
                </div>
                <div className="pt-4 border-t border-[#211B2E]/8 text-xs text-[#4A435C]">
                  {t('landing.featuresSection.f3Foot')}
                </div>
              </article>

              {/* Feature 04 — Wide Workspace Card */}
              <article className="lg:col-span-2 rounded-2xl border border-[#211B2E]/10 bg-[#211B2E] text-[#F7F6FA] p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono tabular-nums text-[#C4B5FD] font-semibold">
                      04
                    </span>
                    <FileSpreadsheet className="w-5 h-5 text-[#C4B5FD]" aria-hidden="true" />
                  </div>
                  <h3 className="font-['Outfit',sans-serif] text-xl sm:text-2xl font-semibold text-white">
                    {t('landing.featuresSection.f4Title')}
                  </h3>
                  <p className="text-sm sm:text-base text-[#E2DCF0] leading-relaxed max-w-2xl">
                    {t('landing.featuresSection.f4Desc')}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-white/15 text-xs text-[#E2DCF0]">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                    <span>{t('landing.featuresSection.f4Point1')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#C4B5FD] shrink-0" />
                    <span>{t('landing.featuresSection.f4Point2')}</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-16 sm:py-24 border-t border-[#211B2E]/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="max-w-2xl space-y-3">
              <h2
                className="font-['Outfit',sans-serif] text-2xl sm:text-4xl font-semibold tracking-tight text-[#211B2E]"
                style={{ textWrap: 'balance' }}
              >
                {t('landing.howItWorks.heading')}
              </h2>
              <p className="text-base text-[#4A435C] leading-relaxed">
                {t('landing.howItWorks.subheading')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {HOW_IT_WORKS_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className="rounded-2xl border border-[#211B2E]/10 bg-white p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono tabular-nums font-semibold text-[#6C2CEB]">
                        {step.number}
                      </span>
                      <div className="w-9 h-9 rounded-lg bg-[#6C2CEB]/10 text-[#6C2CEB] flex items-center justify-center">
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </div>
                    </div>
                    <h3 className="font-['Outfit',sans-serif] text-lg font-semibold text-[#211B2E]">
                      {t(step.titleKey)}
                    </h3>
                    <p className="text-sm text-[#4A435C] leading-relaxed">{t(step.descKey)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Data Ownership & Architecture Transparency */}
        <section
          id="data-ownership"
          className="py-16 sm:py-24 bg-[#211B2E] text-[#F7F6FA]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#C4B5FD]">
                <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t('landing.ownership.badge')}</span>
              </div>
              <h2
                className="font-['Outfit',sans-serif] text-2xl sm:text-4xl font-semibold tracking-tight text-white"
                style={{ textWrap: 'balance' }}
              >
                {t('landing.ownership.heading')}
              </h2>
              <p className="text-base text-[#D7D1E6] leading-relaxed">
                {t('landing.ownership.subheading')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 space-y-3">
                <ShieldCheck className="w-5 h-5 text-[#C4B5FD]" aria-hidden="true" />
                <h3 className="font-['Outfit',sans-serif] text-lg font-semibold text-white">
                  {t('landing.ownership.c1Title')}
                </h3>
                <p className="text-sm text-[#D7D1E6] leading-relaxed">
                  {t('landing.ownership.c1Desc')}
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 space-y-3">
                <FolderOpen className="w-5 h-5 text-[#C4B5FD]" aria-hidden="true" />
                <h3 className="font-['Outfit',sans-serif] text-lg font-semibold text-white">
                  {t('landing.ownership.c2Title')}
                </h3>
                <p className="text-sm text-[#D7D1E6] leading-relaxed">
                  {t('landing.ownership.c2Desc')}
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 space-y-3">
                <Sparkles className="w-5 h-5 text-[#C4B5FD]" aria-hidden="true" />
                <h3 className="font-['Outfit',sans-serif] text-lg font-semibold text-white">
                  {t('landing.ownership.c3Title')}
                </h3>
                <p className="text-sm text-[#D7D1E6] leading-relaxed">
                  {t('landing.ownership.c3Desc')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Final Call to Action */}
        <section className="py-16 sm:py-20 border-t border-[#211B2E]/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <h2
              className="font-['Outfit',sans-serif] text-2xl sm:text-4xl font-semibold tracking-tight text-[#211B2E]"
              style={{ textWrap: 'balance' }}
            >
              {isAuthenticated ? t('landing.cta.authTitle') : t('landing.cta.anonTitle')}
            </h2>
            <p className="text-base text-[#4A435C] max-w-2xl mx-auto leading-relaxed">
              {isAuthenticated ? t('landing.cta.authSubtitle') : t('landing.cta.anonSubtitle')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={isBusy}
                onClick={handlePrimaryCta}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#6C2CEB] hover:bg-[#5920CB] disabled:opacity-60 text-white text-sm sm:text-base font-semibold inline-flex items-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
              >
                <span>
                  {isAuthenticated ? t('landing.openConsole') : t('landing.startBuilding')}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate(isAuthenticated ? '/workspace' : buildLoginUrl('/console'))}
                className="min-h-[48px] px-5 py-3 rounded-xl border border-[#211B2E]/20 bg-white hover:bg-[#FAF9FC] text-[#211B2E] text-sm sm:text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6C2CEB]"
              >
                {isAuthenticated ? t('landing.cta.manageWorkspace') : t('navigation.signIn')}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#211B2E]/10 bg-white/80 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <BuillyLogo variant="full" size="lg" theme="light" />
            <p className="text-xs text-[#574F6B]">{t('landing.footer.tagline')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-[#4A435C]">
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('features');
              }}
              className="hover:text-[#211B2E]"
            >
              {t('navigation.features')}
            </a>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('how-it-works');
              }}
              className="hover:text-[#211B2E]"
            >
              {t('navigation.howItWorks')}
            </a>
            <a
              href="#data-ownership"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection('data-ownership');
              }}
              className="hover:text-[#211B2E]"
            >
              {t('navigation.dataOwnership')}
            </a>
            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className="hover:text-[#211B2E]"
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/terms')}
              className="hover:text-[#211B2E]"
            >
              Terms
            </button>
            <button
              type="button"
              onClick={() => onNavigate(isAuthenticated ? '/console' : buildLoginUrl('/console'))}
              className="hover:text-[#211B2E]"
            >
              {isAuthenticated ? t('landing.footer.myConsole') : t('navigation.signIn')}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
