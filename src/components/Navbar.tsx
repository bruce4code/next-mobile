'use client'

import React from 'react'
import Link from 'next/link'
import { UserAvatarMenu } from './UserAvatarMenu'

export function Navbar() {
  // 这里可以从您的认证系统获取用户信息
  const user = {
    name: '张三',
    email: 'zhangsan@example.com',
    image: '' // 可以添加用户头像URL
  }
  
  const handleLogout = () => {
    // 实现您的登出逻辑
    console.log('用户登出')
    // 例如: 清除令牌、重定向到登录页等
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
          <UserAvatarMenu 
            user={user} 
            onLogout={handleLogout} 
          />
        </div>
      </div>
    </nav>
  )
}