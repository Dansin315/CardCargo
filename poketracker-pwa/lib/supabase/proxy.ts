import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/offline', '/sw.js']

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith('/icon-') ||
    pathname === '/manifest.webmanifest'
  )
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie))
  return to
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const claims = (data?.claims ?? null) as Record<string, unknown> | null
  const pathname = request.nextUrl.pathname
  const isApi = pathname.startsWith('/api/')
  const allowedEmail = process.env.ALLOWED_USER_EMAIL?.trim().toLowerCase()
  const claimEmail = typeof claims?.email === 'string' ? claims.email.toLowerCase() : null
  // Fail closed when the single-user allowlist is missing or does not match.
  const isAllowed = Boolean(allowedEmail && claimEmail === allowedEmail)

  if (!isApi && !isPublicPath(pathname) && (!claims || !isAllowed)) {
    const target = request.nextUrl.clone()
    target.pathname = '/login'
    target.searchParams.set('next', pathname)
    if (claims && !isAllowed) target.searchParams.set('error', 'not_allowed')
    return copyCookies(response, NextResponse.redirect(target))
  }

  if (
    pathname === '/login' &&
    claims &&
    isAllowed &&
    request.nextUrl.searchParams.get('error') !== 'not_owner'
  ) {
    const target = request.nextUrl.clone()
    target.pathname = '/'
    target.search = ''
    return copyCookies(response, NextResponse.redirect(target))
  }

  return response
}
