import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUser } from '@/app/auth/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const CitationSchema = z.object({
  citationId: z.string().max(20),
  documentId: z.string().max(128),
  chunkId: z.string().max(128),
  title: z.string().max(500),
  heading: z.string().max(500).optional(),
  sourceName: z.string().max(500).optional(),
  sourceUri: z.string().max(2_000).optional(),
  sourceVersion: z.number().int().positive(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  score: z.number().min(0).max(1),
});

const SaveChatSchema = z.object({
  role: z.enum(['user', 'assistant'], { message: 'role 必须是 user / assistant' }),
  content: z.string().min(1, 'content 不能为空').max(100_000),
  model: z.string().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  conversationId: z.string().min(1).max(128),
  metadata: z.object({
    requestId: z.string().uuid().optional(),
    citations: z.array(CitationSchema).max(10).optional(),
  }).optional(),
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
      metadata,
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
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return NextResponse.json(newChatMessage, { status: 201 });
  } catch (error) {
    console.error('Failed to save chat message:', error);
    return NextResponse.json({ error: 'Failed to save chat message' }, { status: 500 });
  }
}
