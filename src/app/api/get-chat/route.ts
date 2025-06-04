// 文件路径：app/api/get-chats/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    // 1. 获取用户ID（从会话中获取或查询参数）
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    // 2. 验证用户ID是否存在
    if (!userId) {
      return NextResponse.json(
        { error: '缺少用户ID参数' }, 
        { status: 400 }
      )
    }

    // 3. 查询该用户的所有聊天记录
    const chats = await prisma.openRouterChat.findMany({
      where: {
        userId: userId // 使用用户ID过滤结果
      },
      orderBy: {
        createdAt: 'desc' // 按创建时间倒序排列
      },
      select: {
        id: true,
        role: true,
        content: true,
        model: true,
        createdAt: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true
      },
    })

    // 4. 返回查询结果
    return NextResponse.json(chats, { status: 200 })
    
  } catch (error) {
    console.error('获取聊天记录失败:', error)
    return NextResponse.json(
      { error: '服务器内部错误' }, 
      { status: 500 }
    )
  }
}