import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { fetchWithTimeout } from '@/lib/fetchTimeout'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const address = request.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json({ error: 'Address required' }, { status: 400 })

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  try {
    // Step 1: Request the aerial video render
    const lookupRes = await fetchWithTimeout(
      `https://aerialview.googleapis.com/v1/videos:lookupVideo?address=${encodeURIComponent(address)}&key=${apiKey}`,
      {},
      8000
    )
    const lookupData = await lookupRes.json()

    if (lookupData.state === 'ACTIVE' && lookupData.uris?.MP4_MEDIUM?.landscapeUri) {
      return NextResponse.json({ videoUri: lookupData.uris.MP4_MEDIUM.landscapeUri })
    }

    if (lookupData.state === 'PROCESSING') {
      return NextResponse.json({ processing: true, videoUri: null })
    }

    // Not available for this address
    return NextResponse.json({ videoUri: null })
  } catch {
    return NextResponse.json({ videoUri: null })
  }
}
