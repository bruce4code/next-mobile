'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel' // 引入 ChatPanel
import { Navbar } from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

export default function ConversationChatPage() {
  const params = useParams()
  const conversationId = params.conversationId as string | undefined // conversationId 可能为 undefined

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
    }
    fetchUser()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setCurrentUser(session?.user ?? null)
      }
    )
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  return (
    <div className="flex h-screen w-full">
      <div className="flex flex-col flex-1">
        <Navbar />
        <div className="container mx-auto max-w-4xl flex-1 p-2 py-4">
          {/* currentUser 和 conversationId 都存在时才渲染 ChatPanel */}
          {currentUser !== undefined && conversationId && (
            <ChatPanel currentUser={currentUser} initialConversationId={conversationId} />
          )}
          {/* 可以添加 conversationId 不存在时的处理逻辑 */}
          {!conversationId && <p>无效的会话 ID。</p>}
        </div>
      </div>
    </div>
  )
}