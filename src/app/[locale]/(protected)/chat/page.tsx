import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/app/auth/server'
import ChatPanel from '@/components/ChatPanel'

export const metadata: Metadata = {
  title: '新对话',
  description: '开始一个新的 AI 智能对话',
}

export default async function NewChatPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  return <ChatPanel currentUser={user} />
}
