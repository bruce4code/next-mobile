"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@/components/UserProvider'
import Link from 'next/link'

export default function Home() {
  const { user, loading } = useUser()
  const router = useRouter()

  // 不要自动重定向，避免无限循环
  // useEffect(() => {
  //   if (user && !loading) {
  //     router.push('/chat')
  //   }
  // }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center max-w-md mx-auto p-6">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          AI 聊天助手
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          与 AI 进行智能对话，获得即时帮助和答案
        </p>
        
        {user ? (
          <div className="space-y-4">
            <p className="text-green-600">欢迎回来，{user.email}！</p>
            <Link 
              href="/chat"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              开始聊天
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <Link 
              href="/login"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              登录开始使用
            </Link>
            <p className="text-sm text-gray-500">
              登录后即可开始与 AI 对话
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
