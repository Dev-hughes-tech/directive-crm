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
  } catch { /* silent */ }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json()
    if (!address) return NextResponse.json({ error: 'Address is required', data: null }, { status: 400 })

    // ── PASS 1: Free research — let Claude think and search on its own ──
    const researchPrompt = `You are a property research assistant. You have been given a real residential address. Your job is to find as much factual information about this property and its current owner as possible.

Address: ${address}

USE YOUR OWN JUDGMENT to determine the best search strategy. Think about:
- What state and county is this address in?
- What public records systems exist for that county and state?
- County tax assessor websites, property appraiser portals, deed/probate records
- People search sites for phone numbers once you have an owner name

Search strategy:
1. Start by searching for the property address + "owner" or "property records" or "tax assessor"
2. Search for "[county name] [state] property records" or "[county name] [state] tax assessor" to find the right government portal
3. Search the address on those portals
4. Once you have an owner name, search "[owner name] [city] [state] phone" on people search sites
5. Search the address on real estate sites for market data

You must run at least 6 separate web searches. Be resourceful — if one search doesn't work, try a different angle. Think like an investigator.

For EACH piece of information you find, note exactly where you found it (the website/source).

Report ALL findings in plain text — what you found, where you found it, exact values. Do not make up any data. If you can't find something, say so.`

    const researchResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      messages: [{ role: 'user', content: researchPrompt }],
    })

    // Collect everything Claude found
    let researchFindings = ''
    for (const block of researchResponse.content) {
      if (block.type === 'text') researchFindings += block.text
    }

    if (!researchFindings.trim()) {
      return NextResponse.json({ error: 'Research returned no findings', data: null })
    }

    // ── PASS 2: Extract structured JSON from what was actually found ──
    const extractPrompt = `Here is research that was conducted on the property at ${address}:

---
${researchFindings}
---

Extract the data into this exact JSON. Use ONLY values that appear explicitly in the research above.
If a value was not found or is uncertain, use null — never guess or infer.

CRITICAL RULES:
- ownerName: must appear in research as the actual current owner of this specific address. null if not found.
- ownerPhone: must be a real phone number found in the research. Format as XXX-XXX-XXXX. null if not found.
- roofAgeYears: only from a roof permit or explicit "roof replaced in [year]" statement. NEVER calculate from yearBuilt. null if not found.
- marketValue / assessedValue / lastSalePrice: numbers only, no $ or commas. null if not found.
- yearBuilt: integer between 1800 and 2026. null if not found.
- sources: for each non-null field, record the website where that data was found.

Return ONLY this JSON object, nothing else:
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
}`

    const extractResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: extractPrompt }],
    })

    let jsonText = ''
    for (const block of extractResponse.content) {
      if (block.type === 'text') jsonText += block.text
    }

    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse extracted data', data: null })

    const data = JSON.parse(jsonMatch[0])

    // Validate — strip anything that fails format or plausibility checks
    if (data.ownerPhone && !/^\d{3}-\d{3}-\d{4}$/.test(data.ownerPhone)) data.ownerPhone = null
    if (data.yearBuilt && (data.yearBuilt < 1800 || data.yearBuilt > 2026)) data.yearBuilt = null
    if (data.marketValue !== null && (typeof data.marketValue !== 'number' || data.marketValue < 5000)) data.marketValue = null
    if (data.assessedValue !== null && (typeof data.assessedValue !== 'number' || data.assessedValue < 1000)) data.assessedValue = null
    if (data.lastSalePrice !== null && typeof data.lastSalePrice !== 'number') data.lastSalePrice = null
    if (data.roofAgeYears !== null && (typeof data.roofAgeYears !== 'number' || data.roofAgeYears < 1 || data.roofAgeYears > 60)) data.roofAgeYears = null
    // Wipe roof age if it was calculated from year built (not from a permit)
    if (data.roofAgeYears !== null && data.yearBuilt) {
      if (data.roofAgeYears === new Date().getFullYear() - data.yearBuilt) data.roofAgeYears = null
    }

    // Geocode for precise coordinates
    const geocoded = await geocodeAddress(address)

    return NextResponse.json({
      data: {
        ...data,
        ...(geocoded ? { geocoded_lat: geocoded.lat, geocoded_lng: geocoded.lng } : {}),
      },
      error: null,
    })

  } catch (error) {
    console.error('/api/research error:', error)
    return NextResponse.json({ error: 'Research failed', data: null }, { status: 500 })
  }
}
// Wed Apr  8 18:36:46 EDT 2026
