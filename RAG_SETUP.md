# RAG (检索增强生成) 功能设置指南

## 概述

本项目已集成 RAG (检索增强生成) 功能，使用 Supabase PostgreSQL + pgvector 作为向量数据库，通过兼容 OpenAI API 的模型服务生成 embeddings 和重排结果。

## 技术栈

- **向量数据库**: Supabase PostgreSQL + pgvector
- **Embedding 模型**: 默认 `Qwen/Qwen3-Embedding-8B`
- **Reranker**: 默认 `BAAI/bge-reranker-v2-m3`，不可用时回退到 LLM 评分
- **相似度搜索**: HNSW 索引 + 余弦相似度
- **文档分类**: product, faq, policy, order, promotion, review

## 环境变量

在 `.env.local` 中添加（可选）：

```env
# Embedding 模型
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-8B

# 专用 reranker 与 LLM fallback
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
LLM_RERANKER_MODEL=Qwen/Qwen3-8B

# 最低证据分数，低于阈值的结果不会注入模型上下文
RAG_MIN_EVIDENCE_SCORE=0.35

# 启用/禁用 RAG（可选，默认启用）
ENABLE_RAG=true
```

## 数据库设置

pgvector 扩展已启用，Document 表已创建，包含以下字段：

- `id`: UUID
- `userId`: 用户 ID（可选）
- `title`: 文档标题
- `content`: 文档内容
- `contentType`: 内容类型 (text/markdown/pdf)
- `category`: 分类 (product/faq/policy/order/promotion/review)
- `metadata`: JSON 元数据
- `embedding`: vector(1536) 向量
- `createdAt`, `updatedAt`: 时间戳

### HNSW 索引配置

已创建优化的 HNSW 索引用于加速相似度搜索：

```sql
CREATE INDEX documents_embedding_hnsw_idx 
ON "Document" 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);
```

参数说明：
- `m = 16`: 每个节点的最大连接数（平衡内存和查询速度）
- `ef_construction = 64`: 构建索引时考虑的候选数（影响索引质量和构建时间）
- `vector_cosine_ops`: 使用余弦相似度进行搜索

## API 端点

### 文档管理 (`/api/documents`)

#### GET - 获取文档或搜索

```bash
# 获取所有文档
GET /api/documents

# 搜索相似文档
GET /api/documents?search=你的问题&category=faq
```

查询参数：
- `search`: 搜索查询（用于相似度搜索）
- `category`: 分类过滤（可选）

#### POST - 添加文档

```bash
# 单个文档。接口返回 202，embedding 和分块由 worker 异步处理。
POST /api/documents
Idempotency-Key: 客户端生成的唯一键
{
  "title": "文档标题",
  "content": "文档内容",
  "contentType": "text",
  "category": "faq",
  "sourceType": "inline",
  "sourceName": "optional-source-name.md"
}
```

响应包含 `document` 和 `job`。只有 `document.status = READY` 的版本会参与 RAG 检索。

#### GET - 查询处理任务

```bash
GET /api/ingestion-jobs/{jobId}
```

任务状态：`QUEUED`、`PROCESSING`、`RETRY`、`COMPLETED`、`FAILED`、`CANCELLED`。

#### DELETE - 删除文档

```bash
DELETE /api/documents?id=文档ID
```

### 聊天 API (`/api/chat`)

聊天 API 已集成 RAG，默认自动启用。

```bash
POST /api/chat
{
  "messages": [
    { "role": "user", "content": "退货政策是什么？" }
  ],
  "useRAG": true  // 可选，默认为 true
}
```

## 使用脚本

### 启动异步处理 worker

先执行生产迁移并生成 Prisma Client：

```bash
npx prisma migrate deploy
npx prisma generate
```

长运行进程部署（Railway、Docker、VPS）：

```bash
npm run worker:ingestion
```

Serverless/定时任务部署需要配置 `INGESTION_WORKER_SECRET`，然后由调度器调用：

```bash
curl -X POST https://your-domain/api/ingestion/process \
  -H "Authorization: Bearer $INGESTION_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

worker 使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 原子领取任务，可以安全运行多个实例。失败任务最多重试 3 次；卡住超过 15 分钟的任务会被其他 worker 重新领取。

如需把每个文档版本归档到 Supabase Storage：

1. 在 Supabase SQL Editor 执行 `supabase/knowledge-storage.sql`。
2. 配置 `SUPABASE_KNOWLEDGE_BUCKET=knowledge-sources`。

未配置该变量时，系统仍会使用 PostgreSQL 中的 `Document.content` 作为权威源数据。

### 添加示例文档

```bash
npx tsx scripts/seed-sample-docs.ts
```

### 数据库迁移（已完成）

数据库已通过迁移脚本配置完成，包含：
- pgvector 扩展
- Document 表
- 优化的 HNSW 索引 (m=16, ef_construction=64)

## 示例文档

项目包含以下示例文档（通过 seed 脚本添加）：

- **退货政策** (policy)
- **运费规则** (policy)
- **常见问题 - 账户** (faq)
- **常见问题 - 支付** (faq)
- **产品规格 - 无线耳机** (product)
- **产品规格 - 智能手表** (product)

## RAG 工作流程

1. 用户发送问题
2. 系统提取最后一条用户消息
3. 生成查询 embedding
4. 在向量数据库中搜索最相似的 K 个文档
5. 将相关文档构建为上下文
6. 将上下文 + 用户问题一起发送给 LLM
7. LLM 基于参考资料回答

## 下一步

- [ ] 添加文档管理 UI
- [ ] 支持 PDF/Markdown 文件上传
- [ ] 实现文档分块（chunking）
- [ ] 添加 RAG 调试/可视化界面
- [ ] 优化 embedding 缓存
- [ ] 添加混合搜索（关键词 + 向量）
