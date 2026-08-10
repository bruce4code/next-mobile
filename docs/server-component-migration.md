# App Router Server Component 改造参考手册

> 适用场景：将现有 `'use client'` 的 page.tsx 改造为 Server Component，同时保留客户端交互能力。

## 一、判断：能改 Server Component 吗？

### 检查清单

| 当前 page.tsx 使用了什么 | 能否改为 Server Component | 策略 |
|--------------------------|--------------------------|------|
| `useState` / `useEffect` / `useRef` | ❌ 不能 | 提取到 Client 文件，page 做 wrapper |
| `useUser()` / `useParams()` | ✅ 可以替 | 用 `getUser()` / `await params` 替代 |
| `onClick` / `onChange` 等事件 | ❌ 不能 | 同上，提取到 Client 文件 |
| 纯 `fetch` 调用（无 hooks） | ✅ 可以 | 直接在 Server Component 中 fetch |
| `console.log` / 纯 UI 渲染 | ✅ 可以 | 直接改为 Server Component |

### 决策树

```
当前 page.tsx 有 'use client' 吗？
  ├─ 没有 → 已经是 Server Component，无需改造
  └─ 有
      ├─ 包含 hooks (useState/useEffect/useRef)？
      │   ├─ 包含 → 模式 B：Server wrapper + Client 提取
      │   └─ 不包含
      │       └─ 包含事件处理器 (onClick/onChange)？
      │           ├─ 包含 → 模式 B
      │           └─ 不包含 → 模式 A：直接改 Server Component
      └─ 只是用 useUser() / useParams()？
          └─ 模式 A：用服务端 API 替代
```

## 二、模式 A：直接改为 Server Component

### 适用条件

- 没有 `useState` / `useEffect` / `useRef`
- 没有事件处理器（或事件处理器来自已 import 的 Client UI 组件）
- 仅使用 `useUser()` 或 `useParams()` 这类可被服务端 API 替代的 hook

### 范例：chat/page.tsx

改造前（25 行）：
```tsx
'use client'

import ChatPanel from '@/components/ChatPanel'
import { useUser } from '@/components/UserProvider'

export default function NewChatPage() {
  const { user: currentUser, loading } = useUser()

  return (
    <>
      {loading ? (
        <div>加载中...</div>
      ) : currentUser ? (
        <ChatPanel currentUser={currentUser} />
      ) : (
        <div>请先登录</div>
      )}
    </>
  )
}
```

改造后（16 行）：
```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/app/auth/server'
import ChatPanel from '@/components/ChatPanel'

export const metadata: Metadata = {
  title: '新对话',
  description: '开始一个新的 AI 智能对话',
}

export default async function NewChatPage() {
  const user = await getUser()
  if (!user) redirect('/login')
  return <ChatPanel currentUser={user} />
}
```

对比变化：

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| `'use client'` | ✅ 有 | ❌ 无 |
| loading 处理 | `useUser()` 的 `loading` state | 无 loading（服务端阻塞式） |
| 用户获取 | 客户端 `useUser()` hook | 服务端 `await getUser()` |
| 未登录处理 | 显示"请先登录"文字 | `redirect('/login')` |
| metadata | ❌ 无（client 不能 export metadata） | ✅ 独立 title |
| 客户端 bundle | ~3KB | 0 |

### 范例：chat/[conversationId]/page.tsx

改造前（31 行）：
```tsx
'use client'

import { useParams, notFound } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel'
import { useUser } from '@/components/UserProvider'

export default function ConversationChatPage() {
  const params = useParams()
  const conversationId = params.conversationId as string | undefined
  const { user: currentUser, loading } = useUser()

  if (!conversationId) { notFound() }

  return (
    <>
      {loading ? (
        <div>加载中...</div>
      ) : currentUser ? (
        <ChatPanel currentUser={currentUser} initialConversationId={conversationId} />
      ) : (
        <div>请先登录</div>
      )}
    </>
  )
}
```

改造后（21 行）：
```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getUser } from '@/app/auth/server'
import ChatPanel from '@/components/ChatPanel'

export const metadata: Metadata = {
  title: '对话',
  description: 'AI 智能对话',
}

export default async function ConversationChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const user = await getUser()
  if (!user) redirect('/login')

  return <ChatPanel currentUser={user} initialConversationId={conversationId} />
}
```

关键点：

| 改造项 | 说明 |
|--------|------|
| `useParams()` → `await params` | Next.js 15 中 `params` 是 Promise，Server Component 中直接 await |
| `notFound()` 可移除 | 动态段 `[conversationId]` 匹配成功时一定有值，无需防御 |
| `useUser()` → `getUser()` | 项目已有 `@/app/auth/server.ts`，直接复用 |

