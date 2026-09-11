/**
 * Language Configuration for Skoolific V2
 * 
 * This file defines the language configuration for the application,
 * including supported languages, their properties, and metadata.
 * 
 * Supported Languages:
 * - English (en): Default language, LTR
 * - Amharic (am): Ethiopian language, LTR, uses custom font
 * - Arabic (ar): RTL language, requires layout mirroring
 */

/**
 * Language configuration interface
 * @typedef {Object} LanguageConfig
 * @property {string} code - ISO 639-1 language code
 * @property {string} name - English name of the language
 * @property {string} nativeName - Native name of the language
 * @property {'ltr'|'rtl'} direction - Text direction
 * @property {string} flag - Flag emoji or icon identifier
 * @property {string} fontFamily - CSS font family for the language
 * @property {boolean} requiresCustomFont - Whether custom font loading is needed
 */

/**
 * Supported languages configuration
 * @type {LanguageConfig[]}
 */
export const SUPPORTED_LANGUAGES = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    flag: '🇬🇧',
    fontFamily: 'var(--font-sans)',
    requiresCustomFont: false,
  },
  {
    code: 'am',
    name: 'Amharic',
    nativeName: 'አማርኛ',
    direction: 'ltr',
    flag: '🇪🇹',
    fontFamily: 'var(--font-amharic), var(--font-sans)',
    requiresCustomFont: true,
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    direction: 'rtl',
    flag: '🇸🇦',
    fontFamily: 'var(--font-sans)',
    requiresCustomFont: false,
  },
  {
    code: 'so',
    name: 'Somali',
    nativeName: 'Soomaali',
    direction: 'ltr',
    flag: '🇸🇴',
    fontFamily: 'var(--font-sans)',
    requiresCustomFont: false,
  },
  {
    code: 'om',
    name: 'Oromo',
    nativeName: 'Afaan Oromoo',
    direction: 'ltr',
    flag: '🇪🇹',
    fontFamily: 'var(--font-sans)',
    requiresCustomFont: false,
  },
];

/**
 * Default language code
 * @type {string}
 */
export const DEFAULT_LANGUAGE = 'en';

/**
 * LocalStorage key for language preference
 * @type {string}
 */
export const LANGUAGE_STORAGE_KEY = 'language';

/**
 * Get language configuration by code
 * @param {string} code - Language code
 * @returns {LanguageConfig|undefined} Language configuration or undefined
 */
export const getLanguageConfig = (code) => {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code);
};

/**
 * Check if a language code is supported
 * @param {string} code - Language code to check
 * @returns {boolean} True if language is supported
 */
export const isLanguageSupported = (code) => {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
};

/**
 * Get language direction (LTR or RTL)
 * @param {string} code - Language code
 * @returns {'ltr'|'rtl'} Text direction
 */
export const getLanguageDirection = (code) => {
  const config = getLanguageConfig(code);
  return config?.direction || 'ltr';
};

/**
 * Check if language is RTL
 * @param {string} code - Language code
 * @returns {boolean} True if language is RTL
 */
export const isRTL = (code) => {
  return getLanguageDirection(code) === 'rtl';
};

/**
 * Get font family for language
 * @param {string} code - Language code
 * @returns {string} CSS font family
 */
export const getLanguageFontFamily = (code) => {
  const config = getLanguageConfig(code);
  return config?.fontFamily || 'var(--font-sans)';
};

/**
 * Translation namespace structure
 * Defines the organization of translation keys
 */
export const TRANSLATION_NAMESPACES = {
  COMMON: 'common',
  AUTH: 'auth',
  DASHBOARD: 'dashboard',
  STUDENTS: 'students',
  STAFF: 'staff',
  ACADEMIC: 'academic',
  FINANCE: 'finance',
  HR: 'hr',
  COMMUNICATION: 'communication',
  SETTINGS: 'settings',
  NAVIGATION: 'navigation',
  ERRORS: 'errors',
  VALIDATION: 'validation',
  APP: 'app',
};

/**
 * Apply language-specific document attributes
 * @param {string} code - Language code
 */
export const applyLanguageAttributes = (code) => {
  const config = getLanguageConfig(code);
  
  if (!config) {
    console.warn(`Language ${code} is not supported`);
    return;
  }
  
  // Set document direction
  document.documentElement.dir = config.direction;
  
  // Set document language
  document.documentElement.lang = code;
  
  // Set font family
  document.body.style.fontFamily = config.fontFamily;
};

/**
 * Get stored language preference from localStorage
 * @returns {string|null} Stored language code or null
 */
export const getStoredLanguage = () => {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch (error) {
    console.error('Error reading language from localStorage:', error);
    return null;
  }
};

/**
 * Store language preference in localStorage
 * @param {string} code - Language code to store
 */
export const storeLanguage = (code) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch (error) {
    console.error('Error storing language in localStorage:', error);
  }
};

/**
 * Get browser's preferred language
 * @returns {string} Browser language code or default language
 */
export const getBrowserLanguage = () => {
  const browserLang = navigator.language || navigator.userLanguage;
  const langCode = browserLang.split('-')[0]; // Get language code without region
  
  return isLanguageSupported(langCode) ? langCode : DEFAULT_LANGUAGE;
};

/**
 * Initialize language on app startup
 * Priority: localStorage > browser preference > default
 * @returns {string} Language code to use
 */
export const initializeLanguage = () => {
  const storedLang = getStoredLanguage();
  
  if (storedLang && isLanguageSupported(storedLang)) {
    return storedLang;
  }
  
  const browserLang = getBrowserLanguage();
  
  if (isLanguageSupported(browserLang)) {
    return browserLang;
  }
  
  return DEFAULT_LANGUAGE;
};

/**
 * Language-specific formatting utilities
 */
export const formatters = {
  /**
   * Format number according to language locale
   * @param {number} value - Number to format
   * @param {string} code - Language code
   * @returns {string} Formatted number
   */
  number: (value, code) => {
    const locale = code === 'am' ? 'am-ET' : code === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.NumberFormat(locale).format(value);
  },
  
  /**
   * Format currency according to language locale
   * @param {number} value - Amount to format
   * @param {string} code - Language code
   * @param {string} currency - Currency code (default: ETB)
   * @returns {string} Formatted currency
   */
  currency: (value, code, currency = 'ETB') => {
    const locale = code === 'am' ? 'am-ET' : code === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(value);
  },
  
  /**
   * Format date according to language locale
   * @param {Date} date - Date to format
   * @param {string} code - Language code
   * @returns {string} Formatted date
   */
  date: (date, code) => {
    const locale = code === 'am' ? 'am-ET' : code === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.DateTimeFormat(locale).format(date);
  },
  
  /**
   * Format time according to language locale
   * @param {Date} date - Date to format
   * @param {string} code - Language code
   * @returns {string} Formatted time
   */
  time: (date, code) => {
    const locale = code === 'am' ? 'am-ET' : code === 'ar' ? 'ar-SA' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  },
};

export default {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  TRANSLATION_NAMESPACES,
  getLanguageConfig,
  isLanguageSupported,
  getLanguageDirection,
  isRTL,
  getLanguageFontFamily,
  applyLanguageAttributes,
  getStoredLanguage,
  storeLanguage,
  getBrowserLanguage,
  initializeLanguage,
  formatters,
};
