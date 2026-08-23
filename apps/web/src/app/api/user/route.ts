/**
 * User profile proxy - routes to web or nest backend
 */

import { backendConfig, getApiUrl } from "@/lib/backend-config"
import { getAccessToken } from "@/app/auth/server"
import { proxyNestJsonResponse } from "@/lib/nest-proxy"

export async function GET(req: Request) {
  if (backendConfig.user === "web") {
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

  const nestUrl = getApiUrl("user", "/users/me")

  const nestResponse = await fetch(nestUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return proxyNestJsonResponse(nestResponse)
}

export async function PUT(req: Request) {
  if (backendConfig.user === "web") {
    const { PUT: webPut } = await import("./route.web")
    return webPut(req)
  }

  const token = await getAccessToken()
  if (!token) {
    return new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const body = await req.json()
  const nestUrl = getApiUrl("user", "/users/me")

  const nestResponse = await fetch(nestUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  return proxyNestJsonResponse(nestResponse)
}
