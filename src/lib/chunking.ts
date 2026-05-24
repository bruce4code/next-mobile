export interface Chunk {
  title: string
  content: string
  index: number
}

const MIN_CHUNK_SIZE = 100
const MAX_CHUNK_SIZE = 800

export function chunkDocument(title: string, content: string, contentType: string): Chunk[] {
  if (contentType === 'markdown') {
    return chunkMarkdown(title, content)
  }
  return chunkPlainText(title, content)
}

function chunkMarkdown(docTitle: string, content: string): Chunk[] {
  const lines = content.split('\n')
  const chunks: Chunk[] = []
  let currentHeading = ''
  let currentSubheading = ''
  let buffer: string[] = []
  let chunkIndex = 0

  function flushBuffer() {
    const text = buffer.join('\n').trim()
    if (!text) return
    const chunkTitle = currentSubheading
      ? `${docTitle} > ${currentHeading} > ${currentSubheading}`
      : currentHeading
        ? `${docTitle} > ${currentHeading}`
        : docTitle
    chunks.push({ title: chunkTitle, content: text, index: chunkIndex++ })
    buffer = []
  }

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/)
    const h3Match = line.match(/^### (.+)/)

    if (h2Match) {
      flushBuffer()
      currentHeading = h2Match[1].trim()
      currentSubheading = ''
      buffer.push(line)
    } else if (h3Match) {
      flushBuffer()
      currentSubheading = h3Match[1].trim()
      buffer.push(line)
    } else {
      buffer.push(line)
    }
  }
  flushBuffer()

  if (chunks.length === 0) {
    chunks.push({ title: docTitle, content: content.trim(), index: 0 })
  }

  return mergeSmallChunks(chunks)
}

function chunkPlainText(docTitle: string, content: string): Chunk[] {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0)
  const chunks: Chunk[] = []
  let buffer: string[] = []
  let bufferLen = 0
  let chunkIndex = 0

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (bufferLen + trimmed.length > MAX_CHUNK_SIZE && buffer.length > 0) {
      chunks.push({ title: docTitle, content: buffer.join('\n\n'), index: chunkIndex++ })
      buffer = []
      bufferLen = 0
    }
    buffer.push(trimmed)
    bufferLen += trimmed.length
  }

  if (buffer.length > 0) {
    chunks.push({ title: docTitle, content: buffer.join('\n\n'), index: chunkIndex++ })
  }

  if (chunks.length === 0) {
    chunks.push({ title: docTitle, content: content.trim(), index: 0 })
  }

  return mergeSmallChunks(chunks)
}

function mergeSmallChunks(chunks: Chunk[]): Chunk[] {
  if (chunks.length <= 1) return chunks

  const merged: Chunk[] = []
  for (const chunk of chunks) {
    const last = merged[merged.length - 1]
    if (last && last.content.length < MIN_CHUNK_SIZE) {
      last.content = last.content + '\n\n' + chunk.content
      last.title = last.title.includes(' > ')
        ? last.title.split(' > ').slice(0, 2).join(' > ')
        : last.title
    } else {
      merged.push({ ...chunk })
    }
  }
  return merged
}