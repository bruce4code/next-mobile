'use client'

import { usePathname, useRouter, useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation('common')
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const currentLocale = params.locale as string || i18n.language;

  const changeLanguage = (lng: string) => {
    const currentPathWithoutLocale = pathname.replace(`/${currentLocale}`, '') || '/';
    router.push(`/${lng}${currentPathWithoutLocale}`);
  }

  return (
    <div className="flex space-x-2">
      <Button
        variant="ghost"
        onClick={() => changeLanguage('en')}
        disabled={currentLocale === 'en'}
      >
        {t('language.english')}
      </Button>
      <Button
        variant="ghost"
        onClick={() => changeLanguage('zh')}
        disabled={currentLocale === 'zh'}
      >
        {t('language.chinese')}
      </Button>
    </div>
  )
}