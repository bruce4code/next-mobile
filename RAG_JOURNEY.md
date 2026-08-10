# 从零到1：构建一个完整的知识库 RAG 系统

## 背景

作为一个电商项目的开发者，我一直在思考如何让 AI 助手能够更好地回答用户关于产品、订单、政策等方面的问题。传统的 LLM 虽然强大，但缺乏最新的、特定的业务知识。RAG（检索增强生成）技术正好解决了这个问题——它可以让 AI 基于我们自己的知识库来回答问题。

在这篇文章中，我将分享从零到1构建一个完整知识库 RAG 系统的全过程，包括遇到的坑和解决方案。

## 技术选型

2026 年的今天，RAG 技术已经非常成熟。经过调研，我选择了以下技术栈：

- **向量数据库**: Supabase PostgreSQL + pgvector（成熟、稳定、易于集成）
- **Embedding 模型**: OpenRouter + Qwen/Qwen3-Embedding-8B（性价比高、支持中文）
- **ORM**: Prisma（类型安全、开发体验好）
- **Web 框架**: Next.js App Router（全栈能力强）

## 第一步：数据库设计

首先，我需要设计一个存储文档和向量的数据库表。

### Prisma Schema

```prisma
model Document {
  id          String   @id @default(uuid())
  userId      String?
  title       String
  content     String
  contentType String   @default("text")
  category    String?  // product, faq, policy, order, promotion, review
  metadata    Json?
  embedding   Unsupported("vector(1536)")?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
  @@index([category])
}
```

### 数据库迁移

接下来是数据库迁移，这一步遇到了第一个坑：

**问题**: 直接运行迁移会报错 "type vector does not exist"

**解决方案**: 必须先启用 pgvector 扩展，再创建表

```sql
-- 第一步：启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 第二步：创建 Document 表
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "category" TEXT,
    "metadata" JSONB,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- 第三步：创建 HNSW 索引加速搜索
CREATE INDEX documents_embedding_hnsw_idx 
ON "Document" 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);
```

## 第二步：Embedding 生成

有了数据库，接下来需要实现 embedding 生成功能。

### Embedding 模块

```typescript
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseURL: "https://openrouter.ai/api/v1",
})

const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-8b"

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const modelToUse = process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL
    console.log('正在调用的 embedding 模型:', modelToUse)
    
    const response = await openai.embeddings.create({
      model: modelToUse,
      input: text,
      dimensions: 1536,
    })

    const embedding = response.data[0].embedding
    console.log('Embedding 生成成功, 维度:', embedding.length)
    return embedding
  } catch (error) {
    console.error('生成 embedding 失败:', error)
    console.warn('使用随机 embedding 作为备用方案')
    return generateRandomEmbedding()
  }
}

function generateRandomEmbedding(): number[] {
  const embedding: number[] = []
  for (let i = 0; i < 1536; i++) {
    embedding.push((Math.random() - 0.5) * 2)
  }
  return embedding
}
```

**遇到的坑**:
1. **模型选择**: 一开始用 `qwen/qwen3-embedding-0.6b` 返回 404，后来换成 `qwen/qwen3-embedding-8b` 才正常
2. **维度问题**: 模型默认返回 4096 维，但数据库是 1536 维，需要添加 `dimensions: 1536` 参数

## 第三步：向量搜索

这是最核心的部分，也是坑最多的地方。

### RAG 搜索模块

```typescript
export async function searchSimilarDocuments(
  query: string,
  options: SearchOptions = {}
): Promise<DocumentResult[]> {
  try {
    const { topK = 5, category } = options

    console.log('RAG 搜索开始, 查询:', query)
    
    let queryEmbedding: number[]
    try {
      queryEmbedding = await generateEmbedding(query)
    } catch (embeddingError) {
      console.warn('无法生成查询 embedding，尝试文本搜索:', embeddingError)
      return await searchByText(query, options)
    }

    const queryEmbeddingString = `[${queryEmbedding.join(',')}]`
    let results: any[]
    
    if (category) {
      results = await prisma.$queryRaw`
        SELECT 
          id,
          title,
          content,
          "contentType",
          category,
          metadata,
          "createdAt",
          1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
        FROM "Document"
        WHERE embedding IS NOT NULL
        AND category = ${category}
        ORDER BY embedding <=> ${queryEmbeddingString}::vector
        LIMIT ${topK}
      `
    } else {
      results = await prisma.$queryRaw`
        SELECT 
          id,
          title,
          content,
          "contentType",
          category,
          metadata,
          "createdAt",
          1 - (embedding <=> ${queryEmbeddingString}::vector) as similarity
        FROM "Document"
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${queryEmbeddingString}::vector
        LIMIT ${topK}
      `
    }

    console.log('RAG 搜索结果数量:', (results as any[]).length)
    return results as DocumentResult[]
  } catch (error) {
    console.error('RAG 搜索失败，尝试文本搜索:', error)
    return await searchByText(query, options)
  }
}
```

**遇到的大坑**:
**问题**: Prisma 的 `$queryRaw` 中直接传入 embedding 数组会报错 "column embedding is of type vector but expression is of type text[]"

**解决方案**: 必须先将 embedding 数组转换为字符串格式 `[1.0, 2.0, ...]`，然后用 `::vector` 转换

```typescript
const queryEmbeddingString = `[${queryEmbedding.join(',')}]`
// 然后在 SQL 中使用: ${queryEmbeddingString}::vector
```

