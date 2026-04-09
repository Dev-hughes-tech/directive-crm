import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// Single-hop: geocode → Claude (2 searches) + NOAA storm (parallel) → write → return
// Total time budget: ~25-35 seconds (well under 60s Vercel limit)
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  // Run all 3 NOAA calls in parallel (each has 8s timeout)
  const [hailResult, tornadoResult, windResult] = await Promise.allSettled([
    // Hail within 10 miles
    fetch(`https://www.ncdc.noaa.gov/swdi/stormEvents/geojson/hail/${startDate}:${endDate}?lat=${lat}&lon=${lng}&r=10`, { headers, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null),
    // Tornadoes within 25 miles
    fetch(`https://www.ncdc.noaa.gov/swdi/stormEvents/geojson/torn/${startDate}:${endDate}?lat=${lat}&lon=${lng}&r=25`, { headers, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null),
    // Wind within 10 miles
    fetch(`https://www.ncdc.noaa.gov/swdi/stormEvents/geojson/wind/${startDate}:${endDate}?lat=${lat}&lon=${lng}&r=10`, { headers, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null),
  ])

  // Process hail
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hailData = hailResult.status === 'fulfilled' ? hailResult.value : null
  if (hailData?.features?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = hailData.features as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.hailEvents = features.slice(0, 20).map((f: any) => ({
      date: f.properties?.EVENT_DATE || null,
      size: f.properties?.HAILSIZE || null,
      severity: (f.properties?.HAILSIZE || 0) >= 2 ? 'severe' : (f.properties?.HAILSIZE || 0) >= 1 ? 'moderate' : 'minor',
    }))
    stormData.totalHailEvents = features.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.maxHailSize = Math.max(...features.map((f: any) => f.properties?.HAILSIZE || 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...features].sort((a: any, b: any) => (b.properties?.EVENT_DATE || '').localeCompare(a.properties?.EVENT_DATE || ''))
    stormData.lastHailDate = sorted[0]?.properties?.EVENT_DATE || null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.severeHailCount = features.filter((f: any) => (f.properties?.HAILSIZE || 0) >= 1).length
  }

  // Process tornadoes
  const torData = tornadoResult.status === 'fulfilled' ? tornadoResult.value : null
  if (torData?.features?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = torData.features as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.tornadoEvents = features.slice(0, 10).map((f: any) => ({
      date: f.properties?.EVENT_DATE || null,
      magnitude: f.properties?.TOR_F_SCALE || f.properties?.TOR_SCALE || null,
    }))
    stormData.totalTornadoEvents = features.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...features].sort((a: any, b: any) => (b.properties?.EVENT_DATE || '').localeCompare(a.properties?.EVENT_DATE || ''))
    stormData.lastTornadoDate = sorted[0]?.properties?.EVENT_DATE || null
  }

  // Process wind
  const windData = windResult.status === 'fulfilled' ? windResult.value : null
  if (windData?.features?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = windData.features as any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.windEvents = features.slice(0, 20).map((f: any) => ({
      date: f.properties?.EVENT_DATE || null,
      speed: f.properties?.WIND_SPEED || null,
    }))
    stormData.totalWindEvents = features.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stormData.maxWindSpeed = Math.max(...features.map((f: any) => f.properties?.WIND_SPEED || 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sorted = [...features].sort((a: any, b: any) => (b.properties?.EVENT_DATE || '').localeCompare(a.properties?.EVENT_DATE || ''))
    stormData.lastWindDate = sorted[0]?.properties?.EVENT_DATE || null
  }

  // Risk level
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

  // Create job record
  const { data: job, error: insertError } = await supabase
    .from('research_jobs')
    .insert({ address, status: 'running' })
    .select('id')
    .single()

  if (insertError || !job) {
    console.error('Failed to create research job:', insertError)
    return NextResponse.json({ error: 'Could not start research' }, { status: 500 })
  }

  const jobId = job.id

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    await supabase
      .from('research_jobs')
      .update({ status: 'error', error_message: 'ANTHROPIC_API_KEY not configured', updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return NextResponse.json({ jobId, status: 'error' })
  }

  // ─── STEP 1: Geocode (fast, ~1s) ──────────────────────────────────────────
  const geocoded = await geocodeAddress(address)
  console.log(`[research ${jobId}] Geocode: ${Date.now() - startTime}ms`)

  // ─── STEP 2: Claude research + NOAA storm data IN PARALLEL ─────────────────
  // Claude does ONLY 2 web searches (FastPeopleSearch + county assessor)
  // NOAA storm data comes from direct API calls — no web search needed
  const client = new Anthropic({ apiKey: anthropicKey })

  const prompt = `Research this property address. Do exactly 2 web searches — no more. Return structured JSON.

ADDRESS: ${address}

SEARCH 1: Go to FastPeopleSearch for this exact address.
Search: site:fastpeoplesearch.com "${address}"
From the page, extract ALL of these:
- ownerName (first person listed as current resident)
- ownerPhone (phone number in XXX-XXX-XXXX format)
- ownerEmail (if shown)
- ownerAge (age if shown)
- marketValue (Estimated Value as integer, e.g. $151,000 → 151000)
- lastSalePrice (Last Sale Amount as integer)
- lastSaleDate (YYYY-MM-DD)
- yearBuilt (integer)
- sqft (Square Feet integer)
- lotSqft (Lot Size integer)
- bedrooms (integer)
- bathrooms (integer)
- occupancyType ("Owner Occupied" or "Rental" or null)
- subdivision (if shown)
- propertyClass (if shown)

SEARCH 2: Find the county tax assessor record.
Search: "${address}" county tax assessor property owner parcel
Extract any of these that appear:
- ownerName (legal owner — use this over FPS if different, tax records are authoritative)
- county
- parcelId
- assessedValue (as integer)
- appraisedValue (as integer)
- taxAnnual (annual tax as integer)
- landUse
- deedBook (deed book/page reference)

AFTER SEARCHES — compute these from what you found:
- roofAgeYears: If yearBuilt exists, set to (2026 - yearBuilt). This is an estimate.
- roofAgeEstimated: true (since we don't have permit data)
- flags: array of applicable flags from: "old-roof" (roofAge>=20), "estimated-roof-age", "high-value" (market>250k), "investor-owned", "owner-occupied", "rental", "recently-sold" (lastSale within 2 years)

Return ONLY JSON inside <json> tags:
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

  // Run Claude + NOAA in parallel — this is the key optimization
  const [claudeResult, stormResult] = await Promise.allSettled([
    // Claude: 2 web searches (~15-25s)
    client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
    // NOAA: 3 parallel API calls (~5-8s)
    geocoded ? fetchStormHistory(geocoded.lat, geocoded.lng) : Promise.resolve(null),
  ])

  console.log(`[research ${jobId}] Claude+NOAA parallel: ${Date.now() - startTime}ms`)

  // ─── STEP 3: Parse Claude response ──────────────────────────────────────────
  if (claudeResult.status === 'rejected') {
    const msg = claudeResult.reason?.message || String(claudeResult.reason)
    console.error('Anthropic API error:', msg)
    await supabase
      .from('research_jobs')
      .update({ status: 'error', error_message: `Claude API failed: ${msg}`, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return NextResponse.json({ jobId, status: 'error' })
  }

  const response = claudeResult.value

  // Collect text output
  let fullText = ''
  for (const block of response.content) {
    if (block.type === 'text') fullText += block.text
  }

  if (!fullText.trim()) {
    const msg = `No text. Stop: ${response.stop_reason}. Blocks: ${response.content.map((b: { type: string }) => b.type).join(',')}`
    console.error(msg)
    await supabase
      .from('research_jobs')
      .update({ status: 'error', error_message: msg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return NextResponse.json({ jobId, status: 'error' })
  }

  // Parse JSON from <json> tags
  let jsonStr = ''
  const tagMatch = fullText.match(/<json>\s*([\s\S]*?)\s*<\/json>/)
  if (tagMatch) {
    jsonStr = tagMatch[1]
  } else {
    const braceMatch = fullText.match(/\{[\s\S]*"ownerName"[\s\S]*\}/)
    if (braceMatch) jsonStr = braceMatch[0]
  }

  if (!jsonStr) {
    const msg = 'No JSON block in response'
    console.error(msg, fullText.slice(0, 500))
    await supabase
      .from('research_jobs')
      .update({ status: 'error', error_message: msg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return NextResponse.json({ jobId, status: 'error' })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any
  try {
    data = JSON.parse(jsonStr)
  } catch {
    try {
      data = JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1'))
    } catch (e) {
      const msg = `JSON parse failed: ${e}`
      console.error(msg, jsonStr.slice(0, 400))
      await supabase
        .from('research_jobs')
        .update({ status: 'error', error_message: msg, updated_at: new Date().toISOString() })
        .eq('id', jobId)
      return NextResponse.json({ jobId, status: 'error' })
    }
  }

  // ─── STEP 4: Sanitize all fields ───────────────────────────────────────────
  // Phone
  if (data.ownerPhone) {
    const d = String(data.ownerPhone).replace(/\D/g, '')
    if (d.length === 10) data.ownerPhone = `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
    else if (d.length === 11 && d[0] === '1') data.ownerPhone = `${d.slice(1,4)}-${d.slice(4,7)}-${d.slice(7)}`
    else data.ownerPhone = null
  }

  // Year
  const yr = parseInt(data.yearBuilt); data.yearBuilt = (yr >= 1800 && yr <= 2026) ? yr : null

  // Currency / numeric
  const toNum = (v: unknown, min: number) => { const n = typeof v === 'string' ? parseFloat((v as string).replace(/[$,]/g, '')) : Number(v); return (!isNaN(n) && n >= min) ? Math.round(n) : null }
  data.marketValue = toNum(data.marketValue, 5000)
  data.assessedValue = toNum(data.assessedValue, 1000)
  data.appraisedValue = toNum(data.appraisedValue, 1000)
  data.lastSalePrice = toNum(data.lastSalePrice, 100)
  data.listingPrice = toNum(data.listingPrice, 100)
  data.taxAnnual = toNum(data.taxAnnual, 0)
  data.hoaMonthly = toNum(data.hoaMonthly, 0)

  // Integers
  const toInt = (v: unknown, min: number, max: number) => { const n = parseInt(String(v)); return (!isNaN(n) && n >= min && n <= max) ? n : null }
  data.sqft = toInt(data.sqft, 100, 50000)
  data.lotSqft = toInt(data.lotSqft, 100, 500000)
  data.bedrooms = toInt(data.bedrooms, 0, 20)
  data.bathrooms = toInt(data.bathrooms, 0, 20)
  data.ownerAge = toInt(data.ownerAge, 18, 120)

  // Roof age
  if (data.roofAgeYears !== null) {
    const r = Math.round(parseFloat(data.roofAgeYears))
    data.roofAgeYears = (!isNaN(r) && r >= 1 && r <= 100) ? r : null
  }
  if (data.permitCount !== null) {
    const p = parseInt(data.permitCount); data.permitCount = (!isNaN(p) && p >= 0) ? p : null
  }

  // Strings
  const toStr = (v: unknown) => typeof v === 'string' ? v.trim() || null : null
  data.deedDate = toStr(data.deedDate)
  data.listingStatus = toStr(data.listingStatus)
  data.occupancyType = toStr(data.occupancyType)
  data.propertyClass = toStr(data.propertyClass)
  data.landUse = toStr(data.landUse)
  data.deedType = toStr(data.deedType)
  data.deedBook = toStr(data.deedBook)
  data.subdivision = toStr(data.subdivision)
  data.neighborhood = toStr(data.neighborhood)

  // Boolean
  if (typeof data.roofAgeEstimated !== 'boolean') data.roofAgeEstimated = false

  // ─── STEP 5: Merge geocode + storm data ────────────────────────────────────
  if (geocoded) {
    data.geocoded_lat = geocoded.lat
    data.geocoded_lng = geocoded.lng
  }

  const stormHistory = stormResult.status === 'fulfilled' ? stormResult.value : null
  if (stormHistory) data.stormHistory = stormHistory

  // ─── STEP 6: Write to Supabase ─────────────────────────────────────────────
  await supabase
    .from('research_jobs')
    .update({ status: 'done', result: data, updated_at: new Date().toISOString() })
    .eq('id', jobId)

  console.log(`[research ${jobId}] DONE in ${Date.now() - startTime}ms`)
  return NextResponse.json({ jobId, status: 'done' })
}
