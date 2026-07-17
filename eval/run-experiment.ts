/**
 * LangSmith Experiment 评测脚本（v2 - 基于 evaluate() API）
 *
 * 自动在 LangSmith 生成 Experiment，支持跨版本对比。
 *
 * 用法:
 *   pnpm eval:experiment                        # 快速模式（直接调 LLM）
 *   TEST_AUTH_COOKIE='xxx' pnpm eval:experiment  # 完整模式（调本地 API + RAG）
 *
 * 运行后去 https://smith.langchain.com → Datasets → next-mobile-eval → Experiments 查看对比
 */

import "dotenv/config"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { Client } from "langsmith"
import { evaluate } from "langsmith/evaluation"
import type { EvaluationResults } from "langsmith"
import OpenAI from "openai"
import { wrapOpenAI } from "langsmith/wrappers/openai"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── 加载数据集 ─────────────────────────────────────────────
interface TestCase {
  question: string
  expected: string
  type: string
  difficulty: string
}

const rawDataset: TestCase[] = JSON.parse(
  readFileSync(resolve(__dirname, "dataset.json"), "utf-8"),
).slice(0, 2) // 快速测试只跑前2条，正式跑时删除 slice

// ─── 配置 ──────────────────────────────────────────────────
const DATASET_NAME = "next-mobile-eval"
const LOCAL_API = "http://localhost:8000/api/chat"
const authCookie = process.env.TEST_AUTH_COOKIE
const model =
  process.env.EVAL_MODEL ||
  process.env.LLM_MODEL?.split(",").map((m) => m.trim()).filter(Boolean)[0] ||
  "Qwen/Qwen3-8B"
const judgeModel = process.env.JUDGE_MODEL || "Qwen/Qwen3-8B"
const hasLangSmith = !!(process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_TRACING === "true")

const client = new Client()
const openai = wrapOpenAI(
  new OpenAI({
    apiKey: process.env.SILICONFLOW_API_KEY || process.env.OPENROUTER_API_KEY || "",
    baseURL: process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1",
  }),
)

// ─── 确保 LangSmith 数据集存在 ──────────────────────────────
async function ensureDataset(): Promise<void> {
  if (!hasLangSmith) throw new Error("LangSmith 未配置，无法运行 Experiment")

  // 创建数据集（已存在则忽略）
  try {
    await client.createDataset(DATASET_NAME, {
      description: "电商客服 RAG 质量评测数据集 - 用于评测回答的正确性、相关性和忠实度",
    })
  } catch {
    // already exists
  }

  // 检查现有示例数量
  const existing = await client.listExamples({ datasetName: DATASET_NAME })
  if (existing.length === 0) {
    // 批量上传
    await client.createExamples(
      rawDataset.map((item) => ({
        dataset_name: DATASET_NAME,
        inputs: { question: item.question },
        outputs: { expected: item.expected, type: item.type, difficulty: item.difficulty },
      })),
    )
    console.log(`✅ 已上传 ${rawDataset.length} 条数据到 LangSmith 数据集「${DATASET_NAME}」`)
  } else if (existing.length < rawDataset.length) {
    console.log(
      `⚠️  数据集「${DATASET_NAME}」已有 ${existing.length} 条，本地有 ${rawDataset.length} 条，可能存在差异`,
    )
    console.log(`   如需重新上传，请在 LangSmith 手动删除该数据集后重新运行`)
  } else {
    console.log(`ℹ️  数据集「${DATASET_NAME}」已就绪（${existing.length} 条示例）`)
  }
}

// ─── 调用目标系统 ──────────────────────────────────────────
async function getAnswer(question: string): Promise<string> {
  if (authCookie) {
    // 完整模式：调本地 API
    const res = await fetch(LOCAL_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: question }],
        useRAG: true,
      }),
    })

    if (!res.ok) {
      throw new Error(`API 返回 ${res.status}: ${await res.text()}`)
    }

    // 解析 SSE 流
    const text = await res.text()
    let fullContent = ""
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.choices?.[0]?.delta?.content) {
            fullContent += data.choices[0].delta.content
          }
        } catch {
          /* skip */
        }
      }
    }
    return fullContent
  } else {
    // 快速模式：直接调 LLM（限制 max_tokens 避免超出 key 额度）
    const res = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "你是一个电商客服助手。请根据你的知识回答用户问题。如果不知道，请坦诚告知。",
        },
        { role: "user", content: question },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    })
    return res.choices[0].message.content || ""
  }
}

