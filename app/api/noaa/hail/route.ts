import { NextRequest, NextResponse } from 'next/server'

// NOAA SWDI (Severe Weather Data Inventory) — Free, no auth
const SWDI_BASE = 'https://www.ncdc.noaa.gov/swdi/stormEvents'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const radiusMiles = parseFloat(searchParams.get('radius') || '25')
  const daysBack = parseInt(searchParams.get('days') || '365')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  try {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const url = `${SWDI_BASE}/geojson/hail/${fmt(startDate)}:${fmt(endDate)}?lat=${lat}&lon=${lng}&r=${radiusMiles}`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' },
    })

    if (!res.ok) return NextResponse.json([])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = (data.features || []).map((f: any) => ({
      lat: f.geometry?.coordinates?.[1],
      lng: f.geometry?.coordinates?.[0],
      size: f.properties?.HAILSIZE || null,
      date: f.properties?.EVENT_DATE || null,
      severity: f.properties?.HAILSIZE >= 2 ? 'severe' : f.properties?.HAILSIZE >= 1 ? 'moderate' : 'minor',
    }))

    return NextResponse.json(events)
  } catch {
    return NextResponse.json([])
  }
}
