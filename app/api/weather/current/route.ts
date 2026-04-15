import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWeather } from '@/lib/weather'
import { requireUser } from '@/lib/apiAuth'
import { validateCoords } from '@/lib/validate'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const coords = validateCoords(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.ok) return coords.response
  const { lat, lng } = coords

  const data = await getCurrentWeather(lat, lng)
  if (!data) return NextResponse.json({ error: 'Weather data unavailable' }, { status: 502 })

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }, // 5 min fresh, 10 min stale-ok
  })
}
