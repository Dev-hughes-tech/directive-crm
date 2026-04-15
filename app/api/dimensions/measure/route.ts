import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { fetchWithTimeout } from '@/lib/fetchTimeout'

export const maxDuration = 30

interface RoofSegmentStats {
  pitchDegrees: number
  azimuthDegrees: number
  stats: {
    areaMeters2: number
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
    wholeRoofStats: {
      areaMeters2: number
      groundAreaMeters2: number
    }
    roofSegmentStats: RoofSegmentStats[]
  }
  imageryDate: { year: number; month: number; day: number }
  imageryQuality: string
}

interface DimensionsResult {
  address: string
  lat: number
  lng: number
  imageryDate: string
  imageryQuality: string
  roof: {
    totalRoofSqFt: number
    footprintSqFt: number
    totalSquares: number
    adjustedSquares: number
    wasteFactor: number
    complexity: 'simple' | 'moderate' | 'complex'
    segments: Array<{
      pitchDegrees: number
      pitch12: number
      pitchMultiplier: number
      azimuthDegrees: number
      orientation: string
      areaSqFt: number
      squares: number
      center: { lat: number; lng: number }
      boundingBox: any
      heightFt: number
    }>
    edges: {
      eaveFt: number
      ridgeFt: number
      hipFt: number
      rakeFt: number
      valleyFt: number
    }
    isHipRoof: boolean
  }
  building: {
    perimeterFt: number
    footprintSqFt: number
    stories: number
    wallHeightFt: number
    wallAreaSqFt: number
    fasciaSoffitLinearFt: number
    footprintPolygon: Array<{ lat: number; lng: number }>
  }
  materials: {
    shinglesBundles: number
    underlaySqFt: number
    iceWaterLinearFt: number
    dripEdgeLinearFt: number
    ridgeCapLinearFt: number
    nailsBoxes: number
  }
}

function azimuthToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return dirs[Math.round(deg / 22.5) % 16]
}

