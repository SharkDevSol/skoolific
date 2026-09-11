import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import enTranslations from './locales/en.json';
import amTranslations from './locales/am.json';
import arTranslations from './locales/ar.json';
import soTranslations from './locales/so.json';
import omTranslations from './locales/om.json';

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    resources: {
      en: { translation: enTranslations },
      am: { translation: amTranslations },
      ar: { translation: arTranslations },
      so: { translation: soTranslations },
      om: { translation: omTranslations }
    },
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false // React already escapes values
    },
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator'],
      // Cache user language
      caches: ['localStorage']
    }
  });

export default i18n;
