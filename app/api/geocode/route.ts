import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const reverse = searchParams.get('reverse') === 'true'
  const latParam = searchParams.get('lat')
  const lngParam = searchParams.get('lng')

  const mapsKey = process.env.MAPS_API_KEY

  // ── Reverse geocoding (lat,lng → address/ZIP/city) ───────────────────────
  if (reverse || (latParam && lngParam)) {
    const lat = latParam || (q ? q.split(',')[0] : null)
    const lng = lngParam || (q ? q.split(',')[1] : null)
    if (!lat || !lng) return NextResponse.json({ error: 'lat and lng required for reverse geocoding' }, { status: 400 })

    if (mapsKey) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${mapsKey}`,
          { signal: AbortSignal.timeout(8000) }
        )
        const data: any = await res.json()
        if (data.status === 'OK' && data.results?.length) {
          const r = data.results[0]
          const components = r.address_components || []
          const zip = components.find((c: any) => c.types.includes('postal_code'))?.short_name || ''
          const city =
            components.find((c: any) => c.types.includes('locality'))?.long_name ||
            components.find((c: any) => c.types.includes('sublocality'))?.long_name ||
            components.find((c: any) => c.types.includes('administrative_area_level_2'))?.long_name ||
            ''
          const state = components.find((c: any) => c.types.includes('administrative_area_level_1'))?.short_name || ''
          return NextResponse.json({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            zip,
            city,
            state,
            display_name: r.formatted_address,
          })
        }
      } catch { /* fall through to Nominatim */ }
    }

    // Nominatim reverse fallback
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' },
          signal: AbortSignal.timeout(8000),
        }
      )
      const data: any = await res.json()
      if (data?.address) {
        return NextResponse.json({
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          zip: data.address.postcode || '',
          city: data.address.city || data.address.town || data.address.village || data.address.county || '',
          state: data.address.state || '',
          display_name: data.display_name,
        })
      }
    } catch { /* fall through */ }

    return NextResponse.json({ error: 'Reverse geocode failed' }, { status: 404 })
  }

  // ── Forward geocoding (address → lat,lng) ────────────────────────────────
  if (!q) return NextResponse.json({ error: 'q (address) required' }, { status: 400 })

  if (mapsKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${mapsKey}`,
        { signal: AbortSignal.timeout(8000) }
      )
      const data: any = await res.json()
      if (data.status === 'OK' && data.results?.[0]) {
        const r = data.results[0]
        const components = r.address_components || []
        const zip = components.find((c: any) => c.types.includes('postal_code'))?.short_name || ''
        const city =
          components.find((c: any) => c.types.includes('locality'))?.long_name ||
          components.find((c: any) => c.types.includes('administrative_area_level_2'))?.long_name || ''
        return NextResponse.json({
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          zip,
          city,
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
