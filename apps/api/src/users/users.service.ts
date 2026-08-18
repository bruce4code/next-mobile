import { Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../database/prisma.service"

interface ProfileUpdate {
  name?: string
  avatarUrl?: string
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    if (!user) {
      throw new NotFoundException({ error: "用户不存在" })
    }

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
    }
  }

  async updateProfile(userId: string, updates: ProfileUpdate) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updates,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