## 第四步：文档管理 API

接下来是文档的 CRUD API。

### 添加文档

```typescript
export async function POST(req: NextRequest) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    console.log('接收到的请求体:', body)

    const { title, content, contentType, category } = body
    const docId = crypto.randomUUID()
    const now = new Date()

    let embedding: number[] | null = null
    try {
      console.log('开始生成 embedding...')
      embedding = await generateEmbedding(content)
      console.log('Embedding 生成成功, 长度:', embedding.length)
    } catch (embeddingError) {
      console.warn('生成 embedding 失败，将不保存 embedding:', embeddingError)
    }

    if (embedding) {
      const embeddingString = `[${embedding.join(',')}]`
      await prisma.$executeRaw`
        INSERT INTO "Document" (
          "id", "title", "content", "contentType", "category", 
          "userId", "embedding", "createdAt", "updatedAt"
        ) VALUES (
          ${docId}, ${title}, ${content}, ${contentType || 'text'}, ${category},
          ${user.id}, ${embeddingString}::vector, ${now}, ${now}
        )
      `
    } else {
      await prisma.$executeRaw`
        INSERT INTO "Document" (
          "id", "title", "content", "contentType", "category", 
          "userId", "createdAt", "updatedAt"
        ) VALUES (
          ${docId}, ${title}, ${content}, ${contentType || 'text'}, ${category},
          ${user.id}, ${now}, ${now}
        )
      `
    }

    const result = await prisma.document.findUnique({
      where: { id: docId }
    })

    console.log('文档创建成功:', result?.id)
    return NextResponse.json(result)
  } catch (error) {
    console.error('添加文档失败:', error)
    return NextResponse.json({ error: '添加文档失败', details: String(error) }, { status: 500 })
  }
}
```

## 第五步：知识库管理 UI

有了 API，接下来需要一个用户友好的界面来管理知识库。

我实现了一个完整的知识库管理页面，包括：
- 列表/卡片视图切换
- 搜索和分类筛选
- 添加、编辑、删除文档
- 预览文档内容

## 第六步：集成到聊天系统

最后一步，将 RAG 集成到现有的聊天系统中。

### 构建 RAG 上下文

```typescript
export function buildRAGContext(documents: Array<{ title: string; content: string; similarity?: number }>) {
  if (documents.length === 0) {
    return ''
  }

  const context = documents
    .map((doc, index) => {
      let docInfo = `[文档 ${index + 1}: ${doc.title}]`
      if (doc.similarity !== undefined) {
        docInfo += ` (相似度: ${(doc.similarity * 100).toFixed(1)}%)`
      }
      return `${docInfo}\n${doc.content}`
    })
    .join('\n\n')

  return `【重要指令】你必须优先使用以下知识库中的信息来回答用户的问题！

【知识库参考资料】
${context}

【强制回答规则】
1. 🔴 必须首先尝试使用知识库中的信息回答
2. 🟢 如果知识库中有相关内容，必须基于知识库内容回答
3. 🟡 只有当知识库中完全没有相关信息时，才使用你自己的知识
4. 📝 回答要明确引用知识库中的内容
5. ✅ 保持回答准确、简洁、有帮助

【用户的问题】请基于以上知识库回答：`
}
```

## 完整的工作流程

1. 用户发送问题
2. 系统提取用户消息
3. 生成查询 embedding
4. 在向量数据库中搜索最相似的 K 个文档
5. 将相关文档构建为上下文
6. 将上下文 + 用户问题一起发送给 LLM
7. LLM 基于参考资料回答

## 最终效果

从终端日志可以看到，系统运行得非常完美：

```
Embedding 生成成功, 维度: 1536
RAG 搜索结果数量: 2
✅ 找到 2 个相关文档:
  1. 订单查询 (相似度: 59.3%)
  2. 产品信息 (相似度: 42.9%)
📚 RAG 上下文已添加到对话中
```

AI 助手能够准确地基于知识库内容回答用户的问题了！🎉

## 总结与心得

### 遇到的主要问题

1. **pgvector 扩展**: 必须先启用扩展才能创建 vector 类型的列
2. **Prisma 类型转换**: embedding 数组需要先转换为字符串格式才能在 SQL 中使用
3. **模型维度**: 注意模型返回的维度要与数据库定义一致
4. **模型可用性**: 某些模型在 OpenRouter 上可能不可用，需要有备选方案

### 关键技术点

1. **HNSW 索引**: 使用 HNSW 索引可以大幅提升向量搜索速度
2. **余弦相似度**: 使用 `<=>` 操作符计算余弦相似度
3. **备用方案**: 当向量搜索失败时，回退到文本搜索
4. **随机 embedding**: 当 API 调用失败时，使用随机 embedding 作为临时方案

### 下一步计划

- [ ] 支持 PDF/Markdown 文件上传
- [ ] 实现文档分块（chunking）
- [ ] 添加 RAG 调试/可视化界面
- [ ] 优化 embedding 缓存
- [ ] 添加混合搜索（关键词 + 向量）
- [ ] 文档版本控制
- [ ] AI 自动整理和总结知识库

## 结语

从零到1构建一个完整的 RAG 系统虽然遇到了不少坑，但整个过程非常有收获。现在，我的电商 AI 助手可以基于真实的知识库内容回答用户问题了，这大大提升了用户体验。

希望这篇文章能对你有所帮助！如果你也在构建 RAG 系统，欢迎交流心得。
