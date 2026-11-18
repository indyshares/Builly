import React from 'react';
import { useTranslation } from 'react-i18next';
import { EditorPanelType } from '../../types/builder';
import { LeftTab } from './LeftSidebar';
import {
  PlusSquare,
  Layers,
  Sliders,
  MoreHorizontal,
  FileText,
  Palette,
  Database,
  Image as ImageIcon,
  Code2,
  History,
  FileSpreadsheet,
  Cloud,
  Globe,
  Download,
  X,
  ChevronRight,
} from 'lucide-react';

interface MobileBottomNavProps {
  activePanel: EditorPanelType;
  hasSelection: boolean;
  onSelectPanel: (panel: EditorPanelType) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activePanel,
  hasSelection,
  onSelectPanel,
}) => {
  const { t } = useTranslation();
  const isMoreActive =
    activePanel === 'more' ||
    activePanel === 'pages' ||
    activePanel === 'themes' ||
    activePanel === 'sheets' ||
    activePanel === 'media' ||
    activePanel === 'code' ||
    activePanel === 'releases';

  const tabs: {
    id: EditorPanelType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    isActive: boolean;
    badge?: boolean;
  }[] = [
    {
      id: 'elements',
      label: t('builder.mobileNav.elements'),
      icon: PlusSquare,
      isActive: activePanel === 'elements',
    },
    {
      id: 'navigator',
      label: t('builder.mobileNav.layers'),
      icon: Layers,
      isActive: activePanel === 'navigator',
    },
    {
      id: 'properties',
      label: t('builder.mobileNav.properties'),
      icon: Sliders,
      isActive: activePanel === 'properties',
      badge: hasSelection,
    },
    {
      id: 'more',
      label: t('builder.mobileNav.more'),
      icon: MoreHorizontal,
      isActive: isMoreActive,
    },
  ];

  return (
    <nav
      aria-label={t('builder.mobileNav.ariaLabel')}
      className="h-14 bg-white border-t border-slate-200 grid grid-cols-4 items-center shrink-0 z-40 select-none"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectPanel(activePanel === tab.id ? 'none' : tab.id)}
            className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
              tab.isActive ? 'text-blue-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {tab.badge && !tab.isActive && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-blue-600" />
              )}
            </div>
            <span className="text-[11px] leading-none whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

interface MobileMoreSheetProps {
  onOpenToolTab: (tab: LeftTab) => void;
  onOpenSheetsModal: () => void;
  onOpenCmsModal?: () => void;
  onOpenGoogleModal: () => void;
  onOpenPublicSiteModal: () => void;
  onOpenExportModal: () => void;
  onClose: () => void;
}

export const MobileMoreSheet: React.FC<MobileMoreSheetProps> = ({
  onOpenToolTab,
  onOpenSheetsModal,
  onOpenCmsModal,
  onOpenGoogleModal,
  onOpenPublicSiteModal,
  onOpenExportModal,
  onClose,
}) => {
  const { t } = useTranslation();

  const toolItems: {
    id: LeftTab;
    label: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'pages', label: t('builder.tools.pagesLabel'), subtitle: t('builder.tools.pagesSub'), icon: FileText },
    { id: 'themes', label: t('builder.tools.themesLabel'), subtitle: t('builder.tools.themesSub'), icon: Palette },
    { id: 'sheets', label: t('builder.tools.sheetsLabel'), subtitle: t('builder.tools.sheetsSub'), icon: Database },
    { id: 'media', label: t('builder.tools.mediaLabel'), subtitle: t('builder.tools.mediaSub'), icon: ImageIcon },
    { id: 'code', label: t('builder.tools.codeLabel'), subtitle: t('builder.tools.codeSub'), icon: Code2 },
    { id: 'releases', label: t('builder.tools.releasesLabel'), subtitle: t('builder.tools.releasesSub'), icon: History },
  ];

  return (
    <div className="h-full bg-white flex flex-col select-none">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{t('builder.mobileNav.siteToolsTitle')}</h3>
          <p className="text-xs text-slate-500">{t('builder.mobileNav.siteToolsSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('builder.mobileNav.closeMenu')}
          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden">
          {toolItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenToolTab(item.id)}
                className="w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{item.label}</div>
                    <div className="text-xs text-slate-500 truncate">{item.subtitle}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="px-1 text-xs font-semibold text-slate-500">
            {t('builder.mobileNav.workspaceActions')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {onOpenCmsModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCmsModal();
                }}
                className="min-h-[48px] px-3 py-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/70 flex items-center gap-2 text-xs font-semibold text-blue-900 col-span-2"
              >
                <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">{t('builder.mobileNav.cmsWorkspace')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSheetsModal();
              }}
              className="min-h-[48px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-800"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">{t('builder.mobileNav.editSheets')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenGoogleModal();
              }}
              className="min-h-[48px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-800"
            >
              <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate">{t('builder.mobileNav.googleSetup')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPublicSiteModal();
              }}
              className="min-h-[48px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-800"
            >
              <Globe className="w-4 h-4 text-slate-600 shrink-0" />
              <span className="truncate">{t('builder.mobileNav.liveSite')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExportModal();
              }}
              className="min-h-[48px] px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-2 text-xs font-semibold text-slate-800"
            >
              <Download className="w-4 h-4 text-slate-600 shrink-0" />
              <span className="truncate">{t('builder.mobileNav.exportArchive')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
