'use client'

import { useState, useCallback } from 'react'
import { authFetch } from '@/lib/authFetch'
import {
  Search,
  Download,
  Video,
  RefreshCw,
  TriangleRight,
  Compass,
  Ruler,
  Grid3x3,
  Loader2,
  AlertCircle,
} from 'lucide-react'

export interface RoofSegment {
  id: number
  pitchDegrees: number
  pitchRatio: string
  azimuthDegrees: number
  orientation: string
  areaSqft: number
  roofingSquares: number
  pitchMultiplier: number
}

export interface RoofMeasurements {
  address: string
  lat: number
  lng: number
  totalSquares: number
  pitchAdjustedSquares: number
  roofPitch: string
  totalAreaSqft: number
  segments: RoofSegment[]
  imageryDate: string
  imageryQuality: string
}

interface RoofAnalyzerProps {
  initialAddress?: string
  initialLat?: number
  initialLng?: number
  onExportToProposal?: (data: RoofMeasurements) => void
  mapsApiKey: string
}

export default function RoofAnalyzer({
  initialAddress = '',
  initialLat,
  initialLng,
  onExportToProposal,
  mapsApiKey,
}: RoofAnalyzerProps) {
  const [address, setAddress] = useState(initialAddress)
  const [lat, setLat] = useState(initialLat || 0)
  const [lng, setLng] = useState(initialLng || 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [measurements, setMeasurements] = useState<RoofMeasurements | null>(null)
  const [loadingVideo, setLoadingVideo] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!address.trim()) {
      setError('Please enter an address')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Step 1: Geocode the address
      const geocodeRes = await authFetch(`/api/geocode?q=${encodeURIComponent(address)}`)
      if (!geocodeRes.ok) {
        throw new Error('Failed to geocode address')
      }
      const geocodeData = await geocodeRes.json()
      const newLat = geocodeData.lat
      const newLng = geocodeData.lng

      setLat(newLat)
      setLng(newLng)

      // Step 2: Get roof measurements
      const roofRes = await authFetch(
        `/api/roof-measure?lat=${newLat}&lng=${newLng}`
      )
      if (!roofRes.ok) {
        const errorData = await roofRes.json()
        throw new Error(errorData.error || 'Failed to fetch roof data')
      }
      const roofData = await roofRes.json()

      // Transform API response to RoofMeasurements
      const segments: RoofSegment[] = (roofData.roof?.segments || []).map(
        (seg: any, idx: number) => ({
          id: seg.id || idx + 1,
          pitchDegrees: seg.pitchDegrees,
          pitchRatio: seg.pitchRatio,
          azimuthDegrees: seg.azimuthDegrees,
          orientation: seg.orientation,
          areaSqft: seg.areaSqft,
          roofingSquares: seg.areaSqft / 100,
          pitchMultiplier: calculatePitchMultiplier(seg.pitchDegrees),
        })
      )

      const totalSquares = roofData.roof?.roofingSquares || 0
      const pitchMultiplier = roofData.roof?.pitchMultiplier || 1.0
      const pitchAdjustedSquares = totalSquares * pitchMultiplier

      const result: RoofMeasurements = {
        address: geocodeData.address || address,
        lat: newLat,
        lng: newLng,
        totalSquares,
        pitchAdjustedSquares,
        roofPitch: roofData.roof?.avgPitchRatio || '0/12',
        totalAreaSqft: roofData.roof?.totalAreaSqFt || 0,
        segments,
        imageryDate: roofData.imagery?.date || 'Unknown',
        imageryQuality: roofData.imagery?.quality || 'Unknown',
      }

      setMeasurements(result)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
      setMeasurements(null)
    } finally {
      setLoading(false)
    }
  }, [address])

  const handleViewAerialVideo = useCallback(async () => {
    if (!address.trim()) return

    setLoadingVideo(true)
    try {
      const res = await authFetch(
        `/api/aerial-view?address=${encodeURIComponent(address)}`
      )
      if (!res.ok) {
        throw new Error('Aerial video not available for this location')
      }
      const data = await res.json()
      if (data.url) {
        window.open(data.url, '_blank')
      } else {
        setError('Aerial video not available for this location')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingVideo(false)
    }
  }, [address])

  const handleExport = useCallback(() => {
    if (measurements && onExportToProposal) {
      onExportToProposal(measurements)
    }
  }, [measurements, onExportToProposal])

  const satImageUrl =
    lat && lng
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=19&size=600x400&maptype=satellite&key=${mapsApiKey}`
      : null

  return (
    <div className="absolute inset-4 top-[184px] z-30 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-224px)]">
      {/* Header Panel */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-cyan/20 flex items-center justify-center border border-cyan/30">
            <Ruler className="w-5 h-5 text-cyan" />
          </div>
          <div>
            <h2 className="font-bold text-white">Roof Analyzer</h2>
            <p className="text-xs text-gray-400">Free satellite roof measurements</p>
          </div>
        </div>

        {/* Search Input */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Property Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSearch()
              }}
              placeholder="e.g. 123 Main St, Huntsville, AL"
              className="flex-1 bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
            />
            <button
              disabled={loading || !address.trim()}
              onClick={handleSearch}
              className="bg-cyan text-dark px-4 py-2 rounded-lg font-bold text-sm hover:bg-cyan/90 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>
      </div>

      {measurements && (
        <>
          {/* Satellite Image Panel */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Grid3x3 className="w-4 h-4 text-cyan" />
              Satellite View
            </h3>
            {satImageUrl && (
              <div className="relative overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={satImageUrl}
                  alt="Satellite view"
                  className="w-full h-auto"
                />
              </div>
            )}
          </div>

          {/* Measurements Summary Panel */}
          <div className="glass rounded-xl p-6">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Ruler className="w-4 h-4 text-cyan" />
              Roof Measurements
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {/* Total Squares */}
              <div className="bg-dark-700/50 rounded-lg p-4 border border-white/5">
                <p className="text-xs text-gray-400 mb-1">Total Squares</p>
                <p className="text-2xl font-bold text-cyan">
                  {measurements.totalSquares.toFixed(1)}
                </p>
              </div>

              {/* Pitch-Adjusted Squares */}
              <div className="bg-dark-700/50 rounded-lg p-4 border border-white/5">
                <p className="text-xs text-gray-400 mb-1">Pitch-Adjusted</p>
                <p className="text-2xl font-bold text-cyan">
                  {measurements.pitchAdjustedSquares.toFixed(1)}
                </p>
              </div>

              {/* Roof Pitch */}
              <div className="bg-dark-700/50 rounded-lg p-4 border border-white/5">
                <p className="text-xs text-gray-400 mb-1">Roof Pitch</p>
                <p className="text-2xl font-bold text-cyan">{measurements.roofPitch}</p>
              </div>

              {/* Total Area */}
              <div className="bg-dark-700/50 rounded-lg p-4 border border-white/5">
                <p className="text-xs text-gray-400 mb-1">Total Area</p>
                <p className="text-xl font-bold text-cyan">
                  {measurements.totalAreaSqft.toLocaleString()}
                  <span className="text-xs text-gray-400 ml-1">sqft</span>
                </p>
              </div>
            </div>

            {/* Imagery Info */}
            <div className="text-xs text-gray-400 space-y-1">
              <p>
                <span className="font-semibold">Imagery Date:</span> {measurements.imageryDate}
              </p>
              <p>
                <span className="font-semibold">Imagery Quality:</span> {measurements.imageryQuality}
              </p>
            </div>
          </div>

          {/* Segments Table */}
          {measurements.segments.length > 0 && (
            <div className="glass rounded-xl p-6 overflow-x-auto">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <TriangleRight className="w-4 h-4 text-cyan" />
                Roof Segments ({measurements.segments.length})
              </h3>

              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 text-gray-400 font-semibold">#</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-semibold">Pitch</th>
                    <th className="text-left py-2 px-3 text-gray-400 font-semibold">Orientation</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-semibold">Area (sqft)</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-semibold">Squares</th>
                    <th className="text-right py-2 px-3 text-gray-400 font-semibold">Multiplier</th>
                  </tr>
                </thead>
                <tbody>
                  {measurements.segments.map((seg) => (
                    <tr key={seg.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2 px-3 text-white font-medium">{seg.id}</td>
                      <td className="py-2 px-3 text-gray-300">{seg.pitchRatio}</td>
                      <td className="py-2 px-3 text-gray-300 flex items-center gap-1">
                        <Compass className="w-3 h-3 text-gray-500" />
                        {seg.orientation}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">
                        {seg.areaSqft.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right text-cyan font-semibold">
                        {seg.roofingSquares.toFixed(1)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">
                        {seg.pitchMultiplier.toFixed(2)}x
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Action Buttons */}
          <div className="glass rounded-xl p-6 flex gap-3">
            <button
              onClick={handleViewAerialVideo}
              disabled={loadingVideo}
              className="flex-1 flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
            >
              {loadingVideo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Video className="w-4 h-4" />
              )}
              View Aerial Video
            </button>

            {onExportToProposal && (
              <button
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan text-dark px-4 py-2 rounded-lg font-bold text-sm hover:bg-cyan/90 transition-all"
              >
                <Download className="w-4 h-4" />
                Export to Proposal
              </button>
            )}

            <button
              onClick={() => setMeasurements(null)}
              className="flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              New Search
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function calculatePitchMultiplier(pitchDegrees: number): number {
  return 1 / Math.cos((pitchDegrees * Math.PI) / 180)
}
