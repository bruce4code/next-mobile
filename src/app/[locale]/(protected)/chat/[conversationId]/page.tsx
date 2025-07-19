'use client'

import { useParams } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel'
import { useUser } from '@/components/UserProvider'

export default function ConversationChatPage() {
  const params = useParams()
  const conversationId = params.conversationId as string | undefined
  const { user: currentUser, loading } = useUser()

  return (
    <div className="flex w-full" style={{ height: 'calc(100vh - 50px)' }}>
      <div className="flex flex-col flex-1">
        <div className="container mx-auto max-w-4xl flex-1 p-2 py-4" style={{ height: 'calc(100vh - 100px)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-lg">加载中...</div>
            </div>
          ) : currentUser && conversationId ? (
            <ChatPanel currentUser={currentUser} initialConversationId={conversationId} />
          ) : !conversationId ? (
            <p>无效的会话 ID。</p>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-lg">请先登录</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}