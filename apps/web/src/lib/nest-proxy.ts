type NestSuccessEnvelope = {
  code: "OK"
  error: null
  data: unknown
  requestId: string
}

function isNestSuccessEnvelope(value: unknown): value is NestSuccessEnvelope {
  if (typeof value !== "object" || value === null) return false

  const envelope = value as Partial<NestSuccessEnvelope>
  return envelope.code === "OK" && envelope.error === null && "data" in envelope
}

/**
 * Nest uses a uniform envelope, while browser-facing Next routes retain their
 * legacy resource shapes during the migration. Nest errors pass through intact.
 */
export async function proxyNestJsonResponse(response: Response) {
  const requestId = response.headers.get("X-Request-Id")
  const headers = new Headers({ "Content-Type": "application/json" })
  if (requestId) headers.set("X-Request-Id", requestId)

  const payload: unknown = await response.json()
  if (!response.ok || !isNestSuccessEnvelope(payload)) {
    return new Response(JSON.stringify(payload), { status: response.status, headers })
  }

  return new Response(JSON.stringify(payload.data), { status: response.status, headers })
}
