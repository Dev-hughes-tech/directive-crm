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
} from 'lucide-react'
import type { WeatherCurrent, WeatherAlert, ForecastPeriod, Screen, Property } from '@/lib/types'
import type { Marker } from '@/components/map/MapView'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

// Huntsville AL coordinates (Directive CRM HQ)
const HQ_LAT = 34.7304
const HQ_LNG = -86.5861
const HQ_CITY = 'Huntsville, AL'

// DEMO DATA: Seed properties for initial state
const DEMO_PROPERTIES: Property[] = [
  {
    id: 'demo_1',
    address: '1247 Governors Drive, Huntsville, AL 35801',
    lat: 34.7312,
    lng: -86.5891,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1998,
    roof_age_years: 19,
    market_value: 285000,
    assessed_value: 245000,
    last_sale_date: '2018-06-15',
    last_sale_price: 275000,
    county: 'Madison County',
    parcel_id: '01-44-3-2-4-001',
    permit_count: 2,
    flags: ['Roof aging', 'Hot market'],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-01T08:15:00Z',
  },
  {
    id: 'demo_2',
    address: '842 Holmes Avenue, Huntsville, AL 35802',
    lat: 34.7245,
    lng: -86.5745,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1987,
    roof_age_years: 20,
    market_value: 195000,
    assessed_value: 168000,
    last_sale_date: '2015-09-22',
    last_sale_price: 182000,
    county: 'Madison County',
    parcel_id: '01-43-2-1-3-045',
    permit_count: 5,
    flags: ['Critical roof age', 'Multiple permits'],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-02T10:30:00Z',
  },
  {
    id: 'demo_3',
    address: '315 Sparkman Drive, Huntsville, AL 35805',
    lat: 34.7195,
    lng: -86.6012,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 2001,
    roof_age_years: 16,
    market_value: 325000,
    assessed_value: 285000,
    last_sale_date: '2019-03-10',
    last_sale_price: 310000,
    county: 'Madison County',
    parcel_id: '01-45-1-4-2-089',
    permit_count: 1,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-02T14:45:00Z',
  },
  {
    id: 'demo_4',
    address: '1563 Research Park Boulevard, Huntsville, AL 35806',
    lat: 34.7418,
    lng: -86.5521,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1995,
    roof_age_years: 18,
    market_value: 410000,
    assessed_value: 368000,
    last_sale_date: '2017-11-05',
    last_sale_price: 395000,
    county: 'Madison County',
    parcel_id: '01-46-2-3-1-112',
    permit_count: 3,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-03T09:20:00Z',
  },
  {
    id: 'demo_5',
    address: '2781 Mountain Gap Road, Huntsville, AL 35810',
    lat: 34.7501,
    lng: -86.6145,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 2002,
    roof_age_years: 15,
    market_value: 265000,
    assessed_value: 228000,
    last_sale_date: '2020-01-14',
    last_sale_price: 250000,
    county: 'Madison County',
    parcel_id: '01-47-3-2-4-067',
    permit_count: 0,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-03T11:00:00Z',
  },
  {
    id: 'demo_6',
    address: '947 Meridian Street, Huntsville, AL 35811',
    lat: 34.7089,
    lng: -86.5632,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1992,
    roof_age_years: 21,
    market_value: 175000,
    assessed_value: 152000,
    last_sale_date: '2014-07-20',
    last_sale_price: 165000,
    county: 'Madison County',
    parcel_id: '01-48-1-1-2-034',
    permit_count: 4,
    flags: ['Critical roof age'],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-04T13:25:00Z',
  },
  {
    id: 'demo_7',
    address: '724 Mastin Lake Road, Huntsville, AL 35801',
    lat: 34.7268,
    lng: -86.5834,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1999,
    roof_age_years: 17,
    market_value: 298000,
    assessed_value: 258000,
    last_sale_date: '2018-05-08',
    last_sale_price: 280000,
    county: 'Madison County',
    parcel_id: '01-44-3-3-1-078',
    permit_count: 2,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-04T15:40:00Z',
  },
  {
    id: 'demo_8',
    address: '541 Pratt Avenue, Huntsville, AL 35802',
    lat: 34.7335,
    lng: -86.5698,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1986,
    roof_age_years: 22,
    market_value: 205000,
    assessed_value: 175000,
    last_sale_date: '2013-02-12',
    last_sale_price: 190000,
    county: 'Madison County',
    parcel_id: '01-43-2-2-3-056',
    permit_count: 6,
    flags: ['Critical roof age', 'Multiple permits'],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-05T08:50:00Z',
  },
  {
    id: 'demo_9',
    address: '1126 West Holmes Avenue, Huntsville, AL 35805',
    lat: 34.7152,
    lng: -86.6089,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 2000,
    roof_age_years: 14,
    market_value: 285000,
    assessed_value: 248000,
    last_sale_date: '2020-08-19',
    last_sale_price: 270000,
    county: 'Madison County',
    parcel_id: '01-45-1-5-2-091',
    permit_count: 1,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-05T12:15:00Z',
  },
  {
    id: 'demo_10',
    address: '2345 Whitesburg Drive, Huntsville, AL 35806',
    lat: 34.7368,
    lng: -86.5389,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1996,
    roof_age_years: 19,
    market_value: 380000,
    assessed_value: 335000,
    last_sale_date: '2019-06-11',
    last_sale_price: 365000,
    county: 'Madison County',
    parcel_id: '01-46-2-4-3-124',
    permit_count: 2,
    flags: ['Roof aging'],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-06T09:35:00Z',
  },
  {
    id: 'demo_11',
    address: '612 Adams Avenue, Huntsville, AL 35810',
    lat: 34.7456,
    lng: -86.6051,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 2003,
    roof_age_years: 13,
    market_value: 245000,
    assessed_value: 210000,
    last_sale_date: '2021-03-22',
    last_sale_price: 232000,
    county: 'Madison County',
    parcel_id: '01-47-3-1-2-073',
    permit_count: 0,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-06T14:20:00Z',
  },
  {
    id: 'demo_12',
    address: '809 Hutchens Avenue, Huntsville, AL 35811',
    lat: 34.7125,
    lng: -86.5721,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1990,
    roof_age_years: 23,
    market_value: 155000,
    assessed_value: 135000,
    last_sale_date: '2012-10-05',
    last_sale_price: 145000,
    county: 'Madison County',
    parcel_id: '01-48-1-2-1-041',
    permit_count: 7,
    flags: ['Critical roof age', 'Multiple permits'],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-07T10:45:00Z',
  },
  {
    id: 'demo_13',
    address: '1834 Poplar Street, Huntsville, AL 35801',
    lat: 34.7295,
    lng: -86.5956,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1997,
    roof_age_years: 18,
    market_value: 310000,
    assessed_value: 270000,
    last_sale_date: '2017-09-30',
    last_sale_price: 295000,
    county: 'Madison County',
    parcel_id: '01-44-3-1-3-085',
    permit_count: 3,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-07T16:00:00Z',
  },
  {
    id: 'demo_14',
    address: '456 University Drive, Huntsville, AL 35802',
    lat: 34.7215,
    lng: -86.5823,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 1988,
    roof_age_years: 20,
    market_value: 225000,
    assessed_value: 195000,
    last_sale_date: '2016-04-18',
    last_sale_price: 210000,
    county: 'Madison County',
    parcel_id: '01-43-2-3-2-048',
    permit_count: 4,
    flags: ['Critical roof age'],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-08T07:30:00Z',
  },
  {
    id: 'demo_15',
    address: '2918 Collin Avenue, Huntsville, AL 35805',
    lat: 34.7172,
    lng: -86.5945,
    owner_name: null,
    owner_phone: null,
    owner_email: null,
    year_built: 2004,
    roof_age_years: 12,
    market_value: 295000,
    assessed_value: 255000,
    last_sale_date: '2021-11-02',
    last_sale_price: 280000,
    county: 'Madison County',
    parcel_id: '01-45-1-3-1-099',
    permit_count: 0,
    flags: [],
    sources: { 'County Assessor': true },
    score: null,
    created_at: '2026-04-08T11:15:00Z',
  },
]

// ZIP territory data
const DEMO_TERRITORIES = [
  { zip: '35801', name: 'Downtown Huntsville', leads: 487, status: 'Hot Zone' as const },
  { zip: '35802', name: 'South Huntsville', leads: 412, status: 'Hot Zone' as const },
  { zip: '35805', name: 'West Huntsville', leads: 356, status: 'Warm' as const },
  { zip: '35806', name: 'Research Park', leads: 298, status: 'Warm' as const },
  { zip: '35810', name: 'North Huntsville', leads: 264, status: 'Developing' as const },
  { zip: '35811', name: 'Meridianville', leads: 231, status: 'Developing' as const },
]

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

// Get properties from localStorage, fallback to demo data on first load
function getProperties(): Property[] {
  if (typeof window === 'undefined') return DEMO_PROPERTIES
  try {
    const data = localStorage.getItem('directive_properties')
    return data ? JSON.parse(data) : DEMO_PROPERTIES
  } catch {
    return DEMO_PROPERTIES
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
