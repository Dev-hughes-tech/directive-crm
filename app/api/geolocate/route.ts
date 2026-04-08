import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No key' }, { status: 500 })

  try {
    const res = await fetch(
      `https://www.googleapis.com/geolocation/v1/geolocate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ considerIp: true }) // Uses IP + WiFi signals
      }
    )
    const data = await res.json()
    if (data.location) {
      return NextResponse.json({
        lat: data.location.lat,
        lng: data.location.lng,
        accuracy: data.accuracy // meters
      })
    }
    return NextResponse.json({ error: 'Could not determine location' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Geolocation failed' }, { status: 500 })
  }
}
