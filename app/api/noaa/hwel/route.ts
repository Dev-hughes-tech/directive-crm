import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireTier } from '@/lib/apiAuth'
import {
  buildIemLsrGeoJsonUrl,
  type IemLsrFeature,
  normalizeIemHistoricalEvents,
  summarizeHistoricalEvents,
} from '@/lib/stormHistory'
import { validateCoords } from '@/lib/validate'

export const maxDuration = 45

interface IemLsrGeoJsonResponse {
  features?: IemLsrFeature[]
}

// Historical Weather Event Library (HWEL) — historical storm reports for StormScope.
export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response
  const tierDenied = requireTier(auth, 'stormscope')
  if (tierDenied) return tierDenied

  const { searchParams } = new URL(request.url)
  const coords = validateCoords(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.ok) return coords.response
  const { lat, lng } = coords
  const radiusMiles = Number.parseFloat(searchParams.get('radius') || '30')
  const years = Number.parseInt(searchParams.get('years') || '10', 10)

  try {
    const now = new Date()
    const start = new Date(now)
    start.setFullYear(start.getFullYear() - years)

    const url = buildIemLsrGeoJsonUrl({ lat, lng, radiusMiles, start, end: now })
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' },
      signal: AbortSignal.timeout(25000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn(`[noaa/hwel] IEM LSR HTTP ${response.status} body=${body.slice(0, 200)}`)
      return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 })
    }

    const payload = await response.json() as IemLsrGeoJsonResponse
    const normalizedEvents = normalizeIemHistoricalEvents(payload.features || [])
    const historical = summarizeHistoricalEvents(normalizedEvents, { years, radiusMiles })

    console.log('[noaa/hwel]', JSON.stringify({
      lat,
      lng,
      radiusMiles,
      years,
      provider: 'iem-lsr',
      total: historical.summary.totalEvents,
      hail: historical.summary.hailEvents,
      tornado: historical.summary.tornadoEvents,
      wind: historical.summary.windEvents,
    }))

    return NextResponse.json({
      summary: historical.summary,
      yearSummary: historical.yearSummary,
      events: historical.events.slice(0, 200),
    }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch (error) {
    console.error('[noaa/hwel] fatal error:', error)
    return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 })
  }
}
