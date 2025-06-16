'use client'

import { I18nextProvider } from 'react-i18next'
import { useEffect } from 'react'
import i18n from '@/i18n' // 客户端 i18n 实例

export default function I18nProviderWrapper({ children, locale }: { children: React.ReactNode, locale: string }) {
  useEffect(() => {
    if (locale && i18n.language !== locale) {
      i18n.changeLanguage(locale)
    }
  }, [locale])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}