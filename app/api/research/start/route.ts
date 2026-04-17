import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { requireUser, requireTier } from '@/lib/apiAuth'
import { classifyHailSeverity, countSevereHailEvents } from '@/lib/hailEvents'
import {
  buildIemLsrGeoJsonUrl,
  type IemLsrFeature,
  normalizeIemHistoricalEvents,
} from '@/lib/stormHistory'
import { generateId } from '@/lib/uuid'
import { normalizeResearchData } from '@/lib/researchNormalization'

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

interface IemLsrGeoJsonResponse {
  features?: IemLsrFeature[]
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
  const endDate = new Date()
  const startDate = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000)
  const url = buildIemLsrGeoJsonUrl({ lat, lng, radiusMiles: 25, start: startDate, end: endDate })

  let events = normalizeIemHistoricalEvents([])
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DirectiveCRM/1.0 (support@hughes-technologies.com)' },
      signal: AbortSignal.timeout(12000),
    })
    if (response.ok) {
      const payload = await response.json() as IemLsrGeoJsonResponse
      events = normalizeIemHistoricalEvents(payload.features || [])
    }
  } catch (error) {
    console.warn('[research] historical storm fetch error:', error)
  }

  const hailEvents = events.filter((event) => event.type === 'hail')
  const tornadoEvents = events.filter((event) => event.type === 'tornado')
  const windEvents = events.filter((event) => event.type === 'wind')

  if (hailEvents.length) {
    out.hailEvents = hailEvents.slice(0, 20).map((event) => ({
      date: event.date || null,
      size: event.size,
      severity: classifyHailSeverity(event.size),
    }))
    out.totalHailEvents = hailEvents.length
    out.maxHailSize = Math.max(...hailEvents.map((event) => event.size || 0))
    out.lastHailDate = [...hailEvents].sort((left, right) => (right.date || '').localeCompare(left.date || ''))[0]?.date || null
    out.severeHailCount = countSevereHailEvents(hailEvents, (event) => event.size)
  }

  if (tornadoEvents.length) {
    out.tornadoEvents = tornadoEvents.slice(0, 10).map((event) => ({ date: event.date || null, magnitude: event.magnitude || null }))
    out.totalTornadoEvents = tornadoEvents.length
    out.lastTornadoDate = [...tornadoEvents].sort((left, right) => (right.date || '').localeCompare(left.date || ''))[0]?.date || null
  }

  if (windEvents.length) {
    out.windEvents = windEvents.slice(0, 20).map((event) => ({ date: event.date || null, speed: event.magnitude }))
    out.totalWindEvents = windEvents.length
    out.maxWindSpeed = Math.max(...windEvents.map((event) => event.magnitude || 0))
    out.lastWindDate = [...windEvents].sort((left, right) => (right.date || '').localeCompare(left.date || ''))[0]?.date || null
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
      const phoneList = match?.phones || match?.Phones || match?.phoneNumbers || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      phoneList.slice(0, 1).forEach((p: any) => {
        const num = p?.phoneNumber || p?.PhoneNumber || p?.number || ''
        const d = String(num).replace(/\D/g, '')
        if (d.length === 10) out.ownerPhone = `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
        else if (d.length === 11 && d[0] === '1') out.ownerPhone = `${d.slice(1,4)}-${d.slice(4,7)}-${d.slice(7)}`
      })

      // Email
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
  const tierDenied = requireTier(auth, 'sweep')
  if (tierDenied) return tierDenied
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
Do not infer roofAgeYears from yearBuilt. Leave roofAgeYears null unless you explicitly found a roofing permit date.
roofAgeEstimated must remain false.
flags: include "old-roof" only if you found a permit-backed roof age >=20, "high-value" if market>250000, "owner-occupied" or "rental" per occupancy.
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
        if (block.type === 'text') fullText += block.text
      }

      // Build tool results for each tool_use block
      const toolResults = response.content
        .filter((block: { type: string; id?: string }): block is { type: 'tool_use'; id: string } => block.type === 'tool_use' && typeof block.id === 'string')
        .map((block: { type: 'tool_use'; id: string }) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
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
      if (block.type === 'text') fullText += block.text
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

  const normalized = normalizeResearchData(extracted)

  // ─── Step 5: Merge all data — geocoded fields always win ────────────────
  const data: Record<string, unknown> = {
    ownerName: normalized.ownerName ?? null,
    ownerPhone: normalized.ownerPhone ?? null,
    ownerEmail: normalized.ownerEmail ?? null,
    ownerAge: normalized.ownerAge ?? null,
    yearBuilt: normalized.yearBuilt ?? null,
    sqft: normalized.sqft ?? null,
    lotSqft: normalized.lotSqft ?? null,
    bedrooms: normalized.bedrooms ?? null,
    bathrooms: normalized.bathrooms ?? null,
    marketValue: normalized.marketValue ?? null,
    assessedValue: normalized.assessedValue ?? null,
    appraisedValue: normalized.appraisedValue ?? null,
    lastSaleDate: normalized.lastSaleDate ?? null,
    lastSalePrice: normalized.lastSalePrice ?? null,
    listingStatus: normalized.listingStatus ?? null,
    listingPrice: normalized.listingPrice ?? null,
    hoaMonthly: normalized.hoaMonthly ?? null,
    subdivision: normalized.subdivision ?? null,
    occupancyType: normalized.occupancyType ?? null,
    propertyClass: normalized.propertyClass ?? null,
    landUse: normalized.landUse ?? null,
    deedDate: normalized.deedDate ?? null,
    deedType: normalized.deedType ?? null,
    deedBook: normalized.deedBook ?? null,
    permitCount: normalized.permitCount ?? null,
    permitLastDate: normalized.permitLastDate ?? null,
    roofAgeYears: normalized.roofAgeYears ?? null,
    roofAgeEstimated: normalized.roofAgeEstimated ?? false,
    // Geocoded fields always override extracted (more accurate)
    county: geo?.county ?? normalized.county ?? null,
    neighborhood: geo?.neighborhood ?? normalized.neighborhood ?? null,
    parcelId: normalized.parcelId ?? null,
    taxAnnual: normalized.taxAnnual ?? null,
    flags: normalized.flags ?? [],
    sources: normalized.sources ?? {},
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
        id: generateId(),
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
