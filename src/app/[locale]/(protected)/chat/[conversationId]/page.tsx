'use client'

import { useParams } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel'
import { useUser } from '@/components/UserProvider'

export default function ConversationChatPage() {
  const params = useParams()
  const conversationId = params.conversationId as string | undefined
  const { user: currentUser, loading } = useUser()

  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-muted-foreground">加载中...</div>
        </div>
      ) : currentUser && conversationId ? (
        <ChatPanel currentUser={currentUser} initialConversationId={conversationId} />
      ) : !conversationId ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-muted-foreground">无效的会话 ID</div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-muted-foreground">请先登录</div>
        </div>
      )}
    </>
  )
}