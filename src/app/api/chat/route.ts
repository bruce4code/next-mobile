import { StreamingTextResponse } from 'ai'
import OpenAI from 'openai'

// 初始化 OpenAI 客户端
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req: Request) {
  const { messages } = await req.json()
  
  // 请求 OpenAI API
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    stream: true,
  })

  // 将响应转换为流
  return new StreamingTextResponse(response.body)
}