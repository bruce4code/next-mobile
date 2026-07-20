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
    let resources: Record<string, unknown> = {};
    if (initialResources) {
      try {
        resources = { [locale]: JSON.parse(initialResources) };
      } catch (error) {
        console.error('I18nProviderWrapper: Error parsing initialResources:', error);
      }
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
        ns: ['common'], // Ensure common namespace is loaded
        interpolation: {
          escapeValue: false,
        },
        resources,
        initImmediate: false,
      });
  }

  useEffect(() => {
    if (i18nRef.current && i18nRef.current.language !== locale) {
      console.log('I18nProviderWrapper: Changing language to:', locale);
      i18nRef.current.changeLanguage(locale);
    }
  }, [locale]);

  return <I18nextProvider i18n={i18nRef.current}>{children}</I18nextProvider>;
}
