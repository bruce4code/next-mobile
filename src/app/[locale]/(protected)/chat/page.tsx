'use client'

import { useState, useEffect } from 'react'
import ChatPanel from '@/components/ChatPanel' // 引入 ChatPanel
import { Navbar } from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

export default function NewChatPage() {
  
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
    }
    fetchUser()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setCurrentUser(session?.user ?? null)
      }
    )
    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  return (
    <div className="flex w-full" style={{ height: 'calc(100vh - 30px)' }}>
      <div className="flex flex-col flex-1">
        <Navbar />
        <div className="container mx-auto max-w-4xl flex-1 p-2 py-4" style={{ height: 'calc(90vh - 80px)' }}> {/* 假设 Navbar 高度约为 80px */}
          {/* currentUser 加载完成后再渲染 ChatPanel */}
          {currentUser !== undefined && (
            <ChatPanel currentUser={currentUser} />
          )}
        </div>
      </div>
    </div>
  )
}
