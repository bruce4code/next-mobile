# 从裸奔到全副武装：在 Next.js 项目中使用 Zod 构建安全的 API 层

## 前言

最近给项目做了一次 API 安全审查，发现几个后端接口几乎是"裸奔"状态——从请求体里拿到什么就往数据库里塞什么。这不是个例，在很多快速迭代的项目里，API 校验往往是最容易被跳过的一环。

本文从一个真实的 Next.js + Prisma + Supabase 项目出发，记录 Zod 从零到全面落地的过程。如果你也在纠结"要不要加校验"、"用什么校验库"，希望这篇能给你一些参考。

---

## 一、没有校验的 API 长什么样

先看一段改造前的代码，这是保存聊天记录的接口：

```typescript
// src/app/api/save-chat/route.ts（改造前）
export async function POST(request: Request) {
  const body = await request.json()
  // 没有校验，没有鉴权
  const newChatMessage = await prisma.openRouterChat.create({
    data: {
      userId: body.userId,   // 客户端传啥就存啥
      role: body.role,
      content: body.content,
      model: body.model,
      // ...
    },
  })
}
```

**三个问题：**

1. **没有鉴权** — 任何人只要能调到这个接口，就能往数据库里插数据
2. **没有类型校验** — `role` 传 `"admin"`、`content` 传 `undefined`、`promptTokens` 传 `"abc"`…… 都不会被拦截
3. **没有边界校验** — 客户端可以传一个 100MB 的字符串进来

最终结果：数据库报错 → 返回 500 → 前端收到无法理解的错误信息。

---

## 二、为什么是 Zod？

市面上校验库不少，为什么要选 Zod？

| 库 | TypeScript 集成 | 包体积 | 易用性 | 生态 |
|-----|----------------|--------|--------|------|
| Zod | ★★★★★ 天然推导 | ~11KB | 简单直观 | 好 |
| Yup | ★★★★☆ | ~25KB | 中等 | 好 |
| Joi | ★★★☆☆ | ~100KB+ | 较复杂 | 老牌 |
| io-ts | ★★★★★ | ~15KB | 学习曲线陡 | 小众 |

**Zod 胜出的核心理由：**

**1. 类型推导零成本**

```typescript
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})

// 自动推导出 TypeScript 类型，无需重复定义
type User = z.infer<typeof UserSchema>
// 等同于：{ name: string; email: string }
```

对比传统做法——你需要维护一套 TypeScript 类型 + 一套运行时校验逻辑。Zod 合二为一。

**2. API 设计直觉化**

```typescript
z.string().min(3).max(100)
z.number().int().positive()
z.enum(['a', 'b', 'c'])
z.string().url().optional()
```

链式调用，读起来像英文句子，几乎没有学习成本。

**3. 安全解析**

```typescript
const result = schema.safeParse(input)
if (!result.success) {
  // 处理错误，不抛异常
  console.log(result.error.issues)
}
// result.data 是安全的类型化数据
```

`.safeParse()` 不会抛异常，适合用在请求处理流程中优雅地返回错误。

---

## 三、项目中的具体使用（三阶段演进）

### 第一阶段：为文档创建接口加校验

项目中最核心的 RAG 知识库接口：

```typescript
// src/app/api/documents/route.ts
import { z } from 'zod'

const CreateDocumentSchema = z.object({
  title: z.string().min(1, '标题不能为空'),
  content: z.string().min(1, '内容不能为空'),
  contentType: z.enum(['text', 'markdown']).optional().default('text'),
  category: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()

  const parsed = CreateDocumentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '请求参数校验失败', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { title, content, contentType, category } = parsed.data
  // ✅ 从这里开始，数据是安全可信的
}
```

改造前后的对比清晰可见：

| | 改造前 | 改造后 |
|--|--------|--------|
| 空标题 | 写入数据库 | 400 + "标题不能为空" |
| 非法 contentType | 数据库报错 | 400 + 提示允许的值 |
| 缺少必填字段 | 500 服务器错误 | 400 + 具体失败原因 |
| 字段类型错误 | 运行时崩溃 | 400 + 类型错误提示 |

### 第二阶段：给聊天保存接口同时补校验和鉴权

这个接口暴露了两个安全问题：没有校验 + 没有鉴权。更关键的是，客户端可以传任意 `userId` 来伪造他人数据。

```typescript
// src/app/api/save-chat/route.ts
const SaveChatSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, 'content 不能为空'),
  model: z.string().min(1, 'model 不能为空'),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  conversationId: z.string().optional(),
})

export async function POST(request: Request) {
  // 1️⃣ 先鉴权
  const authUser = await getUser()
  if (!authUser) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }

  // 2️⃣ 再校验
  const parsed = SaveChatSchema.safeParse(await request.json())
  if (!parsed.success) { /* 返回 400 */ }

  // 3️⃣ 服务端注入 userId（不信任客户端传入）
  await prisma.openRouterChat.create({
    data: {
      userId: authUser.id,  // ← 从 session 获取
      ...parsed.data,
    },
  })
}
```

**关键转变：userId 不再由客户端提供，而是从服务端 session 中获取。** 这样即使有人篡改请求体，也无法冒充其他用户。

### 第三阶段：给用户资料更新接口加校验

用户资料接口涉及隐私数据，校验要更细致：

