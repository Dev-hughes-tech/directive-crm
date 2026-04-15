import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

interface PropertyData {
  id: string
  lat: number
  lng: number
  score: number
  roof_age_years: number | null
  address: string
}

interface GeoJsonFeature {
  type: 'Feature'
  geometry: {
    type: 'Point' | 'Polygon'
    coordinates: number[] | number[][] | number[][][]
  }
  properties: Record<string, unknown>
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

// Generate GeoJSON from property arrays for map overlay
export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { properties, type } = await request.json() as {
    properties: PropertyData[]
    type: 'heatzone' | 'territory'
  }

  if (type === 'heatzone') {
    // GeoJSON FeatureCollection — each property becomes a point with score-based styling
    const geojson: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: properties.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          score: p.score,
          roof_age: p.roof_age_years,
          address: p.address,
          color: p.score >= 70 ? '#22c55e' : p.score >= 40 ? '#f59e0b' : '#ef4444'
        }
      }))
    }
    return NextResponse.json({ geojson })
  }

  if (type === 'territory') {
    // Coverage bounding region — axis-aligned bounding box padded by ~200m.
    // A true convex hull would require a geometry library; this is intentionally
    // simpler and labeled honestly as a bounding region.
    if (properties.length < 3) return NextResponse.json({ geojson: null })

    // Padded bounding box
    const lats = properties.map(p => p.lat)
    const lngs = properties.map(p => p.lng)
    const minLat = Math.min(...lats) - 0.002
    const maxLat = Math.max(...lats) + 0.002
    const minLng = Math.min(...lngs) - 0.002
    const maxLng = Math.max(...lngs) + 0.002

    const geojson: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat]
            ]
          ] as number[][][]
        },
        properties: { type: 'territory', geometry_type: 'bounding_region', count: properties.length }
      }]
    }
    return NextResponse.json({ geojson })
  }

  return NextResponse.json({ geojson: null })
}
