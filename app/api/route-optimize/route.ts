import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

interface Waypoint {
  id: string
  lat: number
  lng: number
  address: string
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { waypoints, origin, avoidTolls = false } = await request.json() as {
    waypoints: Waypoint[]
    origin: { lat: number; lng: number }
    avoidTolls?: boolean
  }

  if (!waypoints || waypoints.length < 1) {
    return NextResponse.json({ error: 'Need at least 1 waypoint' }, { status: 400 })
  }

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  try {
    // Routes API v2 — supports optimization, traffic, tolls
    const requestBody = {
      origin: {
        location: { latLng: { latitude: origin.lat, longitude: origin.lng } }
      },
      destination: {
        location: { latLng: { latitude: waypoints[waypoints.length - 1].lat, longitude: waypoints[waypoints.length - 1].lng } }
      },
      intermediates: waypoints.slice(0, -1).map((w: Waypoint) => ({
        location: { latLng: { latitude: w.lat, longitude: w.lng } }
      })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      optimizeWaypointOrder: true,
      routeModifiers: {
        avoidTolls,
        avoidHighways: false,
        avoidFerries: true
      },
      extraComputations: ['TOLLS'],
      requestedReferenceRoutes: ['FUEL_EFFICIENT']
    }

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.optimizedIntermediateWaypointIndex,routes.legs,routes.travelAdvisory'
      },
      body: JSON.stringify(requestBody)
    })

    const data = await res.json()

    if (!data.routes || !data.routes[0]) {
      return NextResponse.json({ error: 'Routes API returned no routes', routes: null })
    }

    const route = data.routes[0]
    const optimizedOrder: number[] = route.optimizedIntermediateWaypointIndex || waypoints.slice(0, -1).map((_: Waypoint, i: number) => i)

    const intermediateWaypoints = waypoints.slice(0, -1)
    const orderedWaypoints = [
      { lat: origin.lat, lng: origin.lng, address: 'Start', id: 'origin' },
      ...optimizedOrder.map((i: number) => intermediateWaypoints[i]),
      waypoints[waypoints.length - 1]
    ]

    const totalMeters = route.distanceMeters || 0
    const totalSeconds = parseInt(route.duration?.replace('s', '') || '0')

    // Toll info
    const tollCost = route.travelAdvisory?.tollInfo?.estimatedPrice?.[0]
    const tollText = tollCost ? `$${(tollCost.units || 0)}.${String(tollCost.nanos || 0).padStart(2, '0')}` : null

    const googleMapsUrl = `https://www.google.com/maps/dir/${orderedWaypoints.map((w: {lat: number; lng: number}) => `${w.lat},${w.lng}`).join('/')}`

    return NextResponse.json({
      orderedWaypoints,
      totalDistanceMiles: (totalMeters / 1609.34).toFixed(1),
      totalDurationMinutes: Math.round(totalSeconds / 60),
      tollCost: tollText,
      trafficAware: true,
      googleMapsUrl
    })
  } catch (error) {
    console.error('Routes API error:', error)
    return NextResponse.json({ error: 'Route optimization failed' }, { status: 500 })
  }
}
