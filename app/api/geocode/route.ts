import { NextRequest, NextResponse } from 'next/server'
import { geocodeAddress } from '@/lib/geocode'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q) return NextResponse.json({ error: 'q (address) required' }, { status: 400 })

  const result = await geocodeAddress(q)
  if (!result) return NextResponse.json({ error: 'Address not found' }, { status: 404 })

  return NextResponse.json(result)
}