// ─── Target 函数（被 evaluate() 调用的入口） ────────────────
async function targetFn(input: { question: string }): Promise<{ output: string }> {
  const answer = await getAnswer(input.question)
  return { output: answer }
}

// ─── LLM 评分器 ────────────────────────────────────────────
async function evaluateAnswer(
  question: string,
  expected: string,
  answer: string,
): Promise<{ correctness: number; relevance: number; faithfulness: number; comment: string }> {
  const prompt = `你是一个 AI 回答质量评估专家。请评估以下回答的质量。

## 用户问题
${question}

## 期望的回答标准
${expected}

## 实际 AI 回答
${answer}

## 评估标准
请从以下 3 个维度打分（1-10 分）：

1. **正确性**：回答是否正确？是否基于知识库而非编造？
2. **相关性**：回答是否对题？
3. **忠实度**：如果是业务问题，回答是否承认知识不足而不是瞎编？

## 输出格式
请严格只返回以下 JSON 格式（不要包含任何其他文字、不要用 markdown 代码块）：
{"correctness": 分数, "relevance": 分数, "faithfulness": 分数, "comment": "简要评价"}`

  const res = await openai.chat.completions.create({
    model: judgeModel,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 256,
  })

  const rawContent = res.choices[0].message.content || "{}"

  // 尝试提取 JSON（兼容模型可能在 JSON 前后加说明文字）
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : rawContent
  const parsed = JSON.parse(jsonStr)

  return {
    correctness: Number(parsed.correctness) || 0,
    relevance: Number(parsed.relevance) || 0,
    faithfulness: Number(parsed.faithfulness) || 0,
    comment: parsed.comment || "",
  }
}

// ─── Evaluator（被 evaluate() 调用的评分器） ────────────────
async function qualityEvaluator(args: {
  inputs: Record<string, any>
  outputs?: Record<string, any>
  referenceOutputs?: Record<string, any>
}): Promise<EvaluationResults> {
  const question = args.inputs.question || ""

  // target 执行失败时，outputs 可能为 undefined
  if (!args.outputs || !args.outputs.output) {
    return {
      results: [
        { key: "correctness", score: 0, comment: "target 执行失败" },
        { key: "relevance", score: 0 },
        { key: "faithfulness", score: 0 },
      ],
    }
  }

  const expected = args.referenceOutputs?.expected || ""
  const answer = args.outputs.output || ""

  const scores = await evaluateAnswer(question, expected, answer)

  return {
    results: [
      { key: "correctness", score: scores.correctness / 10, comment: scores.comment },
      { key: "relevance", score: scores.relevance / 10 },
      { key: "faithfulness", score: scores.faithfulness / 10 },
    ],
  }
}

// ─── 主流程 ────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║   LangSmith Experiment — RAG 质量评测    ║")
  console.log("╚══════════════════════════════════════════╝")
  console.log(`\n📋 数据集: ${DATASET_NAME}`)
  console.log(`📊 用例数: ${rawDataset.length}`)
  console.log(`🤖 模型: ${model}`)
  console.log(`⚖️  评分模型: ${judgeModel}`)
  console.log(`🔗 模式: ${authCookie ? "完整模式（本地 API + RAG）" : "快速模式（直接调 LLM）"}`)
  console.log(`📡 LangSmith: ${hasLangSmith ? "已连接" : "未配置"}`)

  // 1. 确保数据集已在 LangSmith 上创建
  if (hasLangSmith) {
    await ensureDataset()
  } else {
    console.log("⚠️  跳过数据集上传（LangSmith 未配置）")
  }

  // 2. 运行 Experiment
  console.log("\n🚀 开始评测...\n")

  const experimentPrefix = `rag-eval-${authCookie ? "full" : "quick"}`

  const results = await evaluate(targetFn, {
    data: DATASET_NAME,
    evaluators: [qualityEvaluator],
    experimentPrefix,
    maxConcurrency: 1, // 避免并发导致 API 限流
    client,
  })

  // 3. 输出汇总
  console.log(`\n✅ 实验完成！实验名称: ${results.experimentName}`)
  console.log(`   共处理 ${results.length} 条用例`)

  if (hasLangSmith) {
    console.log(`\n📡 查看完整 Experiment:`)
    console.log(`   https://smith.langchain.com`)
    console.log(`   → Datasets → ${DATASET_NAME} → Experiments`)
  }
}

main().catch((err) => {
  console.error("❌ 运行失败:", err)
  process.exit(1)
})