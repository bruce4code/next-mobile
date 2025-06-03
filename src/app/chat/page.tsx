'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatMarkdown from '@/components/ChatMarkdown'
import { Navbar } from '@/components/Navbar'

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
      
      let buffer = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        console.log('收到的原始数据:', chunk)
        
        // 将新数据添加到缓冲区
        buffer += chunk
        
        // 尝试从缓冲区中提取完整的 JSON 对象
        const jsonObjects = extractJsonObjects(buffer)
        buffer = jsonObjects.remainder
        
        // 处理提取出的 JSON 对象
        for (const jsonStr of jsonObjects.objects) {
          try {
            const jsonData = JSON.parse(jsonStr)
            if (jsonData.choices?.[0]?.delta?.content) {
              // 获取内容
              let content = jsonData.choices[0].delta.content;
              
              // 如果内容是对象，将其转换为格式化的 JSON 字符串
              if (typeof content === 'object' && content !== null) {
                content = '```json\n' + JSON.stringify(content, null, 2) + '\n```';
              }
              
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
      }
      
    } catch (error) {
      console.error('聊天请求错误:', error)
      // 显示错误消息
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: '抱歉，处理您的请求时出错了。请稍后再试。',
          id: Date.now().toString()
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // 辅助函数：从文本中提取完整的 JSON 对象
  function extractJsonObjects(text: string): { objects: string[], remainder: string } {
    const objects: string[] = []
    let currentPos = 0
    let startPos = 0
    let openBraces = 0
    let inString = false
    let escapeNext = false
    
    while (currentPos < text.length) {
      const char = text[currentPos]
      
      if (escapeNext) {
        escapeNext = false
      } else if (char === '\\' && inString) {
        escapeNext = true
      } else if (char === '"') {
        inString = !inString
      } else if (!inString) {
        if (char === '{') {
          if (openBraces === 0) {
            startPos = currentPos
          }
          openBraces++
        } else if (char === '}') {
          openBraces--
          if (openBraces === 0) {
            objects.push(text.substring(startPos, currentPos + 1))
          }
        }
      }
      
      currentPos++
    }
    
    // 返回提取的对象和剩余的文本
    const lastObjectEnd = objects.length > 0 
      ? startPos + objects[objects.length - 1].length 
      : 0
    
    return {
      objects,
      remainder: text.substring(lastObjectEnd)
    }
  }
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  return (
    <div className="flex h-screen">
      <div className="flex flex-col flex-1">
        <Navbar />
        <div className="container mx-auto max-w-4xl flex-1 p-2 py-4">
          <Card className="h-full flex flex-col">
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
                      {message.role === 'user' ? (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ChatMarkdown content={message.content} />
                        </div>
                      )}
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
      </div>
    </div>
  )
}
