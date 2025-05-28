'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'

// 定义消息类型
type Message = {
  role: 'user' | 'assistant'
  content: string
  id?: string
}

export default function ChatPage() {
  // 状态管理
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  // 处理表单提交
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    
    setIsLoading(true)
    
    // 创建用户消息
    const userMessage: Message = {
      role: 'user', 
      content: input,
      id: Date.now().toString()
    }
    
    // 添加用户消息到聊天
    setMessages(prev => [...prev, userMessage])
    setInput('')
    
    try {
      // 发送请求到 API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content }))
        })
      })
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }
      
      // 创建助手消息
      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        id: Date.now().toString()
      }
      
      // 添加空的助手消息到聊天
      setMessages(prev => [...prev, assistantMessage])
      
      // 处理流式响应
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      
      if (!reader) {
        throw new Error('无法获取响应流')
      }
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        console.log('收到的原始数据:', chunk)
        
        // 处理 SSE 格式的数据
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data:') && line.trim() !== 'data:') {
            try {
              const jsonStr = line.slice(5).trim()
              if (jsonStr && jsonStr !== '[DONE]') {
                try {
                  const jsonData = JSON.parse(jsonStr)
                  if (jsonData.choices?.[0]?.delta?.content) {
                    // 更新助手消息内容
                    assistantMessage.content += jsonData.choices[0].delta.content
                    setMessages(prev => [
                      ...prev.slice(0, -1), 
                      { ...assistantMessage }
                    ])
                  }
                } catch (jsonError) {
                  console.error('JSON 解析错误:', jsonError, jsonStr)
                }
              }
            } catch (e) {
              console.error('处理行失败:', e, line)
            }
          }
        }
      }
    } catch (error) {
      console.error('请求或处理错误:', error)
      // 添加错误消息到聊天
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: '抱歉，处理您的请求时出错了。', 
          id: Date.now().toString() 
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="container mx-auto max-w-4xl h-screen py-8 p-2">
      <Card className="h-[90vh] flex flex-col">
        <CardHeader>
          <CardTitle>AI 聊天助手</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden">
          <ScrollArea className="h-full pr-4">
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  开始一个新的对话吧！
                </div>
              )}
              {messages.map((message) => (
                <div 
                  key={message.id}
                  className={`p-4 rounded-lg ${
                    message.role === 'user' 
                      ? 'bg-primary/10 ml-auto max-w-[80%]' 
                      : 'bg-muted max-w-[80%]'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter>
          <form onSubmit={handleSubmit} className="flex w-full gap-2">
            <Input
              value={input}
              onChange={handleInputChange}
              placeholder="输入您的问题..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? '发送中...' : '发送'}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  )
}
