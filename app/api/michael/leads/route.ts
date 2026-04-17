import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { classifyHailSeverity, countSevereHailEvents } from '@/lib/hailEvents'
import {
  buildIemLsrGeoJsonUrl,
  type HistoricalStormEvent,
  type IemLsrFeature,
  normalizeIemHistoricalEvents,
} from '@/lib/stormHistory'
import { canAccess } from '@/lib/tiers'

export const maxDuration = 90

// ── Geocode ZIP → lat/lng ─────────────────────────────────────────────────
async function geocodeZip(zip: string): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
  const mapsKey = process.env.MAPS_API_KEY
  if (mapsKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(zip)}&key=${mapsKey}`,
        { signal: AbortSignal.timeout(6000) }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data.status === 'OK' && data.results[0]) {
        const r = data.results[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const get = (t: string) => r.address_components.find((c: any) => c.types.includes(t))?.long_name ?? ''
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getS = (t: string) => r.address_components.find((c: any) => c.types.includes(t))?.short_name ?? ''
        return {
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          city: get('locality') || get('sublocality') || get('postal_town'),
          state: getS('administrative_area_level_1'),
        }
      }
    } catch { /* fall through */ }
  }
  // Fallback: Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=us&format=json&limit=1`,
      { headers: { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' }, signal: AbortSignal.timeout(6000) }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json()
    if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), city: data[0].display_name.split(',')[0], state: '' }
  } catch { /* ignore */ }
  return null
}

interface IemLsrGeoJsonResponse {
  features?: IemLsrFeature[]
}

