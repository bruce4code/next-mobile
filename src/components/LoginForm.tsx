"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useForm } from "react-hook-form"
import { createClient } from '@/lib/supabase/client' 
import { useRouter } from 'next/navigation' 
import { useState } from 'react' // 引入 useState

export function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm()
  const supabase = createClient()
  const router = useRouter()
  const [isLoginMode, setIsLoginMode] = useState(true) // 新增状态，默认为登录模式
  const [formError, setFormError] = useState<string | null>(null) // 用于显示表单级别的错误
  const [isLoading, setIsLoading] = useState(false) // 用于处理加载状态

  const onSubmit = async (data: any) => {
    setIsLoading(true)
    setFormError(null) // 清除之前的错误
    try {
      if (isLoginMode) {
        // 登录逻辑
        const { error } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })
        if (error) {
          console.error('登录错误:', error.message)
          setFormError(`登录失败: ${error.message}`)
        } else {
          console.log('登录成功')
          router.push('/') 
          router.refresh()
        }
      } else {
        // 注册逻辑
        const { error } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          // Supabase 默认会发送确认邮件，可以在 Supabase 项目设置中配置
          // options: {
          //   emailRedirectTo: `${window.location.origin}/auth/callback`,
          // },
        })
        if (error) {
          console.error('注册错误:', error.message)
          setFormError(`注册失败: ${error.message}`)
        } else {
          console.log('注册成功，请检查您的邮箱进行验证。')
          // 提示用户检查邮箱，或者直接尝试登录（如果禁用了邮件确认）
          setFormError('注册成功！请检查您的邮箱以完成验证，然后尝试登录。') 
          setIsLoginMode(true) // 注册成功后切换回登录模式
        }
      }
    } catch (error) {
      console.error('操作时发生意外错误:', error)
      setFormError('操作时发生意外错误，请稍后再试。')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-center">
          {isLoginMode ? '登录' : '注册'} {/* 根据模式显示标题 */}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {formError && (
          <p className="mb-4 text-center text-sm text-red-600">{formError}</p>
        )}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="请输入邮箱"
              {...register("email", { required: "邮箱不能为空" })}
              disabled={isLoading}
            />
            {errors.email && <p className="text-sm text-red-500">{errors.email.message?.toString()}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder="请输入密码"
              {...register("password", { 
                required: "密码不能为空", 
                minLength: { value: 6, message: "密码至少需要6位" } 
              })}
              disabled={isLoading}
            />
            {errors.password && <p className="text-sm text-red-500">{errors.password.message?.toString()}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '处理中...' : (isLoginMode ? '登录' : '注册')} {/* 根据模式和加载状态显示按钮文本 */}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          {isLoginMode ? '还没有账户？' : '已有账户？'}{" "}
          <button 
            onClick={() => {
              setIsLoginMode(!isLoginMode)
              setFormError(null) // 切换模式时清除错误
            }}
            className="font-medium text-primary underline-offset-4 hover:underline"
            disabled={isLoading}
          >
            {isLoginMode ? '立即注册' : '立即登录'}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}