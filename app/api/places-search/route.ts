import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { lat, lng, radius = 2000, type = 'commercial' } = await request.json()
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  // Places API (New) — Nearby Search
  const body = {
    includedTypes: type === 'commercial'
      ? ['shopping_mall', 'store', 'restaurant', 'office', 'warehouse', 'school', 'hotel', 'hospital', 'bank', 'car_dealer', 'car_repair', 'gas_station', 'grocery_or_supermarket', 'gym', 'laundry', 'lodging', 'movie_theater', 'night_club', 'parking', 'pharmacy', 'spa']
      : ['house', 'real_estate_agency'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radius
      }
    }
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus,places.nationalPhoneNumber'
      },
      body: JSON.stringify(body)
    })

    const data = await res.json()
    if (!data.places) return NextResponse.json({ places: [] })

    const places = data.places.map((p: {
      id: string
      displayName?: { text: string }
      formattedAddress?: string
      location?: { latitude: number; longitude: number }
      types?: string[]
      nationalPhoneNumber?: string
    }) => ({
      id: p.id,
      name: p.displayName?.text || null,
      address: p.formattedAddress || null,
      lat: p.location?.latitude || null,
      lng: p.location?.longitude || null,
      types: p.types || [],
      phone: p.nationalPhoneNumber || null,
    }))

    return NextResponse.json({ places })
  } catch {
    return NextResponse.json({ error: 'Places search failed', places: [] }, { status: 500 })
  }
}
