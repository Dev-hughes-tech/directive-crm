import { NextRequest, NextResponse } from 'next/server'

interface LatLng {
  lat: number
  lng: number
}

interface SnappedPoint {
  location: {
    latitude: number
    longitude: number
  }
  placeId?: string
}

interface SpeedLimit {
  placeId?: string
  speedLimit?: {
    value?: number
    unit?: string
  }
}

export async function POST(request: NextRequest) {
  const { path, mode } = await request.json() as {
    path: LatLng[]
    mode: 'snapToRoads' | 'speedLimits'
  }

  if (!path?.length) return NextResponse.json({ error: 'No path provided' }, { status: 400 })
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No key' }, { status: 500 })

  try {
    if (mode === 'snapToRoads') {
      // Snap GPS points to nearest road
      const pathStr = path.slice(0, 100).map((p: LatLng) => `${p.lat},${p.lng}`).join('|')
      const res = await fetch(
        `https://roads.googleapis.com/v1/snapToRoads?path=${pathStr}&interpolate=true&key=${apiKey}`
      )
      const data = await res.json()

      const snappedPoints = (data.snappedPoints || []).map((p: SnappedPoint) => ({
        lat: p.location.latitude,
        lng: p.location.longitude,
        placeId: p.placeId || null
      }))

      return NextResponse.json({ snappedPoints })
    }

    if (mode === 'speedLimits') {
      // Get speed limits for roads in path
      const pathStr = path.slice(0, 100).map((p: LatLng) => `${p.lat},${p.lng}`).join('|')
      const res = await fetch(
        `https://roads.googleapis.com/v1/speedLimits?path=${pathStr}&key=${apiKey}`
      )
      const data = await res.json()
      const speedLimits = (data.speedLimits || []).map((s: SpeedLimit) => ({
        placeId: s.placeId || null,
        speed: s.speedLimit?.value || null,
        unit: s.speedLimit?.unit || 'MPH'
      }))
      return NextResponse.json({ speedLimits })
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Roads API failed' }, { status: 500 })
  }
}
