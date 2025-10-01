'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState } from "react"

export default function ProfilePage() {
  // 模拟用户数据 - 实际应用中应从API或认证服务获取
  const [user, setUser] = useState({
    name: '张三',
    email: 'zhangsan@example.com',
    image: '',
    bio: '热爱AI和技术的开发者',
    location: '北京',
    joinDate: '2023年1月'
  })

  // 获取用户名首字母作为头像备用显示
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  // 处理个人资料更新
  const handleProfileUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    // 这里应该有保存个人资料的逻辑
    console.log('保存个人资料', user)
    // 显示成功消息
    alert('个人资料已更新')
  }

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setUser(prev => ({
      ...prev,
      [name]: value
    }))
  }

  return (
    <div className="min-h-full bg-background">
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-6">我的个人资料</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 左侧个人资料卡片 */}
          <Card className="md:col-span-1">
            <CardHeader className="flex flex-col items-center">
              <Avatar className="h-24 w-24 mb-4">
                <AvatarImage src={user.image} alt={user.name} />
                <AvatarFallback className="text-2xl">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <CardTitle className="text-xl">{user.name}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">个人简介</p>
                <p>{user.bio}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">位置</p>
                <p>{user.location}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">加入时间</p>
                <p>{user.joinDate}</p>
              </div>
            </CardContent>
          </Card>
          
          {/* 右侧编辑区域 */}
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
                          value={user.name} 
                          onChange={handleInputChange} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">邮箱</Label>
                        <Input 
                          id="email" 
                          name="email" 
                          type="email" 
                          value={user.email} 
                          onChange={handleInputChange} 
                          disabled 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="bio">个人简介</Label>
                      <textarea 
                        id="bio" 
                        name="bio" 
                        value={user.bio} 
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
                          value={user.location} 
                          onChange={handleInputChange} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="image">头像URL</Label>
                        <Input 
                          id="image" 
                          name="image" 
                          value={user.image} 
                          onChange={handleInputChange} 
                          placeholder="https://example.com/avatar.jpg" 
                        />
                      </div>
                    </div>
                    
                    <Button type="submit" className="mt-4">保存更改</Button>
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
                            {/* 这里可以添加一个开关组件 */}
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
          
          {/* 聊天历史卡片 */}
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>最近的聊天记录</CardTitle>
              <CardDescription>查看您最近的AI对话</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* 这里可以循环显示聊天历史 */}
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">关于机器学习的讨论</h3>
                    <span className="text-sm text-muted-foreground">2023年12月15日</span>
                  </div>
                  <p className="text-sm text-muted-foreground">最后一条消息: 神经网络如何处理图像数据...</p>
                  <Button variant="outline" size="sm" className="mt-2">继续对话</Button>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium">Python编程问题</h3>
                    <span className="text-sm text-muted-foreground">2023年12月10日</span>
                  </div>
                  <p className="text-sm text-muted-foreground">最后一条消息: 如何优化数据处理管道...</p>
                  <Button variant="outline" size="sm" className="mt-2">继续对话</Button>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full">查看所有聊天历史</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
