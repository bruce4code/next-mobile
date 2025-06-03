'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { UserAvatarMenu } from './UserAvatarMenu'
import { createClient } from '@/lib/supabase/client' // 导入 Supabase 客户端
import { useRouter } from 'next/navigation'

export function Navbar() {
  const [user, setUser] = useState<any>(null) // 存储用户信息的 state
  const supabase = createClient() // 创建 Supabase 客户端实例
  const router = useRouter()

  useEffect(() => {
    // 监听认证状态变化
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          // 用户已登录
          setUser(session.user)
        } else {
          // 用户已登出
          setUser(null)
        }
      }
    )

    // 首次加载时获取当前用户
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()

    // 清理监听器
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase]) // 依赖 supabase 客户端实例
  
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('登出错误:', error.message)
      alert(`登出失败: ${error.message}`)
    } else {
      console.log('用户登出成功')
      router.push('/login') // 重定向到登录页
      router.refresh() // 刷新以确保服务端组件能获取到最新的会话状态
    }
  }

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/" className="text-xl font-bold">
            AI 聊天助手
          </Link>
        </div>
        
        <div className="flex items-center space-x-4">
          {user ? (
            <UserAvatarMenu 
              user={{
                name: user.user_metadata?.full_name || user.email || '用户',
                email: user.email,
                image: user.user_metadata?.avatar_url || '' // 假设头像URL在 user_metadata 中
              }} 
              onLogout={handleLogout} 
            />
          ) : (
            <Link href="/login" className="text-sm font-medium hover:underline">
              登录 / 注册
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}