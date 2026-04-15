import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/apiAuth'

export const maxDuration = 60

// ─── Supabase (optional caching) ─────────────────────────────────────────────
function getSupabase() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    return createClient(url, key)
  } catch { return null }
}

// ─── Google Geocoding → county, state, formatted address ──────────────────────
interface GeoResult {
  lat: number
  lng: number
  formattedAddress: string
  county: string | null
  state: string | null
  city: string | null
  zip: string | null
  neighborhood: string | null
}

async function googleGeocode(address: string, apiKey: string): Promise<GeoResult | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    if (data.status !== 'OK' || !data.results[0]) return null
    const r = data.results[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const get = (t: string) => r.address_components.find((c: any) => c.types.includes(t))?.long_name ?? null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getS = (t: string) => r.address_components.find((c: any) => c.types.includes(t))?.short_name ?? null
    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formattedAddress: r.formatted_address,
      county: get('administrative_area_level_2'),
      state: getS('administrative_area_level_1'),
      city: get('locality') ?? get('sublocality_level_1'),
      zip: get('postal_code'),
      neighborhood: get('neighborhood'),
    }
  } catch { return null }
}

// ─── NOAA storm history ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchStormHistory(lat: number, lng: number): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = {
    hailEvents: [], totalHailEvents: 0, maxHailSize: null, lastHailDate: null, severeHailCount: 0,
    tornadoEvents: [], totalTornadoEvents: 0, lastTornadoDate: null,
    windEvents: [], totalWindEvents: 0, maxWindSpeed: null, lastWindDate: null,
    stormRiskLevel: 'unknown',
  }
  const fmtDate = (d: Date) => d.toISOString().split('T')[0].replace(/-/g, '')
  const endDate = new Date()
  const startDate = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000)
  const end = fmtDate(endDate)
  const start = fmtDate(startDate)
  const h = { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' }

  // Fetch PLSR events (spotter-reported)
  const allR = await Promise.allSettled([
    fetch(`https://www.ncei.noaa.gov/swdiws/json/plsr/${start}:${end}?lat=${lat}&lon=${lng}&r=25`, { headers: h, signal: AbortSignal.timeout(7000) }).then(r => r.ok ? r.json() : null),
  ])

  const allData = allR[0].status === 'fulfilled' ? allR[0].value : null
  const events = allData?.result || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hailEvents = events.filter((e: any) => e.TYPECODE === 'H')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tornadoEvents = events.filter((e: any) => e.TYPECODE === 'T')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windEvents = events.filter((e: any) => e.TYPECODE === 'G' || e.TYPECODE === 'D')

  if (hailEvents.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.hailEvents = hailEvents.slice(0, 20).map((x: any) => ({ date: x.ZTIME || null, size: x.MAGNITUDE ? parseFloat(x.MAGNITUDE) : null, severity: (x.MAGNITUDE && parseFloat(x.MAGNITUDE) >= 2) ? 'severe' : 'moderate' }))
    out.totalHailEvents = hailEvents.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.maxHailSize = Math.max(...hailEvents.map((x: any) => x.MAGNITUDE ? parseFloat(x.MAGNITUDE) : 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.lastHailDate = [...hailEvents].sort((a: any, b: any) => (b.ZTIME || '').localeCompare(a.ZTIME || ''))[0]?.ZTIME || null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.severeHailCount = hailEvents.filter((x: any) => x.MAGNITUDE && parseFloat(x.MAGNITUDE) >= 1).length
  }

  if (tornadoEvents.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.tornadoEvents = tornadoEvents.slice(0, 10).map((x: any) => ({ date: x.ZTIME || null, magnitude: x.MAGNITUDE || null }))
    out.totalTornadoEvents = tornadoEvents.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.lastTornadoDate = [...tornadoEvents].sort((a: any, b: any) => (b.ZTIME || '').localeCompare(a.ZTIME || ''))[0]?.ZTIME || null
  }

  if (windEvents.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.windEvents = windEvents.slice(0, 20).map((x: any) => ({ date: x.ZTIME || null, speed: x.MAGNITUDE ? parseFloat(x.MAGNITUDE) : null }))
    out.totalWindEvents = windEvents.length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.maxWindSpeed = Math.max(...windEvents.map((x: any) => x.MAGNITUDE ? parseFloat(x.MAGNITUDE) : 0))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.lastWindDate = [...windEvents].sort((a: any, b: any) => (b.ZTIME || '').localeCompare(a.ZTIME || ''))[0]?.ZTIME || null
  }

  const total = out.totalHailEvents + out.totalTornadoEvents + out.totalWindEvents
  if (total >= 10 || out.totalTornadoEvents >= 2 || out.severeHailCount >= 5) out.stormRiskLevel = 'high'
  else if (total >= 3 || out.severeHailCount >= 1) out.stormRiskLevel = 'moderate'
  else if (total > 0) out.stormRiskLevel = 'low'
  else out.stormRiskLevel = 'none'
  return out
}

// ─── Enformion AddressIDPlus ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enformionAddressIDPlus(address: string): Promise<any> {
  const apName = process.env.ENFORMION_AP_NAME
  const apPassword = process.env.ENFORMION_AP_PASSWORD
  if (!apName || !apPassword) return null

  try {
    // Split address into line1 / line2
    const parts = address.split(',')
    const addressLine1 = parts[0]?.trim() ?? address
    const addressLine2 = parts.slice(1).join(',').trim()

    const res = await fetch('https://devapi.enformion.com/addressidplus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'galaxy-ap-name': apName,
        'galaxy-ap-password': apPassword,
        'galaxy-search-type': 'DevAPIAddressIDPlus',
      },
      body: JSON.stringify({ addressLine1, addressLine2 }),
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      console.warn('[enformion] AddressIDPlus status:', res.status)
      return null
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    console.log('[enformion] AddressIDPlus raw keys:', Object.keys(data || {}))
    return data
  } catch (e) {
    console.warn('[enformion] AddressIDPlus error:', e)
    return null
  }
}

// ─── Enformion PropertyV2 ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enformionPropertyV2(address: string): Promise<any> {
  const apName = process.env.ENFORMION_AP_NAME
  const apPassword = process.env.ENFORMION_AP_PASSWORD
  if (!apName || !apPassword) return null

  try {
    const parts = address.split(',')
    const addressLine1 = parts[0]?.trim() ?? address
    const addressLine2 = parts.slice(1).join(',').trim()

    const res = await fetch('https://devapi.enformion.com/propertyv2search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'galaxy-ap-name': apName,
        'galaxy-ap-password': apPassword,
        'galaxy-search-type': 'PropertyV2',
      },
      body: JSON.stringify({ FirstName: '', LastName: '', AddressLine1: addressLine1, AddressLine2: addressLine2, Page: 1, ResultsPerPage: 10 }),
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      console.warn('[enformion] PropertyV2 status:', res.status)
      return null
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json()
    console.log('[enformion] PropertyV2 raw keys:', Object.keys(data || {}))
    return data
  } catch (e) {
    console.warn('[enformion] PropertyV2 error:', e)
    return null
  }
}

