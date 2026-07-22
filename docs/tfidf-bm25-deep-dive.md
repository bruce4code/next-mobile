# TF-IDF 与 BM25 深度解析：从理论到项目实战

> 全文检索与关键词排序的两大基石算法，从数学原理到 next-mobile 项目落地全链路拆解。

---

## 一、TF-IDF

### 1.1 是什么

**TF-IDF（Term Frequency - Inverse Document Frequency）** 是信息检索领域最经典的文本特征提取算法。一句话概括：

> **一个词对一篇文章的重要性，和它在当前文章中出现的次数成正比，和它在所有文章中出现频率成反比。**

公式：

```
TF-IDF(t, d, D) = TF(t, d) × IDF(t, D)

其中：
  TF(t, d) = 词 t 在文档 d 中出现的次数 / 文档 d 的总词数
  IDF(t, D) = log( 文档集 D 的总文档数 / 包含词 t 的文档数 )
```

### 1.2 解决什么问题

| 问题 | 没有 TF-IDF | 有 TF-IDF |
|------|------------|-----------|
| 精确匹配 | "篮球鞋" 和 "球鞋篮球" 算不匹配 | 两个词都命中，累加得分 |
| 高频词噪声 | "的""是""在" 每个文档都有，无法区分 | IDF ≈ 0，天然过滤 |
| 稀有词区分度 | "SNKRS" 和 "鞋子" 权重一样 | "SNKRS" 的 IDF 远高于 "鞋子" |
| 全文搜索排序 | 只能按时间倒序，相关度无保证 | TF-IDF 相关度排序 |

**核心洞察：TF-IDF 做了两件事——放大稀有词的权重，抑制常见词的干扰。**

### 1.3 数学直觉

```
假设有 1000 篇文档：

"篮球" 出现在 5 篇中   → IDF = log(1000/5) = log(200) ≈ 5.3
"的"   出现在 1000 篇中  → IDF = log(1000/1000) = log(1) = 0
```

一篇 500 词的篮球文章：
- "篮球" 出现 20 次 → TF = 20/500 = 0.04，TF-IDF = 0.04 × 5.3 = **0.212**
- "的" 出现 50 次 → TF = 50/500 = 0.1，TF-IDF = 0.1 × 0 = **0**

结论："的"无论出现多少次，最终得分永远为 0。

### 1.4 局限性

- **长文档偏差**：长文档词频除的分母大，可能被过度惩罚
- **词频线性增长**：一个词出现 100 次不会比出现 10 次相关 10 倍，但 TF-IDF 认为会
- **IDF 依赖文档集**：换个语料库，IDF 值全变了，不可移植

---

## 二、BM25

### 2.1 是什么

**BM25（Best Match 25）** 是 TF-IDF 的进化版，由 Stephen Robertson 和 Karen Spärck Jones 在 1994 年提出（BM 即 Best Match，25 是迭代版本号）。

> **BM25 在 TF-IDF 的基础上，增加了词频饱和控制和文档长度非线性归一化，使排序结果更符合人的直觉。**

公式：

```
BM25(q, d) = Σ IDF(qᵢ) × ───────────────────────────────
                          k₁ × (1 - b + b × |d| / avgdl) + TF(qᵢ, d)
```

三个超参数：

| 参数 | 含义 | 典型值 | 效果 |
|------|------|--------|------|
| `k₁` | 词频饱和陡峭度 | 1.2 ~ 2.0 | 越大，词频对得分影响越大 |
| `b` | 文档长度惩罚力度 | 0.75 | 0 = 不管长度，1 = 完全线性惩罚 |
| `avgdl` | 文档集平均长度 | 自动计算 | 用于归一化当前文档长度 |

### 2.2 解决什么问题 — 对比 TF-IDF 的三个改进

#### 改进 1：词频饱和函数

```
TF-IDF:  出现 1 次 = 1 分，出现 100 次 = 100 分  ← 不合理
BM25:    出现 1 次 ≈ 0.45 分，出现 10 次 ≈ 0.89 分，出现 100 次 ≈ 0.99 分
```

BM25 的 `TF / (k₁ + TF)` 是一个**单调递增但渐近收敛**的函数。词频超过一定阈值后，再多的出现也不加分。

#### 改进 2：文档长度非线性归一化

```
TF-IDF:  TF = 词频 / 文档总词数   ← 线性惩罚，长文档吃亏
BM25:    惩罚因子 = (1 - b + b × |d| / avgdl)   ← 可调的平滑惩罚
```

