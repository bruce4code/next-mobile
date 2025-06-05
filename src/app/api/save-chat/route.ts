import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma'; // 假设您的 Prisma Client 实例在这里

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log(body, 'body')
    // 假设 body 包含 { userId, role, content, model, promptTokens, completionTokens, totalTokens, conversationId }
    // 进行必要的验证

    const newChatMessage = await prisma.openRouterChat.create({
      data: {
        userId: body.userId, // 或者从会话中获取 authUserId
        role: body.role,
        content: body.content,
        model: body.model,
        promptTokens: body.promptTokens,
        completionTokens: body.completionTokens,
        totalTokens: body.totalTokens,
        conversationId: body.conversationId, // 新增字段
        // authUserId: 'supabase-user-id' // 如果您使用 Supabase Auth ID
      },
    });

    return NextResponse.json(newChatMessage, { status: 201 });
  } catch (error) {
    console.error('Failed to save chat message:', error);
    return NextResponse.json({ error: 'Failed to save chat message' }, { status: 500 });
  }
}