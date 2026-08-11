---
title: "Hybrid Search + RRF + Reranker：打造电商 RAG 的精准检索三件套"
date: 2026-06-04
excerpt: "深入解析向量搜索 + 关键词搜索 + 倒数排名融合 + LLM 重排序的实现，构建一个生产级中文 RAG 检索系统。"
---

# Hybrid Search + RRF + Reranker：打造电商 RAG 的精准检索三件套

> 代码仓库：[next-mobile](https://github.com) | 核心实现：[`src/lib/rag.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts)

---

## 为什么需要混合检索？

在构建 RAG（Retrieval-Augmented Generation）系统时，检索质量决定了最终回答的上限。单一检索方式各有短板：

| 检索方式 | 优势 | 劣势 |
|---------|------|------|
| **向量搜索** | 语义理解强，能匹配同义词、近义表达 | 对精确关键词（如产品型号 "SKU-8843"）可能漏检 |
| **关键词搜索** | 精确匹配专有名词、数字、ID | 无法理解同义词，命中不到语义相近但用词不同的文档 |

**电商场景尤其典型** —— 用户可能问"iPhone 15 Pro 多少钱"，也可能问"那款苹果最新手机的价位"。前者需要关键词精确匹配型号，后者需要语义理解"苹果"对应"iPhone"。

**Hybrid Search（混合搜索）** 正是解法：同时执行向量和关键词两路检索，再通过算法融合排序，取长补短。

---

## 整体架构：三段式流水线

```
用户 Query
    │
    ▼
┌──────────────────────────────────────────────┐
│              Stage 1: 并行检索                │
│  ┌──────────┐          ┌──────────────────┐  │
│  │ 向量搜索  │          │ 关键词搜索 (BM25)  │  │
│  │ pgvector │          │ ILIKE + jieba    │  │
│  │ recall=3x│          │ recall=3x        │  │
│  └────┬─────┘          └────────┬─────────┘  │
└───────┼──────────────────────────┼───────────┘
        │                          │
        ▼                          ▼
┌──────────────────────────────────────────────┐
│              Stage 2: RRF 融合                │
│   1/(k+rank_vector) + 1/(k+rank_keyword)     │
│               merge & sort                   │
│            top-10 候选 →                    │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│           Stage 3: LLM Reranker              │
│     qwen3-8b 对候选文档打分 (0-10)           │
│           按 relevance 精排                   │
│              → top-5 结果                    │
└──────────────────────────────────────────────┘
```

---

## Stage 1：并行检索

### 1.1 向量搜索 — `vectorSearch()`

文件：[`src/lib/rag.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts#L372-L439)

核心思路：

1. 将 query 通过 [`generateEmbedding()`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/embedding.ts) 转为 1536 维向量（使用 `qwen/qwen3-embedding-8b` 模型）
2. 通过 pgvector 的余弦距离操作符 `<=>` 在 `DocumentChunk` 表中检索
3. 召回 `topK × 3` 数量的候选（多召回方便后续融合）
4. 过滤 `similarity < minSimilarity (0.35)` 的低质量结果

关键 SQL：

```sql
SELECT dc.id, dc.title, dc.content, ..., 
       1 - (dc.embedding <=> $queryEmbedding::vector) AS similarity
FROM "DocumentChunk" dc
JOIN "Document" d ON d.id = dc."documentId"
WHERE dc.embedding IS NOT NULL
ORDER BY dc.embedding <=> $queryEmbedding::vector
LIMIT $recallCount
```

> 使用 `<=>` 余弦距离并用 `1 - distance` 转换为相似度 [0, 1]。

### 1.2 关键词搜索 — `keywordSearchWithScore()`

文件：[`src/lib/rag.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts#L117-L214)

两步走：**关键词提取 → BM25 风格打分**。

**Step 1：jieba TF-IDF 提取关键词**

```typescript
const keywords = jieba.extract(text, 5)
  .map(k => k.word)
  .filter(word => !STOP_WORDS.has(word) && !/^\d+$/.test(word))
```

使用 nodejieba 的 TF-IDF 算法提取 Top-5 关键词，并过滤掉"的、了、是"等停用词和纯数字。

**Step 2：ILIKE 数据库召回**

```sql
SELECT dc.id, dc.title, dc.content, ...
FROM "DocumentChunk" dc
JOIN "Document" d ON d.id = dc."documentId"
WHERE dc.title ILIKE ANY($likePatterns) OR dc.content ILIKE ANY($likePatterns)
ORDER BY dc."createdAt" DESC
LIMIT $recallCount
```

每个关键词转为 `%keyword%` 通配模式，使用 PostgreSQL `ILIKE ANY()` 批量匹配，不区分大小写。

**Step 3：BM25 风格评分**

```typescript
// 归一化到分块长度，避免长文档天然高分
const normalizedScore = matchCount / Math.sqrt(doc.length)
```

核心思想：
- 关键词在 `title` 中每命中一次权重 `×3`
- 关键词在 `content` 中统计出现次数
- 用 `Math.sqrt(docLength)` 做长度归一化
- 最终分数做 `[0, 1]` Min-Max 归一化

---

## Stage 2：RRF（Reciprocal Rank Fusion）融合

文件：[`src/lib/rag.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts#L76-L102)

两路检索各自返回一个排序列表，需要合并为一个统一排序。RRF 是业界验证的简洁有效方案：

```
RRF_score(d) = Σ 1 / (k + rank_i(d))
```

其中 `rank_i(d)` 是文档 `d` 在第 `i` 个检索结果中的排名，`k` 是常数（本文取 60）。

为什么 `k=60` 比较小？

> 较小的 `k` 让 keyword 结果在融合时权重更高。这对于中文电商场景很有意义——精确的产品型号、规格参数必须优先保证不会在向量搜索中"丢失"。

```typescript
function computeRRFScores(
  vectorRanks: RankedItem[],
  keywordRanks: RankedItem[],
): Map<string, { rrfScore: number; vectorRank: number | null; keywordRank: number | null }> {
  const scoreMap = new Map()

  // 登记两路结果的排名
  for (const item of vectorRanks) {
    scoreMap.set(item.id, { vectorRank: item.rank, keywordRank: null, rrfScore: 0 })
  }
  for (const item of keywordRanks) {
    const existing = scoreMap.get(item.id)
    if (existing) {
      existing.keywordRank = item.rank   // 两路都有 = overlap
    } else {
      scoreMap.set(item.id, { vectorRank: null, keywordRank: item.rank, rrfScore: 0 })
    }
  }

  // 计算 RRF 得分
  for (const [, scores] of scoreMap) {
    let score = 0
    if (scores.vectorRank !== null) score += 1 / (RRF_K + scores.vectorRank)
    if (scores.keywordRank !== null) score += 1 / (RRF_K + scores.keywordRank)
    scores.rrfScore = score
  }

  return scoreMap  // 按 rrfScore 降序排列
}
```

**RRF 的优势：**
- 不需要对两路分数做归一化（向量余弦相似度和关键词 BM25 分数尺度不同）
- 仅依赖排名，天然抗异常值
- 计算量极小，无外部依赖

---

## Stage 3：LLM Reranker

文件：[`src/lib/reranker.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/reranker.ts)

RRF 融合后得到 top-10 候选，但它们仍是"机械组合"。当候选数多于最终需要的数量时（比如需要 5 个结果），让 LLM 再做一次精排。

### 设计思路

```typescript
export async function rerankResults(query, candidates, options = {}) {
  // 候选数 ≤ 目标数 → 跳过，直接返回
  if (candidates.length <= topK) return candidates.slice(0, topK)

  // 构建 prompt，让 LLM 打分
  const prompt = buildPrompt(query, candidates)
  const response = await openai.chat.completions.create({
    model: 'qwen/qwen3-8b',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,      // 低温度，稳定输出
    max_tokens: 500,       // 控制成本
    response_format: { type: 'json_object' },  // 要求返回 JSON
  })

  // 解析打分结果，按 relevance 降序重排
  const parsed = JSON.parse(content)
  const reordered = candidates
    .map((doc, i) => ({
      ...doc,
      similarity: relevanceMap.get(i) / 10  // 归一化
    }))
    .sort((a, b) => b.similarity - a.similarity)

  return reordered.slice(0, topK)
}
```

### Prompt 设计

LLM 对每个候选文档从 0 到 10 打分，并给出简短理由：

```
你是一个文档相关性评估专家。请判断以下文档与用户问题的相关程度。

用户问题: "{query}"

打分标准：
- 0 = 完全不相关
- 5 = 部分相关
- 10 = 高度相关，直接回答用户问题

只返回一个 JSON 对象：
{"scores": [{"index": 0, "relevance": 8, "reason": "简短理由"}, ...]}
```

### 防抖设计

整个 reranker 处处有兜底 — 任何环节失败都 fallback 到原始排序：

- JSON 解析失败 → 返回原顺序
- LLM 返回空 → 返回原顺序
- API 调用异常 → 返回原顺序

> Reranker 默认关闭，通过 `RERANKER_ENABLED=true` 环境变量或调用参数显式打开。开启后约增加 200ms 延迟和少量 token 消耗。

---

## 完整流程：`searchSimilarDocuments()`

文件：[`src/lib/rag.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts#L217-L369)

```typescript
export async function searchSimilarDocuments(query, options = {}) {
  const { mode = 'hybrid', reranker, topK = 5 } = options

  // 1. 并行检索
  const [vectorResults, keywordResults] = await Promise.allSettled([
    vectorSearch(query, { topK, ... }),
    keywordSearchWithScore(query, { topK, ... }),
  ])

  // 2. RRF 融合
  const rrfScores = computeRRFScores(vectorRanks, keywordRanks)
  let final = merged.sort(byScore).slice(0, HYBRID_TOP_K) // top-10

  // 3. LLM Reranker（可选）
  if (reranker && final.length > topK) {
    final = await rerankResults(query, final, { topK })
  } else {
    final = final.slice(0, topK)
  }

  return final
}
```

### 几个关键设计决策

**1. `Promise.allSettled` 而非 `Promise.all`**

两端检索独立运行，任意一端失败不阻塞另一端。比如关键词提取失败（jieba 抽取不到有效关键词），向量搜索结果仍然可用。

**2. 3 倍召回乘数**

```typescript
const VECTOR_RECALL_MULTIPLIER = 3
const KEYWORD_RECALL_MULTIPLIER = 3
```

两路各自召回 `topK × 3` 条结果，给 RRF 融合和 reranker 留足筛选空间。

**3. 文本降级兜底**

当两路检索都返回空时（例如 jieba 抽取不到有效关键词 + 向量相似度过低），系统会触发原始 ILIKE 降级查询，确保不出现"零结果"。

---

## Embedding 缓存层

文件：[`src/lib/embedding.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/embedding.ts)

每次调用 `generateEmbedding()` 前先查 `EmbeddingCache` 表，命中则直接返回，节省 API 调用和延迟：

```typescript
export async function generateEmbedding(text: string): Promise<number[]> {
  const textHash = hashText(text)  // MD5 哈希

  // 查缓存
  const rows = await prisma.$queryRaw`
    SELECT "embedding"::text FROM "EmbeddingCache"
    WHERE "textHash" = ${textHash} AND "model" = ${modelToUse}
    LIMIT 1
  `
  if (rows.length > 0) return parseEmbedding(rows[0].embedding)

  // 调 API 并写入缓存
  const embedding = await openai.embeddings.create({ ... })
  await prisma.$executeRaw`
    INSERT INTO "EmbeddingCache" (...) VALUES (...)
    ON CONFLICT ("textHash", "model") DO NOTHING
  `
  return embedding
}
```

---

## 总结

这套 **Hybrid Search + RRF + Reranker** 三段式架构，在电商 RAG 场景下解决了单一检索的痛点：

| 阶段 | 职责 | 技术选型 |
|------|------|---------|
| 向量搜索 | 语义检索 | pgvector + qwen3-embedding-8b |
| 关键词搜索 | 精确匹配 | jieba TF-IDF + ILIKE + BM25 评分 |
| RRF 融合 | 两路结果合并 | Reciprocal Rank Fusion (k=60) |
| LLM Reranker | 精排 | qwen3-8b 打分 (0-10)，兜底保障 |

**关键工程实践：**
- 并行检索用 `Promise.allSettled` 做容错
- 3 倍召回留足候选空间
- 零结果时触发文本降级兜底
- Reranker 层层 fallback 不死链
- Embedding 缓存避免重复 API 调用

完整的代码实现见 [`src/lib/rag.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts)、[`src/lib/reranker.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/reranker.ts) 和 [`src/lib/embedding.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/embedding.ts)。

---

## 下阶段优化建议

基于当前代码现状（[chat/route.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/app/api/chat/route.ts)、[documents/route.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/app/api/documents/route.ts)），以下是优先级从高到低的改进方向：

### 1. 接入 Reranker 到 Chat 流程（优先）

**现状**：Reranker 在 [`reranker.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/reranker.ts) 已完整实现，但 [chat/route.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/app/api/chat/route.ts#L143-L146) 调用 `searchSimilarDocuments` 时未传入 `reranker` 参数：

```typescript
// 当前代码
const similarDocs = await searchSimilarDocuments(
  lastUserMessage.content,
  { topK: 5 }
)
```

**建议**：根据环境变量或请求参数开启 reranker：

```typescript
const similarDocs = await searchSimilarDocuments(
  lastUserMessage.content,
  {
    topK: 5,
    mode: 'hybrid',
    reranker: process.env.RERANKER_ENABLED === 'true' ? { topK: 5 } : false,
  }
)
```

预期提升检索精度，尤其是候选文档较多时。

### 2. Documents API 迁移到 Hybrid Search

**现状**：[documents/route.ts 的 GET](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/app/api/documents/route.ts#L26-L75) 仍使用老旧的单路向量搜索，未复用 `searchSimilarDocuments()`。

**建议**：将 documents 搜索也走统一的 hybrid search，保持检索口径一致。

### 3. Query Rewriting（查询改写）

**问题**：用户输入"那个苹果手机多少钱"，其中"那个"是口语化指代，jieba 可能提取出"苹果手机"但丢失了指代消解的需求。

**方案**：在检索前增加一个轻量级 LLM query rewriting 步骤：

```
原始: "那个苹果手机多少钱"
改写: "iPhone 最新款 价格"
```

可以用极低成本模型（如 `qwen/qwen3-8b`，单次 < $0.001）做一次小请求，显著提升关键词提取和向量检索质量。与 reranker 形成互补：rewriter 改善**召回**，reranker 改善**排序**。

### 4. 多轮对话上下文增强

**现状**：[chat/route.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/app/api/chat/route.ts#L130-L132) 只用最后一条 user 消息做检索：

```typescript
const lastUserMessage = [...enhancedMessages].reverse().find(
  (msg) => msg.role === 'user'
)
```

**问题**：多轮对话中，用户可能说"那个怎么退款？"，缺少上文"我刚买了一件衣服"的上下文。

**方案**：
- 将最近 2-3 轮对话拼接为检索 query
- 或对完整对话历史做 LLM 摘要，用摘要代替单条消息检索

### 5. 检索结果缓存

**问题**：同一 query 反复请求会重复执行完整的三段式流水线（embedding 已有缓存，但检索本身无缓存）。

**方案**：对 `<query, topK, category>` 做短期缓存（TTL 5-10 分钟），可以用 Redis 或内存 LRU。电商场景下用户常问相同问题（"退货政策""运费多少"），命中率预计 20-30%。

### 6. Chunk 上下文窗口（Contextual Retrieval）

**问题**：当前分块互相独立，检索只返回匹配的那一块，丢失了前后文。

**方案**：返回匹配块的同时，附带前一个和后一个 chunk 作为上下文窗口。成本极低（仅多查两条 SQL），但显著提升 LLM 对文档的整体理解。

### 7. 元数据过滤增强

**现状**：仅支持 `category` 过滤。

**方案**：扩展为支持多维度过滤（`tags`、`dateRange`、`contentType`、自定义 metadata key），让检索在缩小范围的同时保持精度。

### 8. 评估体系搭建

**问题**：无法量化"这套检索效果好不好"。

**方案**：构建一个小型 benchmark：
- 准备 30-50 个 QA pair（问题 + 期望文档 ID）
- 计算 Recall@5、MRR、NDCG@5
- 每次优化后跑一遍，用数据而非感觉做决策

---

## 优先级总结

| 优先级 | 任务 | 预期收益 | 实施成本 |
|--------|------|---------|---------|
| P0 | 接入 Reranker 到 Chat | 检索精度立刻提升 | 低（改 1 行） |
| P0 | Documents API 迁移 Hybrid | 统一检索口径 | 低 |
| P1 | Query Rewriting | 提升口语化查询召回 | 中（增加一次 LLM 调用） |
| P1 | 多轮上下文增强 | 改善对话连续性 | 中 |
| P1 | Chunk 上下文窗口 | 改善 LLM 理解 | 低 |
| P2 | 检索结果缓存 | 降低延迟和成本 | 中 |
| P2 | 元数据过滤增强 | 精准过滤 | 中 |
| P3 | 评估体系 | 量化优化效果 | 高（准备数据） |

---

*Have thoughts? Reach out on [GitHub]() or [X]().*