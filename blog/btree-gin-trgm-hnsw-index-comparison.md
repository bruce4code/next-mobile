---
title: "B-tree vs GIN Trigram vs HNSW：三种索引的深层对比"
date: 2026-06-04
excerpt: "深入解析三种数据库索引的工作原理、适用场景及协作方式，理解它们为什么不是一个替代另一个的关系。"
---

# B-tree vs GIN Trigram vs HNSW：三种索引的深层对比

## 先理解核心概念：什么是索引？

想象一本书的附录索引：

| 索引类型 | 类比 | 解决什么问题 |
|---------|------|-------------|
| **B-tree** | 按拼音排序的「关键词 → 页码」表 | **精确查找** |
| **GIN trigram** | 按字组合拆分的「"退货"出现在哪些页」表 | **模糊搜索** |
| **HNSW** | 根据主题相似度画的「相邻概念地图」 | **语义搜索** |

三者解决的是**完全不同的问题**，不存在谁替代谁，而是互补关系。

---

## 一、B-tree 索引 — 精确匹配

### 工作原理

像电话簿一样严格排序。查找时做**二分查找**——每次排除一半数据：

```
数据: [1, 3, 5, 7, 9, 11, 13, 15]
查找 11:
  ① 看中间 7 → 小了 → 进入右半
  ② 右半 [9,11,13,15] → 中间 13 → 大了 → 进入左半
  ③ 找到 11 ✅
只需 3 次比较，而不是 7 次全扫
```

时间复杂度：**O(log n)** —— 100 万条数据只需约 20 次比较。

### 适用场景

```sql
WHERE id = 'abc-123'               -- 主键查询 ✅
WHERE category = 'policy'          -- 等值过滤 ✅
WHERE createdAt > '2026-01-01'     -- 范围查询 ✅
ORDER BY createdAt DESC            -- 排序 ✅
```

**不能用于：**

```sql
WHERE content LIKE '%退货%'    -- B-tree 只能加速 "退货%"（前缀），
                                -- 不能加速 "%退货%"（中间/后缀）
WHERE embedding <=> $vector    -- 向量距离不是标量，无法排序
```

### 在项目中的作用

```prisma
@@index([userId])     -- 按用户查文档加速
@@index([category])   -- 按分类过滤加速
@@index([documentId]) -- Join 加速（Document → DocumentChunk）
```

---

## 二、GIN Trigram — 模糊/关键词搜索

### 工作原理

把文本切成**连续 3 个字符的片段**（trigram），为每个片段建一个**倒排索引**（inverted index）：

```
"退货政策真棒"
  → trigram（3-gram）:
    ["退货政", "货政策", "政策真", "策真棒"]

用户搜 "退货"
  → trigram: ["退货"]
  → 在倒排索引中找到所有包含 "退货" 的文档 ID
  → 只扫描这些候选行
```

### 为什么 B-tree 做不到？

```sql
-- B-tree 按首字母排序，能快速定位到 "退" 开头
WHERE title LIKE '退%'           -- B-tree ✅

-- 但 '退货' 在中间时，B-tree 不知道从哪开始找
WHERE title LIKE '%退货%'        -- B-tree ❌ 必须全表扫描

-- GIN trigram 通过倒排表直接命中
WHERE title LIKE '%退货%'        -- GIN trigram ✅
```

### 适用场景

```sql
WHERE title ILIKE ANY($keywords)    -- 关键词任意位置匹配 ✅
WHERE content ILIKE '%运费%'        -- 全文任意位置搜索 ✅
```

### 优势

- 不走全表扫描，效率远高于 `LIKE '%keyword%'`
- 不区分大小写（`ILIKE` 配合 `gin_trgm_ops`）
- 支持多关键词组合

### 局限

| 限制 | 说明 |
|------|------|
| **最短 3 字符** | trigram 是 3-gram，搜 "AI"、"OK" 这种 2 字符词退化为全表扫描 |
| **不理解语义** | "苹果手机"和 "iPhone" 在 trigram 眼中毫无关系，字符完全不重叠 |
| **索引体积大** | 约为原文本的 2-3 倍 |
| **只做包含匹配** | 不做排序/打分（配合 BM25 评分算法使用） |

