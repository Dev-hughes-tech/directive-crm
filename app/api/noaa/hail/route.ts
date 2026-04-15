import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { validateCoords } from '@/lib/validate'

export const maxDuration = 30

const SWDI = 'https://www.ncei.noaa.gov/swdiws/json'
const MESONET = 'https://mesonet.agron.iastate.edu/geojson/hail.php'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const coords = validateCoords(searchParams.get('lat'), searchParams.get('lng'))
  if (!coords.ok) return coords.response
  const { lat, lng } = coords
  const radiusMiles = parseFloat(searchParams.get('radius') || '25')
  const daysBack = parseInt(searchParams.get('days') || '3650')

  try {
    const fmtDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - daysBack)

    const startStr = fmtDate(start)
    const endStr = fmtDate(now)

    const headers = { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' }

    // Try Iowa State Mesonet first for radar hail (primary source)
    let radarHail: any[] = []
    try {
      const mesoRes = await fetch(`${MESONET}?lon=${lng}&lat=${lat}&radius=${radiusMiles}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      }).then(r => r.ok ? r.json() : null)

      if (mesoRes?.features && Array.isArray(mesoRes.features) && mesoRes.features.length > 0) {
        radarHail = mesoRes.features.map((feature: any) => ({
          lat: feature.geometry.coordinates[1],
          lng: feature.geometry.coordinates[0],
          size: feature.properties.magsize ? parseFloat(feature.properties.magsize) : null,
          date: feature.properties.valid || null,
          severity: (feature.properties.magsize && parseFloat(feature.properties.magsize) >= 2) ? 'severe' : (feature.properties.magsize && parseFloat(feature.properties.magsize) >= 1) ? 'moderate' : 'minor',
          source: 'radar',
          severeProb: feature.properties.sevprob ? parseInt(feature.properties.sevprob) : null,
        }))
      }
    } catch {
      // Mesonet failed, will fall back to NOAA
    }

    // Fetch from SWDI sources in parallel (spotter reports + fallback radar hail if Mesonet had no data)
    const [plsrRes, fallbackHailRes] = await Promise.allSettled([
      // Storm reports (spotter-confirmed hail, tornado, wind)
      fetch(`${SWDI}/plsr/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radiusMiles}`, { headers, signal: AbortSignal.timeout(15000) })
        .then(r => r.ok ? r.json() : { result: [] }),
      // Radar-detected hail (fallback if Mesonet empty)
      radarHail.length === 0
        ? fetch(`${SWDI}/nx3hail/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radiusMiles}`, { headers, signal: AbortSignal.timeout(15000) })
          .then(r => r.ok ? r.json() : { result: [] })
        : Promise.resolve({ result: [] }),
    ])

    const plsrData = plsrRes.status === 'fulfilled' ? (plsrRes.value.result || []) : []
    const fallbackData = fallbackHailRes.status === 'fulfilled' ? (fallbackHailRes.value.result || []) : []

    // Use fallback NOAA hail data only if Mesonet had no results
    if (radarHail.length === 0) {
      radarHail = fallbackData.map((e: any) => ({
        lat: e.LAT,
        lng: e.LON,
        size: e.MAXSIZE ? parseFloat(e.MAXSIZE) : null,
        date: e.ZTIME || null,
        severity: (e.MAXSIZE && parseFloat(e.MAXSIZE) >= 2) ? 'severe' : (e.MAXSIZE && parseFloat(e.MAXSIZE) >= 1) ? 'moderate' : 'minor',
        source: 'radar',
        severeProb: e.SEVPROB ? parseInt(e.SEVPROB) : null,
      }))
    }

    const hailData = radarHail

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

    // Combine and sort by date descending (radarHail already processed above)
    const allEvents = [...plsrHail, ...hailData].sort((a, b) =>
      (b.date || '').localeCompare(a.date || '')
    )

    return NextResponse.json(allEvents, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' }, // 1 hr fresh, 24 hr stale-ok (historical data)
    })
  } catch {
    return NextResponse.json([])
  }
}
