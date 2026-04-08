'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import {
  Search,
  MapPin,
  Cloud,
  Wind,
  Droplets,
  AlertTriangle,
  Send,
  Thermometer,
  BarChart3,
  Navigation,
  Brain,
  Radio,
  Zap,
  Clock,
  ChevronRight,
  Loader2,
  Phone,
  Mail,
} from 'lucide-react'
import type { WeatherCurrent, WeatherAlert, ForecastPeriod, Screen, Property } from '@/lib/types'
import type { Marker } from '@/components/map/MapView'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

// Huntsville AL coordinates (Directive CRM HQ)
const HQ_LAT = 34.7304
const HQ_LNG = -86.5861

// Lead scoring function
function calculateLeadScore(property: Property): number {
  let score = 50

  if (property.roof_age_years !== null) {
    if (property.roof_age_years >= 20) score += 35
    else if (property.roof_age_years >= 15) score += 20
  }

  if (property.owner_phone !== null) score += 15

  if (property.market_value !== null && property.market_value > 200000) score += 10

  if (property.permit_count !== null && property.permit_count > 0) score -= 10

  return Math.max(10, Math.min(99, score))
}

// Get properties from localStorage
function getProperties(): Property[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem('directive_properties')
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

// Save properties to localStorage
function saveProperties(properties: Property[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('directive_properties', JSON.stringify(properties))
}

// Get color badge for score
function getScoreBadgeColor(score: number | null): string {
  if (score === null) return 'bg-gray-700 text-gray-300'
  if (score >= 70) return 'bg-green/20 text-green border border-green/30'
  if (score >= 50) return 'bg-amber/20 text-amber border border-amber/30'
  return 'bg-red/20 text-red border border-red/30'
}

// Property card component
interface PropertyCardProps {
  property: Property
}

function PropertyCard({ property }: PropertyCardProps) {
  const score = calculateLeadScore(property)

  return (
    <div className="glass p-6 rounded-lg space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">{property.address}</h3>
        <p className="text-xs text-gray-400 mt-1">
          {property.county || '—'} • {property.sources && Object.keys(property.sources)[0] ? 'County Assessor / Claude' : '—'}
        </p>
      </div>

      <div className="border-t border-white/5 pt-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-cyan">{score}</span>
          <span className="text-sm text-gray-400">/100 LEAD SCORE</span>
        </div>
      </div>

      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Owner</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Name:</span>
            <span className="text-white">{property.owner_name || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Phone:</span>
            {property.owner_phone ? (
              <a href={`tel:${property.owner_phone}`} className="text-cyan hover:text-cyan/80 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {property.owner_phone}
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Email:</span>
            {property.owner_email ? (
              <a href={`mailto:${property.owner_email}`} className="text-cyan hover:text-cyan/80 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {property.owner_email}
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Property</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Year Built:</span>
            <span className="text-white">{property.year_built || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Roof Age:</span>
            <span className="text-white">{property.roof_age_years !== null ? `${property.roof_age_years} years` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Market Value:</span>
            <span className="text-white">
              {property.market_value ? `$${property.market_value.toLocaleString()}` : '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Last Sale:</span>
            <span className="text-white">{property.last_sale_date || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Permits:</span>
            <span className="text-white">{property.permit_count || 0} on record</span>
          </div>
        </div>
      </div>

      {property.flags && property.flags.length > 0 && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Flags</h4>
          <div className="flex flex-wrap gap-2">
            {property.flags.map((flag) => (
              <span key={flag} className="text-xs bg-amber/10 text-amber border border-amber/30 px-2 py-1 rounded">
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard')
  const [weather, setWeather] = useState<WeatherCurrent | null>(null)
  const [alerts, setAlerts] = useState<WeatherAlert[]>([])
  const [forecast, setForecast] = useState<ForecastPeriod[]>([])
  const [hailEvents, setHailEvents] = useState<any[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [mapCenter, setMapCenter] = useState({ lat: HQ_LAT, lng: HQ_LNG })
  const [mapZoom, setMapZoom] = useState(14)
  const [loading, setLoading] = useState(true)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [currentTime, setCurrentTime] = useState<string>('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // GPS Sweep state
  const [sweepAddress, setSweepAddress] = useState('')
  const [sweepLoading, setSweepLoading] = useState(false)
  const [sweepPhase, setSweepPhase] = useState<'idle' | 'geocoding' | 'researching' | 'scoring'>('idle')
  const [sweepResult, setSweepResult] = useState<Property | null>(null)

  // Territory state
  const [territoryFilter, setTerritoryFilter] = useState<'all' | 'hot' | 'researched'>('all')
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)

  // StormScope state
  const [stormAddress, setStormAddress] = useState('')
  const [stormLoading, setStormLoading] = useState(false)
  const [stormRisk, setStormRisk] = useState<{ level: 'High' | 'Moderate' | 'Low'; eventCount: number } | null>(null)

  // Load properties on mount
  useEffect(() => {
    setProperties(getProperties())
  }, [])

  // Fetch weather data on mount
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const [weatherRes, alertsRes, forecastRes, hailRes] = await Promise.all([
          fetch(`/api/weather/current?lat=${HQ_LAT}&lng=${HQ_LNG}`),
          fetch(`/api/weather/alerts?lat=${HQ_LAT}&lng=${HQ_LNG}`),
          fetch(`/api/weather/forecast?lat=${HQ_LAT}&lng=${HQ_LNG}`),
          fetch(`/api/noaa/hail?lat=${HQ_LAT}&lng=${HQ_LNG}&days=365`),
        ])

        if (weatherRes.ok) setWeather(await weatherRes.json())
        if (alertsRes.ok) setAlerts(await alertsRes.json())
        if (forecastRes.ok) setForecast(await forecastRes.json())
        if (hailRes.ok) setHailEvents(await hailRes.json())
      } catch (error) {
        console.error('Error fetching weather:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchWeather()

    // Send initial Michael message on mount
    if (chatMessages.length === 0) {
      const hotCount = properties.filter((p) => calculateLeadScore(p) >= 70).length
      const initialMsg = `I'm tracking ${properties.length} properties in your pipeline. ${hotCount} are hot leads. ${alerts.length} active weather alerts. What do you need?`
      setChatMessages([{ role: 'assistant', content: initialMsg }])
    }
  }, [])

  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      )
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Handle GPS Sweep research
  const handleSweepResearch = async () => {
    if (!sweepAddress.trim()) return

    setSweepLoading(true)
    setSweepPhase('geocoding')

    try {
      // Phase 1: Geocode
      const geocodeRes = await fetch(`/api/geocode?q=${encodeURIComponent(sweepAddress)}`)
      if (!geocodeRes.ok) throw new Error('Geocoding failed')
      const { lat, lng, display_name } = await geocodeRes.json()

      setSweepPhase('researching')

      // Phase 2: Research
      const researchRes = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: sweepAddress }),
      })

      if (!researchRes.ok) throw new Error('Research failed')
      const { data } = await researchRes.json()

      setSweepPhase('scoring')

      // Phase 3: Create property
      const newProperty: Property = {
        id: `prop_${Date.now()}`,
        address: display_name || sweepAddress,
        lat,
        lng,
        owner_name: data.ownerName || null,
        owner_phone: data.ownerPhone || null,
        owner_email: data.ownerEmail || null,
        year_built: data.yearBuilt || null,
        roof_age_years: data.roofAgeYears || null,
        market_value: data.marketValue || null,
        assessed_value: data.assessedValue || null,
        last_sale_date: data.lastSaleDate || null,
        last_sale_price: data.lastSalePrice || null,
        county: data.county || null,
        parcel_id: data.parcelId || null,
        permit_count: data.permitCount || null,
        flags: data.flags || [],
        sources: data.sources || {},
        score: null,
        created_at: new Date().toISOString(),
      }

      setSweepResult(newProperty)
      setSweepPhase('idle')
    } catch (error) {
      console.error('Sweep error:', error)
      setSweepPhase('idle')
    } finally {
      setSweepLoading(false)
    }
  }

  // Save sweep result
  const handleSaveSweep = () => {
    if (!sweepResult) return
    const updated = [...properties, sweepResult]
    setProperties(updated)
    saveProperties(updated)
    setSweepResult(null)
    setSweepAddress('')
  }

  // Handle Michael chat
  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return

    const userMsg = chatInput
    setChatInput('')
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)

    try {
      const hotCount = properties.filter((p) => calculateLeadScore(p) >= 70).length
      const response = await fetch('/api/michael', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...chatMessages,
            { role: 'user', content: userMsg },
          ],
          context: {
            activeScreen,
            leadCount: properties.length,
            hotLeadCount: hotCount,
            alertCount: alerts.length,
            weatherSummary: weather ? `${weather.temperature_f}°F, ${weather.conditions}` : null,
          },
        }),
      })

      if (!response.ok) throw new Error('Failed to get response')
      const { reply } = await response.json()

      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (error) {
      console.error('Chat error:', error)
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Unable to connect. Please try again.' },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  // Handle StormScope risk assessment
  const handleStormAssess = async () => {
    if (!stormAddress.trim()) return

    setStormLoading(true)

    try {
      const geocodeRes = await fetch(`/api/geocode?q=${encodeURIComponent(stormAddress)}`)
      if (!geocodeRes.ok) throw new Error('Geocoding failed')
      const { lat, lng } = await geocodeRes.json()

      const hailRes = await fetch(`/api/noaa/hail?lat=${lat}&lng=${lng}&days=365`)
      if (!hailRes.ok) throw new Error('Hail data failed')
      const hailData = await hailRes.json()

      const eventCount = hailData.length
      let level: 'High' | 'Moderate' | 'Low'
      if (eventCount > 5) level = 'High'
      else if (eventCount > 2) level = 'Moderate'
      else level = 'Low'

      setStormRisk({ level, eventCount })
    } catch (error) {
      console.error('Storm assessment error:', error)
    } finally {
      setStormLoading(false)
    }
  }

  // Territory markers
  const territoryMarkers: Marker[] = properties.map((p) => {
    const score = calculateLeadScore(p)
    return {
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      color: score >= 70 ? 'green' : score >= 50 ? 'amber' : 'red',
      label: p.address,
      onClick: () => setSelectedProperty(p),
    }
  })

  // Filtered properties for territory
  const filteredProperties = properties.filter((p) => {
    if (territoryFilter === 'hot') return calculateLeadScore(p) >= 70
    if (territoryFilter === 'researched') return p.sources && Object.keys(p.sources).length > 0
    return true
  })

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-dark">
      {/* Background Map */}
      <div className="absolute inset-0 z-0">
        <MapView
          lat={mapCenter.lat}
          lng={mapCenter.lng}
          zoom={mapZoom}
          mode={activeScreen === 'stormscope' ? 'satellite' : 'dark'}
          markers={activeScreen === 'territory' ? territoryMarkers : []}
        />
      </div>

      {/* Top Navigation Bar */}
      <nav className="absolute top-0 left-0 right-0 z-40 glass m-4 rounded-lg">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/directive-wordmark.png"
              alt="Directive"
              width={140}
              height={36}
              className="h-8 w-auto"
            />
          </div>

          <div className="flex gap-2">
            {[
              { id: 'dashboard' as Screen, label: 'Dashboard', icon: BarChart3 },
              { id: 'territory' as Screen, label: 'Territory', icon: MapPin },
              { id: 'sweep' as Screen, label: 'GPS Sweep', icon: Navigation },
              { id: 'stormscope' as Screen, label: 'StormScope', icon: Radio },
              { id: 'michael' as Screen, label: 'Michael AI', icon: Brain },
            ].map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveScreen(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeScreen === tab.id
                      ? 'bg-cyan text-dark'
                      : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* SCREEN 1: DASHBOARD */}
      {activeScreen === 'dashboard' && (
        <>
          {/* Left Sidebar */}
          <div className="absolute left-4 top-20 bottom-4 w-80 overflow-y-auto space-y-3 z-30">
            {/* Lead Pipeline */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">Lead Pipeline</h2>
              </div>

              {properties.length === 0 ? (
                <p className="text-sm text-gray-400">Run GPS Sweep to build your pipeline</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
                    <div className="bg-dark-700/50 rounded-lg p-2">
                      <p className="text-gray-400 text-xs">Total</p>
                      <p className="text-lg font-bold text-cyan">{properties.length}</p>
                    </div>
                    <div className="bg-dark-700/50 rounded-lg p-2">
                      <p className="text-gray-400 text-xs">Hot</p>
                      <p className="text-lg font-bold text-green">
                        {properties.filter((p) => calculateLeadScore(p) >= 70).length}
                      </p>
                    </div>
                    <div className="bg-dark-700/50 rounded-lg p-2">
                      <p className="text-gray-400 text-xs">Avg Roof Age</p>
                      <p className="text-lg font-bold text-amber">
                        {properties.length > 0
                          ? Math.round(
                            properties.reduce((sum, p) => sum + (p.roof_age_years || 0), 0) /
                            properties.length
                          )
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {properties
                      .sort((a, b) => calculateLeadScore(b) - calculateLeadScore(a))
                      .slice(0, 5)
                      .map((prop) => {
                        const score = calculateLeadScore(prop)
                        return (
                          <div key={prop.id} className="flex items-center justify-between bg-dark-700/50 rounded-lg p-3 text-sm">
                            <div className="flex-1 min-w-0">
                              <p className="text-white truncate">{prop.address}</p>
                              {prop.roof_age_years && <p className="text-xs text-gray-400">{prop.roof_age_years}y old</p>}
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded ml-2 whitespace-nowrap ${getScoreBadgeColor(score)}`}>
                              {score}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Weather Intelligence */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Cloud className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">Weather Intelligence</h2>
              </div>

              {loading ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : weather ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Temperature</span>
                    <span className="font-mono text-white">{weather.temperature_f}°F</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Wind</span>
                    <span className="font-mono text-white">
                      {weather.wind_speed_mph} mph {weather.wind_direction}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Humidity</span>
                    <span className="font-mono text-white">{weather.humidity_pct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Conditions</span>
                    <span className="font-mono text-white text-right">{weather.conditions}</span>
                  </div>
                  <p className="text-xs text-gray-500 pt-2">NWS • weather.gov</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Unable to load weather data</p>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="absolute right-4 top-20 bottom-4 w-72 overflow-y-auto space-y-3 z-30">
            {/* Active Alerts */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red" />
                <h2 className="text-lg font-heading font-semibold">Active Alerts</h2>
              </div>

              {alerts.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green rounded-full" />
                  <p className="text-sm text-green">No active weather alerts</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 3).map((alert) => (
                    <div key={alert.id} className="border-l-2 border-amber pl-3 py-2 text-sm">
                      <p className="font-medium text-amber">{alert.event}</p>
                      <p className="text-xs text-gray-400 mt-1">{alert.headline}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Research */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">Quick Research</h2>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Enter address..."
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleSweepResearch()}
                />
                <button
                  onClick={handleSweepResearch}
                  className="w-full bg-cyan text-dark text-sm font-medium py-2 rounded-lg hover:bg-cyan/90 transition-all"
                >
                  Search
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Timeline */}
          <div className="absolute bottom-4 left-4 right-4 z-30 glass px-6 py-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-cyan rounded-full animate-pulse-dot" />
              <span className="text-sm font-mono text-gray-400">{currentTime}</span>
            </div>
            <span className="text-xs text-gray-500">Directive CRM • Huntsville, AL</span>
          </div>
        </>
      )}

      {/* SCREEN 2: TERRITORY */}
      {activeScreen === 'territory' && (
        <>
          {/* Left Panel */}
          <div className="absolute left-4 top-20 bottom-4 w-80 overflow-y-auto space-y-3 z-30">
            {/* Territory Overview */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">Territory</h2>
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Properties</span>
                  <span className="font-bold text-white">{properties.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Hot Leads (70+)</span>
                  <span className="font-bold text-green">
                    {properties.filter((p) => calculateLeadScore(p) >= 70).length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg Roof Age</span>
                  <span className="font-bold text-amber">
                    {properties.length > 0
                      ? Math.round(
                        properties.reduce((sum, p) => sum + (p.roof_age_years || 0), 0) /
                        properties.length
                      )
                      : '—'}
                  </span>
                </div>
              </div>

              {/* ZIP Breakdown */}
              {properties.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 font-semibold uppercase">ZIP Breakdown</p>
                  {Array.from(
                    properties.reduce((acc, p) => {
                      const zip = p.address.split(',').pop()?.trim() || 'Unknown'
                      acc.set(zip, (acc.get(zip) || 0) + 1)
                      return acc
                    }, new Map<string, number>())
                  ).map(([zip, count]) => (
                    <div key={zip} className="flex justify-between text-sm bg-dark-700/50 rounded-lg p-2">
                      <span className="text-gray-400">{zip}</span>
                      <span className="text-cyan">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Property List */}
            <div className="glass p-6 rounded-xl">
              <div className="flex gap-2 mb-4">
                {(['all', 'hot', 'researched'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTerritoryFilter(filter)}
                    className={`text-xs px-3 py-1 rounded-lg transition-all ${
                      territoryFilter === filter
                        ? 'bg-cyan text-dark'
                        : 'bg-dark-700/50 text-gray-400 hover:text-white'
                    }`}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredProperties.map((prop) => {
                  const score = calculateLeadScore(prop)
                  return (
                    <div
                      key={prop.id}
                      onClick={() => setSelectedProperty(prop)}
                      className="bg-dark-700/50 rounded-lg p-3 cursor-pointer hover:bg-dark-700 transition-all"
                    >
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="text-white truncate">{prop.address}</p>
                          <p className="text-xs text-gray-400">{prop.roof_age_years || '—'}y</p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${getScoreBadgeColor(score)}`}>
                            {score}
                          </span>
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Selected Property Detail */}
          {selectedProperty && (
            <div className="absolute inset-4 top-20 z-30 flex items-center justify-center">
              <div className="max-w-2xl w-full">
                <PropertyCard property={selectedProperty} />
              </div>
            </div>
          )}
        </>
      )}

      {/* SCREEN 3: GPS SWEEP */}
      {activeScreen === 'sweep' && (
        <>
          {/* Left Panel */}
          <div className="absolute left-4 top-20 bottom-4 w-96 overflow-y-auto space-y-3 z-30">
            {/* GPS Sweep Input */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Navigation className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">GPS Sweep</h2>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Enter address..."
                  value={sweepAddress}
                  onChange={(e) => setSweepAddress(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSweepResearch()}
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                />

                <button
                  onClick={handleSweepResearch}
                  disabled={sweepLoading}
                  className="w-full bg-cyan text-dark font-medium py-2 rounded-lg hover:bg-cyan/90 transition-all disabled:opacity-50"
                >
                  {sweepLoading ? 'Researching...' : 'Research Property'}
                </button>

                {sweepLoading && (
                  <div className="space-y-2 text-sm">
                    <div className={`flex items-center gap-2 ${sweepPhase === 'geocoding' ? 'text-cyan' : 'text-gray-500'}`}>
                      {sweepPhase === 'geocoding' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <span>✓</span>
                      )}
                      <span>Geocoding address...</span>
                    </div>
                    <div className={`flex items-center gap-2 ${sweepPhase === 'researching' ? 'text-cyan' : 'text-gray-500'}`}>
                      {sweepPhase === 'researching' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : sweepPhase !== 'idle' ? (
                        <span>✓</span>
                      ) : null}
                      <span>Running AI research...</span>
                    </div>
                    <div className={`flex items-center gap-2 ${sweepPhase === 'scoring' ? 'text-cyan' : 'text-gray-500'}`}>
                      {sweepPhase === 'scoring' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : sweepPhase === 'idle' && sweepResult ? (
                        <span>✓</span>
                      ) : null}
                      <span>Scoring lead...</span>
                    </div>
                  </div>
                )}

                {sweepResult && (
                  <>
                    <PropertyCard property={sweepResult} />
                    <button
                      onClick={handleSaveSweep}
                      className="w-full bg-green text-dark font-medium py-2 rounded-lg hover:bg-green/90 transition-all"
                    >
                      Save to Pipeline
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Recent Sweeps */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">Recent</h2>
              </div>

              {properties.length === 0 ? (
                <p className="text-sm text-gray-400">No recent sweeps</p>
              ) : (
                <div className="space-y-2">
                  {properties
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 10)
                    .map((prop) => {
                      const score = calculateLeadScore(prop)
                      return (
                        <div key={prop.id} className="bg-dark-700/50 rounded-lg p-3 text-sm">
                          <p className="text-white truncate">{prop.address}</p>
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-xs text-gray-400">
                              {new Date(prop.created_at).toLocaleDateString()}
                            </p>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${getScoreBadgeColor(score)}`}>
                              {score}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* SCREEN 4: STORMSCOPE */}
      {activeScreen === 'stormscope' && (
        <>
          {/* Left Panel */}
          <div className="absolute left-4 top-20 bottom-4 w-80 overflow-y-auto space-y-3 z-30">
            {/* Current Conditions */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Cloud className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">Current Conditions</h2>
              </div>

              {weather ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Temperature</span>
                    <span className="font-mono">{weather.temperature_f}°F</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Wind</span>
                    <span className="font-mono">
                      {weather.wind_speed_mph} mph {weather.wind_direction}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Humidity</span>
                    <span className="font-mono">{weather.humidity_pct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pressure</span>
                    <span className="font-mono">{weather.pressure_inhg} inHg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Conditions</span>
                    <span className="font-mono text-right">{weather.conditions}</span>
                  </div>
                  <p className="text-xs text-gray-500 pt-2">Observed at {weather.station}</p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
            </div>

            {/* 7-Day Forecast */}
            <div className="glass p-6 rounded-xl">
              <h3 className="text-sm font-semibold mb-3">7-Day Forecast</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {forecast
                  .filter((p) => p.isDaytime)
                  .slice(0, 5)
                  .map((period, idx) => (
                    <div key={idx} className="bg-dark-700/50 rounded-lg p-3 text-sm">
                      <p className="font-medium text-white">{period.name}</p>
                      <p className="text-gray-400 text-xs">{period.temperature}°F</p>
                      <p className="text-gray-500 text-xs mt-1">{period.shortForecast}</p>
                    </div>
                  ))}
              </div>
            </div>

            {/* NOAA Hail Events */}
            <div className="glass p-6 rounded-xl">
              <h3 className="text-sm font-semibold mb-3">NOAA Hail Events (1y)</h3>
              <p className="text-lg font-bold text-amber mb-3">{hailEvents.length} events</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {hailEvents.slice(0, 5).map((event, idx) => (
                  <div key={idx} className="bg-dark-700/50 rounded-lg p-2 text-xs">
                    <p className="font-medium text-white">{event.size.toFixed(2)}" hail</p>
                    <p className="text-gray-400">{event.date}</p>
                    <p className="text-amber">{event.severity}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className="absolute right-4 top-20 bottom-4 w-72 overflow-y-auto space-y-3 z-30">
            {/* Active Alerts */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red" />
                <h2 className="text-lg font-heading font-semibold">Active Alerts</h2>
              </div>

              {alerts.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green rounded-full" />
                  <p className="text-sm text-green">No active alerts</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="border-l-2 border-amber pl-3 py-2 text-sm">
                      <p className="font-medium text-amber">{alert.event}</p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{alert.headline}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Storm Assessment */}
            <div className="glass p-6 rounded-xl">
              <h3 className="text-sm font-semibold mb-3">Storm Assessment</h3>
              <input
                type="text"
                placeholder="Enter address..."
                value={stormAddress}
                onChange={(e) => setStormAddress(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStormAssess()}
                className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50 mb-3"
              />
              <button
                onClick={handleStormAssess}
                disabled={stormLoading}
                className="w-full bg-cyan text-dark text-sm font-medium py-2 rounded-lg hover:bg-cyan/90 transition-all disabled:opacity-50"
              >
                {stormLoading ? 'Assessing...' : 'Assess Risk'}
              </button>

              {stormRisk && (
                <div className="mt-4 p-4 bg-dark-700/50 rounded-lg text-sm">
                  <p className="text-gray-400 mb-2">Risk Level</p>
                  <p className={`text-2xl font-bold ${
                    stormRisk.level === 'High' ? 'text-red' :
                    stormRisk.level === 'Moderate' ? 'text-amber' :
                    'text-green'
                  }`}>
                    {stormRisk.level}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">{stormRisk.eventCount} events in past year</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* SCREEN 5: MICHAEL AI */}
      {activeScreen === 'michael' && (
        <div className="absolute inset-4 top-20 z-30 flex items-center justify-center">
          <div className="glass p-6 rounded-xl w-full max-w-2xl h-[calc(100vh-180px)] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-cyan/20 flex items-center justify-center border border-cyan/30">
                <Brain className="w-6 h-6 text-cyan" />
              </div>
              <div>
                <h2 className="text-lg font-heading font-semibold">Michael AI</h2>
                <p className="text-xs text-gray-400">Hughes Technologies</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="w-2 h-2 bg-green rounded-full animate-pulse-dot" />
                <span className="text-xs text-green">Online</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
              {chatMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Brain className="w-12 h-12 text-cyan/30 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">
                      Ask me about your leads, storm risk, or territory
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-md px-4 py-3 rounded-2xl text-sm ${
                          msg.role === 'user'
                            ? 'bg-cyan text-dark rounded-tr-sm'
                            : 'bg-dark-700 text-gray-200 rounded-tl-sm'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <p className="text-xs text-gray-500 mb-1">Michael • Directive CRM</p>
                        )}
                        <p className="break-words">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-dark-700 text-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ask Michael..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !chatLoading && handleSendChat()}
                disabled={chatLoading}
                className="flex-1 bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50 disabled:opacity-50"
              />
              <button
                onClick={handleSendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-cyan text-dark px-4 py-2 rounded-lg font-medium hover:bg-cyan/90 transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
