'use client'

import { useParams, notFound } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel'
import { useUser } from '@/components/UserProvider'

export default function ConversationChatPage() {
  const params = useParams()
  const conversationId = params.conversationId as string | undefined
  const { user: currentUser, loading } = useUser()

  if (!conversationId) {
    notFound()
  }

  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-muted-foreground">加载中...</div>
        </div>
      ) : currentUser ? (
        <ChatPanel currentUser={currentUser} initialConversationId={conversationId} />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-muted-foreground">请先登录</div>
        </div>
      )}
    </>
  )
}