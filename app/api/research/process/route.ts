import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// This is the long-running research worker.
// It is called fire-and-forget from /api/research/start.
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function markError(jobId: string, msg: string) {
  await supabase
    .from('research_jobs')
    .update({ status: 'error', error_message: msg, updated_at: new Date().toISOString() })
    .eq('id', jobId)
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
      const { lat, lng } = data.results[0].geometry.location
      return { lat, lng }
    }
  } catch { /* silent */ }
  return null
}

export async function POST(request: NextRequest) {
  const { jobId, address } = await request.json()
  if (!jobId || !address) {
    return NextResponse.json({ error: 'Missing jobId or address' }, { status: 400 })
  }

  // Mark as running
  await supabase
    .from('research_jobs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', jobId)

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    await markError(jobId, 'ANTHROPIC_API_KEY not configured')
    return NextResponse.json({ error: 'No API key' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey: anthropicKey })

  const prompt = `You are a professional property intelligence researcher for a roofing sales CRM. Research this address thoroughly and return structured data.

TARGET ADDRESS: ${address}

SEARCH STRATEGY — execute ALL searches below in order:

SEARCH 1 — ZILLOW
Search: "${address}" zillow
Extract: year built, Zestimate (market value), last sale date, last sale price, beds, baths, sqft

SEARCH 2 — REALTOR.COM
Search: "${address}" realtor.com
Extract: same fields, cross-reference with Zillow values

SEARCH 3 — TAX ASSESSOR (most important)
Search: "${address}" county tax assessor property records owner parcel
Then find the specific county/state government property portal and search there.
Extract: legal owner name (current), parcel ID, assessed value, taxable value, county name

SEARCH 4 — BUILDING AND ROOFING PERMITS
Search: "${address}" building permit roofing permit "re-roof"
Also search: "[city] [state] building permits public records
Extract: permit types, dates, contractor names — look for any ROOF permit specifically

SEARCH 5 — DEED AND SALE HISTORY
Search: "${address}" deed sale history property records
Try sites like publicrecordsnow.com, netr.com, county recorder
Extract: grantee, grantor, deed date, sale price, prior owners

SEARCH 6 — PEOPLE SEARCH (run ONLY after you have owner name from Search 3)
Search: "[owner full name]" "[city]" "[state]" phone number
Try whitepages.com, fastpeoplesearch.com, spokeo.com
Extract: phone number, email if listed

SEARCH 7 — HOTPADS / RENTOMETER
Search: "${address}" hotpads rental
Extract: rental status, unit count, estimated rent

CRITICAL OUTPUT RULES:
- Use NULL for any value not explicitly found in search results — never estimate or assume
- ownerPhone: format as XXX-XXX-XXXX only
- roofAgeYears: ONLY from an actual roof permit date (calculate: 2026 - permit year). NEVER derive from yearBuilt
- All dollar values: plain integers, no $ or commas
- yearBuilt: 4-digit integer between 1800 and 2026
- flags: ["old-roof","high-value","investor-owned","vacant","rental","foreclosure","cash-buyer"] — include any that apply
- sources: for every non-null field, record exactly which website/URL you found it on

Output your findings inside <json> tags — ONLY the JSON block, nothing after:

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
    await markError(jobId, `Claude API failed: ${msg}`)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Collect text output
  let fullText = ''
  for (const block of response.content) {
    if (block.type === 'text') fullText += block.text
  }

  if (!fullText.trim()) {
    const msg = `No text output. Stop: ${response.stop_reason}. Types: ${response.content.map(b => b.type).join(',')}`
    console.error(msg)
    await markError(jobId, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
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
    await markError(jobId, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
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
      await markError(jobId, msg)
      return NextResponse.json({ error: msg }, { status: 500 })
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
    data.roofAgeYears = (!isNaN(r) && r >= 1 && r <= 60 && r !== (2026 - (data.yearBuilt || 0))) ? r : null
  }
  if (data.permitCount !== null) {
    const p = parseInt(data.permitCount); data.permitCount = (!isNaN(p) && p >= 0) ? p : null
  }

  // Geocode for lat/lng
  const geocoded = await geocodeAddress(address)
  if (geocoded) { data.geocoded_lat = geocoded.lat; data.geocoded_lng = geocoded.lng }

  // Write result to Supabase
  await supabase
    .from('research_jobs')
    .update({
      status: 'done',
      result: data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  return NextResponse.json({ ok: true })
}
