import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { AuthenticatedUser } from "./auth.types"
import { IS_PUBLIC_KEY } from "./public.decorator"
import { SupabaseAuthService } from "./supabase-auth.service"

type RequestWithUser = {
  headers: {
    authorization?: string
  }
  user?: AuthenticatedUser
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: SupabaseAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<RequestWithUser>()
    const token = this.getBearerToken(request.headers.authorization)
    request.user = await this.auth.getUser(token)
    return true
  }

  private getBearerToken(authorization?: string): string {
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("A bearer token is required")
    }

    const token = authorization.slice("Bearer ".length).trim()
    if (!token) {
      throw new UnauthorizedException("A bearer token is required")
    }

    return token
  }
}
