import { Prisma } from '@prisma/client'
import prisma from './prisma'
import { generateEmbedding, generateEmbeddings } from './embedding'
import { rerankResults, type RerankerOptions } from './reranker'
import { logger } from './logger'
import { Jieba, TfIdf } from '@node-rs/jieba'
import { dict, idf } from '@node-rs/jieba/dict'
import { chunkDocument } from './chunking'

// 初始化 jieba 分词器和 TF-IDF（模块级单例，避免重复加载词典）
const jieba = Jieba.withDict(dict)
const tfidf = TfIdf.withDict(idf)

// 停用词（jieba 的 extractKeywords 已内置过滤，这里仅作额外兜底）
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '你', '他', '她', '它',
  '这', '那', '哪', '谁', '什么', '怎么', '如何', '为何',
  '吗', '呢', '吧', '啊', '呀', '嘛', '哦', '嗯', '哈',
  '有', '没', '不', '也', '都', '就', '还', '又', '再', '才',
  '很', '太', '更', '最', '真', '好', '多', '少',
  '要', '会', '能', '可以', '应该', '必须', '需要',
  '和', '与', '或', '但', '是', '因为', '所以', '如果',
  '把', '被', '让', '给', '对', '从', '到', '在', '向',
  '来', '去', '上', '下', '进', '出', '回',
  '个', '只', '条', '件', '种', '些', '点', '次',
  '想', '要', '能', '会', '可以',
  '哦', '哈', '嗯', '啊', '呀',
  '查', '一下', '一下下',
])

// ─── 搜索模式 ─────────────────────────────────────────────
export type SearchMode = 'vector' | 'hybrid'

interface SearchOptions {
  topK?: number
  category?: string
  minSimilarity?: number
  /** 搜索模式，默认 hybrid */
  mode?: SearchMode
  reranker?: boolean | RerankerOptions
}

interface DocumentResult {
  id: string
  title: string
  content: string
  contentType: string
  category?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  similarity: number
}

interface DocumentInput {
  title: string
  content: string
  contentType?: string
  category?: string
  metadata?: Record<string, unknown>
  userId?: string
}

// ─── 常量 ──────────────────────────────────────────────────
const DEFAULT_MIN_SIMILARITY = 0.35
const VECTOR_RECALL_MULTIPLIER = 3
const KEYWORD_RECALL_MULTIPLIER = 3
const RRF_K = 60  // RRF 常数，越小 keyword 结果权重越高
const HYBRID_TOP_K = 10  // 融合后给 reranker 的候选数

