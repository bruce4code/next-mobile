'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Navbar } from "@/components/Navbar"

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-6">设置</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 应用设置 */}
          <Card>
            <CardHeader>
              <CardTitle>应用设置</CardTitle>
              <CardDescription>管理应用的外观和行为</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dark-mode">深色模式</Label>
                  <p className="text-sm text-muted-foreground">
                    切换深色主题
                  </p>
                </div>
                <Switch id="dark-mode" />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications">通知</Label>
                  <p className="text-sm text-muted-foreground">
                    接收系统通知和更新
                  </p>
                </div>
                <Switch id="notifications" defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sound">声音效果</Label>
                  <p className="text-sm text-muted-foreground">
                    启用消息提示音
                  </p>
                </div>
                <Switch id="sound" />
              </div>
            </CardContent>
          </Card>
          
          {/* 隐私设置 */}
          <Card>
            <CardHeader>
              <CardTitle>隐私设置</CardTitle>
              <CardDescription>管理您的数据和隐私选项</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="history">保存聊天历史</Label>
                  <p className="text-sm text-muted-foreground">
                    允许系统保存您的对话历史
                  </p>
                </div>
                <Switch id="history" defaultChecked />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="analytics">使用分析</Label>
                  <p className="text-sm text-muted-foreground">
                    允许收集匿名使用数据以改进服务
                  </p>
                </div>
                <Switch id="analytics" defaultChecked />
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h3 className="font-medium">数据管理</h3>
                <p className="text-sm text-muted-foreground">
                  管理您的个人数据和聊天记录
                </p>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2 mt-2">
                  <Button variant="outline">导出数据</Button>
                  <Button variant="destructive">清除所有数据</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* AI 设置 */}
          <Card>
            <CardHeader>
              <CardTitle>AI 设置</CardTitle>
              <CardDescription>自定义AI助手的行为</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="model">AI 模型</Label>
                <select 
                  id="model" 
                  className="w-full p-2 rounded-md border border-input bg-background"
                >
                  <option value="default">默认模型</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="claude">Claude</option>
                  <option value="llama">Llama</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  选择不同的AI模型可能会影响响应质量和速度
                </p>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <Label htmlFor="temperature">创造性 (Temperature)</Label>
                <input 
                  type="range" 
                  id="temperature" 
                  min="0" 
                  max="100" 
                  defaultValue="70"
                  className="w-full" 
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>精确</span>
                  <span>平衡</span>
                  <span>创造性</span>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="context">记忆上下文</Label>
                  <p className="text-sm text-muted-foreground">
                    AI助手记住对话历史的能力
                  </p>
                </div>
                <Switch id="context" defaultChecked />
              </div>
            </CardContent>
          </Card>
          
          {/* 账户设置 */}
          <Card>
            <CardHeader>
              <CardTitle>账户设置</CardTitle>
              <CardDescription>管理您的账户信息</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="font-medium">账户信息</h3>
                <p className="text-sm">
                  邮箱: zhangsan@example.com<br />
                  会员状态: 免费用户<br />
                  注册时间: 2023年1月1日
                </p>
                <Button variant="outline" size="sm" className="mt-2">
                  升级到专业版
                </Button>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h3 className="font-medium">安全设置</h3>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                  <Button variant="outline" size="sm">
                    修改密码
                  </Button>
                  <Button variant="outline" size="sm">
                    两步验证
                  </Button>
                </div>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h3 className="font-medium text-destructive">危险区域</h3>
                <p className="text-sm text-muted-foreground">
                  以下操作不可撤销，请谨慎操作
                </p>
                <Button variant="destructive" size="sm">
                  注销账户
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="mt-6 flex justify-end">
          <Button>保存所有设置</Button>
        </div>
      </div>
    </div>
  )
}