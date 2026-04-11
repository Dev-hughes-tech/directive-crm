import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

// ── Geocode ZIP → lat/lng ─────────────────────────────────────────────────
async function geocodeZip(zip: string): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
  const mapsKey = process.env.MAPS_API_KEY
  if (mapsKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(zip)}&key=${mapsKey}`,
        { signal: AbortSignal.timeout(6000) }
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data.status === 'OK' && data.results[0]) {
        const r = data.results[0]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const get = (t: string) => r.address_components.find((c: any) => c.types.includes(t))?.long_name ?? ''
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getS = (t: string) => r.address_components.find((c: any) => c.types.includes(t))?.short_name ?? ''
        return {
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          city: get('locality') || get('sublocality') || get('postal_town'),
          state: getS('administrative_area_level_1'),
        }
      }
    } catch { /* fall through */ }
  }
  // Fallback: Nominatim
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=us&format=json&limit=1`,
      { headers: { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' }, signal: AbortSignal.timeout(6000) }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = await res.json()
    if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), city: data[0].display_name.split(',')[0], state: '' }
  } catch { /* ignore */ }
  return null
}

// ── NOAA 10-year storm fetch ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchNoaaEvents(lat: number, lng: number, eventType: 'hail' | 'torn' | 'wind', yearStart: number, yearEnd: number): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = []
  const h = { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' }

  // NOAA allows date-range queries — chunk by year to avoid timeouts
  const years = []
  for (let y = yearStart; y <= yearEnd; y++) years.push(y)

  // Fetch in 2-year chunks for reliability
  const chunks: number[][] = []
  for (let i = 0; i < years.length; i += 2) chunks.push(years.slice(i, i + 2))

  await Promise.allSettled(chunks.map(async (chunk) => {
    const start = `${chunk[0]}-01-01`
    const end = `${chunk[chunk.length - 1]}-12-31`
    const radius = eventType === 'torn' ? 40 : 15
    try {
      const res = await fetch(
        `https://www.ncdc.noaa.gov/swdi/stormEvents/geojson/${eventType}/${start}:${end}?lat=${lat}&lon=${lng}&r=${radius}`,
        { headers: h, signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json()
      if (data?.features?.length) results.push(...data.features)
    } catch { /* individual year may fail, continue */ }
  }))

  return results
}

export async function POST(request: NextRequest) {
  const { zip } = await request.json()
  if (!zip?.trim()) return NextResponse.json({ error: 'ZIP code required' }, { status: 400 })

  // 1. Geocode the ZIP
  const geo = await geocodeZip(zip.trim())
  if (!geo) return NextResponse.json({ error: 'ZIP code not found' }, { status: 404 })

  const currentYear = new Date().getFullYear()
  const startYear = currentYear - 10

  // 2. Fetch 10 years of NOAA storm data in parallel
  const [hailFeatures, tornadoFeatures, windFeatures] = await Promise.all([
    fetchNoaaEvents(geo.lat, geo.lng, 'hail', startYear, currentYear),
    fetchNoaaEvents(geo.lat, geo.lng, 'torn', startYear, currentYear),
    fetchNoaaEvents(geo.lat, geo.lng, 'wind', startYear, currentYear),
  ])

  // 3. Build impact zone summary
  const totalEvents = hailFeatures.length + tornadoFeatures.length + windFeatures.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const severeHail = hailFeatures.filter((f: any) => (f.properties?.HAILSIZE || 0) >= 1.5)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxHailSize = hailFeatures.reduce((max: number, f: any) => Math.max(max, f.properties?.HAILSIZE || 0), 0)

  // Risk level
  let riskLevel = 'Low'
  if (severeHail.length >= 5 || tornadoFeatures.length >= 2 || totalEvents >= 20) riskLevel = 'Critical'
  else if (severeHail.length >= 2 || tornadoFeatures.length >= 1 || totalEvents >= 8) riskLevel = 'High'
  else if (totalEvents >= 3) riskLevel = 'Moderate'

  // 4. Build heatmap data for map overlay
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const impactPoints = hailFeatures.map((f: any) => ({
    lat: f.geometry?.coordinates?.[1] ?? geo.lat,
    lng: f.geometry?.coordinates?.[0] ?? geo.lng,
    size: f.properties?.HAILSIZE || 1,
    date: f.properties?.EVENT_DATE || null,
    type: 'hail',
    severity: (f.properties?.HAILSIZE || 0) >= 1.5 ? 'severe' : 'moderate',
  }))

  // 5. Year-by-year breakdown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byYear: Record<number, { hail: number; tornado: number; wind: number; maxHail: number }> = {}
  for (let y = startYear; y <= currentYear; y++) byYear[y] = { hail: 0, tornado: 0, wind: 0, maxHail: 0 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hailFeatures.forEach((f: any) => {
    const yr = parseInt((f.properties?.EVENT_DATE || '').slice(0, 4))
    if (byYear[yr]) {
      byYear[yr].hail++
      byYear[yr].maxHail = Math.max(byYear[yr].maxHail, f.properties?.HAILSIZE || 0)
    }
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tornadoFeatures.forEach((f: any) => {
    const yr = parseInt((f.properties?.EVENT_DATE || '').slice(0, 4))
    if (byYear[yr]) byYear[yr].tornado++
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  windFeatures.forEach((f: any) => {
    const yr = parseInt((f.properties?.EVENT_DATE || '').slice(0, 4))
    if (byYear[yr]) byYear[yr].wind++
  })

  // 6. Generate AI-scored leads using storm data
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  let leads: Array<{ address: string; reason: string; score: number; source: string; roofAge: number | null; stormHits: number }> = []

  if (anthropicKey) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey: anthropicKey })

      const stormSummary = `ZIP: ${zip} (${geo.city}, ${geo.state})
10-Year Storm History (${startYear}–${currentYear}):
- Total hail events: ${hailFeatures.length} (${severeHail.length} severe, 1.5"+ diameter)
- Max hail size recorded: ${maxHailSize.toFixed(2)}"
- Tornado events: ${tornadoFeatures.length}
- High wind events: ${windFeatures.length}
- Overall risk level: ${riskLevel}

Year-by-year breakdown:
${Object.entries(byYear).map(([yr, d]) => `  ${yr}: ${d.hail} hail${d.maxHail > 0 ? ` (max ${d.maxHail.toFixed(1)}")` : ''}, ${d.tornado} tornado, ${d.wind} wind`).join('\n')}`

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `You are Michael, the Directive CRM lead generation AI for roofing contractors.

${stormSummary}

Based on this 10-year storm impact data, generate 8 high-priority roofing leads for this ZIP code.

Rules:
- Leads are RESIDENTIAL properties (houses, not commercial)
- Score based on: storm frequency × roof age likelihood × market opportunity
- Properties built before 2005 = likely roof 20+ years old = top priority
- Areas with 1.5"+ hail = almost certain roof damage = score 85+
- Do NOT make up specific addresses — instead describe neighborhood types and street types that would be prime targets (e.g. "Older residential streets in the 35801 core", "Pre-2000 ranch homes near the storm corridor")
- Each lead should have a specific actionable reason

Return ONLY this JSON array, no other text:
[
  {
    "address": "Describe the target area/street type within ZIP ${zip}",
    "reason": "Specific reason this is a hot lead based on storm data",
    "score": 92,
    "source": "NOAA 10yr Storm Analysis",
    "roofAge": 22,
    "stormHits": 4
  }
]`
        }]
      })

      const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        leads = parsed.slice(0, 8)
      }
    } catch (e) {
      console.error('[michael/leads] AI error:', e)
    }
  }

  // Fallback leads if AI fails
  if (leads.length === 0) {
    leads = [
      { address: `Older residential neighborhoods in ZIP ${zip}`, reason: `${hailFeatures.length} hail events in 10 years — high probability of aging roofs`, score: 82, source: 'NOAA Storm Analysis', roofAge: null, stormHits: hailFeatures.length },
      { address: `Pre-2000 homes in ${geo.city || zip}`, reason: `Roofs 25+ years old + storm corridor intersection`, score: 78, source: 'Roof Age × Storm Data', roofAge: 25, stormHits: severeHail.length },
    ]
  }

  return NextResponse.json({
    zip,
    city: geo.city,
    state: geo.state,
    lat: geo.lat,
    lng: geo.lng,
    riskLevel,
    totalEvents,
    hailCount: hailFeatures.length,
    severeHailCount: severeHail.length,
    maxHailSize,
    tornadoCount: tornadoFeatures.length,
    windCount: windFeatures.length,
    byYear,
    impactPoints,
    leads,
    yearsAnalyzed: currentYear - startYear,
  })
}
