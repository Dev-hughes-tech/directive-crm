import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return null
  try {
    const encoded = encodeURIComponent(address)
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`)
    const data = await res.json()
    if (data.status === 'OK' && data.results[0]) {
      const { lat, lng } = data.results[0].geometry.location
      return { lat, lng }
    }
  } catch { /* silent */ }
  return null
}

export async function POST(request: NextRequest) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY not set')
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured', data: null }, { status: 500 })
  }

  const client = new Anthropic({ apiKey: anthropicKey })

  try {
    const { address } = await request.json()
    if (!address) return NextResponse.json({ error: 'Address is required', data: null }, { status: 400 })

    const prompt = `You are a professional property intelligence researcher for a roofing sales company. You will research the following address completely and return structured data. Be aggressive and thorough — use every search below.

TARGET ADDRESS: ${address}

══════════════════════════════════════════
REQUIRED SEARCH SEQUENCE — do ALL of these:
══════════════════════════════════════════

SEARCH 1 — ZILLOW
Query: site:zillow.com "${address}"
Get: owner name, year built, market value (Zestimate), last sale date, last sale price, beds/baths, lot size

SEARCH 2 — REALTOR.COM
Query: site:realtor.com "${address}"
Get: same fields as Zillow, cross-reference values, look for listing history

SEARCH 3 — COUNTY TAX ASSESSOR (most important for owner name + assessed value)
Query: "${address}" county tax assessor property records owner
Then search: "[city] [state] county property appraiser" to find the official government portal
Get: legal owner name, parcel ID, assessed value, taxable value, year built, land value

SEARCH 4 — BUILDING & ROOFING PERMITS
Query: "${address}" building permit roof permit
Also try: "[city] [state] building permits search" to find the permit portal
Get: permit number, permit type, issue date, description — look specifically for "ROOFING", "ROOF", "RE-ROOF" permits

SEARCH 5 — DEED / PUBLIC RECORDS
Query: "${address}" deed property records sale history
Try: site:publicrecordsnow.com OR site:county-records.com OR "[county] clerk of courts records"
Get: grantee/grantor names, deed date, sale price, legal description

SEARCH 6 — PEOPLE SEARCH (for owner phone number)
Once you have the owner name from searches above:
Query: "[owner full name] [city] [state] phone number"
Also try: site:whitepages.com "[owner name]" [city] OR site:fastpeoplesearch.com "[owner name]"
Get: phone number, age, email if available

SEARCH 7 — HOTPADS / APARTMENTS.COM (if multi-family or rental)
Query: site:hotpads.com "${address}"
Get: rental history, unit count, property type

SEARCH 8 — PROPERTY SHARK / NEFOS / ATTOM
Query: "${address}" property report owner history
Get: any additional ownership data, prior sales, foreclosure history

══════════════════════════════════════════
OUTPUT RULES (CRITICAL):
══════════════════════════════════════════
- ONLY include values you ACTUALLY FOUND in search results
- NEVER guess, estimate, or infer — use null if not found
- ownerPhone: format as XXX-XXX-XXXX, null if not found
- roofAgeYears: ONLY from a roofing permit date (calculate from permit year to 2026). NEVER use year built. null if no roof permit found
- marketValue, assessedValue, lastSalePrice: integers only, no $ or commas
- yearBuilt: 4-digit year integer, must be between 1800-2026
- sources: for each non-null field, record the exact website/URL where found
- flags: array of strings like ["vacant", "rental", "foreclosure", "investor-owned", "high-value", "old-roof"] based on what you found

After completing all searches, output your findings inside <json> tags:

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
      const errMsg = apiError instanceof Error ? apiError.message : String(apiError)
      console.error('Anthropic API error:', errMsg)
      return NextResponse.json({ error: `Claude API failed: ${errMsg}`, data: null }, { status: 502 })
    }

    // Collect all text blocks from response
    let fullText = ''
    for (const block of response.content) {
      if (block.type === 'text') fullText += block.text
    }

    if (!fullText.trim()) {
      console.error('No text in response. Stop:', response.stop_reason, 'Block types:', response.content.map(b => b.type))
      return NextResponse.json({ error: 'Research returned no text output', data: null })
    }

    // Extract JSON — prefer <json> tags, fall back to brace-matching
    let jsonStr = ''
    const tagMatch = fullText.match(/<json>\s*([\s\S]*?)\s*<\/json>/)
    if (tagMatch) {
      jsonStr = tagMatch[1]
    } else {
      const braceMatch = fullText.match(/\{[\s\S]*"ownerName"[\s\S]*\}/)
      if (braceMatch) jsonStr = braceMatch[0]
    }

    if (!jsonStr) {
      console.error('No JSON found. Response preview:', fullText.slice(0, 1000))
      return NextResponse.json({ error: 'Could not extract structured data from research', data: null })
    }

    let data
    try {
      data = JSON.parse(jsonStr)
    } catch {
      try {
        // Fix common JSON issues: trailing commas
        const cleaned = jsonStr.replace(/,(\s*[}\]])/g, '$1')
        data = JSON.parse(cleaned)
      } catch (parseError) {
        console.error('JSON parse failed:', parseError, '\nRaw JSON:', jsonStr.slice(0, 600))
        return NextResponse.json({ error: 'Could not parse research data', data: null })
      }
    }

    // ── Validate and sanitize all fields ──

    // Phone: normalize to XXX-XXX-XXXX
    if (data.ownerPhone) {
      const digits = String(data.ownerPhone).replace(/\D/g, '')
      if (digits.length === 10) {
        data.ownerPhone = `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`
      } else if (digits.length === 11 && digits[0] === '1') {
        data.ownerPhone = `${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}`
      } else {
        data.ownerPhone = null
      }
    }

    // Year built: must be plausible integer
    if (data.yearBuilt) {
      const y = parseInt(data.yearBuilt)
      data.yearBuilt = (y >= 1800 && y <= 2026) ? y : null
    }

    // Dollar values: must be positive numbers above minimums
    const toNum = (v: unknown, min: number) => {
      const n = typeof v === 'string' ? parseFloat(v.replace(/[$,]/g, '')) : Number(v)
      return (!isNaN(n) && n >= min) ? Math.round(n) : null
    }
    data.marketValue  = toNum(data.marketValue, 5000)
    data.assessedValue = toNum(data.assessedValue, 1000)
    data.lastSalePrice = toNum(data.lastSalePrice, 100)

    // Roof age: only from permits, not year built
    if (data.roofAgeYears !== null) {
      const r = parseFloat(data.roofAgeYears)
      if (isNaN(r) || r < 1 || r > 60) {
        data.roofAgeYears = null
      } else {
        // Reject if it matches year-built calculation (means Claude cheated)
        if (data.yearBuilt && Math.round(r) === 2026 - data.yearBuilt) {
          data.roofAgeYears = null
        } else {
          data.roofAgeYears = Math.round(r)
        }
      }
    }

    // Permit count: must be a non-negative integer
    if (data.permitCount !== null) {
      const p = parseInt(data.permitCount)
      data.permitCount = (!isNaN(p) && p >= 0) ? p : null
    }

    // Geocode for coordinates
    const geocoded = await geocodeAddress(address)

    return NextResponse.json({
      data: {
        ...data,
        ...(geocoded ? { geocoded_lat: geocoded.lat, geocoded_lng: geocoded.lng } : {}),
      },
      error: null,
    })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('/api/research unhandled error:', errMsg)
    return NextResponse.json({ error: `Research failed: ${errMsg}`, data: null }, { status: 500 })
  }
}
