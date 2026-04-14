import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q) return NextResponse.json({ error: 'q (address) required' }, { status: 400 })

  const mapsKey = process.env.MAPS_API_KEY

  // ── Google Geocoding (primary) ────────────────────────────────────────────
  if (mapsKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${mapsKey}`,
        { signal: AbortSignal.timeout(8000) }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data.status === 'OK' && data.results?.[0]) {
        const r = data.results[0]
        return NextResponse.json({
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          display_name: r.formatted_address,
        })
      }
    } catch { /* fall through to Nominatim */ }
  }

  // ── Nominatim fallback ────────────────────────────────────────────────────
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`,
      {
        headers: { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' },
        signal: AbortSignal.timeout(8000),
      }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json()
    if (data.length) {
      return NextResponse.json({
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        display_name: data[0].display_name,
      })
    }
  } catch { /* fall through */ }

  return NextResponse.json({ error: 'Address not found' }, { status: 404 })
}
