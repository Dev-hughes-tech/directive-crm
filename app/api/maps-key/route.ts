import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireTier } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const tierDenied = requireTier(auth, 'maps')
  if (tierDenied) return tierDenied

  // Do not return raw API key. Return empty response with no-store headers.
  return NextResponse.json({ token: null }, {
    headers: { 'Cache-Control': 'no-store, private' }
  })
}
