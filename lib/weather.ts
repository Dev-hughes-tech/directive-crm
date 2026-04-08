// ===== NWS Weather API — Free, No Auth Required =====

const NWS_BASE = 'https://api.weather.gov'
const NWS_HEADERS = {
  'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)',
  Accept: 'application/geo+json',
}

// Get point metadata (grid info + station URL)
async function getPointMeta(lat: number, lng: number) {
  try {
    const res = await fetch(`${NWS_BASE}/points/${lat.toFixed(4)},${lng.toFixed(4)}`, {
      headers: NWS_HEADERS,
    })
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    return {
      gridId: data.properties?.gridId,
      gridX: data.properties?.gridX,
      gridY: data.properties?.gridY,
      forecastUrl: data.properties?.forecast,
      observationStationsUrl: data.properties?.observationStations,
      county: data.properties?.county,
      radarStation: data.properties?.radarStation,
    }
  } catch {
    return null
  }
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

// Get current weather conditions
export async function getCurrentWeather(lat: number, lng: number) {
  const meta = await getPointMeta(lat, lng)
  if (!meta) return null

  try {
    const stationsRes = await fetch(meta.observationStationsUrl, { headers: NWS_HEADERS })
    if (!stationsRes.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stationsData: any = await stationsRes.json()
    const stationId = stationsData.features?.[0]?.properties?.stationIdentifier
    if (!stationId) return null

    const obsRes = await fetch(`${NWS_BASE}/stations/${stationId}/observations/latest`, {
      headers: NWS_HEADERS,
    })
    if (!obsRes.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obs: any = await obsRes.json()
    const p = obs.properties

    return {
      temperature_f: p.temperature?.value != null ? Math.round(p.temperature.value * 9 / 5 + 32) : null,
      wind_speed_mph: p.windSpeed?.value != null ? Math.round(p.windSpeed.value * 0.621371) : null,
      wind_direction: p.windDirection?.value != null ? degreesToCardinal(p.windDirection.value) : null,
      humidity_pct: p.relativeHumidity?.value != null ? Math.round(p.relativeHumidity.value) : null,
      pressure_inhg: p.barometricPressure?.value != null ? Number((p.barometricPressure.value * 0.00029530).toFixed(2)) : null,
      conditions: p.textDescription || null,
      station: stationId,
      observed_at: p.timestamp || null,
    }
  } catch {
    return null
  }
}

// Get active alerts for a point
export async function getAlerts(lat: number, lng: number) {
  try {
    const res = await fetch(`${NWS_BASE}/alerts/active?point=${lat},${lng}`, {
      headers: NWS_HEADERS,
    })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.features || []).map((f: any) => ({
      id: f.properties?.id,
      event: f.properties?.event,
      severity: f.properties?.severity,
      headline: f.properties?.headline,
      description: f.properties?.description,
      onset: f.properties?.onset,
      expires: f.properties?.expires,
      sender: f.properties?.senderName,
    }))
  } catch {
    return []
  }
}

// Get 7-day forecast
export async function getForecast(lat: number, lng: number) {
  const meta = await getPointMeta(lat, lng)
  if (!meta?.forecastUrl) return []

  try {
    const res = await fetch(meta.forecastUrl, { headers: NWS_HEADERS })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.properties?.periods || []).map((p: any) => ({
      name: p.name,
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit,
      windSpeed: p.windSpeed,
      windDirection: p.windDirection,
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast,
      isDaytime: p.isDaytime,
      icon: p.icon,
    }))
  } catch {
    return []
  }
}
