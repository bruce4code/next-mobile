import { BadRequestException, Body, Controller, Get, Put } from "@nestjs/common"
import { UpdateUserProfileSchema } from "@ai-arg/contracts"
import type { AuthenticatedUser } from "../auth/auth.types"
import { CurrentUser } from "../auth/current-user.decorator"
import { UsersService } from "./users.service"

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getProfile(user.id)
  }

  @Put("me")
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    let updates
    try {
      updates = UpdateUserProfileSchema.parse(body)
    } catch (error) {
      throw new BadRequestException({ error: "请求参数校验失败", details: error })
    }

    return this.users.updateProfile(user.id, updates)
  }
}
