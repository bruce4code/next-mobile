/**
 * Ingestion jobs proxy - routes to web or nest backend
 */

import { backendConfig, getApiUrl } from "@/lib/backend-config"
import { getAccessToken } from "@/app/auth/server"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Note: params is a Promise in Next.js 15
  const { id } = await params

  if (backendConfig.documents === "web") {
    const { GET: webGet } = await import("./route.web")
    return webGet(req, { params: Promise.resolve({ id }) })
  }

  const token = await getAccessToken()
  if (!token) {
    return new Response(JSON.stringify({ error: "未登录" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const nestUrl = getApiUrl("documents", `/ingestion-jobs/${id}`)

  const nestResponse = await fetch(nestUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return new Response(await nestResponse.text(), {
    status: nestResponse.status,
    headers: { "Content-Type": "application/json" },
  })
}
