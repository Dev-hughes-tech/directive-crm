import { NextRequest, NextResponse } from 'next/server'

interface Waypoint {
  lat: number
  lng: number
  address: string
  id: string
}

export async function POST(request: NextRequest) {
  const { waypoints, origin } = await request.json() as { waypoints: Waypoint[], origin: { lat: number, lng: number } }

  if (!waypoints || waypoints.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 waypoints' }, { status: 400 })
  }

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  try {
    // Use Directions API for route optimization (Routes API requires OAuth for full optimization)
    // Directions API waypoint optimization works with API key
    const waypointsStr = waypoints
      .slice(1, -1) // middle points
      .map((w: Waypoint) => `${w.lat},${w.lng}`)
      .join('|')

    const origin_coord = `${origin.lat},${origin.lng}`
    const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin_coord}&destination=${destination}&waypoints=optimize:true|${waypointsStr}&key=${apiKey}`

    const res = await fetch(url)
    const data = await res.json()

    if (data.status !== 'OK') {
      return NextResponse.json({ error: 'Routing failed', details: data.status }, { status: 500 })
    }

    const optimizedOrder = data.routes[0].waypoint_order
    const legs = data.routes[0].legs
    const totalDistance = legs.reduce((sum: number, leg: { distance: { value: number } }) => sum + leg.distance.value, 0)
    const totalDuration = legs.reduce((sum: number, leg: { duration: { value: number } }) => sum + leg.duration.value, 0)

    // Reorder waypoints by optimized order
    const middleWaypoints = waypoints.slice(1, -1)
    const orderedWaypoints = [
      waypoints[0],
      ...optimizedOrder.map((i: number) => middleWaypoints[i]),
      waypoints[waypoints.length - 1]
    ]

    return NextResponse.json({
      orderedWaypoints,
      totalDistanceMiles: (totalDistance / 1609.34).toFixed(1),
      totalDurationMinutes: Math.round(totalDuration / 60),
      googleMapsUrl: `https://www.google.com/maps/dir/${orderedWaypoints.map((w: Waypoint) => `${w.lat},${w.lng}`).join('/')}`
    })
  } catch (error) {
    return NextResponse.json({ error: 'Route optimization failed' }, { status: 500 })
  }
}
