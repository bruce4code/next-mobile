'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatMarkdown from '@/components/ChatMarkdown'
import { User } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { useTranslation } from 'react-i18next'
import { cachedGetConversation } from '@/lib/cache'

// 定义消息内容类型
type MessageContent = string | { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

// 定义消息类型
type Message = {
  role: 'user' | 'assistant'
  content: string | MessageContent[]
  displayContent: string
  imageUrl?: string
  id?: string
}

interface ChatPanelProps {
  initialConversationId?: string | null
  currentUser: User | null
}

export default function ChatPanel({ initialConversationId, currentUser }: ChatPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(initialConversationId || null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 当 initialConversationId 变化时 (例如从 URL 参数加载)，或者组件首次加载时获取历史消息
  useEffect(() => {
    if (initialConversationId) {
      setCurrentConversationId(initialConversationId);
      const fetchMessages = async () => {
        setIsLoading(true);
        try {
          // 使用缓存的对话获取函数
          const historyMessages = await cachedGetConversation(initialConversationId);
          setMessages(historyMessages.map((msg: any) => ({ // Ensure type is correct
            id: msg.id || uuidv4(), // 如果数据库记录没有id，则生成一个
            role: msg.role,
            content: msg.content,
            displayContent: typeof msg.content === 'string' ? msg.content : '',
          })));
        } catch (error) {
          console.error(error);
          // 可以设置错误状态或提示用户
        } finally {
          setIsLoading(false);
        }
      };
      fetchMessages();
    } else {
      // 如果没有 initialConversationId，则清空消息，准备新会话
      setMessages([]);
      setCurrentConversationId(null); // 确保新会话开始时 currentConversationId 为 null
    }
  }, [initialConversationId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const clearImage = () => {
    setSelectedImage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!input.trim() && !selectedImage) || isLoading || !currentUser) {
      if (!currentUser) console.error('用户未登录，无法发送消息。')
      return
    }

    setIsLoading(true)

    let convId = currentConversationId
    if (!convId) { // 如果是新会话 (currentConversationId 为 null)
      convId = uuidv4()
      setCurrentConversationId(convId) // 设置新的 conversationId
    }

    // 构建用户消息内容
    let userContent: string | MessageContent[]
    let userDisplayContent: string

    if (selectedImage && input.trim()) {
      // 既有图片又有文本
      userContent = [
        { type: 'text', text: input },
        { type: 'image_url', image_url: { url: selectedImage } }
      ]
      userDisplayContent = input
    } else if (selectedImage) {
      // 只有图片
      userContent = [{ type: 'image_url', image_url: { url: selectedImage } }]
      userDisplayContent = '[图片]'
    } else {
      // 只有文本
      userContent = input
      userDisplayContent = input
    }

    const userMessage: Message = { 
      role: 'user', 
      content: userContent, 
      displayContent: userDisplayContent,
      imageUrl: selectedImage || undefined,
      id: uuidv4() 
    }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    clearImage()

    try {
      // 准备发送到 API 的消息
      const apiMessages = [...messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : msg.content
      })), {
        role: 'user',
        content: userContent
      }]

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          // 如果API需要，也可以传递 conversationId
          // conversationId: convId 
        }),
      })

      if (!response.ok) throw new Error(`请求失败: ${response.status}`)

      const assistantMessage: Message = { 
        role: 'assistant', 
        content: '', 
        displayContent: '',
        id: uuidv4() 
      }
      setMessages(prev => [...prev, assistantMessage])

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('无法获取响应流')

      let buffer = ''
      let fullAssistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        buffer += chunk
        const jsonObjects = extractJsonObjects(buffer)
        buffer = jsonObjects.remainder

        for (const jsonStr of jsonObjects.objects) {
          try {
            const jsonData = JSON.parse(jsonStr)
            if (jsonData.choices?.[0]?.delta?.content) {
              let content = jsonData.choices[0].delta.content
              if (typeof content === 'object' && content !== null) {
                content = '```json\n' + JSON.stringify(content, null, 2) + '\n```'
              }
              assistantMessage.content += content
              assistantMessage.displayContent += content
              fullAssistantContent += content
              setMessages(prev => prev.map(m => m.id === assistantMessage.id ? { ...assistantMessage } : m))
            }
          } catch (jsonError) {
            console.error('JSON 解析错误:', jsonError, jsonStr)
          }
        }
      }

      if (fullAssistantContent && currentUser && convId) {
        // 保存用户消息
        await fetch('/api/save-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            role: 'user',
            content: userMessage.content,
            conversationId: convId,
          }),
        });
        // 保存助手消息
        await fetch('/api/save-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            role: 'assistant',
            content: fullAssistantContent,
            conversationId: convId,
          }),
        });
      }
    } catch (error) {
      console.error('聊天请求错误:', error)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '抱歉，处理您的请求时出错了。请稍后再试。', id: uuidv4() },
      ])
    } finally {
      setIsLoading(false)
    }
  }

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
          if (openBraces === 0 && startPos <= currentPos) { // 确保 startPos 有效
            objects.push(text.substring(startPos, currentPos + 1))
          }
        }
      }
      currentPos++
    }
    const lastObjectEnd = objects.length > 0 
      ? text.indexOf(objects[objects.length - 1]) + objects[objects.length - 1].length 
      : 0;
    return {
      objects,
      remainder: text.substring(lastObjectEnd)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="chatgpt-messages">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <div className="text-2xl font-semibold mb-2">欢迎使用 AI 助手</div>
              <div className="text-sm">
                {initialConversationId ? t('loading_history_messages') : t('start_new_conversation')}
              </div>
            </div>
          </div>
        )}
            {isLoading && messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <div className="text-lg">{t('loading_data')}</div>
                </div>
              </div>
            )}
            {isLoading && messages.length > 0 && (
              <div className="chatgpt-message">
                <div className="chatgpt-message-avatar chatgpt-message-avatar-assistant">
                  AI
                </div>
                <div className="chatgpt-message-content chatgpt-message-content-assistant">
                  <div className="flex items-center gap-1">
                    <span className="typing-indicator"></span>
                    <span className="typing-indicator"></span>
                    <span className="typing-indicator"></span>
                  </div>
                </div>
              </div>
            )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`chatgpt-message ${
              message.role === 'user' ? 'chatgpt-message-user' : ''
            }`}
          >
            <div
              className={`chatgpt-message-avatar ${
                message.role === 'user'
                  ? 'chatgpt-message-avatar-user'
                  : 'chatgpt-message-avatar-assistant'
              }`}
            >
              {message.role === 'user' ? 'U' : 'AI'}
            </div>
            <div
              className={`chatgpt-message-content ${
                message.role === 'user'
                  ? 'chatgpt-message-content-user'
                  : 'chatgpt-message-content-assistant'
              }`}
            >
              {message.role === 'user' ? (
                <div>
                  {message.imageUrl && (
                    <img 
                      src={message.imageUrl} 
                      alt="用户上传的图片" 
                      className="max-w-xs max-h-48 rounded-lg mb-2 object-contain"
                    />
                  )}
                  <p className="text-sm whitespace-pre-wrap">{message.displayContent}</p>
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ChatMarkdown content={typeof message.content === 'string' ? message.content : ''} />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chatgpt-input-container">
        <div className="chatgpt-input-wrapper">
          {selectedImage && (
            <div className="relative mb-2 inline-block">
              <img 
                src={selectedImage} 
                alt="预览图片" 
                className="max-w-24 max-h-24 rounded-lg object-contain"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                ×
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="chatgpt-input-form">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || !currentUser}
              className="chatgpt-image-button p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="上传图片"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>
            <textarea
              value={input}
              onChange={handleInputChange}
              placeholder={t('input_your_question')}
              disabled={isLoading || !currentUser}
              className="chatgpt-input"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !currentUser || (!input.trim() && !selectedImage)}
              className="chatgpt-send-button"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
