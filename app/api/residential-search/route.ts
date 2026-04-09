import { NextRequest, NextResponse } from 'next/server'

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
      const pLat = (lat - latDeg) + stepLat * (i + 0.5) + (Math.random() - 0.5) * stepLat * 0.4
      const pLng = (lng - lngDeg) + stepLng * (j + 0.5) + (Math.random() - 0.5) * stepLng * 0.4
      points.push({ lat: pLat, lng: pLng })
    }
  }
  return points.slice(0, count)
}

export async function POST(request: NextRequest) {
  const { lat, lng, radius = 1609 } = await request.json()
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  // Generate 16 grid points around the user's location
  const gridPoints = generateGrid(lat, lng, radius, 16)

  try {
    // Reverse geocode each grid point in parallel
    const results = await Promise.allSettled(
      gridPoints.map(async (pt) => {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${pt.lat},${pt.lng}&result_type=street_address|premise&key=${apiKey}`
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

    return NextResponse.json({ places })
  } catch {
    return NextResponse.json({ error: 'Residential search failed', places: [] }, { status: 500 })
  }
}
