import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  setAppLanguage,
  type AppLanguage,
} from '../../i18n';

export interface LanguageSwitcherProps {
  size?: 'sm' | 'md';
  theme?: 'light' | 'dark';
  showIcon?: boolean;
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  size = 'md',
  theme = 'light',
  showIcon = true,
  className = '',
}) => {
  const { i18n, t } = useTranslation();
  const currentLang: AppLanguage = normalizeLanguage(i18n.resolvedLanguage || i18n.language);

  const containerClasses =
    theme === 'dark'
      ? 'bg-slate-800/90 border-slate-700 text-slate-300'
      : 'bg-[#F7F6FA] border-[#E5E2EF] text-[#5B5470]';

  const activeClasses =
    theme === 'dark'
      ? 'bg-[#6C2CEB] text-white shadow-sm'
      : 'bg-white text-[#211B2E] shadow-sm border border-[#E5E2EF]/80';

  const inactiveClasses =
    theme === 'dark'
      ? 'text-slate-300 hover:text-white hover:bg-slate-700/60'
      : 'text-[#5B5470] hover:text-[#211B2E]';

  const padClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <div
      role="group"
      aria-label={t('language.ariaLabel')}
      className={`inline-flex items-center gap-0.5 rounded-lg border p-0.5 shrink-0 ${containerClasses} ${className}`}
    >
      {showIcon && (
        <Globe
          className={`${size === 'sm' ? 'w-3 h-3 ml-1 mr-0.5' : 'w-3.5 h-3.5 ml-1.5 mr-0.5'} opacity-70 shrink-0`}
          aria-hidden="true"
        />
      )}
      {SUPPORTED_LANGUAGES.map((lang) => {
        const isActive = currentLang === lang.code;
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => {
              void setAppLanguage(lang.code);
            }}
            aria-pressed={isActive}
            aria-label={`${t('language.ariaLabel')}: ${lang.nativeLabel}`}
            className={`${padClasses} font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
              isActive ? activeClasses : inactiveClasses
            }`}
          >
            {lang.nativeLabel}
          </button>
        );
      })}
    </div>
  );
};
