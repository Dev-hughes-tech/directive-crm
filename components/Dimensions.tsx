'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
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
  Hammer,
  Droplets,
  AlertTriangle,
  LayoutGrid,
} from 'lucide-react'

const Roof3DViewer = dynamic(() => import('./Roof3DViewer'), { ssr: false })

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

interface DimensionsProps {
  onExportToProposal?: (data: DimensionsResult) => void
}

export default function Dimensions({ onExportToProposal }: DimensionsProps) {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [loadingDot, setLoadingDot] = useState(0)
  const [result, setResult] = useState<DimensionsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'blueprint' | 'roof' | 'building' | 'materials' | 'satellite'>(
    'overview'
  )
  const [mapsApiKey, setMapsApiKey] = useState('')
  const [selectedRoofType, setSelectedRoofType] = useState<string>('asphalt_shingle')

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

  // Animated loading dots
  useEffect(() => {
    if (!loading) return
    const t = setInterval(() => setLoadingDot(d => (d + 1) % 4), 400)
    return () => clearInterval(t)
  }, [loading])

  const handleMeasure = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) {
      setError('Please enter an address')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    const steps = [
      'Locating address...',
      'Querying Solar API...',
      'Fetching building footprint...',
      'Computing measurements...',
    ]
    let stepIdx = 0
    setLoadingStep(steps[0])
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1)
      setLoadingStep(steps[stepIdx])
    }, 2200)

    try {

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
      clearInterval(stepTimer)
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
      <div className="flex flex-col h-full bg-[#0a0e14]">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#0d1117] flex-shrink-0">
          <img src="/dimensions-logo.svg" alt="Dimensions by Directive" className="h-9 w-auto object-contain" />
          <div className="flex-1" />
          <span className="text-xs text-gray-500">Aerial Measurement Tool</span>
        </div>

        {/* Search bar row */}
        <div className="flex items-center gap-3 px-5 py-3 bg-[#0d1117]/60 border-b border-white/5 flex-shrink-0">
          <form onSubmit={handleMeasure} className="flex items-center gap-2 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter property address to measure..."
                className="w-full bg-[#161b22] border border-white/15 rounded-lg pl-4 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/60 transition text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-cyan-500 text-slate-950 px-5 py-2.5 rounded-lg font-bold hover:bg-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm whitespace-nowrap flex-shrink-0"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>{loadingStep}<span className="opacity-60">{'.'.repeat(loadingDot)}</span></span></>
              ) : (
                <><Ruler className="w-4 h-4" /> Measure Property</>
              )}
            </button>
          </form>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          {loading ? (
            <div className="flex flex-col items-center gap-6">
              {/* Animated scanner */}
              <div className="relative w-40 h-40">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-4 rounded-full border-2 border-cyan-500/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
                <div className="absolute inset-8 rounded-full border border-cyan-500/60" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <img src="/dimensions-logo.svg" alt="" className="h-20 w-auto object-contain opacity-80" />
                </div>
                {/* Scan line */}
                <div className="absolute inset-0 overflow-hidden rounded-full">
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-bounce" style={{ marginTop: '50%', animationDuration: '1.5s' }} />
                </div>
              </div>
              <div className="text-center">
                <p className="text-cyan-400 font-medium text-sm">{loadingStep}<span className="opacity-60">{'.'.repeat(loadingDot)}</span></p>
                <p className="text-gray-500 text-xs mt-1">Querying Google Solar · OpenStreetMap · USGS</p>
              </div>
            </div>
          ) : (
            <>
              <img src="/dimensions-logo.svg" alt="Dimensions by Directive" className="h-36 w-auto object-contain" />
              <div className="text-center max-w-md">
                <p className="text-gray-300 text-sm">Enter a property address above to generate aerial roof measurements, 3D structural analysis, and full material estimates.</p>
                <div className="grid grid-cols-3 gap-3 mt-6">
                  {[
                    { icon: '📐', label: 'Roof Squares', sub: 'Precise sq footage' },
                    { icon: '🏗️', label: '3D Blueprint', sub: 'Interactive model' },
                    { icon: '🛰️', label: 'Satellite View', sub: 'Google imagery' },
                  ].map(f => (
                    <div key={f.label} className="glass border border-white/10 rounded-xl p-4 text-center">
                      <div className="text-2xl mb-2">{f.icon}</div>
                      <p className="text-white text-xs font-semibold">{f.label}</p>
                      <p className="text-gray-500 text-[10px] mt-0.5">{f.sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="w-full max-w-lg bg-red-950/40 border border-red-500/40 rounded-xl p-4 flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 text-sm font-medium">Measurement Failed</p>
                <p className="text-red-400/70 text-xs mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer bar */}
        <div className="flex items-center justify-center gap-6 px-5 py-2 border-t border-white/5 bg-[#0d1117]/40 flex-shrink-0">
          <span className="text-[10px] text-gray-600">Powered by Google Solar API</span>
          <span className="text-[10px] text-gray-700">•</span>
          <span className="text-[10px] text-gray-600">OpenStreetMap</span>
          <span className="text-[10px] text-gray-700">•</span>
          <span className="text-[10px] text-gray-600">USGS 3DEP Elevation</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0e14]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/10 bg-[#0d1117] flex-shrink-0">
        <img src="/dimensions-logo.svg" alt="Dimensions by Directive" className="h-9 w-auto object-contain flex-shrink-0" />
        {/* New search inline */}
        <form onSubmit={handleMeasure} className="flex items-center gap-2 flex-1 max-w-xl ml-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Search another address..."
            className="flex-1 bg-[#161b22] border border-white/10 rounded-lg px-3 py-1.5 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 transition text-xs"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-cyan-500/90 text-slate-950 px-3 py-1.5 rounded-lg font-bold hover:bg-cyan-400 transition disabled:opacity-40 text-xs flex items-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ruler className="w-3 h-3" />}
            {loading ? loadingStep : 'Measure'}
          </button>
        </form>
        <div className="flex-1" />
        {result.imageryQuality.startsWith('ESTIMATED') && (
          <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-2 py-0.5">Estimated</span>
        )}
        <button
          onClick={() => onExportToProposal?.(result)}
          className="flex-shrink-0 bg-cyan-500 text-slate-950 px-3 py-1.5 rounded-lg font-bold hover:bg-cyan-400 transition text-xs flex items-center gap-1.5"
        >
          <FileText className="w-3 h-3" />
          Export to Proposal
        </button>
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-2 px-5 py-1.5 bg-[#0d1117]/50 border-b border-white/5 flex-shrink-0">
        <span className="text-[10px] text-gray-500">📍</span>
        <span className="text-xs text-gray-400 truncate">{result.address}</span>
      </div>

      {/* Full-width tab bar */}
      <div className="flex gap-0 border-b border-white/10 bg-[#0d1117]/30 flex-shrink-0">
        {(['overview', 'blueprint', 'roof', 'building', 'materials', 'satellite'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition capitalize tracking-wide ${
              activeTab === tab
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {tab === 'blueprint' ? '3D Blueprint' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Blueprint: full-height 3D viewer — no scroll wrapper */}
      {activeTab === 'blueprint' && result && (
        <div className="flex flex-col flex-1 min-h-0 gap-2 p-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <LayoutGrid className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">3D Roof Model</h3>
            <span className="ml-auto text-xs text-gray-500">Drag to rotate · Scroll to zoom · Right-click to pan</span>
          </div>
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-white/10">
            <Roof3DViewer
              segments={result.roof.segments}
              building={result.building}
              structural={result.structural}
              edges={result.roof.edges}
            />
          </div>
          <div className="grid grid-cols-4 gap-2 flex-shrink-0">
            {[
              { color: '#ffffff', label: 'Ridge', value: `${result.roof.edges.ridgeFt} lf` },
              { color: '#22c55e', label: 'Valley', value: `${result.roof.edges.valleyFt} lf` },
              { color: '#f97316', label: 'Hip', value: `${result.roof.edges.hipFt} lf` },
              { color: '#38bdf8', label: 'Eave', value: `${result.roof.edges.eaveFt} lf` },
            ].map(item => (
              <div key={item.label} className="bg-[#0d1117] rounded-lg p-2 border border-white/10 text-center">
                <div className="w-full h-0.5 rounded mb-1.5" style={{ backgroundColor: item.color }} />
                <p className="text-xs font-bold text-white">{item.value}</p>
                <p className="text-[10px] text-gray-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Satellite tab */}
      {activeTab === 'satellite' && (
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-4">
          {mapsApiKey ? (
            <img
              src={`https://maps.googleapis.com/maps/api/staticmap?center=${result.lat},${result.lng}&zoom=19&size=900x600&maptype=satellite&key=${mapsApiKey}`}
              alt="Satellite view"
              className="w-full rounded-xl object-cover border border-white/10"
            />
          ) : (
            <div className="glass border border-white/10 rounded-xl p-8 text-center text-gray-400 text-sm">
              Satellite imagery unavailable — Maps API key not configured.
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <InfoRow label="Imagery Date" value={result.imageryDate} />
            <InfoRow label="Quality" value={result.imageryQuality} />
            <InfoRow label="Coordinates" value={`${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`} />
          </div>
        </div>
      )}

      {/* Scrollable content for all other tabs */}
      {activeTab !== 'blueprint' && activeTab !== 'satellite' && (
        <div className="flex-1 overflow-y-auto space-y-4 p-4">
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

                <div className="glass rounded-xl p-4 border border-white/10">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Hammer className="w-4 h-4 text-cyan" /> Structural Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Total Rafters" value={result.structural.totalRafters} unit="pcs" color="cyan" />
                    <StatCard label="Rafter Spacing" value={result.structural.rafterSpacingIn} unit="in O.C." color="cyan" />
                    <StatCard label="Plywood Sheets" value={result.structural.totalPlywoodSheets} unit="4×8 sheets" color="amber" />
                    <StatCard label="Roof Type" value={result.structural.roofType.replace(/_/g, ' ')} color="purple" />
                  </div>
                  {result.structural.structuralNotes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {result.structural.structuralNotes.map((note, i) => (
                        <p key={i} className="text-xs text-amber-400 flex items-start gap-1">
                          <span className="mt-0.5">⚠</span> {note}
                        </p>
                      ))}
                    </div>
                  )}
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
                  <h3 className="text-sm font-bold text-white mb-2">Rafter & Sheathing</h3>
                  <div className="glass border border-white/10 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5 border-b border-white/10">
                        <tr>
                          <th className="px-3 py-2 text-left">Segment</th>
                          <th className="px-3 py-2 text-right">Rafters</th>
                          <th className="px-3 py-2 text-right">Rafter Length</th>
                          <th className="px-3 py-2 text-right">Plywood Sheets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.roof.segments.map((seg, i) => (
                          <tr key={i} className="border-t border-white/5">
                            <td className="px-3 py-2 text-gray-300">{seg.orientation} ({seg.pitch12}:12)</td>
                            <td className="px-3 py-2 text-right text-white">{seg.rafterCount}</td>
                            <td className="px-3 py-2 text-right text-white">{seg.rafterLengthFt} ft</td>
                            <td className="px-3 py-2 text-right text-white">{seg.plywoodSheets}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-cyan/20 font-semibold">
                          <td className="px-3 py-2 text-cyan">Totals</td>
                          <td className="px-3 py-2 text-right text-cyan">{result.structural.totalRafters}</td>
                          <td className="px-3 py-2 text-right text-gray-400">—</td>
                          <td className="px-3 py-2 text-right text-cyan">{result.structural.totalPlywoodSheets}</td>
                        </tr>
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

                <div className="glass rounded-xl p-4 border border-white/10 mt-3">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-cyan" /> Gutter & Drainage System
                  </h3>
                  <div className="space-y-2">
                    <InfoRow
                      label={`${result.building.gutterSystem.gutterSizeIn}" K-Style Gutters`}
                      value={`${result.building.gutterSystem.gutterLinearFt.toLocaleString()} lf`}
                    />
                    <InfoRow
                      label="Downspouts"
                      value={`${result.building.gutterSystem.downspoutsNeeded} pcs (${result.building.gutterSystem.downspoutSizeIn}" dia)`}
                    />
                    <InfoRow
                      label="Downspout Pipe"
                      value={`${result.building.gutterSystem.downspoutLinearFt.toLocaleString()} lf total`}
                    />
                    <InfoRow label="Leaf Guard" value={`${result.building.gutterSystem.leafGuardLinearFt.toLocaleString()} lf (optional)`} />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{result.building.gutterSystem.note}</p>
                </div>

                {result.flatRoofDrainage && (
                  <div className="glass rounded-xl p-4 border border-amber-400/20 mt-3">
                    <h3 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Flat Roof Drainage Required
                    </h3>
                    <div className="space-y-2">
                      <InfoRow
                        label="Interior Roof Drains"
                        value={`${result.flatRoofDrainage.interiorDrainsNeeded} drains`}
                      />
                      <InfoRow label="Drain Spacing" value={`${result.flatRoofDrainage.drainSpacingFt} ft apart`} />
                      <InfoRow
                        label="Overflow Scuppers"
                        value={`${result.flatRoofDrainage.scuppersNeeded} scuppers`}
                      />
                      <InfoRow label="Sump Areas" value={`${result.flatRoofDrainage.sumpsNeeded} sumps`} />
                    </div>
                    <p className="text-xs text-amber-400 mt-2">{result.flatRoofDrainage.note}</p>
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-4">
                  Wall measurements estimated from building footprint data
                </p>
              </div>
            )}

            {/* Materials */}
            {activeTab === 'materials' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-3">Roofing Material Options</h3>
                  <div className="space-y-2">
                    {Object.entries(result.materialOptions).map(([key, option]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedRoofType(key)}
                        className={`w-full text-left p-3 rounded-lg border transition ${
                          selectedRoofType === key
                            ? 'bg-cyan-500/20 border-cyan-500'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-white text-sm">{option.name}</p>
                            <p className="text-xs text-gray-400 mt-1">{option.note}</p>
                          </div>
                          <div
                            className={`text-xs font-bold px-2 py-1 rounded ${
                              option.suitable
                                ? 'bg-green-500/20 text-green-300'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                          >
                            {option.suitable ? 'Suitable' : 'Not recommended'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedRoofType && result.materialOptions[selectedRoofType as keyof typeof result.materialOptions] && (
                  <div className="glass rounded-xl p-4 border border-cyan/20">
                    <h4 className="text-sm font-bold text-cyan mb-3">
                      {result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].name}
                    </h4>
                    <div className="space-y-2">
                      <InfoRow
                        label="Primary Material"
                        value={`${result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].quantity} ${result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].unit}`}
                      />
                      {result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].totalBundles && (
                        <InfoRow
                          label="Bundles"
                          value={result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].totalBundles!.toLocaleString()}
                        />
                      )}
                      {result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].totalTiles && (
                        <InfoRow
                          label="Total Tiles"
                          value={result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].totalTiles!.toLocaleString()}
                        />
                      )}
                      {result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].rollsNeeded && (
                        <InfoRow
                          label="Rolls Needed"
                          value={result.materialOptions[selectedRoofType as keyof typeof result.materialOptions].rollsNeeded!.toLocaleString()}
                        />
                      )}
                      <InfoRow
                        label="Synthetic Underlayment"
                        value={`${result.materials.underlaySqFt.toLocaleString()} sq ft`}
                      />
                      <InfoRow
                        label="Ice & Water Shield"
                        value={`${result.materials.iceWaterLinearFt.toLocaleString()} linear ft`}
                      />
                      <InfoRow
                        label="Drip Edge"
                        value={`${result.materials.dripEdgeLinearFt.toLocaleString()} linear ft`}
                      />
                      <InfoRow
                        label="Ridge Cap"
                        value={`${result.materials.ridgeCapLinearFt.toLocaleString()} linear ft`}
                      />
                      <InfoRow label="Plywood Sheets (4×8)" value={result.structural.totalPlywoodSheets.toLocaleString()} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sublabel,
  unit,
  icon,
  color,
}: {
  label: string
  value: string | number
  sublabel?: string
  unit?: string
  icon?: React.ReactNode
  color?: string
}) {
  return (
    <div className="glass border border-white/10 rounded-lg p-3 flex gap-2">
      {icon && <div className="text-cyan-400 flex-shrink-0 mt-0.5">{icon}</div>}
      <div className="flex-1">
        <p className="text-xs text-gray-400">{label}</p>
        <div className="flex items-baseline gap-1">
          <p className={`text-lg font-bold ${color || 'text-white'}`}>{value}</p>
          {unit && <p className="text-xs text-gray-500">{unit}</p>}
        </div>
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
