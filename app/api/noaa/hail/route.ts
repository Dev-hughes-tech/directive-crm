import { NextRequest, NextResponse } from 'next/server'

// NOAA SWDI (Severe Weather Data Inventory) — Free, no auth
const SWDI_BASE = 'https://www.ncei.noaa.gov/swdiws/json/stormevents'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const radiusMiles = parseFloat(searchParams.get('radius') || '25')
  const daysBack = parseInt(searchParams.get('days') || '3650') // Default 10 years

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  try {
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    // For requests > 365 days, fetch in 2-year chunks in parallel
    if (daysBack > 365) {
      const chunks: Array<{ start: string; end: string }> = []
      const now = new Date()

      for (let i = 0; i < daysBack / 365; i += 2) {
        const endDate = new Date(now)
        endDate.setFullYear(endDate.getFullYear() - i)
        const startDate = new Date(now)
        startDate.setFullYear(startDate.getFullYear() - (i + 2))
        chunks.push({
          start: fmt(startDate),
          end: fmt(endDate),
        })
      }

      const results = await Promise.allSettled(
        chunks.map((chunk) =>
          fetch(
            `${SWDI_BASE}/${chunk.start}:${chunk.end}?lat=${lat}&lon=${lng}&r=${radiusMiles}`,
            {
              headers: { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' },
            }
          )
            .then((r) => (r.ok ? r.json() : { result: [] }))
            .catch(() => ({ result: [] }))
        )
      )

      // Flatten all results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEvents: any[] = []
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.result) {
          allEvents.push(...result.value.result)
        }
      })

      // Filter for hail events only
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hailEvents = allEvents.filter((e: any) => e.EVENT_TYPE === 'Hail')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = hailEvents.map((e: any) => ({
        lat: e.BEGIN_LAT,
        lng: e.BEGIN_LON,
        size: e.MAGNITUDE ? parseFloat(e.MAGNITUDE) : null,
        date: e.BEGIN_DATE_TIME || null,
        severity: (e.MAGNITUDE && parseFloat(e.MAGNITUDE) >= 2) ? 'severe' : (e.MAGNITUDE && parseFloat(e.MAGNITUDE) >= 1) ? 'moderate' : 'minor',
      }))

      return NextResponse.json(events)
    } else {
      // For <= 1 year, fetch normally
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - daysBack)

      const url = `${SWDI_BASE}/${fmt(startDate)}:${fmt(endDate)}?lat=${lat}&lon=${lng}&r=${radiusMiles}`

      const res = await fetch(url, {
        headers: { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' },
      })

      if (!res.ok) return NextResponse.json([])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()

      // Filter for hail events only
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hailEvents = (data.result || []).filter((e: any) => e.EVENT_TYPE === 'Hail')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events = hailEvents.map((e: any) => ({
        lat: e.BEGIN_LAT,
        lng: e.BEGIN_LON,
        size: e.MAGNITUDE ? parseFloat(e.MAGNITUDE) : null,
        date: e.BEGIN_DATE_TIME || null,
        severity: (e.MAGNITUDE && parseFloat(e.MAGNITUDE) >= 2) ? 'severe' : (e.MAGNITUDE && parseFloat(e.MAGNITUDE) >= 1) ? 'moderate' : 'minor',
      }))

      return NextResponse.json(events)
    }
  } catch {
    return NextResponse.json([])
  }
}
