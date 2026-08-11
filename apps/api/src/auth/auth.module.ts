import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { AuthController } from "./auth.controller"
import { SupabaseAuthGuard } from "./supabase-auth.guard"
import { SupabaseAuthService } from "./supabase-auth.service"

@Module({
  controllers: [AuthController],
  providers: [
    SupabaseAuthService,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
})
export class AuthModule {}
