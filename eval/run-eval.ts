/**
 * LangSmith 评测脚本
 *
 * 用法:
 *   1. 启动 dev server: pnpm dev
 *   2. 获取 auth cookie: 浏览器 F12 → Application → Cookies → 找到 sb-{project_ref}-auth-token 的 cookie
 *   3. 运行: TEST_AUTH_COOKIE="xxx" npx tsx eval/run-eval.ts
 *
 * 无需 auth 的快速模式:
 *   npx tsx eval/run-eval.ts --dry-run    # 仅上传数据集，不执行评测
 *   npx tsx eval/run-eval.ts --quick       # 用 OpenRouter 直接调 LLM，不走你的 API（无需 auth）
 */

import "dotenv/config"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import OpenAI from "openai"
import { wrapOpenAI } from "langsmith/wrappers/openai"
import { Client } from "langsmith"

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── 加载数据集 ─────────────────────────────────────────────
interface TestCase {
  question: string
  expected: string
  type: string
  difficulty: string
}

const dataset: TestCase[] = JSON.parse(
  readFileSync(resolve(__dirname, "dataset.json"), "utf-8"),
)

// ─── 配置 ──────────────────────────────────────────────────
const DATASET_NAME = "next-mobile-eval"
const LOCAL_API = "http://localhost:8000/api/chat"

// 检查 tokens 和 API key
const hasLangSmith = process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_TRACING === "true"
const hasApiKey = process.env.OPENROUTER_API_KEY
const authCookie = process.env.TEST_AUTH_COOKIE
const isDryRun = process.argv.includes("--dry-run")
const isQuick = process.argv.includes("--quick")

// ─── LLM 客户端（硅基流动） ────────────────────────────────
const openai = wrapOpenAI(new OpenAI({
  apiKey: process.env.SILICONFLOW_API_KEY || process.env.OPENROUTER_API_KEY || "",
  baseURL: process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1",
}))

// ─── 评估器 ────────────────────────────────────────────────
async function correctnessEvaluator(inputs: { question: string, expected: string }, output: string): Promise<{ correctness: number; relevance: number; faithfulness: number; comment: string }> {
  const prompt = `你是一个 AI 回答质量评估专家。请评估以下回答的质量。

## 用户问题
${inputs.question}

## 期望的回答标准
${inputs.expected}

## 实际 AI 回答
${output}

## 评估标准
请从以下 3 个维度打分（1-10 分）：

1. **正确性**：回答是否正确？是否基于知识库而非编造？
2. **相关性**：回答是否对题？
3. **忠实度**：如果是业务问题，回答是否承认知识不足而不是瞎编？

## 输出格式
请只返回 JSON：
{"correctness": 分数, "relevance": 分数, "faithfulness": 分数, "comment": "简要评价"}`

  const res = await openai.chat.completions.create({
    model: "Qwen/Qwen3-8B",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    response_format: { type: "json_object" },
  })

  try {
    return JSON.parse(res.choices[0].message.content || "{}")
  } catch {
    return { correctness: 0, relevance: 0, faithfulness: 0, comment: "评分解析失败" }
  }
}

// ─── 调用本地 API（需要 auth cookie）─────────────────────────
async function callLocalApi(question: string): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (authCookie) {
    headers["Cookie"] = authCookie
  }

  const res = await fetch(LOCAL_API, {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
      useRAG: true,
    }),
  })

  if (!res.ok) {
    throw new Error(`API 返回 ${res.status}: ${await res.text()}`)
  }

  // 解析 SSE 流，提取 content
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
        // 跳过解析失败的行
      }
    }
  }
  return fullContent
}

// ─── 直接调 LLM（快速模式，无需 auth）───────────────────────
async function callDirectLLM(question: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "stepfun/step-3.5-flash",
    messages: [
      {
        role: "system",
        content: "你是一个电商客服助手。请根据你的知识回答用户问题。如果不知道，请坦诚告知。",
      },
      { role: "user", content: question },
    ],
    temperature: 0.7,
  })
  return res.choices[0].message.content || ""
}

// ─── 上传数据集到 LangSmith ────────────────────────────────
async function uploadDataset() {
  if (!hasLangSmith) {
    console.log("⚠️  未配置 LangSmith API Key，跳过数据集上传")
    console.log("   请在 .env 中设置 LANGSMITH_API_KEY 和 LANGSMITH_TRACING=true")
    return false
  }

  const client = new Client()
  console.log(`\n📤 上传数据集: ${DATASET_NAME} (${dataset.length} 条)`)

  try {
    // 检查是否已存在
    const existing: unknown[] = []
    for await (const ds of client.listDatasets({ datasetName: DATASET_NAME })) {
      existing.push(ds)
    }
    if (existing.length > 0) {
      console.log("   数据集已存在，跳过创建")
      return true
    }
  } catch {
    // 不存在就创建
  }

  const ds = await client.createDataset(DATASET_NAME, {
    description: "知识库 RAG 回答质量评测数据集",
  })

  for (const item of dataset) {
    await client.createExample({
      dataset_id: ds.id,
      inputs: { question: item.question, expected: item.expected },
      outputs: { type: item.type, difficulty: item.difficulty },
    })
  }

  console.log(`   ✅ 已上传 ${dataset.length} 条测试用例`)
  return true
}

