/**
 * Chat history proxy - routes to web or nest backend
 */

import { backendConfig, getApiUrl } from "@/lib/backend-config"
import { getAccessToken } from "@/app/auth/server"
import { proxyNestJsonResponse } from "@/lib/nest-proxy"

export async function GET(req: Request) {
  if (backendConfig.chatHistory === "web") {
    const { GET: webGet } = await import("./route.web")
    return webGet(req)
  }

  const token = await getAccessToken()
  if (!token) {
    return new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Forward query params
  const url = new URL(req.url)
  const queryString = url.search
  const nestUrl = getApiUrl("chatHistory", `/chat-history${queryString}`)

  const nestResponse = await fetch(nestUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return proxyNestJsonResponse(nestResponse)
}
