# Chunking 实现迁移经验：从自实现到 LangChain TextSplitters

## 背景

在 RAG 系统的开发过程中，分块策略经历了三个阶段的演进：

1. **无分块**（初始版本）：文档整体存储+单一 embedding，搜索精度差，大文档效果不佳
2. **自实现分块**（本地编写，未提交）：手写 Parser 实现 Markdown/纯文本分割
3. **LangChain TextSplitters**（当前）：基于 `@langchain/textsplitters` 库实现

本文重点对比阶段 2 和阶段 3 的差异与经验。

---

## 一、代码规模对比

| 维度 | 自实现 | LangChain |
|------|--------|-----------|
| 总代码量 | ~107 行 | ~44 行 |
| 核心逻辑 | 5 个函数 | 2 个 splitter 实例 + 1 个主函数 |
| 依赖 | 无外部依赖 | `@langchain/textsplitters` |
| 异步 | 同步 API | 异步 (`splitText` 返回 Promise) |

---

## 二、核心实现对比

### 2.1 自实现方案

**Markdown 处理** (`chunkMarkdown`):

```
逐行扫描 → 识别 ## / ### 标题 → 按标题分组 buffer → flush 成 chunk
```

- 维护 `currentHeading` / `currentSubheading` 状态变量
- 遇到 `h2` 或 `h3` 时 flush 当前 buffer，开启新 chunk
- 标题层级形成 `文档名 > 一级标题 > 二级标题` 的多级路径

**纯文本处理** (`chunkPlainText`):

```
按空行分割段落 → 逐段拼接 buffer → 超 MAX_CHUNK_SIZE(800) 时 flush
```

**后处理** (`mergeSmallChunks`):

```
遍历 chunks → 若 chunk 长度 < MIN_CHUNK_SIZE(100) → 合并到前一个 chunk
```

### 2.2 LangChain 方案

```typescript
const mdSplitter = new MarkdownTextSplitter({ chunkSize: 300, chunkOverlap: 50 })
const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 300, chunkOverlap: 50 })

// 调用
const rawChunks = await splitter.splitText(content)

// 后处理：提取每个 chunk 中的标题
const heading = extractHeading(text)
```

核心差异：LangChain 负责底层分割逻辑，我们只做标题提取这一层**业务增强**。

---

## 三、关键差异分析

### 3.1 分割策略

| 维度 | 自实现 | LangChain |
|------|--------|-----------|
| Markdown 标题感知 | 只识别 `##` 和 `###` | 识别所有标题层级 (`#` ~ `######`) |
| 纯文本分割 | 按段落 + 固定字符阈值 | 按字符递归分割，优先在段落/句子边界断开 |
| Chunk Overlap | **不支持** | **内置支持**（`chunkOverlap: 50`） |
| 边界处理 | 硬阈值 800 字符，不够灵活 | 递归尝试不同分隔符，智能逼近 chunkSize |

### 3.2 标题提取

**自实现**：在分割时就记录标题层级，保持状态变量。

```typescript
// 自实现：分割时确定标题
const chunkTitle = currentSubheading
  ? `${docTitle} > ${currentHeading} > ${currentSubheading}`
  : currentHeading
    ? `${docTitle} > ${currentHeading}`
    : docTitle
```

**LangChain**：`MarkdownTextSplitter` 会保留原始 Markdown 内容（包括标题标记），分割后**从文本中提取标题**。

```typescript
// LangChain：分割后从内容中提取标题
function extractHeading(text: string): string | null {
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^#{2,4}\s+(.+)/)
    if (match) return match[1].trim()
  }
  return null
}
```

### 3.3 Chunk Size 与 Overlap

**自实现**：
- `MIN_CHUNK_SIZE = 100`：过小 chunk 自动合并
- `MAX_CHUNK_SIZE = 800`：硬上限，超限强制分割
- 没有 overlap，语义断层严重

**LangChain**：
- `chunkSize: 300`：目标大小（更合理，embedding 模型 token 限制友好）
- `chunkOverlap: 50`：相邻 chunk 共享 50 字符，保持上下文连续性
- 内部自动处理大小平衡，无需手动 merge

### 3.4 代码复杂度

**自实现**的核心复杂性：

1. **状态管理**：需要手动跟踪 `currentHeading`, `currentSubheading`, `buffer`, `bufferLen`, `chunkIndex` 等 5 个状态变量
2. **边界条件**：空文档、无标题、短内容、段落超大等各种 edge case 需要自己覆盖
3. **合并逻辑**：`mergeSmallChunks` 引入了额外的复杂度，而且逻辑不完善（标题合并后可能丢失信息）

**LangChain** 的核心简单性：