- `b=0`：完全不管文档长度（适合所有文档长度差不多的场景）
- `b=1`：完全按文档长度比例惩罚（等同于 TF-IDF 的效果）
- `b=0.75`（默认）：**适度惩罚长文档**，不夸张

#### 改进 3：更合理的 IDF 公式

BM25 的 IDF 使用 Robertson-Spärck Jones 公式，在极端情况下（如某词出现在超过一半的文档中）比传统 `log(N/n)` 更稳定：

```
BM25 IDF = log((N - n + 0.5) / (n + 0.5))
```

### 2.3 直观例子

有一个 10000 词的长文档，里面"退款"只出现 1 次：

```
TF-IDF (无 BM25):
  TF = 1/10000 = 0.0001 → 得分极低，几乎检索不到

BM25 (b=0.75, k₁=1.2, avgdl=200):
  |d|/avgdl = 10000/200 = 50
  分母 = 1.2 × (1 - 0.75 + 0.75 × 50) + 1 ≈ 46.2
  得分 ≈ 1/46.2 ≈ 0.022  ← 仍然有机会

BM25 (b=0):
  分母 = 1.2 × 1 + 1 = 2.2
  得分 ≈ 1/2.2 ≈ 0.45  ← 完全不受文档长度影响
```

**BM25 对短命中的容忍度远高于 TF-IDF，这在电商场景中至关重要——你不想因为"退货政策"文档太长就搜不到它。**

---

## 三、TF-IDF vs BM25 对比总结

| 维度 | TF-IDF | BM25 |
|------|--------|------|
| **TF 处理** | 线性：`f(t,d)`，词出现的次数越多分越高 | 饱和函数：`f(t,d) / (k₁ + f(t,d))`，超阈值后不再加分 |
| **文档长度** | 线性惩罚：除以文档总词数 | 非线性惩罚：`b` 参数 + `avgdl` 平滑调节 |
| **IDF** | `log(N/n)` | `log((N-n+0.5)/(n+0.5))`，极端情况更稳定 |
| **可调参数** | 无 | `k₁` 控制词频饱和，`b` 控制长度惩罚 |
| **长尾召回** | 差，稀有词在长文档中可能被彻底淹没 | 好，通过调整 `b` 降低长度惩罚 |
| **适用场景** | 关键词提取、文本分类特征 | 搜索引擎、信息检索、RAG 召回 |
| **实现复杂度** | 极简 | 中等，需要维护文档集统计信息 |

---

## 四、在 next-mobile 项目中的实现

### 4.1 整体架构

**[src/lib/rag.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts)** 是核心文件，实现了两层分工：

```
用户查询 "iPhone 15 Pro 深空黑价格"
    │
    ▼
┌─────────────────────────────┐
│  第一层：TF-IDF 关键词提取    │
│  @node-rs/jieba + 预训练IDF  │
│  → ["iPhone", "15", "Pro",  │
│      "深空黑", "价格"]        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  第二层：BM25 风格文档打分    │
│  ILIKE 召回 + 长度归一化      │
│  → keywordScore [0,1]       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  RRF 融合 + LLM Reranker    │
│  向量搜索 + 关键词搜索 合并    │
│  → 最终 Top-K 结果           │
└─────────────────────────────┘
```

### 4.2 第一层：TF-IDF 关键词提取

```typescript
// src/lib/rag.ts 第 11-12 行 — 模块级单例初始化
const jieba = Jieba.withDict(dict)
const tfidf = TfIdf.withDict(idf)

// 第 71-76 行 — 关键词提取
export function extractKeywords(text: string): string[] {
  const keywords = tfidf.extractKeywords(jieba, text, 5)
  return keywords
    .map(k => k.keyword)
    .filter(word => word.length > 0 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
}
```

**关键设计决策：**

- 使用 `@node-rs/jieba`（N-API 原生模块），性能比纯 JS 分词方案快数倍，且兼容 Vercel Serverless 部署
- IDF 词典来自 jieba 内置的大规模语料预训练数据，不需要基于当前文档库实时计算
- 取 Top 5 关键词，配合停用词表做二次过滤
- 过滤纯数字词（如"15"作为单独词会被过滤，但"15 Pro Max"中的"15"由 jieba 根据上下文保留）

### 4.3 第二层：BM25 风格文档打分

