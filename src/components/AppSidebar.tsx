"use client"

import { Calendar, Home, Inbox, Plus, MessageSquare, Settings, User, Menu, X } from "lucide-react"
import { useEffect, useState } from "react"
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useUser } from './UserProvider'
import { cachedGetChatHistory } from '@/lib/cache'
import { Button } from '@/components/ui/button'

// Menu items
const staticItems = [
  {
    title: "新对话",
    path: "/chat",
    icon: Plus,
  },
  {
    title: "个人资料",
    path: "/profile",
    icon: User,
  },
  {
    title: "设置",
    path: "/settings",
    icon: Settings,
  },
]

export function AppSidebar() {
  const [chatHistoryItems, setChatHistoryItems] = useState<Array<{title: string, url: string, id: string}>>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const { user } = useUser()
  const params = useParams()
  const pathname = usePathname()
  const locale = params?.locale as string | undefined

  const withLocale = (path: string) => {
    if (!locale) {
      return path
    }
    if (path === "/" || path === "") {
      return `/${locale}`
    }
    return `/${locale}${path}`
  }

  const isActive = (path: string) => {
    const fullPath = withLocale(path)
    return pathname === fullPath
  }

  useEffect(() => {
    const fetchChatHistory = async () => {
      if (!user) return

      try {
        const chats = await cachedGetChatHistory(user.id);
        console.log("chats", chats);
        
        const mappedChats = chats.map((chat: any) => {
          const title = chat.content
            .substring(0, 30)
            .replace(/\n/g, " ")
            .trim()
          return {
            title: title || `对话 ${chat.conversationId.substring(0, 8)}`,
            url: withLocale(`/chat/${chat.conversationId}`),
            id: chat.conversationId,
          }
        })
        console.log("mappedChats", mappedChats)
        setChatHistoryItems(mappedChats)
      } catch (error) {
        console.error("Error fetching chat history with Prisma:", error)
      }
    }

    fetchChatHistory()
  }, [user, locale])

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="bg-background/80 backdrop-blur-sm"
        >
          {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className={`chatgpt-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">AI 助手</span>
          </div>
          
          {/* New Chat Button */}
          <Button asChild className="w-full justify-start gap-2 bg-primary hover:bg-primary/90">
            <Link href={withLocale("/chat")} onClick={() => setIsMobileMenuOpen(false)}>
              <Plus className="w-4 h-4" />
              新对话
            </Link>
          </Button>
        </div>

      {/* Content */}
      <div className="sidebar-content">
        {/* Chat History */}
        {chatHistoryItems.length > 0 && (
          <div className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">最近对话</h3>
            <div className="space-y-1">
              {chatHistoryItems.map((chatItem) => (
                <Link
                  key={chatItem.id}
                  href={chatItem.url}
                  className={`sidebar-button ${
                    isActive(`/chat/${chatItem.id}`) ? 'sidebar-button-active' : ''
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-sm">{chatItem.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="space-y-1">
          {staticItems.slice(1).map((item) => {
            const href = withLocale(item.path)
            return (
              <Link
                key={item.title}
                href={href}
                className={`sidebar-button ${
                  isActive(item.path) ? 'sidebar-button-active' : ''
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm">{item.title}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
    </>
  )
}
