import { NextRequest, NextResponse } from 'next/server'
import { getForecast } from '@/lib/weather'
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

  const data = await getForecast(lat, lng)
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200' }, // 10 min fresh
  })
}
