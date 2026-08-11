import type { Metadata } from 'next'
import { KnowledgePageClient } from './KnowledgeClient'

export const metadata: Metadata = {
  title: '知识库',
  description: '管理 AI Chat 知识库文档，支持搜索、新增、编辑和删除',
}

export default function KnowledgePage() {
  return <KnowledgePageClient />
}