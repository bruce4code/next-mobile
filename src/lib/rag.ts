import { Prisma } from '@prisma/client'
import prisma from './prisma'
import { generateEmbedding } from './embedding'

// 电商常用词字典（用于中文分词，按长度降序）
const DICT = [
  '退换货', '退换', '退款', '退货', '换货', '保修', '赔偿', '赔付',
  '订单', '物流', '快递', '发货', '配送', '收货', '签收', '寄回',
  '商品', '产品', '规格', '型号', '尺码', '颜色', '材质', '包装',
  '客服', '售后', '服务', '投诉', '举报', '咨询',
  '优惠券', '优惠', '满减', '折扣', '促销', '秒杀', '拼团',
  '会员', '积分', '等级', '权益', '特权',
  '支付', '付款', '退款', '到账', '发票', '账单',
  '地址', '电话', '手机', '信息', '密码', '账号', '账户', '注册', '登录',
  '查询', '查看', '搜索', '找到', '知道', '请问', '帮助', '联系', '查',
  '申请', '审核', '提交', '取消', '修改', '删除', '添加', '保存',
  '问题', '原因', '情况', '解决', '处理', '办法', '流程', '规则',
  '多久', '几天', '多长', '多少', '怎么', '如何', '哪里', '什么',
  '苹果', '香蕉', '李子', '火龙果', '橙子', '草莓',
  '质量', '破损', '腐烂', '变质', '过期', '损坏', '瑕疵',
  '生鲜', '食品', '水果', '蔬菜', '肉类',
  '运费', '包邮', '免费', '价格', '原价', '现价', '金额',
  '全新', '二手', '拆封', '试用', '吊牌', '查',
].sort((a, b) => b.length - a.length)

// 停用词
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
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '想', '要', '能', '会', '可以',
  '哦', '哈', '嗯', '啊', '呀',
  '查', '一下', '一下下',
])

// 正向最大匹配中文分词
function extractKeywords(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < text.length) {
    let matched = false
    for (const word of DICT) {
      if (text.slice(i, i + word.length) === word) {
        tokens.push(word)
        i += word.length
        matched = true
        break
      }
    }
    if (!matched) {
      tokens.push(text[i])
      i++
    }
  }
  return tokens.filter(t => t.length > 0 && !STOP_WORDS.has(t) && !/^\d+$/.test(t))
}

// 相似度阈值：低于此值的文档视为不相关，不纳入上下文
const DEFAULT_MIN_SIMILARITY = 0.35
// 向量搜索的粗召回数量（比最终需要的多，给阈值过滤留余量）
const VECTOR_RECALL_MULTIPLIER = 3

interface SearchOptions {
  topK?: number
  category?: string
  minSimilarity?: number
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

export async function searchSimilarDocuments(
  query: string,
  options: SearchOptions = {}
): Promise<DocumentResult[]> {
  try {
    const { topK = 5, category, minSimilarity = DEFAULT_MIN_SIMILARITY } = options

    // 粗召回：多拉一些文档，给阈值过滤留空间
    const recallCount = topK * VECTOR_RECALL_MULTIPLIER

    console.log('RAG 搜索开始, 查询:', query)
    console.log(`  粗召回: ${recallCount} 条, 阈值: ${(minSimilarity * 100).toFixed(0)}%`)

    let queryEmbedding: number[]
    try {
      queryEmbedding = await generateEmbedding(query)
    } catch (embeddingError) {
      console.warn('⚠️ 无法生成查询 embedding，尝试文本搜索:', embeddingError)
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
        LIMIT ${recallCount}
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
        LIMIT ${recallCount}
      `
    }

    console.log(`  粗召回结果: ${(results as any[]).length} 条`)

    const filtered = (results as DocumentResult[]).filter(
      (r) => r.similarity >= minSimilarity
    )

    if (filtered.length < results.length) {
      console.log(
        `  阈值过滤: 剔除 ${results.length - filtered.length} 条低相关文档`
      )
    }

    const finalResults = filtered.slice(0, topK)
    console.log(`  最终返回: ${finalResults.length} 条`)

    if (finalResults.length === 0) {
      console.log('  ⚠️ 所有文档相似度均低于阈值，尝试文本搜索降级')
      return await searchByText(query, options)
    }

    return finalResults
  } catch (error) {
    console.error('RAG 搜索失败，尝试文本搜索:', error)
    return await searchByText(query, options)
  }
}

async function searchByText(query: string, options: SearchOptions = {}): Promise<DocumentResult[]> {
  try {
    const { topK = 5, category } = options
    console.log('  执行文本搜索降级, 查询:', query)

    const tagged = extractKeywords(query)
    const keywords = tagged
    console.log('  提取关键词:', keywords)

    if (keywords.length === 0) {
      console.log('  无有效关键词，返回空结果')
      return []
    }

    const whereClause: any = {
      OR: keywords.flatMap(kw => [
        { title: { contains: kw, mode: 'insensitive' } },
        { content: { contains: kw, mode: 'insensitive' } },
      ]),
    }

    if (category) {
      whereClause.category = category
    }

    const results = await prisma.document.findMany({
      where: whereClause,
      take: topK,
      orderBy: { createdAt: 'desc' },
    })

    console.log('  文本搜索结果数量:', results.length)
    if (results.length > 0) {
      results.forEach((doc, i) => {
        console.log(`    ${i + 1}. ${doc.title}: ${doc.content.substring(0, 50)}`)
      })
    }
    return results.map(doc => ({
      ...doc,
      similarity: 0.4,
    })) as DocumentResult[]
  } catch (textError) {
    console.error('  文本搜索也失败了:', textError)
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

  return await prisma.document.create({
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