import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export function buildMarkdownFromDeltaChunks(chunks: any[]): string {
  let markdown = ''
  for (const chunk of chunks) {
    const content = chunk?.choices?.[0]?.delta?.content
    if (content) {
      markdown += content
    }
  }
  return markdown.trim()
}