// 使用 jieba 的 TF-IDF 算法提取关键词
export function extractKeywords(text: string): string[] {
  const keywords = tfidf.extractKeywords(jieba, text, 5)
  return keywords
    .map(k => k.keyword)
    .filter(word => word.length > 0 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
}

// ─── RRF 融合 ─────────────────────────────────────────────
type RankedItem = { id: string; rank: number }

function computeRRFScores(
  vectorRanks: RankedItem[],
  keywordRanks: RankedItem[],
): Map<string, { rrfScore: number; vectorRank: number | null; keywordRank: number | null }> {
  const scoreMap = new Map<string, { vectorRank: number | null; keywordRank: number | null; rrfScore: number }>()

  for (const item of vectorRanks) {
    scoreMap.set(item.id, { vectorRank: item.rank, keywordRank: null, rrfScore: 0 })
  }
  for (const item of keywordRanks) {
    const existing = scoreMap.get(item.id)
    if (existing) {
      existing.keywordRank = item.rank
    } else {
      scoreMap.set(item.id, { vectorRank: null, keywordRank: item.rank, rrfScore: 0 })
    }
  }

  for (const [, scores] of scoreMap) {
    let score = 0
    if (scores.vectorRank !== null) score += 1 / (RRF_K + scores.vectorRank)
    if (scores.keywordRank !== null) score += 1 / (RRF_K + scores.keywordRank)
    scores.rrfScore = score
  }

  return scoreMap
}

// ─── BM25 风格关键词搜索（带打分） ───────────────────────────
interface KeywordMatch {
  id: string
  title: string
  content: string
  contentType: string
  category?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  keywordScore: number   // 0~1 归一化
  matchCount: number
}

async function keywordSearchWithScore(
  query: string,
  options: SearchOptions = {},
): Promise<KeywordMatch[]> {
  const { topK = 5, category } = options
  const recallCount = topK * KEYWORD_RECALL_MULTIPLIER

  logger.info('RAG.KeywordSearch.Start', { query, topK, recallCount, category })

  const keywords = extractKeywords(query)
  logger.info('RAG.KeywordSearch.Keywords', { keywords, count: keywords.length })

  if (keywords.length === 0) {
    logger.warn('RAG.KeywordSearch.NoKeywords', '无法提取有效关键词，关键词搜索返回空')
    return []
  }

  const likePatterns = keywords.map(kw => `%${kw}%`)

  // 获取匹配的分块（多要一些，给排序留空间）
  let rawResults: any[]
  if (category) {
    rawResults = await prisma.$queryRaw`
      SELECT dc.id, dc.title, dc.content,
             d."contentType", d.category, d.metadata, d."createdAt"
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE (dc.title ILIKE ANY(${likePatterns}) OR dc.content ILIKE ANY(${likePatterns}))
      AND d.category = ${category}
      ORDER BY dc."createdAt" DESC
      LIMIT ${recallCount}
    `
  } else {
    rawResults = await prisma.$queryRaw`
      SELECT dc.id, dc.title, dc.content,
             d."contentType", d.category, d.metadata, d."createdAt"
      FROM "DocumentChunk" dc
      JOIN "Document" d ON d.id = dc."documentId"
      WHERE dc.title ILIKE ANY(${likePatterns}) OR dc.content ILIKE ANY(${likePatterns})
      ORDER BY dc."createdAt" DESC
      LIMIT ${recallCount}
    `
  }

  if (rawResults.length === 0) return []

  // BM25 风格评分
  let maxScore = 0
  const scored: KeywordMatch[] = rawResults.map((row: any) => {
    const titleLower = (row.title ?? '').toLowerCase()
    const contentLower = (row.content ?? '').toLowerCase()
    let matchCount = 0

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase()
      // 在 title 中匹配加分更高
      if (titleLower.includes(kwLower)) matchCount += 3
      // content 中匹配
      const contentMatches = (contentLower.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
      matchCount += contentMatches
    }

    // 归一化到分块长度，避免长文档天然高分
    const docLen = row.content.length
    const normalizedScore = docLen > 0 ? matchCount / Math.sqrt(docLen) : 0

    if (normalizedScore > maxScore) maxScore = normalizedScore

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      contentType: row.contentType,
      category: row.category ?? undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: row.createdAt,
      keywordScore: normalizedScore,
      matchCount,
    }
  })

  // [0, 1] 归一化
  for (const s of scored) {
    s.keywordScore = maxScore > 0 ? s.keywordScore / maxScore : 0
  }

  // 按分数降序排列
  scored.sort((a, b) => b.keywordScore - a.keywordScore)

  const final = scored.slice(0, recallCount)
  logger.info('RAG.KeywordSearch.Result', {
    total: scored.length,
    returned: final.length,
    topScore: final[0]?.keywordScore.toFixed(3) ?? 'N/A',
    topTitle: final[0]?.title ?? 'N/A',
  })
  return final
}

