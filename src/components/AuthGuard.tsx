'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem('token') // 或者使用cookies
    if (!token) {
      router.push('/login')
    }
  }, [])

  return <>{children}</>
}