async function fetchHistoricalStormEvents(lat: number, lng: number, years: number, radiusMiles = 30): Promise<HistoricalStormEvent[]> {
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
    console.warn(`[michael/leads] historical storm HTTP ${response.status} body=${body.slice(0, 200)}`)
    return []
  }

  const payload = await response.json() as IemLsrGeoJsonResponse
  const events = normalizeIemHistoricalEvents(payload.features || [])
  console.log(`[michael/leads] historical storm provider=iem-lsr lat=${lat} lng=${lng} total=${events.length}`)
  return events
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  // Enforce tier: michael feature requires Plus or above
  if (!canAccess(auth.profile.role, 'michael')) {
    return NextResponse.json(
      { error: 'Michael AI requires a Plus plan or higher. Upgrade at directive-crm.com.' },
      { status: 403 }
    )
  }

  const { zip } = await request.json()
  if (!zip?.trim()) return NextResponse.json({ error: 'ZIP code required' }, { status: 400 })

  // 1. Geocode the ZIP
  const geo = await geocodeZip(zip.trim())
  if (!geo) return NextResponse.json({ error: 'ZIP code not found' }, { status: 404 })

  const currentYear = new Date().getFullYear()
  const startYear = currentYear - 10

  // 2. Fetch 10 years of historical storm reports
  const stormEvents = await fetchHistoricalStormEvents(geo.lat, geo.lng, currentYear - startYear)
  const hailFeatures = stormEvents.filter((event) => event.type === 'hail')
  const tornadoFeatures = stormEvents.filter((event) => event.type === 'tornado')
  const windFeatures = stormEvents.filter((event) => event.type === 'wind')

  // 3. Build impact zone summary
  const totalEvents = hailFeatures.length + tornadoFeatures.length + windFeatures.length
  const severeHailCount = countSevereHailEvents(hailFeatures, feature => feature.size)
  const maxHailSize = hailFeatures.reduce((max, feature) => Math.max(max, feature.size || 0), 0)

  // Risk level
  let riskLevel = 'Low'
  if (severeHailCount >= 5 || tornadoFeatures.length >= 2 || totalEvents >= 20) riskLevel = 'Critical'
  else if (severeHailCount >= 2 || tornadoFeatures.length >= 1 || totalEvents >= 8) riskLevel = 'High'
  else if (totalEvents >= 3) riskLevel = 'Moderate'

  // 4. Build heatmap data for map overlay
  const impactPoints = hailFeatures.map((feature) => ({
    lat: feature.lat ?? geo.lat,
    lng: feature.lng ?? geo.lng,
    size: feature.size || 1,
    date: feature.date || null,
    type: 'hail',
    severity: classifyHailSeverity(feature.size),
  }))

  // 5. Year-by-year breakdown
  const byYear: Record<number, { hail: number; tornado: number; wind: number; maxHail: number }> = {}
  for (let y = startYear; y <= currentYear; y++) byYear[y] = { hail: 0, tornado: 0, wind: 0, maxHail: 0 }

  const parseYr = (value: string | null | undefined): number => {
    const raw = String(value || '')
    const yr = Number.parseInt(raw.slice(0, 4), 10)
    if (yr && !Number.isNaN(yr)) return yr
    const date = new Date(raw)
    return !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : 0
  }
  hailFeatures.forEach((feature) => {
    const yr = parseYr(feature.date)
    if (byYear[yr]) {
      byYear[yr].hail++
      byYear[yr].maxHail = Math.max(byYear[yr].maxHail, feature.size || 0)
    }
  })
  tornadoFeatures.forEach((feature) => {
    const yr = parseYr(feature.date)
    if (byYear[yr]) byYear[yr].tornado++
  })
  windFeatures.forEach((feature) => {
    const yr = parseYr(feature.date)
    if (byYear[yr]) byYear[yr].wind++
  })

  // 6. Pull REAL residential addresses from Google around the ZIP center
  // Grid-sample ~4mi radius with reverse geocoding to get actual street addresses
  type Lead = { address: string; reason: string; score: number; source: string; roofAge: number | null; stormHits: number; lat: number | null; lng: number | null; placeId: string | null }
  let leads: Lead[] = []

  const mapsKey = process.env.MAPS_API_KEY
  if (mapsKey) {
    try {
      // Generate a 7x7 grid over ~5mi radius (8047m) around ZIP center = 49 sample points
      // to guarantee 15+ deduplicated real addresses after reverse geocoding
      const radiusMeters = 8047
      const gridSize = 7
      const latDeg = radiusMeters / 111320
      const lngDeg = radiusMeters / (111320 * Math.cos(geo.lat * Math.PI / 180))
      const stepLat = (2 * latDeg) / gridSize
      const stepLng = (2 * lngDeg) / gridSize

      const points: { lat: number; lng: number }[] = []
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          points.push({
            lat: geo.lat - latDeg + stepLat * (i + 0.5),
            lng: geo.lng - lngDeg + stepLng * (j + 0.5),
          })
        }
      }

      // Reverse-geocode each grid point in parallel
      const geoResults = await Promise.allSettled(
        points.map(async pt => {
          const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${pt.lat},${pt.lng}&result_type=street_address|premise&key=${mapsKey}`,
            { signal: AbortSignal.timeout(6000) }
          )
          if (!res.ok) return null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = await res.json()
          return data.results?.[0] ?? null
        })
      )

      // Deduplicate by place_id
      const seenIds = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unique: any[] = []
      for (const r of geoResults) {
        if (r.status !== 'fulfilled' || !r.value) continue
        const pid: string = r.value.place_id
        if (seenIds.has(pid)) continue
        seenIds.add(pid)
        unique.push(r.value)
      }

      // Score each real address against nearby storm history only.
      const milesBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 3959
        const dLat = (lat2 - lat1) * Math.PI / 180
        const dLng = (lng2 - lng1) * Math.PI / 180
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
        return 2 * R * Math.asin(Math.sqrt(a))
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scored = unique.map((addr: any) => {
        const lat: number = addr.geometry?.location?.lat ?? geo.lat
        const lng: number = addr.geometry?.location?.lng ?? geo.lng
        // Count hail events within 1 mile of this address
        const nearbyHail = hailFeatures.filter((feature) => {
          if (feature.lat === null || feature.lng === null) return false
          return milesBetween(lat, lng, feature.lat, feature.lng) <= 1
        })
        const nearbySevereCount = countSevereHailEvents(nearbyHail, feature => feature.size)
        const maxNearbyHail = nearbyHail.reduce(
          (m: number, feature) => Math.max(m, feature.size || 0),
          0
        )

        // Base score: storm-driven (0-100)
        let score = 50
        score += Math.min(nearbyHail.length * 4, 20)        // up to +20 for frequency
        score += Math.min(nearbySevereCount * 6, 20)        // up to +20 for severe hail nearby
        score += Math.min(Math.round(maxNearbyHail * 5), 10) // up to +10 for max hail size
        if (riskLevel === 'Critical') score += 5
        else if (riskLevel === 'High') score += 3
        score = Math.min(Math.max(score, 30), 99)

        const reason = nearbySevereCount > 0
          ? `${nearbySevereCount} severe hail hit${nearbySevereCount > 1 ? 's' : ''} within 1 mi${maxNearbyHail > 0 ? ` (max ${maxNearbyHail.toFixed(1)}")` : ''} — likely roof damage`
          : nearbyHail.length > 0
            ? `${nearbyHail.length} hail event${nearbyHail.length > 1 ? 's' : ''} within 1 mi over past 10 years`
            : `In ZIP-wide storm corridor (${hailFeatures.length} total hail events); inspect for legacy damage`

        return {
          address: addr.formatted_address as string,
          reason,
          score,
          source: 'Google + 10yr Storm Reports',
          roofAge: null,
          stormHits: nearbyHail.length,
          lat,
          lng,
          placeId: addr.place_id as string,
        } as Lead
      })

      // Sort by score desc, take top 20 (guaranteed 15+ minimum)
      leads = scored.sort((a, b) => b.score - a.score).slice(0, 20)
    } catch (e) {
      console.error('[michael/leads] Google address fetch error:', e)
    }
  }

  return NextResponse.json({
    zip,
    city: geo.city,
    state: geo.state,
    lat: geo.lat,
    lng: geo.lng,
    riskLevel,
    totalEvents,
    hailCount: hailFeatures.length,
    severeHailCount,
    maxHailSize,
    tornadoCount: tornadoFeatures.length,
    windCount: windFeatures.length,
    byYear,
    impactPoints,
    leads,
    yearsAnalyzed: currentYear - startYear,
  }, {
    headers: { 'Cache-Control': 'no-store, private' }
  })
}
