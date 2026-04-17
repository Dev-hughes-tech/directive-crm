import { classifyHailSeverity, countSevereHailEvents } from './hailEvents.ts'

export interface IemLsrFeature {
  geometry?: {
    coordinates?: [number, number]
  } | null
  properties?: {
    typetext?: string | null
    valid?: string | null
    magnitude?: string | number | null
    city?: string | null
    state?: string | null
    remark?: string | null
    source?: string | null
  } | null
}

export interface HistoricalStormEvent {
  type: 'hail' | 'tornado' | 'wind'
  date: string | null
  lat: number | null
  lng: number | null
  size: number | null
  magnitude: number | null
  city: string | null
  state: string | null
  source: string | null
  provider: 'iem-lsr'
  description: string
  severity: string | null
}

interface PeakMonth {
  month: string
  count: number
}

interface YearSummaryRow {
  hail: number
  tornado: number
  wind: number
  radar_hail: number
  mesocyclone: number
  total: number
  maxHail: number
}

export interface HistoricalStormSummaryResult {
  summary: {
    totalEvents: number
    hailEvents: number
    severeHailEvents: number
    maxHailSize: number
    tornadoEvents: number
    windEvents: number
    mesocycloneEvents: number
    riskLevel: 'Critical' | 'High' | 'Moderate' | 'Low'
    riskScore: number
    yearsAnalyzed: number
    radiusMiles: number
    peakMonths: PeakMonth[]
  }
  yearSummary: Record<string, YearSummaryRow>
  events: HistoricalStormEvent[]
}

export function buildStormSearchBounds(lat: number, lng: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const safeCosLat = Math.abs(cosLat) < 0.01 ? 0.01 : Math.abs(cosLat)
  const lngDelta = radiusMiles / (69 * safeCosLat)

  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta,
  }
}

function formatIemTimestamp(value: Date) {
  return value.toISOString().replace(/:\d{2}\.\d{3}Z$/, 'Z')
}

export function buildIemLsrGeoJsonUrl(params: {
  lat: number
  lng: number
  radiusMiles: number
  start: Date
  end: Date
}) {
  const { north, south, east, west } = buildStormSearchBounds(params.lat, params.lng, params.radiusMiles)
  const url = new URL('https://mesonet.agron.iastate.edu/geojson/lsr.geojson')
  url.searchParams.set('north', north.toFixed(4))
  url.searchParams.set('south', south.toFixed(4))
  url.searchParams.set('east', east.toFixed(4))
  url.searchParams.set('west', west.toFixed(4))
  url.searchParams.set('sts', formatIemTimestamp(params.start))
  url.searchParams.set('ets', formatIemTimestamp(params.end))
  return url.toString()
}

function normalizeStormType(typetext: string | null | undefined): HistoricalStormEvent['type'] | null {
  const normalized = (typetext || '').trim().toUpperCase()
  if (normalized === 'HAIL') return 'hail'
  if (normalized === 'TORNADO') return 'tornado'
  if (
    normalized === 'TSTM WND GST' ||
    normalized === 'TSTM WND DMG' ||
    normalized === 'HIGH SUST WINDS' ||
    normalized === 'NON-TSTM WND GST' ||
    normalized === 'NON-TSTM WND DMG'
  ) {
    return 'wind'
  }
  return null
}

function numericOrNull(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeIemHistoricalEvents(features: IemLsrFeature[]): HistoricalStormEvent[] {
  return features.flatMap((feature) => {
    const type = normalizeStormType(feature.properties?.typetext)
    if (!type) return []

    const magnitude = numericOrNull(feature.properties?.magnitude)
    const size = type === 'hail' ? magnitude : null
    const description = feature.properties?.remark?.trim()
      || (type === 'hail'
        ? (size !== null ? `${size}" diameter hail` : 'Hail reported')
        : type === 'tornado'
        ? 'Tornado reported'
        : magnitude !== null
        ? `${magnitude} mph wind`
        : 'Wind damage reported')

    return [{
      type,
      date: feature.properties?.valid || null,
      lat: numericOrNull(feature.geometry?.coordinates?.[1]),
      lng: numericOrNull(feature.geometry?.coordinates?.[0]),
      size,
      magnitude,
      city: feature.properties?.city || null,
      state: feature.properties?.state || null,
      source: feature.properties?.source || null,
      provider: 'iem-lsr' as const,
      description,
      severity: type === 'hail' ? classifyHailSeverity(size) : null,
    }]
  })
}

export function summarizeHistoricalEvents(
  events: HistoricalStormEvent[],
  options: { years: number; radiusMiles: number },
): HistoricalStormSummaryResult {
  const sortedEvents = [...events].sort((left, right) => (right.date || '').localeCompare(left.date || ''))

  const hailEvents = sortedEvents.filter((event) => event.type === 'hail')
  const tornadoEvents = sortedEvents.filter((event) => event.type === 'tornado')
  const windEvents = sortedEvents.filter((event) => event.type === 'wind')
  const severeHailEvents = countSevereHailEvents(hailEvents, (event) => event.size)
  const maxHailSize = Math.max(0, ...hailEvents.map((event) => event.size || 0))

  const yearSummary: Record<string, YearSummaryRow> = {}
  for (const event of sortedEvents) {
    const year = event.date ? event.date.slice(0, 4) : 'unknown'
    if (!yearSummary[year]) {
      yearSummary[year] = {
        hail: 0,
        tornado: 0,
        wind: 0,
        radar_hail: 0,
        mesocyclone: 0,
        total: 0,
        maxHail: 0,
      }
    }

    const bucket = yearSummary[year]
    bucket.total += 1
    if (event.type === 'hail') {
      bucket.hail += 1
      bucket.maxHail = Math.max(bucket.maxHail, event.size || 0)
    } else if (event.type === 'tornado') {
      bucket.tornado += 1
    } else if (event.type === 'wind') {
      bucket.wind += 1
    }
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthCounts: Record<string, number> = {}
  for (const event of sortedEvents) {
    if (!event.date || event.date.length < 7) continue
    const monthKey = event.date.slice(5, 7)
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1
  }
  const peakMonths = Object.entries(monthCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([month, count]) => ({
      month: monthNames[Number.parseInt(month, 10) - 1] || month,
      count,
    }))

  const riskScore =
    (tornadoEvents.length * 10) +
    (severeHailEvents * 5) +
    (hailEvents.length * 2) +
    windEvents.length

  let riskLevel: HistoricalStormSummaryResult['summary']['riskLevel']
  if (riskScore >= 50 || tornadoEvents.length >= 3) riskLevel = 'Critical'
  else if (riskScore >= 25 || tornadoEvents.length >= 1 || severeHailEvents >= 3) riskLevel = 'High'
  else if (riskScore >= 10 || hailEvents.length >= 5) riskLevel = 'Moderate'
  else riskLevel = 'Low'

  return {
    summary: {
      totalEvents: sortedEvents.length,
      hailEvents: hailEvents.length,
      severeHailEvents,
      maxHailSize,
      tornadoEvents: tornadoEvents.length,
      windEvents: windEvents.length,
      mesocycloneEvents: 0,
      riskLevel,
      riskScore,
      yearsAnalyzed: options.years,
      radiusMiles: options.radiusMiles,
      peakMonths,
    },
    yearSummary,
    events: sortedEvents,
  }
}