// ─── Parse Enformion results into our field schema ────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEnformion(addressPlus: any, propertyV2: any): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}

  // PropertyV2 — actual response is an array at top level
  // Each item: { poseidonId, property: { summary: { currentOwners, propertyDetails, propertyValue, ... } } }
  if (propertyV2) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = propertyV2?.propertyV2Records || (Array.isArray(propertyV2) ? propertyV2 : [])
    const item = items[0]
    const summary = item?.property?.summary

    if (summary) {
      // Owner name — from currentOwners array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const owners: any[] = summary.currentOwners || []
      if (owners.length > 0) {
        out.ownerName = owners[0]?.name?.fullName || null
      }

      // Occupancy
      if (summary.isOwnerOccupied === true) out.occupancyType = 'Owner Occupied'
      else if (summary.isOwnerOccupied === false) out.occupancyType = 'Rental'
      const occCode = summary.currentOwnerMetaData?.ownerOccupancyCode
      if (occCode === 'O') out.occupancyType = 'Owner Occupied'
      else if (occCode === 'R') out.occupancyType = 'Rental'

      // Property details
      const details = summary.propertyDetails || {}
      if (details.yearBuilt) out.yearBuilt = parseInt(details.yearBuilt)
      if (details.livingArea) out.sqft = parseInt(details.livingArea)
      if (details.squareFootage && !out.sqft) out.sqft = parseInt(details.squareFootage)
      if (details.lotSize) out.lotSqft = parseInt(details.lotSize)
      if (details.beds && parseInt(details.beds) > 0) out.bedrooms = parseInt(details.beds)
      if (details.baths) out.bathrooms = parseFloat(details.baths)
      if (details.type) out.propertyClass = details.type

      // Property value
      const val = summary.propertyValue || {}
      if (val.assessedValue) out.assessedValue = Math.round(parseFloat(String(val.assessedValue)))
      if (val.marketValue) out.marketValue = Math.round(parseFloat(String(val.marketValue)))
      if (val.appraisedTotalValue) out.appraisedValue = Math.round(parseFloat(String(val.appraisedTotalValue)))
      if (val.taxAmount) out.taxAnnual = Math.round(parseFloat(String(val.taxAmount)))

      // Last sale
      const purchase = summary.purchasePrice || {}
      if (purchase.price) out.lastSalePrice = Math.round(parseFloat(String(purchase.price)))
      if (purchase.date) out.lastSaleDate = purchase.date

      // Parcel / identification
      const ident = summary.propertyIdentification || {}
      if (ident.apnUnformatted) out.parcelId = ident.apnUnformatted
      if (ident.landUseCodeDescription) out.landUse = ident.landUseCodeDescription

      // Address / county
      const addr = summary.address || {}
      if (addr.county) out.county = addr.county

      console.log(`[enformion] Parsed: owner=${out.ownerName}, yearBuilt=${out.yearBuilt}, market=$${out.marketValue}`)
    }
  }

  // AddressIDPlus — for phone, email, age, consumer insights
  if (addressPlus) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matches: any[] = Array.isArray(addressPlus) ? addressPlus : (addressPlus?.results || addressPlus?.matches || addressPlus?.data || [])
    const match = matches[0]
    if (match) {
      // Phone
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const phoneList = match?.phones || match?.Phones || match?.phoneNumbers || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phoneList.slice(0, 1).forEach((p: any) => {
        const num = p?.phoneNumber || p?.PhoneNumber || p?.number || ''
        const d = String(num).replace(/\D/g, '')
        if (d.length === 10) out.ownerPhone = `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
        else if (d.length === 11 && d[0] === '1') out.ownerPhone = `${d.slice(1,4)}-${d.slice(4,7)}-${d.slice(7)}`
      })

      // Email
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const emailList = match?.emails || match?.Emails || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emailList.slice(0, 1).forEach((e: any) => {
        if (e?.email || e?.Email) out.ownerEmail = e?.email || e?.Email
      })

      // Age
      if (match?.age || match?.Age) out.ownerAge = parseInt(match?.age || match?.Age)

      // Consumer insights
      const insights = match?.consumerInsights || match?.ConsumerInsights || match?.marketingData || {}
      if (insights?.estimatedCurrentHomeValue && !out.marketValue) {
        out.marketValue = parseInt(String(insights.estimatedCurrentHomeValue).replace(/\D/g, ''))
      }
    }
  }

  return out
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const t0 = Date.now()

  // Require authenticated user so we can attach owner_id to the cache row.
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response
  const ownerId = auth.user.id

  const { address } = await request.json()
  if (!address?.trim()) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const mapsKey = process.env.MAPS_API_KEY

  if (!anthropicKey) {
    console.warn('[research] ANTHROPIC_API_KEY not set')
    return NextResponse.json({ jobId: null, status: 'done', data: {}, error: 'API key missing' })
  }

  // ─── Step 1: Google Geocoding (1-2s) ────────────────────────────────────
  const geo = mapsKey ? await googleGeocode(address, mapsKey) : null
  const lat = geo?.lat ?? null
  const lng = geo?.lng ?? null
  const formattedAddress = geo?.formattedAddress ?? address
  console.log(`[research] Geocode: ${Date.now() - t0}ms — ${formattedAddress}`)

  // ─── Step 2: Claude web search + NOAA storm (parallel) ──────────────────
  const client = new Anthropic({ apiKey: anthropicKey })

  const prompt = `You are researching a property for a roofing company CRM. Do EXACTLY 2 web searches and return all data you find.

PROPERTY ADDRESS: ${formattedAddress}

SEARCH 1 — Owner & property data:
Search: site:fastpeoplesearch.com "${formattedAddress}"
Extract: ownerName, ownerPhone (format XXX-XXX-XXXX), ownerEmail, ownerAge, yearBuilt, sqft, lotSqft, bedrooms, bathrooms, marketValue, lastSaleDate (YYYY-MM-DD), lastSalePrice, occupancyType, subdivision

SEARCH 2 — County tax records:
Search: "${formattedAddress}" county tax assessor parcel owner
Extract: county, parcelId, assessedValue, appraisedValue, taxAnnual, landUse, propertyClass, deedBook

After both searches, return ONLY this JSON in <json> tags:
<json>
{
  "ownerName": null,
  "ownerPhone": null,
  "ownerEmail": null,
  "ownerAge": null,
  "yearBuilt": null,
  "sqft": null,
  "lotSqft": null,
  "bedrooms": null,
  "bathrooms": null,
  "marketValue": null,
  "assessedValue": null,
  "appraisedValue": null,
  "lastSaleDate": null,
  "lastSalePrice": null,
  "listingStatus": null,
  "listingPrice": null,
  "hoaMonthly": null,
  "subdivision": null,
  "occupancyType": null,
  "propertyClass": null,
  "landUse": null,
  "deedDate": null,
  "deedType": null,
  "deedBook": null,
  "permitCount": null,
  "permitLastDate": null,
  "roofAgeYears": null,
  "roofAgeEstimated": false,
  "county": null,
  "parcelId": null,
  "taxAnnual": null,
  "neighborhood": null,
  "flags": [],
  "sources": {}
}
</json>
Compute roofAgeYears = 2026 - yearBuilt if yearBuilt found. Set roofAgeEstimated = true.
flags: include "old-roof" if roofAge>=20, "estimated-roof-age" if estimated, "high-value" if market>250000, "owner-occupied" or "rental" per occupancy.
sources: {"ownerName": "FastPeopleSearch"} etc.`

  // Helper: Execute Claude with tool loop for web search
  async function executeClaudeWithToolLoop(): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[] = [{ role: 'user', content: prompt }]
    let fullText = ''
    let iterationCount = 0
    const maxIterations = 5

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      betas: ['web-search-2025-03-05'],
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const }],
      messages,
    } as Parameters<typeof client.messages.create>[0])

    while (response.stop_reason === 'tool_use' && iterationCount < maxIterations) {
      iterationCount++

      // Collect any text from this response
      for (const block of response.content) {
        if (block.type === 'text') fullText += (block as any).text
      }

      // Build tool results for each tool_use block
      const toolResults = response.content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b.type === 'tool_use')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: '', // Anthropic handles the actual search
        }))

      if (toolResults.length === 0) break

      // Continue the conversation with assistant response + tool results
      messages = [
        ...messages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults },
      ]

      // Call again
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        betas: ['web-search-2025-03-05'],
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const }],
        messages,
      } as Parameters<typeof client.messages.create>[0])
    }

    // Get final text blocks
    for (const block of response.content) {
      if (block.type === 'text') fullText += (block as any).text
    }

    return fullText
  }

  const [claudeResult, stormResult, enformionAddressResult, enformionPropertyResult] = await Promise.allSettled([
    executeClaudeWithToolLoop(),
    (lat && lng) ? fetchStormHistory(lat, lng) : Promise.resolve(null),
    enformionAddressIDPlus(formattedAddress),
    enformionPropertyV2(formattedAddress),
  ])

  console.log(`[research] All parallel done: ${Date.now() - t0}ms`)

  const stormHistory = stormResult.status === 'fulfilled' ? stormResult.value : null

  // Parse Enformion results
  const enformionData = parseEnformion(
    enformionAddressResult.status === 'fulfilled' ? enformionAddressResult.value : null,
    enformionPropertyResult.status === 'fulfilled' ? enformionPropertyResult.value : null,
  )
  console.log(`[research] Enformion fields: ${Object.keys(enformionData).join(', ')}`)

  // ─── Step 3: Parse Claude response ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extracted: Record<string, any> = {}

  if (claudeResult.status === 'rejected') {
    const err = claudeResult.reason?.message || String(claudeResult.reason)
    console.error('[research] Claude failed:', err)
    // Don't return error — fall through with geocoded data + storm
  } else {
    const fullText = claudeResult.value as string

    console.log(`[research] Response text: ${fullText.length} chars`)

    // Extract JSON from response
    const tagMatch = fullText.match(/<json>\s*([\s\S]*?)\s*<\/json>/)
    const braceMatch = fullText.match(/\{[\s\S]*?"ownerName"[\s\S]*?\}/)
    const jsonStr = tagMatch?.[1] ?? braceMatch?.[0] ?? ''

    if (jsonStr) {
      try { extracted = JSON.parse(jsonStr) }
      catch { try { extracted = JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1')) } catch { /* ignore */ } }
    } else {
      console.warn('[research] No JSON found in response. Preview:', fullText.slice(0, 400))
    }
  }

  // ─── Step 4: Merge Enformion (authoritative) over Claude results ─────────
  // Enformion wins for owner/property fields — it's a paid structured database
  for (const [key, val] of Object.entries(enformionData)) {
    if (val !== null && val !== undefined) extracted[key] = val
  }

  // ─── Step 4b: Sanitize extracted data ────────────────────────────────────
  if (extracted.ownerPhone) {
    const d = String(extracted.ownerPhone).replace(/\D/g, '')
    if (d.length === 10) extracted.ownerPhone = `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
    else if (d.length === 11 && d[0] === '1') extracted.ownerPhone = `${d.slice(1,4)}-${d.slice(4,7)}-${d.slice(7)}`
    else extracted.ownerPhone = null
  }
  const toMoney = (v: unknown): number | null => {
    if (!v) return null
    const n = typeof v === 'string' ? parseFloat(String(v).replace(/[$,]/g, '')) : Number(v)
    return (!isNaN(n) && n > 0) ? Math.round(n) : null
  }
  const toInt = (v: unknown, min: number, max: number): number | null => {
    const n = parseInt(String(v ?? ''))
    return (!isNaN(n) && n >= min && n <= max) ? n : null
  }

  extracted.yearBuilt = toInt(extracted.yearBuilt, 1800, 2025)
  extracted.sqft = toInt(extracted.sqft, 100, 100000)
  extracted.lotSqft = toInt(extracted.lotSqft, 100, 5000000)
  extracted.bedrooms = toInt(extracted.bedrooms, 0, 30)
  extracted.bathrooms = toInt(extracted.bathrooms, 0, 30)
  extracted.ownerAge = toInt(extracted.ownerAge, 18, 120)
  extracted.permitCount = toInt(extracted.permitCount, 0, 100)
  extracted.marketValue = toMoney(extracted.marketValue)
  extracted.assessedValue = toMoney(extracted.assessedValue)
  extracted.appraisedValue = toMoney(extracted.appraisedValue)
  extracted.lastSalePrice = toMoney(extracted.lastSalePrice)
  extracted.listingPrice = toMoney(extracted.listingPrice)
  extracted.taxAnnual = toMoney(extracted.taxAnnual)
  extracted.hoaMonthly = toMoney(extracted.hoaMonthly)

  // Roof age from yearBuilt
  if (extracted.yearBuilt && !extracted.roofAgeYears) {
    extracted.roofAgeYears = 2026 - extracted.yearBuilt
    extracted.roofAgeEstimated = true
  }
  if (extracted.roofAgeYears) {
    const r = Math.round(parseFloat(String(extracted.roofAgeYears)))
    extracted.roofAgeYears = (!isNaN(r) && r >= 0 && r <= 150) ? r : null
  }

  // Flags
  const flags: string[] = Array.isArray(extracted.flags) ? [...extracted.flags] : []
  if (extracted.roofAgeEstimated && !flags.includes('estimated-roof-age')) flags.push('estimated-roof-age')
  if (typeof extracted.roofAgeYears === 'number' && extracted.roofAgeYears >= 20 && !flags.includes('old-roof')) flags.push('old-roof')
  if (typeof extracted.marketValue === 'number' && extracted.marketValue > 250000 && !flags.includes('high-value')) flags.push('high-value')

  // ─── Step 5: Merge all data — geocoded fields always win ────────────────
  const data: Record<string, unknown> = {
    ownerName: extracted.ownerName ?? null,
    ownerPhone: extracted.ownerPhone ?? null,
    ownerEmail: extracted.ownerEmail ?? null,
    ownerAge: extracted.ownerAge ?? null,
    yearBuilt: extracted.yearBuilt ?? null,
    sqft: extracted.sqft ?? null,
    lotSqft: extracted.lotSqft ?? null,
    bedrooms: extracted.bedrooms ?? null,
    bathrooms: extracted.bathrooms ?? null,
    marketValue: extracted.marketValue ?? null,
    assessedValue: extracted.assessedValue ?? null,
    appraisedValue: extracted.appraisedValue ?? null,
    lastSaleDate: extracted.lastSaleDate ?? null,
    lastSalePrice: extracted.lastSalePrice ?? null,
    listingStatus: extracted.listingStatus ?? null,
    listingPrice: extracted.listingPrice ?? null,
    hoaMonthly: extracted.hoaMonthly ?? null,
    subdivision: extracted.subdivision ?? null,
    occupancyType: extracted.occupancyType ?? null,
    propertyClass: extracted.propertyClass ?? null,
    landUse: extracted.landUse ?? null,
    deedDate: extracted.deedDate ?? null,
    deedType: extracted.deedType ?? null,
    deedBook: extracted.deedBook ?? null,
    permitCount: extracted.permitCount ?? null,
    permitLastDate: extracted.permitLastDate ?? null,
    roofAgeYears: extracted.roofAgeYears ?? null,
    roofAgeEstimated: extracted.roofAgeEstimated ?? false,
    // Geocoded fields always override extracted (more accurate)
    county: geo?.county ?? extracted.county ?? null,
    neighborhood: geo?.neighborhood ?? extracted.neighborhood ?? null,
    parcelId: extracted.parcelId ?? null,
    taxAnnual: extracted.taxAnnual ?? null,
    flags,
    sources: extracted.sources ?? {},
    // Attach storm history + coordinates
    stormHistory: stormHistory ?? null,
    geocoded_lat: lat,
    geocoded_lng: lng,
  }

  console.log(`[research] DONE: ${Date.now() - t0}ms — owner=${!!data.ownerName}, county=${data.county}, storm=${!!(data.stormHistory)}`)

  // Save to Supabase non-blocking
  const supabase = getSupabase()
  if (supabase) {
    Promise.resolve(
      supabase.from('research_jobs').insert({
        id: `research_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        owner_id: ownerId,
        address: formattedAddress,
        status: 'done',
        result: data,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    ).catch(() => { /* table may not exist — non-critical */ })
  }

  return NextResponse.json({ jobId: null, status: 'done', data })
}