```typescript
// src/app/api/user/route.ts
const UpdateProfileSchema = z.object({
  name: z.string().max(100, '姓名不超过 100 个字符').optional(),
  bio: z.string().max(500, '个人简介不超过 500 个字符').optional(),
  avatarUrl: z.string().url('头像链接格式不正确').or(z.literal('')).optional(),
  location: z.string().max(200, '位置不超过 200 个字符').optional(),
})
```

这里有个有意思的设计：`avatarUrl` 既要校验 URL 格式（防插入非法字符串），又要允许空字符串（用户可以清空头像）。`z.string().url().or(z.literal(''))` 这个组合需求在 TypeScript 类型中几乎无法表达，但在 Zod 里很自然。

---

## 四、Zod 常见模式总结

基于这三个接口的实践，提炼出几种常用模式：

### 模式 1：必填 + 边界限制

```typescript
z.string().min(1, '不能为空').max(1000, '超出最大长度')
```

- `min(1)` 确保非空（`""` 会被拒绝，`undefined` 也会被拒绝）
- `max()` 防止超长数据攻击

### 模式 2：枚举 + 错误消息

```typescript
z.enum(['text', 'markdown'], { message: '只能为 text 或 markdown' })
```

枚举校验比手动 if-else 简洁得多，错误消息也清晰。

### 模式 3：可选 + 默认值

```typescript
z.enum(['text', 'markdown']).optional().default('text')
```

客户端不传时自动兜底，不需要在业务代码中写 `|| 'text'` 了。

### 模式 4：联合类型兼容空值

```typescript
z.string().url().or(z.literal(''))
```

允许有效 URL 或空字符串，URL 校验失败时给出明确提示。

### 模式 5：数字约束

```typescript
z.number().int().nonnegative()
```

确保是整数且非负。

---

## 五、性能分析：值得担心吗？

在加上校验之前，我担心过性能问题——每个请求都做一次模式匹配，会不会拖慢接口？

实测结果（每个接口压测 100 次取中位数）：

| 接口 | Zod 校验耗时 | 业务操作耗时 | 校验占比 |
|------|-------------|-------------|---------|
| POST /api/documents | ~0.01ms | embedding 生成 ~150ms | **< 0.01%** |
| POST /api/save-chat | ~0.01ms | 数据库写入 ~8ms | **~0.1%** |
| PUT /api/user | ~0.01ms | 数据库更新 ~6ms | **~0.2%** |

**结论：Zod 的校验开销可以忽略不计。** 真正的性能瓶颈在 embedding 生成、数据库写入、网络 IO 这些地方，不在校验层。

另外注意一个实现细节：**Schema 定义在模块级别，只在进程启动时编译一次**，每次请求只执行 `safeParse` 的运行时校验。

```typescript
// ✅ 正确：模块级，进程启动时编译
const MySchema = z.object({ ... })

export async function POST() {
  // 只执行 safeParse，不重复编译
  MySchema.safeParse(body)
}

// ❌ 错误：每次请求都重新编译
export async function POST() {
  const MySchema = z.object({ ... })  // 不要这样写
  MySchema.safeParse(body)
}
```

---

## 六、关于安全的更深入思考

加了 Zod 校验之后，API 层是否就安全了？还不够。

### 校验解决的是"数据格式"问题，不是"数据权限"问题

```typescript
// Zod 能保证 userId 是字符串格式
const parsed = schema.safeParse(body)  // ✅ userId 格式正确

// 但 Zod 不能判断这个 userId 是否属于当前登录用户
prisma.data.create({ data: { userId: parsed.data.userId } })  // ⚠️ 可能伪造
```

所以正确的做法是：**校验交给 Zod，鉴权交给 session**。

### API 安全的分层模型

```
请求到达
  ↓
① 鉴权层（Authentication）— 你是谁？
  ↓
② 校验层（Validation）— 你给的数据对不对？
  ↓
③ 授权层（Authorization）— 你能做这件事吗？
  ↓
④ 业务逻辑层 — 执行操作
```

Zod 管的是第 ② 层，不能替代第 ① 和第 ③ 层。项目最初的安全漏洞正是混淆了这三层的职责。

### 防御纵深

即使是 Zod 校验通过的"合法数据"，也不代表一定安全。比如：

```typescript
// Zod 校验通过
content: z.string().max(10000)  // 10000 字符
// 但 embedding 模型的 token 限制可能是 8192
```

所以长度上限需要结合下游能力来设定，不能只写一个很大的值。

---

## 七、总结

从一个简单的想法出发——"能不能让 API 报错友好一点"，最终落地到三个核心接口的完整校验体系。回顾整个过程，最大的收获不是学会了 Zod 的 API，而是理解了**校验在 API 安全中的位置**：

- **Zod 解决的是输入可信问题**，让下游代码可以安全地假设拿到的是符合预期的数据
- **鉴权解决的是身份可信问题**，必须与校验分开处理
- **授权解决的是权限可信问题**，校验层无法覆盖

三者在 API 安全中各司其职，不能互相替代。

### 一些建议

1. **从最危险的接口开始** — 先改那些直接写数据库的接口
2. **schema 和 handler 放在一起** — Zod schema 定义在同文件里，修改时一目了然
3. **统一错误格式** — 我用了统一的 `{ error, details }` 格式，前端可以写一个通用处理函数
4. **不要过度设计** — 简单的 `z.string().min(1)` 比复杂的自定义校验器更有价值

如果你是第一次在项目里引入 Zod，不用一步到位。先给一两个写数据库的 POST 接口加上，感受一下开发体验的变化，然后自然会想给更多接口加上。

毕竟，代码写得慢一点没关系，数据安全是第一位的。