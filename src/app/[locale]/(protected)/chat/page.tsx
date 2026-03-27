'use client'

import ChatPanel from '@/components/ChatPanel'
import { useUser } from '@/components/UserProvider'

export default function NewChatPage() {
  const { user: currentUser, loading } = useUser()

  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-muted-foreground">加载中...</div>
        </div>
      ) : currentUser ? (
        <ChatPanel currentUser={currentUser} />
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-lg text-muted-foreground">请先登录</div>
        </div>
      )}
    </>
  )
}
