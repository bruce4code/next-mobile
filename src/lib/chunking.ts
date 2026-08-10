import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

export interface Chunk {
  title: string
  content: string
  index: number
}

const mdSplitter = new MarkdownTextSplitter({
  chunkSize: 300,
  chunkOverlap: 50,
})

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 300,
  chunkOverlap: 50,
})

export async function chunkDocument(title: string, content: string, contentType: string): Promise<Chunk[]> {
  let rawChunks: string[]
  if (contentType === 'markdown') {
    rawChunks = await mdSplitter.splitText(content)
  } else {
    rawChunks = await textSplitter.splitText(content)
  }

  return rawChunks.map((text, index) => {
    const heading = extractHeading(text)
    return {
      title: heading ? `${title} > ${heading}` : title,
      content: text,
      index,
    }
  })
}

function extractHeading(text: string): string | null {
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^#{2,4}\s+(.+)/)
    if (match) return match[1].trim()
  }
  return null
}