import Link from 'next/link'
import { FileQuestion, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ProtectedNotFound() {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
            <FileQuestion className="w-7 h-7 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold">未找到此会话</h2>
          <p className="text-sm text-muted-foreground">
            对话可能已被删除或链接已失效
          </p>
        </div>

        <Button asChild size="sm" className="gap-2">
          <Link href="/chat">
            <MessageSquare className="w-4 h-4" />
            开始新对话
          </Link>
        </Button>
      </div>
    </div>
  )
}
