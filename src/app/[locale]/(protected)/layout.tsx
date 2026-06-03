// app/(protected)/layout.tsx (Protected Routes Layout)
import type { Metadata } from 'next'
import { AppSidebar } from "@/components/AppSidebar"
import { ProtectedLayoutClient } from "@/components/ProtectedLayoutClient"

export const metadata: Metadata = {
  description: 'AI Chat - 智能对话助手，支持知识库和流式对话',
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="chatgpt-container">
      <AppSidebar />
      <ProtectedLayoutClient>
        {children}
      </ProtectedLayoutClient>
    </div>
  )
}