// ─── 执行评测 ──────────────────────────────────────────────
async function runEvaluation() {
  console.log("\n🚀 开始评测")
  console.log(`   数据集: ${DATASET_NAME}`)
  console.log(`   用例数: ${dataset.length}`)
  console.log(`   模式: ${isQuick ? "快速模式（直接调 LLM）" : authCookie ? "完整模式（调本地 API + auth cookie）" : "快速模式（无 auth cookie，回退到直接调 LLM）"}`)
  console.log("")

  const results: Array<{
    question: string
    type: string
    output: string
    scores: { correctness: number; relevance: number; faithfulness: number; comment: string }
    error?: string
  }> = []

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i]
    process.stdout.write(`[${i + 1}/${dataset.length}] ${item.question.substring(0, 40)}... `)

    try {
      // 调用目标系统
      const useLocal = authCookie && !isQuick
      const output = useLocal ? await callLocalApi(item.question) : await callDirectLLM(item.question)

      // 评估
      const scores = await correctnessEvaluator(
        { question: item.question, expected: item.expected },
        output,
      )

      results.push({ question: item.question, type: item.type, output, scores })
      console.log(`✅ 正确:${scores.correctness}/10 相关:${scores.relevance}/10 忠实:${scores.faithfulness}/10`)
    } catch (err) {
      console.log(`❌ 错误: ${err instanceof Error ? err.message : "未知"}`)
      results.push({
        question: item.question,
        type: item.type,
        output: "",
        scores: { correctness: 0, relevance: 0, faithfulness: 0, comment: "执行失败" },
        error: err instanceof Error ? err.message : "未知错误",
      })
    }
  }

  // ─── 汇总报告 ──────────────────────────────────────────────
  console.log("\n\n📊 === 评测汇总 ===")
  console.log("=".repeat(60))

  const types = [...new Set(results.map(r => r.type))]
  for (const type of types) {
    const group = results.filter(r => r.type === type)
    const avgC = group.reduce((s, r) => s + r.scores.correctness, 0) / group.length
    const avgR = group.reduce((s, r) => s + r.scores.relevance, 0) / group.length
    const avgF = group.reduce((s, r) => s + r.scores.faithfulness, 0) / group.length
    console.log(`\n📂 分类: ${type} (${group.length} 条)`)
    console.log(`   正确性: ${avgC.toFixed(1)}/10 | 相关性: ${avgR.toFixed(1)}/10 | 忠实度: ${avgF.toFixed(1)}/10`)
  }

  const totalAvg = {
    correctness: results.reduce((s, r) => s + r.scores.correctness, 0) / results.length,
    relevance: results.reduce((s, r) => s + r.scores.relevance, 0) / results.length,
    faithfulness: results.reduce((s, r) => s + r.scores.faithfulness, 0) / results.length,
  }

  console.log(`\n📈 总分:`)
  console.log(`   正确性: ${totalAvg.correctness.toFixed(1)}/10`)
  console.log(`   相关性: ${totalAvg.relevance.toFixed(1)}/10`)
  console.log(`   忠实度: ${totalAvg.faithfulness.toFixed(1)}/10`)
  console.log(`   ${(totalAvg.correctness + totalAvg.relevance + totalAvg.faithfulness) / 3 / 10 * 100}% 综合评分`)
  console.log("=".repeat(60))

  // ─── 显示低分项 ──────────────────────────────────────────
  const lowScore = results.filter(r => r.scores.faithfulness < 6 || r.scores.correctness < 6)
  if (lowScore.length > 0) {
    console.log(`\n⚠️  以下 ${lowScore.length} 个回答可能需要关注:\n`)
    for (const r of lowScore) {
      console.log(`  ❌ ${r.question}`)
      console.log(`     正确性: ${r.scores.correctness} | 忠实度: ${r.scores.faithfulness}`)
      console.log(`     评语: ${r.scores.comment}`)
      console.log(`     回答: ${r.output.substring(0, 120)}...\n`)
    }
  }
}

// ─── 主流程 ────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║     LangSmith RAG 回答质量评测           ║")
  console.log("╚══════════════════════════════════════════╝")

  if (!hasApiKey) {
    console.error("❌ 请设置 OPENROUTER_API_KEY 环境变量")
    process.exit(1)
  }

  // 上传数据集（除非 --dry-run 时只上传不运行）
  const uploaded = await uploadDataset()
  if (isDryRun) {
    console.log("\n🏁 --dry-run 模式，跳过评测执行")
    process.exit(0)
  }

  if (!authCookie && !isQuick) {
    console.log("\nℹ️  未设置 TEST_AUTH_COOKIE，自动切换到快速模式（直接调 LLM）")
    console.log("   如需测试完整 RAG 链路:")
    console.log("   1. 登录后在浏览器 F12 → Application → Cookies → 找到 sb-{project_ref}-auth-token，**复制整个 cookie 字符串**")

    console.log("   2. 运行: TEST_AUTH_COOKIE='sb-lutxsllqvxjsguwxvwvn-auth-token=base64-xxx' npx tsx eval/run-eval.ts")
  }

  // 如果需要上传到 LangSmith，等待上传完成后记录 trace
  // 将评测结果记录到 LangSmith
  if (uploaded && hasLangSmith) {
    // 运行评测
    await runEvaluation()

    console.log(`\n📋 评测结果已记录到 LangSmith: ${DATASET_NAME}`)
    console.log(`   查看: https://smith.langchain.com`)
  } else {
    await runEvaluation()
  }
}

main().catch(console.error)