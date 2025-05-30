'use client'

import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, Settings, LogOut } from "lucide-react"
import { useRouter } from 'next/navigation'

interface UserAvatarMenuProps {
  user?: {
    name?: string
    email?: string
    image?: string
  }
  onLogout?: () => void
}

export function UserAvatarMenu({ 
  user = { 
    name: '用户',
    email: 'user@example.com',
    image: '' 
  }, 
  onLogout 
}: UserAvatarMenuProps) {
  const router = useRouter()
  
  // 获取用户名首字母作为头像备用显示
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }
  
  const handleProfileClick = () => {
    router.push('/profile')
  }
  
  const handleSettingsClick = () => {
    router.push('/settings')
  }
  
  const handleLogout = () => {
    if (onLogout) {
      onLogout()
    } else {
      // 默认登出行为
      console.log('登出')
      // 可以添加默认的登出逻辑
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer hover:opacity-80 transition-opacity">
          <AvatarImage src={user.image || ''} alt={user.name || '用户头像'} />
          <AvatarFallback>{user.name ? getInitials(user.name) : '用户'}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleProfileClick}>
          <User className="mr-2 h-4 w-4" />
          <span>我的</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSettingsClick}>
          <Settings className="mr-2 h-4 w-4" />
          <span>设置</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}