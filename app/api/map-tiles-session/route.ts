import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { fetchWithTimeout } from '@/lib/fetchTimeout'

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No key' }, { status: 500 })

  try {
    // Create a map tile session for photorealistic 3D tiles
    const res = await fetchWithTimeout(
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
      },
      8000
    )
    const data = await res.json()

    if (data.session) {
      return NextResponse.json({
        session: data.session,
        expiry: data.expiry,
        tileWidth: data.tileWidth,
        tileHeight: data.tileHeight
      }, {
        headers: { 'Cache-Control': 'no-store, private' }
      })
    }
    return NextResponse.json({ error: 'Session creation failed', details: data }, {
      headers: { 'Cache-Control': 'no-store, private' }
    })
  } catch {
    return NextResponse.json({ error: 'Map tiles session failed' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, private' }
    })
  }
}
