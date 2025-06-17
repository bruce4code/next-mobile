import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPPORTED_LOCALES = ['en', 'zh']
const DEFAULT_LOCALE = 'en'

// Determine the best locale for the request based on Accept-Language header
function getPreferredLocale(request: NextRequest): string {
  const acceptLanguageHeader = request.headers.get('Accept-Language');
  if (acceptLanguageHeader) {
    const languages = acceptLanguageHeader.split(',').map(lang => lang.split(';')[0].trim().toLowerCase());
    for (const lang of languages) {
      if (SUPPORTED_LOCALES.includes(lang)) {
        return lang;
      }
      // Handle common variants like 'zh-cn'
      if (lang.startsWith('zh') && SUPPORTED_LOCALES.includes('zh')) {
        return 'zh';
      }
    }
  }
  return DEFAULT_LOCALE;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request }); // Initialize a mutable response object

  // 1. Internationalization Handling: Ensure a locale prefix in the URL
  const pathnameHasLocale = SUPPORTED_LOCALES.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  let currentLocale: string;

  if (!pathnameHasLocale) {
    // Determine the preferred locale
    currentLocale = getPreferredLocale(request);

    // Create a new URL with the locale prefix
    const urlWithLocale = request.nextUrl.clone();
    urlWithLocale.pathname = `/${currentLocale}${pathname === '/' ? '' : pathname}`;

    // Redirect the URL to include the locale prefix. This ensures `params.locale` is correctly populated.
    return NextResponse.redirect(urlWithLocale);
  } else {
    // Locale is already in the pathname, extract it
    currentLocale = pathname.split('/')[1];
  }

  // 2. Supabase Authentication Handling (Existing Logic Re-integrated)
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // Ensure the response object is updated with the new cookies
          response = NextResponse.next({ request }); // Create a new response to apply cookies
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const localizedLoginPath = `/${currentLocale}/login`;
  const isAuthCallbackPath = pathname.startsWith(`/${currentLocale}/auth/`);

  // Apply login protection
  if (!user && pathname !== localizedLoginPath && !isAuthCallbackPath) {
    const redirectUrl = request.nextUrl.clone(); // Clone the original request URL
    redirectUrl.pathname = localizedLoginPath;
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Match all paths except:
  // - API routes (`/api/`)
  // - Next.js internal paths (`/_next/`)
  // - Favicon (`/favicon.ico`)
  // - Our public locales folder (`/locales/`)
  // - Other public static files with extensions (e.g., .svg, .png)
  // - Supabase auth paths (`/auth/`) which are handled separately for login protection.
  matcher: [
    '/((?!api|_next|favicon.ico|locales|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)',
  ],
};

