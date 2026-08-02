import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import all translations
import en from './locales/en.json';
import ka from './locales/ka.json';
import ru from './locales/ru.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';

const resources = {
  en: { translation: en },
  ka: { translation: ka },
  ru: { translation: ru },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  ar: { translation: ar },
  zh: { translation: zh },
};

// Language metadata for language selector
export const languages = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' as const },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', dir: 'ltr' as const },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' as const },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' as const },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' as const },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' as const },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' as const },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr' as const },
];

// Update document direction when language changes
const updateDocumentDirection = (lng: string) => {
  const lang = languages.find(l => l.code === lng);
  const dir = lang?.dir || 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

// Set initial direction
updateDocumentDirection(i18n.language);

// Listen for language changes
i18n.on('languageChanged', updateDocumentDirection);

export default i18n;