## 三、模式 B：Server wrapper + Client 提取

### 适用条件

- 页面包含大量 hooks（`useState` / `useEffect` / `useRef`）
- 页面包含事件处理器（`onClick` / `onChange` / `onSubmit`）
- UI 交互复杂，不适合全部重写

### 范例：knowledge/page.tsx

改造前（662 行，全在 client）：
```
src/app/[locale]/(protected)/knowledge/
└── page.tsx          ← 'use client'，662 行
```

改造后（拆分两个文件）：
```
src/app/[locale]/(protected)/knowledge/
├── page.tsx          ← Server Component，5 行
└── KnowledgeClient.tsx  ← 'use client'，600+ 行
```

page.tsx（Server Component，5 行）：
```tsx
import type { Metadata } from 'next'
import { KnowledgePageClient } from './KnowledgeClient'

export const metadata: Metadata = {
  title: '知识库',
  description: '管理 AI Chat 知识库文档，支持搜索、新增、编辑和删除',
}

export default function KnowledgePage() {
  return <KnowledgePageClient />
}
```

KnowledgeClient.tsx（Client Component，无 metadata）：
```tsx
'use client'

import React, { useState, useEffect, useRef } from 'react'
// ... 所有原来的 import

export function KnowledgePageClient() {
  // ... 所有原来的 hooks、state、事件处理器不变
}
```

操作步骤：

```
1. 创建 ./xxxClient.tsx
2. 将 page.tsx 中除去 'use client' 以外的所有代码复制到 xxxClient.tsx
3. 把 xxxClient.tsx 中的 export default function 改为 export function
4. 重写 page.tsx 为：
   - import { xxxClient } from './xxxClient'
   - export metadata
   - export default function xxxPage() { return <xxxClient /> }
5. 删除 page.tsx 中原来的所有代码
```

## 四、服务端用户获取

### 已有工具

项目已封装好服务端认证工具，位于 `src/app/auth/server.ts`：

```ts
import { getUser } from '@/app/auth/server'
```

使用方式：

```tsx
export default async function MyPage() {
  const user = await getUser()
  if (!user) redirect('/login')
  return <ClientComponent user={user} />
}
```

### UserProvider 仍然存在

`UserProvider` 包裹在所有页面的外层（`[locale]/layout.tsx` 中），所以：

- `ChatPanel`、`KnowledgeClient` 等 client 组件仍然可以使用 `useUser()`
- Server Component 包装器中不要用 `useUser()`，改用 `getUser()`
- `User` 类型是 `@supabase/supabase-js` 的 `User`，prop 传递类型一致

## 五、root layout 的 metadata template

项目 root layout 已配置：

```tsx
// src/app/[locale]/layout.tsx
export const metadata: Metadata = {
  title: {
    template: '%s | AI Chat',
    default: 'AI Chat - 智能对话助手',
  },
}
```

这意味着：

| 子页面设置 | 浏览器 Tab 最终显示 |
|-----------|-------------------|
| `title: '新对话'` | `新对话 | AI Chat` |
| `title: '知识库'` | `知识库 | AI Chat` |
| 不设置 title | `AI Chat - 智能对话助手` |

## 六、完整改造 Checklist

- [ ] 检查 page.tsx 是否包含 hooks → 决定用模式 A 还是 B
- [ ] 添加 `import type { Metadata } from 'next'`
- [ ] 添加 `export const metadata: Metadata = { title: '...', description: '...' }`
- [ ] 如果原来有 `useUser()`：替换为 `await getUser()` + `redirect('/login')`
- [ ] 如果原来有 `useParams()`：替换为 `await params`（Next.js 15 async params）
- [ ] 移除 `'use client'` 指令
- [ ] 如果是模式 B：创建 xxxClient.tsx 文件，函数名改为非 default export
- [ ] 重启 dev server（新加文件需要完整重启）
- [ ] 访问页面验证：浏览器 tab 标题是否正确
- [ ] 访问页面验证：功能是否正常

## 七、注意事项

1. **不能直接在 Client Component 的 props 中传递不可序列化的对象**。`User` 类型是序列化安全的（字符串/对象），可以传。

2. **Server Component 中不能用 `useRouter`**。需要跳转时用 `redirect()`。

3. **api 路由的鉴权不要依赖 Server Component 传进来的 user**，API 应该在 route handler 中独立鉴权。

4. **不要在 Server Component 顶层直接检查 localStorage / sessionStorage**，这些只在浏览器存在。

5. **新加的特殊文件（如 not-found.tsx、error.tsx）必须在重启 dev server 后才能生效**，热重载不支持。
