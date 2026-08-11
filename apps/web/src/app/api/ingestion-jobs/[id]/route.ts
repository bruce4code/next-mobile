import { NextResponse } from 'next/server'
import { getUser } from '@/app/auth/server'
import prisma from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  const { id } = await params
  const job = await prisma.ingestionJob.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      documentId: true,
      documentVersion: true,
      operation: true,
      status: true,
      attempt: true,
      maxAttempts: true,
      error: true,
      availableAt: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!job) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  }

  return NextResponse.json(job, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
