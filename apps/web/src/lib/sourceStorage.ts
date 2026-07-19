import { createClient } from '@/app/auth/server'

interface ArchiveSourceInput {
  userId: string
  documentId: string
  version: number
  content: string
  contentType: string
}

export async function archiveDocumentSource(input: ArchiveSourceInput) {
  const bucket = process.env.SUPABASE_KNOWLEDGE_BUCKET
  if (!bucket) return null

  const extension = input.contentType === 'markdown' ? 'md' : 'txt'
  const objectPath = `${input.userId}/${input.documentId}/v${input.version}.${extension}`
  const supabase = await createClient()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, Buffer.from(input.content, 'utf8'), {
      contentType: input.contentType === 'markdown' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
      upsert: true,
    })

  if (error) throw error
  return `supabase://${bucket}/${objectPath}`
}

export async function deleteDocumentSources(userId: string, documentId: string) {
  const bucket = process.env.SUPABASE_KNOWLEDGE_BUCKET
  if (!bucket) return

  const folder = `${userId}/${documentId}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1_000 })
  if (error) throw error
  if (!data || data.length === 0) return

  const paths = data.map((object) => `${folder}/${object.name}`)
  const { error: removeError } = await supabase.storage.from(bucket).remove(paths)
  if (removeError) throw removeError
}
