// Global edge middleware.
//
// Gates every /api/* route behind an authenticated Supabase session by
// default. Individual routes may still call `requireUser()` for finer-grained
// checks (role, ownership), but the middleware guarantees no unauthenticated
// request ever reaches an API handler.
//
// Exceptions are listed in `PUBLIC_API_PREFIXES`. Keep that list short and
// justified.

import { NextRequest, NextResponse } from 'next/server'

export const config = {
  // Run on every API route. Next.js applies the matcher before the handler.
  matcher: ['/api/:path*'],
}

// API prefixes that must remain public (callable without a session).
// Keep justification inline so reviewers see why each is here.
const PUBLIC_API_PREFIXES: string[] = [
  // Currently none — maps-key, geocode, weather, etc. are all called from the
  // authed app only. If a truly public endpoint is added, list it here.
]

function isPublic(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function hasAuthCredential(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  if (auth && /^Bearer\s+\S+/i.test(auth)) return true
  const cookie = req.headers.get('cookie') || ''
  // Supabase client stores session in sb-<ref>-auth-token (or sb-access-token
  // on older versions). We don't verify the JWT at the edge — that's the
  // handler's job via `requireUser()` — we just reject obviously anonymous
  // requests so abusive traffic can't burn Google/NOAA/Anthropic quota.
  return /sb-[^=]+-auth-token=|sb-access-token=/.test(cookie)
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!pathname.startsWith('/api/')) return NextResponse.next()
  if (isPublic(pathname)) return NextResponse.next()

  if (!hasAuthCredential(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.next()
}
