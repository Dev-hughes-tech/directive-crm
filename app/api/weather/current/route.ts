import { NextRequest, NextResponse } from 'next/server'
import { getCurrentWeather } from '@/lib/weather'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const data = await getCurrentWeather(lat, lng)
  if (!data) return NextResponse.json({ error: 'Weather data unavailable' }, { status: 502 })

  return NextResponse.json(data)
}
