import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/app/auth/server'
import ChatPanel from '@/components/ChatPanel'

export const metadata: Metadata = {
  title: '对话',
  description: 'AI 智能对话',
}

export default async function ConversationChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  return <ChatPanel currentUser={user} initialConversationId={conversationId} />
}