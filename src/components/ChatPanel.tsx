'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatMarkdown from '@/components/ChatMarkdown'
import { User } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { useTranslation } from 'react-i18next';

// 定义消息类型
type Message = {
  role: 'user' | 'assistant'
  content: string
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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 当 initialConversationId 变化时 (例如从 URL 参数加载)，或者组件首次加载时获取历史消息
  useEffect(() => {
    if (initialConversationId) {
      setCurrentConversationId(initialConversationId);
      const fetchMessages = async () => {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/get-chat?conversationId=${initialConversationId}`);
          if (!response.ok) {
            throw new Error('Failed to fetch chat history');
          }
          const historyMessages = await response.json();
          setMessages(historyMessages.map((msg: Message) => ({ // Ensure type is correct
            id: msg.id || uuidv4(), // 如果数据库记录没有id，则生成一个
            role: msg.role,
            content: msg.content,
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !currentUser) {
      if (!currentUser) console.error('用户未登录，无法发送消息。')
      return
    }

    setIsLoading(true)

    let convId = currentConversationId
    if (!convId) { // 如果是新会话 (currentConversationId 为 null)
      convId = uuidv4()
      setCurrentConversationId(convId) // 设置新的 conversationId
    }

    const userMessage: Message = { role: 'user', content: input, id: uuidv4() }
    setMessages(prev => [...prev, userMessage])
    setInput('')

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(({ role, content }) => ({ role, content })),
          // 如果API需要，也可以传递 conversationId
          // conversationId: convId 
        }),
      })

      if (!response.ok) throw new Error(`请求失败: ${response.status}`)

      const assistantMessage: Message = { role: 'assistant', content: '', id: uuidv4() }
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
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>
            {t('chat_assistant_title')}{' '}
          {currentConversationId
            ? t('conversation_id_display', { id: currentConversationId.substring(0, 8) })
            : t('new_conversation')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
            {messages.length === 0 && !isLoading && (
              <div className="text-center text-muted-foreground py-8">
                {initialConversationId ? t('loading_history_messages') : t('start_new_conversation')}
              </div>
            )}
            {isLoading && messages.length === 0 && (
                 <div className="text-center text-muted-foreground py-8">{t('loading_data')}</div>
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
            placeholder={t('input_your_question')}
            disabled={isLoading || !currentUser} // 如果用户未登录也禁用
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !currentUser}>
            {isLoading ? t('sending') : t('send')}
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