---

## 三、HNSW — 向量/语义搜索

### 工作原理

HNSW（Hierarchical Navigable Small World，分层可导航小世界）把高维向量空间构造成**多层图结构**，灵感来自社交网络的"六度分隔"理论：

```
顶层（稀疏）：      [A] → [B] → [C]       ← 快速定位大致区域
                    ↓     ↓     ↓
中间层：       [A1]→[A2]→[B1]→[B2]→[C1]  ← 细粒度查找
                    ↓     ↓     ↓     ↓
底层（稠密）：A1a A1b A2a B1a B1b B2a C1a C1b ← 精确最近邻
```

**搜索过程**：从顶层进入 → 快速找到最近区域 → 逐层下钻 → 底层找到最近邻居。这种分层设计使得搜索时间复杂度达到 **O(log n)** 级别。

### 为什么前两种不行？

对于**语义相近但用词不同**的查询：

```typescript
用户查询: "苹果最新手机多少钱"
期望匹配: "iPhone 15 Pro 售价5999元"

B-tree:        ❌ 关键词不匹配，无法按字符串排序命中
GIN trigram:   ❌ "苹果"和"iPhone"在字符级别完全不同
HNSW:          ✅ "苹果"和"iPhone"的 embedding 向量距离很近
```

这是因为 B-tree 只能比"大小"（数值、字典序），GIN trigram 只能比"字符片段"，而 HNSW 比较的是**语义距离**——由 embedding 模型将"苹果"和"iPhone"映射到向量空间中的相近位置。

### HNSW 参数详解

```sql
CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

| 参数 | 含义 | 当前值 | 越大越好？ | 推荐值 |
|------|------|:-----:|-----------|:-----:|
| `m` | 每个节点最多连接的邻居数 | 16 | 精度↑ 但内存↑ 建索引慢↑ | 16-32 |
| `ef_construction` | 构建时搜索的候选数 | 64 | 精度↑ 但建索引慢↑ | 64-128 |

- 数据量 < 10 万：`m=16, ef_construction=64` 足够
- 数据量 > 100 万：建议 `m=32, ef_construction=128`

### 距离度量

```sql
vector_cosine_ops  -- 余弦距离（推荐用于文本 embedding）
vector_l1_ops      -- 曼哈顿距离
vector_l2_ops      -- 欧几里得距离
```

对于文本语义搜索，**余弦距离**是最常用的，因为它关注的是向量的"方向"而非"长度"。

### 局限

| 限制 | 说明 |
|------|------|
| **依赖 embedding 模型** | 每条数据插入前需要调用 LLM 生成向量，增加延迟和成本 |
| **仅返回"语义最近"** | 无法精确匹配关键字，可能与用户期望有落差 |
| **内存消耗大** | 向量数据必须常驻内存才能快速检索 |

---

## 四、三者对比总表

| 维度 | B-tree | GIN trigram | HNSW |
|------|--------|-------------|------|
| **解决的问题** | 精确查找、范围、排序 | 子串模糊匹配 | 语义相似度搜索 |
| **匹配方式** | 数值/字符串比较 | 字符 n-gram 倒排 | 向量距离度量 |
| **查询类型** | `=`, `>`, `<`, `IN`, `ORDER BY` | `ILIKE '%keyword%'` | `<=>` 余弦距离 |
| **能否加速 `%keyword%`** | ❌ | ✅ | ❌ |
| **能否理解语义** | ❌ | ❌ | ✅ |
| **建索引速度** | 快（秒级） | 中（分钟级） | 慢（依赖数据量） |
| **索引占用空间** | 小 | 中-大（2-3x 原文） | 大（1.5x 向量数据） |
| **写入影响** | 小 | 中 | 中-大 |
| **是否需要外部 API** | 否 | 否 | 需要 embedding 模型 |
| **时间复杂度** | O(log n) | O(k) k=匹配文档数 | O(log n) |

---

## 五、在你的 RAG 项目中如何协作

以本项目的 hybrid search 为例，三种索引在同一个流水线中协作：

```python
用户 Query: "苹果手机怎么退款"

             │
             ▼
    ┌────────────────────────────┐
    │ jieba 提取关键词           │
    │ 关键词: ["苹果", "手机"]    │
    │ embedding: [0.12, 0.87...] │
    └───────────┬────────────────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ 向量搜索      │  │ 关键词搜索    │
