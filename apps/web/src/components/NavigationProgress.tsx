'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationProgress() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const prevPathname = useRef(pathname)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // 监听内部链接点击，预判导航开始
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href^="/"]')
      if (!link) return
      const href = link.getAttribute('href')
      // 排除锚点跳转和当前路径
      if (href && !href.startsWith('#') && href !== pathname) {
        setLoading(true)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  // 路径变化 → 导航完成，隐藏进度条
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      setLoading(false)
      clearTimeout(timerRef.current)
    }
  }, [pathname])

  // 安全兜底：5 秒后自动隐藏
  useEffect(() => {
    if (loading) {
      timerRef.current = setTimeout(() => setLoading(false), 5000)
      return () => clearTimeout(timerRef.current)
    }
  }, [loading])

  if (!loading) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-0.5 overflow-hidden">
      {/* 背景轨道 */}
      <div className="absolute inset-0 bg-primary/15" />
      {/* 动画滑块 */}
      <div className="relative h-full w-1/3 bg-primary rounded-full animate-loading-bar" />
    </div>
  )
}