/**
 * Chat proxy - routes to web or nest backend based on CHAT_BACKEND flag
 */

import { backendConfig, getApiUrl } from "@/lib/backend-config"
import { getAccessToken } from "@/app/auth/server"

export async function POST(req: Request) {
  // If CHAT_BACKEND is web, use the original web implementation
  if (backendConfig.chat === "web") {
    // Import and delegate to original route
    const { POST: webPost } = await import("./route.web")
    return webPost(req)
  }

  // Otherwise, proxy to Nest backend
  const token = await getAccessToken()
  if (!token) {
    return new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = await req.json()
  const nestUrl = getApiUrl("chat", "/chat")

  // Forward request to Nest with SSE
  const nestResponse = await fetch(nestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!nestResponse.ok) {
    return new Response(nestResponse.body, {
      status: nestResponse.status,
      headers: {
        "Content-Type": nestResponse.headers.get("Content-Type") ?? "application/json",
      },
    })
  }

  // Return SSE stream from Nest
  return new Response(nestResponse.body, {
    status: nestResponse.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
