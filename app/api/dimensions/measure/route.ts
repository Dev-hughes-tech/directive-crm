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

interface MaterialOption {
  name: string
  suitable: boolean
  unit: string
  quantity?: number
  bundlesPerSquare?: number
  totalBundles?: number
  panelWidthIn?: number
  panelsNeeded?: number
  tilesPerSquare?: number
  totalTiles?: number
  weightPerSqFt?: number
  rollsNeeded?: number
  note: string
}

interface FlatRoofDrainage {
  interiorDrainsNeeded: number
  drainSpacingFt: number
  scuppersNeeded: number
  minSlopePct: number
  sumpsNeeded: number
  note: string
}

interface RoofSegmentWithStructural {
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
  rafterCount: number
  rafterLengthFt: number
  rafterSpacingIn: number
  plywoodSheets: number
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
    segments: RoofSegmentWithStructural[]
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
    gutterSystem: {
      gutterLinearFt: number
      downspoutsNeeded: number
      downspoutLinearFt: number
      gutterSizeIn: number
      downspoutSizeIn: number
      leafGuardLinearFt: number
      note: string
    }
  }
  materials: {
    shinglesBundles: number
    underlaySqFt: number
    iceWaterLinearFt: number
    dripEdgeLinearFt: number
    ridgeCapLinearFt: number
    nailsBoxes: number
  }
  structural: {
    totalRafters: number
    rafterSpacingIn: number
    totalPlywoodSheets: number
    roofType: 'flat' | 'low_slope' | 'standard' | 'steep' | 'mixed'
    avgPitchDegrees: number
    structuralNotes: string[]
  }
  materialOptions: {
    asphalt_shingle: MaterialOption
    metal_standing_seam: MaterialOption
    metal_corrugated: MaterialOption
    clay_tile: MaterialOption
    concrete_tile: MaterialOption
    tpo_membrane: MaterialOption
    modified_bitumen: MaterialOption
    epdm: MaterialOption
  }
  flatRoofDrainage: FlatRoofDrainage | null
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
    let solarApiStatus = solarRes.status

    // Fallback to MEDIUM if HIGH fails
    if (!solarRes.ok) {
      const solarUrlMedium = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=MEDIUM&key=${apiKey}`
      solarRes = await fetchWithTimeout(solarUrlMedium, {}, 8000)
      if (!solarRes.ok) solarApiStatus = solarRes.status
    }

    // Steps 3+4: OSM footprint and USGS elevation (fetch in parallel, needed for fallback too)
    let osmBuilding: any = null
    let elevData: any = { value: 0 }
    try {
      const [osmResult, elevResult] = await Promise.allSettled([
        (async () => {
          const osmBody = `[out:json];way["building"](around:60,${lat},${lng});out+geom;`
          const osmRes = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: osmBody,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          }, 8000)
          if (osmRes.ok) {
            const osmData = await osmRes.json()
            if (osmData.elements && osmData.elements.length > 0) {
              const way = osmData.elements.find((e: any) => e.geometry && e.geometry.length > 0)
              if (way) osmBuilding = way
            }
          }
        })(),
        (async () => {
          const elevRes = await fetchWithTimeout(
            `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&wkid=4326&includeDate=false`,
            {},
            8000
          )
          if (elevRes.ok) elevData = await elevRes.json()
        })(),
      ])
      void osmResult; void elevResult
    } catch (_) { /* non-fatal */ }

    // Build synthetic Solar data from OSM when Solar API has no coverage
    function polygonAreaSqM(pts: Array<{ lat: number; lng: number }>): number {
      if (pts.length < 3) return 0
      const R = 6371000
      const lat0 = (pts[0].lat * Math.PI) / 180
      const m = pts.map(p => ({
        x: (p.lng * Math.PI / 180) * R * Math.cos(lat0),
        y: (p.lat * Math.PI / 180) * R,
      }))
      let area = 0
      for (let i = 0; i < m.length; i++) {
        const j = (i + 1) % m.length
        area += m[i].x * m[j].y - m[j].x * m[i].y
      }
      return Math.abs(area / 2)
    }

    let solar: SolarResponse
    let isEstimated = false

    if (solarRes.ok) {
      solar = await solarRes.json()
    } else {
      // ── Estimation fallback ──────────────────────────────────────────
      isEstimated = true
      const DEFAULT_PITCH_DEG = 22.0 // ≈ 5:12 — typical residential
      const pitchRad = (DEFAULT_PITCH_DEG * Math.PI) / 180

      // Calculate footprint from OSM polygon, or estimate from geocode bounds
      let footprintSqM = 150 // fallback default ~1,600 sqft
      if (osmBuilding?.geometry?.length >= 3) {
        const osmPts = osmBuilding.geometry.map((g: any) => ({ lat: g.lat, lng: g.lon }))
        const osmArea = polygonAreaSqM(osmPts)
        if (osmArea > 20) footprintSqM = osmArea
      } else {
        const bounds = geocodeData.results[0]?.geometry?.viewport
        if (bounds) {
          const latM = (bounds.northeast.lat - bounds.southwest.lat) * 111000
          const lngM = (bounds.northeast.lng - bounds.southwest.lng) * 111000 * Math.cos((lat * Math.PI) / 180)
          // Estimate building is ~25% of parcel, clamped to 80–600 sqm
          footprintSqM = Math.min(Math.max((latM * lngM) * 0.25, 80), 600)
        }
      }

      const halfFP = footprintSqM / 2
      const roofHalfArea = halfFP / Math.cos(pitchRad)

      // Determine dominant axis from longest OSM wall
      let dominantAzimuth = 180 // default South/North gable
      if (osmBuilding?.geometry?.length >= 2) {
        let maxDist = 0
        const geom = osmBuilding.geometry
        for (let i = 0; i < geom.length - 1; i++) {
          const dLat = geom[i + 1].lat - geom[i].lat
          const dLng = geom[i + 1].lon - geom[i].lon
          const d = Math.sqrt(dLat ** 2 + dLng ** 2)
          if (d > maxDist) {
            maxDist = d
            // Wall runs E-W → roof faces N/S; Wall runs N-S → roof faces E/W
            dominantAzimuth = Math.abs(dLng) > Math.abs(dLat) ? 180 : 90
          }
        }
      }

      // Calculate proper per-segment bounding boxes so the two gable slopes
      // sit on OPPOSITE halves of the building (not stacked on top of each other)
      const sideM = Math.sqrt(footprintSqM)
      const halfLat = (sideM / 2) / 111000
      const halfLng = (sideM / 2) / (111000 * Math.cos((lat * Math.PI) / 180))
      // Ridge runs E-W → slopes split N/S; ridge runs N-S → slopes split E/W
      const splitNS = Math.abs(dominantAzimuth - 180) < 45 || dominantAzimuth < 45

      const seg1BBox = splitNS
        ? { sw: { latitude: lat - halfLat, longitude: lng - halfLng }, ne: { latitude: lat,           longitude: lng + halfLng } }
        : { sw: { latitude: lat - halfLat, longitude: lng - halfLng }, ne: { latitude: lat + halfLat, longitude: lng          } }
      const seg1Center = splitNS
        ? { latitude: lat - halfLat * 0.5, longitude: lng }
        : { latitude: lat, longitude: lng - halfLng * 0.5 }

      const seg2BBox = splitNS
        ? { sw: { latitude: lat,           longitude: lng - halfLng }, ne: { latitude: lat + halfLat, longitude: lng + halfLng } }
        : { sw: { latitude: lat - halfLat, longitude: lng           }, ne: { latitude: lat + halfLat, longitude: lng + halfLng } }
      const seg2Center = splitNS
        ? { latitude: lat + halfLat * 0.5, longitude: lng }
        : { latitude: lat, longitude: lng + halfLng * 0.5 }

      const today = new Date()
      solar = {
        name: `estimated/${lat},${lng}`,
        center: { latitude: lat, longitude: lng },
        regionCode: 'US',
        solarPotential: {
          wholeRoofStats: {
            areaMeters2: roofHalfArea * 2,
            groundAreaMeters2: footprintSqM,
          },
          roofSegmentStats: [
            {
              pitchDegrees: DEFAULT_PITCH_DEG,
              azimuthDegrees: dominantAzimuth,
              stats: { areaMeters2: roofHalfArea },
              center: seg1Center,
              boundingBox: seg1BBox,
              planeHeightAtCenterMeters: 4.5,
            },
            {
              pitchDegrees: DEFAULT_PITCH_DEG,
              azimuthDegrees: (dominantAzimuth + 180) % 360,
              stats: { areaMeters2: roofHalfArea },
              center: seg2Center,
              boundingBox: seg2BBox,
              planeHeightAtCenterMeters: 4.5,
            },
          ],
        },
        imageryDate: { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() },
        imageryQuality: solarApiStatus === 403
          ? 'ESTIMATED — Solar API not enabled (enable it at console.cloud.google.com)'
          : solarApiStatus === 404
          ? 'ESTIMATED — No Solar coverage for this address; measurements derived from building footprint'
          : 'ESTIMATED — Measurements derived from building footprint',
      }
    }

    // Step 5: Compute all measurements
    const SQM_TO_SQFT = 10.7639
    const M_TO_FT = 3.28084

    // Roof measurements
    const totalRoofSqFt = solar.solarPotential.wholeRoofStats.areaMeters2 * SQM_TO_SQFT
    const footprintSqFt = solar.solarPotential.wholeRoofStats.groundAreaMeters2 * SQM_TO_SQFT
    const totalSquares = totalRoofSqFt / 100

    // Per-segment calculations with structural data
    const segments = solar.solarPotential.roofSegmentStats.map((s) => {
      const areaSqFt = s.stats.areaMeters2 * SQM_TO_SQFT
      const pitch12 = Math.round(Math.tan((s.pitchDegrees * Math.PI) / 180) * 12 * 10) / 10
      const pitchMultiplier = 1 / Math.cos((s.pitchDegrees * Math.PI) / 180)
      const orientation = azimuthToCardinal(s.azimuthDegrees)

      // STRUCTURAL: Rafter calculations
      // Estimate segment width from area and pitch
      const segmentWidthFt =
        Math.sqrt((areaSqFt / (Math.cos((s.pitchDegrees * Math.PI) / 180))) * 10) / 10
      const rafterCountPerSegment = Math.ceil(segmentWidthFt / (16 / 12)) + 1
      const rafterLengthFt =
        Math.round((Math.sqrt(areaSqFt) / (segmentWidthFt || 1)) / Math.cos((s.pitchDegrees * Math.PI) / 180) * 10) / 10

      // STRUCTURAL: Plywood sheathing (standard sheet = 32 sqft)
      const plywoodSheetsPerSegment = Math.ceil((areaSqFt * 1.1) / 32)

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
        rafterCount: rafterCountPerSegment,
        rafterLengthFt: Math.max(rafterLengthFt, 8), // Minimum 8 ft
        rafterSpacingIn: 16,
        plywoodSheets: plywoodSheetsPerSegment,
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

    // STRUCTURAL: Roof type detection
    const avgPitch = segments.reduce((sum, s) => sum + s.pitchDegrees, 0) / segments.length
    const roofType: 'flat' | 'low_slope' | 'standard' | 'steep' | 'mixed' =
      avgPitch < 2
        ? 'flat'
        : avgPitch < 4
          ? 'low_slope'
          : avgPitch < 7
            ? 'standard'
            : avgPitch < 12
              ? 'steep'
              : 'mixed'

    // STRUCTURAL: Total rafters and plywood
    const totalRafters = segments.reduce((sum, s) => sum + s.rafterCount, 0)
    const totalPlywoodSheets = segments.reduce((sum, s) => sum + s.plywoodSheets, 0)

    // STRUCTURAL: Structural notes
    const structuralNotes: string[] = []
    if (
      segments.some(
        (s) =>
          s.pitchDegrees >= 4 &&
          segments.some((seg) => seg.pitchDegrees >= 4)
      )
    ) {
      const hasTileOption = segments.some((s) => s.pitchDegrees >= 4)
      if (hasTileOption) {
        structuralNotes.push(
          'Clay/concrete tile adds 10-12 lbs/sqft — verify rafter capacity before installation'
        )
      }
    }
    if (roofType === 'flat') {
      structuralNotes.push('Flat roof requires positive drainage slope (min 1/4" per foot)')
      structuralNotes.push('Consider parapet wall height for drainage scupper elevation')
    }
    if (adjustedSquares > 40) {
      structuralNotes.push('Large roof area — consider phased installation')
    }

    // MATERIALS: Base materials
    const shinglesBundles = Math.ceil(adjustedSquares * 3)
    const underlaySqFt = Math.round(totalRoofSqFt * 1.1)
    const iceWaterLinearFt = Math.round(eaveFt * 1.5)
    const dripEdgeLinearFt = Math.round(eaveFt + rakeFt)
    const ridgeCapLinearFt = ridgeFt + hipFt
    const nailsBoxes = Math.ceil(adjustedSquares / 4)

    // MATERIALS: Material options by type
    const averageRafterLength =
      segments.reduce((sum, s) => sum + s.rafterLengthFt, 0) / segments.length
    const materialOptions = {
      asphalt_shingle: {
        name: 'Architectural Asphalt Shingles',
        suitable: avgPitch >= 4,
        unit: 'square',
        quantity: adjustedSquares,
        bundlesPerSquare: 3,
        totalBundles: Math.ceil(adjustedSquares * 3),
        note: 'Most common. Min 4:12 pitch.',
      } as MaterialOption,
      metal_standing_seam: {
        name: 'Standing Seam Metal Panels',
        suitable: avgPitch >= 2,
        unit: 'square',
        quantity: adjustedSquares,
        panelWidthIn: 16,
        panelsNeeded: Math.ceil(totalRoofSqFt / ((16 / 12) * averageRafterLength)),
        note: 'Durable 40-70yr life. Min 2:12 pitch.',
      } as MaterialOption,
      metal_corrugated: {
        name: 'Corrugated Metal Panels',
        suitable: avgPitch >= 1,
        unit: 'panel (3ft × 10ft = 30sqft)',
        quantity: Math.ceil((adjustedSquares * 100) / 30),
        note: 'Farm/industrial. Min 1:12 pitch.',
      } as MaterialOption,
      clay_tile: {
        name: 'Clay / Spanish Barrel Tile',
        suitable: avgPitch >= 4,
        unit: 'square',
        quantity: adjustedSquares,
        tilesPerSquare: 90,
        totalTiles: Math.ceil(adjustedSquares * 90),
        weightPerSqFt: 12,
        note: 'Mediterranean/Spanish style. Heavy — verify structural capacity.',
      } as MaterialOption,
      concrete_tile: {
        name: 'Concrete Roof Tile (S-Tile)',
        suitable: avgPitch >= 4,
        unit: 'square',
        quantity: adjustedSquares,
        tilesPerSquare: 80,
        totalTiles: Math.ceil(adjustedSquares * 80),
        weightPerSqFt: 11,
        note: 'Durable alternative to clay. Requires reinforced decking.',
      } as MaterialOption,
      tpo_membrane: {
        name: 'TPO Single-Ply Membrane (Flat/Low Slope)',
        suitable: avgPitch < 4,
        unit: 'sq ft',
        quantity: Math.round(footprintSqFt * 1.15),
        rollsNeeded: Math.ceil((footprintSqFt * 1.15) / 1000),
        note: 'Best for flat and low-slope roofs. 20-30yr life.',
      } as MaterialOption,
      modified_bitumen: {
        name: 'Modified Bitumen (Flat Roof)',
        suitable: avgPitch < 4,
        unit: 'square',
        quantity: Math.ceil((footprintSqFt / 100) * 1.1),
        note: 'Torch-down or peel-and-stick. Good for flat roofs.',
      } as MaterialOption,
      epdm: {
        name: 'EPDM Rubber Membrane (Flat Roof)',
        suitable: avgPitch < 3,
        unit: 'sq ft',
        quantity: Math.round(footprintSqFt * 1.1),
        note: 'Excellent for commercial flat roofs. 25-30yr life.',
      } as MaterialOption,
    }

    // DRAINAGE: Flat roof drainage (if applicable)
    const flatRoofDrainage =
      roofType === 'flat' || roofType === 'low_slope'
        ? {
            interiorDrainsNeeded: Math.max(1, Math.ceil(footprintSqFt / 2000)),
            drainSpacingFt: Math.round(
              Math.sqrt(footprintSqFt / Math.max(1, Math.ceil(footprintSqFt / 2000)))
            ),
            scuppersNeeded: Math.ceil(perimeterFt / 50),
            minSlopePct: 2.1,
            sumpsNeeded: Math.max(1, Math.ceil(footprintSqFt / 1500)),
            note: 'Flat roof requires minimum 1/4" per foot slope to drains for code compliance.',
          }
        : null

    // GUTTERS: Gutter system
    const gutterSystem = {
      gutterLinearFt: Math.round(eaveFt),
      downspoutsNeeded: Math.max(2, Math.ceil(perimeterFt / 40)),
      downspoutLinearFt: Math.round(Math.max(2, Math.ceil(perimeterFt / 40)) * wallHeightFt * 1.2),
      gutterSizeIn: totalRoofSqFt > 1500 ? 6 : 5,
      downspoutSizeIn: totalRoofSqFt > 1500 ? 4 : 3,
      leafGuardLinearFt: Math.round(eaveFt),
      note: `${Math.max(2, Math.ceil(perimeterFt / 40))} downspouts recommended based on ${Math.round(perimeterFt)} lf perimeter`,
    }

    const result: DimensionsResult = {
      address: formattedAddress,
      lat,
      lng,
      imageryDate: `${solar.imageryDate.year}-${String(solar.imageryDate.month).padStart(2, '0')}-${String(solar.imageryDate.day).padStart(2, '0')}`,
      imageryQuality: isEstimated ? solar.imageryQuality : solar.imageryQuality,
      isEstimated,
      solarApiStatus: isEstimated ? solarApiStatus : null,
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
        gutterSystem,
      },
      materials: {
        shinglesBundles,
        underlaySqFt,
        iceWaterLinearFt,
        dripEdgeLinearFt,
        ridgeCapLinearFt,
        nailsBoxes,
      },
      structural: {
        totalRafters,
        rafterSpacingIn: 16,
        totalPlywoodSheets,
        roofType,
        avgPitchDegrees: Math.round(avgPitch * 10) / 10,
        structuralNotes,
      },
      materialOptions,
      flatRoofDrainage,
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to compute dimensions', details: err.message },
      { status: 500 }
    )
  }
}
