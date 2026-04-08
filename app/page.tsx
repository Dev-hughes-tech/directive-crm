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
  CircleDot,
  Zap as Lightning,
  Users,
  FileText,
  Package,
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  X,
} from 'lucide-react'
import type { WeatherCurrent, WeatherAlert, ForecastPeriod, Screen, Property, Client, Proposal, ProposalLineItem, Material, ChatMessage } from '@/lib/types'
import type { MapMarker } from '@/components/map/MapView'
import { getClients, saveClient, getProposals, saveProposal, getMaterials, saveMaterial, getChatMessages, saveChatMessage, getProperties, saveProperty, markMessagesRead } from '@/lib/storage'
import PropertyGraph from '@/components/dashboard/PropertyGraph'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })
import StreetView from '@/components/StreetView'
import AerialView from '@/components/AerialView'

// Huntsville AL coordinates (Directive CRM HQ)
const HQ_LAT = 34.7304
const HQ_LNG = -86.5861
const HQ_CITY = 'Huntsville, AL'


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
  const [mapMode, setMapMode] = useState<'dark' | 'satellite' | '3d'>('dark')
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
  const [commercialResults, setCommercialResults] = useState<Array<{
    id: string; name: string | null; address: string | null;
    lat: number | null; lng: number | null; types: string[]; phone: string | null
  }>>([])
  const [commercialLoading, setCommercialLoading] = useState(false)
  const [commercialRadius, setCommercialRadius] = useState(1000)
  const [sweepUserLocation, setSweepUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [sweepLocationAccuracy, setSweepLocationAccuracy] = useState<number | null>(null)

  // Territory state
  const [territoryFilter, setTerritoryFilter] = useState<'all' | 'hot' | 'researched'>('all')
  const [distanceResults, setDistanceResults] = useState<Map<string, { distanceMeters: number; distanceMiles: string; durationMinutes: number }>>(new Map())
  const [sortByDistance, setSortByDistance] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [showSatelliteSnapshot, setShowSatelliteSnapshot] = useState(false)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeResult, setRouteResult] = useState<{
    orderedWaypoints: Array<{ lat: number; lng: number; address: string; id: string }>
    totalDistanceMiles: string
    totalDurationMinutes: number
    googleMapsUrl: string
  } | null>(null)

  // StormScope state
  const [stormAddress, setStormAddress] = useState('')
  const [stormLoading, setStormLoading] = useState(false)
  const [stormRisk, setStormRisk] = useState<{ level: 'High' | 'Moderate' | 'Low'; eventCount: number } | null>(null)

  // Clients screen state
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientStatusFilter, setClientStatusFilter] = useState<string>('all')

  // Proposals screen state
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [editingProposal, setEditingProposal] = useState(false)

  // Materials screen state
  const [materials, setMaterials] = useState<Material[]>([])
  const [roofWidth, setRoofWidth] = useState('')
  const [roofLength, setRoofLength] = useState('')
  const [addingMaterial, setAddingMaterial] = useState(false)

  // Team chat state
  const [teamMessages, setTeamMessages] = useState<ChatMessage[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<'rep' | 'manager'>('rep')
  const [teamChatInput, setTeamChatInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // Load properties on mount
  useEffect(() => {
    const loadData = async () => {
      const [propsData, clientsData, proposalsData, materialsData, messagesData] = await Promise.all([
        getProperties(),
        getClients(),
        getProposals(),
        getMaterials(),
        getChatMessages('general')
      ])
      setProperties(propsData)
      setClients(clientsData)
      setProposals(proposalsData)
      setMaterials(materialsData)
      setTeamMessages(messagesData)
    }
    loadData()
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

  // Get accurate location from Google Geolocation API or browser GPS
  const getAccurateLocation = async (): Promise<{ lat: number; lng: number; accuracy?: number } | null> => {
    try {
      // Try Google Geolocation API first (more accurate, works indoors)
      const res = await fetch('/api/geolocate', { method: 'POST' })
      const data = await res.json()
      if (data.lat && data.lng) return data
    } catch { /* fall through */ }

    // Fallback: browser GPS
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  // Handle commercial building search
  const handleSearchCommercial = async () => {
    if (!sweepUserLocation) {
      // Get current location first
      const loc = await getAccurateLocation()
      if (!loc) {
        console.error('Could not determine location')
        return
      }
      setSweepUserLocation(loc)
      setSweepLocationAccuracy(loc.accuracy || null)
    }

    const loc = sweepUserLocation || await getAccurateLocation()
    if (!loc) return

    setCommercialLoading(true)
    try {
      const res = await fetch('/api/places-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: loc.lat, lng: loc.lng, radius: commercialRadius, type: 'commercial' })
      })
      const data = await res.json()
      setCommercialResults(data.places || [])
    } catch (error) {
      console.error('Commercial search error:', error)
      setCommercialResults([])
    } finally {
      setCommercialLoading(false)
    }
  }

  // Add commercial place as lead
  const handleAddCommercialLead = async (place: { id: string; name: string | null; address: string | null; lat: number | null; lng: number | null; phone: string | null }) => {
    if (!place.lat || !place.lng) return

    const newProperty: Property = {
      id: `prop_${Date.now()}`,
      address: place.address || '',
      lat: place.lat,
      lng: place.lng,
      owner_name: null,
      owner_phone: place.phone || null,
      owner_email: null,
      year_built: null,
      roof_age_years: null,
      market_value: null,
      assessed_value: null,
      last_sale_date: null,
      last_sale_price: null,
      county: null,
      parcel_id: null,
      permit_count: 0,
      flags: ['commercial'],
      sources: { 'Google Places': place.name || 'Commercial Property' },
      score: 50,
      created_at: new Date().toISOString()
    }

    const updated = [...properties, newProperty]
    setProperties(updated)
    await saveProperty(newProperty)
    setCommercialResults(commercialResults.filter(p => p.id !== place.id))
  }

  // Handle sort by distance
  const handleSortByDistance = async () => {
    const loc = await getAccurateLocation()
    if (!loc) return

    setUserLocation(loc)
    setSweepLocationAccuracy(loc.accuracy || null)

    const res = await fetch('/api/distance-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: loc.lat, lng: loc.lng },
        destinations: properties.map(p => ({ id: p.id, lat: p.lat, lng: p.lng }))
      })
    })

    const data = await res.json()
    const resultsMap = new Map<string, { distanceMeters: number; distanceMiles: string; durationMinutes: number }>()
    data.results?.forEach((r: { id: string; distanceMeters: number; distanceMiles: string; durationMinutes: number }) => {
      resultsMap.set(r.id, { distanceMeters: r.distanceMeters, distanceMiles: r.distanceMiles, durationMinutes: r.durationMinutes })
    })
    setDistanceResults(resultsMap)
    setSortByDistance(true)
  }

  // Handle GPS Sweep research
  const handleSweepResearch = async () => {
    if (!sweepAddress.trim()) return

    setSweepLoading(true)
    setSweepPhase('geocoding')

    try {
      // Phase 0: Validate address
      const validateRes = await fetch('/api/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: sweepAddress })
      })
      const validation = await validateRes.json()
      const addressToResearch = validation.canonical || sweepAddress

      // Phase 1: Geocode
      const geocodeRes = await fetch(`/api/geocode?q=${encodeURIComponent(addressToResearch)}`)
      if (!geocodeRes.ok) throw new Error('Geocoding failed')
      const { lat, lng, display_name } = await geocodeRes.json()

      setSweepPhase('researching')

      // Phase 2: Research
      const researchRes = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressToResearch }),
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
  const handleSaveSweep = async () => {
    if (!sweepResult) return
    const updated = [...properties, sweepResult]
    setProperties(updated)
    await saveProperty(sweepResult)
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

  // Handle route optimization
  const handlePlanRoute = async () => {
    const filteredProperties = properties.filter((p) => {
      if (territoryFilter === 'hot') return calculateLeadScore(p) >= 70
      if (territoryFilter === 'researched') return p.sources && Object.keys(p.sources).length > 0
      return true
    })

    if (filteredProperties.length < 2) return
    setRouteLoading(true)
    try {
      const waypoints = filteredProperties.map(p => ({ lat: p.lat, lng: p.lng, address: p.address, id: p.id }))
      const res = await fetch('/api/route-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints, origin: { lat: waypoints[0].lat, lng: waypoints[0].lng } })
      })
      const data = await res.json()
      if (data.orderedWaypoints) setRouteResult(data)
    } catch {
      /* silent */
    } finally {
      setRouteLoading(false)
    }
  }

  // Territory markers
  const territoryMarkers: MapMarker[] = properties.map((p) => {
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
      {/* Background */}
      <div className="absolute inset-0 z-0" style={{ isolation: 'isolate' }}>
        {activeScreen === 'dashboard' ? (
          <div className="absolute inset-0 bg-[#0d1117]" style={{backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.06) 0%, transparent 60%)'}} />
        ) : (
          <>
            <MapView
              lat={mapCenter.lat}
              lng={mapCenter.lng}
              zoom={mapZoom}
              mode={mapMode}
              markers={activeScreen === 'territory' ? territoryMarkers : []}
              onModeChange={setMapMode}
            />

            {/* Map Mode Toggle Button - Page Level Z-index */}
            {(activeScreen === 'territory' || activeScreen === 'stormscope') && (
              <button
                onClick={() => setMapMode(prev => prev === 'dark' ? 'satellite' : 'dark')}
                className="absolute top-24 right-4 z-50 glass-sm px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-cyan transition-colors cursor-pointer rounded"
              >
                {mapMode === 'dark' ? '🛰 Satellite' : '🌙 Night'}
              </button>
            )}
          </>
        )}
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
              { id: 'clients' as Screen, label: 'Clients', icon: Users },
              { id: 'proposals' as Screen, label: 'Proposals', icon: FileText },
              { id: 'materials' as Screen, label: 'Materials', icon: Package },
              { id: 'team' as Screen, label: 'Team', icon: MessageSquare },
            ].map((tab) => {
              const Icon = tab.icon
              const hasUnread = tab.id === 'team' && unreadCount > 0
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveScreen(tab.id)
                    if (tab.id === 'team') setUnreadCount(0)
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                    activeScreen === tab.id
                      ? 'bg-cyan text-dark'
                      : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {hasUnread && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red rounded-full" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-green rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-green uppercase tracking-wide">Live</span>
            </div>
            <div className="flex items-center gap-2 bg-dark-700/50 rounded-full px-3 py-1.5">
              <MapPin className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-300">{HQ_CITY}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* SCREEN 1: DASHBOARD */}
      {activeScreen === 'dashboard' && (
        <>
          {/* Stats Bar */}
          <div className="absolute left-4 right-4 top-24 z-30 glass rounded-lg px-6 py-4 flex gap-6">
            {/* Properties Scanned */}
            <div className="text-center">
              <p className="text-3xl font-bold text-cyan">{properties.length}</p>
              <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">Properties Scanned</p>
            </div>

            {/* Qualifying Roofs */}
            <div className="text-center">
              <p className="text-3xl font-bold text-green">
                {properties.filter((p) => p.roof_age_years !== null && p.roof_age_years >= 15).length}
              </p>
              <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">Qualifying Roofs</p>
            </div>

            {/* Avg Roof Age */}
            <div className="text-center">
              <p className="text-3xl font-bold text-amber">
                {properties.length > 0
                  ? (
                    properties.reduce((sum, p) => sum + (p.roof_age_years || 0), 0) / properties.length
                  ).toFixed(1)
                  : '—'}
              </p>
              <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">Avg Roof Age (yr)</p>
            </div>

            {/* Critical 20+ YR */}
            <div className="text-center">
              <p className="text-3xl font-bold text-red">
                {properties.filter((p) => p.roof_age_years !== null && p.roof_age_years >= 20).length}
              </p>
              <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">Critical (20+ yr)</p>
            </div>
          </div>

          {/* Left Panel */}
          <div className="absolute left-4 top-56 bottom-16 w-80 glass rounded-lg p-6 overflow-y-auto space-y-3 z-30">
            {/* Lead Pipeline Card */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Lead Pipeline</h3>
                <div className="flex items-center gap-1 bg-green/20 px-2 py-1 rounded-full">
                  <div className="w-1.5 h-1.5 bg-green rounded-full" />
                  <span className="text-xs text-green font-semibold">Live</span>
                </div>
              </div>

              <p className="text-4xl font-bold text-cyan">{properties.length}</p>

              <p className="text-xs text-gray-400">
                Active leads across {
                  Array.from(
                    new Set(properties.map((p) => p.address.split(',').pop()?.trim() || 'Unknown'))
                  ).length
                } territories
              </p>

              {/* Mini Sparkline */}
              <svg className="w-full h-12" viewBox="0 0 300 40" preserveAspectRatio="none">
                <polyline
                  points="0,30 50,28 100,25 150,22 200,20 250,18 300,15"
                  fill="none"
                  stroke="rgb(34, 211, 238)"
                  strokeWidth="2"
                />
              </svg>

              <div className="flex justify-between text-xs text-gray-400">
                <span>+0% vs last month</span>
                <span>0 New this week</span>
              </div>
            </div>

            <div className="border-t border-white/5" />

            {/* Source Distribution Card */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Source Distribution</h3>
                <span className="text-xs bg-dark-700/50 px-2 py-1 rounded text-gray-400">Q2 2026</span>
              </div>

              {/* Donut Chart */}
              <div className="flex justify-center mb-2">
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="rgb(55, 65, 81)" strokeWidth="8" />
                </svg>
              </div>

              <div className="text-center">
                <p className="text-2xl font-bold text-white">{properties.length}</p>
                <p className="text-xs text-gray-400">Total</p>
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-400">
                  <span>GPS Sweep</span>
                  <span>0%</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Storm Alerts</span>
                  <span>0%</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Referrals</span>
                  <span>0%</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Door Knocks</span>
                  <span>0%</span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/5" />

            {/* Roof Age Engine Card */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Roof Age Engine</h3>
                <span className="text-xs bg-cyan/20 text-cyan px-2 py-1 rounded font-semibold">AI</span>
              </div>

              {/* Circular Gauge */}
              <div className="flex justify-center mb-2">
                <svg width="120" height="80" viewBox="0 0 120 80">
                  <defs>
                    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgb(34, 211, 238)" />
                      <stop offset="50%" stopColor="rgb(251, 191, 36)" />
                      <stop offset="100%" stopColor="rgb(239, 68, 68)" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 10 70 A 50 50 0 0 1 110 70"
                    fill="none"
                    stroke="url(#gaugeGrad)"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={
                      properties.length > 0
                        ? 10 + ((properties.reduce((sum, p) => sum + (p.roof_age_years || 0), 0) / properties.length / 30) * 100)
                        : 10
                    }
                    cy="70"
                    r="5"
                    fill="rgb(148, 163, 184)"
                  />
                </svg>
              </div>

              <p className="text-2xl font-bold text-center text-white">
                {properties.length > 0
                  ? (
                    properties.reduce((sum, p) => sum + (p.roof_age_years || 0), 0) / properties.length
                  ).toFixed(1)
                  : '—'}
              </p>
              <p className="text-xs text-gray-400 text-center">Avg roof age (territory)</p>
            </div>
          </div>

          {/* Center Panel: PropertyGraph */}
          <div className="absolute left-96 right-96 top-56 h-80 z-30">
            <PropertyGraph properties={properties} center={mapCenter} />
          </div>

          {/* Right Panel */}
          <div className="absolute right-4 top-56 bottom-16 w-72 glass rounded-lg p-6 overflow-y-auto space-y-3 z-30">
            {/* Search Toggle */}
            <div className="flex gap-2 mb-4">
              <button className="flex-1 text-xs font-semibold uppercase px-3 py-2 rounded-lg bg-cyan text-dark">
                By ZIP Code
              </button>
              <button className="flex-1 text-xs font-semibold uppercase px-3 py-2 rounded-lg text-gray-400 hover:text-white">
                By Address
              </button>
            </div>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Search ZIP code or area..."
              className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50 mb-3"
            />

            {/* Territory List */}
            <div className="space-y-2">
              {properties.length === 0 ? (
                <p className="text-sm text-gray-400">No territories yet</p>
              ) : (
                Array.from(
                  properties.reduce((acc, p) => {
                    const zip = p.address.split(',').pop()?.trim() || 'Unknown'
                    const count = (acc.get(zip) || 0) + 1
                    acc.set(zip, count)
                    return acc
                  }, new Map<string, number>())
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([zip, count]) => {
                    const status = count >= 100 ? 'Hot Zone' : count >= 50 ? 'Warm' : 'Developing'
                    const statusColor = count >= 100 ? 'text-red' : count >= 50 ? 'text-amber' : 'text-gray-400'
                    return (
                      <div key={zip} className="bg-dark-700/50 rounded-lg p-3 text-sm">
                        <p className="font-semibold text-white">{zip}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Huntsville area</p>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs text-gray-400">{count} leads</span>
                          <span className={`text-xs font-semibold ${statusColor}`}>{status}</span>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          </div>

          {/* Bottom Activity Timeline */}
          <div className="absolute bottom-4 left-4 right-4 z-30 glass px-6 py-3 rounded-lg flex items-center justify-between h-14">
            <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Activity Timeline</span>

            {/* Month Track */}
            <div className="flex-1 mx-6 relative h-6 flex items-center">
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, idx) => (
                <div
                  key={month}
                  className="flex-1 flex flex-col items-center justify-center"
                  style={{ position: 'relative' }}
                >
                  {idx === 3 && (
                    <div className="w-2 h-2 bg-cyan rounded-full mb-1" />
                  )}
                  <span className="text-xs text-gray-500">{month}</span>
                </div>
              ))}
              {/* Scrubber dot at April */}
              <div
                className="absolute w-3 h-3 bg-cyan rounded-full"
                style={{ left: 'calc(33.33% + 16.66%)' }}
              />
            </div>

            {/* Control Icons */}
            <div className="flex gap-2 ml-4">
              <button className="w-6 h-6 rounded-lg bg-dark-700/50 flex items-center justify-center hover:bg-dark-700 transition-all">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              </button>
              <button className="w-6 h-6 rounded-lg bg-dark-700/50 flex items-center justify-center hover:bg-dark-700 transition-all">
                <div className="w-1.5 h-1.5 bg-gray-400" />
              </button>
              <button className="w-6 h-6 rounded-lg bg-dark-700/50 flex items-center justify-center hover:bg-dark-700 transition-all">
                <div className="w-1.5 h-1.5 bg-gray-400" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
              </button>
              <button className="w-6 h-6 rounded-lg bg-cyan/20 flex items-center justify-center hover:bg-cyan/30 transition-all">
                <Zap className="w-3.5 h-3.5 text-cyan" />
              </button>
            </div>
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

              {/* Satellite Snapshot Button */}
              <button
                onClick={() => setShowSatelliteSnapshot(true)}
                className="w-full mb-4 bg-dark-700 hover:bg-dark-700/80 text-cyan text-sm px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                <span>📡</span>
                Satellite Snapshot
              </button>

              {/* Sort by Distance Button */}
              {properties.length > 0 && (
                <button
                  onClick={handleSortByDistance}
                  className={`w-full mb-4 text-sm px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                    sortByDistance
                      ? 'bg-cyan-500/30 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-400'
                      : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'
                  }`}
                >
                  <span>📍</span>
                  Sort by Distance
                </button>
              )}

              {/* Plan Route Button */}
              {properties.length >= 2 && (
                <button
                  onClick={handlePlanRoute}
                  disabled={routeLoading}
                  className="w-full mb-4 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-400 text-sm px-3 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {routeLoading ? (
                    <>
                      <span className="animate-spin">⚙</span>
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <span>🗺</span>
                      Plan Optimal Route ({properties.length} stops)
                    </>
                  )}
                </button>
              )}

              {/* Route Result */}
              {routeResult && (
                <div className="glass-sm rounded-lg p-3 border border-cyan-500/20 mb-4">
                  <div className="text-sm text-white font-medium mb-1">Optimized Route</div>
                  <div className="text-xs text-white/60 mb-2">{routeResult.totalDistanceMiles} miles • ~{routeResult.totalDurationMinutes} min</div>
                  <ol className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {routeResult.orderedWaypoints.map((w, i) => (
                      <li key={w.id} className="text-xs text-white/70 flex gap-2">
                        <span className="text-cyan-400 font-mono flex-shrink-0">{i + 1}.</span>
                        <span className="truncate">{w.address}</span>
                      </li>
                    ))}
                  </ol>
                  <a href={routeResult.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                    className="mt-2 block text-center text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                    Open in Google Maps →
                  </a>
                </div>
              )}

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
                {filteredProperties
                  .sort((a, b) => {
                    if (!sortByDistance) return 0
                    const aDistance = distanceResults.get(a.id)?.distanceMeters || Infinity
                    const bDistance = distanceResults.get(b.id)?.distanceMeters || Infinity
                    return aDistance - bDistance
                  })
                  .map((prop) => {
                    const score = calculateLeadScore(prop)
                    const distance = distanceResults.get(prop.id)
                    return (
                      <div
                        key={prop.id}
                        onClick={() => setSelectedProperty(prop)}
                        className="bg-dark-700/50 rounded-lg p-3 cursor-pointer hover:bg-dark-700 transition-all"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="text-white truncate">{prop.address}</p>
                            <p className="text-xs text-gray-400">
                              {prop.roof_age_years || '—'}y
                              {distance && (
                                <span className="ml-2 text-cyan">
                                  • {distance.distanceMiles} mi • {distance.durationMinutes} min
                                </span>
                              )}
                            </p>
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

          {/* Satellite Snapshot Modal */}
          {showSatelliteSnapshot && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-dark-800 rounded-xl shadow-2xl max-w-3xl w-full mx-4 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                    <span>📡</span>
                    Satellite View
                  </h3>
                  <button
                    onClick={() => setShowSatelliteSnapshot(false)}
                    className="p-1 hover:bg-dark-700 rounded text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {properties.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-400 mb-2">
                      Satellite view centered at {mapCenter.lat.toFixed(3)}°, {mapCenter.lng.toFixed(3)}°
                    </div>
                    <img
                      src={`https://maps.googleapis.com/maps/api/staticmap?center=${mapCenter.lat},${mapCenter.lng}&zoom=16&size=800x600&maptype=satellite&key=${process.env.NEXT_PUBLIC_MAPS_API_KEY}`}
                      alt="Satellite view"
                      className="w-full rounded-lg border border-white/10"
                    />
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <p>No properties in territory yet</p>
                  </div>
                )}
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

                {sweepLocationAccuracy && (
                  <p className="text-xs text-gray-400 text-center">
                    Location accuracy: ±{Math.round(sweepLocationAccuracy)}m
                  </p>
                )}

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

            {/* Commercial Search */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Search className="w-5 h-5 text-green" />
                <h2 className="text-lg font-heading font-semibold">Commercial Search</h2>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-2">Radius</label>
                  <div className="flex gap-2">
                    {[
                      { label: '0.25mi', value: 402 },
                      { label: '0.5mi', value: 804 },
                      { label: '1mi', value: 1609 },
                      { label: '2mi', value: 3218 }
                    ].map(r => (
                      <button
                        key={r.value}
                        onClick={() => setCommercialRadius(r.value)}
                        className={`flex-1 text-xs px-2 py-1.5 rounded transition-all ${
                          commercialRadius === r.value
                            ? 'bg-green text-dark font-medium'
                            : 'bg-dark-700 text-gray-300 hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSearchCommercial}
                  disabled={commercialLoading}
                  className="w-full bg-green text-dark font-medium py-2 rounded-lg hover:bg-green/90 transition-all disabled:opacity-50"
                >
                  {commercialLoading ? 'Searching...' : 'Find Commercial Leads'}
                </button>

                {commercialResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <p className="text-xs text-gray-400 font-semibold">Results: {commercialResults.length}</p>
                    {commercialResults.map(place => (
                      <div key={place.id} className="bg-dark-700/50 rounded-lg p-3 text-sm space-y-2">
                        <p className="text-white font-medium truncate">{place.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-400 truncate">{place.address || '—'}</p>
                        {place.phone && (
                          <p className="text-xs text-cyan">{place.phone}</p>
                        )}
                        <button
                          onClick={() => handleAddCommercialLead(place)}
                          className="w-full bg-green/20 hover:bg-green/30 text-green border border-green/30 text-xs px-2 py-1.5 rounded transition-all"
                        >
                          Add as Lead
                        </button>
                      </div>
                    ))}
                  </div>
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

      {/* SCREEN 6: CLIENTS */}
      {activeScreen === 'clients' && (
        <div className="absolute inset-4 top-20 z-30 flex gap-4 h-[calc(100vh-120px)]">
          {/* Left Panel: Client List */}
          <div className="w-1/3 glass rounded-lg p-6 flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4">CRM Pipeline</h2>

            {/* Status Filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {['all', 'new_lead', 'contacted', 'proposal_sent', 'scheduled', 'complete', 'lost'].map(status => (
                <button
                  key={status}
                  onClick={() => setClientStatusFilter(status)}
                  className={`px-3 py-1 text-xs rounded-full transition-all ${
                    clientStatusFilter === status
                      ? 'bg-cyan text-dark'
                      : 'bg-dark-700 text-gray-300 hover:text-white'
                  }`}
                >
                  {status === 'all' ? 'All' : status.replace(/_/g, ' ').toUpperCase()}
                </button>
              ))}
            </div>

            {/* Client List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {clients
                .filter(c => clientStatusFilter === 'all' || c.status === clientStatusFilter)
                .map(client => {
                  const prop = properties.find(p => p.id === client.property_id)
                  const statusColors: Record<string, string> = {
                    new_lead: 'bg-cyan/20 text-cyan',
                    contacted: 'bg-amber/20 text-amber',
                    proposal_sent: 'bg-gold/20 text-gold',
                    scheduled: 'bg-green/20 text-green',
                    complete: 'bg-green/20 text-green/60',
                    lost: 'bg-red/20 text-red',
                  }
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedClient?.id === client.id
                          ? 'glass-sm ring-1 ring-cyan'
                          : 'bg-dark-700/50 hover:bg-dark-700'
                      }`}
                    >
                      <p className="text-sm font-semibold text-white">{prop?.address || '—'}</p>
                      <p className="text-xs text-gray-400 mt-1">{prop?.owner_name || 'Unknown Owner'}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[client.status]}`}>
                          {client.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-gray-400">{prop ? Math.max(10, Math.min(99, 50 + (prop.roof_age_years || 0))) : '—'}</span>
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Right Panel: Client Details */}
          <div className="w-2/3 glass rounded-lg p-6 flex flex-col">
            {selectedClient ? (
              <>
                {(() => {
                  const prop = properties.find(p => p.id === selectedClient.property_id)
                  return (
                    <>
                      <div className="mb-6 pb-6 border-b border-white/10">
                        <h2 className="text-xl font-semibold text-white">{prop?.address || '—'}</h2>
                        <p className="text-sm text-gray-400 mt-1">Owner: {prop?.owner_name || '—'}</p>
                      </div>

                      {prop && (
                        <StreetView
                          lat={prop.lat}
                          lng={prop.lng}
                          address={prop.address}
                          className="w-full h-48 mb-4 rounded-lg"
                        />
                      )}

                      {prop && (
                        <AerialView
                          address={prop.address}
                          className="w-full h-40 mb-4 rounded-lg"
                        />
                      )}

                      <div className="grid grid-cols-2 gap-6 mb-6">
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                            <select
                              value={selectedClient.status}
                              onChange={async (e) => {
                                const updated = { ...selectedClient, status: e.target.value as any }
                                setSelectedClient(updated)
                                const idx = clients.findIndex(c => c.id === selectedClient.id)
                                const newClients = [...clients]
                                newClients[idx] = updated
                                setClients(newClients)
                                await saveClient(updated)
                              }}
                              className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                            >
                              <option value="new_lead">New Lead</option>
                              <option value="contacted">Contacted</option>
                              <option value="proposal_sent">Proposal Sent</option>
                              <option value="scheduled">Scheduled</option>
                              <option value="complete">Complete</option>
                              <option value="lost">Lost</option>
                            </select>
                          </div>

                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Last Contact</p>
                            <p className="mt-1 text-sm text-white">{selectedClient.last_contact || '—'}</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Phone</p>
                            <p className="mt-1 text-sm text-white">{prop?.owner_phone || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
                            <p className="mt-1 text-sm text-white">{prop?.owner_email || '—'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 mb-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Notes</p>
                        <textarea
                          value={selectedClient.notes}
                          onChange={async (e) => {
                            const updated = { ...selectedClient, notes: e.target.value }
                            setSelectedClient(updated)
                            const idx = clients.findIndex(c => c.id === selectedClient.id)
                            const newClients = [...clients]
                            newClients[idx] = updated
                            setClients(newClients)
                            await saveClient(updated)
                          }}
                          className="w-full h-24 bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                          placeholder="Add notes..."
                        />
                      </div>

                      <button
                        onClick={() => setActiveScreen('proposals')}
                        className="w-full bg-cyan text-dark py-2 rounded-lg font-medium hover:bg-cyan/90"
                      >
                        Generate Proposal
                      </button>
                    </>
                  )
                })()}
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">Select a client to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCREEN 7: PROPOSALS */}
      {activeScreen === 'proposals' && (
        <div className="absolute inset-4 top-20 z-30 flex gap-4 h-[calc(100vh-120px)]">
          {/* Left Panel: Proposal List */}
          <div className="w-1/3 glass rounded-lg p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Proposals</h2>
              <button
                onClick={async () => {
                  const newProposal: Proposal = {
                    id: Math.random().toString(36).substr(2, 9),
                    client_id: '',
                    property_id: '',
                    status: 'draft',
                    line_items: [],
                    total: 0,
                    notes: '',
                    created_at: new Date().toISOString(),
                    sent_at: null,
                  }
                  const newProposals = [...proposals, newProposal]
                  setProposals(newProposals)
                  await saveProposal(newProposal)
                  setSelectedProposal(newProposal)
                  setEditingProposal(true)
                }}
                className="p-1.5 rounded hover:bg-dark-700 text-cyan"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {proposals.map(proposal => {
                const prop = properties.find(p => p.id === proposal.property_id)
                return (
                  <button
                    key={proposal.id}
                    onClick={() => {
                      setSelectedProposal(proposal)
                      setEditingProposal(false)
                    }}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedProposal?.id === proposal.id
                        ? 'glass-sm ring-1 ring-cyan'
                        : 'bg-dark-700/50 hover:bg-dark-700'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{prop?.address || 'Unknown'}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-400">${proposal.total.toLocaleString()}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-amber/20 text-amber">{proposal.status}</span>
                    </div>
                  </button>
                )
              })}
              {proposals.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No proposals yet</p>
              )}
            </div>
          </div>

          {/* Right Panel: Proposal Editor */}
          <div className="w-2/3 glass rounded-lg p-6 flex flex-col">
            {selectedProposal ? (
              <>
                <div className="mb-4 pb-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-white">
                    {properties.find(p => p.id === selectedProposal.property_id)?.address || 'Select property'}
                  </h2>
                </div>

                <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Status</label>
                    <select
                      value={selectedProposal.status}
                      onChange={(e) => {
                        const updated = { ...selectedProposal, status: e.target.value as any }
                        setSelectedProposal(updated)
                        const idx = proposals.findIndex(p => p.id === selectedProposal.id)
                        const newProposals = [...proposals]
                        newProposals[idx] = updated
                        setProposals(newProposals)
                      }}
                      className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="accepted">Accepted</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">Line Items</label>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-2 text-gray-400">Description</th>
                          <th className="text-right py-2 text-gray-400 w-16">Qty</th>
                          <th className="text-right py-2 text-gray-400 w-20">Price</th>
                          <th className="text-right py-2 text-gray-400 w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody className="space-y-1">
                        {['Tear-off & Disposal', 'Architectural Shingles (30yr)', 'Synthetic Underlayment', 'Ridge Cap', 'Drip Edge', 'Ice & Water Shield', 'Labor'].map((desc, idx) => {
                          const lineItem = selectedProposal.line_items[idx] || { id: idx.toString(), description: desc, quantity: 0, unit: 'ea', unit_price: 0, total: 0 }
                          return (
                            <tr key={idx}>
                              <td className="py-2 text-gray-300">{desc}</td>
                              <td className="text-right"><input type="number" min="0" className="w-14 bg-dark-700 border border-white/10 rounded px-2 py-1" placeholder="0" /></td>
                              <td className="text-right"><input type="number" min="0" className="w-20 bg-dark-700 border border-white/10 rounded px-2 py-1" placeholder="0" /></td>
                              <td className="text-right text-cyan">$0</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide mb-2 block">Notes</label>
                    <textarea
                      value={selectedProposal.notes}
                      onChange={(e) => {
                        const updated = { ...selectedProposal, notes: e.target.value }
                        setSelectedProposal(updated)
                        const idx = proposals.findIndex(p => p.id === selectedProposal.id)
                        const newProposals = [...proposals]
                        newProposals[idx] = updated
                        setProposals(newProposals)
                      }}
                      className="w-full h-16 bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      placeholder="Add notes..."
                    />
                  </div>

                  <div className="bg-dark-700/50 rounded p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Subtotal:</span>
                      <span className="text-white">${selectedProposal.total.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Tax (0%):</span>
                      <span className="text-white">$0</span>
                    </div>
                    <div className="flex justify-between text-lg font-semibold border-t border-white/10 pt-2">
                      <span className="text-gray-400">Total:</span>
                      <span className="text-cyan">${selectedProposal.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const idx = proposals.findIndex(p => p.id === selectedProposal.id)
                      const newProposals = [...proposals]
                      newProposals[idx] = selectedProposal
                      setProposals(newProposals)
                      await saveProposal(selectedProposal)
                    }}
                    className="flex-1 bg-cyan text-dark py-2 rounded-lg font-medium hover:bg-cyan/90"
                  >
                    Save Draft
                  </button>
                  <button
                    onClick={async () => {
                      const idx = proposals.findIndex(p => p.id === selectedProposal.id)
                      const newProposals = [...proposals]
                      const updated = { ...selectedProposal, status: 'sent' as const, sent_at: new Date().toISOString() }
                      newProposals[idx] = updated
                      setProposals(newProposals)
                      await saveProposal(updated)
                      setSelectedProposal(updated)
                    }}
                    className="flex-1 bg-green/20 text-green py-2 rounded-lg font-medium hover:bg-green/30"
                  >
                    Mark Sent
                  </button>
                  <button disabled className="flex-1 bg-gray-700 text-gray-400 py-2 rounded-lg font-medium opacity-50">
                    Export PDF
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">Select or create a proposal</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCREEN 8: MATERIALS */}
      {activeScreen === 'materials' && (
        <div className="absolute inset-4 top-20 z-30 flex flex-col h-[calc(100vh-120px)] gap-4">
          {/* Roof Calculator */}
          <div className="glass rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Roof Area Calculator</h3>
            <div className="grid grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Width (ft)</label>
                <input
                  type="number"
                  value={roofWidth}
                  onChange={(e) => setRoofWidth(e.target.value)}
                  className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Length (ft)</label>
                <input
                  type="number"
                  value={roofLength}
                  onChange={(e) => setRoofLength(e.target.value)}
                  className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Sq Ft</p>
                <p className="mt-1 text-2xl font-bold text-cyan">
                  {roofWidth && roofLength ? (parseFloat(roofWidth) * parseFloat(roofLength)).toLocaleString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Squares</p>
                <p className="mt-1 text-2xl font-bold text-green">
                  {roofWidth && roofLength ? ((parseFloat(roofWidth) * parseFloat(roofLength)) / 100).toFixed(1) : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Materials Catalog */}
          <div className="flex-1 glass rounded-lg p-6 overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Materials Catalog</h3>
              <button
                onClick={() => setAddingMaterial(!addingMaterial)}
                className="p-1.5 rounded hover:bg-dark-700 text-cyan"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {materials.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">No materials added yet. Add your first material to build your catalog.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 text-gray-400">Name</th>
                    <th className="text-left py-2 text-gray-400">Category</th>
                    <th className="text-left py-2 text-gray-400">Unit</th>
                    <th className="text-right py-2 text-gray-400">Cost</th>
                    <th className="text-left py-2 text-gray-400">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {materials.map(mat => (
                    <tr key={mat.id} className="hover:bg-dark-700/50">
                      <td className="py-3 text-white">{mat.name}</td>
                      <td className="py-3 text-gray-400 text-xs">{mat.category}</td>
                      <td className="py-3 text-gray-400">{mat.unit}</td>
                      <td className="py-3 text-right text-cyan font-semibold">${mat.unit_cost}</td>
                      <td className="py-3 text-gray-400 text-sm">{mat.supplier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* SCREEN 9: TEAM CHAT */}
      {activeScreen === 'team' && (
        <div className="absolute inset-4 top-20 z-30 flex gap-4 h-[calc(100vh-120px)]">
          {/* Left Panel: Channels & User Role */}
          <div className="w-48 glass rounded-lg p-6 flex flex-col">
            <div className="mb-6">
              <label className="text-xs text-gray-400 uppercase tracking-wide">I am:</label>
              <select
                value={currentUserRole}
                onChange={(e) => setCurrentUserRole(e.target.value as any)}
                className="mt-2 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
              >
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
              </select>
            </div>

            <div className="space-y-2 flex-1">
              {['general', 'management'].map(channel => (
                <button
                  key={channel}
                  className="w-full text-left px-3 py-2 rounded-lg bg-dark-700/50 hover:bg-dark-700 text-white text-sm font-medium transition-all"
                >
                  # {channel}
                </button>
              ))}
            </div>
          </div>

          {/* Right Panel: Chat */}
          <div className="flex-1 glass rounded-lg p-6 flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4">Team Chat</h2>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
              {teamMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                teamMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_role === 'manager' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-lg ${
                        msg.sender_role === 'manager'
                          ? 'bg-gold/20 text-gold'
                          : 'bg-cyan/20 text-cyan'
                      }`}
                    >
                      <p className="text-xs font-semibold mb-1">{msg.sender_name}</p>
                      <p className="text-sm">{msg.message}</p>
                      <p className="text-xs mt-1 opacity-60">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type a message..."
                value={teamChatInput}
                onChange={(e) => setTeamChatInput(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && teamChatInput.trim()) {
                    const newMsg: ChatMessage = {
                      id: Math.random().toString(36).substr(2, 9),
                      sender_name: currentUserRole === 'manager' ? 'Manager' : 'Rep',
                      sender_role: currentUserRole,
                      message: teamChatInput,
                      timestamp: new Date().toISOString(),
                      read: true,
                      channel: 'general'
                    }
                    const newMessages = [...teamMessages, newMsg]
                    setTeamMessages(newMessages)
                    await saveChatMessage(newMsg)
                    setTeamChatInput('')
                  }
                }}
                className="flex-1 bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
              />
              <button
                onClick={async () => {
                  if (teamChatInput.trim()) {
                    const newMsg: ChatMessage = {
                      id: Math.random().toString(36).substr(2, 9),
                      sender_name: currentUserRole === 'manager' ? 'Manager' : 'Rep',
                      sender_role: currentUserRole,
                      message: teamChatInput,
                      timestamp: new Date().toISOString(),
                      read: true,
                      channel: 'general'
                    }
                    const newMessages = [...teamMessages, newMsg]
                    setTeamMessages(newMessages)
                    await saveChatMessage(newMsg)
                    setTeamChatInput('')
                  }
                }}
                className="bg-cyan text-dark px-4 py-2 rounded-lg font-medium hover:bg-cyan/90"
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
