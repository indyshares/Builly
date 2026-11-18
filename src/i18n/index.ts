import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import th from '../locales/th.json';

export type AppLanguage = 'en' | 'th';

export const LANGUAGE_STORAGE_KEY = 'builly_language';
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export const SUPPORTED_LANGUAGES: ReadonlyArray<{
  code: AppLanguage;
  nativeLabel: string;
  englishLabel: string;
}> = [
  { code: 'th', nativeLabel: 'ไทย', englishLabel: 'Thai' },
  { code: 'en', nativeLabel: 'English', englishLabel: 'English' },
];

export function normalizeLanguage(value?: string | null): AppLanguage {
  if (!value) return DEFAULT_LANGUAGE;
  const lower = value.toLowerCase().trim();
  if (lower === 'th' || lower.startsWith('th-')) {
    return 'th';
  }
  return 'en';
}

export function getSavedLanguage(): AppLanguage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'th' || saved === 'en') {
        return saved;
      }
    }
  } catch {
    // Ignore storage access errors (e.g. sandboxed iframe or SSR/Node)
  }
  return DEFAULT_LANGUAGE;
}

function syncDocumentLanguage(lng: AppLanguage): void {
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = lng;
    }
  } catch {
    // Ignore DOM access errors in non-DOM environments
  }
}

const initialLanguage = getSavedLanguage();

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      th: { translation: th },
    },
    lng: initialLanguage,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: ['en', 'th'],
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

syncDocumentLanguage(normalizeLanguage(i18n.language || initialLanguage));

i18n.on('languageChanged', (lng) => {
  syncDocumentLanguage(normalizeLanguage(lng));
});

export function getCurrentLanguage(): AppLanguage {
  return normalizeLanguage(i18n.resolvedLanguage || i18n.language);
}

export async function setAppLanguage(lng: AppLanguage): Promise<void> {
  const target = normalizeLanguage(lng);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, target);
    }
  } catch {
    // Ignore storage access errors
  }
  syncDocumentLanguage(target);
  await i18n.changeLanguage(target);
}

export default i18n;
