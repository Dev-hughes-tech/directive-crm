import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    if (!address) return NextResponse.json({ error: 'Address is required', data: null }, { status: 400 })

    const prompt = `You are a property research assistant. Search for real property and owner information for this exact address: ${address}

Search these sources:
1. County assessor/GIS records
2. FastPeopleSearch.com
3. TruePeopleSearch.com
4. Zillow.com
5. Redfin.com
6. County permit records

Return ONLY a valid JSON object. Return null for every field you cannot find explicitly — do not estimate, infer, or invent any value:

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

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('/api/research error:', error)
    return NextResponse.json({ error: 'Research failed', data: null }, { status: 500 })
  }
}
