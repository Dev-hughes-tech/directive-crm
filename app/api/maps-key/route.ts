import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const key = process.env.MAPS_API_KEY || process.env.NEXT_PUBLIC_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
  if (!key) return NextResponse.json({ key: '' }, { status: 200 })
  return NextResponse.json({ key })
}
