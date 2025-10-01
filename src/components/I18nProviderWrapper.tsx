'use client'

import { I18nextProvider } from 'react-i18next'
import { useEffect, useRef } from 'react'
import { createInstance, i18n as I18nType } from 'i18next'
import { initReactI18next } from 'react-i18next/initReactI18next'
import resourcesToBackend from 'i18next-resources-to-backend'

interface I18nProviderWrapperProps {
  children: React.ReactNode;
  locale: string;
  initialResources?: string; // Updated type to string
}

export default function I18nProviderWrapper({ children, locale, initialResources }: I18nProviderWrapperProps) {
  const i18nRef = useRef<I18nType | null>(null);

  if (!i18nRef.current) {
    // 只在开发环境输出日志
    if (process.env.NODE_ENV === 'development') {
      console.log('I18nProviderWrapper: Initializing i18n instance for locale:', locale);
    }

    i18nRef.current = createInstance();
    i18nRef.current
      .use(initReactI18next)
      .use(resourcesToBackend((language: string, namespace: string) => import(`../../public/locales/${language}/${namespace}.json`)))
      .init({
        lng: locale,
        fallbackLng: 'en',
        supportedLngs: ['en', 'zh'],
        defaultNS: 'common',
        ns: ['common'],
        interpolation: {
          escapeValue: false,
        },
      });

    // Manually add the initial resources for hydration
    if (initialResources) {
      try {
        const parsedResources = JSON.parse(initialResources);
        Object.keys(parsedResources).forEach(ns => {
          if (!i18nRef.current?.hasResourceBundle(locale, ns)) {
            i18nRef.current?.addResourceBundle(locale, ns, parsedResources[ns]);
          }
        });
      } catch (error) {
        console.error('I18nProviderWrapper: Error parsing initialResources:', error);
      }
    }
  }

  useEffect(() => {
    if (i18nRef.current && i18nRef.current.language !== locale) {
      if (process.env.NODE_ENV === 'development') {
        console.log('I18nProviderWrapper: Changing language to:', locale);
      }
      i18nRef.current.changeLanguage(locale);
    }
  }, [locale]);

  return <I18nextProvider i18n={i18nRef.current}>{children}</I18nextProvider>;
}