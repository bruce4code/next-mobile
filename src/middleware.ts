import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPPORTED_LOCALES = ['en', 'zh']
const DEFAULT_LOCALE = 'en'

function extractLocale(pathname: string): string {
  const firstSegment = pathname.split('/')[1]
  if (SUPPORTED_LOCALES.includes(firstSegment)) {
    return firstSegment
  }
  return DEFAULT_LOCALE
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  console.log('supabaseResponse', supabaseResponse)

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPath =
    /^\/(en|zh)\/login\/?$/.test(request.nextUrl.pathname) ||
    request.nextUrl.pathname === '/login';

  // 自动修正 /login 跳转到 /en/login
  if (request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = `/${DEFAULT_LOCALE}/login`
    return NextResponse.redirect(url)
  }

  // 登录保护
  if (!user && !isLoginPath && !request.nextUrl.pathname.startsWith('/auth')) {
    const locale = extractLocale(request.nextUrl.pathname) || DEFAULT_LOCALE
    const url = request.nextUrl.clone()
    url.pathname = `/${locale}/login`
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!api/register|_next/static|_next/image|favicon.ico|locales|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)',
  ],
}

