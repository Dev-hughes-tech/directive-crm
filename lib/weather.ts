// ===== Weather — Open-Meteo primary (free, reliable), NWS fallback =====
// Open-Meteo: https://open-meteo.com — no API key, 99.9% uptime
// NWS: https://api.weather.gov — US-only, requires 3 sequential calls, sometimes unreliable

const NWS_BASE = 'https://api.weather.gov'
const NWS_HEADERS = {
  'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)',
  Accept: 'application/geo+json',
}

// WMO weather code → human readable condition
function wmoToCondition(code: number): string {
  if (code === 0) return 'Clear Sky'
  if (code === 1) return 'Mainly Clear'
  if (code === 2) return 'Partly Cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Foggy'
  if (code >= 51 && code <= 55) return 'Drizzle'
  if (code >= 56 && code <= 57) return 'Freezing Drizzle'
  if (code >= 61 && code <= 65) return 'Rain'
  if (code >= 66 && code <= 67) return 'Freezing Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain Showers'
  if (code >= 85 && code <= 86) return 'Snow Showers'
  if (code === 95) return 'Thunderstorm'
  if (code === 96 || code === 99) return 'Severe Thunderstorm'
  return 'Unknown'
}

function degreesToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

// ─── Open-Meteo current weather (primary — always works) ─────────────────────
async function getOpenMeteoWeather(lat: number, lng: number) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,surface_pressure,precipitation&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    const c = data.current
    if (!c) return null
    return {
      temperature_f: c.temperature_2m != null ? Math.round(c.temperature_2m) : null,
      wind_speed_mph: c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null,
      wind_direction: c.wind_direction_10m != null ? degreesToCardinal(c.wind_direction_10m) : null,
      humidity_pct: c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null,
      pressure_inhg: c.surface_pressure != null ? Number((c.surface_pressure * 0.02953).toFixed(2)) : null,
      conditions: c.weather_code != null ? wmoToCondition(c.weather_code) : null,
      precipitation_in: c.precipitation != null ? Number(c.precipitation.toFixed(2)) : null,
      station: 'Open-Meteo',
      observed_at: c.time ? `${c.time}:00` : null,
      source: 'open-meteo',
    }
  } catch {
    return null
  }
}

// ─── NWS current weather (US-only fallback) ──────────────────────────────────
async function getNWSPointMeta(lat: number, lng: number) {
  try {
    const res = await fetch(`${NWS_BASE}/points/${lat.toFixed(4)},${lng.toFixed(4)}`, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(6000),
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

async function getNWSWeather(lat: number, lng: number) {
  try {
    const meta = await getNWSPointMeta(lat, lng)
    if (!meta?.observationStationsUrl) return null

    const stationsRes = await fetch(meta.observationStationsUrl, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(5000),
    })
    if (!stationsRes.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stationsData: any = await stationsRes.json()
    const stationId = stationsData.features?.[0]?.properties?.stationIdentifier
    if (!stationId) return null

    const obsRes = await fetch(`${NWS_BASE}/stations/${stationId}/observations/latest`, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(5000),
    })
    if (!obsRes.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obs: any = await obsRes.json()
    const p = obs.properties
    if (!p) return null

    return {
      temperature_f: p.temperature?.value != null ? Math.round(p.temperature.value * 9 / 5 + 32) : null,
      wind_speed_mph: p.windSpeed?.value != null ? Math.round(p.windSpeed.value * 0.621371) : null,
      wind_direction: p.windDirection?.value != null ? degreesToCardinal(p.windDirection.value) : null,
      humidity_pct: p.relativeHumidity?.value != null ? Math.round(p.relativeHumidity.value) : null,
      pressure_inhg: p.barometricPressure?.value != null ? Number((p.barometricPressure.value * 0.00029530).toFixed(2)) : null,
      conditions: p.textDescription || null,
      precipitation_in: null,
      station: stationId,
      observed_at: p.timestamp || null,
      source: 'nws',
    }
  } catch {
    return null
  }
}

// ─── Public API: getCurrentWeather ────────────────────────────────────────────
// Tries Open-Meteo first (fast + reliable), then NWS (US-only, slower)
export async function getCurrentWeather(lat: number, lng: number) {
  // Open-Meteo runs in parallel with NWS — use whichever finishes first and succeeds
  const [openMeteoResult, nwsResult] = await Promise.allSettled([
    getOpenMeteoWeather(lat, lng),
    getNWSWeather(lat, lng),
  ])

  const openMeteo = openMeteoResult.status === 'fulfilled' ? openMeteoResult.value : null
  const nws = nwsResult.status === 'fulfilled' ? nwsResult.value : null

  // Prefer NWS when available (more precise US data), fall back to Open-Meteo
  return nws ?? openMeteo ?? null
}

// ─── Public API: getAlerts ───────────────────────────────────────────────────
export async function getAlerts(lat: number, lng: number) {
  try {
    const res = await fetch(`${NWS_BASE}/alerts/active?point=${lat},${lng}`, {
      headers: NWS_HEADERS,
      signal: AbortSignal.timeout(8000),
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

// ─── Public API: getForecast ──────────────────────────────────────────────────
// Tries NWS 7-day forecast first, falls back to Open-Meteo hourly → daily
export async function getForecast(lat: number, lng: number) {
  // Try NWS first
  try {
    const meta = await getNWSPointMeta(lat, lng)
    if (meta?.forecastUrl) {
      const res = await fetch(meta.forecastUrl, {
        headers: NWS_HEADERS,
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await res.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const periods = (data.properties?.periods || []).map((p: any) => ({
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
        if (periods.length > 0) return periods
      }
    }
  } catch { /* fall through to Open-Meteo */ }

  // Open-Meteo fallback — daily forecast for 7 days
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    const daily = data.daily
    if (!daily?.time?.length) return []

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return daily.time.map((date: string, i: number): any => {
      const d = new Date(date + 'T12:00:00')
      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tonight' : days[d.getDay()]
      return {
        name: dayName,
        temperature: daily.temperature_2m_max[i] != null ? Math.round(daily.temperature_2m_max[i]) : null,
        temperatureUnit: 'F',
        windSpeed: daily.wind_speed_10m_max[i] != null ? `${Math.round(daily.wind_speed_10m_max[i])} mph` : null,
        windDirection: null,
        shortForecast: daily.weather_code[i] != null ? wmoToCondition(daily.weather_code[i]) : 'Unknown',
        detailedForecast: daily.weather_code[i] != null
          ? `${wmoToCondition(daily.weather_code[i])}. High: ${daily.temperature_2m_max[i] != null ? Math.round(daily.temperature_2m_max[i]) : '?'}°F, Low: ${daily.temperature_2m_min[i] != null ? Math.round(daily.temperature_2m_min[i]) : '?'}°F. Precip: ${daily.precipitation_sum[i] != null ? daily.precipitation_sum[i].toFixed(2) : '0.00'} in.`
          : '',
        isDaytime: true,
        icon: null,
      }
    })
  } catch {
    return []
  }
}