```typescript
// src/lib/rag.ts 第 122-219 行
async function keywordSearchWithScore(
  query: string,
  options: SearchOptions = {},
): Promise<KeywordMatch[]> {
  // 1. TF-IDF 提取关键词
  const keywords = extractKeywords(query)

  // 2. ILIKE 召回候选文档（召回量 = topK × 3）
  const likePatterns = keywords.map(kw => `%${kw}%`)
  const rawResults = await prisma.$queryRaw`
    SELECT ... FROM "DocumentChunk" dc
    JOIN "Document" d ON d.id = dc."documentId"
    WHERE (dc.title ILIKE ANY(${likePatterns})
        OR dc.content ILIKE ANY(${likePatterns}))
    LIMIT ${recallCount}
  `

  // 3. BM25 风格打分
  const scored = rawResults.map((row) => {
    let matchCount = 0
    for (const kw of keywords) {
      // title 命中权重 ×3
      if (titleLower.includes(kwLower)) matchCount += 3
      // content 中统计出现次数
      const contentMatches = (contentLower.match(
        new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      ) || []).length
      matchCount += contentMatches
    }
    // BM25 核心：长度归一化 (matchCount / √docLen)
    const normalizedScore = docLen > 0
      ? matchCount / Math.sqrt(docLen)
      : 0
    return { keywordScore: normalizedScore, matchCount, ... }
  })

  // 4. [0, 1] 归一化
  for (const s of scored) {
    s.keywordScore = maxScore > 0 ? s.keywordScore / maxScore : 0
  }

  // 5. 降序排列
  scored.sort((a, b) => b.keywordScore - a.keywordScore)
}
```

**实现中体现的 BM25 思想：**

| BM25 原版 | 项目实现 | 等价效果 |
|-----------|---------|---------|
| `k₁ × TF / (k₁ + TF)` 词频饱和 | matchCount 累加（次数天然有上限，等于关键词数量） | 饱和效果通过批次归一化近似 |
| `b × (|d| / avgdl)` 文档长度惩罚 | `matchCount / Math.sqrt(docLen)` | 平方根惩罚比线性更温和，接近 b=0.5 的效果 |
| IDF 加权 | jieba 预训练 IDF（在关键词提取阶段已过滤低权重词） | IDF 隐含在关键词选择中 |

### 4.4 RRF 融合（把两路结果合并）

```typescript
// src/lib/rag.ts 第 81-107 行
function computeRRFScores(vectorRanks, keywordRanks) {
  // RRF_K = 60，越小关键词排名权重越高
  for (const [, scores] of scoreMap) {
    let score = 0
    if (scores.vectorRank !== null) score += 1 / (60 + scores.vectorRank)
    if (scores.keywordRank !== null) score += 1 / (60 + scores.keywordRank)
    scores.rrfScore = score
  }
}
```

K=60 意味着：rank=1 得 1/61 ≈ 0.0164，rank=61 得 1/121 ≈ 0.0083，差距约 2 倍。越小 K 值让排名靠前的结果权重差距越大。

---

## 五、面试高频问题 + 回答思路

### Q1："什么是 TF-IDF？"

**回答思路：**
1. 一句话定义：TF × IDF，度量词对文档的重要性
2. 拆解：TF 衡量词在文档中出现的频率，IDF 衡量词在所有文档中的稀有程度
3. 举例：用 "篮球" vs "的" 的对比说明 IDF 如何天然过滤停用词
4. 结论：它解决的是"如何给文档中的词赋予合理权重"的问题

**参考回答：**

> TF-IDF 是一种统计方法，用来评估一个词对一篇文章有多重要。它由两部分组成：TF（词频）——这个词在当前文档中出现的次数除以总词数；IDF（逆文档频率）——log(总文档数/包含该词的文档数)。两者的乘积就是 TF-IDF。
>
> 它的核心思想是：一个词的重要性，和它在这篇文章中出现的次数成正比，和它在所有文章中出现频率成反比。比如"的"字几乎每篇文章都有，IDF 接近 0，所以最终得分也接近 0——天然就过滤掉了停用词。而像"SNKRS"这种只出现在少数几篇文章中的词，IDF 很高，一旦匹配就有较高的权重。

---

### Q2："TF-IDF 有什么局限性？BM25 怎么改进的？"

**回答思路：**
1. 三个局限 + 三个改进，一一对应
2. 用具体例子说明，不要只背公式
3. 点出 BM25 的超参数 `k₁` 和 `b` 的作用

**参考回答：**

