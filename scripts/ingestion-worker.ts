import 'dotenv/config'

const POLL_INTERVAL_MS = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? 2_000)
const INGESTION_BACKEND = process.env.INGESTION_BACKEND ?? 'web'
const NEST_API_URL = process.env.NEST_API_URL ?? 'http://localhost:4000'
const INGESTION_WORKER_SECRET = process.env.INGESTION_WORKER_SECRET

let stopping = false

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

interface ProcessResult {
  jobId: string
  documentId: string
  status: 'COMPLETED' | 'RETRY' | 'FAILED'
}

async function processViaWeb(): Promise<ProcessResult | null> {
  // Dynamic import to avoid loading web dependencies when using Nest backend
  const { processNextIngestionJob } = await import('../apps/web/src/lib/ingestion')
  return await processNextIngestionJob()
}

async function processViaHttp(): Promise<ProcessResult | null> {
  if (!INGESTION_WORKER_SECRET) {
    throw new Error('INGESTION_WORKER_SECRET is required for HTTP polling')
  }

  const url = `${NEST_API_URL}/api/ingestion/process`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${INGESTION_WORKER_SECRET}`,
    },
    body: JSON.stringify({ limit: 1 }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  const envelope = await response.json() as { data?: { processed: number; results: ProcessResult[] } }
  if (!envelope.data) throw new Error('Nest ingestion response is missing data')
  const data = envelope.data
  return data.results[0] ?? null
}

async function processNext(): Promise<ProcessResult | null> {
  if (INGESTION_BACKEND === 'nest') {
    return await processViaHttp()
  } else {
    return await processViaWeb()
  }
}

async function main() {
  console.log(`Ingestion worker started (backend: ${INGESTION_BACKEND})`)

  if (INGESTION_BACKEND === 'nest') {
    console.log(`  - Polling: ${NEST_API_URL}/api/ingestion/process`)
  } else {
    console.log(`  - Mode: direct function call`)
  }

  while (!stopping) {
    try {
      const result = await processNext()
      if (!result) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
      } else {
        console.log(`Processed job ${result.jobId} -> ${result.status}`)
      }
    } catch (error) {
      console.error('Processing error:', error)
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  console.log('Worker stopped gracefully')
}

main()
  .catch((error) => {
    console.error('Ingestion worker stopped unexpectedly:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    // Only disconnect prisma if we used web backend
    if (INGESTION_BACKEND === 'web') {
      const prisma = (await import('../apps/web/src/lib/prisma')).default
      await prisma.$disconnect()
    }
  })
