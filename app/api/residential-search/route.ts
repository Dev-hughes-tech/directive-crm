import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireTier } from '@/lib/apiAuth'
import { fetchWithTimeout } from '@/lib/fetchTimeout'

// Generate grid points around a center for reverse geocoding
function generateGrid(lat: number, lng: number, radiusMeters: number, count: number) {
  const points: { lat: number; lng: number }[] = []
  // Convert radius from meters to degrees (approximate)
  const latDeg = radiusMeters / 111320
  const lngDeg = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180))

  const gridSize = Math.ceil(Math.sqrt(count))
  const stepLat = (2 * latDeg) / gridSize
  const stepLng = (2 * lngDeg) / gridSize

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const pLat = (lat - latDeg) + stepLat * (i + 0.5)
      const pLng = (lng - lngDeg) + stepLng * (j + 0.5)
      points.push({ lat: pLat, lng: pLng })
    }
  }
  return points.slice(0, count)
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const tierDenied = requireTier(auth, 'residentialSearch')
  if (tierDenied) return tierDenied

  const { lat, lng, radius = 1609 } = await request.json()
  // Cap radius to 5 miles (8047 meters)
  const cappedRadius = Math.min(radius, 8047)
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  // Generate 16 grid points around the user's location
  const gridPoints = generateGrid(lat, lng, cappedRadius, 16)

  try {
    // Reverse geocode each grid point in parallel
    const results = await Promise.allSettled(
      gridPoints.map(async (pt) => {
        const res = await fetchWithTimeout(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${pt.lat},${pt.lng}&result_type=street_address|premise&key=${apiKey}`,
          {},
          8000
        )
        const data = await res.json()
        if (data.results && data.results.length > 0) {
          return data.results[0]
        }
        return null
      })
    )

    // Deduplicate by place_id and format results
    const seen = new Set<string>()
    const places: Array<{
      id: string
      name: string | null
      address: string | null
      lat: number | null
      lng: number | null
      types: string[]
      phone: string | null
    }> = []

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue
      const r = result.value
      if (seen.has(r.place_id)) continue
      seen.add(r.place_id)

      // Only include residential-type results (street addresses, premises)
      const types: string[] = r.types || []
      const isResidential = types.some((t: string) =>
        ['street_address', 'premise', 'subpremise', 'establishment'].includes(t)
      )
      if (!isResidential) continue

      places.push({
        id: r.place_id,
        name: null,
        address: r.formatted_address || null,
        lat: r.geometry?.location?.lat || null,
        lng: r.geometry?.location?.lng || null,
        types,
        phone: null,
      })
    }

    return NextResponse.json({ places }, {
      headers: { 'Cache-Control': 'no-store, private' }
    })
  } catch {
    return NextResponse.json({ error: 'Residential search failed', places: [] }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, private' }
    })
  }
}