│ HNSW 索引     │  │ GIN trigram  │
│              │  │              │
│ 语义匹配      │  │ 字符匹配      │
│ "苹果手机" →  │  │ '%苹果%' OR  │
│ iPhone 文档   │  │ '%手机%' OR  │
│              │  │ '%退款%'     │
└──────┬───────┘  └──────┬───────┘
       │                 │
       └──────┬──────────┘
              ▼
      ┌──────────────┐
      │  RRF 融合     │
      │  1/(k+rank)   │
      │  + Reranker   │
      │  → 最终结果    │
      └──────────────┘
```

**B-tree 的基础过滤角色**（图中未显式标注）：

```sql
SELECT ...
FROM "DocumentChunk" dc
JOIN "Document" d ON d.id = dc."documentId"  -- ← B-tree 索引加速 Join
WHERE d.category = 'policy'                    -- ← B-tree 索引加速过滤
```

**三剑客缺一不可：**

| 索引 | 在项目中的角色 | 负责什么 |
|------|-------------|---------|
| **B-tree** | 基础过滤 + Join | `category` 过滤、`ORDER BY`、外键 Join |
| **GIN trigram** | 精确关键词命中 | 确保 "SKU-8843"、"iPhone 15" 等精确匹配不被遗漏 |
| **HNSW** | 语义检索 | "苹果手机"→"iPhone"、"退款"→"退货政策" 的语义联想 |

---

## 六、建索引的代价与权衡

```sql
-- B-tree: 几乎无代价，默认就建
CREATE INDEX idx_cat ON "Document"(category);
-- 创建时间: < 1 秒
-- 写入影响: 几乎无感

-- GIN trigram: 中等代价
CREATE INDEX idx_content_trgm ON "DocumentChunk" USING gin (content gin_trgm_ops);
-- 创建时间: 几秒到几分钟（取决于数据量）
-- 索引大小: 约为原文的 2-3 倍
-- 写入影响: INSERT/UPDATE 时需要更新倒排表，延迟增加

-- HNSW: 较高代价
CREATE INDEX idx_embedding ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
-- 创建时间: 分钟级到小时级（取决于数据量）
-- 内存需求: 向量数据必须装进内存
-- 写入影响: 需要更新多层图结构，是三者中最大的
```

### 在项目中的实际配置

```typescript
// 召回倍率设计 —— 多召回一些候选，再用 RRF + Reranker 精排
// 这背后的原因是：HNSW 在召回 topK 时可能有边界误差，
// 多召回 3 倍可以有效弥补近似搜索的精度损失
const VECTOR_RECALL_MULTIPLIER = 3
const KEYWORD_RECALL_MULTIPLIER = 3
```

---

## 七、总结

**没有万能的索引，只有合适的选择：**

- **B-tree** 是基础设施，就像马路上的车道线——必须有，但只解决基础问题
- **GIN trigram** 是精确制导，专门对付 `LIKE '%keyword%'` 这种"文本里找字"的需求
- **HNSW** 是"智能联想"，让计算机理解"苹果手机 ≈ iPhone"这种人类直觉

在 RAG 系统里，三者协作的方式是：**B-tree 做基础过滤，GIN trigram 做精确召回，HNSW 做语义补充，最后通过 RRF 融合 + Reranker 精排输出最终结果。**

---

*参考：本项目 hybrid search 完整代码见 [`src/lib/rag.ts`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/src/lib/rag.ts)，数据库索引定义见 [`prisma/migrations/`](file:///Users/linruitao/Documents/100-study/200-reactjs/next-mobile/prisma/migrations/)。*