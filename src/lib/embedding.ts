import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseURL: "https://openrouter.ai/api/v1",
})

const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b"

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const modelToUse = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
    console.log('开始生成 embedding, 文本长度:', text.length)
    console.log('正在调用的 embedding 模型:', modelToUse)
    const response = await openai.embeddings.create({
      model: modelToUse,
      input: text,
      dimensions: 1536,
    })

    console.log('Embedding API 响应:', response)
    
    if (!response.data || response.data.length === 0) {
      throw new Error('Embedding API 返回空数据')
    }

    const embedding = response.data[0].embedding
    console.log('Embedding 生成成功, 维度:', embedding.length)
    console.log('Embedding 前10个值:', embedding.slice(0, 10))
    return embedding
  } catch (error) {
    console.error('生成 embedding 失败:', error)
    console.warn('使用随机 embedding 作为备用方案')
    return generateRandomEmbedding()
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
      input: texts,
      dimensions: 1536,
    })

    if (!response.data || response.data.length === 0) {
      throw new Error('Embedding API 返回空数据')
    }

    return response.data.map((item) => item.embedding)
  } catch (error) {
    console.error('批量生成 embeddings 失败:', error)
    console.warn('使用随机 embeddings 作为备用方案')
    return texts.map(() => generateRandomEmbedding())
  }
}

function generateRandomEmbedding(): number[] {
  const embedding: number[] = []
  for (let i = 0; i < 1536; i++) {
    embedding.push((Math.random() - 0.5) * 2)
  }
  return embedding
}
