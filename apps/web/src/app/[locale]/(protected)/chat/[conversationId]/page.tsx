import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/app/auth/server'
import prisma from '@/lib/prisma'
import ChatPanel from '@/components/ChatPanel'

const PAGE_SIZE = 10

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

  const rawMessages = await prisma.openRouterChat.findMany({
    where: { conversationId, userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
  })

  const hasMore = rawMessages.length > PAGE_SIZE
  if (hasMore) rawMessages.pop()

  const initialMessages = rawMessages.reverse().map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    metadata: msg.metadata,
    createdAt: msg.createdAt,
  }))

  const nextCursorCreatedAt = hasMore ? initialMessages[0]?.createdAt?.toISOString?.() ?? null : null

  return (
    <ChatPanel
      currentUser={user}
      initialConversationId={conversationId}
      initialMessages={initialMessages}
      initialHasMore={hasMore}
      initialCursor={nextCursorCreatedAt}
    />
  )
}
