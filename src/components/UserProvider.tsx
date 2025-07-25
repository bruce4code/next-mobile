'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import { userCache } from '@/lib/userCache'

interface UserContextType {
  user: User | null
  loading: boolean
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const refreshUser = async () => {
    try {
      // 先检查本地缓存
      const cachedUser = userCache.get()
      if (cachedUser) {
        setUser(cachedUser)
        setLoading(false)
      }

      // 然后从服务器获取最新状态
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      // 更新本地缓存
      if (user) {
        userCache.set(user)
      } else {
        userCache.clear()
      }
    } catch (error) {
      console.error('Error fetching user:', error)
      setUser(null)
      userCache.clear()
    }
  }

  useEffect(() => {
    // 初始化时获取用户状态
    refreshUser().finally(() => setLoading(false))

    // 监听认证状态变化
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)
        setUser(session?.user ?? null)
        setLoading(false)
        
        // 更新本地缓存
        if (session?.user) {
          userCache.set(session.user)
        } else {
          userCache.clear()
        }
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, []) // 移除 supabase 依赖，避免重复创建监听器

  return (
    <UserContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
} 