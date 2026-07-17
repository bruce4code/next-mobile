/**
 * 批量上传 docs/ecommerce/ 下的所有 Markdown 文档到知识库
 *
 * 使用方式:
 *   npx tsx scripts/upload-docs.ts
 *
 * 分类映射规则:
 *   文件名 → category
 *   退换货政策 → policy
 *   配送与物流 → shipping
 *   支付相关 → payment
 *   售后服务 → after-sale
 *   用户账户 → account
 *   优惠与促销 → promotion
 *   常见问题FAQ → faq
 *   价格保护 → policy
 */

import fs from 'fs'
import path from 'path'

const DOCS_DIR = path.resolve(__dirname, '../docs/ecommerce')
const API_URL = process.env.API_URL || 'http://localhost:3000'

// 文件名到 category 的映射
const CATEGORY_MAP: Record<string, string> = {
  '退换货政策': 'policy',
  '配送与物流': 'shipping',
  '支付相关': 'payment',
  '售后服务': 'after-sale',
  '用户账户': 'account',
  '优惠与促销': 'promotion',
  '常见问题FAQ': 'faq',
  '价格保护': 'policy',
}

interface UploadResult {
  title: string
  category: string
  status: 'success' | 'failed'
  error?: string
}

async function uploadDocument(
  title: string,
  content: string,
  category: string,
): Promise<UploadResult> {
  try {
    const response = await fetch(`${API_URL}/api/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content,
        contentType: 'markdown',
        category,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { title, category, status: 'failed', error: `HTTP ${response.status}: ${errorText}` }
    }

    return { title, category, status: 'success' }
  } catch (error) {
    return { title, category, status: 'failed', error: String(error) }
  }
}

async function main() {
  console.log('📤 批量上传电商文档到知识库\n')

  // 检查目录是否存在
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`❌ 目录不存在: ${DOCS_DIR}`)
    process.exit(1)
  }

  // 读取所有 md 文件
  const files = fs.readdirSync(DOCS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()

  if (files.length === 0) {
    console.log('❌ docs/ecommerce/ 下没有找到 Markdown 文件')
    process.exit(1)
  }

  console.log(`找到 ${files.length} 个文档：`)
  files.forEach(f => console.log(`  - ${f}`))
  console.log('')

  // 逐个上传
  const results: UploadResult[] = []
  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    // 文件名去扩展名作为标题
    const title = file.replace(/\.md$/, '')
    const category = CATEGORY_MAP[title] || 'faq'

    console.log(`⏳ 上传: ${title} (category: ${category})...`)
    const result = await uploadDocument(title, content, category)
    results.push(result)

    if (result.status === 'success') {
      console.log(`  ✅ 成功`)
    } else {
      console.log(`  ❌ 失败: ${result.error}`)
    }
  }

  // 汇总结果
  console.log('\n=== 上传结果 ===')
  const successCount = results.filter(r => r.status === 'success').length
  const failedCount = results.filter(r => r.status === 'failed').length
  console.log(`✅ 成功: ${successCount}`)
  console.log(`❌ 失败: ${failedCount}`)

  if (failedCount > 0) {
    console.log('\n失败的文档:')
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  - ${r.title}: ${r.error}`)
    })
  }

  console.log('\n💡 上传完成后，建议运行检测脚本确认索引和数据状态:')
  console.log('   npx tsx scripts/detect-indexes.ts')
}

main().catch((e) => {
  console.error('批量上传失败:', e)
  process.exit(1)
})