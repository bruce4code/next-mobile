'use client'

import { useEffect } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('受保护页面出错:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center h-full p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold">加载失败</h2>
          <p className="text-sm text-muted-foreground">
            内容加载出现错误，请重试
          </p>
        </div>

        <Button onClick={reset} size="sm" className="gap-2">
          <RotateCcw className="w-3.5 h-3.5" />
          重新加载
        </Button>
      </div>
    </div>
  )
}
