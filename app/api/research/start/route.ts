import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// Single-hop: create job, run Claude research, write result, return jobId.
// Frontend polls /api/research/status and gets 'done' on first check.
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
      const { lat, lng } = data.results[0].geometry.location
      return { lat, lng }
    }
  } catch { /* silent */ }
  return null
}

export async function POST(request: NextRequest) {
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

  const client = new Anthropic({ apiKey: anthropicKey })

  const prompt = `You are a property intelligence researcher for a roofing sales CRM. Research this address comprehensively using 6 targeted searches in order and return ALL available data.

TARGET ADDRESS: ${address}

SEARCH 1 — FASTPEOPLESEARCH (primary data source)
Search exactly: site:fastpeoplesearch.com "${address}"
OR navigate to: https://www.fastpeoplesearch.com/address/[street-number]-[street-name-hyphenated]_[city]-[state]
Example for "3519 Bermuda Rd SW Huntsville AL": https://www.fastpeoplesearch.com/address/3519-bermuda-rd-sw_huntsville-al

From the FastPeopleSearch page extract:
- ownerName: The FIRST person listed under "People Living at" (most recent resident/tenant)
- marketValue: The "Estimated Value" dollar amount (e.g. $151,000 → 151000)
- lastSalePrice: "Last Sale Amount" (e.g. $16,000 → 16000)
- lastSaleDate: "Last Sale Date" in YYYY-MM-DD format
- yearBuilt: "Year Built" integer
- sqft: "Square Feet" integer
- bedrooms: integer
- bathrooms: integer
- lotSqft: "Lot Size" integer
- occupancyType: "Owner Occupied" or "Rental" or null
- propertyClass: property classification if visible
- subdivision: subdivision name if visible

SEARCH 2 — COUNTY TAX ASSESSOR / GIS (authoritative owner data)
For North Alabama, search these county assessor sites IN ORDER:
- Madison County: site:qpublic.net/al/madison "[street number] [street name]" OR "madison county alabama tax assessor [address]"
- Limestone County: "limestone county alabama tax assessor [address]" OR site:qpublic.net/al/limestone "[address]"
- Morgan County: "morgan county alabama tax assessor [address]" OR site:qpublic.net/al/morgan "[address]"

Extract (overrides FPS if different — tax record is authoritative):
- ownerName: legal owner name (use if different from FPS)
- county: county name
- parcelId: parcel ID number
- assessedValue: assessed/appraised value
- appraisedValue: appraised value if different
- taxAnnual: annual property tax amount
- deedBook: deed book reference
- deedPage: deed page reference
- propertyClass: property class code
- landUse: land use type

SEARCH 3 — ZILLOW / REALTOR / REDFIN (market data)
Search: "[full address]" zillow OR realtor.com OR redfin
Extract:
- marketValue: Zestimate or estimated value (prefer over FPS if available)
- listingStatus: "for sale" / "listed" / "not listed" / null
- listingPrice: current listing price if for sale
- hoaMonthly: HOA monthly fee if applicable
- neighborhood: neighborhood name
- daysOnMarket: if listed

SEARCH 4 — PROPERTY DEEDS / PROBATE RECORDS
Search: "[county] county alabama deed records [owner name]" OR "[county] probate court property records"
Extract:
- deedDate: date of most recent deed in YYYY-MM-DD format
- deedType: warranty deed / quit-claim / other type
- grantor: grantor name from deed
- grantee: grantee name from deed

SEARCH 5 — BUILDING/ROOFING PERMITS (critical for roof age)
Search: "[city] [state] building permit [street number] [street name]" OR "[county] county building permits [address]"
Extract:
- permitCount: total number of permits on record
- permitLastDate: date of most recent ROOF permit specifically in YYYY-MM-DD format
- roofAgeYears: 2026 minus the year from permitLastDate (e.g. roof permit 2010 = roofAgeYears 16)
- roofAgeEstimated: false if permit found, true if estimated from yearBuilt
- NOTE: if no roof permit found, set roofAgeEstimated=true and roofAgeYears=(2026-yearBuilt) only if yearBuilt exists

SEARCH 6 — OWNER CONTACT INFO (phone & email)
Search: "[ownerName]" "[city]" "[state]" site:fastpeoplesearch.com OR whitepages.com
Also try: "[ownerName]" "[city]" "[state]" phone OR email
Extract:
- ownerPhone: XXX-XXX-XXXX format only, null if uncertain
- ownerEmail: valid email address, null if uncertain
- ownerAge: age if available, null otherwise

OUTPUT RULES — STRICT:
- null for any value not explicitly found. Never guess or estimate (except roof age when properly flagged).
- ownerPhone: XXX-XXX-XXXX format only, null if uncertain
- roofAgeYears: integer from permit date ONLY, OR (2026 - yearBuilt) if roofAgeEstimated=true
- roofAgeEstimated: false if permit-derived, true if derived from yearBuilt
- marketValue / assessedValue / lastSalePrice / listingPrice / appraisedValue / taxAnnual / hoaMonthly: plain integers (no $ or commas)
- yearBuilt: 4-digit integer 1800–2026 only
- flags array: may include "old-roof" "high-value" "investor-owned" "owner-occupied" "rental" "vacant" "cash-buyer" "recently-sold" "listed-for-sale" "estimated-roof-age"
- sources: record the URL/site for every non-null field extracted

Return ONLY this JSON inside <json> tags, nothing else after the closing tag:

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
</json>`

  let response
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    })
  } catch (apiError: unknown) {
    const msg = apiError instanceof Error ? apiError.message : String(apiError)
    console.error('Anthropic API error:', msg)
    await supabase
      .from('research_jobs')
      .update({ status: 'error', error_message: `Claude API failed: ${msg}`, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return NextResponse.json({ jobId, status: 'error' })
  }

  // Collect text output
  let fullText = ''
  for (const block of response.content) {
    if (block.type === 'text') fullText += block.text
  }

  if (!fullText.trim()) {
    const msg = `No text output. Stop: ${response.stop_reason}. Types: ${response.content.map((b: { type: string }) => b.type).join(',')}`
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
    const msg = 'No JSON block found in response'
    console.error(msg, fullText.slice(0, 500))
    await supabase
      .from('research_jobs')
      .update({ status: 'error', error_message: msg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return NextResponse.json({ jobId, status: 'error' })
  }

  let data
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

  // Sanitize fields
  if (data.ownerPhone) {
    const d = String(data.ownerPhone).replace(/\D/g, '')
    if (d.length === 10) data.ownerPhone = `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`
    else if (d.length === 11 && d[0] === '1') data.ownerPhone = `${d.slice(1,4)}-${d.slice(4,7)}-${d.slice(7)}`
    else data.ownerPhone = null
  }
  const yr = parseInt(data.yearBuilt); data.yearBuilt = (yr >= 1800 && yr <= 2026) ? yr : null
  const toNum = (v: unknown, min: number) => { const n = typeof v === 'string' ? parseFloat((v as string).replace(/[$,]/g, '')) : Number(v); return (!isNaN(n) && n >= min) ? Math.round(n) : null }
  data.marketValue   = toNum(data.marketValue, 5000)
  data.assessedValue = toNum(data.assessedValue, 1000)
  data.appraisedValue = toNum(data.appraisedValue, 1000)
  data.lastSalePrice = toNum(data.lastSalePrice, 100)
  data.listingPrice = toNum(data.listingPrice, 100)
  data.taxAnnual = toNum(data.taxAnnual, 0)
  data.hoaMonthly = toNum(data.hoaMonthly, 0)

  // Integer fields with range validation
  const toInt = (v: unknown, min: number, max: number) => { const n = parseInt(String(v)); return (!isNaN(n) && n >= min && n <= max) ? n : null }
  data.sqft = toInt(data.sqft, 100, 50000)
  data.lotSqft = toInt(data.lotSqft, 100, 500000)
  data.bedrooms = toInt(data.bedrooms, 0, 20)
  data.bathrooms = toInt(data.bathrooms, 0, 20)
  data.ownerAge = toInt(data.ownerAge, 18, 120)

  if (data.roofAgeYears !== null) {
    const r = Math.round(parseFloat(data.roofAgeYears))
    data.roofAgeYears = (!isNaN(r) && r >= 1 && r <= 60) ? r : null
  }
  if (data.permitCount !== null) {
    const p = parseInt(data.permitCount); data.permitCount = (!isNaN(p) && p >= 0) ? p : null
  }

  // String fields - just trim
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

  // Boolean field
  if (typeof data.roofAgeEstimated !== 'boolean') {
    data.roofAgeEstimated = false
  }

  // Geocode for lat/lng
  const geocoded = await geocodeAddress(address)
  if (geocoded) { data.geocoded_lat = geocoded.lat; data.geocoded_lng = geocoded.lng }

  // Write result
  await supabase
    .from('research_jobs')
    .update({
      status: 'done',
      result: data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  return NextResponse.json({ jobId, status: 'done' })
}
