import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getUser } from "@/app/auth/server"
import { z } from 'zod'

const UpdateProfileSchema = z.object({
  name: z.string().max(100, '姓名不超过 100 个字符').optional(),
  bio: z.string().max(500, '个人简介不超过 500 个字符').optional(),
  avatarUrl: z.string().url('头像链接格式不正确').or(z.literal('')).optional(),
  location: z.string().max(200, '位置不超过 200 个字符').optional(),
})

export async function GET(req: Request) {
  try {
    const user = await getUser()
    
    if (!user) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      )
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    })

    if (!dbUser) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      bio: dbUser.bio,
      avatarUrl: dbUser.avatarUrl,
      location: dbUser.location,
      createdAt: dbUser.createdAt,
    })
  } catch (error) {
    console.error("获取用户资料失败:", error)
    return NextResponse.json(
      { error: "获取用户资料失败" },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getUser()
    
    if (!user) {
      return NextResponse.json(
        { error: "未授权" },
        { status: 401 }
      )
    }

    const body = await req.json()

    const parsed = UpdateProfileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '请求参数校验失败', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { name, bio, avatarUrl, location } = parsed.data

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name ?? undefined,
        bio: bio ?? undefined,
        avatarUrl: avatarUrl ?? undefined,
        location: location ?? undefined,
      },
    })

    return NextResponse.json({
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      bio: updatedUser.bio,
      avatarUrl: updatedUser.avatarUrl,
      location: updatedUser.location,
    })
  } catch (error) {
    console.error("更新用户资料失败:", error)
    return NextResponse.json(
      { error: "更新用户资料失败" },
      { status: 500 }
    )
  }
}
