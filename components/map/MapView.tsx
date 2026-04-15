'use client'

import { useEffect, useState, useRef } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import { authFetch } from '@/lib/authFetch'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  color: 'green' | 'amber' | 'red' | 'cyan'
  label?: string
  onClick?: () => void
}

type RadarProduct = 'n0q' | 'n0r' | 'n0s' | 'net' | 'n0z'

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
  radarOverlay?: boolean
  radarProduct?: RadarProduct
}

const RADAR_PRODUCTS: { key: RadarProduct; label: string; desc: string }[] = [
  { key: 'n0q', label: 'Reflectivity HD', desc: 'High-res base reflectivity (256 levels)' },
  { key: 'n0r', label: 'Reflectivity', desc: 'Standard base reflectivity (16 levels)' },
  { key: 'n0s', label: 'Storm Velocity', desc: 'Storm-relative mean radial velocity' },
  { key: 'net', label: 'Echo Tops', desc: 'Maximum echo height (storm tops)' },
  { key: 'n0z', label: 'Long Range', desc: 'Long-range base reflectivity (248nm)' },
]

const containerStyle = { width: '100%', height: '100vh' }

const colorMap = {
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  cyan: '#06b6d4',
}

type MapViewMode = 'roadmap' | 'satellite' | 'hybrid' | 'terrain' | 'night' | 'night-terrain'

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
  radarOverlay,
  radarProduct = 'n0q',
}: MapViewProps & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'directive-crm-map',
    googleMapsApiKey: apiKey,
    version: 'beta', // Required for WebGL 3D globe rendering
  })

  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [viewMode, setViewMode] = useState<MapViewMode | 'globe'>('globe')
  const [tilt, setTilt] = useState(45)
  const [photoTileSession, setPhotoTileSession] = useState<string | null>(null)
  const [loadingPhotoTiles, setLoadingPhotoTiles] = useState(false)
  const [showViewPicker, setShowViewPicker] = useState(false)
  const [isStreetView, setIsStreetView] = useState(false)
  const mapRef = useRef<google.maps.Map | null>(null)

  const center = { lat, lng }

  // Map the viewMode to Google's mapTypeId
  // Globe uses hybrid for labels + satellite imagery with 3D globe curvature
  const googleMapType = viewMode === 'night' ? 'roadmap' : viewMode === 'night-terrain' ? 'terrain' : viewMode === 'globe' ? 'hybrid' : (viewMode as MapViewMode)

  useEffect(() => {
    if (mode === 'satellite' && viewMode !== 'satellite') {
      setViewMode('satellite')
      onModeChange?.('satellite')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Fly-to animation when lat/lng/zoom props change
  const prevCenter = useRef({ lat, lng })
  const prevZoom = useRef(zoom)
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    const centerChanged = Math.abs(prevCenter.current.lat - lat) > 0.0001 || Math.abs(prevCenter.current.lng - lng) > 0.0001
    const zoomChanged = prevZoom.current !== zoom

    if (!centerChanged && !zoomChanged) return

    prevCenter.current = { lat, lng }
    prevZoom.current = zoom

    const target = { lat, lng }
    const targetZoom = zoom || 18

    // Smooth fly-to: zoom out → pan → zoom in
    const currentZoom = map.getZoom() || 14
    const midZoom = Math.min(currentZoom, targetZoom) - 2

    // Step 1: zoom out slightly
    map.setZoom(Math.max(midZoom, 8))

    // Step 2: pan to target after brief delay
    setTimeout(() => {
      map.panTo(target)
    }, 300)

    // Step 3: zoom into target
    setTimeout(() => {
      map.setZoom(targetZoom)
    }, 800)
  }, [lat, lng, zoom])

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

  // NOAA NEXRAD Doppler radar overlay — supports multiple products
  useEffect(() => {
    if (!mapRef.current) return
    // Clear any existing radar overlays
    mapRef.current.overlayMapTypes.clear()
    if (!radarOverlay) return

    // IEM tile URL — product name maps directly to tile layer
    // n0q = 256-level base reflectivity (highest res), n0r = 16-level, n0s = storm velocity, net = echo tops, n0z = long range
    const tileLayer = `nexrad-${radarProduct}-900913`
    const radarMapType = new google.maps.ImageMapType({
      getTileUrl: (coord: google.maps.Point, zoom: number) =>
        `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${tileLayer}/${zoom}/${coord.x}/${coord.y}.png`,
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 19,
      minZoom: 0,
      opacity: 0.65,
      name: 'NEXRAD-Doppler',
    })
    mapRef.current.overlayMapTypes.insertAt(0, radarMapType)
  }, [radarOverlay, radarProduct])

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
      const res = await authFetch('/api/map-tiles-session', { method: 'POST' })
      const data = await res.json()
      if (data.session) setPhotoTileSession(data.session)
    } catch { /* silent */ } finally { setLoadingPhotoTiles(false) }
  }

  const exitStreetView = () => {
    if (!mapRef.current) return
    const sv = mapRef.current.getStreetView()
    if (sv) sv.setVisible(false)
    setIsStreetView(false)
  }

  const handleMapLoad = (map: google.maps.Map) => {
    mapRef.current = map
    // Set initial 3D tilt for globe mode (Google Earth feel)
    if (viewMode === 'globe') {
      map.setTilt(45)
    }
    // Listen for street view activation/deactivation
    const sv = map.getStreetView()
    if (sv) {
      sv.addListener('visible_changed', () => {
        setIsStreetView(sv.getVisible())
      })
    }
    // Add photo tiles if session exists
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
    // Add Doppler radar overlay if enabled
    if (radarOverlay) {
      const tileLayer = `nexrad-${radarProduct}-900913`
      const radarMapType = new google.maps.ImageMapType({
        getTileUrl: (coord: google.maps.Point, zoom: number) =>
          `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${tileLayer}/${zoom}/${coord.x}/${coord.y}.png`,
        tileSize: new google.maps.Size(256, 256),
        maxZoom: 19,
        minZoom: 0,
        opacity: 0.65,
        name: 'NEXRAD-Doppler',
      })
      map.overlayMapTypes.insertAt(0, radarMapType)
    }
  }

  const getMarkerIcon = (color: 'green' | 'amber' | 'red' | 'cyan'): google.maps.Symbol => ({
    path: google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: colorMap[color],
    fillOpacity: 0.8,
    strokeColor: 'rgba(255,255,255,0.3)',
    strokeWeight: 1,
  })

  const viewModes: { key: MapViewMode | 'globe'; label: string; icon: string }[] = [
    { key: 'roadmap', label: 'Map', icon: '🗺' },
    { key: 'satellite', label: 'Satellite', icon: '🛰' },
    { key: 'hybrid', label: 'Hybrid', icon: '🏙' },
    { key: 'terrain', label: 'Terrain', icon: '⛰' },
    { key: 'night', label: 'Night', icon: '🌙' },
    { key: 'night-terrain', label: 'Night Terrain', icon: '🏔' },
    { key: 'globe', label: 'Globe', icon: '🌐' },
  ] as { key: MapViewMode | 'globe'; label: string; icon: string }[]

  const supports3D = viewMode === 'satellite' || viewMode === 'hybrid' || viewMode === 'globe'

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Street View exit button — prominent, above nav bar */}
      {isStreetView && (
        <button
          onClick={exitStreetView}
          className="absolute top-24 right-4 z-50 flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-sm rounded-xl shadow-2xl shadow-red-600/40 transition-all border border-red-400/30"
          style={{ animation: 'stormPulse 2s ease-in-out infinite' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
          Exit Street View
        </button>
      )}

      {/* Map view controls — horizontally centered at bottom */}
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        {/* View picker dropdown (appears above controls) */}
        {showViewPicker && (
          <div className="bg-black/80 backdrop-blur-md rounded-lg border border-white/20 p-1 flex flex-col gap-0.5 shadow-xl mb-1">
            {viewModes.map(v => (
              <button
                key={v.key}
                onClick={() => {
                  if (v.key === 'globe') {
                    setViewMode('globe')
                    setTilt(45)
                    mapRef.current?.setTilt(45)
                    onModeChange?.('satellite')
                  } else {
                    setViewMode(v.key as MapViewMode)
                    setShowViewPicker(false)
                    if (v.key === 'satellite' || v.key === 'hybrid') {
                      onModeChange?.('satellite')
                    } else {
                      onModeChange?.('dark')
                      setTilt(0)
                      mapRef.current?.setTilt(0)
                    }
                  }
                  setShowViewPicker(false)
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

        {/* Control buttons horizontal pill */}
        <div className="bg-black/60 backdrop-blur-md rounded-full border border-white/20 p-1.5 flex flex-row items-center gap-2 shadow-xl">
          <button
            onClick={() => setShowViewPicker(!showViewPicker)}
            className="bg-black/40 hover:bg-black/60 text-white text-xs px-3 py-1.5 rounded-full border border-white/20 transition-colors flex items-center gap-1.5"
          >
            <span>{viewModes.find(v => v.key === viewMode)?.icon}</span>
            <span>{viewModes.find(v => v.key === viewMode)?.label}</span>
            <span className="text-[10px] ml-0.5">▾</span>
          </button>

          {supports3D && (
            <>
              <button
                onClick={handle3DToggle}
                className="bg-cyan-500/30 hover:bg-cyan-500/50 text-cyan-400 text-xs px-3 py-1.5 rounded-full border border-cyan-500/40 transition-colors"
              >
                {tilt === 45 ? '2D' : '3D'}
              </button>
              <button
                onClick={handlePhotoMode}
                disabled={loadingPhotoTiles}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  photoTileSession
                    ? 'bg-cyan-500/30 text-cyan-400 border-cyan-500/40'
                    : 'bg-black/40 text-white border-white/20 disabled:opacity-50'
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
            position: google.maps.ControlPosition.RIGHT_BOTTOM,
          },
          fullscreenControl: false,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_BOTTOM,
          },
          styles: (viewMode === 'night' || viewMode === 'night-terrain') ? nightStyle : [],
          tilt: (viewMode as MapViewMode | 'globe') === 'globe' ? 45 : tilt,
          heading: 0,
          // Enable WebGL vector rendering for 3D globe (Google Earth-style)
          mapId: 'DEMO_MAP_ID',
          isFractionalZoomEnabled: true,
          // Allow two-finger trackpad pan/zoom without holding Ctrl
          gestureHandling: 'greedy',
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
    authFetch('/api/maps-key')
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
