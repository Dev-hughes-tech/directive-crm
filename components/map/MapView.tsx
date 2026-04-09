'use client'

import { useEffect, useState, useRef } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'

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

const containerStyle = { width: '100%', height: '100vh' }

const colorMap = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
}

type MapViewMode = 'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'night'

const nightStyle: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#162312' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#3a6e3a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0c4a6e' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#7dd3fc' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#7dd3fc' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1a2e' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3b82f6' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
]

// ─── Inner map — only mounted once we have a real API key ───────────────────
function MapInner({
  apiKey,
  lat,
  lng,
  zoom,
  className,
  onMapClick,
  mode,
  markers,
  onModeChange,
  geoJsonData,
}: MapViewProps & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'directive-crm-map',
    googleMapsApiKey: apiKey,
  })

  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [viewMode, setViewMode] = useState<MapViewMode>(
    mode === 'satellite' ? 'satellite' : 'roadmap'
  )
  const [tilt, setTilt] = useState(0)
  const [photoTileSession, setPhotoTileSession] = useState<string | null>(null)
  const [loadingPhotoTiles, setLoadingPhotoTiles] = useState(false)
  const [showViewPicker, setShowViewPicker] = useState(false)
  const mapRef = useRef<google.maps.Map | null>(null)

  const center = { lat, lng }

  // Map the viewMode to Google's mapTypeId
  const googleMapType = viewMode === 'night' ? 'roadmap' : viewMode

  useEffect(() => {
    if (mode === 'satellite' && viewMode !== 'satellite') {
      setViewMode('satellite')
      onModeChange?.('satellite')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // GeoJSON overlay
  useEffect(() => {
    if (!mapRef.current) return
    if (!geoJsonData) {
      mapRef.current.data.forEach((f: google.maps.Data.Feature) => {
        mapRef.current?.data.remove(f)
      })
      return
    }
    mapRef.current.data.addGeoJson(geoJsonData)
    mapRef.current.data.setStyle((feature: google.maps.Data.Feature) => {
      const color = (feature.getProperty('color') as string) || '#06b6d4'
      const type = feature.getProperty('type') as string
      if (type === 'territory') {
        return {
          fillColor: '#06b6d4',
          fillOpacity: 0.08,
          strokeColor: '#06b6d4',
          strokeWeight: 2,
          strokeOpacity: 0.6,
        } as google.maps.Data.StyleOptions
      }
      return {
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: color,
          fillOpacity: 0.7,
          strokeColor: '#fff',
          strokeWeight: 1.5,
        },
      } as google.maps.Data.StyleOptions
    })
    return () => {
      if (mapRef.current?.data) {
        mapRef.current.data.forEach((f: google.maps.Data.Feature) => {
          mapRef.current?.data.remove(f)
        })
      }
    }
  }, [geoJsonData])

  if (loadError) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#f87171', fontSize: '14px' }}>
        Map failed to load — check API key
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#22d3ee', fontSize: '14px' }}>
        <div className="animate-pulse">Loading map...</div>
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
    if (photoTileSession) { setPhotoTileSession(null); return }
    setLoadingPhotoTiles(true)
    try {
      const res = await fetch('/api/map-tiles-session', { method: 'POST' })
      const data = await res.json()
      if (data.session) setPhotoTileSession(data.session)
    } catch { /* silent */ } finally { setLoadingPhotoTiles(false) }
  }

  const handleMapLoad = (map: google.maps.Map) => {
    mapRef.current = map
    if (photoTileSession) {
      const imageMapType = new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) =>
          `https://tile.googleapis.com/v1/2dtiles/${zoom}/${coord.x}/${coord.y}?session=${photoTileSession}&key=${apiKey}`,
        tileSize: new google.maps.Size(256, 256),
        maxZoom: 22,
        minZoom: 0,
        name: 'Photo',
      })
      map.overlayMapTypes.insertAt(0, imageMapType)
    }
  }

  const getMarkerIcon = (color: 'green' | 'amber' | 'red'): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: colorMap[color],
    fillOpacity: 0.8,
    strokeColor: 'rgba(255,255,255,0.3)',
    strokeWeight: 1,
  })

  const viewModes: { key: MapViewMode; label: string; icon: string }[] = [
    { key: 'roadmap', label: 'Map', icon: '🗺' },
    { key: 'satellite', label: 'Satellite', icon: '🛰' },
    { key: 'hybrid', label: 'Hybrid', icon: '🏙' },
    { key: 'terrain', label: 'Terrain', icon: '⛰' },
    { key: 'night', label: 'Night', icon: '🌙' },
  ]

  const supports3D = viewMode === 'satellite' || viewMode === 'hybrid'

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Map view controls — bottom right */}
      <div className="absolute bottom-6 right-4 z-10 flex flex-col items-end gap-2">
        {/* View picker dropdown */}
        {showViewPicker && (
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/20 p-1 flex flex-col gap-0.5 mb-1 shadow-xl">
            {viewModes.map(v => (
              <button
                key={v.key}
                onClick={() => {
                  setViewMode(v.key)
                  setShowViewPicker(false)
                  if (v.key === 'satellite' || v.key === 'hybrid') {
                    onModeChange?.('satellite')
                  } else {
                    onModeChange?.('dark')
                    if (tilt !== 0) { setTilt(0); mapRef.current?.setTilt(0) }
                  }
                }}
                className={`flex items-center gap-2 text-xs px-3 py-2 rounded transition-all whitespace-nowrap ${
                  viewMode === v.key
                    ? 'bg-cyan-500/30 text-cyan-400'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <span>{v.icon}</span>
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Control buttons row */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowViewPicker(!showViewPicker)}
            className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded border border-white/20 transition-colors backdrop-blur-sm flex items-center gap-1.5"
          >
            <span>{viewModes.find(v => v.key === viewMode)?.icon}</span>
            <span>{viewModes.find(v => v.key === viewMode)?.label}</span>
            <span className="text-[10px] ml-0.5">▾</span>
          </button>

          {supports3D && (
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
      </div>

      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoom}
        mapTypeId={googleMapType}
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
          styles: viewMode === 'night' ? nightStyle : [],
          tilt,
          heading: 0,
        }}
      >
        {markers?.map((marker) => (
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

// ─── Outer wrapper — fetches key, shows loading until ready ─────────────────
export default function MapView(props: MapViewProps) {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [keyError, setKeyError] = useState(false)

  useEffect(() => {
    // Try build-time env var first
    const envKey = process.env.NEXT_PUBLIC_MAPS_API_KEY
    if (envKey && envKey.length > 10) {
      setApiKey(envKey)
      return
    }
    // Fallback: fetch key from server at runtime
    fetch('/api/maps-key')
      .then(r => r.json())
      .then(d => {
        if (d.key && d.key.length > 10) {
          setApiKey(d.key)
        } else {
          setKeyError(true)
        }
      })
      .catch(() => setKeyError(true))
  }, [])

  if (keyError) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#f87171', fontSize: '14px' }}>
        Maps API key not configured
      </div>
    )
  }

  if (!apiKey) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#22d3ee', fontSize: '14px' }}>
        <div className="animate-pulse">Connecting to maps...</div>
      </div>
    )
  }

  // Only mount MapInner (which calls useJsApiLoader) once we have a real key
  return <MapInner {...props} apiKey={apiKey} />
}
