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

  const prompt = `You are a property intelligence researcher for a roofing sales CRM. Research this address and return structured JSON data. Be efficient — you have 4 targeted searches.

TARGET ADDRESS: ${address}

Parse the address to extract: street number, street name, city, state, zip.

SEARCH 1 — QPUBLIC / COUNTY TAX ASSESSOR (highest priority)
Primary search: site:qpublic.net "${address}"
Fallback search: "[city] [state] county tax assessor property search [street number] [street name]"
Goal: Open the actual property detail page. Extract: legal owner name (GRANTEE or OWNER field), parcel ID, assessed value, county, year built, last sale date, last sale price.
Alabama counties on qPublic: madison, jefferson, shelby, baldwin, montgomery, etc.

SEARCH 2 — ZILLOW / REALTOR / REDFIN
Search: "${address}" home value owner
Try zillow.com, realtor.com, redfin.com — whichever returns results first.
Extract: market value (Zestimate or estimate), last sale date, last sale price, year built (fill any gaps from Search 1).

SEARCH 3 — ROOFING PERMITS
Search: "[city] [state] building permit [street number] [street name] roof"
Also try: "[county] county permit search [address]"
Extract: most recent roof permit date. roofAgeYears = 2026 minus permit year. null if no permit found.

SEARCH 4 — OWNER CONTACT
If owner name found: search "[owner name] [city] [state]" on fastpeoplesearch.com OR whitepages.com
Extract: phone in XXX-XXX-XXXX format, email if listed. null if not found.

OUTPUT RULES — STRICT:
- null for any value not explicitly found. Never guess or estimate.
- ownerPhone: XXX-XXX-XXXX format only, null if uncertain
- roofAgeYears: integer from permit date ONLY. Never derive from yearBuilt.
- marketValue / assessedValue / lastSalePrice: plain integer (no $ or commas)
- yearBuilt: 4-digit integer 1800–2026 only
- flags array options: "old-roof" "high-value" "investor-owned" "vacant" "rental" "cash-buyer"
- sources: record the URL/site for every non-null field

Return ONLY this JSON inside <json> tags, nothing else after the closing tag:

<json>
{
  "ownerName": null,
  "ownerPhone": null,
  "ownerEmail": null,
  "yearBuilt": null,
  "marketValue": null,
  "assessedValue": null,
  "lastSaleDate": null,
  "lastSalePrice": null,
  "permitCount": null,
  "permitLastDate": null,
  "roofAgeYears": null,
  "county": null,
  "parcelId": null,
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
  data.lastSalePrice = toNum(data.lastSalePrice, 100)
  if (data.roofAgeYears !== null) {
    const r = Math.round(parseFloat(data.roofAgeYears))
    data.roofAgeYears = (!isNaN(r) && r >= 1 && r <= 60) ? r : null
  }
  if (data.permitCount !== null) {
    const p = parseInt(data.permitCount); data.permitCount = (!isNaN(p) && p >= 0) ? p : null
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