// ─── 混合搜索入口 ───────────────────────────────────────────
export async function searchSimilarDocuments(
  query: string,
  options: SearchOptions = {}
): Promise<DocumentResult[]> {
  const {
    topK = 5,
    category,
    minSimilarity = DEFAULT_MIN_SIMILARITY,
    mode = 'hybrid',
    reranker,
  } = options

  // 纯向量模式（老路径，保持兼容）
  if (mode === 'vector') {
    return vectorSearch(query, { topK, category, minSimilarity })
  }

  // hybrid 模式
  logger.info('RAG.HybridSearch.Start', { query, mode, topK, category: category ?? null, reranker: !!reranker })

  // 并行执行向量搜索 + 关键词搜索
  const [vectorResults, keywordResults] = await Promise.allSettled([
    vectorSearch(query, { topK, category, minSimilarity }),
    keywordSearchWithScore(query, { topK, category }),
  ])

  const vectors = vectorResults.status === 'fulfilled' ? vectorResults.value : []
  const keywords = keywordResults.status === 'fulfilled' ? keywordResults.value : []

  if (vectorResults.status === 'rejected') {
    logger.error('RAG.HybridSearch.VectorError', { error: String(vectorResults.reason) })
  }
  if (keywordResults.status === 'rejected') {
    logger.error('RAG.HybridSearch.KeywordError', { error: String(keywordResults.reason) })
  }

  if (vectors.length === 0 && keywords.length === 0) {
    logger.warn('RAG.HybridSearch.Empty', '向量和关键词搜索均无结果，触发文本降级', { query })
    // 兜底：直接用原始查询做 ILIKE，不依赖 jieba 关键词提取
    try {
      const pattern = `%${query}%`
      let fallback: any[]
      if (category) {
        fallback = await prisma.$queryRaw`
          SELECT dc.id, dc.title, dc.content,
                 d."contentType", d.category, d.metadata, d."createdAt"
          FROM "DocumentChunk" dc
          JOIN "Document" d ON d.id = dc."documentId"
          WHERE (dc.title ILIKE ${pattern} OR dc.content ILIKE ${pattern})
          AND d.category = ${category}
          LIMIT ${topK}
        `
      } else {
        fallback = await prisma.$queryRaw`
          SELECT dc.id, dc.title, dc.content,
                 d."contentType", d.category, d.metadata, d."createdAt"
          FROM "DocumentChunk" dc
          JOIN "Document" d ON d.id = dc."documentId"
          WHERE dc.title ILIKE ${pattern} OR dc.content ILIKE ${pattern}
          LIMIT ${topK}
        `
      }
      return fallback.map((r: any) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        contentType: r.contentType,
        category: r.category ?? undefined,
        metadata: r.metadata as Record<string, unknown> | undefined,
        createdAt: r.createdAt,
        similarity: 0.3,
      }))
    } catch (fallbackErr) {
      logger.error('RAG.HybridSearch.FallbackError', { error: String(fallbackErr) })
      return []
    }
  }

  // RRF 融合
  const vectorRanks: RankedItem[] = vectors.map((r, i) => ({ id: r.id, rank: i + 1 }))
  const keywordRanks: RankedItem[] = keywords.map((r, i) => ({ id: r.id, rank: i + 1 }))

  // 构建融合结果，合并元数据
  const vectorMap = new Map(vectors.map(r => [r.id, r]))
  const keywordMap = new Map(keywords.map(r => [r.id, r]))

  const rrfScores = computeRRFScores(vectorRanks, keywordRanks)
  logger.info('RAG.RRF.Fusion', {
    vectorCount: vectors.length,
    keywordCount: keywords.length,
    mergedCount: rrfScores.size,
    overlapCount: vectors.filter(v => keywordMap.has(v.id)).length,
  })

  const merged = Array.from(rrfScores.entries())
    .map(([id, scores]) => {
      const vec = vectorMap.get(id)
      const kw = keywordMap.get(id)
      return {
        id,
        title: vec?.title ?? kw!.title,
        content: vec?.content ?? kw!.content,
        contentType: vec?.contentType ?? kw!.contentType,
        category: vec?.category ?? kw?.category,
        metadata: vec?.metadata ?? kw?.metadata,
        createdAt: vec?.createdAt ?? kw!.createdAt,
        similarity: scores.rrfScore,
        // 保留原始分用于调试
        _vectorRank: scores.vectorRank,
        _keywordRank: scores.keywordRank,
        _vectorSim: vec?.similarity ?? 0,
        _keywordScore: kw?.keywordScore ?? 0,
      }
    })
    .sort((a, b) => b.similarity - a.similarity)

  // 取 top 候选给 reranker
  let final: DocumentResult[] = merged.slice(0, HYBRID_TOP_K)

  // Reranker
  if (reranker && final.length > topK) {
    logger.info('RAG.Reranker.Enabled', { candidates: final.length, topK })
    const reranked = await rerankResults(query, final, {
      topK,
      ...(typeof reranker === 'object' ? reranker : {}),
    })
    if (reranked.length > 0) {
      final = reranked
    } else {
      logger.warn('RAG.Reranker.EmptyResult', '重排序返回空，使用原始顺序')
    }
  } else {
    final = final.slice(0, topK)
  }

  // 最终结果摘要
  const resultSummary = final.map((r, i) => ({
    rank: i + 1,
    title: r.title,
    sim: Number(r.similarity.toFixed(3)),
    source: (r as any)._vectorRank !== undefined
      ? { vectorRank: (r as any)._vectorRank, keywordRank: (r as any)._keywordRank }
      : 'fallback',
  }))
  logger.info('RAG.HybridSearch.Result', {
    query,
    topK,
    totalReturned: final.length,
    results: resultSummary,
  })

  return final
}

