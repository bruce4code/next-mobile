import { Injectable, NotFoundException } from "@nestjs/common"
import type { UpdateUserProfile } from "@ai-arg/contracts"
import { PrismaService } from "../database/prisma.service"

// Mirrors web GET /api/user. Kept as a named constant so the GET and PUT
// selections cannot drift apart.
const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  bio: true,
  avatarUrl: true,
  location: true,
  createdAt: true,
} as const

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    })

    if (!user) {
      throw new NotFoundException({ error: "用户不存在" })
    }

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
    }
  }

  async updateProfile(userId: string, updates: UpdateUserProfile) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: updates.name ?? undefined,
        bio: updates.bio ?? undefined,
        avatarUrl: updates.avatarUrl ?? undefined,
        location: updates.location ?? undefined,
      },
      select: PROFILE_SELECT,
    })

    // web's PUT response omits createdAt; match it rather than returning more.
    const { createdAt: _createdAt, ...profile } = user
    return profile
  }
}
