import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from "@langchain/textsplitters"

export interface Chunk {
  title: string
  content: string
  index: number
  heading: string | null
  startOffset: number | null
  endOffset: number | null
}

export const PARSER_VERSION = "inline-text-v1"
export const CHUNKING_VERSION = "langchain-300-50-v1"

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
  if (contentType === "markdown") {
    rawChunks = await mdSplitter.splitText(content)
  } else {
    rawChunks = await textSplitter.splitText(content)
  }

  let searchOffset = 0

  return rawChunks.map((text, index) => {
    const heading = extractHeading(text)
    let startOffset = content.indexOf(text, searchOffset)
    if (startOffset < 0) startOffset = content.indexOf(text)
    const endOffset = startOffset >= 0 ? startOffset + text.length : null
    if (startOffset >= 0) searchOffset = startOffset + 1

    return {
      title: heading ? `${title} > ${heading}` : title,
      content: text,
      index,
      heading,
      startOffset: startOffset >= 0 ? startOffset : null,
      endOffset,
    }
  })
}

function extractHeading(text: string): string | null {
  const lines = text.split("\n")
  for (const line of lines) {
    const match = line.match(/^#{2,4}\s+(.+)/)
    if (match) return match[1].trim()
  }
  return null
}
