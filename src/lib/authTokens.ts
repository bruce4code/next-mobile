import type { Session } from "@supabase/supabase-js"

const ACCESS_TOKEN_KEY = "token"
const REFRESH_TOKEN_KEY = "refresh_token"

export function persistAuthTokens(session: Session | null) {
  if (typeof window === "undefined") {
    return
  }

  if (session?.access_token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token)
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  }

  if (session?.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token)
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }
}
