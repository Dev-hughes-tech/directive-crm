import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export const maxDuration = 30

const SWDI = 'https://www.ncei.noaa.gov/swdiws/json'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const radiusMiles = parseFloat(searchParams.get('radius') || '25')
  const daysBack = parseInt(searchParams.get('days') || '3650')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  try {
    const fmtDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - daysBack)

    const startStr = fmtDate(start)
    const endStr = fmtDate(now)

    const headers = { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' }

    // Fetch from multiple SWDI sources in parallel
    const [plsrRes, hailRes] = await Promise.allSettled([
      // Storm reports (spotter-confirmed hail, tornado, wind)
      fetch(`${SWDI}/plsr/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radiusMiles}`, { headers, signal: AbortSignal.timeout(15000) })
        .then(r => r.ok ? r.json() : { result: [] }),
      // Radar-detected hail
      fetch(`${SWDI}/nx3hail/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radiusMiles}`, { headers, signal: AbortSignal.timeout(15000) })
        .then(r => r.ok ? r.json() : { result: [] }),
    ])

    const plsrData = plsrRes.status === 'fulfilled' ? (plsrRes.value.result || []) : []
    const hailData = hailRes.status === 'fulfilled' ? (hailRes.value.result || []) : []

    // Filter plsr for hail reports (TYPECODE 'H')
    const plsrHail = plsrData
      .filter((e: any) => e.TYPECODE === 'H')
      .map((e: any) => ({
        lat: e.LAT,
        lng: e.LON,
        size: e.MAGNITUDE ? parseFloat(e.MAGNITUDE) : null,
        date: e.ZTIME || null,
        severity: (e.MAGNITUDE && parseFloat(e.MAGNITUDE) >= 2) ? 'severe' : (e.MAGNITUDE && parseFloat(e.MAGNITUDE) >= 1) ? 'moderate' : 'minor',
        source: 'spotter',
        city: e.CITY || null,
        state: e.STATE || null,
      }))

    // Map radar hail detections
    const radarHail = hailData.map((e: any) => ({
      lat: e.LAT,
      lng: e.LON,
      size: e.MAXSIZE ? parseFloat(e.MAXSIZE) : null,
      date: e.ZTIME || null,
      severity: (e.MAXSIZE && parseFloat(e.MAXSIZE) >= 2) ? 'severe' : (e.MAXSIZE && parseFloat(e.MAXSIZE) >= 1) ? 'moderate' : 'minor',
      source: 'radar',
      severeProb: e.SEVPROB ? parseInt(e.SEVPROB) : null,
    }))

    // Combine and sort by date descending
    const allEvents = [...plsrHail, ...radarHail].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    )

    return NextResponse.json(allEvents, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }, // 1 hr fresh, 24 hr stale-ok (historical data)
    })
  } catch {
    return NextResponse.json([])
  }
}