1. **声明式配置**：`new MarkdownTextSplitter({ chunkSize: 300, chunkOverlap: 50 })` 即完成配置
2. **内置鲁棒性**：空内容、单段落、超长文本等情况开箱即用
3. **关注点分离**：分割由库处理，标题提取作为独立增强层，职责清晰

---

## 四、具体案例对比

### 4.1 Markdown 文档分割

**输入**:
```markdown
# 用户管理

## 注册流程
用户通过手机号注册...

## 登录方式
### 密码登录
输入密码即可...

### 验证码登录
输入短信验证码...
```

**自实现输出** (3 chunks):
- `用户管理 > 注册流程`
- `用户管理 > 登录方式 > 密码登录`
- `用户管理 > 登录方式 > 验证码登录`

**LangChain 输出** (可能 4-5 chunks，取决于内容长度):
- `用户管理 > 注册流程`（含 `#` 和 `##` 标题）
- `用户管理`（含 `# 用户管理`，如果 chunk 2 包含了 `## 登录方式`）
- `用户管理 > 密码登录`
- `用户管理 > 验证码登录`

LangChain 的输出可能更细粒度，且通过 `chunkOverlap` 保持了相邻 chunk 的上下文。

### 4.2 纯文本文档分割

**自实现**: 按段落分割，组合到 800 字符为止，无 overlap
**LangChain**: 递归字符分割，优先保持段落/句子完整，有 overlap

---

## 五、迁移带来的具体收益

### 5.1 代码量减少 60%

- 自实现：107 行（需要维护 5 个内部函数）
- LangChain：44 行（2 个 splitter 实例化 + 1 个主函数 + 1 个标题提取工具函数）

### 5.2 Bug 减少

自实现版本可能/已经存在的问题：

1. **标题丢失**：如果 Markdown 标题后的内容很短，`mergeSmallChunks` 可能把它和前一个 chunk 合并，导致标题路径错误
2. **Overlap 缺失**：相邻 chunk 在边界处语义不连续，影响 RAG 检索效果
3. **非标准 Markdown**：自实现只识别 `##` 和 `###`，LangChain 支持所有 heading 级别
4. **纯文本分割粗糙**：按空行分割不足以处理复杂文本结构

### 5.3 配置灵活

```typescript
// 轻松调整策略
const mdSplitter = new MarkdownTextSplitter({
  chunkSize: 500,       // 调大 chunk
  chunkOverlap: 100,    // 增加 overlap
})

// 替换分割器
const codeSplitter = new RecursiveCharacterTextSplitter({
  separators: ['\n\n', '\n', '.', ' ', ''],  // 自定义分隔符优先级
  chunkSize: 200,
  chunkOverlap: 20,
})
```

自实现要达到同样灵活性需要大量重写。

### 5.4 生态兼容

`@langchain/textsplitters` 作为 LangChain 生态的一部分，后续可以：

- 升级到更优的分割算法
- 集成其他分割策略（如 `TokenTextSplitter`, `SentenceTransformersTokenTextSplitter` 等）
- 社区维护，修复边界情况的 bug

---

## 六、总结与建议

### 什么时候适合自实现？

- 文档结构非常特殊，标准分块策略不适用
- 对分块策略有极致定制需求
- 项目中完全没有引入 LangChain 生态

### 什么时候切换到 LangChain？

- 需要支持标准 Markdown/纯文本分割
- 对 `chunkOverlap` 有需求（RAG 场景推荐）
- 希望减少维护成本
- 代码中已有其他 LangChain 依赖

### 本次迁移的经验公式

> **自实现成本** = 编写时间 + 调试 edge cases + 维护迭代
> **LangChain 成本** = 添加依赖 + 理解 API + 业务增强层编写

在这个项目中，**LangChain 方案的总体成本远低于自实现**，尤其考虑到 RAG 场景对 `chunkOverlap` 的刚性需求。

---

## 附录：当前最终代码

```typescript
// src/lib/chunking.ts
import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

export interface Chunk {
  title: string
  content: string
  index: number
}

const mdSplitter = new MarkdownTextSplitter({ chunkSize: 300, chunkOverlap: 50 })
const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 300, chunkOverlap: 50 })

export async function chunkDocument(title: string, content: string, contentType: string): Promise<Chunk[]> {
  let rawChunks: string[]
  if (contentType === 'markdown') {
    rawChunks = await mdSplitter.splitText(content)
  } else {
    rawChunks = await textSplitter.splitText(content)
  }

  return rawChunks.map((text, index) => {
    const heading = extractHeading(text)
    return {
      title: heading ? `${title} > ${heading}` : title,
      content: text,
      index,
    }
  })
}

function extractHeading(text: string): string | null {
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^#{2,4}\s+(.+)/)
    if (match) return match[1].trim()
  }
  return null
}
```