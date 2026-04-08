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

    const prompt = `You are a property research assistant. Conduct thorough, multi-query research for this exact address: ${address}

AGGRESSIVE SEARCH STRATEGY:
1. First: Search "{address}" site:countyassessor OR site:property-appraiser.org owner
2. If no owner found: Search "{address}" owner name property records
3. For phone: Search "{owner_name}" "{city}" "{state}" phone contact
4. Try FastPeopleSearch-style: Search "{owner_name}" "{zip_code}" contact information
5. Supplement: Zillow, Redfin, county GIS, permit records, tax records

CRITICAL: Return ONLY a valid JSON object. Return null for every field you cannot find explicitly — do NOT estimate, infer, or invent any value:

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

Rules:
- ownerPhone must match format XXX-XXX-XXXX or null
- yearBuilt must be between 1800 and 2026 or null
- marketValue and assessedValue must be numbers with no $ sign or null
- sources: for each non-null field, record which website it came from
- flags: array of notable real findings only
- Return ONLY the JSON object, no explanation, no markdown`

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

    // Validate — drop anything that fails format checks
    if (data.ownerPhone && !/^\d{3}-\d{3}-\d{4}$/.test(data.ownerPhone)) data.ownerPhone = null
    if (data.yearBuilt && (data.yearBuilt < 1800 || data.yearBuilt > 2026)) data.yearBuilt = null
    if (data.marketValue && typeof data.marketValue !== 'number') data.marketValue = null
    if (data.assessedValue && typeof data.assessedValue !== 'number') data.assessedValue = null
    if (data.lastSalePrice && typeof data.lastSalePrice !== 'number') data.lastSalePrice = null

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