> TF-IDF 有三个主要问题：
>
> 第一，**词频线性增长**。一个词出现 100 次不代表比出现 10 次相关 10 倍，但 TF-IDF 的 TF 是线性的。BM25 用饱和函数 `TF/(k₁+TF)` 解决——词频超过一定阈值后得分就不再增长。
>
> 第二，**文档长度线性惩罚**。TF-IDF 的 TF 除以文档总词数，长文档被过度惩罚。BM25 引入了 `b` 参数，通过 `(1-b+b×|d|/avgdl)` 做可调节的平滑惩罚，你可以设置 b=0 完全不管长度，或者 b=0.75 做适度惩罚。
>
> 第三，**IDF 在极端情况下不稳定**。当某个词出现在超过一半的文档中时，传统 IDF 可能是负数或零，BM25 用 Robertson-Spärck Jones 公式 `log((N-n+0.5)/(n+0.5))` 保持稳定性。

---

### Q3："混合检索为什么比纯向量搜索好？你项目里怎么做的？"

**回答思路：**
1. 先说各有短板
2. 再说如何互补
3. 结合项目具体实现

**参考回答：**

> 混合检索 = 向量搜索 + 关键词搜索。
>
> **向量搜索**擅长语义匹配——比如搜"怎么退款"能匹配到"退换货政策"——但它对精确术语（如商品型号"ABC-123"）的召回较差，因为 embedding 模型可能没见过这个型号。
>
> **关键词搜索**（BM25/TF-IDF）正好相反——字符级别的精确匹配能力极强，但理解不了同义词和语义变化。
>
> 在我的项目中，两路是**并行执行**的：向量搜索用 pgvector 的余弦相似度，关键词搜索用 jieba 提取 TF-IDF 关键词 + BM25 风格打分。两路结果通过 RRF（Reciprocal Rank Fusion）合并，不需要手动调权重就自然融合。最后可选加 LLM Reranker 精排。
>
> 在实际电商客服场景中，用户经常问"RH-2024-S 什么时候发货"，这个 SKU 号向量搜索几乎不可能精确命中，但关键词搜索能完美匹配。反过来用户说"这货咋退"，向量搜索能理解语义并导向退货政策，关键词搜索则可能束手无策。两路互补是真正的 1+1>2。

---

### Q4："你项目中 BM25 的实现为什么不直接用 Elasticsearch？"

**回答思路：**
1. 说明 trade-off
2. 解释实际场景下的考量

**参考回答：**

> 选型考量主要有三点：
>
> 第一，**场景规模**。这是一个面向特定电商客户的知识库系统，文档量级在千篇到万篇级别，不是搜索引擎级别。用 `ILIKE ANY` + 应用层 BM25 打分完全够用，引入 Elasticsearch 是杀鸡用牛刀。
>
> 第二，**基础设施简化**。我们已经用 PostgreSQL + pgvector 覆盖了业务数据和向量存储，关键词搜索也在同一个数据库里用 `ILIKE` 完成，意味着**零额外运维成本**。引入 ES 需要额外部署、同步、监控。
>
> 第三，**部署复杂度**。项目部署在 Vercel Serverless，减少外部依赖更有利。如果未来文档量级增长到百万级，我会考虑升级为 PostgreSQL 的 `tsvector` + GIN 全文索引，依然在 PG 生态内解决，或者切换到 Elasticsearch 的 BM25 原生实现。

---

### Q5："更好方案有哪些？你了解哪些开源库？"

**回答思路：**
1. 分层次介绍（轻量→中量→重量）
2. 给出你的选择理由

| 方案 | 适用场景 | 优缺点 |
|------|----------|--------|
| **jieba + 手写 BM25**（当前方案） | 小规模知识库、JS/TS 原生项目 | 零依赖、够用，但不支持分布式 |
| **PostgreSQL tsvector + GIN** | 中等规模，已有 PG | 一个数据库搞定，中文需要 zhparser 分词扩展 |
| **Elasticsearch BM25** | 大规模、需复杂聚合 | 原生 BM25，支持复杂查询和聚合，运维成本高 |
| **Meilisearch** | 中小规模，追求开发体验 | Rust 编写，性能好，API 友好，支持容错搜索 |
| **Typesense** | 中小规模，追求极致性能 | C++ 编写，毫秒级响应，支持 facet 和 grouping |

**补充回答：**

> 如果让我选一个升级路径，我会优先考虑 **Meilisearch** 或 **Typesense**。它们都是 Rust/C++ 编写，单机部署极简（Docker 一行命令），自带 BM25 实现、拼写纠错、同义词、facet 搜索等能力，API 设计优雅。关键是**不需要像 ES 那样维护集群和索引映射**，对中小团队友好。
>
> 如果必须留在 PostgreSQL 生态内，我会用 `zhparser` + `tsvector` 替代 jieba 分词，在数据库层面做全文索引，性能比应用层 ILIKE 提升至少一个数量级。

