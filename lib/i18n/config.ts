/**
 * Internationalization configuration
 * Sets up i18next for multi-language support
 */

export const defaultLocale = 'en';
export const locales = ['en', 'zh'] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  zh: '中文',
};

export const i18nConfig = {
  defaultLocale,
  locales,
  localeNames,
};








