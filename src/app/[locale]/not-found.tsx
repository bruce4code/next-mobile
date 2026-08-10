'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileQuestion, ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function LocaleNotFound() {
  const router = useRouter()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <FileQuestion className="w-10 h-10 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold">404</h1>
          <h2 className="text-xl font-semibold text-muted-foreground">页面不存在</h2>
          <p className="text-sm text-muted-foreground">
            您访问的页面可能已被删除、移走或暂时不可用
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Button asChild className="gap-2">
            <Link href="/">
              <Home className="w-4 h-4" />
              返回首页
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            返回上一页
          </Button>
        </div>
      </div>
    </div>
  )
}
