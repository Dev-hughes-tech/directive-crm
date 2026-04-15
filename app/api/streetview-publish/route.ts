import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { fetchWithTimeout } from '@/lib/fetchTimeout'

// Step 1: Create an upload URL for a photo
export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { action } = await request.json()
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No key' }, { status: 500 })

  if (action === 'startUpload') {
    try {
      // Request an upload URL from Street View Publish API
      const res = await fetchWithTimeout(
        `https://streetviewpublish.googleapis.com/v1/photo:startUpload?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        8000
      )
      const data = await res.json()
      // Returns uploadUrl where the actual photo bytes are PUT
      return NextResponse.json({ uploadUrl: data.uploadUrl || null, error: data.error || null })
    } catch {
      return NextResponse.json({ error: 'Could not get upload URL' }, { status: 500 })
    }
  }

  if (action === 'publishPhoto') {
    const { uploadReference, lat, lng, address } = await request.json().catch(() => ({}))
    if (!uploadReference) return NextResponse.json({ error: 'No upload reference' }, { status: 400 })

    try {
      const photoBody = {
        uploadReference: { uploadUrl: uploadReference },
        pose: { latLngPair: { latitude: lat, longitude: lng } },
        places: [{ placeId: null, name: address }]
      }
      const res = await fetchWithTimeout(
        `https://streetviewpublish.googleapis.com/v1/photo?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(photoBody) },
        8000
      )
      const data = await res.json()
      return NextResponse.json({ photoId: data.photoId?.id || null, shareLink: data.shareLink || null })
    } catch {
      return NextResponse.json({ error: 'Publish failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
