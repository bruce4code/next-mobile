import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseURL: "https://openrouter.ai/api/v1",
})

const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small"

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    input: text,
  })

  return response.data[0].embedding
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    input: texts,
  })

  return response.data.map((item) => item.embedding)
}