---

### Q6："TF-IDF 和 BM25 的 IDF 有什么区别？"

**回答思路：**
1. 公式对比
2. 极端情况分析

**参考回答：**

> TF-IDF 的 IDF = `log(N/n)`，BM25 的 IDF = `log((N-n+0.5)/(n+0.5))`。
>
> 假设 N=1000，一个词出现在 800 篇文档中：
> - TF-IDF IDF = log(1000/800) = log(1.25) ≈ 0.223
> - BM25 IDF = log((1000-800+0.5)/(800+0.5)) = log(200.5/800.5) ≈ log(0.25) ≈ **-1.386**
>
> BM25 的 IDF 会为高频词给出负分，相当于自动降权甚至排除。这是有意为之——出现在 80% 文档中的词，检索价值几乎为 0。
>
> 反方向：N=1000，一个词只出现在 2 篇：
> - TF-IDF IDF = log(1000/2) ≈ 6.215
> - BM25 IDF = log((1000-2+0.5)/(2+0.5)) = log(998.5/2.5) ≈ **5.989**
>
> 两者接近，但 BM25 稍低。区别主要在中间地带（出现频率 5%~80%），BM25 更平滑、对极端值更鲁棒。

---

### Q7："为什么不直接用 jieba 提取的所有分词做搜索，还要再过滤？"

**回答思路：**
1. 说明 TF-IDF 在关键词提取中的角色
2. 对比直接分词 vs TF-IDF 筛选

**参考回答：**

> jieba 分词会把一句话切成很多词片段，但不是所有片段都有检索价值。比如"请帮我查一下 iPhone 15 Pro 的价格"：
>
> jieba 分词结果：`["请", "帮", "我", "查", "一下", "iPhone", "15", "Pro", "的", "价格"]`
> TF-IDF 提取 Top 5：`["iPhone", "Pro", "价格", "15", "查"]`
>
> 直接用所有分词去 ILIKE 搜索，"请""帮""我""的"这些词会命中大量不相关文档，既浪费数据库 IO，又引入噪声。TF-IDF 在这里扮演的是**查询意图浓缩器**——它知道哪些词最「稀有」最有区分度，帮你过滤掉信息量为零的碎片。
>
> 此外，项目中还追加了一层停用词过滤（STOP_WORDS set）和纯数字过滤，做双重保险。

---

## 六、扩展：RAG 检索方案全景图

```
┌─────────────────────────────────────────────────────┐
│                    RAG 检索方案                       │
├─────────────┬─────────────────┬─────────────────────┤
│   稀疏检索    │     密集检索     │      混合检索        │
│  (关键词)     │   (语义向量)     │  (稀疏 + 密集)       │
├─────────────┼─────────────────┼─────────────────────┤
│ TF-IDF      │ Dense Passage   │ RRF 融合            │
│ BM25        │  Retrieval(DPR) │ 线性加权             │
│ 布尔检索     │ ColBERT         │ 学习融合             │
│             │ (Late Interaction)│                    │
└─────────────┴─────────────────┴─────────────────────┘
     ▲               ▲                  ▲
     │               │                  │
  本项目已实现    本项目已实现        本项目已实现
```

### 推荐方案选型指南

| 文档规模 | 推荐方案 |
|----------|---------|
| < 1 万篇 | jieba + 手写 BM25 + pgvector（当前方案） |
| 1 万 ~ 50 万篇 | PostgreSQL tsvector + pgvector（仍在 PG 生态） |
| 50 万 ~ 1000 万篇 | Elasticsearch BM25 + 独立向量数据库（如 Qdrant/Milvus） |
| > 1000 万篇 | Elasticsearch + Milvus + GPU reranker（如 ColBERT） |

---

## 七、一句话总结

| 算法 | 一句话 |
|------|--------|
| **TF-IDF** | "词的重要性 = 出现得多 × 出现得少的地方" |
| **BM25** | "TF-IDF 加两个旋钮（k₁, b），让打分更符合人类直觉" |
| **混合检索** | "向量搜索懂语义，关键词搜索记得精确词，两者合一才是王道" |

---

> **延伸阅读**：
> - [src/lib/rag.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts) — 项目核心 RAG 实现
> - [src/lib/reranker.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/reranker.ts) — LLM Reranker 实现
> - [src/lib/chunking.ts](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/chunking.ts) — 文档分块策略
> - [面试备战指南.md](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/docs/面试备战指南.md) — 项目级面试准备