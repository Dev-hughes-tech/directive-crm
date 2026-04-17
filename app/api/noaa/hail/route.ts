import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireTier } from '@/lib/apiAuth'
import {
  buildIemLsrGeoJsonUrl,
  type IemLsrFeature,
  normalizeIemHistoricalEvents,
} from '@/lib/stormHistory'
import { validateCoords } from '@/lib/validate'

export const maxDuration = 45

interface IemLsrGeoJsonResponse {
  features?: IemLsrFeature[]
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response
  const tierDenied = requireTier(auth, 'stormscope')
  if (tierDenied) return tierDenied

  const { searchParams } = new URL(request.url)
  const coords = validateCoords(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.ok) return coords.response
  const { lat, lng } = coords
  const radiusMiles = Number.parseFloat(searchParams.get('radius') || '25')
  const daysBack = Number.parseInt(searchParams.get('days') || '3650', 10)

  try {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - daysBack)

    const url = buildIemLsrGeoJsonUrl({ lat, lng, radiusMiles, start, end: now })
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' },
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn(`[noaa/hail] IEM LSR HTTP ${response.status} body=${body.slice(0, 200)}`)
      return NextResponse.json([])
    }

    const payload = await response.json() as IemLsrGeoJsonResponse
    const hailEvents = normalizeIemHistoricalEvents(payload.features || [])
      .filter((event) => event.type === 'hail')
      .map((event) => ({
        lat: event.lat,
        lng: event.lng,
        size: event.size,
        date: event.date,
        severity: event.severity || 'unknown',
        source: 'spotter' as const,
        provider: event.provider,
        city: event.city,
        state: event.state,
      }))

    console.log('[noaa/hail]', JSON.stringify({
      lat,
      lng,
      radiusMiles,
      daysBack,
      provider: 'iem-lsr',
      total: hailEvents.length,
    }))

    return NextResponse.json(hailEvents, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch (error) {
    console.error('[noaa/hail] fatal error:', error)
    return NextResponse.json([])
  }
}
