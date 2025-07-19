"use client"

import { Calendar, Home, Inbox } from "lucide-react"
import { useEffect, useState, memo } from "react"
import Link from 'next/link'
import { useUser } from './UserProvider'
import { cachedGetChatHistory } from '@/lib/cache'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Menu items. (保留原有菜单项)
const staticItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Profile",
    url: "/profile",
    icon: Inbox,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Calendar,
  },
]

export function AppSidebar() {
  const [chatHistoryItems, setChatHistoryItems] = useState<Array<{title: string, url: string, icon: any}>>([])
  const { user } = useUser()

  useEffect(() => {
    const fetchChatHistory = async () => {
      if (!user) return
      
      try {
        // 使用缓存的聊天历史获取函数
        const chats = await cachedGetChatHistory(user.id);
        console.log("chats", chats);
        
        const mappedChats = chats.map((chat: any) => {
          const title = chat.content
            .substring(0, 20)
            .replace(/\n/g, " ")
            .trim()
          return {
            title: title || `Chat ${chat.conversationId.substring(0, 8)}`,
            url: `/chat/${chat.conversationId}`,
            icon: Inbox, 
          }
        })
        console.log("mappedChats", mappedChats)
        setChatHistoryItems(mappedChats)
      } catch (error) {
        console.error("Error fetching chat history with Prisma:", error)
      }
    }

    fetchChatHistory()
  }, [user]) // 依赖 user，当用户状态变化时重新获取

  return (
    <Sidebar className="sidebar">
      {" "}
      {/* 添加 className="sidebar" */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {staticItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {chatHistoryItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Chat History</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {chatHistoryItems.map((chatItem, index) => (
                  <SidebarMenuItem key={chatItem.url}>
                    {/* 使用 url 作为 key，确保唯一性 */}
                    <SidebarMenuButton asChild>
                     <Link href={chatItem.url}>{chatItem.title}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  )
}
