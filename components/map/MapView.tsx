'use client'

import { useEffect, useState } from 'react'
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
  mode?: 'dark' | 'satellite'
  markers?: MapMarker[]
  onModeChange?: (mode: 'dark' | 'satellite') => void
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
  mode = 'dark',
  markers = [],
  onModeChange
}: MapViewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_MAPS_API_KEY || '',
  })

  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null)
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>(mode === 'satellite' ? 'satellite' : 'roadmap')

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
  }, [mode, mapType, onModeChange])

  if (loadError) {
    return (
      <div className={`flex items-center justify-center bg-[#0d1117] text-white/40 text-sm ${className}`}>
        Map failed to load
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

  return (
    <div className={`relative ${className}`}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoom}
        mapTypeId={mapType}
        onClick={(e) => {
          if (e.latLng && onMapClick) {
            onMapClick(e.latLng.lat(), e.latLng.lng())
          }
        }}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_BOTTOM,
          },
          styles: [],
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
