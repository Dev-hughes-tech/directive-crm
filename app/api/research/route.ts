import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  } catch {
    // Geocoding failed, continue with original coordinates
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    if (!address) return NextResponse.json({ error: 'Address is required', data: null }, { status: 400 })

    const prompt = `You are a property research assistant. Search for real data on this address: ${address}

SEARCH ORDER — run these searches one at a time until you find data:
1. Search: "${address} site:qpublic.net owner" — Alabama/Florida county tax assessor (most reliable for owner name)
2. Search: "${address} site:probate.alacourt.gov OR ingenuity probate Alabama owner deed"
3. Search: "${address} Alabama county tax assessor owner property record"
4. Search: "${address} property owner deed recording"
5. Search: "fastpeoplesearch ${address}"
6. Search: "truepeoplesearch ${address} owner phone"
7. Search: "${address} whitepages owner"
8. Search: "${address} zillow owner year built"
9. Search: "${address} redfin sold history"

COUNTY-SPECIFIC SOURCES TO PRIORITIZE (Alabama and Florida):
- qpublic.net — county tax assessor records, has owner name + property data
- Alabama counties use Ingenuity (ING) probate system — search "[county] county AL ingenuity probate [address]"
- Florida counties: search "[address] site:pcpao.org OR site:bcpa.net OR site:miamidade.gov/pa owner"
- For any result from these official government sources, trust the owner name and property data found there

ABSOLUTE RULES — violations are not allowed under any circumstances:
- NEVER invent, estimate, calculate, or infer any value
- NEVER derive roofAgeYears from yearBuilt — roofAgeYears must come ONLY from a roof permit record or an explicit statement like "roof replaced in [year]" found in search results. If no such record exists, roofAgeYears MUST be null.
- NEVER guess a phone number. ownerPhone must be copied verbatim from a search result or null.
- NEVER guess an owner name. ownerName must appear explicitly in a search result as the owner of this property or null.
- If a search result is vague, uncertain, or doesn't explicitly state a value for this exact address, return null for that field.
- A field with uncertain data is ALWAYS better as null than as a guess.

Return ONLY this exact JSON with real values or null:
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

Format rules:
- ownerPhone: XXX-XXX-XXXX format only, or null
- yearBuilt: integer 1800-2026 only, or null
- marketValue, assessedValue, lastSalePrice: plain numbers (no $ or commas), or null
- sources: object mapping each non-null field name to the URL or site where it was found
- flags: only real notable findings like "storm damage reported", "foreclosure", "recent sale" — no invented flags
- Return ONLY the JSON. No explanation, no markdown, no commentary.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    })

    let jsonText = ''
    for (const block of response.content) {
      if (block.type === 'text') jsonText += block.text
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse research data', data: null })

    const data = JSON.parse(jsonMatch[0])

    // Validate — drop anything that fails format or plausibility checks
    if (data.ownerPhone && !/^\d{3}-\d{3}-\d{4}$/.test(data.ownerPhone)) data.ownerPhone = null
    if (data.yearBuilt && (data.yearBuilt < 1800 || data.yearBuilt > 2026)) data.yearBuilt = null
    if (data.marketValue && typeof data.marketValue !== 'number') data.marketValue = null
    if (data.marketValue && data.marketValue < 5000) data.marketValue = null
    if (data.assessedValue && typeof data.assessedValue !== 'number') data.assessedValue = null
    if (data.assessedValue && data.assessedValue < 1000) data.assessedValue = null
    if (data.lastSalePrice && typeof data.lastSalePrice !== 'number') data.lastSalePrice = null
    // roofAgeYears must come from explicit permit/replacement record — wipe if suspicious
    if (data.roofAgeYears !== null && typeof data.roofAgeYears !== 'number') data.roofAgeYears = null
    if (data.roofAgeYears !== null && (data.roofAgeYears < 1 || data.roofAgeYears > 60)) data.roofAgeYears = null
    // If roofAgeYears matches exactly (currentYear - yearBuilt), it was calculated — wipe it
    if (data.roofAgeYears !== null && data.yearBuilt) {
      const currentYear = new Date().getFullYear()
      if (data.roofAgeYears === currentYear - data.yearBuilt) data.roofAgeYears = null
    }

    // Geocode the address for precise coordinates
    const geocoded = await geocodeAddress(address)
    const responseData = {
      ...data,
      ...(geocoded ? { geocoded_lat: geocoded.lat, geocoded_lng: geocoded.lng } : {})
    }

    return NextResponse.json({ data: responseData, error: null })
  } catch (error) {
    console.error('/api/research error:', error)
    return NextResponse.json({ error: 'Research failed', data: null }, { status: 500 })
  }
}
