/**
 * 将 _prisma_migrations 中空跑的迁移标记为已完成
 *
 * 使用方式:
 *   npx tsx scripts/mark-migrations-done.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 查看当前未完成的迁移
  const pending = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations WHERE applied_steps_count = 0
  `

  if (pending.length === 0) {
    console.log('✅ 没有未完成的迁移记录，无需更新')
    return
  }

  console.log(`找到 ${pending.length} 条未完成的迁移记录:\n`)
  for (const p of pending) {
    console.log(`  - ${p.migration_name}`)
  }

  // 标记为已完成
  await prisma.$executeRawUnsafe(`
    UPDATE _prisma_migrations
    SET applied_steps_count = 1, logs = 'manually applied via fix-scripts (2026-06-04)'
    WHERE applied_steps_count = 0
  `)

  console.log('\n✅ 已标记为完成，下次 prisma migrate deploy 不会冲突')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())