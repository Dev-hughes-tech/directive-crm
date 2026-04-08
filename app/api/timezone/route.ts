import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get('lat')
  const lng = request.nextUrl.searchParams.get('lng')
  if (!lat || !lng) return NextResponse.json({ error: 'lat/lng required' }, { status: 400 })

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No key' }, { status: 500 })

  try {
    const timestamp = Math.floor(Date.now() / 1000)
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${apiKey}`
    )
    const data = await res.json()

    if (data.status !== 'OK') return NextResponse.json({ error: data.status }, { status: 400 })

    const offsetSeconds = data.rawOffset + data.dstOffset
    const localTime = new Date(Date.now() + offsetSeconds * 1000)
    const hours = localTime.getUTCHours()
    const minutes = localTime.getUTCMinutes()
    const timeStr = `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`

    // Best time to call: 9am-7pm local
    const goodTimeToCall = hours >= 9 && hours < 19

    return NextResponse.json({
      timeZoneId: data.timeZoneId,
      timeZoneName: data.timeZoneName,
      localTime: timeStr,
      localHour: hours,
      goodTimeToCall,
      callAdvice: goodTimeToCall
        ? 'Good time to call'
        : hours < 9
          ? `Too early — ${9 - hours}h until 9 AM local`
          : 'Too late — past 7 PM local'
    })
  } catch {
    return NextResponse.json({ error: 'Timezone lookup failed' }, { status: 500 })
  }
}
