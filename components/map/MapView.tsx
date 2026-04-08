'use client'

import { useEffect, useState, useRef } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import type { Property } from '@/lib/types'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  color: 'green' | 'amber' | 'red'
  label?: string
  onClick?: () => void
}

interface MapViewProps {
  lat: number
  lng: number
  zoom?: number
  className?: string
  onMapClick?: (lat: number, lng: number) => void
  mode?: 'dark' | 'satellite' | '3d'
  markers?: MapMarker[]
  onModeChange?: (mode: 'dark' | 'satellite' | '3d') => void
  geoJsonData?: object | null
}

const containerStyle = {
  width: '100%',
  height: '100%',
}

export default function MapView({
  lat,
  lng,
  zoom = 14,
  className = '',
  onMapClick,
  mode = 'satellite',
  markers = [],
  onModeChange,
  geoJsonData
}: MapViewProps) {
  // Fetch API key at runtime — avoids build-time baking issues
  const [apiKey, setApiKey] = useState<string | null>(null)

  useEffect(() => {
    // Try env var first (works if build-time baking succeeded)
    const envKey = process.env.NEXT_PUBLIC_MAPS_API_KEY
    if (envKey) {
      setApiKey(envKey)
      return
    }
    // Fallback: fetch from server at runtime
    fetch('/api/maps-key')
      .then(r => r.json())
      .then(d => { if (d.key) setApiKey(d.key) })
      .catch(() => {})
  }, [])

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'directive-crm-map-v3',
    googleMapsApiKey: apiKey ?? '',
    // Don't attempt to load until we have the key
    ...(apiKey === null ? { googleMapsApiKey: '__PENDING__' } : {}),
  })

  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>(
    mode === 'satellite' ? 'satellite' : 'roadmap'
  )
  const [tilt, setTilt] = useState(0)
  const [photoTileSession, setPhotoTileSession] = useState<string | null>(null)
  const [loadingPhotoTiles, setLoadingPhotoTiles] = useState(false)
  const mapRef = useRef<google.maps.Map | null>(null)

  const center = { lat, lng }

  const colorMap = {
    green: '#22c55e',
    amber: '#f59e0b',
    red: '#ef4444',
  }

  const getMarkerIcon = (color: 'green' | 'amber' | 'red'): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: colorMap[color],
    fillOpacity: 0.8,
    strokeColor: 'rgba(255,255,255,0.3)',
    strokeWeight: 1,
  })

  useEffect(() => {
    if (mode === 'satellite' && mapType !== 'satellite') {
      setMapType('satellite')
      onModeChange?.('satellite')
    } else if (mode !== 'satellite' && mapType !== 'roadmap') {
      setMapType('roadmap')
      onModeChange?.('dark')
    }
  }, [mode])

  // Handle GeoJSON data layer
  useEffect(() => {
    if (!mapRef.current) return
    if (!geoJsonData) {
      mapRef.current.data.forEach((feature: google.maps.Data.Feature) => {
        mapRef.current?.data.remove(feature)
      })
      return
    }
    mapRef.current.data.addGeoJson(geoJsonData)
    mapRef.current.data.setStyle((feature: google.maps.Data.Feature) => {
      const color = feature.getProperty('color') as string || '#06b6d4'
      const type = feature.getProperty('type') as string
      if (type === 'territory') {
        return {
          fillColor: '#06b6d4',
          fillOpacity: 0.08,
          strokeColor: '#06b6d4',
          strokeWeight: 2,
          strokeOpacity: 0.6
        } as google.maps.Data.StyleOptions
      }
      return {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: color,
          fillOpacity: 0.7,
          strokeColor: '#fff',
          strokeWeight: 1.5
        }
      } as google.maps.Data.StyleOptions
    })
    return () => {
      if (mapRef.current?.data) {
        mapRef.current.data.forEach((feature: google.maps.Data.Feature) => {
          mapRef.current?.data.remove(feature)
        })
      }
    }
  }, [geoJsonData])

  // Still loading key
  if (apiKey === null) {
    return (
      <div className={`flex items-center justify-center bg-[#0d1117] text-white/40 text-sm ${className}`}>
        <div className="animate-pulse text-cyan-400">Connecting to maps...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={`flex items-center justify-center bg-[#0d1117] text-white/40 text-sm ${className}`}>
        Map failed to load — check API key
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center bg-[#0d1117] text-white/40 text-sm ${className}`}>
        <div className="animate-pulse text-cyan-400">Loading map...</div>
      </div>
    )
  }

  const handle3DToggle = () => {
    if (!mapRef.current) return
    const newTilt = tilt === 0 ? 45 : 0
    setTilt(newTilt)
    mapRef.current.setTilt(newTilt)
  }

  const handlePhotoMode = async () => {
    if (photoTileSession) {
      setPhotoTileSession(null)
      return
    }
    setLoadingPhotoTiles(true)
    try {
      const res = await fetch('/api/map-tiles-session', { method: 'POST' })
      const data = await res.json()
      if (data.session) setPhotoTileSession(data.session)
    } catch { /* silent */ }
    finally { setLoadingPhotoTiles(false) }
  }

  const handleMapLoad = (map: google.maps.Map) => {
    mapRef.current = map
    if (photoTileSession && mapRef.current && apiKey) {
      const imageMapType = new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) =>
          `https://tile.googleapis.com/v1/2dtiles/${zoom}/${coord.x}/${coord.y}?session=${photoTileSession}&key=${apiKey}`,
        tileSize: new google.maps.Size(256, 256),
        maxZoom: 22,
        minZoom: 0,
        name: 'Photo'
      })
      mapRef.current.overlayMapTypes.insertAt(0, imageMapType)
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Map controls — bottom right, clear of nav */}
      <div className="absolute bottom-6 right-4 z-10 flex gap-2">
        <button
          onClick={() => {
            const newMode = mapType === 'satellite' ? 'roadmap' : 'satellite'
            setMapType(newMode)
            onModeChange?.(newMode === 'satellite' ? 'satellite' : 'dark')
          }}
          className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors backdrop-blur-sm"
        >
          {mapType === 'satellite' ? 'Map' : 'Satellite'}
        </button>
        {mapType === 'satellite' && (
          <>
            <button
              onClick={handle3DToggle}
              className="bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-400 text-xs px-3 py-1.5 rounded border border-cyan-500/40 transition-colors backdrop-blur-sm"
            >
              {tilt === 45 ? '2D' : '3D'}
            </button>
            <button
              onClick={handlePhotoMode}
              disabled={loadingPhotoTiles}
              className={`text-xs px-3 py-1.5 rounded border transition-colors backdrop-blur-sm ${
                photoTileSession
                  ? 'bg-cyan-500/30 text-cyan-400 border-cyan-500/40'
                  : 'bg-black/60 text-white border-white/20 disabled:opacity-50'
              }`}
            >
              {loadingPhotoTiles ? '...' : 'Photo'}
            </button>
          </>
        )}
      </div>

      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoom}
        mapTypeId={mapType}
        onLoad={handleMapLoad}
        onClick={(e) => {
          if (e.latLng && onMapClick) {
            onMapClick(e.latLng.lat(), e.latLng.lng())
          }
        }}
        options={{
          mapTypeControl: false,
          streetViewControl: true,
          streetViewControlOptions: {
            position: google.maps.ControlPosition.LEFT_BOTTOM,
          },
          fullscreenControl: false,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_BOTTOM,
          },
          styles: [],
          tilt: tilt,
          heading: 0,
        }}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={{ lat: marker.lat, lng: marker.lng }}
            onClick={() => setSelectedMarker(marker)}
            icon={getMarkerIcon(marker.color)}
          />
        ))}

        {selectedMarker && (
          <InfoWindow
            position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div style={{ background: '#1a2236', color: '#fff', padding: '8px', borderRadius: '6px', minWidth: '160px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                {selectedMarker.label || `Marker ${selectedMarker.id}`}
              </div>
              {selectedMarker.onClick && (
                <button
                  onClick={() => { selectedMarker.onClick?.(); setSelectedMarker(null) }}
                  style={{ marginTop: '6px', fontSize: '11px', color: '#06b6d4', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  View Details →
                </button>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  )
}
