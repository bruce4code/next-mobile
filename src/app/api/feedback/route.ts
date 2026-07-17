/**
 * 用户反馈 API
 *
 * 前端点赞/点踩后，将反馈数据发送到 LangSmith 并关联到原始对话 trace。
 *
 * POST /api/feedback
 * Body: { requestId: string, score: 1 | 0, comment?: string }
 *
 * requestId 来自 chat SSE 流的 metadata 事件或响应头 X-Request-Id
 */

import { Client } from 'langsmith'
import { getUser } from '@/app/auth/server'

const client = new Client()

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { requestId, score, comment } = body as {
      requestId?: string
      score?: number
      comment?: string
    }

    if (!requestId || score === undefined) {
      return new Response(
        JSON.stringify({ error: '缺少必填字段: requestId, score' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (score !== 0 && score !== 1) {
      return new Response(
        JSON.stringify({ error: 'score 必须是 0（点踩）或 1（点赞）' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const user = await getUser()
    const userId = user?.id ?? 'anonymous'

    // 将反馈创建为 LangSmith 中的一个 run，便于在 Dashboard 查看
    // metadata 中包含 requestId + userId，可在 Dashboard 搜索对应 trace
    const run = await client.createRun({
      name: `User Feedback — ${requestId}`,
      run_type: 'chain',
      inputs: { requestId, score, comment: comment ?? '' },
      outputs: {
        verdict: score === 1 ? 'positive' : 'negative',
        comment: comment ?? '',
      },
      metadata: {
        requestId,
        userId,
        feedbackType: 'user_rating',
      },
      tags: ['feedback', 'user_rating', score === 1 ? 'positive' : 'negative'],
      start_time: Date.now(),
      end_time: Date.now(),
    })

    console.log(`✅ 用户反馈已记录: requestId=${requestId}, score=${score}, comment=${comment ?? '(无)'}`)

    return new Response(
      JSON.stringify({ success: true, runId: run.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('反馈提交失败:', error)
    return new Response(
      JSON.stringify({ error: '反馈提交失败，请稍后重试' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}