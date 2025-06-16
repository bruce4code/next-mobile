'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const pathname = usePathname()
  const router = useRouter()

  const changeLanguage = (lng: string) => {
    // Next.js i18n routing will handle the locale prefix
    // We need to remove the current locale from pathname if it exists
    const currentLocale = i18n.language;
    let newPath = pathname;
    if (pathname.startsWith(`/${currentLocale}`)) {
      newPath = pathname.replace(`/${currentLocale}`, '');
    }
    if (newPath === '') newPath = '/'; // Handle root path
    
    router.push(`/${lng}${newPath}`);
  }

  return (
    <div>
      <button onClick={() => changeLanguage('en')} disabled={i18n.language === 'en'}>
        English
      </button>
      <button onClick={() => changeLanguage('zh')} disabled={i18n.language === 'zh'}>
        中文
      </button>
    </div>
  )
}