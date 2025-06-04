'use client'

import { Calendar, Home, Inbox, Search, Settings } from "lucide-react"
import { useEffect, useState } from "react"
import prisma from '@/lib/prisma'; // 导入 Prisma 客户端
import { createClient } from '@/lib/supabase/client'; // 导入客户端 Supabase 客户端
import { User } from '@supabase/supabase-js'; // 导入 User 类型

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
    url: "#",
    icon: Home,
  },
  {
    title: "Inbox",
    url: "#",
    icon: Inbox,
  },
  {
    title: "Calendar",
    url: "#",
    icon: Calendar,
  },
  {
    title: "Search",
    url: "#",
    icon: Search,
  },
  {
    title: "Settings",
    url: "#",
    icon: Settings,
  },
]

export function AppSidebar() {
  const [chatHistoryItems, setChatHistoryItems] = useState([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null); // 新增：存储当前用户信息

  useEffect(() => {
    const fetchChatHistory = async () => {
      try {
        const supabase = createClient(); // 创建 Supabase 客户端实例
        const fetchUser = async () => {
          const { data: { user } } = await supabase.auth.getUser();
          setCurrentUser(user);
        };
        fetchUser();
        // 使用 Prisma 获取 OpenRouterChat 数据
        const chats = await fetch('/api/get-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: currentUser?.id, // <-- 使用获取到的用户 ID
            role: 'user',
          }),
        });

        // 将聊天记录映射为侧边栏菜单项
        const mappedChats = chats.map(chat => {
          // 取内容的前50个字符作为标题，并去除换行符
          const title = chat.content.substring(0, 50).replace(/\n/g, ' ').trim();
          return {
            title: title || `Chat ${chat.id.substring(0, 8)}`, // 如果内容为空，使用ID作为标题
            url: `/chat/${chat.id}`, // 假设聊天页面路由为 /chat/:id
            icon: Inbox, // 可以使用 Inbox 图标或其他合适的图标
          };
        });
        setChatHistoryItems(mappedChats);
      } catch (error) {
        console.error('Error fetching chat history with Prisma:', error);
      }
    };

    fetchChatHistory();
  }, []); // 空依赖数组表示只在组件挂载时运行一次

  return (
    <Sidebar className="sidebar"> {/* 添加 className="sidebar" */}
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
                  <SidebarMenuItem key={chatItem.url}> {/* 使用 url 作为 key，确保唯一性 */}
                    <SidebarMenuButton asChild>
                      <a href={chatItem.url}>
                        <chatItem.icon />
                        <span>{chatItem.title}</span>
                      </a>
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
