import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export const maxDuration = 30

interface RoofSegment {
  pitchDegrees: number
  azimuthDegrees: number
  stats: {
    areaMeters2: number
    sunshineQuantiles: number[]
    groundAreaMeters2: number
  }
  center: { latitude: number; longitude: number }
  boundingBox: {
    sw: { latitude: number; longitude: number }
    ne: { latitude: number; longitude: number }
  }
  planeHeightAtCenterMeters: number
}

interface SolarResponse {
  name: string
  center: { latitude: number; longitude: number }
  regionCode: string
  solarPotential: {
    maxArrayPanelsCount: number
    maxArrayAreaMeters2: number
    maxSunshineHoursPerYear: number
    carbonOffsetFactorKgPerMwh: number
    wholeRoofStats: {
      areaMeters2: number
      sunshineQuantiles: number[]
      groundAreaMeters2: number
    }
    roofSegmentStats: RoofSegment[]
    buildingStats: {
      areaMeters2: number
      sunshineQuantiles: number[]
      groundAreaMeters2: number
    }
  }
  imageryDate: { year: number; month: number; day: number }
  imageryProcessedDate: { year: number; month: number; day: number }
  imageryQuality: string
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const apiKey = process.env.MAPS_API_KEY || process.env.NEXT_PUBLIC_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Maps API key not configured' }, { status: 500 })
  }

  try {
    // Call Google Solar API buildingInsights with HIGH quality first
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${apiKey}`

    let res = await fetch(url)

    // If HIGH quality not available, try MEDIUM
    if (!res.ok) {
      const url2 = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=MEDIUM&key=${apiKey}`
      res = await fetch(url2)

      if (!res.ok) {
        const errText = await res.text()
        return NextResponse.json(
          { error: 'Solar API unavailable for this location', details: errText },
          { status: 404 }
        )
      }
    }

    const data: SolarResponse = await res.json()
    return processAndReturn(data, lat, lng, apiKey)
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to fetch roof data', details: err.message },
      { status: 500 }
    )
  }
}

function processAndReturn(data: SolarResponse, lat: string, lng: string, apiKey: string) {
  const solar = data.solarPotential
  if (!solar) {
    return NextResponse.json(
      { error: 'No solar/roof data available for this building' },
      { status: 404 }
    )
  }

  const segments = solar.roofSegmentStats || []
  const wholeRoof = solar.wholeRoofStats || solar.buildingStats

  // Calculate total roof area in sq ft (1 sq meter = 10.764 sq ft)
  const SQM_TO_SQFT = 10.764
  const totalRoofAreaSqFt = (wholeRoof?.areaMeters2 || 0) * SQM_TO_SQFT
  const groundAreaSqFt = (wholeRoof?.groundAreaMeters2 || 0) * SQM_TO_SQFT

  // Calculate weighted average pitch
  const totalArea = segments.reduce((sum, s) => sum + (s.stats?.areaMeters2 || 0), 0)
  const weightedPitch =
    totalArea > 0
      ? segments.reduce(
          (sum, s) => sum + (s.pitchDegrees || 0) * (s.stats?.areaMeters2 || 0),
          0
        ) / totalArea
      : 0

  // Convert pitch degrees to rise/run (e.g., 18.43° → 4/12)
  const pitchRatio = Math.tan((weightedPitch * Math.PI) / 180) * 12
  const pitchLabel = `${Math.round(pitchRatio)}/12`

  // Pitch multiplier for roofing calculations
  const pitchMultipliers: Record<number, number> = {
    0: 1.0,
    1: 1.0,
    2: 1.01,
    3: 1.03,
    4: 1.06,
    5: 1.08,
    6: 1.12,
    7: 1.16,
    8: 1.2,
    9: 1.25,
    10: 1.3,
    11: 1.36,
    12: 1.41,
  }
  const pitchRise = Math.round(pitchRatio)
  const pitchMultiplier = pitchMultipliers[Math.min(pitchRise, 12)] || 1.0

  // Calculate roofing squares (1 square = 100 sq ft)
  const roofingSquares = totalRoofAreaSqFt / 100

  // Segment breakdown
  const segmentDetails = segments.map((seg, i) => ({
    id: i + 1,
    areaSqFt: Math.round((seg.stats?.areaMeters2 || 0) * SQM_TO_SQFT),
    pitchDegrees: Math.round((seg.pitchDegrees || 0) * 10) / 10,
    pitchRatio: `${Math.round(Math.tan(((seg.pitchDegrees || 0) * Math.PI) / 180) * 12)}/12`,
    azimuthDegrees: Math.round(seg.azimuthDegrees || 0),
    orientation: getOrientation(seg.azimuthDegrees || 0),
    heightMeters: Math.round(((seg.planeHeightAtCenterMeters || 0) * 10)) / 10,
  }))

  // Imagery date
  const imageryDate = data.imageryDate
    ? `${data.imageryDate.year}-${String(data.imageryDate.month).padStart(2, '0')}-${String(data.imageryDate.day).padStart(2, '0')}`
    : null

  return NextResponse.json({
    success: true,
    building: {
      center: data.center,
      regionCode: data.regionCode,
    },
    roof: {
      totalAreaSqFt: Math.round(totalRoofAreaSqFt),
      groundFootprintSqFt: Math.round(groundAreaSqFt),
      avgPitchDegrees: Math.round((weightedPitch * 10)) / 10,
      avgPitchRatio: pitchLabel,
      pitchMultiplier,
      roofingSquares: Math.round((roofingSquares * 10)) / 10,
      segmentCount: segments.length,
      segments: segmentDetails,
    },
    imagery: {
      date: imageryDate,
      quality: data.imageryQuality,
    },
    // Generate satellite image URL
    satelliteImageUrl: `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&size=600x400&maptype=satellite&key=${apiKey}`,
  })
}

function getOrientation(azimuth: number): string {
  if (azimuth >= 337.5 || azimuth < 22.5) return 'North'
  if (azimuth >= 22.5 && azimuth < 67.5) return 'Northeast'
  if (azimuth >= 67.5 && azimuth < 112.5) return 'East'
  if (azimuth >= 112.5 && azimuth < 157.5) return 'Southeast'
  if (azimuth >= 157.5 && azimuth < 202.5) return 'South'
  if (azimuth >= 202.5 && azimuth < 247.5) return 'Southwest'
  if (azimuth >= 247.5 && azimuth < 292.5) return 'West'
  return 'Northwest'
}
