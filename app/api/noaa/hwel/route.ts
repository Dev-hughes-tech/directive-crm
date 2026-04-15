import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export const maxDuration = 45

const SWDI = 'https://www.ncei.noaa.gov/swdiws/json'

// Historical Weather Event Library (HWEL) — comprehensive 10-year storm archive
export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const radiusMiles = parseFloat(searchParams.get('radius') || '30')
  const years = parseInt(searchParams.get('years') || '10')

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  try {
    const fmtDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')
    const now = new Date()
    const start = new Date(now)
    start.setFullYear(start.getFullYear() - years)

    const startStr = fmtDate(start)
    const endStr = fmtDate(now)
    const headers = { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' }

    // Fetch all storm report types + radar hail + mesocyclone detections in parallel
    const [plsrRes, hailRes, mesoRes] = await Promise.allSettled([
      fetch(`${SWDI}/plsr/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radiusMiles}`, { headers, signal: AbortSignal.timeout(20000) })
        .then(r => r.ok ? r.json() : { result: [] }),
      fetch(`${SWDI}/nx3hail/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radiusMiles}`, { headers, signal: AbortSignal.timeout(20000) })
        .then(r => r.ok ? r.json() : { result: [] }),
      fetch(`${SWDI}/nx3meso/${startStr}:${endStr}?lat=${lat}&lon=${lng}&r=${radiusMiles}`, { headers, signal: AbortSignal.timeout(20000) })
        .then(r => r.ok ? r.json() : { result: [] }),
    ])

    const plsrData = plsrRes.status === 'fulfilled' ? (plsrRes.value.result || []) : []
    const hailData = hailRes.status === 'fulfilled' ? (hailRes.value.result || []) : []
    const mesoData = mesoRes.status === 'fulfilled' ? (mesoRes.value.result || []) : []

    // Categorize storm reports by type
    const hailReports = plsrData
      .filter((e: any) => e.TYPECODE === 'H')
      .map((e: any) => ({
        type: 'hail' as const,
        date: e.ZTIME || null,
        lat: e.LAT,
        lng: e.LON,
        magnitude: e.MAGNITUDE ? parseFloat(e.MAGNITUDE) : null,
        city: e.CITY || null,
        state: e.STATE || null,
        source: 'spotter',
        description: e.MAGNITUDE ? `${e.MAGNITUDE}" diameter hail` : 'Hail reported',
      }))

    const tornadoReports = plsrData
      .filter((e: any) => e.TYPECODE === 'T')
      .map((e: any) => ({
        type: 'tornado' as const,
        date: e.ZTIME || null,
        lat: e.LAT,
        lng: e.LON,
        magnitude: e.MAGNITUDE ? parseFloat(e.MAGNITUDE) : null,
        city: e.CITY || null,
        state: e.STATE || null,
        source: 'spotter',
        description: e.MAGNITUDE ? `EF-${Math.round(parseFloat(e.MAGNITUDE))} tornado` : 'Tornado reported',
      }))

    const windReports = plsrData
      .filter((e: any) => e.TYPECODE === 'G' || e.TYPECODE === 'D' || e.TYPECODE === 'W')
      .map((e: any) => ({
        type: 'wind' as const,
        date: e.ZTIME || null,
        lat: e.LAT,
        lng: e.LON,
        magnitude: e.MAGNITUDE ? parseFloat(e.MAGNITUDE) : null,
        city: e.CITY || null,
        state: e.STATE || null,
        source: 'spotter',
        description: e.MAGNITUDE ? `${e.MAGNITUDE} mph wind` : 'High wind reported',
      }))

    // Radar-detected hail
    const radarHail = hailData.map((e: any) => ({
      type: 'radar_hail' as const,
      date: e.ZTIME || null,
      lat: e.LAT,
      lng: e.LON,
      magnitude: e.MAXSIZE ? parseFloat(e.MAXSIZE) : null,
      city: null,
      state: null,
      source: 'radar',
      description: e.MAXSIZE ? `${e.MAXSIZE}" radar-detected hail (${e.SEVPROB || 0}% severe probability)` : 'Radar hail signature',
      severeProb: e.SEVPROB ? parseInt(e.SEVPROB) : null,
    }))

    // Mesocyclone detections (rotation = tornado potential)
    const mesocyclones = mesoData.map((e: any) => ({
      type: 'mesocyclone' as const,
      date: e.ZTIME || null,
      lat: e.LAT,
      lng: e.LON,
      magnitude: e.MESO_STRENGTH || null,
      city: null,
      state: null,
      source: 'radar',
      description: `Mesocyclone detected — ${e.MESO_STRENGTH || 'unknown'} strength rotation`,
    }))

    // Combine all events and sort by date
    const allEvents = [...hailReports, ...tornadoReports, ...windReports, ...radarHail, ...mesocyclones]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

    // Build year-by-year summary
    const yearSummary: Record<string, { hail: number; tornado: number; wind: number; radar_hail: number; mesocyclone: number; total: number }> = {}
    for (let y = start.getFullYear(); y <= now.getFullYear(); y++) {
      yearSummary[y.toString()] = { hail: 0, tornado: 0, wind: 0, radar_hail: 0, mesocyclone: 0, total: 0 }
    }
    allEvents.forEach((e: any) => {
      if (!e.date) return
      const year = e.date.substring(0, 4)
      if (yearSummary[year]) {
        const key = e.type as keyof typeof yearSummary[string]
        if (key !== 'total') yearSummary[year][key]++
        yearSummary[year].total++
      }
    })

    // Calculate risk metrics
    const totalHail = hailReports.length + radarHail.length
    const severeHail = [...hailReports, ...radarHail].filter((e: any) => e.magnitude && e.magnitude >= 2.0).length
    const maxHailSize = Math.max(0, ...hailReports.map((e: any) => e.magnitude || 0), ...radarHail.map((e: any) => e.magnitude || 0))
    const totalTornado = tornadoReports.length
    const totalWind = windReports.length
    const totalMeso = mesocyclones.length

    // Overall risk assessment
    let riskLevel: 'Critical' | 'High' | 'Moderate' | 'Low'
    const riskScore = totalTornado * 10 + severeHail * 5 + totalHail * 2 + totalWind + totalMeso * 3
    if (riskScore >= 50 || totalTornado >= 3) riskLevel = 'Critical'
    else if (riskScore >= 25 || totalTornado >= 1 || severeHail >= 3) riskLevel = 'High'
    else if (riskScore >= 10 || totalHail >= 5) riskLevel = 'Moderate'
    else riskLevel = 'Low'

    // Peak storm months
    const monthCounts: Record<string, number> = {}
    allEvents.forEach(e => {
      if (!e.date) return
      const month = e.date.substring(4, 6)
      monthCounts[month] = (monthCounts[month] || 0) + 1
    })
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const peakMonths = Object.entries(monthCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m, count]) => ({ month: monthNames[parseInt(m) - 1] || m, count }))

    return NextResponse.json({
      summary: {
        totalEvents: allEvents.length,
        hailEvents: totalHail,
        severeHailEvents: severeHail,
        maxHailSize,
        tornadoEvents: totalTornado,
        windEvents: totalWind,
        mesocycloneEvents: totalMeso,
        riskLevel,
        riskScore,
        yearsAnalyzed: years,
        radiusMiles,
        peakMonths,
      },
      yearSummary,
      events: allEvents.slice(0, 200), // Cap at 200 most recent
    }, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
    })
  } catch (err) {
    console.error('HWEL fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch historical data' }, { status: 500 })
  }
}
