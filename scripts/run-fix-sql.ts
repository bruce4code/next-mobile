/**
 * 通过 Prisma 执行 fix-migrations.sql（兼容远程数据库如 Supabase）
 *
 * 使用方式:
 *   npx tsx scripts/run-fix-sql.ts
 */

import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
  console.log('⚡ 执行修复 SQL...\n')

  const sqlPath = path.resolve(__dirname, 'fix-migrations.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')

  // 按分号拆分 SQL 语句（忽略注释行和空行）
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'))

  let successCount = 0
  let failCount = 0

  for (const stmt of statements) {
    // 跳过纯注释/空白
    if (stmt.split('\n').every(line => line.trim().startsWith('--') || line.trim() === '')) continue

    try {
      await prisma.$executeRawUnsafe(stmt + ';')
      console.log(`  ✅ ${stmt.split('\n')[0].trim().substring(0, 80)}...`)
      successCount++
    } catch (error) {
      // pg_trgm 可能已存在、索引可能已存在 — 不致命
      const msg = String(error)
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('IF NOT EXISTS')) {
        console.log(`  ⏭️  跳过（已存在）: ${stmt.split('\n')[0].trim().substring(0, 60)}`)
        successCount++
      } else {
        console.log(`  ❌ 失败: ${msg.substring(0, 120)}`)
        console.log(`      SQL: ${stmt.substring(0, 100)}`)
        failCount++
      }
    }
  }

  console.log(`\n📊 结果: ✅ ${successCount} 成功, ❌ ${failCount} 失败`)

  // 最后验证索引状态
  console.log('\n🔍 验证索引状态...\n')
  const indexes: Array<{ tablename: string; indexname: string }> = await prisma.$queryRaw`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE tablename IN ('Document', 'DocumentChunk', 'EmbeddingCache')
    ORDER BY tablename, indexname
  `
  for (const idx of indexes) {
    console.log(`  ${idx.tablename}: ${idx.indexname}`)
  }
}

main()
  .catch((e) => {
    console.error('执行失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })