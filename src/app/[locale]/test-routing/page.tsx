"use client"

import { useUser } from '@/components/UserProvider'
import Link from 'next/link'

export default function TestRoutingPage() {
  const { user, loading } = useUser()

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">路由测试页面</h1>
      
      <div className="mb-4">
        <h2 className="text-lg font-semibold">用户状态</h2>
        <p>Loading: {loading ? 'Yes' : 'No'}</p>
        <p>User: {user ? user.email : 'Not logged in'}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">测试链接</h2>
        <div className="space-y-1">
          <Link href="/" className="block text-blue-500 hover:underline">
            主页 (/)
          </Link>
          <Link href="/login" className="block text-blue-500 hover:underline">
            登录页 (/login)
          </Link>
          <Link href="/chat" className="block text-blue-500 hover:underline">
            聊天页 (/chat) - 需要登录
          </Link>
          <Link href="/profile" className="block text-blue-500 hover:underline">
            个人资料 (/profile) - 需要登录
          </Link>
        </div>
      </div>
    </div>
  )
}