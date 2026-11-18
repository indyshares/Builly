import React from 'react';
import {
  Cloud,
  Database,
  FolderOpen,
  Globe,
  History,
  Inbox,
  Layers,
  LogOut,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BuillyLogo } from '../common/BuillyLogo';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import { saveActiveProjectContext } from '../../services/storageService';
import {
  ALL_PROJECT_MODULES,
  OrganizationRecord,
  ProjectModuleKey,
  ProjectModuleRecord,
  ProjectRecord,
} from '../../types/workspace';
import { buildBuilderUrl, buildConsoleUrl, ConsoleModuleSlug } from '../../utils/routes';

interface ProjectModuleHeaderProps {
  organization: OrganizationRecord;
  project: ProjectRecord;
  modules: ProjectModuleRecord[];
  activeModule: ProjectModuleKey;
  authBusy: boolean;
  onNavigate: (to: string, options?: { replace?: boolean }) => void;
  onSignOut: () => Promise<void>;
}

const MODULE_ICONS: Record<ProjectModuleKey, React.ComponentType<{ className?: string }>> = {
  builder: Layers,
  cms: Database,
  inbox: Inbox,
  assets: FolderOpen,
  publishing: Globe,
  versions: History,
  settings: Settings,
};

const STANDALONE_TABS: readonly ConsoleModuleSlug[] = [
  'cms',
  'inbox',
  'assets',
  'publishing',
  'versions',
  'settings',
];

export const ProjectModuleHeader: React.FC<ProjectModuleHeaderProps> = ({
  organization,
  project,
  modules,
  activeModule,
  authBusy,
  onNavigate,
  onSignOut,
}) => {
  const { t } = useTranslation();

  const isBuilderEnabled =
    modules.find((m) => m.module_key === 'builder')?.enabled !== 0;

  const handleOpenBuilder = () => {
    saveActiveProjectContext({
      orgId: organization.org_id,
      orgName: organization.name,
      projectId: project.project_id,
      projectName: project.name,
    });
    onNavigate(
      buildBuilderUrl({
        orgId: organization.org_id,
        projectId: project.project_id,
      })
    );
  };

  return (
    <>
      <header className="px-4 sm:px-6 lg:px-8 h-16 border-b border-[#211B2E]/10 bg-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="inline-flex items-center rounded-md shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6C2CEB]"
          >
            <BuillyLogo mode="responsive" theme="light" />
          </a>

          <nav
            aria-label={t('console.moduleShell.breadcrumbsAria')}
            className="hidden sm:flex items-center gap-2 text-xs text-[#574F6B] min-w-0"
          >
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => onNavigate(buildConsoleUrl())}
              className="hover:text-[#211B2E] font-medium whitespace-nowrap shrink-0 hover:underline"
            >
              {t('console.dashboard.breadcrumbConsole')}
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() => onNavigate(buildConsoleUrl({ orgId: organization.org_id }))}
              className="hover:text-[#211B2E] font-medium truncate max-w-[140px] hover:underline"
            >
              {organization.name}
            </button>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              onClick={() =>
                onNavigate(
                  buildConsoleUrl({
                    orgId: organization.org_id,
                    projectId: project.project_id,
                  })
                )
              }
              className="hover:text-[#211B2E] font-medium truncate max-w-[160px] hover:underline"
            >
              {project.name}
            </button>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-[#211B2E] whitespace-nowrap shrink-0">
              {t(`console.modules.${activeModule}`)}
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <LanguageSwitcher size="sm" />
          <button
            type="button"
            onClick={() => onNavigate('/workspace')}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[#211B2E]/15 bg-[#F7F6FA] hover:bg-[#EDEAF5] text-xs font-medium text-[#211B2E] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Cloud className="w-3.5 h-3.5 text-[#6C2CEB]" />
            <span className="hidden md:inline">{t('navigation.workspace')}</span>
          </button>
          {isBuilderEnabled && (
            <button
              type="button"
              onClick={handleOpenBuilder}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#6C2CEB] hover:bg-[#5920CB] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('console.projects.openBuilder')}</span>
            </button>
          )}
          <button
            type="button"
            disabled={authBusy}
            onClick={async () => {
              await onSignOut();
              onNavigate('/', { replace: true });
            }}
            title={t('auth.signOut')}
            aria-label={t('auth.signOut')}
            className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[#211B2E]/15 text-[#4A435C] hover:text-[#211B2E] hover:bg-[#F7F6FA] inline-flex items-center shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Secondary Module Navigation Bar */}
      <nav
        aria-label={t('console.moduleShell.moduleNavAria')}
        className="px-4 sm:px-6 lg:px-8 border-b border-[#211B2E]/10 bg-white overflow-x-auto"
      >
        <div className="max-w-6xl mx-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onNavigate(
                buildConsoleUrl({
                  orgId: organization.org_id,
                  projectId: project.project_id,
                })
              )
            }
            className="py-2.5 px-3 text-xs font-medium text-[#574F6B] hover:text-[#211B2E] border-b-2 border-transparent whitespace-nowrap shrink-0"
          >
            {t('navigation.dashboard')}
          </button>
          {STANDALONE_TABS.filter((modKey) => ALL_PROJECT_MODULES.includes(modKey)).map((modKey) => {
            const modRecord = modules.find((m) => m.module_key === modKey);
            const isEnabled = modRecord ? modRecord.enabled === 1 : true;
            if (!isEnabled && modKey !== activeModule) return null;
            const Icon = MODULE_ICONS[modKey];
            const isCurrent = modKey === activeModule;
            return (
              <button
                key={modKey}
                type="button"
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() =>
                  onNavigate(
                    buildConsoleUrl({
                      orgId: organization.org_id,
                      projectId: project.project_id,
                      moduleSlug: modKey,
                    })
                  )
                }
                className={`py-2.5 px-3 text-xs font-medium inline-flex items-center gap-1.5 border-b-2 whitespace-nowrap shrink-0 transition-colors ${
                  isCurrent
                    ? 'border-[#6C2CEB] text-[#6C2CEB] font-semibold'
                    : 'border-transparent text-[#574F6B] hover:text-[#211B2E]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t(`console.modules.${modKey}`)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
