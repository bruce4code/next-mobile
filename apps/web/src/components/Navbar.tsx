'use client'

import React from 'react'
import Link from 'next/link'
import { UserAvatarMenu } from './UserAvatarMenu'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import LanguageSwitcher from './LanguageSwitcher'
import { useParams } from 'next/navigation'
import { useUser } from './UserProvider'
import { persistAuthTokens } from "@/lib/authTokens"

export function Navbar() {
  const { user, loading } = useUser()
  const supabase = createClient()
  const router = useRouter()
  
  const params = useParams();
  const locale = params.locale as string;
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('登出错误:', error.message)
      alert(`登出失败: ${error.message}`)
    } else {
      persistAuthTokens(null)
      console.log('用户登出成功')
      router.push(`/${locale}/login`) // 重定向到登录页
      router.refresh() // 刷新以确保服务端组件能获取到最新的会话状态
    }
  }

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <Link href={`/${locale}`} className="text-xl font-bold">
            AI 聊天助手
          </Link>
        </div>
        
        <div className="flex items-center space-x-4">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse"></div>
          ) : user ? (
            <UserAvatarMenu 
              user={{
                name: user.user_metadata?.full_name || user.email || '用户',
                email: user.email,
                image: user.user_metadata?.avatar_url || ''
              }} 
              onLogout={handleLogout} 
            />
          ) : (
            <Link href={`/${locale}/login`} className="text-sm font-medium hover:underline">
              登录 / 注册
            </Link>
          )}
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  )
}
