import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { AuthenticatedUser } from "./auth.types"

@Injectable()
export class SupabaseAuthService {
  private readonly client: SupabaseClient

  constructor(config: ConfigService) {
    const url = config.get<string>("SUPABASE_URL")
    const anonKey = config.get<string>("SUPABASE_ANON_KEY")

    if (!url || !anonKey) {
      throw new ServiceUnavailableException("Supabase authentication is not configured")
    }

    this.client = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  async getUser(accessToken: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.client.auth.getUser(accessToken)
    if (error || !data.user) {
      throw new UnauthorizedException("Invalid or expired access token")
    }

    return {
      id: data.user.id,
      email: data.user.email,
    }
  }
}
