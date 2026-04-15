'use client'

import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/authFetch'
import {
  Ruler,
  Loader2,
  AlertCircle,
  FileText,
  Home,
  Square,
  BarChart3,
  Wind,
  Zap,
} from 'lucide-react'

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

interface DimensionsProps {
  onExportToProposal?: (data: DimensionsResult) => void
}

export default function Dimensions({ onExportToProposal }: DimensionsProps) {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [result, setResult] = useState<DimensionsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'roof' | 'building' | 'materials'>(
    'overview'
  )
  const [mapsApiKey, setMapsApiKey] = useState('')

  // Fetch maps API key on mount
  useEffect(() => {
    async function fetchKey() {
      try {
        const res = await authFetch('/api/maps-key')
        if (res.ok) {
          const data = await res.json()
          setMapsApiKey(data.key)
        }
      } catch (e) {
        console.error('Failed to fetch maps key:', e)
      }
    }
    fetchKey()
  }, [])

  const handleMeasure = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) {
      setError('Please enter an address')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      setLoadingStep('Locating address...')
      setLoadingStep('Analyzing roof from satellite...')
      setLoadingStep('Fetching building footprint...')
      setLoadingStep('Computing measurements...')

      const res = await authFetch('/api/dimensions/measure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to compute dimensions')
      }

      const data: DimensionsResult = await res.json()
      setResult(data)
      setActiveTab('overview')
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  const complexityColor = (c: string) => {
    if (c === 'simple') return 'text-green-400'
    if (c === 'moderate') return 'text-yellow-400'
    return 'text-red-400'
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
            <Ruler className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              Dimensions <span className="text-cyan-500">by Directive</span>
            </h1>
            <p className="text-xs text-gray-400">
              Aerial roof &amp; building measurement — powered by Google Solar + OpenStreetMap
            </p>
          </div>
        </div>

        <form onSubmit={handleMeasure} className="w-full max-w-md space-y-3">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter property address..."
            className="w-full glass border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-500 text-slate-950 px-6 py-3 rounded-lg font-bold hover:bg-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingStep}
              </>
            ) : (
              <>
                <Ruler className="w-4 h-4" />
                Measure Property
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="w-full max-w-md glass border border-red-500/50 rounded-lg p-4 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
          <Ruler className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">
            Dimensions <span className="text-cyan-500">by Directive</span>
          </h1>
          <p className="text-xs text-gray-400">{result.address}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 flex-1 overflow-hidden">
        {/* Left: Satellite Image */}
        <div className="w-[55%] flex flex-col gap-4">
          {mapsApiKey && (
            <img
              src={`https://maps.googleapis.com/maps/api/staticmap?center=${result.lat},${result.lng}&zoom=19&size=600x500&maptype=satellite&key=${mapsApiKey}`}
              alt="Satellite view"
              className="w-full h-96 rounded-lg object-cover border border-white/10"
            />
          )}
          <div className="text-xs text-gray-400 space-y-1">
            <p>
              <strong>Imagery Date:</strong> {result.imageryDate}
            </p>
            <p>
              <strong>Quality:</strong> {result.imageryQuality}
            </p>
            <p>
              <strong>Coordinates:</strong> {result.lat.toFixed(4)}, {result.lng.toFixed(4)}
            </p>
          </div>
        </div>

        {/* Right: Tabs panel */}
        <div className="w-[45%] flex flex-col">
          {/* Tab buttons */}
          <div className="flex gap-2 mb-4 border-b border-white/10">
            {(['overview', 'roof', 'building', 'materials'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition capitalize ${
                  activeTab === tab
                    ? 'border-cyan-500 text-cyan-500'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    label="Total Squares"
                    value={result.roof.totalSquares.toFixed(1)}
                    icon={<Square className="w-4 h-4" />}
                  />
                  <StatCard
                    label="Adjusted Squares"
                    value={result.roof.adjustedSquares.toFixed(1)}
                    sublabel={`+${(result.roof.wasteFactor * 100).toFixed(0)}% waste`}
                    icon={<Zap className="w-4 h-4" />}
                  />
                  <StatCard
                    label="Footprint Area"
                    value={result.building.footprintSqFt.toLocaleString()}
                    sublabel="sq ft"
                    icon={<Home className="w-4 h-4" />}
                  />
                  <StatCard
                    label="Perimeter"
                    value={result.building.perimeterFt.toLocaleString()}
                    sublabel="linear ft"
                    icon={<Wind className="w-4 h-4" />}
                  />
                  <StatCard
                    label="Wall Area"
                    value={result.building.wallAreaSqFt.toLocaleString()}
                    sublabel="sq ft"
                    icon={<BarChart3 className="w-4 h-4" />}
                  />
                  <StatCard
                    label="Complexity"
                    value={result.roof.complexity}
                    color={complexityColor(result.roof.complexity)}
                    icon={<AlertCircle className="w-4 h-4" />}
                  />
                </div>
              </div>
            )}

            {/* Roof */}
            {activeTab === 'roof' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-2">Roof Segments</h3>
                  <div className="glass border border-white/10 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                          <th className="px-3 py-2 text-left">Pitch</th>
                          <th className="px-3 py-2 text-left">Orient</th>
                          <th className="px-3 py-2 text-right">Area</th>
                          <th className="px-3 py-2 text-right">Squares</th>
                          <th className="px-3 py-2 text-right">Mult</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.roof.segments.map((seg, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-3 py-2">{seg.pitch12}:12</td>
                            <td className="px-3 py-2">{seg.orientation}</td>
                            <td className="px-3 py-2 text-right">{seg.areaSqFt.toLocaleString()} sf</td>
                            <td className="px-3 py-2 text-right">{seg.squares.toFixed(1)}</td>
                            <td className="px-3 py-2 text-right">{seg.pitchMultiplier.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white mb-2">Edge Measurements</h3>
                  <div className="glass border border-white/10 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                          <th className="px-3 py-2 text-left">Measurement</th>
                          <th className="px-3 py-2 text-right">Linear Ft</th>
                          <th className="px-3 py-2 text-left">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-3 py-2">Eave / Drip Edge</td>
                          <td className="px-3 py-2 text-right">{result.roof.edges.eaveFt.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">Full perimeter</td>
                        </tr>
                        <tr className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-3 py-2">Ridge</td>
                          <td className="px-3 py-2 text-right">{result.roof.edges.ridgeFt.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">Horizontal peak</td>
                        </tr>
                        {result.roof.edges.hipFt > 0 && (
                          <tr className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-3 py-2">Hip</td>
                            <td className="px-3 py-2 text-right">{result.roof.edges.hipFt.toLocaleString()}</td>
                            <td className="px-3 py-2 text-xs text-gray-400">Diagonal corners</td>
                          </tr>
                        )}
                        {result.roof.edges.rakeFt > 0 && (
                          <tr className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-3 py-2">Rake</td>
                            <td className="px-3 py-2 text-right">{result.roof.edges.rakeFt.toLocaleString()}</td>
                            <td className="px-3 py-2 text-xs text-gray-400">Gable ends</td>
                          </tr>
                        )}
                        {result.roof.edges.valleyFt > 0 && (
                          <tr className="hover:bg-white/5">
                            <td className="px-3 py-2">Valley</td>
                            <td className="px-3 py-2 text-right">{result.roof.edges.valleyFt.toLocaleString()}</td>
                            <td className="px-3 py-2 text-xs text-gray-400">Interior valleys</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Building */}
            {activeTab === 'building' && (
              <div className="space-y-3">
                <InfoRow label="Footprint" value={`${result.building.footprintSqFt.toLocaleString()} sq ft`} />
                <InfoRow label="Perimeter" value={`${result.building.perimeterFt.toLocaleString()} linear ft`} />
                <InfoRow label="Stories" value={result.building.stories.toString()} />
                <InfoRow label="Wall Height" value={`${result.building.wallHeightFt} ft`} />
                <InfoRow label="Wall Area" value={`${result.building.wallAreaSqFt.toLocaleString()} sq ft`} />
                <InfoRow
                  label="Fascia/Soffit"
                  value={`${result.building.fasciaSoffitLinearFt.toLocaleString()} linear ft`}
                />
                <p className="text-xs text-gray-400 mt-4">
                  Wall measurements estimated from building footprint data
                </p>
              </div>
            )}

            {/* Materials */}
            {activeTab === 'materials' && (
              <div className="space-y-2">
                <div className="glass border border-white/10 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="px-3 py-2 text-left">Material</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-left">Unit</th>
                        <th className="px-3 py-2 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2">3-Tab / Arch. Shingles</td>
                        <td className="px-3 py-2 text-right">{result.materials.shinglesBundles}</td>
                        <td className="px-3 py-2">bundles</td>
                        <td className="px-3 py-2 text-xs text-gray-400">3 bundles / sq</td>
                      </tr>
                      <tr className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2">Synthetic Underlayment</td>
                        <td className="px-3 py-2 text-right">{result.materials.underlaySqFt.toLocaleString()}</td>
                        <td className="px-3 py-2">sq ft</td>
                        <td className="px-3 py-2 text-xs text-gray-400">+10% coverage</td>
                      </tr>
                      <tr className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2">Ice &amp; Water Shield</td>
                        <td className="px-3 py-2 text-right">{result.materials.iceWaterLinearFt.toLocaleString()}</td>
                        <td className="px-3 py-2">linear ft</td>
                        <td className="px-3 py-2 text-xs text-gray-400">Eave + valley</td>
                      </tr>
                      <tr className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2">Drip Edge</td>
                        <td className="px-3 py-2 text-right">{result.materials.dripEdgeLinearFt.toLocaleString()}</td>
                        <td className="px-3 py-2">linear ft</td>
                        <td className="px-3 py-2 text-xs text-gray-400">Eave + rake</td>
                      </tr>
                      <tr className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2">Ridge Cap Shingles</td>
                        <td className="px-3 py-2 text-right">{result.materials.ridgeCapLinearFt.toLocaleString()}</td>
                        <td className="px-3 py-2">linear ft</td>
                        <td className="px-3 py-2 text-xs text-gray-400">Ridge + hip</td>
                      </tr>
                      <tr className="hover:bg-white/5">
                        <td className="px-3 py-2">Roofing Nails</td>
                        <td className="px-3 py-2 text-right">{result.materials.nailsBoxes}</td>
                        <td className="px-3 py-2">boxes</td>
                        <td className="px-3 py-2 text-xs text-gray-400">1 box / 4 sq</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Export button */}
          <button
            onClick={() => onExportToProposal?.(result)}
            className="w-full bg-cyan-500 text-slate-950 py-3 rounded-lg font-bold hover:bg-cyan-400 transition mt-6 flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Export to Proposal
          </button>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  sublabel,
  icon,
  color,
}: {
  label: string
  value: string | number
  sublabel?: string
  icon?: React.ReactNode
  color?: string
}) {
  return (
    <div className="glass border border-white/10 rounded-lg p-3 flex gap-2">
      {icon && <div className="text-cyan-400 flex-shrink-0 mt-0.5">{icon}</div>}
      <div className="flex-1">
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-lg font-bold ${color || 'text-white'}`}>{value}</p>
        {sublabel && <p className="text-xs text-gray-500">{sublabel}</p>}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass border border-white/10 rounded-lg p-3 flex justify-between items-center">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  )
}
