// app/(protected)/layout.tsx (Protected Routes Layout)
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AppSidebar } from "@/components/AppSidebar"

export const metadata: Metadata = {
  description: 'AI Chat - 智能对话助手，支持知识库和流式对话',
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // const cookieStore = cookies()
  // const token = cookieStore.get('token')?.value
  // console.log('token-->',token)

  // if (!token) {
  //   redirect('/login')
  // }

  return (
    <div className="chatgpt-container">
      <AppSidebar />
      <div className="chatgpt-main">
        {children}
      </div>
    </div>
  )
}