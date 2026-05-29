import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUser } from '@/app/auth/server';
import { z } from 'zod';

const SaveChatSchema = z.object({
  role: z.enum(['user', 'assistant', 'system'], { message: 'role 必须是 user / assistant / system' }),
  content: z.string().min(1, 'content 不能为空'),
  model: z.string().min(1, 'model 不能为空'),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  conversationId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const authUser = await getUser()
    if (!authUser) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await request.json();

    const parsed = SaveChatSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '请求参数校验失败', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const {
      role, content, model,
      promptTokens, completionTokens, totalTokens, conversationId,
    } = parsed.data

    console.log('保存聊天记录:', { userId: authUser.id, role, model, conversationId })

    const newChatMessage = await prisma.openRouterChat.create({
      data: {
        userId: authUser.id,
        role,
        content,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        conversationId,
      },
    });

    return NextResponse.json(newChatMessage, { status: 201 });
  } catch (error) {
    console.error('Failed to save chat message:', error);
    return NextResponse.json({ error: 'Failed to save chat message' }, { status: 500 });
  }
}