/**
 * 测试所有 Zod Schema 的校验逻辑
 * 不需要启动服务器，也不需要登录
 *
 * 使用方式: npx tsx scripts/test-document-schema.ts
 */
import { z } from 'zod'

const CreateDocumentSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  content: z.string().min(1, '内容不能为空'),
  contentType: z.enum(['text', 'markdown']).optional().default('text'),
  category: z.string().optional(),
})

const SaveChatSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'content 不能为空'),
  model: z.string().min(1, 'model 不能为空'),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  conversationId: z.string().optional(),
})

const UpdateProfileSchema = z.object({
  name: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().or(z.literal('')).optional(),
  location: z.string().max(200).optional(),
})

function testCase(schemaName: string, schema: z.ZodTypeAny, name: string, input: unknown, expectSuccess: boolean) {
  const result = schema.safeParse(input)
  const passed = result.success === expectSuccess
  const status = passed ? '✅ PASS' : '❌ FAIL'

  console.log(`\n${status} [${schemaName}] ${name}`)
  console.log(`  输入: ${JSON.stringify(input).substring(0, 80)}`)
  console.log(`  期望: ${expectSuccess ? '通过' : '拒绝'}`)

  if (result.success) {
    console.log(`  输出: ${JSON.stringify(result.data)}`)
  } else {
    const msgs = result.error.issues.map(i => i.message).join('; ')
    console.log(`  错误: ${msgs}`)
  }
}

// =================================================
console.log('==========================================')
console.log(' 📄 CreateDocumentSchema')
console.log('==========================================')

testCase('文档', CreateDocumentSchema, '合法数据', {
  title: '退货政策', content: '支持30天无理由退货', contentType: 'markdown', category: 'policy',
}, true)
testCase('文档', CreateDocumentSchema, '仅必填字段', { title: '测试', content: '内容' }, true)
testCase('文档', CreateDocumentSchema, '空 title', { title: '', content: '内容' }, false)
testCase('文档', CreateDocumentSchema, '非法 contentType', { title: 'a', content: 'b', contentType: 'pdf' }, false)
testCase('文档', CreateDocumentSchema, '空对象', {}, false)

// =================================================
console.log('\n==========================================')
console.log(' 💬 SaveChatSchema')
console.log('==========================================')

testCase('聊天', SaveChatSchema, '合法数据', {
  role: 'user', content: '你好', model: 'gpt-4',
  promptTokens: 10, completionTokens: 20, totalTokens: 30, conversationId: 'conv-1',
}, true)
testCase('聊天', SaveChatSchema, '仅必填字段', {
  role: 'assistant', content: '你好', model: 'gpt-4',
}, true)
testCase('聊天', SaveChatSchema, '缺 content', {
  role: 'user', model: 'gpt-4',
}, false)
testCase('聊天', SaveChatSchema, '非法 role', {
  role: 'admin', content: 'hi', model: 'gpt-4',
}, false)
testCase('聊天', SaveChatSchema, 'promptTokens 传负数', {
  role: 'user', content: 'hi', model: 'gpt-4', promptTokens: -1,
}, false)
testCase('聊天', SaveChatSchema, '空对象', {}, false)

// =================================================
console.log('\n==========================================')
console.log(' 👤 UpdateProfileSchema')
console.log('==========================================')

testCase('用户', UpdateProfileSchema, '合法数据', {
  name: '张三', bio: '全栈开发者', location: '北京', avatarUrl: 'https://example.com/avatar.jpg',
}, true)
testCase('用户', UpdateProfileSchema, '只传部分字段', { name: '张三' }, true)
testCase('用户', UpdateProfileSchema, '不传任何字段', {}, true)
testCase('用户', UpdateProfileSchema, 'avatarUrl 格式错误', { avatarUrl: '不是url' }, false)
testCase('用户', UpdateProfileSchema, 'name 超长', { name: 'a'.repeat(101) }, false)
testCase('用户', UpdateProfileSchema, 'bio 超长', { bio: 'a'.repeat(501) }, false)
testCase('用户', UpdateProfileSchema, '空字符串 avatarUrl（合法）', { avatarUrl: '' }, true)

console.log('\n==========================================')
console.log(' ✅ 全部测试完成')
console.log('==========================================')