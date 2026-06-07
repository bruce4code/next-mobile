/**
 * LangSmith Experiment 评测脚本
 *
 * 手动循环评测，避免 evaluate() 包装层的问题。
 *
 * 用法:
 *   pnpm eval:experiment                        # 快速模式（直接调 LLM）
 *   TEST_AUTH_COOKIE='xxx' pnpm eval:experiment  # 完整模式（调本地 API + RAG）
 *
 * 运行后去 https://smith.langchain.com → Datasets → next-mobile-eval → Experiments 查看结果
 */

import "dotenv/config"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
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

const dataset: TestCase[] = JSON.parse(
  readFileSync(resolve(__dirname, "dataset.json"), "utf-8"),
)

// ─── 配置 ──────────────────────────────────────────────────
const DATASET_NAME = "next-mobile-eval"
const LOCAL_API = "http://localhost:8000/api/chat"
const authCookie = process.env.TEST_AUTH_COOKIE
const model = process.env.EVAL_MODEL || process.env.OPENROUTER_MODEL?.split(",").map(m => m.trim()).filter(Boolean)[0] || "qwen/qwen3-8b"
const judgeModel = process.env.JUDGE_MODEL || "qwen/qwen3-8b"
const hasLangSmith = process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_TRACING === "true"
const openai = wrapOpenAI(new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "",
  baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
}))

// ─── 调用目标系统（本地 API 或直接 LLM） ────────────────────
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
        } catch { /* skip */ }
      }
    }
    return fullContent
  } else {
    // 快速模式：直接调 LLM
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
    })
    return res.choices[0].message.content || ""
  }
}

// ─── LLM 评分器 ────────────────────────────────────────────
async function evaluateAnswer(question: string, expected: string, answer: string): Promise<{ correctness: number; relevance: number; faithfulness: number; comment: string }> {
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
  })

  try {
    const rawContent = res.choices[0].message.content || "{}"
    console.log("评委原始返回:", rawContent)

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
  } catch (e) {
    console.log("评分解析失败，原始响应:", res.choices[0].message.content?.substring(0, 300))
    return { correctness: 0, relevance: 0, faithfulness: 0, comment: "评分解析失败" }
  }
}

// ─── 主流程 ────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════╗")
  console.log("║   LangSmith Experiment — RAG 质量评测    ║")
  console.log("╚══════════════════════════════════════════╝")
  console.log(`\n📋 数据集: ${DATASET_NAME}`)
  console.log(`📊 用例数: ${dataset.length}`)
  console.log(`🤖 模型: ${model}`)
  console.log(`⚖️  评分模型: ${judgeModel}`)
  console.log(`🔗 模式: ${authCookie ? "完整模式（本地 API + RAG）" : "快速模式（直接调 LLM）"}`)
  console.log(`📡 LangSmith: ${hasLangSmith ? "已连接" : "未配置（结果仅输出到终端）"}`)

  const results: Array<{
    question: string
    type: string
    output: string
    scores: { correctness: number; relevance: number; faithfulness: number; comment: string }
    error?: string
  }> = []

  // ─── 逐条执行 ──────────────────────────────────────────
  console.log("\n🚀 开始评测...\n")

  for (let i = 0; i < dataset.length; i++) {
    const item = dataset[i]
    process.stdout.write(`[${i + 1}/${dataset.length}] ${item.question.substring(0, 40)}... `)

    try {
      const answer = await getAnswer(item.question)
      const scores = await evaluateAnswer(item.question, item.expected, answer)

      results.push({
        question: item.question,
        type: item.type,
        output: answer,
        scores,
      })

      const avgScore = (scores.correctness + scores.relevance + scores.faithfulness) / 3
      console.log(`✅ ${avgScore.toFixed(1)}/10`)
    } catch (err) {
      console.log(`❌ ${err instanceof Error ? err.message.substring(0, 60) : "未知错误"}`)
      results.push({
        question: item.question,
        type: item.type,
        output: "",
        scores: { correctness: 0, relevance: 0, faithfulness: 0, comment: "执行失败" },
        error: err instanceof Error ? err.message : "未知错误",
      })
    }
  }

  // ─── 汇总报告 ──────────────────────────────────────────
  console.log("\n\n� === 评测汇总 ===")
  console.log("=".repeat(60))

  const types = [...new Set(results.map(r => r.type))]
  for (const type of types) {
    const group = results.filter(r => r.type === type)
    if (group.length === 0) continue
    const avgC = group.reduce((s, r) => s + r.scores.correctness, 0) / group.length
    const avgR = group.reduce((s, r) => s + r.scores.relevance, 0) / group.length
    const avgF = group.reduce((s, r) => s + r.scores.faithfulness, 0) / group.length
    console.log(`\n📂 ${type} (${group.length} 条)`)
    console.log(`   正确性: ${avgC.toFixed(1)} | 相关性: ${avgR.toFixed(1)} | 忠实度: ${avgF.toFixed(1)}`)
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
  console.log(`   综合: ${((totalAvg.correctness + totalAvg.relevance + totalAvg.faithfulness) / 3).toFixed(1)}/10`)
  console.log("=".repeat(60))

  // 低分项
  const lowScore = results.filter(r => r.scores.faithfulness < 6 || r.scores.correctness < 6)
  if (lowScore.length > 0) {
    console.log(`\n⚠️  以下 ${lowScore.length} 个回答建议关注:\n`)
    for (const r of lowScore) {
      console.log(`  ❌ ${r.question}`)
      console.log(`     正确性: ${r.scores.correctness} | 忠实度: ${r.scores.faithfulness}`)
      console.log(`     评语: ${r.scores.comment}`)
    }
  }

  if (hasLangSmith) {
    console.log(`\n📡 调用链的 trace 可在 LangSmith 查看`)
    console.log(`   查看: https://smith.langchain.com`)
  }

  console.log(`\n✅ 完成！${results.filter(r => !r.error).length}/${results.length} 条成功`)
}

main().catch(console.error)