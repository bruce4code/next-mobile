'use client'

import { usePathname } from 'next/navigation'
import { NavigationProgress } from './NavigationProgress'

export function ProtectedLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <>
      <NavigationProgress />
      <div key={pathname} className="chatgpt-main animate-fadeIn">
        {children}
      </div>
    </>
  )
}