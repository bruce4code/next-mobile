"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useForm } from "react-hook-form"

export function LoginForm() {
  const { register, handleSubmit } = useForm()

  const onSubmit = (data: any) => {
    console.log(data)
    // 这里添加登录逻辑
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-center">登录</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="请输入邮箱"
              {...register("email")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              placeholder="请输入密码"
              {...register("password")}
            />
          </div>
          <Button type="submit" className="w-full">
            登录
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}