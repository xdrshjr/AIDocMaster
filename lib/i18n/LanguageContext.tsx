/**
 * Language Context Provider
 * Manages global language state and provides language switching functionality
 */

'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale, defaultLocale } from './config';
import { logger } from '@/lib/logger';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'app-language-preference';

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider = ({ children }: LanguageProviderProps) => {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load saved language preference on mount
  useEffect(() => {
    try {
      logger.debug('Initializing language context', undefined, 'LanguageContext');
      
      const savedLocale = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Locale | null;
      
      if (savedLocale && (savedLocale === 'en' || savedLocale === 'zh')) {
        logger.info('Loading saved language preference', { locale: savedLocale }, 'LanguageContext');
        setLocaleState(savedLocale);
      } else {
        logger.info('No saved language preference, using default', { locale: defaultLocale }, 'LanguageContext');
        setLocaleState(defaultLocale);
      }
      
      setIsInitialized(true);
      logger.debug('Language context initialized successfully', { locale: savedLocale || defaultLocale }, 'LanguageContext');
    } catch (error) {
      logger.error('Failed to load language preference', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'LanguageContext');
      setLocaleState(defaultLocale);
      setIsInitialized(true);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    try {
      logger.info('Language change requested', { 
        from: locale, 
        to: newLocale 
      }, 'LanguageContext');
      
      setLocaleState(newLocale);
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLocale);
      
      logger.success('Language changed successfully', { 
        locale: newLocale,
        persisted: true 
      }, 'LanguageContext');
    } catch (error) {
      logger.error('Failed to save language preference', {
        locale: newLocale,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'LanguageContext');
      
      // Still update the state even if localStorage fails
      setLocaleState(newLocale);
    }
  };

  // Don't render children until initialized to prevent flash of wrong language
  if (!isInitialized) {
    return null;
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};



