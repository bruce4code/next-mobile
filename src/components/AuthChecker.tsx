'use client' // 添加这行使其成为客户端组件

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cookies } from 'next/headers'

export function AuthChecker({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const token = cookies().get('token')?.value
    
    // 如果是登录页面，不进行检查
    if (pathname === '/login') return
    
    // 如果没有token且不在登录页面，重定向到登录
    if (!token) {
      router.push('/login')
    }
  }, [pathname, router])

  // 如果是登录页面或已认证，渲染子组件
  return <>{children}</>
}