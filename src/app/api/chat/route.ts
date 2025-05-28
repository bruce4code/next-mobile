import OpenAI from 'openai'

// 初始化 OpenAI 客户端
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1'
})

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()
    console.log('发送到 OpenRouter 的消息:', messages)
    
    // 请求 OpenRouter API
    const response = await openai.chat.completions.create({
      // model: 'mistralai/mistral-7b-instruct',
      model: 'deepseek/deepseek-chat-v3-0324:free',
      messages,
      stream: true,
    })
    
    // 创建一个 TransformStream 来转换响应格式
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk)
        const lines = text.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          try {
            const jsonData = JSON.parse(line)
            if (jsonData.choices?.[0]?.delta?.content) {
              // 转换为标准 SSE 格式
              const sseMessage = `data: ${JSON.stringify(jsonData)}\n\n`
              controller.enqueue(encoder.encode(sseMessage))
            }
          } catch (e) {
            console.error('解析 JSON 失败:', e)
          }
        }
      }
    })
    
    // 将 OpenAI 响应通过转换流传递
    const responseStream = response.toReadableStream()
      .pipeThrough(transformStream)
    
    // 返回转换后的流
    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    console.error('OpenRouter API 错误:', error)
    return new Response(
      JSON.stringify({ error: '处理您的请求时出错' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
