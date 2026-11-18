import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageDocument, SiteDocument } from '../../types/builder';
import {
  PAGE_TEMPLATES,
  PageCreationMethod,
  generateUniquePageSlug,
  resolvePublicPortfolioUrl,
  validatePageSlug,
} from '../../services/pageService';
import {
  X,
  FilePlus2,
  LayoutTemplate,
  Copy,
  FileText,
  Home,
  AlertCircle,
  Globe,
} from 'lucide-react';

interface PageCreationModalProps {
  isOpen: boolean;
  site: SiteDocument;
  defaultForceHome?: boolean;
  defaultSourcePageId?: string;
  defaultMethod?: PageCreationMethod;
  onClose: () => void;
  onCreatePage: (params: {
    name: string;
    slugInput: string;
    method: PageCreationMethod;
    templateId?: string;
    sourcePageId?: string;
    parentPageId?: string | null;
    showInNavigation: boolean;
    forceHome?: boolean;
  }) => void;
}

export const PageCreationModal: React.FC<PageCreationModalProps> = ({
  isOpen,
  site,
  defaultForceHome = false,
  defaultSourcePageId,
  defaultMethod = 'blank',
  onClose,
  onCreatePage,
}) => {
  const { t } = useTranslation();
  const isFirstPage = site.pages.length === 0 || defaultForceHome;
  const [method, setMethod] = useState<PageCreationMethod>(defaultMethod);
  const [templateId, setTemplateId] = useState<string>(PAGE_TEMPLATES[0].id);
  const [sourcePageId, setSourcePageId] = useState<string>(
    defaultSourcePageId || site.pages[0]?.id || ''
  );
  const [pageName, setPageName] = useState<string>(isFirstPage ? 'Home' : '');
  const [slugInput, setSlugInput] = useState<string>(isFirstPage ? '/' : '');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState<boolean>(false);
  const [parentPageId, setParentPageId] = useState<string>('');
  const [showInNavigation, setShowInNavigation] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;
    const first = site.pages.length === 0 || defaultForceHome;
    setMethod(defaultMethod);
    setTemplateId(PAGE_TEMPLATES[0].id);
    const srcId = defaultSourcePageId || site.pages[0]?.id || '';
    setSourcePageId(srcId);
    setParentPageId('');
    setShowInNavigation(true);
    setSlugManuallyEdited(false);

    if (first) {
      setPageName('Home');
      setSlugInput('/');
    } else if (defaultMethod === 'duplicate' && srcId) {
      const src = site.pages.find((p) => p.id === srcId);
      const copyName = src ? `${src.name} ${t('modals.pageCreate.copySuffix')}` : `Page ${t('modals.pageCreate.copySuffix')}`;
      setPageName(copyName);
      setSlugInput(generateUniquePageSlug(copyName, site.pages, null, false));
    } else if (defaultMethod === 'template') {
      const tpl = PAGE_TEMPLATES[0];
      setPageName(tpl.defaultPageName);
      setSlugInput(generateUniquePageSlug(tpl.defaultPageName, site.pages, null, false));
    } else {
      setPageName('');
      setSlugInput('');
    }
  }, [isOpen, defaultForceHome, defaultSourcePageId, defaultMethod, site.pages, t]);

  // Auto-generate slug while user types name unless manually overridden
  const handleNameChange = (val: string) => {
    setPageName(val);
    if (!isFirstPage && !slugManuallyEdited) {
      setSlugInput(
        val.trim()
          ? generateUniquePageSlug(val, site.pages, parentPageId || null, false)
          : ''
      );
    }
  };

  const handleMethodSwitch = (nextMethod: PageCreationMethod) => {
    setMethod(nextMethod);
    if (isFirstPage) return;
    if (nextMethod === 'template') {
      const tpl = PAGE_TEMPLATES.find((t) => t.id === templateId) || PAGE_TEMPLATES[0];
      if (!pageName.trim()) {
        setPageName(tpl.defaultPageName);
        if (!slugManuallyEdited) {
          setSlugInput(
            generateUniquePageSlug(tpl.defaultPageName, site.pages, parentPageId || null, false)
          );
        }
      }
    } else if (nextMethod === 'duplicate') {
      const src = site.pages.find((p) => p.id === sourcePageId) || site.pages[0];
      if (src) {
        setSourcePageId(src.id);
        const nextName = `${src.name} ${t('modals.pageCreate.copySuffix')}`;
        setPageName(nextName);
        if (!slugManuallyEdited) {
          setSlugInput(
            generateUniquePageSlug(nextName, site.pages, parentPageId || null, false)
          );
        }
      }
    }
  };

  const slugCheck = useMemo(
    () =>
      validatePageSlug(
        isFirstPage ? '/' : slugInput,
        site.pages,
        undefined,
        isFirstPage ? null : parentPageId || null,
        isFirstPage
      ),
    [isFirstPage, slugInput, site.pages, parentPageId]
  );

  // Top-level non-archived pages eligible as parents
  const parentOptions: PageDocument[] = useMemo(
    () => site.pages.filter((p) => !p.parentPageId && p.status !== 'archived'),
    [site.pages]
  );

  if (!isOpen) return null;

  const canSubmit = pageName.trim().length > 0 && slugCheck.valid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreatePage({
      name: pageName.trim(),
      slugInput: isFirstPage ? '/' : slugCheck.normalized,
      method,
      templateId: method === 'template' ? templateId : undefined,
      sourcePageId: method === 'duplicate' ? sourcePageId : undefined,
      parentPageId: isFirstPage ? null : parentPageId || null,
      showInNavigation,
      forceHome: isFirstPage,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              {isFirstPage ? <Home className="w-4 h-4" /> : <FilePlus2 className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isFirstPage
                  ? t('modals.pageCreate.createHomeTitle')
                  : t('modals.pageCreate.createPageTitle')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('modals.pageCreate.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modals.pageCreate.closeAria')}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Creation Method Tabs */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              {t('modals.pageCreate.methodLabel')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'blank', label: t('modals.pageCreate.methodBlank'), icon: FileText, disabled: false },
                  { id: 'template', label: t('modals.pageCreate.methodTemplate'), icon: LayoutTemplate, disabled: false },
                  {
                    id: 'duplicate',
                    label: t('modals.pageCreate.methodDuplicate'),
                    icon: Copy,
                    disabled: site.pages.length === 0,
                  },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const active = method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleMethodSwitch(opt.id)}
                    className={`min-h-[42px] px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template Picker */}
          {method === 'template' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                {t('modals.pageCreate.selectTemplate')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PAGE_TEMPLATES.map((tpl) => {
                  const selected = templateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        setTemplateId(tpl.id);
                        if (!isFirstPage && !slugManuallyEdited) {
                          setPageName(tpl.defaultPageName);
                          setSlugInput(
                            generateUniquePageSlug(
                              tpl.defaultPageName,
                              site.pages,
                              parentPageId || null,
                              false
                            )
                          );
                        }
                      }}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        selected
                          ? 'border-blue-600 bg-blue-50/50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900">{tpl.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {tpl.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Duplicate Source Picker */}
          {method === 'duplicate' && site.pages.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                {t('modals.pageCreate.duplicateFrom')}
              </label>
              <select
                value={sourcePageId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSourcePageId(nextId);
                  const src = site.pages.find((p) => p.id === nextId);
                  if (src && !slugManuallyEdited) {
                    const copyName = `${src.name} ${t('modals.pageCreate.copySuffix')}`;
                    setPageName(copyName);
                    setSlugInput(
                      generateUniquePageSlug(copyName, site.pages, parentPageId || null, false)
                    );
                  }
                }}
                className="w-full min-h-[40px] text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                {site.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Page Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              {t('modals.pageCreate.pageNameLabel')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              required
              placeholder={
                isFirstPage
                  ? t('modals.pageCreate.pageNamePlaceholderHome')
                  : t('modals.pageCreate.pageNamePlaceholder')
              }
              value={pageName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="w-full min-h-[40px] text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* URL Slug + Live Route Preview */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">
              {t('modals.pageCreate.slugLabel')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              disabled={isFirstPage}
              placeholder="/about"
              value={isFirstPage ? '/' : slugInput}
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setSlugInput(e.target.value);
              }}
              className="w-full min-h-[40px] text-xs px-3 py-2 border border-slate-200 rounded-lg bg-white font-mono disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:border-blue-500"
            />

            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 overflow-x-auto">
              <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate">
                {slugCheck.valid
                  ? resolvePublicPortfolioUrl(site.portfolioSlug, slugCheck.fullPath)
                  : `https://builly.me/${site.portfolioSlug}/...`}
              </span>
            </div>

            {!slugCheck.valid && (slugInput.trim().length > 0 || pageName.trim().length > 0) && (
              <div className="flex items-center gap-1.5 text-[11px] text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{slugCheck.error}</span>
              </div>
            )}
          </div>

          {/* Optional Parent & Nav Settings */}
          {!isFirstPage && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 block">
                  {t('modals.pageCreate.parentLabel')}
                </label>
                <select
                  value={parentPageId}
                  onChange={(e) => setParentPageId(e.target.value)}
                  className="w-full min-h-[40px] text-xs px-2.5 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">{t('modals.pageCreate.topLevelOption')}</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 min-h-[40px] px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 w-full cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={showInNavigation}
                    onChange={(e) => setShowInNavigation(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>{t('modals.pageCreate.showInNav')}</span>
                </label>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              {isFirstPage ? t('modals.pageCreate.homeNote') : t('modals.pageCreate.draftNote')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg disabled:opacity-40"
              >
                {isFirstPage
                  ? t('modals.pageCreate.createHomeBtn')
                  : t('modals.pageCreate.createPageBtn')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