// ─── 纯向量搜索（保持原有逻辑） ──────────────────────────────
async function vectorSearch(
  query: string,
  options: SearchOptions = {}
): Promise<DocumentResult[]> {
  try {
    const { topK = 5, category, minSimilarity = DEFAULT_MIN_SIMILARITY } = options
    const recallCount = topK * VECTOR_RECALL_MULTIPLIER

    logger.info('RAG.VectorSearch.Start', { query, topK, recallCount, minSimilarity, category })

    const queryEmbedding = await generateEmbedding(query)
    const queryEmbeddingString = `[${queryEmbedding.join(',')}]`

    let results: any[]
    if (category) {
      results = await prisma.$queryRaw`
        SELECT 
          dc.id, dc.title, dc.content,
          d."contentType", d.category, d.metadata, d."createdAt",
          1 - (dc.embedding <=> ${queryEmbeddingString}::vector) as similarity
        FROM "DocumentChunk" dc
        JOIN "Document" d ON d.id = dc."documentId"
        WHERE dc.embedding IS NOT NULL AND d.category = ${category}
        ORDER BY dc.embedding <=> ${queryEmbeddingString}::vector
        LIMIT ${recallCount}
      `
    } else {
      results = await prisma.$queryRaw`
        SELECT 
          dc.id, dc.title, dc.content,
          d."contentType", d.category, d.metadata, d."createdAt",
          1 - (dc.embedding <=> ${queryEmbeddingString}::vector) as similarity
        FROM "DocumentChunk" dc
        JOIN "Document" d ON d.id = dc."documentId"
        WHERE dc.embedding IS NOT NULL
        ORDER BY dc.embedding <=> ${queryEmbeddingString}::vector
        LIMIT ${recallCount}
      `
    }

    logger.info('RAG.VectorSearch.Recall', { recalled: results.length, category })

    const filtered = (results as DocumentResult[]).filter(
      r => r.similarity >= minSimilarity
    )

    if (filtered.length < results.length) {
      logger.info('RAG.VectorSearch.Filtered', {
        before: results.length,
        after: filtered.length,
        removed: results.length - filtered.length,
        threshold: minSimilarity,
      })
    }

    const final = filtered.slice(0, topK)
    logger.info('RAG.VectorSearch.Result', {
      count: final.length,
      topScore: final[0]?.similarity.toFixed(3) ?? 'N/A',
      topTitle: final[0]?.title ?? 'N/A',
    })

    return final
  } catch (error) {
    logger.error('RAG.VectorSearch.Error', { error: String(error) })
    return []
  }
}

export async function addDocument(
  title: string,
  content: string,
  options: Omit<DocumentInput, 'title' | 'content'> = {}
) {
  const { contentType = 'text', category, metadata, userId } = options
  const embedding = await generateEmbedding(content)

  const doc = await prisma.document.create({
    data: {
      title,
      content,
      contentType,
      category,
      metadata,
      userId,
      embedding: embedding as unknown as Prisma.JsonValue,
    },
  })

  // 自动分块并生成每个块的 embedding
  try {
    const chunks = await chunkDocument(title, content, contentType)
    console.log(`📦 文档 "${title}" 分为 ${chunks.length} 块`)

    try {
      const chunkTexts = chunks.map(chunk => chunk.title + '\n' + chunk.content)
      const chunkEmbeddings = await generateEmbeddings(chunkTexts)
      
      console.log(`⚡ [事务开始] 准备插入 ${chunks.length} 个 DocumentChunk...`)
      const startTime = Date.now()
      
      await prisma.$transaction(
        chunks.map((chunk, i) => {
          const embeddingString = `[${chunkEmbeddings[i].join(',')}]`
          return prisma.$executeRaw`
            INSERT INTO "DocumentChunk" ("id", "documentId", "title", "content", "chunkIndex", "embedding", "createdAt")
            VALUES (${crypto.randomUUID()}, ${doc.id}, ${chunk.title}, ${chunk.content}, ${chunk.index}, ${embeddingString}::vector, NOW())
          `
        })
      )
      
      const endTime = Date.now()
      console.log(`✅ [事务结束] ${chunks.length} 个 DocumentChunk 插入成功，耗时 ${endTime - startTime}ms`)
    } catch (chunkError) {
      console.warn(
        `⚠️ 文档 "${title}" 的 ${chunks.length} 个 DocumentChunk 插入失败，事务已自动回滚，不会产生脏数据。`
      )
      console.warn(`   错误详情:`, chunkError)
    }
    console.log(`✅ 文档 "${title}" 分块完成`)
  } catch (chunkError) {
    console.warn(`⚠️ 文档 "${title}" 分块过程出错，文档已保存但分块不完整:`, chunkError)
  }

  return doc
}

export async function addDocuments(
  documents: DocumentInput[]
) {
  const results: Awaited<ReturnType<typeof addDocument>>[] = []

  for (const doc of documents) {
    const result = await addDocument(
      doc.title,
      doc.content,
      {
        contentType: doc.contentType,
        category: doc.category,
        metadata: doc.metadata,
        userId: doc.userId,
      }
    )
    results.push(result)
  }

  return results
}

export function buildRAGContext(documents: Array<{ title: string; content: string; similarity?: number }>) {
  if (documents.length === 0) {
    return ''
  }

  const context = documents
    .map((doc, index) => {
      const relevance = doc.similarity !== undefined
        ? ` (相关度: ${(doc.similarity * 100).toFixed(0)}%)`
        : ''
      return `[文档${index + 1}] ${doc.title}${relevance}\n${doc.content}`
    })
    .join('\n\n---\n\n')

  return `你是电商AI助手，请严格基于以下知识库文档回答用户问题。

## 知识库文档
${context}

## 回答要求
1. 必须注明引用来源，格式：[来源：文档名]
2. 如果所有文档都与用户问题无关，回复"知识库中暂无相关信息，请补充相关文档后再试"
3. 回答简洁准确，不编造文档中没有的内容`
}