function calculatePerimeterFt(polygon: Array<{ lat: number; lng: number }>): number {
  if (!polygon || polygon.length < 2) return 0
  let total = 0
  const R = 6371000 // Earth radius in meters
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const lat1 = (a.lat * Math.PI) / 180
    const lat2 = (b.lat * Math.PI) / 180
    const dLat = ((b.lat - a.lat) * Math.PI) / 180
    const dLon = ((b.lng - a.lng) * Math.PI) / 180
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
    total += 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  }
  return Math.round(total * 3.28084) // Convert to feet
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { address } = body

  if (!address) {
    return NextResponse.json({ error: 'address required' }, { status: 400 })
  }

  const apiKey = process.env.MAPS_API_KEY || process.env.NEXT_PUBLIC_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Maps API key not configured' }, { status: 500 })
  }

  try {
    // Step 1: Geocode the address
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    const geocodeRes = await fetchWithTimeout(geocodeUrl, {}, 8000)
    if (!geocodeRes.ok) {
      return NextResponse.json({ error: 'Failed to geocode address' }, { status: 400 })
    }
    const geocodeData = await geocodeRes.json()
    if (!geocodeData.results || geocodeData.results.length === 0) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }
    const { lat, lng } = geocodeData.results[0].geometry.location
    const formattedAddress = geocodeData.results[0].formatted_address

    // Step 2: Get Solar API data
    const solarUrl = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${apiKey}`
    let solarRes = await fetchWithTimeout(solarUrl, {}, 8000)

    // Fallback to MEDIUM if HIGH fails
    if (!solarRes.ok) {
      const solarUrlMedium = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=MEDIUM&key=${apiKey}`
      solarRes = await fetchWithTimeout(solarUrlMedium, {}, 8000)
    }

    if (!solarRes.ok) {
      return NextResponse.json(
        { error: 'Solar API data unavailable for this location' },
        { status: 404 }
      )
    }

    const solar: SolarResponse = await solarRes.json()

    // Step 3: Get building footprint from OpenStreetMap
    let osmBuilding: any = null
    try {
      const osmBody = `[out:json];way["building"](around:60,${lat},${lng});out+geom;`
      const osmRes = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: osmBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(8000),
      })
      if (osmRes.ok) {
        const osmData = await osmRes.json()
        if (osmData.elements && osmData.elements.length > 0) {
          const way = osmData.elements.find((e: any) => e.geometry && e.geometry.length > 0)
          if (way) osmBuilding = way
        }
      }
    } catch (e) {
      // OSM failure is non-fatal
    }

    // Step 4: Get elevation from USGS
    const elevRes = await fetchWithTimeout(
      `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&wkid=4326&includeDate=false`,
      {},
      8000
    )
    const elevData = elevRes.ok ? await elevRes.json() : { value: 0 }

    // Step 5: Compute all measurements
    const SQM_TO_SQFT = 10.7639
    const M_TO_FT = 3.28084

    // Roof measurements
    const totalRoofSqFt = solar.solarPotential.wholeRoofStats.areaMeters2 * SQM_TO_SQFT
    const footprintSqFt = solar.solarPotential.wholeRoofStats.groundAreaMeters2 * SQM_TO_SQFT
    const totalSquares = totalRoofSqFt / 100

    // Per-segment calculations
    const segments = solar.solarPotential.roofSegmentStats.map((s) => {
      const areaSqFt = s.stats.areaMeters2 * SQM_TO_SQFT
      const pitch12 = Math.round(Math.tan((s.pitchDegrees * Math.PI) / 180) * 12 * 10) / 10
      const pitchMultiplier = 1 / Math.cos((s.pitchDegrees * Math.PI) / 180)
      const orientation = azimuthToCardinal(s.azimuthDegrees)
      return {
        pitchDegrees: Math.round(s.pitchDegrees),
        pitch12,
        pitchMultiplier: Math.round(pitchMultiplier * 100) / 100,
        azimuthDegrees: Math.round(s.azimuthDegrees),
        orientation,
        areaSqFt: Math.round(areaSqFt),
        squares: Math.round((areaSqFt / 100) * 10) / 10,
        center: { lat: s.center.latitude, lng: s.center.longitude },
        boundingBox: s.boundingBox,
        heightFt: Math.round(s.planeHeightAtCenterMeters * M_TO_FT),
      }
    })

    // Waste factor based on complexity
    const uniquePitches = new Set(segments.map((s) => s.pitchDegrees)).size
    const uniqueOrientations = new Set(segments.map((s) => Math.round(s.azimuthDegrees / 90))).size
    const complexity =
      segments.length >= 6 || uniquePitches >= 4
        ? 'complex'
        : segments.length >= 3 || uniquePitches >= 2
          ? 'moderate'
          : 'simple'
    const wasteFactor = complexity === 'complex' ? 0.2 : complexity === 'moderate' ? 0.15 : 0.1
    const adjustedSquares = Math.round(totalSquares * (1 + wasteFactor) * 10) / 10

    // Building footprint from OSM
    let perimeterFt = 0
    let footprintPolygon: Array<{ lat: number; lng: number }> = []
    if (osmBuilding && osmBuilding.geometry) {
      footprintPolygon = osmBuilding.geometry.map((pt: any) => ({
        lat: pt.lat,
        lng: pt.lon,
      }))
      perimeterFt = calculatePerimeterFt(footprintPolygon)
    }

    // Fallback perimeter estimate (assume 2:1 ratio rectangle)
    if (perimeterFt === 0) {
      const side = Math.sqrt(footprintSqFt * 0.5)
      perimeterFt = side * 3 * 2 // (2:1) ratio perimeter
    }

    // Edge measurements
    const isHipRoof = uniqueOrientations >= 3
    const buildingLengthFt = Math.sqrt(footprintSqFt * 2)
    const buildingWidthFt = footprintSqFt / buildingLengthFt
    const avgPitchMultiplier =
      segments.reduce((sum, s) => sum + s.pitchMultiplier, 0) / segments.length

    const eaveFt = Math.round(perimeterFt)
    const ridgeFt = Math.round(isHipRoof ? buildingLengthFt * 0.4 : buildingLengthFt * 0.9)
    const hipFt = Math.round(isHipRoof ? buildingWidthFt * avgPitchMultiplier * 2 : 0)
    const rakeFt = Math.round(isHipRoof ? 0 : buildingWidthFt * avgPitchMultiplier * 2)
    const valleyFt = Math.round(
      segments.filter((s) => s.pitchDegrees > 5).length >= 4 ? buildingWidthFt * 0.6 : 0
    )

    // Wall measurements
    const stories = footprintSqFt > 0 ? Math.max(1, Math.round(totalRoofSqFt / footprintSqFt)) : 1
    const wallHeightFt = stories * 9
    const wallAreaSqFt = Math.round(perimeterFt * wallHeightFt)

    // Materials
    const shinglesBundles = Math.ceil(adjustedSquares * 3)
    const underlaySqFt = Math.round(totalRoofSqFt * 1.1)
    const iceWaterLinearFt = Math.round(eaveFt * 1.5)
    const dripEdgeLinearFt = Math.round(eaveFt + rakeFt)
    const ridgeCapLinearFt = ridgeFt + hipFt
    const nailsBoxes = Math.ceil(adjustedSquares / 4)

    const result: DimensionsResult = {
      address: formattedAddress,
      lat,
      lng,
      imageryDate: `${solar.imageryDate.year}-${String(solar.imageryDate.month).padStart(2, '0')}-${String(solar.imageryDate.day).padStart(2, '0')}`,
      imageryQuality: solar.imageryQuality,
      roof: {
        totalRoofSqFt: Math.round(totalRoofSqFt),
        footprintSqFt: Math.round(footprintSqFt),
        totalSquares: Math.round(totalSquares * 10) / 10,
        adjustedSquares,
        wasteFactor,
        complexity,
        segments,
        edges: { eaveFt, ridgeFt, hipFt, rakeFt, valleyFt },
        isHipRoof,
      },
      building: {
        perimeterFt: Math.round(perimeterFt),
        footprintSqFt: Math.round(footprintSqFt),
        stories,
        wallHeightFt,
        wallAreaSqFt,
        fasciaSoffitLinearFt: Math.round(eaveFt),
        footprintPolygon,
      },
      materials: {
        shinglesBundles,
        underlaySqFt,
        iceWaterLinearFt,
        dripEdgeLinearFt,
        ridgeCapLinearFt,
        nailsBoxes,
      },
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to compute dimensions', details: err.message },
      { status: 500 }
    )
  }
}
