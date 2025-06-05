"use client"

import { Calendar, Home, Inbox } from "lucide-react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client" // 导入客户端 Supabase 客户端
import Link from 'next/link'
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
  const [chatHistoryItems, setChatHistoryItems] = useState<Array<{title: string, url: string, icon: any}>>([]) // 明确类型

  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const supabase = createClient() // 创建 Supabase 客户端实例
        const fetchUser = async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          // 使用 Prisma 获取 OpenRouterChat 数据
          // 注意：这里的API调用现在只获取历史列表，不再需要userId，除非你的API设计如此
          const response = await fetch(`/api/get-chat?userId=${user?.id}`, { // 确保API能处理仅userId的情况返回历史列表
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          const chats = await response.json();
          console.log("chats", chats);
          // 将聊天记录映射为侧边栏菜单项
          const mappedChats = chats.map((chat: any) => { // 为 chat 添加类型
            // 取内容的前20个字符作为标题，并去除换行符
            const title = chat.content
              .substring(0, 20)
              .replace(/\n/g, " ")
              .trim()
            return {
              title: title || `Chat ${chat.conversationId.substring(0, 8)}`, // 使用 conversationId 生成标题
              url: `/chat/${chat.conversationId}`, // 确保这里是 conversationId
              icon: Inbox, 
            }
          })
          console.log("mappedChats", mappedChats)
          setChatHistoryItems(mappedChats)
        }
        fetchUser()
      } catch (error) {
        console.error("Error fetching chat history with Prisma:", error)
      }
    }

    fetchChatHistory()
  }, []) // 空依赖数组表示只在组件挂载时运行一次

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
