import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { address } = await request.json()
  if (!address) return NextResponse.json({ valid: false, error: 'No address' })

  const apiKey = process.env.MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ valid: false, error: 'Validation unavailable' })

  try {
    const res = await fetch(
      `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: { addressLines: [address] },
          enableUspsCass: false
        })
      }
    )
    const data = await res.json()

    const verdict = data.result?.verdict
    const postalAddress = data.result?.address?.postalAddress

    // Build canonical address from validated result
    const canonical = postalAddress ? [
      postalAddress.addressLines?.[0],
      postalAddress.locality,
      postalAddress.administrativeArea,
      postalAddress.postalCode
    ].filter(Boolean).join(', ') : null

    return NextResponse.json({
      valid: verdict?.addressComplete === true,
      canonical, // Use this corrected address for research
      dpvConfirmation: verdict?.dpvConfirmation,
    })
  } catch {
    return NextResponse.json({ valid: false, error: 'Validation failed' })
  }
}
