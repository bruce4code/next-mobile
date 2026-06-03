import type { Metadata } from 'next'
import { LoginForm } from "@/components/LoginForm"

export const metadata: Metadata = {
  title: '登录',
  description: '登录 AI Chat 智能对话助手',
}

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen w-full">
      <LoginForm />
    </div>
  );
}