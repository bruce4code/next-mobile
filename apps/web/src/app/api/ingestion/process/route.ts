import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { processNextIngestionJob } from '@/lib/ingestion'
import { z } from 'zod'

const RequestSchema = z.object({
  limit: z.number().int().min(1).max(10).optional().default(1),
})

function hasValidWorkerSecret(request: Request) {
  const expected = process.env.INGESTION_WORKER_SECRET
  const authorization = request.headers.get('authorization')
  const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!expected || !supplied || expected.length !== supplied.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
}

export async function POST(request: Request) {
  if (!process.env.INGESTION_WORKER_SECRET) {
    return NextResponse.json({ error: 'Worker secret 未配置' }, { status: 503 })
  }
  if (!hasValidWorkerSecret(request)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 })
  }

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }
  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数校验失败', details: parsed.error.issues }, { status: 400 })
  }

  const results = []
  for (let index = 0; index < parsed.data.limit; index++) {
    const result = await processNextIngestionJob()
    if (!result) break
    results.push(result)
  }

  return NextResponse.json({ processed: results.length, results })
}
