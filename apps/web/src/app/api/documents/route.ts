/**
 * Documents proxy — routes to web or nest per DOCUMENTS_BACKEND.
 *
 * Note the URL shapes differ: web addresses a single document with ?id=<uuid>
 * on this same route, while Nest uses /documents/:id. The id is therefore moved
 * from query to path when forwarding PUT and DELETE.
 */

import type { NextRequest } from "next/server"
import { backendConfig, getApiUrl } from "@/lib/backend-config"
import { getAccessToken } from "@/app/auth/server"
import { proxyNestJsonResponse } from "@/lib/nest-proxy"

const unauthorized = () =>
  new Response(JSON.stringify({ error: "未登录" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })

async function forward(req: NextRequest, method: "GET" | "POST" | "PUT" | "DELETE") {
  const token = await getAccessToken()
  if (!token) return unauthorized()

  const { searchParams } = new URL(req.url)

  let path = "/documents"
  if (method === "PUT" || method === "DELETE") {
    const id = searchParams.get("id")
    if (!id) {
      return new Response(JSON.stringify({ error: "缺少文档 id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    path = `/documents/${encodeURIComponent(id)}`
  } else {
    const query = searchParams.toString()
    if (query) path = `/documents?${query}`
  }

  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}` },
  }

  if (method === "POST" || method === "PUT") {
    init.headers = { ...init.headers, "Content-Type": "application/json" }
    init.body = JSON.stringify(await req.json())
  }

  const response = await fetch(getApiUrl("documents", path), init)

  return proxyNestJsonResponse(response)
}

export async function GET(req: NextRequest) {
  if (backendConfig.documents === "web") {
    const { GET: webGet } = await import("./route.web")
    return webGet(req)
  }
  return forward(req, "GET")
}

export async function POST(req: NextRequest) {
  if (backendConfig.documents === "web") {
    const { POST: webPost } = await import("./route.web")
    return webPost(req)
  }
  return forward(req, "POST")
}

export async function PUT(req: NextRequest) {
  if (backendConfig.documents === "web") {
    const { PUT: webPut } = await import("./route.web")
    return webPut(req)
  }
  return forward(req, "PUT")
}

export async function DELETE(req: NextRequest) {
  if (backendConfig.documents === "web") {
    const { DELETE: webDelete } = await import("./route.web")
    return webDelete(req)
  }
  return forward(req, "DELETE")
}
