'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface Marker {
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
  markers?: Marker[]
  onModeChange?: (mode: 'dark' | 'satellite') => void
}

// CartoDB Dark Matter — free, no API key, perfect night mode
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
// ESRI World Imagery — free satellite tiles, no API key
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export default function MapView({ lat, lng, zoom = 14, className = '', onMapClick, mode = 'dark', markers = [], onModeChange }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map())
  const [currentMode, setCurrentMode] = useState(mode)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current, {
      center: [lat, lng],
      zoom,
      zoomControl: true,
      attributionControl: false,
    })

    tileLayerRef.current = L.tileLayer(
      currentMode === 'dark' ? DARK_TILES : SATELLITE_TILES,
      { maxZoom: 19, minZoom: 3 }
    ).addTo(mapRef.current)

    if (onMapClick) {
      mapRef.current.on('click', (e: L.LeafletMouseEvent) => {
        onMapClick(e.latlng.lat, e.latlng.lng)
      })
    }

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      tileLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Switch tile layer when mode changes
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return
    mapRef.current.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(
      currentMode === 'dark' ? DARK_TILES : SATELLITE_TILES,
      { maxZoom: 19, minZoom: 3 }
    ).addTo(mapRef.current)
  }, [currentMode])

  // Update view when coords change
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], zoom, { duration: 1.2 })
    }
  }, [lat, lng, zoom])

  // Sync external mode prop
  useEffect(() => {
    setCurrentMode(mode)
  }, [mode])

  // Handle markers
  useEffect(() => {
    if (!mapRef.current) return

    // Remove old markers
    markersRef.current.forEach((marker) => {
      mapRef.current?.removeLayer(marker)
    })
    markersRef.current.clear()

    // Add new markers
    markers.forEach((marker) => {
      const colorMap = {
        green: '#22c55e',
        amber: '#f59e0b',
        red: '#ef4444',
      }

      const circleMarker = L.circleMarker([marker.lat, marker.lng], {
        radius: 8,
        fillColor: colorMap[marker.color],
        color: 'rgba(255,255,255,0.3)',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      }).addTo(mapRef.current!)

      if (marker.onClick) {
        circleMarker.on('click', marker.onClick)
      }

      markersRef.current.set(marker.id, circleMarker)
    })
  }, [markers])

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}
