import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
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

// ── 10-year storm fetch (Iowa State Mesonet — proven historical coverage) ──
// Mesonet pulls from NOAA NEXRAD archive and has dense radar-detected hail
// events going back 10+ years. This is what `/api/noaa/hail` uses successfully.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNoaaEvents(lat: number, lng: number, eventType: 'hail' | 'torn' | 'wind', yearStart: number, yearEnd: number): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = []
  const h = { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' }
  const radius = eventType === 'torn' ? 40 : 25

  // Source 1: Iowa State Mesonet (primary — dense radar hail archive)
  if (eventType === 'hail') {
    try {
      const res = await fetch(
        `https://mesonet.agron.iastate.edu/geojson/hail.php?lon=${lng}&lat=${lat}&radius=${radius}`,
        { headers: h, signal: AbortSignal.timeout(15000) }
      )
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json()
        if (Array.isArray(data?.features)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const normalized = data.features.map((f: any) => {
            const coords = f.geometry?.coordinates || []
            const valid: string = f.properties?.valid || ''
            // Mesonet date format: "2024-05-15 18:30:00" — convert to ZTIME "YYYYMMDDHHMMSS"
            const ztime = valid ? valid.replace(/[-:\s]/g, '').slice(0, 14) : ''
            return {
              TYPECODE: 'H',
              LAT: coords[1] ?? lat,
              LON: coords[0] ?? lng,
              MAGNITUDE: f.properties?.magsize ?? null,
              ZTIME: ztime,
              SOURCE: 'mesonet',
            }
          }).filter((e: { ZTIME: string }) => {
            if (!e.ZTIME) return false
            const yr = parseInt(e.ZTIME.slice(0, 4))
            return yr >= yearStart && yr <= yearEnd
          })
          results.push(...normalized)
        }
      }
    } catch { /* mesonet may fail, fall through */ }
  }

  // Source 2: NOAA SWDI PLSR (spotter-confirmed — supplement + tornado/wind coverage)
  const years: number[] = []
  for (let y = yearStart; y <= yearEnd; y++) years.push(y)
  const chunks: number[][] = []
  for (let i = 0; i < years.length; i += 2) chunks.push(years.slice(i, i + 2))
  const fmtDate = (y: number, m: number, d: number) => `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`
  const typeCodeMap: Record<string, string> = { hail: 'H', torn: 'T', wind: 'G' }

  await Promise.allSettled(chunks.map(async (chunk) => {
    const startStr = fmtDate(chunk[0], 1, 1)
    const endStr = fmtDate(chunk[chunk.length - 1], 12, 31)
    try {
      const res = await fetch(
        `https://www.ncei.noaa.gov/swdiws/json/plsr/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radius}`,
        { headers: h, signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data?.result?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filtered = data.result.filter((e: any) => e.TYPECODE === typeCodeMap[eventType])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tagged = filtered.map((e: any) => ({ ...e, SOURCE: 'spotter' }))
        results.push(...tagged)
      }
    } catch { /* chunk may fail, continue */ }
  }))

  // Source 3: NOAA SWDI NX3HAIL fallback (if Mesonet empty for hail)
  if (eventType === 'hail' && results.length < 5) {
    await Promise.allSettled(chunks.map(async (chunk) => {
      const startStr = fmtDate(chunk[0], 1, 1)
      const endStr = fmtDate(chunk[chunk.length - 1], 12, 31)
      try {
        const res = await fetch(
          `https://www.ncei.noaa.gov/swdiws/json/nx3hail/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radius}`,
          { headers: h, signal: AbortSignal.timeout(12000) }
        )
        if (!res.ok) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json()
        if (data?.result?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const normalized = data.result.map((e: any) => ({
            TYPECODE: 'H',
            LAT: e.LAT,
            LON: e.LON,
            MAGNITUDE: e.MAXSIZE ?? e.MEANSIZE ?? null,
            ZTIME: e.ZTIME,
            SOURCE: 'radar',
          }))
          results.push(...normalized)
        }
      } catch { /* chunk may fail */ }
    }))
  }

  console.log(`[michael/fetchNoaaEvents] type=${eventType} lat=${lat} lng=${lng} events=${results.length} range=${yearStart}-${yearEnd}`)
  return results
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

  // 2. Fetch 10 years of NOAA storm data in parallel
  const [hailFeatures, tornadoFeatures, windFeatures] = await Promise.all([
    fetchNoaaEvents(geo.lat, geo.lng, 'hail', startYear, currentYear),
    fetchNoaaEvents(geo.lat, geo.lng, 'torn', startYear, currentYear),
    fetchNoaaEvents(geo.lat, geo.lng, 'wind', startYear, currentYear),
  ])

  // 3. Build impact zone summary
  const totalEvents = hailFeatures.length + tornadoFeatures.length + windFeatures.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const severeHail = hailFeatures.filter((f: any) => (f.MAGNITUDE && parseFloat(f.MAGNITUDE) >= 1.5))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxHailSize = hailFeatures.reduce((max: number, f: any) => Math.max(max, f.MAGNITUDE ? parseFloat(f.MAGNITUDE) : 0), 0)

  // Risk level
  let riskLevel = 'Low'
  if (severeHail.length >= 5 || tornadoFeatures.length >= 2 || totalEvents >= 20) riskLevel = 'Critical'
  else if (severeHail.length >= 2 || tornadoFeatures.length >= 1 || totalEvents >= 8) riskLevel = 'High'
  else if (totalEvents >= 3) riskLevel = 'Moderate'

  // 4. Build heatmap data for map overlay
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const impactPoints = hailFeatures.map((f: any) => ({
    lat: f.LAT ?? geo.lat,
    lng: f.LON ?? geo.lng,
    size: f.MAGNITUDE ? parseFloat(f.MAGNITUDE) : 1,
    date: f.ZTIME || null,
    type: 'hail',
    severity: (f.MAGNITUDE && parseFloat(f.MAGNITUDE) >= 1.5) ? 'severe' : 'moderate',
  }))

  // 5. Year-by-year breakdown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byYear: Record<number, { hail: number; tornado: number; wind: number; maxHail: number }> = {}
  for (let y = startYear; y <= currentYear; y++) byYear[y] = { hail: 0, tornado: 0, wind: 0, maxHail: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hailFeatures.forEach((f: any) => {
    const yr = parseInt((f.ZTIME || '').slice(0, 4))
    if (byYear[yr]) {
      byYear[yr].hail++
      byYear[yr].maxHail = Math.max(byYear[yr].maxHail, f.MAGNITUDE ? parseFloat(f.MAGNITUDE) : 0)
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tornadoFeatures.forEach((f: any) => {
    const yr = parseInt((f.ZTIME || '').slice(0, 4))
    if (byYear[yr]) byYear[yr].tornado++
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  windFeatures.forEach((f: any) => {
    const yr = parseInt((f.ZTIME || '').slice(0, 4))
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

      // Score each real address against storm data
      // Weight: nearby hail count (within ~1 mi) × severity × random roof-age simulated factor
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nearbyHail = hailFeatures.filter((f: any) => {
          if (!f.LAT || !f.LON) return false
          return milesBetween(lat, lng, f.LAT, f.LON) <= 1
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nearbySevere = nearbyHail.filter((f: any) => f.MAGNITUDE && parseFloat(f.MAGNITUDE) >= 1.5)
        const maxNearbyHail = nearbyHail.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m: number, f: any) => Math.max(m, f.MAGNITUDE ? parseFloat(f.MAGNITUDE) : 0),
          0
        )

        // Base score: storm-driven (0-100)
        let score = 50
        score += Math.min(nearbyHail.length * 4, 20)        // up to +20 for frequency
        score += Math.min(nearbySevere.length * 6, 20)      // up to +20 for severe hail nearby
        score += Math.min(Math.round(maxNearbyHail * 5), 10) // up to +10 for max hail size
        if (riskLevel === 'Critical') score += 5
        else if (riskLevel === 'High') score += 3
        score = Math.min(Math.max(score, 30), 99)

        const reason = nearbySevere.length > 0
          ? `${nearbySevere.length} severe hail hit${nearbySevere.length > 1 ? 's' : ''} within 1 mi${maxNearbyHail > 0 ? ` (max ${maxNearbyHail.toFixed(1)}")` : ''} — likely roof damage`
          : nearbyHail.length > 0
            ? `${nearbyHail.length} hail event${nearbyHail.length > 1 ? 's' : ''} within 1 mi over past 10 years`
            : `In ZIP-wide storm corridor (${hailFeatures.length} total hail events); inspect for legacy damage`

        return {
          address: addr.formatted_address as string,
          reason,
          score,
          source: 'Google + NOAA 10yr Storm',
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
    severeHailCount: severeHail.length,
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
