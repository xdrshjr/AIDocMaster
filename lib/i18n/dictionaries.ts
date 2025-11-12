/**
 * Dictionary loader for i18n translations
 */

import { Locale } from './config';

// English translations
const en = {
  common: {
    appName: 'DocAIMaster',
    appDescription: 'AI-powered document editing, modification, and validation tool',
  },
  header: {
    title: 'DocAIMaster',
  },
  taskbar: {
    aiDocValidation: 'AI Document Validation',
  },
  footer: {
    copyright: '© 2025 DocAIMaster. All rights reserved.',
  },
  container: {
    welcomeTitle: 'Welcome to DocAIMaster',
    welcomeDescription: 'Your AI-powered document assistant',
  },
};

// Chinese translations
const zh = {
  common: {
    appName: 'DocAIMaster',
    appDescription: 'AI驱动的文档编辑、修改和验证工具',
  },
  header: {
    title: 'DocAIMaster',
  },
  taskbar: {
    aiDocValidation: 'AI文档校验',
  },
  footer: {
    copyright: '© 2025 DocAIMaster. 保留所有权利。',
  },
  container: {
    welcomeTitle: '欢迎使用 DocAIMaster',
    welcomeDescription: '您的AI文档助手',
  },
};

const dictionaries = {
  en,
  zh,
};

export const getDictionary = (locale: Locale) => {
  return dictionaries[locale] || dictionaries.en;
};

export type Dictionary = typeof en;

