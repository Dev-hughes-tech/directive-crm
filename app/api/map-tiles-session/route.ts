import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No key' }, { status: 500 })

  try {
    // Create a map tile session for photorealistic 3D tiles
    const res = await fetch(
      `https://tile.googleapis.com/v1/createSession?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mapType: 'satellite',
          language: 'en-US',
          region: 'US',
          layerTypes: ['layerRoadmap', 'layerStreetview'],
          overlay: false,
          scale: 'scaleFactor1x'
        })
      }
    )
    const data = await res.json()

    if (data.session) {
      return NextResponse.json({
        session: data.session,
        expiry: data.expiry,
        tileWidth: data.tileWidth,
        tileHeight: data.tileHeight,
        // Tile URL template for use in Leaflet or custom renderers
        tileUrlTemplate: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${data.session}&key=${apiKey}`
      })
    }
    return NextResponse.json({ error: 'Session creation failed', details: data })
  } catch {
    return NextResponse.json({ error: 'Map tiles session failed' }, { status: 500 })
  }
}
