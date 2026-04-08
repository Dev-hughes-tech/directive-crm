import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { origin, destinations } = await request.json() as {
    origin: { lat: number; lng: number },
    destinations: Array<{ id: string; lat: number; lng: number }>
  }
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey || !destinations?.length) return NextResponse.json({ results: [] })

  try {
    // Batch in groups of 25 (API limit)
    const batches = []
    for (let i = 0; i < destinations.length; i += 25) {
      batches.push(destinations.slice(i, i + 25))
    }

    const allResults: Array<{ id: string; distanceMeters: number; distanceMiles: string; durationMinutes: number }> = []

    for (const batch of batches) {
      const destStr = batch.map((d: { lat: number; lng: number }) => `${d.lat},${d.lng}`).join('|')
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${destStr}&mode=driving&key=${apiKey}`
      const res = await fetch(url)
      const data = await res.json()

      if (data.status === 'OK' && data.rows[0]) {
        data.rows[0].elements.forEach((el: {
          status: string
          distance?: { value: number }
          duration?: { value: number }
        }, i: number) => {
          if (el.status === 'OK') {
            allResults.push({
              id: batch[i].id,
              distanceMeters: el.distance?.value || 0,
              distanceMiles: ((el.distance?.value || 0) / 1609.34).toFixed(1),
              durationMinutes: Math.round((el.duration?.value || 0) / 60)
            })
          }
        })
      }
    }

    // Sort by distance
    allResults.sort((a, b) => a.distanceMeters - b.distanceMeters)
    return NextResponse.json({ results: allResults })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
