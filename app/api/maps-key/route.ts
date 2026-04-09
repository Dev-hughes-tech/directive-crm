import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.MAPS_API_KEY || process.env.NEXT_PUBLIC_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ''
  if (!key) return NextResponse.json({ key: '' }, { status: 200 })
  return NextResponse.json({ key })
}
