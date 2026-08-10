import { Controller, Get } from "@nestjs/common"
import { CurrentUser } from "./current-user.decorator"
import type { AuthenticatedUser } from "./auth.types"

@Controller("auth")
export class AuthController {
  @Get("me")
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user
  }
}
