# RAG (检索增强生成) 功能设置指南

## 概述

本项目已集成 RAG (检索增强生成) 功能，使用 Supabase PostgreSQL + pgvector 作为向量数据库，通过 OpenRouter API 生成 embeddings。

## 技术栈

- **向量数据库**: Supabase PostgreSQL + pgvector
- **Embedding 模型**: OpenRouter (默认: `openai/text-embedding-3-small`)
- **相似度搜索**: HNSW 索引 + 余弦相似度
- **文档分类**: product, faq, policy, order, promotion, review

## 环境变量

在 `.env.local` 中添加（可选）：

```env
# Embedding 模型配置（可选，默认使用 openai/text-embedding-3-small）
EMBEDDING_MODEL=openai/text-embedding-3-small

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
GET /api/documents?q=你的问题&topK=5&category=faq
```

查询参数：
- `q`: 搜索查询（用于相似度搜索）
- `topK`: 返回结果数量（默认 5）
- `category`: 分类过滤（可选）

#### POST - 添加文档

```bash
# 单个文档
POST /api/documents
{
  "title": "文档标题",
  "content": "文档内容",
  "contentType": "text",
  "category": "faq",
  "metadata": {}
}

# 批量文档
POST /api/documents
{
  "documents": [
    { "title": "标题1", "content": "内容1", "category": "faq" },
    { "title": "标题2", "content": "内容2", "category": "product" }
  ]
}
```

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
