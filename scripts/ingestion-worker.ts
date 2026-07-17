import 'dotenv/config'
import { processNextIngestionJob } from '../src/lib/ingestion'
import prisma from '../src/lib/prisma'

const POLL_INTERVAL_MS = Number(process.env.INGESTION_POLL_INTERVAL_MS ?? 2_000)
let stopping = false

process.on('SIGINT', () => { stopping = true })
process.on('SIGTERM', () => { stopping = true })

async function main() {
  console.log('Ingestion worker started')
  while (!stopping) {
    const result = await processNextIngestionJob()
    if (!result) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }
}

main()
  .catch((error) => {
    console.error('Ingestion worker stopped unexpectedly:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
