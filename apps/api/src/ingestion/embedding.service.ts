import { createHash, randomUUID } from "node:crypto"
import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import OpenAI from "openai"
import { PrismaService } from "../database/prisma.service"

const DEFAULT_EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-8B"

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name)
  private readonly openai: OpenAI

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: config.get<string>("SILICONFLOW_API_KEY") ?? config.get<string>("OPENROUTER_API_KEY"),
      baseURL: config.get<string>("LLM_BASE_URL") ?? config.get<string>("OPENROUTER_BASE_URL") ?? "https://api.siliconflow.cn/v1",
    })
  }

  private get model() {
    return process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL
  }

  private hashText(text: string): string {
    return createHash("sha256").update(text.replace(/\s+/g, "")).digest("hex")
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const modelToUse = this.model
    const textHash = this.hashText(text)

    // 1. 检查数据库缓存
    try {
      const rows = await this.prisma.$queryRaw<Array<{ embedding: string }>>`
        SELECT "embedding"::text as "embedding" FROM "EmbeddingCache"
        WHERE "textHash" = ${textHash} AND "model" = ${modelToUse}
        LIMIT 1
      `
      if (rows.length > 0) {
        const raw = String(rows[0].embedding)
        const embedding = raw
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map(Number)
        if (embedding.length === 1536 && embedding.every((n) => !isNaN(n))) {
          return embedding
        }
        this.logger.warn("Embedding cache row was malformed; regenerating")
      }
    } catch (cacheError) {
      this.logger.warn(`Embedding cache lookup failed; calling the API directly: ${String(cacheError)}`)
    }

    // 2. 调用 API 生成
    const response = await this.openai.embeddings.create({
      model: modelToUse,
      input: text,
      dimensions: 1536,
    })

    if (!response.data || response.data.length === 0) {
      throw new Error("Embedding API 返回空数据")
    }

    const embedding = response.data[0].embedding

    // 3. 存入数据库缓存
    try {
      const embeddingString = `[${embedding.join(",")}]`
      await this.prisma.$executeRaw`
        INSERT INTO "EmbeddingCache" ("id", "textHash", "text", "embedding", "model", "createdAt")
        VALUES (${randomUUID()}, ${textHash}, ${text.slice(0, 300)}, ${embeddingString}::vector, ${modelToUse}, NOW())
        ON CONFLICT ("textHash", "model") DO NOTHING
      `
    } catch (storeError) {
      this.logger.warn(`Caching the embedding failed; returning anyway: ${String(storeError)}`)
    }

    return embedding
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: 1536,
    })

    if (!response.data || response.data.length === 0) {
      throw new Error("Embedding API 返回空数据")
    }

    return response.data.map((item) => item.embedding)
  }
}
