import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { fetchWithTimeout } from '@/lib/fetchTimeout'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const lat = request.nextUrl.searchParams.get('lat')
  const lng = request.nextUrl.searchParams.get('lng')
  if (!lat || !lng) return NextResponse.json({ error: 'lat/lng required' }, { status: 400 })

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No key' }, { status: 500 })

  try {
    // Google Weather API (new)
    const weatherRes = await fetchWithTimeout(
      `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}`,
      {},
      8000
    )
    const weatherData = await weatherRes.json()

    // Check for severe conditions relevant to roofing
    const conditions = weatherData.weatherCondition?.description?.text || null
    // Convert wind speed to mph regardless of API unit
    const rawWindSpeed = weatherData.wind?.speed?.value || null
    const rawWindUnit = weatherData.wind?.speed?.unit || 'MPH'
    const windSpeed = rawWindSpeed !== null
      ? (rawWindUnit === 'KILOMETERS_PER_HOUR' ? Math.round(rawWindSpeed * 0.621371) : Math.round(rawWindSpeed))
      : null
    const windUnit = 'mph'
    const precipitation = weatherData.precipitation?.probability?.percent || null
    const temperature = weatherData.temperature?.degrees || null
    const tempUnit = weatherData.temperature?.unit || 'FAHRENHEIT'
    const humidity = weatherData.relativeHumidity || null

    // Flag severe conditions relevant to roofing sales
    const alerts: string[] = []
    if (windSpeed && windSpeed > 35) alerts.push(`High winds: ${windSpeed} ${windUnit}`)
    if (precipitation && precipitation > 70) alerts.push(`High rain chance: ${precipitation}%`)
    if (conditions && /storm|thunder|hail|tornado|hurricane/i.test(conditions)) {
      alerts.push(`Storm: ${conditions}`)
    }

    return NextResponse.json({
      conditions,
      windSpeed,
      windUnit,
      precipitation,
      temperature,
      tempUnit,
      humidity,
      alerts,
      raw: weatherData
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'upstream_failure', detail: String(e), conditions: null, windSpeed: null, precipitation: null, temperature: null, humidity: null, alerts: [] },
      { status: 502 }
    )
  }
}
