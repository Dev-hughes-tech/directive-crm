import { NextRequest, NextResponse } from 'next/server'
import { getAlerts } from '@/lib/weather'
import { requireUser } from '@/lib/apiAuth'
import { validateCoords } from '@/lib/validate'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const coords = validateCoords(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.ok) return coords.response
  const { lat, lng } = coords

  const data = await getAlerts(lat, lng)
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' }, // 2 min fresh (alerts change faster)
  })
}
