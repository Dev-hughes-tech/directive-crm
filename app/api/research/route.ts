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

    // ── PASS 1: Free research — let Claude search exactly like it does independently ──
    const researchPrompt = `You are researching a real property address. Search thoroughly and report everything you find.

Address: ${address}

Run multiple web searches to find:
1. Owner name — search county tax assessor, deed records, ingprobate.com land records (grantee on most recent deed = current owner), qpublic.net
2. Owner phone — search fastpeoplesearch.com, truepeoplesearch.com, whitepages.com using the owner name + city/state once you have it
3. Year built, market value, assessed value, parcel ID — county assessor or qpublic.net
4. Last sale date and price — Zillow, Redfin, county records
5. Any roof permits or roof replacement records
6. Any notable flags (foreclosure, storm damage, liens, recent sale)

Run at least 6 different searches. For Alabama addresses specifically:
- qpublic.net has county assessor data including owner name
- ingprobate.com is the Alabama probate/land records portal — searching the address there shows the deed grantee (= current owner)
- Try: "[address] qpublic" and "[address] ingprobate" as specific queries

Report ALL findings in plain text — what you found, where you found it, exact values.`

    const researchResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10000,
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
- ownerName: must appear in research as the actual owner of this specific address. null if not found.
- ownerPhone: must be a real phone number from the research. Format as XXX-XXX-XXXX. null if not found.
- roofAgeYears: only from a roof permit or explicit "roof replaced [year]" statement. NEVER calculate from yearBuilt. null if not found.
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
