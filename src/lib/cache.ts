import { cache } from 'react'

// 缓存 API 请求
export const cachedFetch = cache(async (url: string, options?: RequestInit) => {
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  return response.json()
})

// 缓存聊天历史
export const cachedGetChatHistory = cache(async (userId: string) => {
  return cachedFetch(`/api/get-chat?userId=${userId}`)
})

// 缓存对话消息
export const cachedGetConversation = cache(async (conversationId: string) => {
  return cachedFetch(`/api/get-chat?conversationId=${conversationId}`)
})

// 缓存用户信息
export const cachedGetUser = cache(async () => {
  // 这里可以缓存用户信息获取逻辑
  return null
}) 