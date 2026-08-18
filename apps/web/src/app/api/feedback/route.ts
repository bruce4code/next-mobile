/**
 * Feedback proxy - routes to web or nest backend
 */

import { backendConfig, getApiUrl } from "@/lib/backend-config"
import { getAccessToken } from "@/app/auth/server"

export async function POST(req: Request) {
  if (backendConfig.feedback === "web") {
    const { POST: webPost } = await import("./route.web")
    return webPost(req)
  }

  const token = await getAccessToken()
  if (!token) {
    return new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = await req.json()
  const nestUrl = getApiUrl("feedback", "/feedback")

  const nestResponse = await fetch(nestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  return new Response(await nestResponse.text(), {
    status: nestResponse.status,
    headers: { "Content-Type": "application/json" },
  })
}
