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
import { z } from 'zod'

const client = new Client()

const FeedbackSchema = z.object({
  requestId: z.string().uuid(),
  score: z.union([z.literal(0), z.literal(1)]),
  comment: z.string().trim().max(2_000).optional(),
})

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: '未登录' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const parsed = FeedbackSchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: '请求参数校验失败', details: parsed.error.issues }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const { requestId, score, comment } = parsed.data
    const userId = user.id

    // 将反馈创建为 LangSmith 中的一个 run，便于在 Dashboard 查看
    // metadata 中包含 requestId + userId，可在 Dashboard 搜索对应 trace
    await client.createRun({
      name: `User Feedback — ${requestId}`,
      run_type: 'chain',
      inputs: { requestId, score, comment: comment ?? '' },
      outputs: {
        verdict: score === 1 ? 'positive' : 'negative',
        comment: comment ?? '',
      },
      extra: {
        metadata: {
          requestId,
          userId,
          feedbackType: 'user_rating',
        },
      },
      start_time: Date.now(),
      end_time: Date.now(),
    })

    console.log(`✅ 用户反馈已记录: requestId=${requestId}, score=${score}, hasComment=${Boolean(comment)}`)

    return new Response(
      JSON.stringify({ success: true }),
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
