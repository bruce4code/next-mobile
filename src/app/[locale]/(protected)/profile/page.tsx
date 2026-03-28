'use client'

import React, { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"

interface UserProfile {
  id: string
  email: string
  name: string | null
  bio: string | null
  avatarUrl: string | null
  location: string | null
  createdAt: string
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editUser, setEditUser] = useState({
    name: '',
    bio: '',
    location: '',
    avatarUrl: '',
  })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    fetchUserProfile()
  }, [pathname])

  const fetchUserProfile = async () => {
    try {
      const response = await fetch('/api/user')
      if (!response.ok) throw new Error('获取用户资料失败')
      const data = await response.json()
      setUser(data)
      setEditUser({
        name: data.name || '',
        bio: data.bio || '',
        location: data.location || '',
        avatarUrl: data.avatarUrl || '',
      })
    } catch (error) {
      console.error('获取用户资料失败:', error)
      toast.error('获取用户资料失败')
    } finally {
      setIsLoading(false)
    }
  }

  const resetForm = () => {
    if (user) {
      setEditUser({
        name: user.name || '',
        bio: user.bio || '',
        location: user.location || '',
        avatarUrl: user.avatarUrl || '',
      })
      setAvatarPreview(null)
      toast.info('已重置为原始值')
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('图片大小不能超过 2MB')
        return
      }
      
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result as string
        setAvatarPreview(result)
        setEditUser(prev => ({
          ...prev,
          avatarUrl: result,
        }))
      }
      reader.readAsDataURL(file)
    }
  }

  const clearAvatar = () => {
    setAvatarPreview(null)
    setEditUser(prev => ({
      ...prev,
      avatarUrl: '',
    }))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const getInitials = (name: string | null) => {
    if (!name) return 'U'
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    
    try {
      const response = await fetch('/api/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editUser),
      })
      
      if (!response.ok) throw new Error('保存失败')
      
      const updatedUser = await response.json()
      setUser(updatedUser)
      toast.success('个人资料已更新')
    } catch (error) {
      console.error('保存个人资料失败:', error)
      toast.error('保存个人资料失败')
    } finally {
      setIsSaving(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setEditUser(prev => ({
      ...prev,
      [name]: value
    }))
  }

  if (isLoading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-6">我的个人资料</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader className="flex flex-col items-center">
              <Avatar className="h-24 w-24 mb-4">
                <AvatarImage src={user?.avatarUrl || ''} alt={user?.name || '用户'} />
                <AvatarFallback className="text-2xl">{getInitials(user?.name)}</AvatarFallback>
              </Avatar>
              <CardTitle className="text-xl">{user?.name || '未设置'}</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">个人简介</p>
                <p>{user?.bio || '未设置'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">位置</p>
                <p>{user?.location || '未设置'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">加入时间</p>
                <p>{user?.createdAt ? formatDate(user.createdAt) : '未知'}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>编辑个人资料</CardTitle>
              <CardDescription>更新您的个人信息和偏好设置</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="profile" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="profile">基本信息</TabsTrigger>
                  <TabsTrigger value="preferences">偏好设置</TabsTrigger>
                </TabsList>
                
                <TabsContent value="profile">
                  <form onSubmit={handleProfileUpdate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">姓名</Label>
                        <Input 
                          id="name" 
                          name="name" 
                          value={editUser.name} 
                          onChange={handleInputChange} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">邮箱</Label>
                        <Input 
                          id="email" 
                          name="email" 
                          type="email" 
                          value={user?.email || ''} 
                          disabled 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="bio">个人简介</Label>
                      <textarea 
                        id="bio" 
                        name="bio" 
                        value={editUser.bio} 
                        onChange={handleInputChange} 
                        className="w-full min-h-[100px] p-2 rounded-md border border-input bg-background"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="location">位置</Label>
                        <Input 
                          id="location" 
                          name="location" 
                          value={editUser.location} 
                          onChange={handleInputChange} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>头像</Label>
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center gap-2">
                            {(avatarPreview || editUser.avatarUrl) && (
                              <div className="relative">
                                <Avatar className="h-20 w-20">
                                  <AvatarImage src={avatarPreview || editUser.avatarUrl || ''} alt="头像预览" />
                                  <AvatarFallback>{getInitials(editUser.name || user?.name)}</AvatarFallback>
                                </Avatar>
                                <button
                                  type="button"
                                  onClick={clearAvatar}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 transition-colors text-sm"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleAvatarChange}
                              className="hidden"
                              id="avatar-upload"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              上传图片
                            </Button>
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label htmlFor="avatarUrl">或输入头像URL</Label>
                            <Input 
                              id="avatarUrl" 
                              name="avatarUrl" 
                              value={editUser.avatarUrl} 
                              onChange={handleInputChange} 
                              placeholder="https://example.com/avatar.jpg" 
                            />
                            <p className="text-xs text-muted-foreground">
                              支持 JPG、PNG、GIF，最大 2MB
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mt-4">
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? '保存中...' : '保存更改'}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={resetForm}
                        disabled={isSaving}
                      >
                        重置
                      </Button>
                    </div>
                  </form>
                </TabsContent>
                
                <TabsContent value="preferences">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium">界面设置</h3>
                      <p className="text-sm text-muted-foreground mb-4">自定义您的使用体验</p>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">深色模式</p>
                            <p className="text-sm text-muted-foreground">启用深色主题</p>
                          </div>
                          <div>
                            <Button variant="outline" size="sm">切换</Button>
                          </div>
                        </div>
                        
                        <Separator />
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">通知</p>
                            <p className="text-sm text-muted-foreground">接收系统通知</p>
                          </div>
                          <div>
                            <Button variant="outline" size="sm">启用</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
