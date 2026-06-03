'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('页面出错:', error)
  }, [error])

  return (
    <div className="min-h-full bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">出错了</h1>
          <p className="text-muted-foreground">
            页面遇到了一些问题，请稍后再试。
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground/60 font-mono">
              错误 ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            重试
          </Button>
          <Button
            variant="outline"
            onClick={() => { window.location.href = '/' }}
            className="gap-2"
          >
            <Home className="w-4 h-4" />
            返回首页
          </Button>
        </div>
      </div>
    </div>
  )
}
