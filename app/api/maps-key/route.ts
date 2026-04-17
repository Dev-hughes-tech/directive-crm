import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireTier } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const tierDenied = requireTier(auth, 'maps')
  if (tierDenied) return tierDenied

  const key = process.env.NEXT_PUBLIC_MAPS_API_KEY || process.env.MAPS_API_KEY || null

  return NextResponse.json({ key }, {
    headers: { 'Cache-Control': 'no-store, private' }
  })
}
