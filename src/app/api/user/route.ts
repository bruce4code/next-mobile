import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getUser } from "@/app/auth/server"

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
    const { name, bio, avatarUrl, location } = body

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
