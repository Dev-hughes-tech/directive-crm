import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

// Supabase is optional — used for caching only. Research works without it.
function getSupabase() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    return createClient(url, key)
  } catch { return null }
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    )
    const data = await res.json()
    if (data.status === 'OK' && data.results[0]) {
      return data.results[0].geometry.location
    }
  } catch { /* silent */ }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchStormHistory(lat: number, lng: number): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stormData: any = {
    hailEvents: [], totalHailEvents: 0, maxHailSize: null, lastHailDate: null, severeHailCount: 0,
    tornadoEvents: [], totalTornadoEvents: 0, lastTornadoDate: null,
    windEvents: [], totalWindEvents: 0, maxWindSpeed: null, lastWindDate: null,
    stormRiskLevel: 'unknown',
  }

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const headers = { 'User-Agent': 'DirectiveCRM/1.0 (mazeratirecords@gmail.com)' }

  const [hailResult, tornadoResult, windResult] = await Promise.allSettled([
    fetch(`https://www.ncdc.noaa.gov/swdi/stormEvents/geojson/hail/${startDate}:${endDate}?lat=${lat}&lon=${lng}&r=10`, { headers, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null),
    fetch(`https://www.ncdc.noaa.gov/swdi/stormEvents/geojson/torn/${startDate}:${endDate}?lat=${lat}&lon=${lng}&r=25`, { headers, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null),
    fetch(`https://www.ncdc.noaa.gov/swdi/stormEvents/geojson/wind/${startDate}:${endDate}?lat=${lat}&lon=${lng}&r=10`, { headers, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null),
  ])

  const hailData = hailResult.status === 'fulfilled' ? hailResult.value : null
  if (hailData?.features?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = hailData.features as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.hailEvents = features.slice(0, 20).map((f: any) => ({ date: f.properties?.EVENT_DATE || null, size: f.properties?.HAILSIZE || null, severity: (f.properties?.HAILSIZE || 0) >= 2 ? 'severe' : (f.properties?.HAILSIZE || 0) >= 1 ? 'moderate' : 'minor' }))
    stormData.totalHailEvents = features.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.maxHailSize = Math.max(...features.map((f: any) => f.properties?.HAILSIZE || 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...features].sort((a: any, b: any) => (b.properties?.EVENT_DATE || '').localeCompare(a.properties?.EVENT_DATE || ''))
    stormData.lastHailDate = sorted[0]?.properties?.EVENT_DATE || null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.severeHailCount = features.filter((f: any) => (f.properties?.HAILSIZE || 0) >= 1).length
  }

  const torData = tornadoResult.status === 'fulfilled' ? tornadoResult.value : null
  if (torData?.features?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = torData.features as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.tornadoEvents = features.slice(0, 10).map((f: any) => ({ date: f.properties?.EVENT_DATE || null, magnitude: f.properties?.TOR_F_SCALE || f.properties?.TOR_SCALE || null }))
    stormData.totalTornadoEvents = features.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...features].sort((a: any, b: any) => (b.properties?.EVENT_DATE || '').localeCompare(a.properties?.EVENT_DATE || ''))
    stormData.lastTornadoDate = sorted[0]?.properties?.EVENT_DATE || null
  }

  const windData = windResult.status === 'fulfilled' ? windResult.value : null
  if (windData?.features?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = windData.features as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.windEvents = features.slice(0, 20).map((f: any) => ({ date: f.properties?.EVENT_DATE || null, speed: f.properties?.WIND_SPEED || null }))
    stormData.totalWindEvents = features.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.maxWindSpeed = Math.max(...features.map((f: any) => f.properties?.WIND_SPEED || 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...features].sort((a: any, b: any) => (b.properties?.EVENT_DATE || '').localeCompare(a.properties?.EVENT_DATE || ''))
    stormData.lastWindDate = sorted[0]?.properties?.EVENT_DATE || null
  }

  const total = stormData.totalHailEvents + stormData.totalTornadoEvents + stormData.totalWindEvents
  if (total >= 10 || stormData.totalTornadoEvents >= 2 || stormData.severeHailCount >= 5) stormData.stormRiskLevel = 'high'
  else if (total >= 3 || stormData.severeHailCount >= 1) stormData.stormRiskLevel = 'moderate'
  else if (total > 0) stormData.stormRiskLevel = 'low'
  else stormData.stormRiskLevel = 'none'

  return stormData
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const { address } = await request.json()
  if (!address?.trim()) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    // No API key — return minimal result so frontend can still save the property
    console.warn('[research] ANTHROPIC_API_KEY not set — returning empty data')
    return NextResponse.json({ jobId: null, status: 'done', data: {}, error: 'API key not configured' })
  }

  // Try to create Supabase job record (optional — research works without it)
  const supabase = getSupabase()
  let jobId: string | null = null
  if (supabase) {
    try {
      const { data: job } = await supabase
        .from('research_jobs')
        .insert({ address, status: 'running' })
        .select('id')
        .single()
      jobId = job?.id || null
    } catch (e) {
      console.warn('Supabase research_jobs unavailable, running in direct mode:', e)
    }
  }

  // Geocode
  const geocoded = await geocodeAddress(address)
  console.log(`[research] Geocode done: ${Date.now() - startTime}ms`)

  // Build prompt
  const prompt = `Research this property address. Do exactly 2 web searches. Return structured JSON.

ADDRESS: ${address}

SEARCH 1: FastPeopleSearch
Search: site:fastpeoplesearch.com "${address}"
Extract: ownerName, ownerPhone (XXX-XXX-XXXX), ownerEmail, ownerAge, marketValue (integer), lastSalePrice (integer), lastSaleDate (YYYY-MM-DD), yearBuilt (integer), sqft (integer), lotSqft (integer), bedrooms (integer), bathrooms (integer), occupancyType, subdivision, propertyClass

SEARCH 2: County Tax Assessor
Search: "${address}" county tax assessor property owner parcel
Extract: ownerName (legal owner — use if different from above), county, parcelId, assessedValue (integer), appraisedValue (integer), taxAnnual (integer), landUse, deedBook

After searches, compute:
- roofAgeYears: (2026 - yearBuilt) if yearBuilt exists, else null
- roofAgeEstimated: true if calculated from yearBuilt
- flags: ["old-roof"] if roofAge>=20, ["estimated-roof-age"] always if estimated, ["high-value"] if market>250000, ["owner-occupied"] or ["rental"] based on occupancy, ["recently-sold"] if lastSale within 2 years of 2026

Return ONLY this JSON inside <json> tags, no other text:
<json>
{
  "ownerName": null, "ownerPhone": null, "ownerEmail": null, "ownerAge": null,
  "yearBuilt": null, "sqft": null, "lotSqft": null, "bedrooms": null, "bathrooms": null,
  "marketValue": null, "assessedValue": null, "appraisedValue": null,
  "lastSaleDate": null, "lastSalePrice": null,
  "listingStatus": null, "listingPrice": null, "hoaMonthly": null,
  "subdivision": null, "occupancyType": null, "propertyClass": null, "landUse": null,
  "deedDate": null, "deedType": null, "deedBook": null,
  "permitCount": null, "permitLastDate": null,
  "roofAgeYears": null, "roofAgeEstimated": false,
  "county": null, "parcelId": null, "taxAnnual": null, "neighborhood": null,
  "flags": [], "sources": {}
}
</json>`

  // Run Michael AI + NOAA in parallel, with a 50s timeout on Claude
  const client = new Anthropic({ apiKey: anthropicKey })

  const claudeTimeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Claude timeout after 50s')), 50000)
  )

  const [claudeResult, stormResult] = await Promise.allSettled([
    Promise.race([
      client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
      claudeTimeout,
    ]),
    geocoded ? fetchStormHistory(geocoded.lat, geocoded.lng) : Promise.resolve(null),
  ])

  console.log(`[research] Michael + NOAA done: ${Date.now() - startTime}ms`)

  // Handle Claude failure — return done with empty data so property still gets created
  if (claudeResult.status === 'rejected') {
    const msg = claudeResult.reason?.message || String(claudeResult.reason)
    console.error('[research] Claude failed:', msg)
    // Include storm data if we have it
    const partialData: Record<string, unknown> = {}
    const stormFallback = stormResult.status === 'fulfilled' ? stormResult.value : null
    if (stormFallback) partialData.stormHistory = stormFallback
    if (geocoded) { partialData.geocoded_lat = geocoded.lat; partialData.geocoded_lng = geocoded.lng }
    return NextResponse.json({ jobId, status: 'done', data: partialData, error: msg })
  }

  const response = claudeResult.value

  // Collect text from all blocks
  let fullText = ''
  for (const block of response.content) {
    if (block.type === 'text') fullText += block.text
  }

  console.log(`[research] Raw text length: ${fullText.length}, stop: ${response.stop_reason}`)

  // Build partial data helper for graceful fallbacks
  const buildPartialData = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d: any = {}
    const storm = stormResult.status === 'fulfilled' ? stormResult.value : null
    if (storm) d.stormHistory = storm
    if (geocoded) { d.geocoded_lat = geocoded.lat; d.geocoded_lng = geocoded.lng }
    return d
  }

  if (!fullText.trim()) {
    const msg = `No text output. Stop: ${response.stop_reason}`
    console.error('[research]', msg)
    return NextResponse.json({ jobId, status: 'done', data: buildPartialData(), error: msg })
  }

  // Extract JSON
  let jsonStr = ''
  const tagMatch = fullText.match(/<json>\s*([\s\S]*?)\s*<\/json>/)
  if (tagMatch) {
    jsonStr = tagMatch[1]
  } else {
    const braceMatch = fullText.match(/\{[\s\S]*"ownerName"[\s\S]*\}/)
    if (braceMatch) jsonStr = braceMatch[0]
  }

  if (!jsonStr) {
    const msg = 'No JSON block found — returning storm data only'
    console.warn('[research]', msg, '\nPreview:', fullText.slice(0, 300))
    return NextResponse.json({ jobId, status: 'done', data: buildPartialData(), error: msg })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any
  try {
    data = JSON.parse(jsonStr)
  } catch {
    try {
      data = JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1'))
    } catch (e) {
      console.warn('[research] JSON parse failed, returning storm data only:', e)
      return NextResponse.json({ jobId, status: 'done', data: buildPartialData(), error: `JSON parse failed: ${e}` })
    }
  }

  // Sanitize
  if (data.ownerPhone) {
    const d = String(data.ownerPhone).replace(/\D/g, '')
    if (d.length === 10) data.ownerPhone = `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
    else if (d.length === 11 && d[0] === '1') data.ownerPhone = `${d.slice(1,4)}-${d.slice(4,7)}-${d.slice(7)}`
    else data.ownerPhone = null
  }
  const yr = parseInt(data.yearBuilt); data.yearBuilt = (yr >= 1800 && yr <= 2026) ? yr : null
  const toNum = (v: unknown, min: number) => { const n = typeof v === 'string' ? parseFloat((v as string).replace(/[$,]/g, '')) : Number(v); return (!isNaN(n) && n >= min) ? Math.round(n) : null }
  data.marketValue = toNum(data.marketValue, 5000)
  data.assessedValue = toNum(data.assessedValue, 1000)
  data.appraisedValue = toNum(data.appraisedValue, 1000)
  data.lastSalePrice = toNum(data.lastSalePrice, 100)
  data.listingPrice = toNum(data.listingPrice, 100)
  data.taxAnnual = toNum(data.taxAnnual, 0)
  data.hoaMonthly = toNum(data.hoaMonthly, 0)
  const toInt = (v: unknown, min: number, max: number) => { const n = parseInt(String(v)); return (!isNaN(n) && n >= min && n <= max) ? n : null }
  data.sqft = toInt(data.sqft, 100, 50000)
  data.lotSqft = toInt(data.lotSqft, 100, 500000)
  data.bedrooms = toInt(data.bedrooms, 0, 20)
  data.bathrooms = toInt(data.bathrooms, 0, 20)
  data.ownerAge = toInt(data.ownerAge, 18, 120)
  if (data.roofAgeYears !== null) { const r = Math.round(parseFloat(data.roofAgeYears)); data.roofAgeYears = (!isNaN(r) && r >= 1 && r <= 100) ? r : null }
  if (data.permitCount !== null) { const p = parseInt(data.permitCount); data.permitCount = (!isNaN(p) && p >= 0) ? p : null }
  if (typeof data.roofAgeEstimated !== 'boolean') data.roofAgeEstimated = false

  // Merge geocode + storm
  if (geocoded) { data.geocoded_lat = geocoded.lat; data.geocoded_lng = geocoded.lng }
  const stormHistory = stormResult.status === 'fulfilled' ? stormResult.value : null
  if (stormHistory) data.stormHistory = stormHistory

  // Save to Supabase if available (non-blocking)
  if (supabase && jobId) {
    Promise.resolve(
      supabase.from('research_jobs')
        .update({ status: 'done', result: data, updated_at: new Date().toISOString() })
        .eq('id', jobId)
    )
      .then(() => console.log(`[research] Saved to Supabase in ${Date.now() - startTime}ms`))
      .catch((e: unknown) => console.warn('[research] Supabase save failed (non-critical):', e))
  }

  console.log(`[research] DONE in ${Date.now() - startTime}ms`)

  // Always return data directly — frontend doesn't need to poll
  return NextResponse.json({ jobId, status: 'done', data })
}
