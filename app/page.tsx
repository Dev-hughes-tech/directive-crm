'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  Briefcase,
  Camera,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  Calculator,
  Settings,
  Bell,
  Globe,
  ExternalLink,
  Voicemail,
  Inbox,
  CheckCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/authFetch'
import { signOut } from '@/lib/authHooks'
import type { WeatherCurrent, WeatherAlert, ForecastPeriod, Screen, Property, Client, Proposal, ProposalLineItem, Material, ChatMessage, Job, JobStage, JobPhoto, InsuranceClaim, PhotoCategory } from '@/lib/types'
import { JOB_STAGES } from '@/lib/types'
import type { MapMarker } from '@/components/map/MapView'
import { getClients, saveClient, getProposals, saveProposal, getMaterials, saveMaterial, getChatMessages, saveChatMessage, getProperties, saveProperty, deleteProperty, markMessagesRead, getJobs, saveJob, deleteJob, getUserProfile } from '@/lib/storage'
import type { UserProfile } from '@/lib/storage'
import { canAccess, getTierConfig, TIER_DESCRIPTIONS } from '@/lib/tiers'
import type { UserRole } from '@/lib/tiers'
import PropertyGraph from '@/components/dashboard/PropertyGraph'
import { useIsMobile } from '@/hooks/useIsMobile'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })
const WeatherWidget = dynamic(() => import('@/components/WeatherWidget'), { ssr: false })
const PropertyMapEmbed = dynamic(() => import('@/components/PropertyMapEmbed'), { ssr: false })
const DamagePhotoUpload = dynamic(() => import('@/components/DamagePhotoUpload'), { ssr: false })
const MobileLayout = dynamic(() => import('@/components/mobile/MobileLayout'), { ssr: false })
import StreetView from '@/components/StreetView'
import AerialView from '@/components/AerialView'

// Huntsville AL coordinates (Directive CRM HQ)
const HQ_LAT = 34.7304
const HQ_LNG = -86.5861
const HQ_CITY = 'Huntsville, AL'


// Lead scoring function
function calculateLeadScore(property: Property): number {
  let score = 30

  // Roof age scoring
  if (property.roof_age_years !== null) {
    if (property.roof_age_years >= 20) score += 25
    else if (property.roof_age_years >= 15) score += 15
    else if (property.roof_age_years >= 10) score += 5
  }

  // Estimated roof age bonus for old houses
  if (property.roof_age_estimated && property.year_built && property.year_built < 2005) {
    score += 10
  }

  // Contact info scoring
  if (property.owner_phone !== null) score += 10
  if (property.owner_email !== null) score += 5

  // Property value scoring
  if (property.market_value !== null) {
    if (property.market_value > 300000) score += 10
    else if (property.market_value > 150000) score += 5
  }

  // Occupancy type scoring
  if (property.occupancy_type === 'Owner Occupied') score += 10

  // Listing penalty (sellers won't invest in roof)
  if (property.listing_status && (property.listing_status.toLowerCase().includes('for sale') || property.listing_status.toLowerCase().includes('listed'))) {
    score -= 15
  }

  // Recent roof permit penalty
  if (property.permit_count !== null && property.permit_count > 0 && property.roof_age_years !== null && property.roof_age_years < 5) {
    score -= 20
  }

  // Recently sold bonus
  if (property.last_sale_date) {
    const lastSaleYear = parseInt(property.last_sale_date.split('-')[0])
    if (2026 - lastSaleYear <= 2) score += 5
  }

  // High value flag bonus
  if (property.flags && property.flags.includes('high-value')) score += 5

  // Storm history bonus — properties in storm-hit areas are prime roof leads
  if (property.storm_history) {
    if (property.storm_history.stormRiskLevel === 'high') score += 20
    else if (property.storm_history.stormRiskLevel === 'moderate') score += 10
    if (property.storm_history.severeHailCount >= 3) score += 10
    if (property.storm_history.totalTornadoEvents > 0) score += 5
  }

  return Math.max(10, Math.min(99, score))
}

// Get color badge for score
function getScoreBadgeColor(score: number | null): string {
  if (score === null) return 'bg-gray-700 text-gray-300'
  if (score >= 70) return 'bg-green/20 text-green border border-green/30'
  if (score >= 50) return 'bg-amber/20 text-amber border border-amber/30'
  return 'bg-red/20 text-red border border-red/30'
}

// Helper to log client activity
function logClientActivity(clientId: string, action: string, activities: Record<string, Array<{action: string, timestamp: string}>>) {
  const timestamp = new Date().toISOString()
  const newActivities = { ...activities }
  if (!newActivities[clientId]) newActivities[clientId] = []
  newActivities[clientId] = [...newActivities[clientId], { action, timestamp }]
  localStorage.setItem('directive_client_activities', JSON.stringify(newActivities))
  return newActivities
}

// Property card component
interface PropertyCardProps {
  property: Property
}

function PropertyCard({ property }: PropertyCardProps) {
  const score = calculateLeadScore(property)

  const getFlagColor = (flag: string): string => {
    if (flag === 'old-roof' || flag === 'estimated-roof-age') return 'bg-amber/10 text-amber border border-amber/30'
    if (flag === 'high-value') return 'bg-green/10 text-green border border-green/30'
    if (flag === 'investor-owned' || flag === 'rental') return 'bg-purple/10 text-purple border border-purple/30'
    if (flag === 'listed-for-sale') return 'bg-red/10 text-red border border-red/30'
    if (flag === 'owner-occupied') return 'bg-cyan/10 text-cyan border border-cyan/30'
    if (flag === 'recently-sold') return 'bg-blue/10 text-blue border border-blue/30'
    return 'bg-gray/10 text-gray border border-gray/30'
  }

  return (
    <div className="glass p-6 rounded-lg space-y-4">
      {/* Header: Address + County + Source + Score */}
      <div className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{property.address}</h3>
            <p className="text-xs text-gray-400 mt-1">
              {property.county || '—'} • {property.sources && Object.keys(property.sources).length > 0 ? Object.keys(property.sources).join(', ') : '—'}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-cyan">{score}</span>
              <span className="text-xs text-gray-400">/100</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">LEAD SCORE</p>
          </div>
        </div>
      </div>

      {/* Navigation Button */}
      <div className="flex gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(property.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/30 text-xs px-3 py-2 rounded-lg transition-all"
        >
          <Navigation className="w-3.5 h-3.5" />
          Navigate to Property
        </a>
        <a
          href={`tel:${property.owner_phone}`}
          className={`flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-lg transition-all ${
            property.owner_phone
              ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30'
              : 'bg-gray-800 text-gray-600 border border-gray-700 pointer-events-none'
          }`}
        >
          <Phone className="w-3.5 h-3.5" />
          Call
        </a>
      </div>

      {/* Street View + Aerial View Side by Side */}
      <div className="border-t border-white/5 pt-4">
        <div className="grid grid-cols-2 gap-2">
          <StreetView lat={property.lat} lng={property.lng} address={property.address} className="h-40 w-full rounded" />
          <AerialView address={property.address} className="h-40 w-full rounded" />
        </div>
      </div>

      {/* OWNER Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Owner</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Name:</span>
            <span className="text-white">{property.owner_name || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Phone:</span>
            {property.owner_phone ? (
              <a href={`tel:${property.owner_phone}`} className="text-cyan hover:text-cyan/80 flex items-center gap-1">
                <Phone className="w-4 h-4" />
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
                <Mail className="w-4 h-4" />
                <span className="truncate">{property.owner_email}</span>
              </a>
            ) : (
              <span className="text-gray-500">—</span>
            )}
          </div>
          {property.owner_age && (
            <div className="flex justify-between">
              <span className="text-gray-400">Age:</span>
              <span className="text-white">{property.owner_age}</span>
            </div>
          )}
          {property.occupancy_type && (
            <div className="flex justify-between">
              <span className="text-gray-400">Occupancy:</span>
              <span className="text-white">{property.occupancy_type}</span>
            </div>
          )}
        </div>
      </div>

      {/* PROPERTY Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Property</h4>
        <div className="space-y-1 text-sm">
          {property.year_built && (
            <div className="flex justify-between">
              <span className="text-gray-400">Year Built:</span>
              <span className="text-white">{property.year_built}</span>
            </div>
          )}
          {property.sqft && (
            <div className="flex justify-between">
              <span className="text-gray-400">Sqft:</span>
              <span className="text-white">{property.sqft.toLocaleString()}</span>
            </div>
          )}
          {property.lot_sqft && (
            <div className="flex justify-between">
              <span className="text-gray-400">Lot Size:</span>
              <span className="text-white">{property.lot_sqft.toLocaleString()} sqft</span>
            </div>
          )}
          {(property.bedrooms !== null || property.bathrooms !== null) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Beds/Baths:</span>
              <span className="text-white">
                {property.bedrooms || '—'} bd / {property.bathrooms || '—'} ba
              </span>
            </div>
          )}
          {property.property_class && (
            <div className="flex justify-between">
              <span className="text-gray-400">Property Class:</span>
              <span className="text-white">{property.property_class}</span>
            </div>
          )}
          {property.land_use && (
            <div className="flex justify-between">
              <span className="text-gray-400">Land Use:</span>
              <span className="text-white">{property.land_use}</span>
            </div>
          )}
          {property.subdivision && (
            <div className="flex justify-between">
              <span className="text-gray-400">Subdivision:</span>
              <span className="text-white">{property.subdivision}</span>
            </div>
          )}
          {property.neighborhood && (
            <div className="flex justify-between">
              <span className="text-gray-400">Neighborhood:</span>
              <span className="text-white">{property.neighborhood}</span>
            </div>
          )}
        </div>
      </div>

      {/* VALUATION Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Valuation</h4>
        <div className="space-y-1 text-sm">
          {property.market_value && (
            <div className="flex justify-between">
              <span className="text-gray-400">Market Value:</span>
              <span className="text-white">${property.market_value.toLocaleString()}</span>
            </div>
          )}
          {property.assessed_value && (
            <div className="flex justify-between">
              <span className="text-gray-400">Assessed Value:</span>
              <span className="text-white">${property.assessed_value.toLocaleString()}</span>
            </div>
          )}
          {property.appraised_value && (
            <div className="flex justify-between">
              <span className="text-gray-400">Appraised Value:</span>
              <span className="text-white">${property.appraised_value.toLocaleString()}</span>
            </div>
          )}
          {(property.last_sale_date || property.last_sale_price) && (
            <div className="flex justify-between">
              <span className="text-gray-400">Last Sale:</span>
              <span className="text-white">
                {property.last_sale_date ? property.last_sale_date : '—'}
                {property.last_sale_price ? ` @ $${property.last_sale_price.toLocaleString()}` : ''}
              </span>
            </div>
          )}
          {property.listing_status && (
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="text-white">{property.listing_status}</span>
            </div>
          )}
          {property.listing_price && (
            <div className="flex justify-between">
              <span className="text-gray-400">Listing Price:</span>
              <span className="text-white">${property.listing_price.toLocaleString()}</span>
            </div>
          )}
          {property.hoa_monthly && (
            <div className="flex justify-between">
              <span className="text-gray-400">HOA Monthly:</span>
              <span className="text-white">${property.hoa_monthly.toLocaleString()}</span>
            </div>
          )}
          {property.tax_annual && (
            <div className="flex justify-between">
              <span className="text-gray-400">Annual Tax:</span>
              <span className="text-white">${property.tax_annual.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* ROOF Section */}
      <div className="border-t border-white/5 pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Roof</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Roof Age:</span>
            <span className="text-white">
              {property.roof_age_years !== null
                ? `${property.roof_age_years} years${property.roof_age_estimated ? ' (est)' : ''}`
                : '—'
              }
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Permits:</span>
            <span className="text-white">{property.permit_count || 0} on record</span>
          </div>
          {property.permit_count && property.permit_count > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-400">Last Permit:</span>
              <span className="text-white">{property.permit_last_date || '—'}</span>
            </div>
          )}
        </div>
      </div>

      {/* ROOF MEASUREMENTS — Powered by Google Solar */}
      {property.roof_area_sqft && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-bold text-cyan uppercase tracking-wider">Roof Measurements</h4>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="text-lg font-bold text-white">{property.roof_area_sqft?.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400">Total Sq Ft</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{property.roof_pitch}</p>
              <p className="text-[10px] text-gray-400">Pitch</p>
            </div>
            <div>
              <p className="text-lg font-bold text-white">{property.roofing_squares}</p>
              <p className="text-[10px] text-gray-400">Squares</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-center text-sm">
            <div>
              <p className="text-sm font-bold text-white">{property.roof_segments}</p>
              <p className="text-[10px] text-gray-400">Roof Segments</p>
            </div>
            <div>
              <p className="text-sm font-bold text-white">×{property.pitch_multiplier}</p>
              <p className="text-[10px] text-gray-400">Pitch Multiplier</p>
            </div>
          </div>
          {property.satellite_image_url && (
            <div className="mt-3">
              <img src={property.satellite_image_url} alt="Satellite view" className="w-full rounded-lg border border-white/10" />
              <p className="text-[9px] text-gray-500 mt-1 text-center">
                Satellite imagery {property.roof_imagery_date ? `from ${property.roof_imagery_date}` : ''} • {property.roof_imagery_quality || 'Standard'} quality
              </p>
            </div>
          )}
        </div>
      )}

      {/* STORM HISTORY */}
      {property.storm_history && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Storm History (5yr)</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              property.storm_history.stormRiskLevel === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              property.storm_history.stormRiskLevel === 'moderate' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              property.storm_history.stormRiskLevel === 'low' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
              'bg-gray-700 text-gray-400'
            }`}>
              {property.storm_history.stormRiskLevel.toUpperCase()} RISK
            </span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Hail Events:</span>
              <span className="text-white">{property.storm_history.totalHailEvents} ({property.storm_history.severeHailCount} severe)</span>
            </div>
            {property.storm_history.maxHailSize && (
              <div className="flex justify-between">
                <span className="text-gray-400">Max Hail Size:</span>
                <span className="text-white">{property.storm_history.maxHailSize}" diameter</span>
              </div>
            )}
            {property.storm_history.lastHailDate && (
              <div className="flex justify-between">
                <span className="text-gray-400">Last Hail:</span>
                <span className="text-white">{property.storm_history.lastHailDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Tornadoes:</span>
              <span className={`${property.storm_history.totalTornadoEvents > 0 ? 'text-red-400 font-medium' : 'text-white'}`}>
                {property.storm_history.totalTornadoEvents} events
              </span>
            </div>
            {property.storm_history.lastTornadoDate && (
              <div className="flex justify-between">
                <span className="text-gray-400">Last Tornado:</span>
                <span className="text-red-400">{property.storm_history.lastTornadoDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">High Wind Events:</span>
              <span className="text-white">{property.storm_history.totalWindEvents}</span>
            </div>
            {property.storm_history.maxWindSpeed && (
              <div className="flex justify-between">
                <span className="text-gray-400">Max Wind Speed:</span>
                <span className="text-white">{property.storm_history.maxWindSpeed} mph</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DEED Section - only show if any deed data exists */}
      {(property.deed_date || property.deed_type || property.deed_book) && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Deed</h4>
          <div className="space-y-1 text-sm">
            {property.deed_date && (
              <div className="flex justify-between">
                <span className="text-gray-400">Date:</span>
                <span className="text-white">{property.deed_date}</span>
              </div>
            )}
            {property.deed_type && (
              <div className="flex justify-between">
                <span className="text-gray-400">Type:</span>
                <span className="text-white">{property.deed_type}</span>
              </div>
            )}
            {property.deed_book && (
              <div className="flex justify-between">
                <span className="text-gray-400">Book/Page:</span>
                <span className="text-white">{property.deed_book}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLAGS Section */}
      {property.flags && property.flags.length > 0 && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Flags</h4>
          <div className="flex flex-wrap gap-2">
            {property.flags.map((flag) => (
              <span key={flag} className={`text-xs ${getFlagColor(flag)} px-2 py-1 rounded`}>
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SOURCES Section */}
      {property.sources && Object.keys(property.sources).length > 0 && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Sources</h4>
          <div className="space-y-1 text-xs">
            {Object.entries(property.sources).map(([key, url]) => (
              <div key={key} className="flex justify-between items-center gap-2">
                <span className="text-gray-400">{key}:</span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-cyan hover:text-cyan/80 truncate">
                  {url.replace(/^https?:\/\//, '').slice(0, 40)}...
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const VALID_SCREENS: readonly Screen[] = [
  'dashboard', 'territory', 'sweep', 'stormscope', 'michael',
  'clients', 'proposals', 'materials', 'team', 'jobs', 'settings',
] as const

function readInitialScreen(): Screen {
  if (typeof window === 'undefined') return 'dashboard'
  const param = new URLSearchParams(window.location.search).get('screen')
  return (VALID_SCREENS as readonly string[]).includes(param ?? '') ? (param as Screen) : 'dashboard'
}

export default function Dashboard() {
  const [activeScreen, setActiveScreen] = useState<Screen>(readInitialScreen)

  // Sync activeScreen ↔ URL so refresh / back / forward / share-link work.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const current = url.searchParams.get('screen')
    if (activeScreen === 'dashboard') {
      if (current !== null) {
        url.searchParams.delete('screen')
        window.history.replaceState({}, '', url.toString())
      }
    } else if (current !== activeScreen) {
      url.searchParams.set('screen', activeScreen)
      window.history.replaceState({}, '', url.toString())
    }
  }, [activeScreen])

  // Respond to browser back/forward events by re-reading the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setActiveScreen(readInitialScreen())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const [weather, setWeather] = useState<WeatherCurrent | null>(null)
  const [alerts, setAlerts] = useState<WeatherAlert[]>([])
  const [forecast, setForecast] = useState<ForecastPeriod[]>([])
  const [hailEvents, setHailEvents] = useState<any[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [mapCenter, setMapCenter] = useState({ lat: HQ_LAT, lng: HQ_LNG })
  const [mapZoom, setMapZoom] = useState(14)
  const [mapMode, setMapMode] = useState<'dark' | 'satellite' | '3d'>('satellite')
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
  const [sweepError, setSweepError] = useState<string | null>(null)
  const [commercialResults, setCommercialResults] = useState<Array<{
    id: string; name: string | null; address: string | null;
    lat: number | null; lng: number | null; types: string[]; phone: string | null
  }>>([])
  const [commercialLoading, setCommercialLoading] = useState(false)
  const [commercialRadius, setCommercialRadius] = useState(1000)
  const [residentialResults, setResidentialResults] = useState<Array<{
    id: string; name: string | null; address: string | null;
    lat: number | null; lng: number | null; types: string[]; phone: string | null
  }>>([])
  const [residentialLoading, setResidentialLoading] = useState(false)
  const [residentialRadius, setResidentialRadius] = useState(1609)
  const [sweepUserLocation, setSweepUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [sweepLocationAccuracy, setSweepLocationAccuracy] = useState<number | null>(null)

  // Territory state
  const [territoryFilter, setTerritoryFilter] = useState<'all' | 'hot' | 'researched'>('all')
  const [distanceResults, setDistanceResults] = useState<Map<string, { distanceMeters: number; distanceMiles: string; durationMinutes: number }>>(new Map())
  const [sortByDistance, setSortByDistance] = useState(false)
  const [snapLoading, setSnapLoading] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [showSatelliteSnapshot, setShowSatelliteSnapshot] = useState(false)
  const [routeLoading, setRouteLoading] = useState(false)
  const [avoidTolls, setAvoidTolls] = useState(false)
  const [routeResult, setRouteResult] = useState<{
    orderedWaypoints: Array<{ lat: number; lng: number; address: string; id: string }>
    totalDistanceMiles: string
    totalDurationMinutes: number
    tollCost: string | null
    trafficAware: boolean
    googleMapsUrl: string
  } | null>(null)
  const [mapGeoJson, setMapGeoJson] = useState<object | null>(null)
  const [geoJsonMode, setGeoJsonMode] = useState<'off' | 'heatzone' | 'territory'>('off')
  const [geoJsonLoading, setGeoJsonLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [clientTimezone, setClientTimezone] = useState<{
    localTime: string; timeZoneName: string; goodTimeToCall: boolean; callAdvice: string
  } | null>(null)
  const [sweepPath, setSweepPath] = useState<Array<{ lat: number; lng: number }>>([])
  const [snappedPath, setSnappedPath] = useState<Array<{ lat: number; lng: number }>>([])
  const [pathTrackingActive, setPathTrackingActive] = useState(false)

  // Dashboard search state
  const [dashboardSearchMode, setDashboardSearchMode] = useState<'zip' | 'address'>('zip')
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('')

  // StormScope state
  const [stormAddress, setStormAddress] = useState('')
  const [stormLoading, setStormLoading] = useState(false)
  const [stormRisk, setStormRisk] = useState<{ level: 'High' | 'Moderate' | 'Low'; eventCount: number } | null>(null)
  const [showRadar, setShowRadar] = useState(false)
  const [radarProduct, setRadarProduct] = useState<'n0q' | 'n0r' | 'n0s' | 'net' | 'n0z'>('n0q')
  const [stormLocation, setStormLocation] = useState('')
  const [stormCenter, setStormCenter] = useState({ lat: HQ_LAT, lng: HQ_LNG })
  // HWEL — Historical Weather Event Library
  const [hwelData, setHwelData] = useState<any>(null)
  const [hwelLoading, setHwelLoading] = useState(false)
  const [hwelTab, setHwelTab] = useState<'summary' | 'timeline' | 'events'>('summary')

  // Pin drop state (GPS Sweep)
  const [pinDropLat, setPinDropLat] = useState<number | null>(null)
  const [pinDropLng, setPinDropLng] = useState<number | null>(null)

  // Clients screen state
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientStatusFilter, setClientStatusFilter] = useState<string>('all')
  const [clientActivities, setClientActivities] = useState<Record<string, Array<{action: string, timestamp: string}>>>(() => {
    try { return JSON.parse(localStorage.getItem('directive_client_activities') || '{}') } catch { return {} }
  })

  // Proposals screen state
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null)
  const [editingProposal, setEditingProposal] = useState(false)
  const [proposalMapMode, setProposalMapMode] = useState<'place' | 'streetview' | 'satellite'>('place')

  // Materials screen state — upgraded calculator
  const [materials, setMaterials] = useState<Material[]>([])
  const [roofWidth, setRoofWidth] = useState('')
  const [roofLength, setRoofLength] = useState('')
  const [addingMaterial, setAddingMaterial] = useState(false)
  const [roofPitch, setRoofPitch] = useState<string>('6/12')
  const [wastePercent, setWastePercent] = useState<number>(10)
  const [dormerSqft, setDormerSqft] = useState<string>('')
  const [valleyDeductSqft, setValleyDeductSqft] = useState<string>('')
  const [roofType, setRoofType] = useState<'gable' | 'hip'>('gable')

  // Material Orders state
  interface MaterialOrder {
    id: string
    materials: Array<{ name: string; quantity: number; unit: string; unit_cost: number; total: number }>
    job_id?: string
    job_title?: string
    status: 'draft' | 'ordered' | 'shipped' | 'delivered'
    supplier: string
    order_date: string
    notes: string
    total_cost: number
  }
  const [materialOrders, setMaterialOrders] = useState<MaterialOrder[]>(() => {
    try { return JSON.parse(localStorage.getItem('directive_material_orders') || '[]') } catch { return [] }
  })
  const [addingOrder, setAddingOrder] = useState(false)
  const [materialsTab, setMaterialsTab] = useState<'catalog' | 'orders'>('catalog')

  // Jobs / Production Management state
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [jobStageFilter, setJobStageFilter] = useState<JobStage | 'all'>('all')
  const [addingJob, setAddingJob] = useState(false)
  const [newJobTitle, setNewJobTitle] = useState('')
  const [newJobAddress, setNewJobAddress] = useState('')
  const [newJobOwner, setNewJobOwner] = useState('')
  const [newJobAmount, setNewJobAmount] = useState('')
  const [jobTab, setJobTab] = useState<'pipeline' | 'detail' | 'insurance' | 'photos'>('pipeline')
  const [addingSupplementNote, setAddingSupplementNote] = useState(false)
  const [photoCategory, setPhotoCategory] = useState<PhotoCategory>('overall_roof')
  const [jobViewMode, setJobViewMode] = useState<'list' | 'board'>('list')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Team chat state
  const [teamMessages, setTeamMessages] = useState<ChatMessage[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<'rep' | 'manager'>('rep')
  const [teamChatInput, setTeamChatInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeChannel, setActiveChannel] = useState<'general' | 'management'>('general')
  const [commsTab, setCommsTab] = useState<'team' | 'voice' | 'gmail'>('team')

  // Dashboard enhanced state
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'storm-leads' | 'michael-leads' | 'historical' | 'analytics'>('overview')
  const [weatherZip, setWeatherZip] = useState('')
  const [dashWeather, setDashWeather] = useState<WeatherCurrent | null>(null)
  const [dashAlerts, setDashAlerts] = useState<WeatherAlert[]>([])
  const [recentAlerts90d, setRecentAlerts90d] = useState<any[]>([])
  const [michaelLeads, setMichaelLeads] = useState<Array<{ address: string; reason: string; score: number; source: string; roofAge: number | null; stormHits: number }>>([])
  const [michaelLeadsLoading, setMichaelLeadsLoading] = useState(false)
  const [michaelTab, setMichaelTab] = useState<'leads' | 'chat'>('leads')
  const [michaelZip, setMichaelZip] = useState('')
  const [michaelStormData, setMichaelStormData] = useState<{
    zip: string; city: string; state: string; lat: number; lng: number;
    riskLevel: string; totalEvents: number; hailCount: number; severeHailCount: number;
    maxHailSize: number; tornadoCount: number; windCount: number;
    byYear: Record<number, { hail: number; tornado: number; wind: number; maxHail: number }>;
    impactPoints: Array<{ lat: number; lng: number; size: number; date: string | null; type: string; severity: string }>;
    yearsAnalyzed: number;
  } | null>(null)
  const [stormImpactZones, setStormImpactZones] = useState<Array<{
    zip: string; city: string; riskLevel: string; hailCount: number; tornadoCount: number;
    lat: number; lng: number; addedAt: string;
  }>>(() => {
    try { return JSON.parse(localStorage.getItem('directive_impact_zones') || '[]') } catch { return [] }
  })
  const [timelineView, setTimelineView] = useState<'month' | 'week' | 'day'>('month')
  const [timelinePlaying, setTimelinePlaying] = useState(false)

  // Notification system state
  interface AppNotification {
    id: string
    message: string
    type: 'info' | 'success' | 'warning'
    timestamp: string
    read: boolean
  }
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)

  // Auth state
  const [user, setUser] = useState<{ id: string; email: string | undefined } | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [userRole, setUserRole] = useState<UserRole>('trial')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [lockedFeature, setLockedFeature] = useState<string>('')
  const [settingsSaved, setSettingsSaved] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()

  // Company settings state
  const [companySettings, setCompanySettings] = useState({
    company_name: '',
    company_phone: '',
    license_number: '',
    home_city: '',
    service_radius: '25',
    tax_rate: '8.5',
    payment_terms: '50_50',
    warranty_period: '2',
    notify_storm: true,
    notify_leads: true,
    notify_status: true,
  })

  // Notification helper function
  const addNotification = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const n: AppNotification = {
      id: crypto.randomUUID(),
      message,
      type,
      timestamp: new Date().toISOString(),
      read: false
    }
    setNotifications(prev => [n, ...prev].slice(0, 50))
  }

  // Fetch profile via server API (bypasses RLS)
  const fetchProfileServer = async (userId: string) => {
    try {
      const res = await authFetch(`/api/profile?userId=${userId}`)
      const data = await res.json()
      if (data.profile) {
        setUserProfile(data.profile)
        setUserRole(data.profile.role)
      } else {
        // Fallback: try direct Supabase
        const profile = await getUserProfile(userId)
        if (profile) { setUserProfile(profile); setUserRole(profile.role) }
        else setUserRole('trial')
      }
    } catch {
      const profile = await getUserProfile(userId)
      if (profile) { setUserProfile(profile); setUserRole(profile.role) }
      else setUserRole('trial')
    }
  }

  // Auth check on mount
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email })
        await fetchProfileServer(session.user.id)
      } else {
        setUser(null)
        // No session → redirect to /login instead of flashing the app shell.
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          router.replace('/login')
        }
      }
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email })
        await fetchProfileServer(session.user.id)
      } else {
        setUser(null); setUserRole('trial')
        // Sign-out or session expired anywhere in the app → land on /login.
        if (event === 'SIGNED_OUT' && typeof window !== 'undefined' && window.location.pathname !== '/login') {
          router.replace('/login')
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [router])

  // Load company settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('directive_company_settings')
    if (saved) {
      try {
        setCompanySettings(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to load company settings:', e)
      }
    }
  }, [])

  // Helper: gate a feature — shows upgrade modal if locked
  const requireTier = (feature: keyof ReturnType<typeof getTierConfig>['features'], featureName: string): boolean => {
    if (canAccess(userRole, feature)) return true
    setLockedFeature(featureName)
    setShowUpgradeModal(true)
    return false
  }

  // Load properties on mount
  useEffect(() => {
    const loadData = async () => {
      const [propsData, clientsData, proposalsData, materialsData, messagesData, jobsData] = await Promise.all([
        getProperties(),
        getClients(),
        getProposals(),
        getMaterials(),
        getChatMessages('general'),
        getJobs(),
      ])
      setProperties(propsData)
      setClients(clientsData)
      setProposals(proposalsData)
      setMaterials(materialsData)
      setTeamMessages(messagesData)
      setJobs(jobsData)
    }
    loadData()
  }, [])

  // Fetch weather data on mount
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const [weatherRes, alertsRes, forecastRes, hailRes, hwelRes] = await Promise.all([
          authFetch(`/api/weather/current?lat=${HQ_LAT}&lng=${HQ_LNG}`),
          authFetch(`/api/weather/alerts?lat=${HQ_LAT}&lng=${HQ_LNG}`),
          authFetch(`/api/weather/forecast?lat=${HQ_LAT}&lng=${HQ_LNG}`),
          authFetch(`/api/noaa/hail?lat=${HQ_LAT}&lng=${HQ_LNG}&days=3650`),
          authFetch(`/api/noaa/hwel?lat=${HQ_LAT}&lng=${HQ_LNG}&years=10`),
        ])

        if (weatherRes.ok) setWeather(await weatherRes.json())
        if (alertsRes.ok) setAlerts(await alertsRes.json())
        if (forecastRes.ok) setForecast(await forecastRes.json())
        if (hailRes.ok) setHailEvents(await hailRes.json())
        if (hwelRes.ok) setHwelData(await hwelRes.json())
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

  // Save material orders to localStorage
  useEffect(() => {
    localStorage.setItem('directive_material_orders', JSON.stringify(materialOrders))
  }, [materialOrders])

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

  // GPS Path Tracking
  useEffect(() => {
    if (!pathTrackingActive) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setSweepPath(prev => [
          ...prev,
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        ])
      },
      (error) => {
        console.error('Geolocation error:', error)
      },
      { enableHighAccuracy: true }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [pathTrackingActive])

  // Get accurate location from Google Geolocation API or browser GPS
  const getAccurateLocation = async (): Promise<{ lat: number; lng: number; accuracy?: number } | null> => {
    // Browser GPS first — returns the USER's actual location
    const browserLoc = await new Promise<{ lat: number; lng: number; accuracy: number } | null>((resolve) => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
    if (browserLoc) return browserLoc

    // Fallback: Google Geolocation API (IP-based, less accurate)
    try {
      const res = await authFetch('/api/geolocate', { method: 'POST' })
      const data = await res.json()
      if (data.lat && data.lng) return data
    } catch { /* fall through */ }

    return null
  }

  // Handle commercial building search
  const handleSearchCommercial = async () => {
    let useLoc = sweepUserLocation
    if (!useLoc) {
      const fresh = await getAccurateLocation()
      if (!fresh) {
        addNotification('Could not get your location. Please allow location access and try again.', 'warning')
        return
      }
      setSweepUserLocation({ lat: fresh.lat, lng: fresh.lng })
      setSweepLocationAccuracy(fresh.accuracy || null)
      useLoc = { lat: fresh.lat, lng: fresh.lng }
    }

    setCommercialLoading(true)
    try {
      const res = await authFetch('/api/places-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: useLoc.lat, lng: useLoc.lng, radius: commercialRadius, type: 'commercial' })
      })
      const data = await res.json()
      setCommercialResults(data.places || [])
      if (!data.places?.length) addNotification('No commercial leads found in this radius', 'info')
    } catch {
      addNotification('Commercial search failed. Try again.', 'warning')
      setCommercialResults([])
    } finally {
      setCommercialLoading(false)
    }
  }

  // Add commercial place as lead
  const handleAddCommercialLead = async (place: { id: string; name: string | null; address: string | null; lat: number | null; lng: number | null; phone: string | null }) => {
    if (!place.lat || !place.lng) return

    const newProperty: Property = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
      permit_last_date: null,
      flags: ['commercial'],
      sources: { 'Google Places': place.name || 'Commercial Property' },
      score: 50,
      created_at: new Date().toISOString(),
      sqft: null, lot_sqft: null, bedrooms: null, bathrooms: null,
      appraised_value: null, listing_status: null, listing_price: null,
      hoa_monthly: null, subdivision: null, occupancy_type: null,
      property_class: null, land_use: null, deed_date: null,
      deed_type: null, deed_book: null, tax_annual: null,
      neighborhood: null, owner_age: null, roof_age_estimated: false,
      storm_history: null,
      roof_area_sqft: null, roof_pitch: null, roof_pitch_degrees: null,
      pitch_multiplier: null, roofing_squares: null, roof_segments: null,
      roof_segment_details: null, satellite_image_url: null,
      roof_imagery_date: null, roof_imagery_quality: null,
    }

    const updated = [...properties, newProperty]
    setProperties(updated)
    await saveProperty(newProperty)
    addNotification(`Property saved: ${newProperty.address}`, 'success')
    setCommercialResults(commercialResults.filter(p => p.id !== place.id))
  }

  // Handle residential property search
  const handleSearchResidential = async () => {
    let useLoc = sweepUserLocation
    if (!useLoc) {
      const fresh = await getAccurateLocation()
      if (!fresh) {
        addNotification('Could not get your location. Please allow location access and try again.', 'warning')
        return
      }
      setSweepUserLocation({ lat: fresh.lat, lng: fresh.lng })
      setSweepLocationAccuracy(fresh.accuracy || null)
      useLoc = { lat: fresh.lat, lng: fresh.lng }
    }

    setResidentialLoading(true)
    try {
      const res = await authFetch('/api/residential-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: useLoc.lat, lng: useLoc.lng, radius: residentialRadius })
      })
      const data = await res.json()
      setResidentialResults(data.places || [])
      if (!data.places?.length) addNotification('No residential leads found in this radius', 'info')
    } catch {
      addNotification('Residential search failed. Try again.', 'warning')
      setResidentialResults([])
    } finally {
      setResidentialLoading(false)
    }
  }

  // Add residential place as lead
  const handleAddResidentialLead = async (place: { id: string; name: string | null; address: string | null; lat: number | null; lng: number | null; phone: string | null }) => {
    if (!place.lat || !place.lng) return

    const newProperty: Property = {
      id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
      permit_last_date: null,
      flags: ['residential'],
      sources: { 'Google Places': place.name || 'Residential Property' },
      score: 50,
      created_at: new Date().toISOString(),
      sqft: null, lot_sqft: null, bedrooms: null, bathrooms: null,
      appraised_value: null, listing_status: null, listing_price: null,
      hoa_monthly: null, subdivision: null, occupancy_type: null,
      property_class: null, land_use: null, deed_date: null,
      deed_type: null, deed_book: null, tax_annual: null,
      neighborhood: null, owner_age: null, roof_age_estimated: false,
      storm_history: null,
      roof_area_sqft: null, roof_pitch: null, roof_pitch_degrees: null,
      pitch_multiplier: null, roofing_squares: null, roof_segments: null,
      roof_segment_details: null, satellite_image_url: null,
      roof_imagery_date: null, roof_imagery_quality: null,
    }

    const updated = [...properties, newProperty]
    setProperties(updated)
    await saveProperty(newProperty)
    addNotification(`Property saved: ${newProperty.address}`, 'success')
    setResidentialResults(residentialResults.filter(p => p.id !== place.id))
  }

  // Handle sort by distance
  const handleSortByDistance = async () => {
    const loc = await getAccurateLocation()
    if (!loc) return

    setUserLocation(loc)
    setSweepLocationAccuracy(loc.accuracy || null)

    const res = await authFetch('/api/distance-matrix', {
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

    setSweepResult(null) // Clear previous result so stale data never lingers
    setSweepError(null)
    setSweepLoading(true)
    setSweepPhase('geocoding')

    try {
      // Phase 0: Validate & normalize address
      const validateRes = await authFetch('/api/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: sweepAddress })
      })
      const validation = await validateRes.json()
      const addressToResearch = validation.canonical || sweepAddress

      // Phase 1: Geocode — get coordinates immediately so map can fly there
      const geocodeRes = await authFetch(`/api/geocode?q=${encodeURIComponent(addressToResearch)}`)
      if (!geocodeRes.ok) throw new Error('Geocoding failed')
      const { lat, lng, display_name } = await geocodeRes.json()

      // Fly to property on map right away
      setMapCenter({ lat, lng })
      setMapZoom(18)

      setSweepPhase('researching')

      // Phase 2: Research — returns data directly (synchronous within 60s timeout)
      const startRes = await authFetch('/api/research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressToResearch }),
      })
      if (!startRes.ok) throw new Error('Could not start research')
      const startJson = await startRes.json()

      // Phase 3: Use direct data if returned, otherwise poll (legacy fallback)
      let data: Record<string, unknown> = {}

      if (startJson.status === 'done' && startJson.data) {
        // Direct response — research completed synchronously
        data = startJson.data || {}
        // Use geocoded coords from research if available
        if (startJson.data.geocoded_lat && startJson.data.geocoded_lng) {
          setMapCenter({ lat: startJson.data.geocoded_lat as number, lng: startJson.data.geocoded_lng as number })
          setMapZoom(18)
        }
        setSweepPhase('scoring')
      } else if (startJson.jobId) {
        // Legacy polling path
        let attempts = 0
        const maxAttempts = 30
        await new Promise<void>((resolve) => {
          const poll = async () => {
            attempts++
            try {
              const statusRes = await authFetch(`/api/research/status?jobId=${startJson.jobId}`)
              const status = await statusRes.json()
              if (status.status === 'done') {
                data = status.data || {}
                setSweepPhase('scoring')
                resolve()
                return
              }
              if (status.status === 'error') { resolve(); return }
            } catch (e) { console.error('Poll error:', e) }
            if (attempts >= maxAttempts) { resolve(); return }
            setTimeout(poll, 3000)
          }
          setTimeout(poll, 3000)
        })
      } else {
        setSweepPhase('scoring')
      }

      // Phase 4: Build property from whatever research returned
      const newProperty: Property = {
        id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        address: display_name || sweepAddress,
        lat,
        lng,
        owner_name: (data.ownerName as string) || null,
        owner_phone: (data.ownerPhone as string) || null,
        owner_email: (data.ownerEmail as string) || null,
        year_built: (data.yearBuilt as number) || null,
        roof_age_years: (data.roofAgeYears as number) || null,
        market_value: (data.marketValue as number) || null,
        assessed_value: (data.assessedValue as number) || null,
        last_sale_date: (data.lastSaleDate as string) || null,
        last_sale_price: (data.lastSalePrice as number) || null,
        county: (data.county as string) || null,
        parcel_id: (data.parcelId as string) || null,
        permit_count: (data.permitCount as number) || null,
        permit_last_date: (data.permitLastDate as string) || null,
        flags: (data.flags as string[]) || [],
        sources: (data.sources as Record<string, string>) || {},
        score: null,
        created_at: new Date().toISOString(),
        sqft: (data.sqft as number) || null,
        lot_sqft: (data.lotSqft as number) || null,
        bedrooms: (data.bedrooms as number) || null,
        bathrooms: (data.bathrooms as number) || null,
        appraised_value: (data.appraisedValue as number) || null,
        listing_status: (data.listingStatus as string) || null,
        listing_price: (data.listingPrice as number) || null,
        hoa_monthly: (data.hoaMonthly as number) || null,
        subdivision: (data.subdivision as string) || null,
        occupancy_type: (data.occupancyType as string) || null,
        property_class: (data.propertyClass as string) || null,
        land_use: (data.landUse as string) || null,
        deed_date: (data.deedDate as string) || null,
        deed_type: (data.deedType as string) || null,
        deed_book: (data.deedBook as string) || null,
        tax_annual: (data.taxAnnual as number) || null,
        neighborhood: (data.neighborhood as string) || null,
        owner_age: (data.ownerAge as number) || null,
        roof_age_estimated: (data.roofAgeEstimated as boolean) || false,
        storm_history: (data.stormHistory as Property['storm_history']) || null,
        roof_area_sqft: null,
        roof_pitch: null,
        roof_pitch_degrees: null,
        pitch_multiplier: null,
        roofing_squares: null,
        roof_segments: null,
        roof_segment_details: null,
        satellite_image_url: null,
        roof_imagery_date: null,
        roof_imagery_quality: null,
      }

      // Phase 5: Fetch roof measurements from Google Solar API
      try {
        const roofRes = await authFetch(`/api/roof-measure?lat=${lat}&lng=${lng}`)
        if (roofRes.ok) {
          const roofData = await roofRes.json()
          if (roofData.success && roofData.roof) {
            newProperty.roof_area_sqft = roofData.roof.totalAreaSqFt
            newProperty.roof_pitch = roofData.roof.avgPitchRatio
            newProperty.roof_pitch_degrees = roofData.roof.avgPitchDegrees
            newProperty.pitch_multiplier = roofData.roof.pitchMultiplier
            newProperty.roofing_squares = roofData.roof.roofingSquares
            newProperty.roof_segments = roofData.roof.segmentCount
            newProperty.roof_segment_details = roofData.roof.segments
            newProperty.satellite_image_url = roofData.satelliteImageUrl
            newProperty.roof_imagery_date = roofData.imagery?.date
            newProperty.roof_imagery_quality = roofData.imagery?.quality
          }
        }
      } catch (e) {
        // Silently fail — roof data is supplemental
        console.log('Roof measure unavailable:', e)
      }

      setSweepResult(newProperty)
      setMapZoom(19)
      setSweepPhase('idle')
    } catch (error) {
      console.error('Sweep error:', error)
      const msg = error instanceof Error ? error.message : 'Search failed'
      setSweepError(msg.includes('Geocoding') ? 'Address not found. Try adding city and state.' : 'Search failed. Please try again.')
      setSweepPhase('idle')
    } finally {
      setSweepLoading(false)
    }
  }

  // Handle map click for pin drop in GPS Sweep mode
  const handleSweepMapClick = async (lat: number, lng: number) => {
    setPinDropLat(lat)
    setPinDropLng(lng)
    setSweepUserLocation({ lat, lng })
    setSweepLocationAccuracy(null)
    // Auto-trigger residential sweep at dropped pin
    setResidentialLoading(true)
    try {
      const res = await authFetch('/api/residential-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radius: 804 }) // 0.5mi = 804m
      })
      const data = await res.json()
      setResidentialResults(data.places || [])
    } catch (error) {
      console.error('Pin drop residential sweep error:', error)
    } finally {
      setResidentialLoading(false)
    }
  }

  // Save sweep result
  const handleSaveSweep = async () => {
    if (!sweepResult) return
    // Duplicate guard — check by address (case-insensitive)
    const alreadyExists = properties.some(
      p => p.address.toLowerCase() === sweepResult.address.toLowerCase()
    )
    if (alreadyExists) {
      addNotification('Property already in your pipeline', 'info')
      setSweepResult(null)
      setSweepAddress('')
      return
    }
    const updated = [...properties, sweepResult]
    setProperties(updated)
    await saveProperty(sweepResult)
    addNotification(`Property saved: ${sweepResult.address}`, 'success')
    setSweepResult(null)
    setSweepAddress('')
  }

  // Handle GeoJSON overlay toggle
  const handleGeoJsonToggle = async (type: 'territory' | 'heatzone') => {
    if (geoJsonMode === type) { setGeoJsonMode('off'); setMapGeoJson(null); return }
    setGeoJsonLoading(true)
    try {
      const res = await authFetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: properties.map(p => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            score: calculateLeadScore(p),
            roof_age_years: p.roof_age_years,
            address: p.address
          })),
          type
        })
      })
      const data = await res.json()
      if (data.geojson) { setMapGeoJson(data.geojson); setGeoJsonMode(type) }
    } catch {
      /* silent — map just won't show overlay */
    } finally {
      setGeoJsonLoading(false)
    }
  }

  // Fetch client timezone when selected
  useEffect(() => {
    if (!selectedClient) { setClientTimezone(null); return }
    const clientProp = properties.find(p => p.id === selectedClient.property_id)
    if (!clientProp?.lat || !clientProp?.lng) return
    authFetch(`/api/timezone?lat=${clientProp.lat}&lng=${clientProp.lng}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setClientTimezone(data) })
      .catch(() => {})
  }, [selectedClient, properties])

  // Handle snap to roads
  const handleSnapToRoads = async () => {
    if (sweepPath.length < 2) return
    setSnapLoading(true)
    try {
      const res = await authFetch('/api/roads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: sweepPath, mode: 'snapToRoads' })
      })
      const data = await res.json()
      if (data.snappedPoints) {
        setSnappedPath(data.snappedPoints)
        addNotification(`Path snapped to ${data.snappedPoints.length} road points`, 'success')
      } else {
        addNotification('Could not snap path to roads', 'warning')
      }
    } catch {
      addNotification('Snap to roads failed. Try again.', 'warning')
    } finally {
      setSnapLoading(false)
    }
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
      const response = await authFetch('/api/michael', {
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

  // Handle StormScope location search
  const handleStormLocationSearch = async (query: string) => {
    if (!query.trim()) return
    setStormLoading(true)

    try {
      const geocodeRes = await authFetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      if (!geocodeRes.ok) throw new Error('Geocoding failed')
      const { lat, lng } = await geocodeRes.json()
      setStormCenter({ lat, lng })
      setMapCenter({ lat, lng })
      setMapZoom(12)

      // Fetch ALL weather data + HWEL for the new location in parallel
      const [weatherRes, alertsRes, forecastRes, hailRes, hwelRes] = await Promise.all([
        authFetch(`/api/weather/current?lat=${lat}&lng=${lng}`),
        authFetch(`/api/weather/alerts?lat=${lat}&lng=${lng}`),
        authFetch(`/api/weather/forecast?lat=${lat}&lng=${lng}`),
        authFetch(`/api/noaa/hail?lat=${lat}&lng=${lng}&days=3650`),
        authFetch(`/api/noaa/hwel?lat=${lat}&lng=${lng}&years=10`),
      ])

      if (weatherRes.ok) setWeather(await weatherRes.json())
      if (alertsRes.ok) setAlerts(await alertsRes.json())
      if (forecastRes.ok) setForecast(await forecastRes.json())
      if (hailRes.ok) {
        const hailData = await hailRes.json()
        setHailEvents(hailData)

        // Auto-calculate storm risk for the searched location
        const eventCount = hailData.length
        let level: 'High' | 'Moderate' | 'Low'
        if (eventCount >= 15) level = 'High'
        else if (eventCount >= 5) level = 'Moderate'
        else level = 'Low'
        setStormRisk({ level, eventCount })
      }
      if (hwelRes.ok) setHwelData(await hwelRes.json())
    } catch (error) {
      console.error('Storm location search error:', error)
    } finally {
      setStormLoading(false)
    }
  }

  // Handle StormScope risk assessment
  const handleStormAssess = async () => {
    if (!stormAddress.trim()) return

    setStormLoading(true)

    try {
      const geocodeRes = await authFetch(`/api/geocode?q=${encodeURIComponent(stormAddress)}`)
      if (!geocodeRes.ok) throw new Error('Geocoding failed')
      const { lat, lng } = await geocodeRes.json()

      const hailRes = await authFetch(`/api/noaa/hail?lat=${lat}&lng=${lng}&days=3650`)
      if (!hailRes.ok) throw new Error('Hail data failed')
      const hailData = await hailRes.json()

      const eventCount = hailData.length
      // Check for severe events (2"+ hail or tornado reports)
      const severeCount = hailData.filter((e: any) => e.size && e.size >= 2.0).length
      let level: 'High' | 'Moderate' | 'Low'
      // Calibrated for real storm data — areas like Huntsville AL are genuinely volatile
      if (eventCount >= 15 || severeCount >= 3) level = 'High'
      else if (eventCount >= 5 || severeCount >= 1) level = 'Moderate'
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
    const routeProps = properties.filter((p) => {
      if (territoryFilter === 'hot') return calculateLeadScore(p) >= 70
      if (territoryFilter === 'researched') return p.sources && typeof p.sources === 'object' && Object.keys(p.sources).length > 0
      return true
    })

    if (routeProps.length < 2) return
    setRouteLoading(true)
    setRouteError(null)
    try {
      const waypoints = routeProps.map(p => ({ lat: p.lat, lng: p.lng, address: p.address, id: p.id }))
      const res = await authFetch('/api/route-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints, origin: { lat: waypoints[0].lat, lng: waypoints[0].lng }, avoidTolls })
      })
      const data = await res.json()
      if (data.orderedWaypoints) {
        setRouteResult(data)
      } else {
        setRouteError('Route optimization failed. Try again.')
      }
    } catch {
      setRouteError('Could not reach routing service. Check your connection.')
    } finally {
      setRouteLoading(false)
    }
  }

  const handleDeleteProperty = async (id: string) => {
    setProperties(prev => prev.filter(p => p.id !== id))
    setSelectedProperty(null)
    await deleteProperty(id)
  }

  // Dashboard: Fetch weather by ZIP code
  const handleWeatherZipLookup = async () => {
    if (!weatherZip.trim()) return
    try {
      const geoRes = await authFetch(`/api/geocode?q=${encodeURIComponent(weatherZip)}`)
      if (!geoRes.ok) return
      const { lat, lng } = await geoRes.json()
      const [wRes, aRes] = await Promise.all([
        authFetch(`/api/weather/current?lat=${lat}&lng=${lng}`),
        authFetch(`/api/weather/alerts?lat=${lat}&lng=${lng}`),
      ])
      if (wRes.ok) setDashWeather(await wRes.json())
      if (aRes.ok) setDashAlerts(await aRes.json())
    } catch (e) {
      console.error('Weather ZIP lookup error:', e)
    }
  }

  // Michael AI Daily Lead Engine
  const runMichaelLeadEngine = async () => {
    setMichaelLeadsLoading(true)
    try {
      const response = await authFetch('/api/michael', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `You are the Directive CRM lead generation engine. Analyze the following data and generate a list of the top 10 leads I should pursue today. For each lead, provide: the address, a reason why this is a good lead, a score from 1-100, and the source of the lead intelligence.

Current data:
- ${properties.length} total properties in pipeline
- ${properties.filter(p => calculateLeadScore(p) >= 70).length} hot leads (score 70+)
- ${properties.filter(p => p.storm_history?.stormRiskLevel === 'high').length} properties in high storm risk zones
- ${properties.filter(p => p.roof_age_years !== null && p.roof_age_years >= 20).length} properties with roofs 20+ years old
- ${hailEvents.length} hail events in the past year
- ${alerts.length} active weather alerts

Property addresses in pipeline:
${properties.slice(0, 50).map(p => `${p.address} | Roof: ${p.roof_age_years || '?'}yr | Score: ${calculateLeadScore(p)} | Storm Risk: ${p.storm_history?.stormRiskLevel || 'unknown'}`).join('\n')}

Based on storm damage zones, roof age, property values, and weather patterns, identify the best leads. Format your response as JSON array: [{"address":"...","reason":"...","score":85,"source":"Storm Damage Zone"}]
Only respond with the JSON array, no other text.` }
          ],
          context: {
            activeScreen: 'dashboard',
            leadCount: properties.length,
            hotLeadCount: properties.filter(p => calculateLeadScore(p) >= 70).length,
            alertCount: alerts.length,
          }
        })
      })
      if (response.ok) {
        const { reply } = await response.json()
        try {
          const jsonMatch = reply.match(/\[[\s\S]*\]/)
          if (jsonMatch) {
            const leads = JSON.parse(jsonMatch[0])
            setMichaelLeads(leads.slice(0, 10))
          }
        } catch {
          console.error('Failed to parse Michael leads')
        }
      }
    } catch (e) {
      console.error('Michael lead engine error:', e)
    } finally {
      setMichaelLeadsLoading(false)
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
    if (territoryFilter === 'researched') return p.sources && typeof p.sources === 'object' && Object.keys(p.sources).length > 0
    return true
  })

  // Auth guard
  if (authLoading) {
    return (
      <div className="relative w-screen h-screen overflow-hidden bg-dark flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-cyan animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

  // Mobile layout
  if (isMobile && !authLoading && user) {
    return (
      <MobileLayout
        user={user}
        userRole={userRole}
        onSignOut={() => signOut()}
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        properties={properties}
        sweepAddress={sweepAddress}
        setSweepAddress={setSweepAddress}
        sweepLoading={sweepLoading}
        sweepPhase={sweepPhase}
        sweepResult={sweepResult}
        sweepError={sweepError}
        onSweepResearch={handleSweepResearch}
        onSaveProperty={async (p) => {
          const updated = [...properties.filter(x => x.id !== p.id), p]
          setProperties(updated)
          await saveProperty(p)
        }}
        weather={weather}
        alerts={alerts}
        forecast={forecast}
        clients={clients}
        selectedClient={selectedClient}
        setSelectedClient={setSelectedClient}
        onSaveClient={async (c) => {
          const updated = clients.map(x => x.id === c.id ? c : x)
          setClients(updated)
          await saveClient(c)
          const propForClient = properties.find(p => p.id === c.property_id)
          addNotification(`Client updated for ${propForClient?.address || 'property'}`, 'info')
        }}
        proposals={proposals}
        setSelectedProposal={setSelectedProposal}
        michaelZip={michaelZip}
        setMichaelZip={setMichaelZip}
        michaelLeadsLoading={michaelLeadsLoading}
        michaelLeads={michaelLeads}
        michaelStormData={michaelStormData}
        onMichaelSearch={(zip) => {
          setMichaelLeadsLoading(true)
          setMichaelLeads([])
          setMichaelStormData(null)
          authFetch('/api/michael/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zip }),
          })
            .then(r => r.json())
            .then((data: any) => {
              setMichaelLeads(data.leads || [])
              setMichaelStormData(data)
            })
            .catch(console.error)
            .finally(() => setMichaelLeadsLoading(false))
        }}
        chatMessages={chatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatLoading={chatLoading}
        onSendChat={handleSendChat}
        stormImpactZones={stormImpactZones}
      />
    )
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-dark">
      {/* Background */}
      <div className="absolute inset-0 z-0" style={{ isolation: 'isolate' }}>
        {activeScreen === 'dashboard' ? (
          <div className="absolute inset-0">
            <MapView
              lat={mapCenter.lat}
              lng={mapCenter.lng}
              zoom={11}
              mode="dark"
              onModeChange={() => {}}
            />
            <div className="absolute inset-0 bg-[#0d1117]/10" style={{backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.04) 0%, transparent 60%)'}} />
          </div>
        ) : (
          <>
            <MapView
              lat={mapCenter.lat}
              lng={mapCenter.lng}
              zoom={mapZoom}
              mode={mapMode}
              markers={
                activeScreen === 'territory'
                  ? territoryMarkers
                  : activeScreen === 'sweep'
                  ? [
                      ...(sweepResult ? [{ id: 'sweep-target', lat: sweepResult.lat, lng: sweepResult.lng, color: 'green' as const, label: sweepResult.address }] : []),
                      ...(pinDropLat && pinDropLng ? [{ id: 'pin-drop', lat: pinDropLat, lng: pinDropLng, color: 'amber' as const, label: '📍 Dropped Pin — 0.5mi sweep active' }] : []),
                    ]
                  : []
              }
              onModeChange={setMapMode}
              geoJsonData={activeScreen === 'territory' ? mapGeoJson : null}
              radarOverlay={activeScreen === 'stormscope' && showRadar}
              radarProduct={radarProduct}
              onMapClick={activeScreen === 'sweep' ? handleSweepMapClick : undefined}
            />

          </>
        )}
      </div>

      {/* Top Navigation Bar */}
      <nav className="absolute top-0 left-0 right-0 z-40 glass m-4 rounded-lg">
        <div className="flex items-center justify-between px-6 py-2">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Image
              src="/directive-wordmark.png"
              alt="Directive CRM"
              width={480}
              height={144}
              className="h-36 w-auto object-contain"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {[
              { id: 'dashboard' as Screen, label: 'Dashboard', icon: BarChart3, feature: 'dashboard' as const },
              { id: 'territory' as Screen, label: 'Territory', icon: MapPin, feature: 'territory' as const },
              { id: 'sweep' as Screen, label: 'Sweep', icon: Navigation, feature: 'sweep' as const },
              { id: 'stormscope' as Screen, label: 'StormScope', icon: Radio, feature: 'stormscope' as const },
              { id: 'michael' as Screen, label: 'Michael', icon: Brain, feature: 'michael' as const },
              { id: 'jobs' as Screen, label: 'Jobs', icon: Briefcase, feature: 'jobs' as const },
              { id: 'clients' as Screen, label: 'Clients', icon: Users, feature: 'clients' as const },
              { id: 'proposals' as Screen, label: 'Proposals', icon: FileText, feature: 'proposals' as const },
              { id: 'materials' as Screen, label: 'Materials', icon: Package, feature: 'materials' as const },
              { id: 'team' as Screen, label: 'Team', icon: MessageSquare, feature: 'team' as const },
              { id: 'settings' as Screen, label: 'Settings', icon: Settings, feature: 'settings' as const },
            ].map((tab) => {
              const Icon = tab.icon
              const hasUnread = tab.id === 'team' && unreadCount > 0
              const isLocked = !canAccess(userRole, tab.feature)
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (isLocked) {
                      setLockedFeature(tab.label)
                      setShowUpgradeModal(true)
                      return
                    }
                    setActiveScreen(tab.id)
                    if (tab.id === 'team') setUnreadCount(0)
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all relative whitespace-nowrap flex-shrink-0 ${
                    activeScreen === tab.id
                      ? 'bg-cyan text-dark'
                      : isLocked
                      ? 'text-gray-600 cursor-pointer hover:text-gray-400'
                      : 'text-gray-400 hover:text-white hover:bg-dark-700/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {isLocked && <span className="text-gray-600 ml-0.5">🔒</span>}
                  {hasUnread && !isLocked && (
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
            {/* Tier Badge */}
            <button
              onClick={() => setActiveScreen('settings')}
              className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide border transition-all hover:opacity-80"
              style={{
                color: getTierConfig(userRole).color,
                borderColor: getTierConfig(userRole).color + '60',
                backgroundColor: getTierConfig(userRole).color + '15',
              }}
            >
              {getTierConfig(userRole).name}
            </button>
            {/* Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative px-3 py-1.5 text-gray-400 hover:text-white transition-all"
              >
                <Bell className="w-4 h-4" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red rounded-full text-white text-[9px] font-bold flex items-center justify-center">
                    {Math.min(notifications.filter(n => !n.read).length, 9)}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto glass rounded-lg border border-white/10 z-50 p-3 shadow-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white">Notifications</h3>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => setNotifications(prev => prev.map(n => ({...n, read: true})))}
                        className="text-xs text-cyan hover:text-cyan/80 transition-all"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">No notifications</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`p-2 rounded mb-1 ${n.read ? 'opacity-50' : 'bg-white/5'} hover:bg-white/10 transition-all`}>
                        <p className="text-xs text-white">{n.message}</p>
                        <p className="text-[10px] text-gray-500 mt-1">{new Date(n.timestamp).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => signOut()}
              className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white hover:bg-dark-700/50 rounded transition-all"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* UPGRADE MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setShowUpgradeModal(false)}>
          <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Upgrade to unlock <span className="text-cyan">{lockedFeature}</span></h2>
                <p className="text-sm text-gray-400 mt-1">Choose the plan that fits your operation</p>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="text-gray-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TIER_DESCRIPTIONS.map(tier => (
                <div key={tier.role} className="border rounded-xl p-5 transition-all hover:border-opacity-80 cursor-pointer"
                  style={{ borderColor: tier.color + '40', backgroundColor: tier.color + '08' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-white text-lg">{tier.name}</span>
                    <span className="font-bold" style={{ color: tier.color }}>${tier.price}<span className="text-xs text-gray-400 font-normal">/mo</span></span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{tier.tagline}</p>
                  <ul className="space-y-1.5 mb-3">
                    {tier.perks.map(p => (
                      <li key={p} className="text-xs text-gray-300 flex items-start gap-2">
                        <span style={{ color: tier.color }} className="mt-0.5">✓</span>{p}
                      </li>
                    ))}
                  </ul>
                  {tier.locked.length > 0 && (
                    <ul className="space-y-1">
                      {tier.locked.map(l => (
                        <li key={l} className="text-xs text-gray-600 flex items-start gap-2">
                          <span className="mt-0.5">✗</span>{l}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 text-center mt-6">Contact <span className="text-cyan">mazeratirecords@gmail.com</span> to upgrade your plan</p>
          </div>
        </div>
      )}

      {/* SCREEN 1: DASHBOARD */}
      {activeScreen === 'dashboard' && (
        <>
          {/* Stats Bar */}
          <div className="absolute left-4 right-4 top-[184px] z-30 glass rounded-lg px-6 py-4 flex gap-6 overflow-x-auto flex-nowrap">
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

          {/* Dashboard Tab Bar */}
          <div className="absolute left-4 right-4 top-[276px] z-30 flex gap-2">
            <button
              onClick={() => setDashboardTab('overview')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${
                dashboardTab === 'overview'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'glass text-gray-300 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setDashboardTab('storm-leads')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${
                dashboardTab === 'storm-leads'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'glass text-gray-300 hover:text-white'
              }`}
            >
              Storm Damage Leads
            </button>
            <button
              onClick={() => setDashboardTab('michael-leads')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${
                dashboardTab === 'michael-leads'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'glass text-gray-300 hover:text-white'
              }`}
            >
              Michael AI Leads
            </button>
            <button
              onClick={() => setDashboardTab('historical')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${
                dashboardTab === 'historical'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'glass text-gray-300 hover:text-white'
              }`}
            >
              Historical Weather
            </button>
            <button
              onClick={() => setDashboardTab('analytics')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold uppercase transition-all ${
                dashboardTab === 'analytics'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'glass text-gray-300 hover:text-white'
              }`}
            >
              Analytics
            </button>
          </div>

          {/* OVERVIEW TAB */}
          {dashboardTab === 'overview' && (
            <>
              {/* Left Panel */}
              <div className="absolute left-4 top-[324px] bottom-16 w-80 glass rounded-lg p-6 overflow-y-auto space-y-3 z-30">
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
              <div className="absolute left-96 right-96 top-[324px] h-80 z-30">
                <PropertyGraph properties={properties} center={mapCenter} />
              </div>

              {/* Right Panel */}
              <div className="absolute right-4 top-[324px] bottom-16 w-72 glass rounded-lg p-6 overflow-y-auto space-y-3 z-30">
                {/* Search Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setDashboardSearchMode('zip')}
                    className={`flex-1 text-xs font-semibold uppercase px-3 py-2 rounded-lg transition-all ${
                      dashboardSearchMode === 'zip'
                        ? 'bg-cyan text-dark'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    By ZIP Code
                  </button>
                  <button
                    onClick={() => setDashboardSearchMode('address')}
                    className={`flex-1 text-xs font-semibold uppercase px-3 py-2 rounded-lg transition-all ${
                      dashboardSearchMode === 'address'
                        ? 'bg-cyan text-dark'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    By Address
                  </button>
                </div>

                {/* Search Input */}
                <input
                  type="text"
                  placeholder={dashboardSearchMode === 'zip' ? 'Enter ZIP code...' : 'Enter address...'}
                  value={dashboardSearchQuery}
                  onChange={(e) => setDashboardSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dashboardSearchQuery.trim()) {
                      if (dashboardSearchMode === 'zip') {
                        setActiveScreen('territory')
                        setTerritoryFilter('all')
                      } else {
                        setSweepAddress(dashboardSearchQuery)
                        setActiveScreen('sweep')
                      }
                    }
                  }}
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50 mb-3"
                />

                {/* Weather by ZIP Section */}
                <div className="border-t border-white/5 pt-3">
                  <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">Weather Lookup</h3>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="Enter ZIP code..."
                      value={weatherZip}
                      onChange={(e) => setWeatherZip(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleWeatherZipLookup()}
                      className="flex-1 bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                    />
                    <button
                      onClick={handleWeatherZipLookup}
                      className="bg-cyan/20 hover:bg-cyan/30 text-cyan px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                    >
                      Update
                    </button>
                  </div>

                  {/* Current Weather Display */}
                  {dashWeather && (
                    <div className="bg-dark-700/50 rounded-lg p-3 mb-3">
                      <p className="text-xs font-semibold text-white">{dashWeather.temperature_f}°F</p>
                      <p className="text-xs text-gray-400">{dashWeather.conditions}</p>
                    </div>
                  )}

                  {/* Severe Weather Alerts */}
                  {dashAlerts.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold text-red mb-2">ACTIVE ALERTS</h4>
                      {dashAlerts.slice(0, 3).map((alert, idx) => (
                        <div key={idx} className="bg-red/10 border border-red/30 rounded-lg p-2 mb-2 text-xs">
                          <p className="text-red font-semibold">{alert.event}</p>
                          <p className="text-gray-400 text-[10px]">{alert.description}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-gray-500 text-center py-2">Powered by StormScope</div>
                </div>

                {/* Property Hub - Card Grid */}
                <div className="border-t border-white/5 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Property Hub</h3>
                    {properties.length > 8 && (
                      <button
                        onClick={() => setActiveScreen('territory')}
                        className="text-xs text-cyan hover:underline"
                      >
                        View All
                      </button>
                    )}
                  </div>
                  {properties.length === 0 ? (
                    <p className="text-sm text-gray-400">No properties yet</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {properties.slice(0, 8).map(p => {
                        const score = calculateLeadScore(p)
                        const isHot = score >= 70
                        return (
                          <div
                            key={p.id}
                            className="glass rounded-lg p-3 cursor-pointer hover:border-cyan/30 border border-transparent transition-all"
                            onClick={() => { setSelectedProperty(p) }}
                          >
                            {p.satellite_image_url && (
                              <img src={p.satellite_image_url} alt="" className="w-full h-20 object-cover rounded mb-2" />
                            )}
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-white font-medium truncate flex-1">{p.address?.split(',')[0]}</p>
                              <span className={`text-xs font-bold ml-1 ${isHot ? 'text-red-400' : score >= 50 ? 'text-amber-400' : 'text-green-400'}`}>{score}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {p.roof_age_years && <span className="text-[10px] text-gray-400">{p.roof_age_years}yr roof</span>}
                              {p.sqft && <span className="text-[10px] text-cyan">{p.sqft.toLocaleString()} sqft</span>}
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

          {/* STORM DAMAGE LEADS TAB */}
          {dashboardTab === 'storm-leads' && (
            <div className="absolute left-4 right-4 top-[324px] bottom-16 glass rounded-lg p-6 overflow-y-auto z-30">
              <h2 className="text-lg font-semibold text-cyan mb-4">Storm Damage Leads</h2>
              <div className="space-y-3">
                {properties
                  .filter(p =>
                    p.storm_history?.stormRiskLevel === 'high' ||
                    p.storm_history?.stormRiskLevel === 'moderate' ||
                    (p.storm_history?.severeHailCount || 0) >= 2
                  )
                  .map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProperty(p)
                      }}
                      className="bg-dark-700/50 hover:bg-dark-700/80 rounded-lg p-4 cursor-pointer transition-all border border-white/5 hover:border-cyan/30"
                    >
                      <p className="font-semibold text-white mb-2">{p.address}</p>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {p.storm_history?.stormRiskLevel && (
                          <span className={`text-xs px-2 py-1 rounded font-semibold ${
                            p.storm_history.stormRiskLevel === 'high' ? 'bg-red/20 text-red' : 'bg-amber/20 text-amber'
                          }`}>
                            {p.storm_history.stormRiskLevel.toUpperCase()}
                          </span>
                        )}
                        {p.storm_history?.severeHailCount && p.storm_history.severeHailCount > 0 && (
                          <span className="text-xs bg-blue/20 text-blue px-2 py-1 rounded font-semibold">
                            {p.storm_history.severeHailCount} HAIL EVENTS
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        {p.storm_history?.maxHailSize && (
                          <p>Max Hail: {p.storm_history.maxHailSize}</p>
                        )}
                        {p.storm_history?.totalTornadoEvents && p.storm_history.totalTornadoEvents > 0 && (
                          <p>Tornado Events: {p.storm_history.totalTornadoEvents}</p>
                        )}
                        {p.storm_history?.totalWindEvents && p.storm_history.totalWindEvents > 0 && (
                          <p>Wind Events: {p.storm_history.totalWindEvents}</p>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                        <span className="text-xs text-gray-400">Lead Score</span>
                        <span className={`text-sm font-bold ${calculateLeadScore(p) >= 70 ? 'text-green' : calculateLeadScore(p) >= 50 ? 'text-amber' : 'text-gray-400'}`}>
                          {calculateLeadScore(p)}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="text-xs text-gray-500 text-center mt-6 pt-4 border-t border-white/5">Powered by StormScope</div>
            </div>
          )}

          {/* MICHAEL AI LEADS TAB */}
          {dashboardTab === 'michael-leads' && (
            <div className="absolute left-4 right-4 top-[324px] bottom-16 glass rounded-lg p-6 overflow-y-auto z-30">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-cyan">Michael's Daily Picks</h2>
                <button
                  onClick={runMichaelLeadEngine}
                  disabled={michaelLeadsLoading}
                  className="bg-cyan/20 hover:bg-cyan/30 disabled:bg-gray-700 text-cyan disabled:text-gray-400 px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                >
                  {michaelLeadsLoading ? 'Analyzing...' : 'Refresh'}
                </button>
              </div>

              <p className="text-sm text-gray-400 mb-4">
                Michael analyzes storm damage zones, roof age, property values, recent weather events, and market conditions to identify the highest-probability leads each day.
              </p>

              {michaelLeads.length === 0 ? (
                <button
                  onClick={runMichaelLeadEngine}
                  className="w-full bg-cyan/20 hover:bg-cyan/30 text-cyan px-4 py-2 rounded-lg font-semibold transition-all"
                >
                  Generate Leads
                </button>
              ) : (
                <div className="space-y-3">
                  {michaelLeads.map((lead, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSweepAddress(lead.address)
                        setActiveScreen('sweep')
                      }}
                      className="bg-dark-700/50 hover:bg-dark-700/80 rounded-lg p-4 cursor-pointer transition-all border border-white/5 hover:border-cyan/30"
                    >
                      <p className="font-semibold text-white mb-2">{lead.address}</p>
                      <p className="text-xs text-gray-400 mb-3">{lead.reason}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-xs bg-cyan/20 text-cyan px-2 py-1 rounded font-semibold">
                          SCORE: {lead.score}
                        </span>
                        <span className="text-xs bg-dark-700 text-gray-400 px-2 py-1 rounded">
                          {lead.source}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-xs text-gray-500 text-center mt-6 pt-4 border-t border-white/5">Powered by Michael AI</div>
            </div>
          )}

          {/* HISTORICAL WEATHER TAB */}
          {dashboardTab === 'historical' && (
            <div className="absolute left-4 right-4 top-[324px] bottom-16 glass rounded-lg p-6 overflow-y-auto z-30">
              <h2 className="text-lg font-semibold text-cyan mb-4">Historical Hail Events (Past Year)</h2>

              {hailEvents.length === 0 ? (
                <p className="text-gray-400">No hail events recorded</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-dark-700/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Total Events</p>
                      <p className="text-2xl font-bold text-cyan">{hailEvents.length}</p>
                    </div>
                    <div className="bg-dark-700/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Max Hail Size</p>
                      <p className="text-2xl font-bold text-amber">
                        {Math.max(...hailEvents.map(e => parseFloat(e.hail_size) || 0)).toFixed(1)}"
                      </p>
                    </div>
                    <div className="bg-dark-700/50 rounded-lg p-3">
                      <p className="text-xs text-gray-400">Avg Hail Size</p>
                      <p className="text-2xl font-bold text-green">
                        {(hailEvents.reduce((sum, e) => sum + (parseFloat(e.hail_size) || 0), 0) / hailEvents.length).toFixed(2)}"
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {hailEvents.slice(0, 20).map((event, idx) => (
                      <div key={idx} className="bg-dark-700/50 rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-semibold text-white">{event.event_date || event.date || 'Unknown Date'}</p>
                          <span className="text-xs bg-red/20 text-red px-2 py-1 rounded font-semibold">
                            {event.hail_size || '?'}"
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{event.location || 'Location unknown'}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="text-xs text-gray-500 text-center mt-6 pt-4 border-t border-white/5">Powered by StormScope</div>
            </div>
          )}

          {/* ANALYTICS TAB */}
          {dashboardTab === 'analytics' && (
            <div className="absolute left-4 right-4 top-[324px] bottom-16 glass rounded-lg p-6 overflow-y-auto z-30">
              <h2 className="text-lg font-semibold text-cyan mb-6">Analytics & Reporting</h2>

              {/* Calculate metrics from existing data */}
              {(() => {
                const analytics = {
                  totalRevenue: jobs.filter(j => j.stage === 'collected').reduce((sum, j) => sum + (j.contract_amount || 0), 0),
                  pendingRevenue: jobs.filter(j => j.stage !== 'collected' && j.stage !== 'sold').reduce((sum, j) => sum + (j.contract_amount || 0), 0),
                  totalJobs: jobs.length,
                  completedJobs: jobs.filter(j => j.stage === 'collected' || j.stage === 'final_inspection').length,
                  avgJobValue: jobs.length > 0 ? jobs.reduce((sum, j) => sum + (j.contract_amount || 0), 0) / jobs.length : 0,
                  totalClients: clients.length,
                  conversionRate: clients.length > 0 ? (clients.filter(c => c.status === 'complete').length / clients.length * 100) : 0,
                  proposalsSent: proposals.filter(p => p.status === 'sent' || p.status === 'accepted').length,
                  proposalsAccepted: proposals.filter(p => p.status === 'accepted').length,
                  closeRate: proposals.filter(p => p.status === 'sent' || p.status === 'accepted').length > 0
                    ? (proposals.filter(p => p.status === 'accepted').length / proposals.filter(p => p.status === 'sent' || p.status === 'accepted').length * 100) : 0,
                  propertiesScanned: properties.length,
                  hotLeads: properties.filter(p => calculateLeadScore(p) >= 70).length,
                }

                return (
                  <>
                    {/* Row 1: Revenue Metrics */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Total Revenue</p>
                        <p className="text-3xl font-bold text-cyan">${(analytics.totalRevenue / 1000).toFixed(0)}k</p>
                      </div>
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Pending Revenue</p>
                        <p className="text-3xl font-bold text-amber">${(analytics.pendingRevenue / 1000).toFixed(0)}k</p>
                      </div>
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Avg Job Value</p>
                        <p className="text-3xl font-bold text-green">${(analytics.avgJobValue / 1000).toFixed(1)}k</p>
                      </div>
                    </div>

                    {/* Row 2: Job Metrics */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Total Jobs</p>
                        <p className="text-3xl font-bold text-cyan">{analytics.totalJobs}</p>
                      </div>
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Completed Jobs</p>
                        <p className="text-3xl font-bold text-green">{analytics.completedJobs}</p>
                      </div>
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Close Rate %</p>
                        <p className="text-3xl font-bold text-cyan">{analytics.closeRate.toFixed(0)}%</p>
                      </div>
                    </div>

                    {/* Row 3: Lead & Client Metrics */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Properties Scanned</p>
                        <p className="text-3xl font-bold text-cyan">{analytics.propertiesScanned}</p>
                      </div>
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Hot Leads (70+)</p>
                        <p className="text-3xl font-bold text-red">{analytics.hotLeads}</p>
                      </div>
                      <div className="glass rounded-lg p-4 border border-white/10">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Conversion Rate %</p>
                        <p className="text-3xl font-bold text-green">{analytics.conversionRate.toFixed(0)}%</p>
                      </div>
                    </div>

                    {/* Pipeline Breakdown */}
                    <div className="glass rounded-lg p-4 border border-white/10 mt-6">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Pipeline Breakdown</h3>
                      <div className="space-y-3">
                        {JOB_STAGES.map((stage) => {
                          const stageCount = jobs.filter(j => j.stage === stage.key).length
                          const percentage = jobs.length > 0 ? (stageCount / jobs.length) * 100 : 0
                          return (
                            <div key={stage.key}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-white">{stage.label}</span>
                                <span className="text-xs text-gray-400">{stageCount}</span>
                              </div>
                              <div className="w-full bg-dark-700/50 rounded-full h-2">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${percentage}%`, backgroundColor: stage.color || '#22d3ee' }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

          {/* Bottom Control Timeline */}
          <div className="absolute bottom-4 left-4 right-4 z-30 glass px-6 py-3 rounded-lg flex items-center justify-between h-14">
            <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Timeline View</span>

            {/* Control Icons */}
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => {
                  const views: Array<'month' | 'week' | 'day'> = ['month', 'week', 'day']
                  const current = views.indexOf(timelineView)
                  setTimelineView(views[(current + 1) % views.length])
                }}
                className="w-8 h-8 rounded-lg bg-dark-700/50 hover:bg-dark-700 flex items-center justify-center transition-all"
                title="Cycle timeline view"
              >
                <Clock className="w-4 h-4 text-gray-400" />
              </button>
              <button
                onClick={() => setTimelinePlaying(!timelinePlaying)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  timelinePlaying ? 'bg-cyan/20 text-cyan' : 'bg-dark-700/50 text-gray-400 hover:bg-dark-700'
                }`}
                title="Toggle auto-play animation"
              >
                {timelinePlaying ? (
                  <div className="w-1 h-1 bg-cyan rounded-full" />
                ) : (
                  <div className="w-1.5 h-1.5 bg-gray-400" />
                )}
              </button>
              <button
                onClick={() => {
                  setTimelineView('day')
                  setTimelinePlaying(false)
                }}
                className="w-8 h-8 rounded-lg bg-dark-700/50 hover:bg-dark-700 flex items-center justify-center transition-all"
                title="Jump to today"
              >
                <div className="w-1.5 h-1.5 bg-gray-400" style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }} />
              </button>
              <button
                onClick={() => {
                  handleWeatherZipLookup()
                  runMichaelLeadEngine()
                }}
                className="w-8 h-8 rounded-lg bg-cyan/20 hover:bg-cyan/30 flex items-center justify-center transition-all"
                title="Quick refresh all dashboard data"
              >
                <Zap className="w-4 h-4 text-cyan" />
              </button>
            </div>
          </div>

          {/* PropertyCard Modal */}
          {selectedProperty && (
            <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
              <div className="bg-dark-700 rounded-lg p-8 max-w-md w-full max-h-96 overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-white">{selectedProperty.address}</h2>
                  <button
                    onClick={() => setSelectedProperty(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Lead Score</span>
                    <span className="font-bold text-cyan">{calculateLeadScore(selectedProperty)}</span>
                  </div>
                  {selectedProperty.roof_age_years && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Roof Age</span>
                      <span className="font-bold text-amber">{selectedProperty.roof_age_years} years</span>
                    </div>
                  )}
                  {selectedProperty.market_value && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Market Value</span>
                      <span className="font-bold text-green">${(selectedProperty.market_value / 1000).toFixed(0)}k</span>
                    </div>
                  )}
                  {selectedProperty.storm_history?.stormRiskLevel && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Storm Risk</span>
                      <span className={`font-bold ${selectedProperty.storm_history.stormRiskLevel === 'high' ? 'text-red' : 'text-amber'}`}>
                        {selectedProperty.storm_history.stormRiskLevel.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSweepAddress(selectedProperty.address)
                    setSelectedProperty(null)
                    setActiveScreen('sweep')
                  }}
                  className="w-full mt-6 bg-cyan/20 hover:bg-cyan/30 text-cyan px-4 py-2 rounded-lg font-semibold transition-all"
                >
                  View Details
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* SCREEN 2: TERRITORY */}
      {activeScreen === 'territory' && (
        <>
          {/* Left Panel */}
          <div className="absolute left-4 top-[184px] bottom-4 w-80 overflow-y-auto space-y-3 z-30">
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

              {/* GeoJSON Toggle Buttons */}
              {properties.length > 0 && (
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => handleGeoJsonToggle('territory')}
                    disabled={geoJsonLoading}
                    className={`flex-1 text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-50 ${
                      geoJsonMode === 'territory'
                        ? 'bg-cyan-500/30 text-cyan-400 border-cyan-500/40'
                        : 'bg-white/10 text-white/60 border-white/20 hover:bg-white/20'
                    }`}
                  >
                    {geoJsonLoading && geoJsonMode !== 'territory' ? '...' : 'Territory Zone'}
                  </button>
                  <button
                    onClick={() => handleGeoJsonToggle('heatzone')}
                    disabled={geoJsonLoading}
                    className={`flex-1 text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-50 ${
                      geoJsonMode === 'heatzone'
                        ? 'bg-amber-500/30 text-amber-400 border-amber-500/40'
                        : 'bg-white/10 text-white/60 border-white/20 hover:bg-white/20'
                    }`}
                  >
                    {geoJsonLoading && geoJsonMode !== 'heatzone' ? '...' : 'Score Heatmap'}
                  </button>
                </div>
              )}

              {/* Avoid Tolls Toggle */}
              {properties.length >= 2 && (
                <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer mb-2">
                  <input type="checkbox" checked={avoidTolls} onChange={(e) => setAvoidTolls(e.target.checked)}
                    className="accent-cyan-500" />
                  Avoid tolls
                </label>
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
                  <div className="text-xs text-white/60 mb-1">{routeResult.totalDistanceMiles} miles • ~{routeResult.totalDurationMinutes} min</div>
                  {routeResult.tollCost && (
                    <div className="text-xs text-amber-400 mb-1">Est. tolls: {routeResult.tollCost}</div>
                  )}
                  {routeResult.trafficAware && (
                    <div className="text-xs text-green-400/60 mb-2">Traffic-aware routing</div>
                  )}
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

              {/* Route Error */}
              {routeError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-300">{routeError}</p>
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
                        className="bg-dark-700/50 rounded-lg p-3 hover:bg-dark-700 transition-all"
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedProperty(prop)}>
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
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteProperty(prop.id) }}
                              className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                              title="Remove from territory"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
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
            <div className="absolute inset-4 top-[184px] z-30 flex items-center justify-center">
              <div className="max-w-2xl w-full relative">
                <button
                  onClick={() => setSelectedProperty(null)}
                  className="absolute top-4 right-4 z-40 p-2 hover:bg-dark-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
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
          <div className="absolute left-4 top-[184px] bottom-4 w-96 overflow-y-auto space-y-3 z-30">
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
                  onChange={(e) => { setSweepAddress(e.target.value); setSweepError(null) }}
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

                {sweepError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">{sweepError}</p>
                )}

                {sweepLocationAccuracy && (
                  <p className="text-xs text-gray-400 text-center">
                    Location accuracy: ±{Math.round(sweepLocationAccuracy)}m
                  </p>
                )}

                {/* Pin drop hint */}
                <div className="bg-amber/10 border border-amber/20 rounded-lg px-3 py-2 text-xs text-amber/80 flex items-center gap-2">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <span>Tap the map to drop a pin and sweep 0.5mi residential radius</span>
                </div>

                {pinDropLat && pinDropLng && (
                  <div className="bg-dark-700/50 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                    <span className="text-gray-400">Pin: {pinDropLat.toFixed(4)}, {pinDropLng.toFixed(4)}</span>
                    <button onClick={() => { setPinDropLat(null); setPinDropLng(null); setSweepUserLocation(null); }} className="text-red hover:text-red/80 ml-2">✕</button>
                  </div>
                )}

                {/* Path Tracking */}
                <div className="pt-3 border-t border-white/10">
                  <button
                    onClick={() => setPathTrackingActive(!pathTrackingActive)}
                    className={`w-full text-sm px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                      pathTrackingActive
                        ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400'
                        : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'
                    }`}
                  >
                    <Navigation className="w-4 h-4" />
                    {pathTrackingActive ? 'Stop Tracking' : 'Track My Path'}
                  </button>
                  {sweepPath.length >= 2 && (
                    <button
                      onClick={handleSnapToRoads}
                      disabled={snapLoading}
                      className="w-full mt-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-400 text-sm px-3 py-2 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {snapLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🗺</span>}
                      {snapLoading ? 'Snapping...' : `Snap to Roads (${sweepPath.length})`}
                    </button>
                  )}
                  {snappedPath.length > 0 && (
                    <p className="mt-2 text-xs text-green-400 text-center">
                      ✓ Path snapped to {snappedPath.length} road points
                    </p>
                  )}
                </div>

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

            {/* Residential Search */}
            <div className="glass p-6 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-cyan" />
                <h2 className="text-lg font-heading font-semibold">Residential Search</h2>
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
                        onClick={() => setResidentialRadius(r.value)}
                        className={`flex-1 text-xs px-2 py-1.5 rounded transition-all ${
                          residentialRadius === r.value
                            ? 'bg-cyan text-dark font-medium'
                            : 'bg-dark-700 text-gray-300 hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSearchResidential}
                  disabled={residentialLoading}
                  className="w-full bg-cyan text-dark font-medium py-2 rounded-lg hover:bg-cyan/90 transition-all disabled:opacity-50"
                >
                  {residentialLoading ? 'Searching...' : 'Find Residential Leads'}
                </button>

                {residentialResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    <p className="text-xs text-gray-400 font-semibold">Results: {residentialResults.length}</p>
                    {residentialResults.map(place => (
                      <div key={place.id} className="bg-dark-700/50 rounded-lg p-3 text-sm space-y-2">
                        <p className="text-white font-medium truncate">{place.name || 'Residential Property'}</p>
                        <p className="text-xs text-gray-400 truncate">{place.address || '—'}</p>
                        {place.phone && (
                          <p className="text-xs text-cyan">{place.phone}</p>
                        )}
                        <button
                          onClick={() => handleAddResidentialLead(place)}
                          className="w-full bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/30 text-xs px-2 py-1.5 rounded transition-all"
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
                        <div
                          key={prop.id}
                          className="bg-dark-700/50 rounded-lg p-3 text-sm cursor-pointer hover:bg-dark-700 transition-all"
                          onClick={() => {
                            setMapCenter({ lat: prop.lat, lng: prop.lng })
                            setMapZoom(18)
                            setSelectedProperty(prop)
                          }}
                        >
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
          <div className="absolute left-4 top-[184px] bottom-4 w-80 overflow-y-auto space-y-3 z-30">
            {/* StormScope Animated Header */}
            <div className="relative mb-4 p-4 rounded-xl overflow-hidden" style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.1) 0%, rgba(13,17,23,0.95) 50%, rgba(6,182,212,0.05) 100%)',
              border: '1px solid rgba(6,182,212,0.2)',
            }}>
              {/* Pulsing glow effect */}
              <div className="absolute inset-0 opacity-30" style={{
                background: 'radial-gradient(ellipse at 30% 50%, rgba(6,182,212,0.3), transparent 70%)',
                animation: 'stormPulse 3s ease-in-out infinite',
              }} />
              <div className="absolute inset-0 opacity-20" style={{
                background: 'radial-gradient(ellipse at 70% 50%, rgba(34,211,238,0.2), transparent 60%)',
                animation: 'stormPulse 3s ease-in-out infinite 1.5s',
              }} />

              <div className="relative z-10 flex items-center gap-4">
                <div className="relative">
                  {/* Glowing ring around logo */}
                  <div className="absolute -inset-1 rounded-xl opacity-60" style={{
                    background: 'conic-gradient(from 0deg, #06b6d4, #22d3ee, #0891b2, #06b6d4)',
                    animation: 'stormSpin 4s linear infinite',
                    filter: 'blur(4px)',
                  }} />
                  <Image
                    src="/stormscope-icon.png"
                    alt="StormScope"
                    width={56}
                    height={56}
                    className="relative rounded-xl"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight" style={{
                    textShadow: '0 0 20px rgba(6,182,212,0.5), 0 0 40px rgba(6,182,212,0.2)',
                  }}>StormScope</h2>
                  <p className="text-xs text-cyan/70">10-Year NOAA Storm Intelligence • Nationwide Coverage</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" style={{
                    animation: 'stormPulse 2s ease-in-out infinite',
                    boxShadow: '0 0 8px rgba(74,222,128,0.6)',
                  }} />
                  <span className="text-xs text-green-400">LIVE</span>
                </div>
              </div>
            </div>

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
              <h3 className="text-sm font-semibold mb-3">NOAA Hail Events (10y)</h3>
              <p className="text-lg font-bold text-amber mb-3">{hailEvents.length} events</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {hailEvents.slice(0, 5).map((event, idx) => (
                  <div key={idx} className="bg-dark-700/50 rounded-lg p-2 text-xs">
                    <p className="font-medium text-white">{event.size ? `${event.size.toFixed(2)}" hail` : 'Hail'}</p>
                    <p className="text-gray-400">{event.date}</p>
                    <p className="text-amber">{event.severity}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* HWEL — Historical Weather Event Library */}
            <div className="glass p-5 rounded-xl border border-cyan/20" style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.05), rgba(13,17,23,0.9))',
            }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-cyan tracking-wide">HWEL DATABASE</h3>
                  <p className="text-[10px] text-gray-500">Historical Weather Event Library • 10yr</p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
                  <span className="text-[10px] text-cyan/70">ARCHIVE</span>
                </div>
              </div>

              {hwelLoading ? (
                <div className="py-4 text-center">
                  <Loader2 className="w-5 h-5 text-cyan animate-spin mx-auto" />
                  <p className="text-[10px] text-gray-500 mt-1">Loading archive...</p>
                </div>
              ) : hwelData?.summary ? (
                <>
                  {/* HWEL Tabs */}
                  <div className="flex gap-1 mb-3 bg-dark-700/50 p-1 rounded-lg">
                    {([
                      { key: 'summary', label: 'Summary' },
                      { key: 'timeline', label: 'Timeline' },
                      { key: 'events', label: 'Events' },
                    ] as const).map(t => (
                      <button
                        key={t.key}
                        onClick={() => setHwelTab(t.key)}
                        className={`flex-1 py-1.5 text-[10px] font-semibold rounded transition-all ${
                          hwelTab === t.key ? 'bg-cyan text-dark' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {hwelTab === 'summary' && (
                    <div className="space-y-2">
                      <div className={`p-3 rounded-lg border ${
                        hwelData.summary.riskLevel === 'Critical' ? 'bg-red-500/10 border-red-500/30' :
                        hwelData.summary.riskLevel === 'High' ? 'bg-amber-500/10 border-amber-500/30' :
                        hwelData.summary.riskLevel === 'Moderate' ? 'bg-yellow-500/10 border-yellow-500/30' :
                        'bg-green-500/10 border-green-500/30'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Risk Level</span>
                          <span className={`text-lg font-bold ${
                            hwelData.summary.riskLevel === 'Critical' ? 'text-red-400' :
                            hwelData.summary.riskLevel === 'High' ? 'text-amber' :
                            hwelData.summary.riskLevel === 'Moderate' ? 'text-yellow-400' :
                            'text-green-400'
                          }`}>{hwelData.summary.riskLevel}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1">Score: {hwelData.summary.riskScore} • {hwelData.summary.totalEvents} total events</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-dark-700/50 rounded-lg p-2">
                          <p className="text-[10px] text-gray-500">Hail Events</p>
                          <p className="text-lg font-bold text-amber">{hwelData.summary.hailEvents}</p>
                          <p className="text-[10px] text-gray-500">{hwelData.summary.severeHailEvents} severe (2"+)</p>
                        </div>
                        <div className="bg-dark-700/50 rounded-lg p-2">
                          <p className="text-[10px] text-gray-500">Tornadoes</p>
                          <p className="text-lg font-bold text-red-400">{hwelData.summary.tornadoEvents}</p>
                          <p className="text-[10px] text-gray-500">confirmed</p>
                        </div>
                        <div className="bg-dark-700/50 rounded-lg p-2">
                          <p className="text-[10px] text-gray-500">High Wind</p>
                          <p className="text-lg font-bold text-cyan">{hwelData.summary.windEvents}</p>
                          <p className="text-[10px] text-gray-500">reports</p>
                        </div>
                        <div className="bg-dark-700/50 rounded-lg p-2">
                          <p className="text-[10px] text-gray-500">Max Hail</p>
                          <p className="text-lg font-bold text-amber">{hwelData.summary.maxHailSize.toFixed(2)}"</p>
                          <p className="text-[10px] text-gray-500">diameter</p>
                        </div>
                      </div>

                      {hwelData.summary.peakMonths?.length > 0 && (
                        <div className="bg-dark-700/50 rounded-lg p-2 mt-2">
                          <p className="text-[10px] text-gray-500 mb-1">Peak Storm Months</p>
                          <div className="flex gap-1">
                            {hwelData.summary.peakMonths.map((m: any, i: number) => (
                              <div key={i} className="flex-1 bg-cyan/10 rounded px-2 py-1 text-center">
                                <p className="text-xs font-bold text-cyan">{m.month}</p>
                                <p className="text-[10px] text-gray-500">{m.count}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {hwelTab === 'timeline' && hwelData.yearSummary && (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {Object.entries(hwelData.yearSummary)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .map(([year, stats]: [string, any]) => {
                          const maxTotal = Math.max(...Object.values(hwelData.yearSummary).map((s: any) => s.total))
                          const pct = maxTotal > 0 ? (stats.total / maxTotal) * 100 : 0
                          return (
                            <div key={year} className="bg-dark-700/50 rounded-lg p-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-white">{year}</span>
                                <span className="text-xs text-cyan">{stats.total} events</span>
                              </div>
                              <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-cyan to-amber" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex gap-2 mt-1 text-[10px] text-gray-500">
                                {stats.hail > 0 && <span>🧊 {stats.hail}</span>}
                                {stats.tornado > 0 && <span className="text-red-400">🌀 {stats.tornado}</span>}
                                {stats.wind > 0 && <span>💨 {stats.wind}</span>}
                                {stats.radar_hail > 0 && <span className="text-amber">📡 {stats.radar_hail}</span>}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )}

                  {hwelTab === 'events' && hwelData.events && (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {hwelData.events.slice(0, 30).map((e: any, i: number) => (
                        <div key={i} className="bg-dark-700/50 rounded-lg p-2 border-l-2"
                          style={{
                            borderColor: e.type === 'tornado' ? '#ef4444' :
                                        e.type === 'hail' || e.type === 'radar_hail' ? '#f59e0b' :
                                        e.type === 'mesocyclone' ? '#a855f7' : '#06b6d4'
                          }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-white capitalize">
                                {e.type === 'radar_hail' ? '📡 Radar Hail' :
                                 e.type === 'mesocyclone' ? '🌀 Mesocyclone' :
                                 e.type === 'tornado' ? '🌪️ Tornado' :
                                 e.type === 'hail' ? '🧊 Hail' :
                                 '💨 Wind'}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">{e.description}</p>
                              {(e.city || e.state) && (
                                <p className="text-[10px] text-gray-500">{[e.city, e.state].filter(Boolean).join(', ')}</p>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 whitespace-nowrap">
                              {e.date ? e.date.substring(0, 4) + '-' + e.date.substring(4, 6) + '-' + e.date.substring(6, 8) : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                      {hwelData.events.length > 30 && (
                        <p className="text-[10px] text-center text-gray-500 py-2">
                          + {hwelData.events.length - 30} more events in database
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-500 text-center py-4">
                  Search a location to load historical data
                </p>
              )}
            </div>
          </div>

          {/* Right Panel */}
          <div className="absolute right-4 top-[184px] bottom-4 w-72 overflow-y-auto space-y-3 z-30">
            {/* Location Search */}
            <div className="glass p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-cyan" />
                <span className="text-sm font-semibold">Search Location</span>
              </div>
              <input
                type="text"
                placeholder="City, ZIP, or address..."
                value={stormLocation}
                onChange={(e) => setStormLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStormLocationSearch(stormLocation)}
                className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
              />
              <button
                onClick={() => handleStormLocationSearch(stormLocation)}
                className="w-full mt-2 bg-cyan text-dark text-xs font-medium py-1.5 rounded-lg hover:bg-cyan/90 transition-all"
              >
                Search
              </button>
            </div>

            {/* Live Doppler Radar Toggle + Product Selector */}
            <div className="glass p-4 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan" />
                  <span className="text-sm font-semibold">Live Doppler Radar</span>
                </div>
                <button
                  onClick={() => setShowRadar(!showRadar)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${showRadar ? 'bg-cyan' : 'bg-dark-700'}`}
                >
                  <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${showRadar ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {showRadar && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-cyan/70">NOAA NEXRAD Doppler radar active</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { key: 'n0q' as const, label: 'HD Reflectivity', desc: '256-level (best)' },
                      { key: 'n0r' as const, label: 'Reflectivity', desc: 'Standard 16-level' },
                      { key: 'n0s' as const, label: 'Storm Velocity', desc: 'Wind speed/direction' },
                      { key: 'net' as const, label: 'Echo Tops', desc: 'Storm height' },
                    ].map(p => (
                      <button
                        key={p.key}
                        onClick={() => setRadarProduct(p.key)}
                        className={`text-left p-2 rounded-lg border transition-all text-xs ${
                          radarProduct === p.key
                            ? 'border-cyan bg-cyan/20 text-cyan'
                            : 'border-white/10 bg-dark-700/50 text-gray-400 hover:border-white/20'
                        }`}
                      >
                        <div className="font-semibold">{p.label}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
                  <p className="text-xs text-gray-400 mt-2">{stormRisk.eventCount} events in past 10 years</p>
                </div>
              )}
            </div>

            {/* Storm Impact Zones */}
            <div className="glass p-4 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Impact Zones</h3>
                <span className="text-xs text-gray-500">{stormImpactZones.length} saved</span>
              </div>
              {stormImpactZones.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500">No impact zones yet</p>
                  <p className="text-xs text-gray-600 mt-1">Search a ZIP in Michael AI and save it as an impact zone</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {stormImpactZones.map(zone => (
                    <div key={zone.zip} className="bg-dark-700/50 rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{zone.zip}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            zone.riskLevel === 'Critical' ? 'bg-red/20 text-red-400' :
                            zone.riskLevel === 'High' ? 'bg-amber/20 text-amber' :
                            zone.riskLevel === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-700 text-gray-400'
                          }`}>{zone.riskLevel}</span>
                        </div>
                        <p className="text-xs text-gray-400">{zone.city} · {zone.hailCount} hail · {zone.tornadoCount} tornado</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setMapCenter({ lat: zone.lat, lng: zone.lng })
                            setMapZoom(12)
                          }}
                          className="p-1.5 text-cyan hover:bg-cyan/10 rounded transition-all"
                          title="View on map"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const updated = stormImpactZones.filter(z => z.zip !== zone.zip)
                            setStormImpactZones(updated)
                            try { localStorage.setItem('directive_impact_zones', JSON.stringify(updated)) } catch { /* ignore */ }
                          }}
                          className="p-1.5 text-gray-500 hover:text-red-400 rounded transition-all"
                          title="Remove zone"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setActiveScreen('michael'); setMichaelTab('leads') }}
                className="w-full mt-3 text-xs py-1.5 bg-cyan/10 text-cyan border border-cyan/20 rounded hover:bg-cyan/20 transition-all"
              >
                + Add Impact Zone via Michael AI
              </button>
            </div>
          </div>
        </>
      )}

      {/* SCREEN 5: MICHAEL AI */}
      {activeScreen === 'michael' && (
        <div className="absolute inset-4 top-[184px] z-30 flex flex-col md:flex-row gap-4 overflow-y-auto md:overflow-hidden md:h-[calc(100vh-224px)]">

          {/* Left Panel — ZIP Lead Search */}
          <div className="w-full md:w-96 flex-shrink-0 glass rounded-xl p-6 flex flex-col gap-4 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyan/20 flex items-center justify-center border border-cyan/30">
                <Brain className="w-5 h-5 text-cyan" />
              </div>
              <div>
                <h2 className="font-bold text-white">Michael AI</h2>
                <p className="text-xs text-gray-400">ZIP Code Lead Engine</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green rounded-full animate-pulse" />
                <span className="text-xs text-green font-medium">Online</span>
              </div>
            </div>

            {/* ZIP Input */}
            <div className="space-y-2">
              <label className="text-xs text-gray-400 uppercase tracking-wide">Search by ZIP Code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={michaelZip}
                  onChange={e => setMichaelZip(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && michaelZip.trim().length >= 5) {
                      setMichaelLeadsLoading(true)
                      setMichaelLeads([])
                      setMichaelStormData(null)
                      authFetch('/api/michael/leads', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ zip: michaelZip.trim() }),
                      })
                        .then(r => r.json())
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .then((data: any) => {
                          setMichaelLeads(data.leads || [])
                          setMichaelStormData(data)
                          if (data.lat && data.lng) setMapCenter({ lat: data.lat, lng: data.lng })
                        })
                        .catch(console.error)
                        .finally(() => setMichaelLeadsLoading(false))
                    }
                  }}
                  placeholder="e.g. 35801"
                  maxLength={10}
                  className="flex-1 bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                />
                <button
                  disabled={michaelLeadsLoading || michaelZip.trim().length < 5}
                  onClick={() => {
                    setMichaelLeadsLoading(true)
                    setMichaelLeads([])
                    setMichaelStormData(null)
                    authFetch('/api/michael/leads', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ zip: michaelZip.trim() }),
                    })
                      .then(r => r.json())
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      .then((data: any) => {
                        setMichaelLeads(data.leads || [])
                        setMichaelStormData(data)
                        if (data.lat && data.lng) setMapCenter({ lat: data.lat, lng: data.lng })
                      })
                      .catch(console.error)
                      .finally(() => setMichaelLeadsLoading(false))
                  }}
                  className="bg-cyan text-dark px-4 py-2 rounded-lg font-bold text-sm hover:bg-cyan/90 transition-all disabled:opacity-50"
                >
                  {michaelLeadsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500">Michael analyzes 10 years of NOAA storm data to find your best roofing leads</p>
            </div>

            {/* Storm Summary Card */}
            {michaelStormData && (
              <div className={`rounded-lg p-4 border space-y-3 ${
                michaelStormData.riskLevel === 'Critical' ? 'bg-red/10 border-red/30' :
                michaelStormData.riskLevel === 'High' ? 'bg-amber/10 border-amber/30' :
                michaelStormData.riskLevel === 'Moderate' ? 'bg-yellow-500/10 border-yellow-500/30' :
                'bg-dark-700/50 border-white/10'
              }`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-bold text-white">{michaelStormData.zip} — {michaelStormData.city}{michaelStormData.state ? `, ${michaelStormData.state}` : ''}</p>
                    <p className="text-xs text-gray-400">{michaelStormData.yearsAnalyzed}-year NOAA analysis</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    michaelStormData.riskLevel === 'Critical' ? 'bg-red/20 text-red-400' :
                    michaelStormData.riskLevel === 'High' ? 'bg-amber/20 text-amber' :
                    michaelStormData.riskLevel === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-gray-700 text-gray-300'
                  }`}>{michaelStormData.riskLevel} Risk</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-black/20 rounded p-2">
                    <p className="text-lg font-bold text-amber">{michaelStormData.hailCount}</p>
                    <p className="text-xs text-gray-400">Hail Events</p>
                  </div>
                  <div className="bg-black/20 rounded p-2">
                    <p className="text-lg font-bold text-red-400">{michaelStormData.tornadoCount}</p>
                    <p className="text-xs text-gray-400">Tornadoes</p>
                  </div>
                  <div className="bg-black/20 rounded p-2">
                    <p className="text-lg font-bold text-cyan">{michaelStormData.severeHailCount}</p>
                    <p className="text-xs text-gray-400">Severe Hail</p>
                  </div>
                </div>
                {michaelStormData.maxHailSize > 0 && (
                  <p className="text-xs text-amber">⚠ Max hail recorded: {michaelStormData.maxHailSize.toFixed(2)}" diameter</p>
                )}

                {/* Save as Impact Zone button */}
                <button
                  onClick={() => {
                    const zone = {
                      zip: michaelStormData.zip,
                      city: michaelStormData.city,
                      riskLevel: michaelStormData.riskLevel,
                      hailCount: michaelStormData.hailCount,
                      tornadoCount: michaelStormData.tornadoCount,
                      lat: michaelStormData.lat,
                      lng: michaelStormData.lng,
                      addedAt: new Date().toISOString(),
                    }
                    const updated = [zone, ...stormImpactZones.filter(z => z.zip !== zone.zip)]
                    setStormImpactZones(updated)
                    try { localStorage.setItem('directive_impact_zones', JSON.stringify(updated)) } catch { /* ignore */ }
                  }}
                  className="w-full text-xs py-1.5 bg-cyan/10 text-cyan border border-cyan/20 rounded hover:bg-cyan/20 transition-all"
                >
                  + Save as StormScope Impact Zone
                </button>
              </div>
            )}

            {/* Year-by-Year Chart */}
            {michaelStormData?.byYear && (
              <div className="glass-sm rounded-lg p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Hail Events by Year</p>
                <div className="space-y-1">
                  {Object.entries(michaelStormData.byYear)
                    .sort(([a], [b]) => parseInt(b) - parseInt(a))
                    .slice(0, 10)
                    .map(([yr, d]) => (
                      <div key={yr} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-10 flex-shrink-0">{yr}</span>
                        <div className="flex-1 bg-dark-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-amber rounded-full"
                            style={{ width: `${Math.min(100, (d.hail / Math.max(1, ...Object.values(michaelStormData.byYear).map(v => v.hail))) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-6 text-right">{d.hail}</span>
                        {d.tornado > 0 && <span className="text-xs text-red-400">🌪 {d.tornado}</span>}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel — Leads + Chat tabs */}
          <div className="flex-1 glass rounded-xl flex flex-col overflow-hidden">
            {/* Tab Bar */}
            <div className="flex border-b border-white/10 px-4 pt-4 gap-2 flex-shrink-0">
              <button
                onClick={() => setMichaelTab('leads')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${michaelTab === 'leads' ? 'bg-cyan/20 text-cyan border-b-2 border-cyan' : 'text-gray-400 hover:text-white'}`}
              >
                AI Leads {michaelLeads.length > 0 && <span className="ml-1 bg-cyan text-dark text-xs px-1.5 rounded-full">{michaelLeads.length}</span>}
              </button>
              <button
                onClick={() => setMichaelTab('chat')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${michaelTab === 'chat' ? 'bg-cyan/20 text-cyan border-b-2 border-cyan' : 'text-gray-400 hover:text-white'}`}
              >
                Chat
              </button>
            </div>

            {/* LEADS TAB */}
            {michaelTab === 'leads' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {michaelLeadsLoading && (
                  <div className="flex flex-col items-center justify-center h-48 gap-4">
                    <Loader2 className="w-8 h-8 text-cyan animate-spin" />
                    <div className="text-center">
                      <p className="text-sm text-white font-medium">Michael is analyzing storm data...</p>
                      <p className="text-xs text-gray-400 mt-1">Querying 10 years of NOAA records for ZIP {michaelZip}</p>
                    </div>
                  </div>
                )}

                {!michaelLeadsLoading && michaelLeads.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                    <Brain className="w-12 h-12 text-cyan/20" />
                    <p className="text-sm text-gray-400">Enter a ZIP code to generate storm-based leads</p>
                    <p className="text-xs text-gray-500">Michael scores leads using 10 years of hail, tornado, and wind data combined with estimated roof ages</p>
                  </div>
                )}

                {michaelLeads.map((lead, idx) => (
                  <div key={idx} className="bg-dark-700/50 border border-white/5 rounded-xl p-4 hover:border-cyan/20 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 pr-3">
                        <p className="text-sm font-semibold text-white">{lead.address}</p>
                        <p className="text-xs text-gray-400 mt-1">{lead.reason}</p>
                      </div>
                      <div className="text-center flex-shrink-0">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                          lead.score >= 85 ? 'border-green bg-green/10 text-green' :
                          lead.score >= 70 ? 'border-amber bg-amber/10 text-amber' :
                          'border-gray-600 bg-gray-700/50 text-gray-300'
                        }`}>
                          {lead.score}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">score</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {lead.roofAge && (
                        <span className="text-xs bg-amber/10 text-amber px-2 py-0.5 rounded">🏠 ~{lead.roofAge}yr roof</span>
                      )}
                      {lead.stormHits > 0 && (
                        <span className="text-xs bg-red/10 text-red-400 px-2 py-0.5 rounded">⛈ {lead.stormHits} storm hits</span>
                      )}
                      <span className="text-xs bg-dark-700 text-gray-400 px-2 py-0.5 rounded">{lead.source}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => {
                          setSweepAddress(lead.address)
                          setActiveScreen('sweep')
                        }}
                        className="flex-1 text-xs py-1.5 bg-cyan/10 text-cyan border border-cyan/20 rounded hover:bg-cyan/20 transition-all"
                      >
                        Research in Sweep
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CHAT TAB */}
            {michaelTab === 'chat' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Brain className="w-12 h-12 text-cyan/30 mx-auto mb-3" />
                        <p className="text-sm text-gray-400">Ask me about your leads, storm risk, or territory</p>
                        {michaelStormData && (
                          <p className="text-xs text-cyan/60 mt-2">I have data loaded for ZIP {michaelStormData.zip} — ask me about it</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-md px-4 py-3 rounded-2xl text-sm ${
                            msg.role === 'user' ? 'bg-cyan text-dark rounded-tr-sm' : 'bg-dark-700 text-gray-200 rounded-tl-sm'
                          }`}>
                            {msg.role === 'assistant' && <p className="text-xs text-gray-500 mb-1">Michael • Directive CRM</p>}
                            <p className="break-words">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="bg-dark-700 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </>
                  )}
                </div>
                <div className="flex gap-2 p-4 border-t border-white/10">
                  <input
                    type="text"
                    placeholder="Ask Michael..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !chatLoading && handleSendChat()}
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
            )}
          </div>
        </div>
      )}

      {/* SCREEN 6: CLIENTS */}
      {activeScreen === 'clients' && (
        <div className="absolute inset-4 top-[184px] z-30 flex flex-col md:flex-row gap-4 overflow-y-auto md:overflow-hidden md:h-[calc(100vh-224px)]">
          {/* Left Panel: Client List */}
          <div className="w-full md:w-1/3 glass rounded-lg p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">CRM Pipeline</h2>
              <div className="relative group">
                <button className="p-1.5 rounded hover:bg-dark-700 text-cyan">
                  <Plus className="w-5 h-5" />
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-dark-800 border border-white/10 rounded-lg shadow-lg p-2 hidden group-hover:block z-50">
                  <p className="text-xs text-gray-400 px-2 py-1 font-semibold">New Client from Property:</p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {properties
                      .filter(p => !clients.some(c => c.property_id === p.id))
                      .slice(0, 10)
                      .map(prop => (
                        <button
                          key={prop.id}
                          onClick={async () => {
                            const newClient: Client = {
                              id: crypto.randomUUID(),
                              property_id: prop.id,
                              status: 'new_lead',
                              notes: '',
                              last_contact: null,
                              assigned_to: null,
                              created_at: new Date().toISOString()
                            }
                            const updated = [...clients, newClient]
                            setClients(updated)
                            await saveClient(newClient)
                          }}
                          className="w-full text-left px-2 py-2 text-xs text-white hover:bg-dark-700 rounded transition-all"
                        >
                          {prop.address}
                        </button>
                      ))}
                    {properties.filter(p => !clients.some(c => c.property_id === p.id)).length === 0 && (
                      <p className="text-xs text-gray-500 px-2 py-2">All properties have clients</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

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
          <div className="w-full md:w-2/3 glass rounded-lg p-6 flex flex-col">
            {selectedClient ? (
              <>
                {(() => {
                  const prop = properties.find(p => p.id === selectedClient.property_id)
                  return (
                    <>
                      <div className="mb-6 pb-6 border-b border-white/10">
                        <h2 className="text-xl font-semibold text-white">{prop?.address || '—'}</h2>
                        {prop && (
                          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div><span className="text-gray-400">Phone: </span><span className="text-cyan">{prop.owner_phone || '—'}</span></div>
                            <div><span className="text-gray-400">Email: </span><span className="text-white truncate">{prop.owner_email || '—'}</span></div>
                            <div><span className="text-gray-400">Roof Age: </span><span className="text-amber">{prop.roof_age_years ? prop.roof_age_years + ' yrs' : '—'}</span></div>
                            <div><span className="text-gray-400">Year Built: </span><span className="text-white">{prop.year_built || '—'}</span></div>
                            <div><span className="text-gray-400">Market Value: </span><span className="text-white">{prop.market_value ? '$' + prop.market_value.toLocaleString() : '—'}</span></div>
                            <div><span className="text-gray-400">Sqft: </span><span className="text-white">{prop.sqft?.toLocaleString() || '—'}</span></div>
                            <div><span className="text-gray-400">Parcel ID: </span><span className="text-white">{prop.parcel_id || '—'}</span></div>
                            <div><span className="text-gray-400">County: </span><span className="text-white">{prop.county || '—'}</span></div>
                          </div>
                        )}
                        <button
                          onClick={async () => {
                            if (!prop) return
                            const newProposal: Proposal = {
                              id: crypto.randomUUID(),
                              client_id: selectedClient.id,
                              property_id: prop.id,
                              status: 'draft',
                              line_items: [
                                { id: crypto.randomUUID(), description: 'Full Roof Replacement', quantity: prop.sqft ? Math.ceil(prop.sqft / 100) : 0, unit: 'sq', unit_price: 450, total: prop.sqft ? Math.ceil(prop.sqft / 100) * 450 : 0 },
                                { id: crypto.randomUUID(), description: 'Remove & Dispose', quantity: 1, unit: 'job', unit_price: 500, total: 500 },
                              ],
                              total: prop.sqft ? Math.ceil(prop.sqft / 100) * 450 + 500 : 950,
                              notes: `Owner: ${prop.owner_name || 'Unknown'}\nPhone: ${prop.owner_phone || 'Unknown'}`,
                              created_at: new Date().toISOString(),
                              sent_at: null,
                            }
                            const updatedProposals = [...proposals, newProposal]
                            setProposals(updatedProposals)
                            await saveProposal(newProposal)
                            setActiveScreen('proposals')
                            setSelectedProposal(newProposal)
                          }}
                          className="w-full mt-3 bg-cyan/20 text-cyan py-2 rounded-lg text-sm font-medium hover:bg-cyan/30 transition-all flex items-center justify-center gap-2"
                        >
                          <FileText className="w-4 h-4" />
                          Create Proposal
                        </button>
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

                      {/* Timezone & Weather Info */}
                      {prop && clientTimezone && (
                        <div className="mb-4 p-3 rounded-lg bg-dark-700/50">
                          <div className={`text-xs px-2 py-1 rounded flex items-center gap-2 ${
                            clientTimezone.goodTimeToCall ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            <span>{clientTimezone.localTime} local</span>
                            <span>•</span>
                            <span>{clientTimezone.callAdvice}</span>
                          </div>
                        </div>
                      )}

                      {prop && (
                        <div className="mb-4">
                          <WeatherWidget lat={prop.lat} lng={prop.lng} compact={true} />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-6 mb-6">
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
                            <select
                              value={selectedClient.status}
                              onChange={async (e) => {
                                const newStatus = e.target.value as any
                                const updated = { ...selectedClient, status: newStatus }
                                setSelectedClient(updated)
                                const idx = clients.findIndex(c => c.id === selectedClient.id)
                                const newClients = [...clients]
                                newClients[idx] = updated
                                setClients(newClients)
                                await saveClient(updated)
                                const statusLabel = newStatus.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                                const clientProp = properties.find(p => p.id === selectedClient.property_id)
                                addNotification(`Client for ${clientProp?.address || 'property'} marked as ${statusLabel}`, 'info')
                                const newActivities = logClientActivity(selectedClient.id, `Status changed to '${statusLabel}'`, clientActivities)
                                setClientActivities(newActivities)
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
                          className="w-full h-20 bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                          placeholder="Add notes..."
                        />
                      </div>

                      {/* Activity Log */}
                      <div className="mb-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Activity</p>
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {clientActivities[selectedClient.id] && clientActivities[selectedClient.id].length > 0 ? (
                            [...(clientActivities[selectedClient.id] || [])].reverse().map((activity, idx) => {
                              const date = new Date(activity.timestamp)
                              const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              return (
                                <div key={idx} className="text-xs border-l border-cyan/30 pl-3 py-1">
                                  <p className="text-cyan">{activity.action}</p>
                                  <p className="text-gray-500 text-xs mt-0.5">{dateStr} {timeStr}</p>
                                </div>
                              )
                            })
                          ) : (
                            <p className="text-xs text-gray-500">No activity yet</p>
                          )}
                        </div>
                      </div>

                      {prop && (
                        <div className="mb-4">
                          <DamagePhotoUpload
                            propertyId={prop.id}
                            lat={prop.lat}
                            lng={prop.lng}
                            address={prop.address}
                            onPhotoSaved={(url) => console.log('Photo saved for', prop.id)}
                          />
                        </div>
                      )}

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
        <div className="absolute inset-4 top-[184px] z-30 flex flex-col md:flex-row gap-4 overflow-y-auto md:overflow-hidden md:h-[calc(100vh-224px)]">
          {/* Left Panel: Proposal List */}
          <div className="w-full md:w-1/3 glass rounded-lg p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Proposals</h2>
              <div className="relative group">
                <button className="p-1.5 rounded hover:bg-dark-700 text-cyan">
                  <Plus className="w-5 h-5" />
                </button>
                <div className="absolute right-0 mt-1 w-64 bg-dark-800 border border-white/10 rounded-lg shadow-lg p-2 hidden group-hover:block z-50">
                  <p className="text-xs text-gray-400 px-2 py-1 font-semibold">New Proposal For:</p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {properties.slice(0, 20).map(prop => (
                      <button
                        key={prop.id}
                        onClick={async () => {
                          const client = clients.find(c => c.property_id === prop.id)
                          const newProposal: Proposal = {
                            id: crypto.randomUUID(),
                            client_id: client?.id || '',
                            property_id: prop.id,
                            status: 'draft',
                            line_items: [
                              { id: crypto.randomUUID(), description: 'Full Roof Replacement', quantity: prop.sqft ? Math.ceil(prop.sqft / 100) : 0, unit: 'sq', unit_price: 450, total: prop.sqft ? Math.ceil(prop.sqft / 100) * 450 : 0 },
                              { id: crypto.randomUUID(), description: 'Remove & Dispose Old Roof', quantity: 1, unit: 'job', unit_price: 500, total: 500 },
                              { id: crypto.randomUUID(), description: 'Ice & Water Shield', quantity: 2, unit: 'sq', unit_price: 120, total: 240 },
                            ],
                            total: prop.sqft ? Math.ceil(prop.sqft / 100) * 450 + 740 : 1240,
                            notes: `Property: ${prop.address}\nOwner: ${prop.owner_name || 'Unknown'}\nRoof Age: ${prop.roof_age_years || 'Unknown'} years\nMarket Value: ${prop.market_value ? '$' + prop.market_value.toLocaleString() : 'Unknown'}`,
                            created_at: new Date().toISOString(),
                            sent_at: null,
                          }
                          const newProposals = [...proposals, newProposal]
                          setProposals(newProposals)
                          await saveProposal(newProposal)
                          setSelectedProposal(newProposal)
                          setEditingProposal(true)
                        }}
                        className="w-full text-left px-2 py-2 text-xs text-white hover:bg-dark-700 rounded transition-all"
                      >
                        <div className="font-medium">{prop.address}</div>
                        <div className="text-gray-400">{prop.owner_name || 'Unknown Owner'} • {prop.sqft ? prop.sqft.toLocaleString() + ' sqft' : 'Size unknown'}</div>
                      </button>
                    ))}
                    {properties.length === 0 && (
                      <p className="text-xs text-gray-500 px-2 py-2">No properties yet — sweep an address first</p>
                    )}
                  </div>
                </div>
              </div>
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
          <div className="w-full md:w-2/3 glass rounded-lg p-6 flex flex-col">
            {selectedProposal ? (
              <>
                <div className="mb-4 pb-4 border-b border-white/10">
                  {(() => {
                    const prop = properties.find(p => p.id === selectedProposal.property_id)
                    return (
                      <>
                        <h2 className="text-lg font-semibold text-white">{prop?.address || 'Unknown Property'}</h2>
                        {prop && (
                          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <div><span className="text-gray-400">Owner: </span><span className="text-white">{prop.owner_name || '—'}</span></div>
                            <div><span className="text-gray-400">Phone: </span><span className="text-cyan">{prop.owner_phone || '—'}</span></div>
                            <div><span className="text-gray-400">Roof Age: </span><span className="text-amber">{prop.roof_age_years ? prop.roof_age_years + ' yrs' : '—'}</span></div>
                            <div><span className="text-gray-400">Market Value: </span><span className="text-white">{prop.market_value ? '$' + prop.market_value.toLocaleString() : '—'}</span></div>
                            <div><span className="text-gray-400">Sqft: </span><span className="text-white">{prop.sqft?.toLocaleString() || '—'}</span></div>
                            <div><span className="text-gray-400">Year Built: </span><span className="text-white">{prop.year_built || '—'}</span></div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>

                {(() => {
                  const selectedProposalProperty = properties.find(p => p.id === selectedProposal.property_id)
                  return selectedProposalProperty ? (
                    <div className="mb-4">
                      <div className="flex gap-1 mb-1">
                        {(['place', 'streetview', 'satellite'] as const).map(m => (
                          <button key={m} onClick={() => setProposalMapMode(m)}
                            className={`text-xs px-2 py-1 rounded capitalize transition-colors ${proposalMapMode === m ? 'bg-cyan-500/30 text-cyan-400' : 'text-white/40 hover:text-white/70'}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                      <PropertyMapEmbed
                        address={selectedProposalProperty.address}
                        lat={selectedProposalProperty.lat}
                        lng={selectedProposalProperty.lng}
                        mode={proposalMapMode}
                        className="w-full h-36"
                      />
                    </div>
                  ) : null
                })()}

                <div className="flex-1 overflow-y-auto mb-4 space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Status</label>
                    <select
                      value={selectedProposal.status}
                      onChange={async (e) => {
                        const newStatus = e.target.value as any
                        const updated = { ...selectedProposal, status: newStatus }
                        setSelectedProposal(updated)
                        const idx = proposals.findIndex(p => p.id === selectedProposal.id)
                        const newProposals = [...proposals]
                        newProposals[idx] = updated
                        setProposals(newProposals)

                        // Auto-convert accepted proposal to job
                        if (newStatus === 'accepted') {
                          const jobAlreadyExists = jobs.some(j => j.address === selectedProposal.property_id)
                          if (!jobAlreadyExists) {
                            const subtotal = selectedProposal.line_items.reduce((sum, item) => sum + item.total, 0)
                            const taxRate = parseFloat(companySettings.tax_rate || '0') / 100
                            const contractAmount = subtotal * (1 + taxRate)
                            const prop = properties.find(p => p.id === selectedProposal.property_id)

                            const newJob: Job = {
                              id: crypto.randomUUID(),
                              property_id: selectedProposal.property_id,
                              client_id: selectedProposal.client_id || null,
                              proposal_id: selectedProposal.id,
                              title: `Roof - ${prop?.address || 'Unknown'}`,
                              address: prop?.address || '',
                              owner_name: prop?.owner_name || null,
                              contract_amount: contractAmount,
                              stage: 'sold' as const,
                              contract_signed_at: new Date().toISOString(),
                              permit_number: null,
                              permit_applied_at: null,
                              permit_approved_at: null,
                              scheduled_date: null,
                              crew_lead: null,
                              crew_members: [],
                              started_at: null,
                              completed_at: null,
                              invoice_number: null,
                              invoice_sent_at: null,
                              amount_collected: null,
                              collected_at: null,
                              insurance: null,
                              photos: [],
                              notes: selectedProposal.notes || '',
                              created_at: new Date().toISOString()
                            }

                            const updatedJobs = [...jobs, newJob]
                            setJobs(updatedJobs)
                            await saveJob(newJob)
                            addNotification(`Proposal accepted for ${prop?.address || 'property'} — Job created!`, 'success')
                          }
                        }
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
                        {selectedProposal.line_items.map((lineItem) => {
                          return (
                            <tr key={lineItem.id}>
                              <td className="py-2 text-gray-300">{lineItem.description}</td>
                              <td className="text-right">
                                <input
                                  type="number"
                                  min="0"
                                  value={lineItem.quantity}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value) || 0
                                    const newTotal = newQty * lineItem.unit_price
                                    const updated = {
                                      ...selectedProposal,
                                      line_items: selectedProposal.line_items.map(li =>
                                        li.id === lineItem.id
                                          ? { ...li, quantity: newQty, total: newTotal }
                                          : li
                                      ),
                                      total: selectedProposal.line_items.reduce((sum, li) =>
                                        sum + (li.id === lineItem.id ? newTotal : li.total), 0
                                      )
                                    }
                                    setSelectedProposal(updated)
                                    const idx = proposals.findIndex(p => p.id === selectedProposal.id)
                                    const newProposals = [...proposals]
                                    newProposals[idx] = updated
                                    setProposals(newProposals)
                                  }}
                                  className="w-14 bg-dark-700 border border-white/10 rounded px-2 py-1 text-white"
                                  placeholder="0"
                                />
                              </td>
                              <td className="text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={lineItem.unit_price}
                                  onChange={(e) => {
                                    const newPrice = parseFloat(e.target.value) || 0
                                    const newTotal = lineItem.quantity * newPrice
                                    const updated = {
                                      ...selectedProposal,
                                      line_items: selectedProposal.line_items.map(li =>
                                        li.id === lineItem.id
                                          ? { ...li, unit_price: newPrice, total: newTotal }
                                          : li
                                      ),
                                      total: selectedProposal.line_items.reduce((sum, li) =>
                                        sum + (li.id === lineItem.id ? newTotal : li.total), 0
                                      )
                                    }
                                    setSelectedProposal(updated)
                                    const idx = proposals.findIndex(p => p.id === selectedProposal.id)
                                    const newProposals = [...proposals]
                                    newProposals[idx] = updated
                                    setProposals(newProposals)
                                  }}
                                  className="w-20 bg-dark-700 border border-white/10 rounded px-2 py-1 text-white"
                                  placeholder="0"
                                />
                              </td>
                              <td className="text-right text-cyan font-semibold">${lineItem.total.toFixed(2)}</td>
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
                    {(() => {
                      const subtotal = selectedProposal.line_items.reduce((sum, item) => sum + item.total, 0)
                      const taxRate = parseFloat(companySettings.tax_rate || '0') / 100
                      const taxAmount = subtotal * taxRate
                      const grandTotal = subtotal + taxAmount
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Subtotal:</span>
                            <span className="text-white">${subtotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Tax ({companySettings.tax_rate}%):</span>
                            <span className="text-white">${taxAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-lg font-semibold border-t border-white/10 pt-2">
                            <span className="text-gray-400">Total:</span>
                            <span className="text-cyan">${grandTotal.toFixed(2)}</span>
                          </div>
                        </>
                      )
                    })()}
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
                  <button
                    onClick={() => window.print()}
                    className="flex-1 bg-amber/20 text-amber py-2 rounded-lg font-medium hover:bg-amber/30 transition-all"
                  >
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
        <div className="absolute inset-4 top-[184px] z-30 flex flex-col md:flex-row gap-4 overflow-y-auto md:overflow-hidden md:h-[calc(100vh-224px)]">
          {/* Roof Calculator */}
          {materialsTab === 'catalog' && (
            <>
            <div className="glass rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-cyan" />
              <h3 className="text-lg font-semibold text-white">Roof Area Calculator</h3>
            </div>
            {(() => {
              const PITCH_MULTIPLIERS: Record<string, number> = {
                '4/12': 1.054, '5/12': 1.083, '6/12': 1.118, '7/12': 1.158,
                '8/12': 1.202, '9/12': 1.250, '10/12': 1.302, '12/12': 1.414
              }
              const baseSqft = roofWidth && roofLength ? parseFloat(roofWidth) * parseFloat(roofLength) : 0
              const multiplier = PITCH_MULTIPLIERS[roofPitch] || 1.118
              const dormer = parseFloat(dormerSqft) || 0
              const valley = parseFloat(valleyDeductSqft) || 0
              const adjusted = baseSqft * multiplier * (1 + wastePercent / 100) + dormer - valley
              const squares = adjusted / 100
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Width (ft)</label>
                      <input type="number" value={roofWidth} onChange={(e) => setRoofWidth(e.target.value)}
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Length (ft)</label>
                      <input type="number" value={roofLength} onChange={(e) => setRoofLength(e.target.value)}
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Pitch</label>
                      <select value={roofPitch} onChange={(e) => setRoofPitch(e.target.value)}
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50">
                        {Object.keys(PITCH_MULTIPLIERS).map(p => (
                          <option key={p} value={p}>{p} (×{PITCH_MULTIPLIERS[p]})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Waste %</label>
                      <input type="number" value={wastePercent} onChange={(e) => setWastePercent(parseFloat(e.target.value) || 0)}
                        min="0" max="50" step="1"
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Dormer Add (sqft)</label>
                      <input type="number" value={dormerSqft} onChange={(e) => setDormerSqft(e.target.value)}
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Valley Deduct (sqft)</label>
                      <input type="number" value={valleyDeductSqft} onChange={(e) => setValleyDeductSqft(e.target.value)}
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Roof Type</label>
                      <select value={roofType} onChange={(e) => setRoofType(e.target.value as 'gable' | 'hip')}
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50">
                        <option value="gable">Gable</option>
                        <option value="hip">Hip</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Base Sq Ft</p>
                      <p className="mt-1 text-xl font-bold text-gray-300">{baseSqft > 0 ? baseSqft.toLocaleString() : '—'}</p>
                    </div>
                  </div>
                  {baseSqft > 0 && (
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/10">
                      <div className="bg-dark-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Adjusted Sq Ft</p>
                        <p className="text-2xl font-bold text-cyan">{Math.round(adjusted).toLocaleString()}</p>
                        <p className="text-xs text-gray-500 mt-1">pitch + waste + dormers</p>
                      </div>
                      <div className="bg-dark-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Squares Needed</p>
                        <p className="text-2xl font-bold text-green">{squares > 0 ? squares.toFixed(1) : '—'}</p>
                        <p className="text-xs text-gray-500 mt-1">order this amount</p>
                      </div>
                      <div className="bg-dark-700/50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pitch Multiplier</p>
                        <p className="text-2xl font-bold text-purple-400">×{multiplier.toFixed(3)}</p>
                        <p className="text-xs text-gray-500 mt-1">{roofPitch} pitch</p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
            </div>

            {/* Smart Estimate Panel */}
            <div className="glass rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-5 h-5 text-cyan" />
                <h3 className="text-lg font-semibold text-white">Smart Estimate Builder</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">Select a property to auto-build a material estimate based on roof size, pitch, and age.</p>
              <div className="space-y-3">
                <select
                  className="w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                  onChange={(e) => {
                    const prop = properties.find(p => p.id === e.target.value)
                    if (prop && prop.sqft) {
                      setRoofWidth(String(Math.round(Math.sqrt(prop.sqft))))
                      setRoofLength(String(Math.round(Math.sqrt(prop.sqft))))
                    }
                  }}
                >
                  <option value="">Select property from pipeline...</option>
                  {properties.map(prop => (
                    <option key={prop.id} value={prop.id}>
                      {prop.address} {prop.sqft ? `— ${prop.sqft.toLocaleString()} sqft` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">Selecting a property auto-fills the roof dimensions above. Then use the calculator to get material quantities and costs.</p>
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

                {/* Add Material Form */}
                {addingMaterial && (
                  <div className="mb-4 p-4 bg-dark-700/50 rounded-lg border border-white/10 space-y-3">
                    <h4 className="text-sm font-semibold text-white mb-3">New Material</h4>
                <input
                  id="mat-name"
                  type="text"
                  placeholder="Material name..."
                  className="w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    id="mat-category"
                    className="bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                  >
                    <option value="">Category</option>
                    <option value="shingles">Shingles</option>
                    <option value="underlayment">Underlayment</option>
                    <option value="flashing">Flashing</option>
                    <option value="ventilation">Ventilation</option>
                    <option value="fasteners">Fasteners</option>
                    <option value="sealant">Sealant</option>
                    <option value="other">Other</option>
                  </select>
                  <select
                    id="mat-unit"
                    className="bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                  >
                    <option value="">Unit</option>
                    <option value="ea">Each</option>
                    <option value="sq">Square</option>
                    <option value="bundle">Bundle</option>
                    <option value="roll">Roll</option>
                    <option value="box">Box</option>
                    <option value="lb">Pound</option>
                  </select>
                </div>
                <input
                  id="mat-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Unit cost..."
                  className="w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                />
                <input
                  id="mat-supplier"
                  type="text"
                  placeholder="Supplier..."
                  className="w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      const name = (document.getElementById('mat-name') as HTMLInputElement).value
                      const category = (document.getElementById('mat-category') as HTMLSelectElement).value
                      const unit = (document.getElementById('mat-unit') as HTMLSelectElement).value
                      const cost = parseFloat((document.getElementById('mat-cost') as HTMLInputElement).value) || 0
                      const supplier = (document.getElementById('mat-supplier') as HTMLInputElement).value

                      if (name && category && unit) {
                        const newMaterial: Material = {
                          id: crypto.randomUUID(),
                          name,
                          category: category as Material['category'],
                          unit,
                          unit_cost: cost,
                          supplier,
                          supplier_phone: null,
                          notes: ''
                        }
                        const updated = [...materials, newMaterial]
                        setMaterials(updated)
                        await saveMaterial(newMaterial)
                        setAddingMaterial(false)
                        ;(document.getElementById('mat-name') as HTMLInputElement).value = ''
                        ;(document.getElementById('mat-cost') as HTMLInputElement).value = ''
                        ;(document.getElementById('mat-supplier') as HTMLInputElement).value = ''
                      }
                    }}
                    className="flex-1 bg-cyan text-dark py-2 rounded font-medium hover:bg-cyan/90 text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setAddingMaterial(false)}
                    className="flex-1 bg-dark-700/50 text-gray-400 py-2 rounded font-medium hover:text-white text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
            </>
          )}

          {/* Orders Tab */}
          {materialsTab === 'orders' && (
            <div className="flex-1 glass rounded-lg p-6 overflow-y-auto flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Material Orders</h3>
                <button
                  onClick={() => setAddingOrder(!addingOrder)}
                  className="p-1.5 rounded hover:bg-dark-700 text-cyan"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Add Order Form */}
              {addingOrder && (
                <div className="mb-4 p-4 bg-dark-700/50 rounded-lg border border-white/10 space-y-3">
                  <h4 className="text-sm font-semibold text-white mb-3">New Order</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Supplier</label>
                      <input
                        id="order-supplier"
                        type="text"
                        placeholder="Supplier name..."
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Link to Job (Optional)</label>
                      <select
                        id="order-job"
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                      >
                        <option value="">Select job...</option>
                        {jobs.map(job => (
                          <option key={job.id} value={job.id}>{job.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Materials</label>
                    <div className="space-y-2 mt-1 max-h-32 overflow-y-auto">
                      {materials.map(mat => (
                        <label key={mat.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            value={mat.id}
                            className="rounded"
                            id={`mat-checkbox-${mat.id}`}
                          />
                          <span className="text-sm text-gray-300">{mat.name} ({mat.unit}) - ${mat.unit_cost}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 uppercase tracking-wide">Notes</label>
                    <textarea
                      id="order-notes"
                      placeholder="Order notes..."
                      className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50"
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const supplier = (document.getElementById('order-supplier') as HTMLInputElement).value
                        const jobId = (document.getElementById('order-job') as HTMLSelectElement).value
                        const notes = (document.getElementById('order-notes') as HTMLTextAreaElement).value
                        const selectedMaterials = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(el => {
                          const id = (el as HTMLInputElement).value
                          const mat = materials.find(m => m.id === id)
                          return mat ? { name: mat.name, quantity: 1, unit: mat.unit, unit_cost: mat.unit_cost, total: mat.unit_cost } : null
                        }).filter(Boolean) as any[]

                        if (supplier && selectedMaterials.length > 0) {
                          const totalCost = selectedMaterials.reduce((sum, m) => sum + m.total, 0)
                          const newOrder: MaterialOrder = {
                            id: crypto.randomUUID(),
                            materials: selectedMaterials,
                            job_id: jobId || undefined,
                            job_title: jobId ? jobs.find(j => j.id === jobId)?.title : undefined,
                            status: 'draft',
                            supplier,
                            order_date: new Date().toISOString().split('T')[0],
                            notes,
                            total_cost: totalCost
                          }
                          setMaterialOrders([...materialOrders, newOrder])
                          setAddingOrder(false)
                          ;(document.getElementById('order-supplier') as HTMLInputElement).value = ''
                          ;(document.getElementById('order-notes') as HTMLTextAreaElement).value = ''
                          Array.from(document.querySelectorAll('input[type="checkbox"]')).forEach(el => {
                            (el as HTMLInputElement).checked = false
                          })
                        }
                      }}
                      className="flex-1 bg-cyan text-dark py-2 rounded font-medium hover:bg-cyan/90 text-sm"
                    >
                      Save Order
                    </button>
                    <button
                      onClick={() => setAddingOrder(false)}
                      className="flex-1 bg-dark-700/50 text-gray-400 py-2 rounded font-medium hover:text-white text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {materialOrders.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400">No orders yet. Create your first order.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {materialOrders.map(order => (
                    <div key={order.id} className="bg-dark-700/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-white">{order.supplier}</p>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${
                          order.status === 'draft' ? 'bg-gray-700 text-gray-300' :
                          order.status === 'ordered' ? 'bg-cyan/20 text-cyan' :
                          order.status === 'shipped' ? 'bg-amber/20 text-amber' :
                          'bg-green/20 text-green'
                        }`}>
                          {order.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {order.materials.length} items · ${order.total_cost.toFixed(2)}
                        {order.job_title && <span> · Job: {order.job_title}</span>}
                      </div>
                      <div className="flex gap-2 pt-2">
                        {order.status === 'draft' && (
                          <button
                            onClick={() => {
                              setMaterialOrders(materialOrders.map(o => o.id === order.id ? { ...o, status: 'ordered' } : o))
                            }}
                            className="flex-1 text-xs bg-cyan/20 text-cyan px-2 py-1 rounded hover:bg-cyan/30"
                          >
                            Mark Ordered
                          </button>
                        )}
                        {order.status === 'ordered' && (
                          <button
                            onClick={() => {
                              setMaterialOrders(materialOrders.map(o => o.id === order.id ? { ...o, status: 'shipped' } : o))
                            }}
                            className="flex-1 text-xs bg-amber/20 text-amber px-2 py-1 rounded hover:bg-amber/30"
                          >
                            Mark Shipped
                          </button>
                        )}
                        {order.status === 'shipped' && (
                          <button
                            onClick={() => {
                              setMaterialOrders(materialOrders.map(o => o.id === order.id ? { ...o, status: 'delivered' } : o))
                            }}
                            className="flex-1 text-xs bg-green/20 text-green px-2 py-1 rounded hover:bg-green/30"
                          >
                            Mark Delivered
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab buttons (positioned at top) */}
          <div className="absolute top-6 right-6 flex gap-2 z-40">
            <button
              onClick={() => setMaterialsTab('catalog')}
              className={`text-xs font-semibold uppercase px-3 py-2 rounded-lg transition-all ${
                materialsTab === 'catalog'
                  ? 'bg-cyan text-dark'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Catalog
            </button>
            <button
              onClick={() => setMaterialsTab('orders')}
              className={`text-xs font-semibold uppercase px-3 py-2 rounded-lg transition-all ${
                materialsTab === 'orders'
                  ? 'bg-cyan text-dark'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Orders
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 9: COMMUNICATIONS HUB */}
      {activeScreen === 'team' && (
        <div className="absolute inset-4 top-[184px] z-30 flex flex-col h-[calc(100vh-224px)]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-cyan" />
              <h2 className="text-xl font-bold text-white">Communications Hub</h2>
            </div>
          </div>

          {/* Quick Contact Section - Show selected client's contact info */}
          {selectedClient && (
            <div className="glass rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Quick Contact</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{selectedClient.id}</p>
                  <p className="text-xs text-gray-400">Selected client</p>
                </div>
                <div className="flex gap-2">
                  {selectedClient.id && (
                    <>
                      <a
                        href={`tel:${selectedClient.id}`}
                        className="p-2 rounded-lg bg-cyan/20 text-cyan hover:bg-cyan/30 transition-all"
                        title="Call client"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                      <a
                        href={`mailto:${selectedClient.id}`}
                        className="p-2 rounded-lg bg-gold/20 text-gold hover:bg-gold/30 transition-all"
                        title="Email client"
                      >
                        <Mail className="w-4 h-4" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Comms Tabs */}
          <div className="flex gap-2 mb-4 glass rounded-lg p-1">
            <button
              onClick={() => setCommsTab('team')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                commsTab === 'team'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-1" />
              Team Chat
            </button>
            <button
              onClick={() => setCommsTab('voice')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                commsTab === 'voice'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Phone className="w-4 h-4 inline mr-1" />
              Google Voice
            </button>
            <button
              onClick={() => setCommsTab('gmail')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                commsTab === 'gmail'
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Mail className="w-4 h-4 inline mr-1" />
              Gmail
            </button>
          </div>

          {/* TAB: TEAM CHAT */}
          {commsTab === 'team' && (
            <div className="flex-1 glass rounded-lg p-6 flex flex-col overflow-hidden">
              {/* Channels */}
              <div className="flex gap-2 mb-4">
                {['general', 'management'].map(channel => (
                  <button
                    key={channel}
                    onClick={() => setActiveChannel(channel as 'general' | 'management')}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      activeChannel === channel
                        ? 'bg-cyan text-dark'
                        : 'bg-dark-700/50 hover:bg-dark-700 text-white'
                    }`}
                  >
                    # {channel}
                  </button>
                ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
                {teamMessages.filter(msg => msg.channel === activeChannel).length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">No messages yet. Start the conversation!</p>
                  </div>
                ) : (
                  teamMessages
                    .filter(msg => msg.channel === activeChannel)
                    .map(msg => (
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
                        sender_name: userProfile?.email || 'Team Member',
                        sender_role: currentUserRole,
                        message: teamChatInput,
                        timestamp: new Date().toISOString(),
                        read: true,
                        channel: activeChannel
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
                        sender_name: userProfile?.email || 'Team Member',
                        sender_role: currentUserRole,
                        message: teamChatInput,
                        timestamp: new Date().toISOString(),
                        read: true,
                        channel: activeChannel
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
          )}

          {/* TAB: GOOGLE VOICE */}
          {commsTab === 'voice' && (
            <div className="flex-1 flex flex-col glass rounded-lg p-6 overflow-hidden">
              <div className="p-3 bg-dark-700/50 rounded-lg mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Phone className="w-4 h-4 text-cyan" />
                  Google Voice
                </h3>
                <p className="text-xs text-gray-400 mt-1">Call and text clients directly from your Google Voice number</p>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div className="w-20 h-20 rounded-full bg-cyan/10 border border-cyan/30 flex items-center justify-center">
                  <Phone className="w-10 h-10 text-cyan" />
                </div>
                <div className="text-center max-w-sm">
                  <h4 className="text-white font-semibold mb-2">Google Voice Integration</h4>
                  <p className="text-gray-400 text-sm mb-1">Make calls, send texts, and manage voicemails from your Google Voice number.</p>
                  <p className="text-gray-500 text-xs">Google Voice opens in a new tab for full functionality including call recording and voicemail transcription.</p>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    onClick={() => window.open('https://voice.google.com/calls', '_blank')}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-cyan text-dark rounded-xl hover:bg-cyan/90 transition-all text-sm font-bold shadow-lg shadow-cyan/20"
                  >
                    <Phone className="w-4 h-4" />
                    Open Google Voice
                  </button>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => window.open('https://voice.google.com/calls', '_blank')}
                      className="flex flex-col items-center gap-1 p-3 bg-dark-700/50 rounded-lg border border-white/10 hover:border-cyan/30 transition-all"
                    >
                      <Phone className="w-4 h-4 text-cyan" />
                      <span className="text-[10px] text-gray-400">Calls</span>
                    </button>
                    <button
                      onClick={() => window.open('https://voice.google.com/messages', '_blank')}
                      className="flex flex-col items-center gap-1 p-3 bg-dark-700/50 rounded-lg border border-white/10 hover:border-cyan/30 transition-all"
                    >
                      <MessageSquare className="w-4 h-4 text-cyan" />
                      <span className="text-[10px] text-gray-400">Texts</span>
                    </button>
                    <button
                      onClick={() => window.open('https://voice.google.com/voicemail', '_blank')}
                      className="flex flex-col items-center gap-1 p-3 bg-dark-700/50 rounded-lg border border-white/10 hover:border-cyan/30 transition-all"
                    >
                      <Voicemail className="w-4 h-4 text-cyan" />
                      <span className="text-[10px] text-gray-400">Voicemail</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GMAIL */}
          {commsTab === 'gmail' && (
            <div className="flex-1 flex flex-col glass rounded-lg p-6 overflow-hidden">
              <div className="p-3 bg-dark-700/50 rounded-lg mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gold" />
                  Gmail
                </h3>
                <p className="text-xs text-gray-400 mt-1">Send emails and manage client communications</p>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-6">
                <div className="w-20 h-20 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
                  <Mail className="w-10 h-10 text-gold" />
                </div>
                <div className="text-center max-w-sm">
                  <h4 className="text-white font-semibold mb-2">Gmail Integration</h4>
                  <p className="text-gray-400 text-sm mb-1">Send proposals, follow-ups, and invoices directly to your clients.</p>
                  <p className="text-gray-500 text-xs">Gmail opens in a new tab for full email functionality including attachments and signatures.</p>
                </div>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button
                    onClick={() => window.open('https://mail.google.com', '_blank')}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gold text-dark rounded-xl hover:bg-gold/90 transition-all text-sm font-bold shadow-lg shadow-gold/20"
                  >
                    <Mail className="w-4 h-4" />
                    Open Gmail
                  </button>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => window.open('https://mail.google.com/#inbox', '_blank')}
                      className="flex flex-col items-center gap-1 p-3 bg-dark-700/50 rounded-lg border border-white/10 hover:border-gold/30 transition-all"
                    >
                      <Inbox className="w-4 h-4 text-gold" />
                      <span className="text-[10px] text-gray-400">Inbox</span>
                    </button>
                    <button
                      onClick={() => window.open('https://mail.google.com/#compose', '_blank')}
                      className="flex flex-col items-center gap-1 p-3 bg-dark-700/50 rounded-lg border border-white/10 hover:border-gold/30 transition-all"
                    >
                      <Send className="w-4 h-4 text-gold" />
                      <span className="text-[10px] text-gray-400">Compose</span>
                    </button>
                    <button
                      onClick={() => window.open('https://mail.google.com/#sent', '_blank')}
                      className="flex flex-col items-center gap-1 p-3 bg-dark-700/50 rounded-lg border border-white/10 hover:border-gold/30 transition-all"
                    >
                      <CheckCircle className="w-4 h-4 text-gold" />
                      <span className="text-[10px] text-gray-400">Sent</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCREEN 10: JOBS */}
      {activeScreen === 'jobs' && (
        <div className="absolute inset-4 top-[184px] z-30 flex flex-col h-[calc(100vh-224px)] gap-4">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-cyan" />
              <h2 className="text-xl font-bold text-white">Production Jobs</h2>
              <span className="ml-2 px-2 py-0.5 rounded-full bg-cyan/20 text-cyan text-xs font-semibold">
                {jobs.length} total
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 glass rounded-lg p-1">
                <button
                  onClick={() => setJobViewMode('list')}
                  className={`px-3 py-1.5 rounded text-sm font-semibold uppercase transition-all ${
                    jobViewMode === 'list'
                      ? 'bg-cyan/20 text-cyan border border-cyan/30'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setJobViewMode('board')}
                  className={`px-3 py-1.5 rounded text-sm font-semibold uppercase transition-all ${
                    jobViewMode === 'board'
                      ? 'bg-cyan/20 text-cyan border border-cyan/30'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Board
                </button>
              </div>
              <select
                value={jobStageFilter}
                onChange={(e) => setJobStageFilter(e.target.value as JobStage | 'all')}
                className="bg-dark-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan/50"
              >
                <option value="all">All Stages</option>
                {JOB_STAGES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <button
                onClick={() => { setSelectedJob(null); setAddingJob(true); setJobTab('pipeline') }}
                className="flex items-center gap-1.5 bg-cyan text-dark px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-cyan/90"
              >
                <Plus className="w-4 h-4" /> New Job
              </button>
            </div>
          </div>

          {/* Add Job Form */}
          {addingJob && (
            <div className="glass rounded-lg p-4 border border-cyan/30">
              <h4 className="text-sm font-semibold text-white mb-3">New Job</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Job Title</label>
                  <input type="text" value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)}
                    placeholder="e.g. Full Roof Replacement"
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Address</label>
                  <input type="text" value={newJobAddress} onChange={(e) => setNewJobAddress(e.target.value)}
                    placeholder="Property address"
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Owner Name</label>
                  <input type="text" value={newJobOwner} onChange={(e) => setNewJobOwner(e.target.value)}
                    placeholder="Homeowner name"
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Contract Amount ($)</label>
                  <input type="number" value={newJobAmount} onChange={(e) => setNewJobAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (!newJobTitle.trim() || !newJobAddress.trim()) return
                    const newJob: Job = {
                      id: Math.random().toString(36).substr(2, 9),
                      property_id: null, client_id: null, proposal_id: null,
                      stage: 'sold',
                      title: newJobTitle.trim(),
                      address: newJobAddress.trim(),
                      owner_name: newJobOwner.trim() || null,
                      contract_amount: parseFloat(newJobAmount) || null,
                      contract_signed_at: new Date().toISOString(),
                      permit_number: null, permit_applied_at: null, permit_approved_at: null,
                      scheduled_date: null, crew_lead: null, crew_members: [],
                      started_at: null, completed_at: null,
                      invoice_number: null, invoice_sent_at: null,
                      amount_collected: null, collected_at: null,
                      insurance: null, photos: [],
                      notes: '',
                      created_at: new Date().toISOString()
                    }
                    const updated = [newJob, ...jobs]
                    setJobs(updated)
                    await saveJob(newJob)
                    setNewJobTitle(''); setNewJobAddress(''); setNewJobOwner(''); setNewJobAmount('')
                    setAddingJob(false)
                    setSelectedJob(newJob)
                    setJobTab('pipeline')
                  }}
                  className="bg-cyan text-dark px-4 py-2 rounded-lg text-sm font-semibold hover:bg-cyan/90"
                >Save Job</button>
                <button onClick={() => setAddingJob(false)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-dark-700">Cancel</button>
              </div>
            </div>
          )}

          {jobViewMode === 'list' ? (
            <div className="flex-1 flex gap-4 min-h-0">
              {/* Pipeline list */}
              <div className="w-72 flex-shrink-0 glass rounded-lg p-4 overflow-y-auto flex flex-col gap-2">
              <h4 className="text-xs text-gray-400 uppercase tracking-wide mb-1">
                {jobStageFilter === 'all' ? 'All Jobs' : JOB_STAGES.find(s => s.key === jobStageFilter)?.label}
                {' '}({jobs.filter(j => jobStageFilter === 'all' || j.stage === jobStageFilter).length})
              </h4>
              {jobs
                .filter(j => jobStageFilter === 'all' || j.stage === jobStageFilter)
                .map(job => {
                  const stage = JOB_STAGES.find(s => s.key === job.stage)
                  return (
                    <button
                      key={job.id}
                      onClick={() => { setSelectedJob(job); setJobTab('pipeline') }}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${selectedJob?.id === job.id ? 'border-cyan/50 bg-cyan/10' : 'border-white/5 bg-dark-700/50 hover:border-white/20'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-white truncate pr-2">{job.title}</p>
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: (stage?.color || '#666') + '33', color: stage?.color || '#999' }}>
                          {stage?.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{job.address}</p>
                      {job.contract_amount && (
                        <p className="text-xs text-green mt-1">${job.contract_amount.toLocaleString()}</p>
                      )}
                    </button>
                  )
                })}
              {jobs.filter(j => jobStageFilter === 'all' || j.stage === jobStageFilter).length === 0 && (
                <p className="text-xs text-gray-500 text-center py-4">No jobs in this stage</p>
              )}
            </div>

            {/* Job detail panel */}
            {selectedJob ? (
              <div className="flex-1 glass rounded-lg flex flex-col overflow-hidden">
                {/* Job detail header */}
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white">{selectedJob.title}</h3>
                      <p className="text-sm text-gray-400">{selectedJob.address}</p>
                      {selectedJob.owner_name && <p className="text-xs text-gray-500 mt-0.5">{selectedJob.owner_name}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedJob.stage}
                        onChange={async (e) => {
                          const newStage = e.target.value as JobStage
                          const updated = { ...selectedJob, stage: newStage }
                          setSelectedJob(updated)
                          setJobs(jobs.map(j => j.id === updated.id ? updated : j))
                          await saveJob(updated)
                          const stageLabel = JOB_STAGES.find(s => s.key === newStage)?.label || newStage
                          addNotification(`Job "${updated.title}" moved to ${stageLabel}`, 'info')
                        }}
                        className="bg-dark-700 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan/50"
                      >
                        {JOB_STAGES.map(s => (
                          <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          const stages = JOB_STAGES.map(s => s.key)
                          const idx = stages.indexOf(selectedJob.stage)
                          if (idx < stages.length - 1) {
                            const nextStage = stages[idx + 1]
                            let updated = { ...selectedJob, stage: nextStage }
                            // Auto-generate invoice number when advancing to invoice_sent
                            if (nextStage === 'invoice_sent' && !updated.invoice_number) {
                              updated.invoice_number = `INV-${Date.now().toString(36).toUpperCase()}`
                            }
                            setSelectedJob(updated)
                            setJobs(jobs.map(j => j.id === updated.id ? updated : j))
                            await saveJob(updated)
                            const stageLabel = JOB_STAGES.find(s => s.key === nextStage)?.label || nextStage
                            addNotification(`Job "${updated.title}" moved to ${stageLabel}`, 'info')
                          }
                        }}
                        className="flex items-center gap-1 bg-cyan/20 text-cyan px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-cyan/30"
                      >
                        Advance <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                      </button>
                      <button
                        onClick={() => {
                          setActiveScreen('materials')
                          setMaterialsTab('orders')
                          setAddingOrder(true)
                          const jobSelectEl = document.getElementById('order-job') as HTMLSelectElement
                          if (jobSelectEl) {
                            setTimeout(() => {
                              jobSelectEl.value = selectedJob.id
                            }, 100)
                          }
                          addNotification('Quick order form opened for this job', 'info')
                        }}
                        className="flex items-center gap-1 bg-green/20 text-green px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green/30"
                      >
                        <Package className="w-4 h-4" /> Quick Order
                      </button>
                    </div>
                  </div>
                  {/* Stage progress bar */}
                  <div className="flex gap-1 mt-3">
                    {JOB_STAGES.map((s, idx) => {
                      const currentIdx = JOB_STAGES.findIndex(x => x.key === selectedJob.stage)
                      const done = idx <= currentIdx
                      return (
                        <div key={s.key} className="flex-1 h-1.5 rounded-full transition-all"
                          style={{ backgroundColor: done ? s.color : '#374151' }}
                          title={s.label} />
                      )
                    })}
                  </div>
                  {/* Sub-tabs */}
                  <div className="flex gap-1 mt-3">
                    {(['pipeline', 'insurance', 'photos'] as const).map(tab => (
                      <button key={tab} onClick={() => setJobTab(tab)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${jobTab === tab ? 'bg-cyan/20 text-cyan' : 'text-gray-400 hover:text-white'}`}>
                        {tab === 'pipeline' ? '📋 Details' : tab === 'insurance' ? '🛡️ Insurance' : '📷 Photos'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Details tab */}
                {jobTab === 'pipeline' && (
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Contract Amount</label>
                        <input type="number" defaultValue={selectedJob.contract_amount || ''}
                          onBlur={async (e) => {
                            const updated = { ...selectedJob, contract_amount: parseFloat(e.target.value) || null }
                            setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                          }}
                          className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="$0.00" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Permit Number</label>
                        <input type="text" defaultValue={selectedJob.permit_number || ''}
                          onBlur={async (e) => {
                            const updated = { ...selectedJob, permit_number: e.target.value || null }
                            setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                          }}
                          className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="Permit #" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Scheduled Date</label>
                        <input type="date" defaultValue={selectedJob.scheduled_date || ''}
                          onBlur={async (e) => {
                            const updated = { ...selectedJob, scheduled_date: e.target.value || null }
                            setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                          }}
                          className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Crew Lead</label>
                        <input type="text" defaultValue={selectedJob.crew_lead || ''}
                          onBlur={async (e) => {
                            const updated = { ...selectedJob, crew_lead: e.target.value || null }
                            setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                          }}
                          className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="Lead name" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Crew Members</label>
                        <input type="text" defaultValue={selectedJob.crew_members?.join(', ') || ''}
                          onBlur={async (e) => {
                            const members = e.target.value ? e.target.value.split(',').map(m => m.trim()).filter(m => m) : []
                            const updated = { ...selectedJob, crew_members: members }
                            setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                          }}
                          className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="John, Jane, Mike..." />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Invoice Number</label>
                        <div className="mt-1 flex gap-2">
                          <input type="text" defaultValue={selectedJob.invoice_number || ''}
                            onBlur={async (e) => {
                              const updated = { ...selectedJob, invoice_number: e.target.value || null }
                              setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                            }}
                            className="flex-1 bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="INV-001" />
                          {!selectedJob.invoice_number && (
                            <button
                              onClick={async () => {
                                const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`
                                const updated = { ...selectedJob, invoice_number: invoiceNum }
                                setSelectedJob(updated)
                                setJobs(jobs.map(j => j.id === updated.id ? updated : j))
                                await saveJob(updated)
                              }}
                              className="bg-cyan/20 text-cyan hover:bg-cyan/30 px-3 py-2 rounded text-sm font-medium whitespace-nowrap"
                            >
                              Generate
                            </button>
                          )}
                          {selectedJob.invoice_number && (
                            <button
                              onClick={() => {
                                const job = selectedJob
                                if (!job) return
                                const settingsStr = localStorage.getItem('directive_company_settings')
                                const settings = settingsStr ? JSON.parse(settingsStr) : {}
                                const html = `
                                  <!DOCTYPE html>
                                  <html><head><title>Invoice ${job.invoice_number}</title>
                                  <style>
                                    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
                                    .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 3px solid #06b6d4; padding-bottom: 20px; }
                                    .company { font-size: 24px; font-weight: bold; color: #0d1117; }
                                    .invoice-title { font-size: 28px; color: #06b6d4; text-align: right; }
                                    .invoice-number { color: #666; font-size: 14px; }
                                    .bill-to { margin: 20px 0; }
                                    .bill-to h3 { color: #06b6d4; margin-bottom: 8px; }
                                    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
                                    th { background: #0d1117; color: #06b6d4; padding: 12px; text-align: left; }
                                    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
                                    .totals { text-align: right; margin-top: 20px; }
                                    .totals .line { display: flex; justify-content: flex-end; gap: 40px; padding: 4px 0; }
                                    .totals .total { font-size: 20px; font-weight: bold; color: #06b6d4; border-top: 2px solid #0d1117; padding-top: 8px; }
                                    .footer { margin-top: 60px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
                                    .terms { margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; }
                                    @media print { body { padding: 20px; } }
                                  </style></head><body>
                                  <div class="header">
                                    <div>
                                      <div class="company">${settings.company_name || 'Directive CRM'}</div>
                                      <div>${settings.company_phone || ''}</div>
                                      <div>License: ${settings.license_number || ''}</div>
                                    </div>
                                    <div>
                                      <div class="invoice-title">INVOICE</div>
                                      <div class="invoice-number">${job.invoice_number || ''}</div>
                                      <div class="invoice-number">Date: ${new Date().toLocaleDateString()}</div>
                                    </div>
                                  </div>
                                  <div class="bill-to">
                                    <h3>Bill To:</h3>
                                    <div><strong>${job.owner_name || 'Property Owner'}</strong></div>
                                    <div>${job.address || ''}</div>
                                  </div>
                                  <table>
                                    <thead><tr><th>Description</th><th>Amount</th></tr></thead>
                                    <tbody>
                                      <tr><td>${job.title || 'Roofing Services'}</td><td>$${(job.contract_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</td></tr>
                                    </tbody>
                                  </table>
                                  <div class="totals">
                                    <div class="line"><span>Subtotal:</span><span>$${(job.contract_amount || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>
                                    <div class="line"><span>Tax (${settings.tax_rate || 0}%):</span><span>$${((job.contract_amount || 0) * parseFloat(settings.tax_rate || '0') / 100).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>
                                    <div class="line total"><span>Total Due:</span><span>$${((job.contract_amount || 0) * (1 + parseFloat(settings.tax_rate || '0') / 100)).toLocaleString('en-US', {minimumFractionDigits: 2})}</span></div>
                                  </div>
                                  <div class="terms"><h4>Payment Terms</h4><p>${settings.payment_terms === '50_50' ? '50% due upon contract signing, 50% due upon completion.' : settings.payment_terms === 'net_30' ? 'Net 30 days from invoice date.' : '100% due upon completion of work.'}</p></div>
                                  <div class="footer">
                                    <p>Thank you for your business!</p>
                                    <p>${settings.company_name || 'Directive CRM'} | ${settings.company_phone || ''}</p>
                                  </div>
                                  </body></html>
                                `
                                const w = window.open('', '_blank')
                                if (w) {
                                  w.document.write(html)
                                  w.document.close()
                                  setTimeout(() => w.print(), 500)
                                }
                              }}
                              className="bg-green/20 text-green hover:bg-green/30 px-3 py-2 rounded text-sm font-medium whitespace-nowrap"
                            >
                              View/Print
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 uppercase tracking-wide">Amount Collected</label>
                        <input type="number" defaultValue={selectedJob.amount_collected || ''}
                          onBlur={async (e) => {
                            const updated = { ...selectedJob, amount_collected: parseFloat(e.target.value) || null }
                            setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                          }}
                          className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="$0.00" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 uppercase tracking-wide">Notes</label>
                      <textarea defaultValue={selectedJob.notes}
                        onBlur={async (e) => {
                          const updated = { ...selectedJob, notes: e.target.value }
                          setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                        }}
                        rows={3}
                        className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50 resize-none"
                        placeholder="Job notes..." />
                    </div>
                    <div className="pt-2 border-t border-white/10">
                      <button
                        onClick={async () => {
                          if (!confirm('Delete this job?')) return
                          await deleteJob(selectedJob.id)
                          setJobs(jobs.filter(j => j.id !== selectedJob.id))
                          setSelectedJob(null)
                        }}
                        className="text-xs text-red-400 hover:text-red-300 hover:underline"
                      >Delete job</button>
                    </div>
                  </div>
                )}

                {/* Insurance tab */}
                {jobTab === 'insurance' && (
                  <div className="flex-1 overflow-y-auto p-4">
                    {!selectedJob.insurance ? (
                      <div className="text-center py-8">
                        <ShieldCheck className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm mb-4">No insurance claim tracked yet</p>
                        <button
                          onClick={async () => {
                            const claim: InsuranceClaim = {
                              id: Math.random().toString(36).substr(2, 9),
                              job_id: selectedJob.id,
                              insurance_company: '',
                              claim_number: '',
                              adjuster_name: null, adjuster_phone: null, adjuster_email: null,
                              deductible: null, initial_payout: null, supplement_amount: null, final_payout: null,
                              status: 'pending',
                              notes: '',
                              created_at: new Date().toISOString()
                            }
                            const updated = { ...selectedJob, insurance: claim }
                            setSelectedJob(updated)
                            setJobs(jobs.map(j => j.id === updated.id ? updated : j))
                            await saveJob(updated)
                          }}
                          className="bg-cyan/20 text-cyan px-4 py-2 rounded-lg text-sm font-medium hover:bg-cyan/30"
                        >+ Add Insurance Claim</button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-cyan" /> Insurance Supplement Tracker
                          </h4>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            selectedJob.insurance.status === 'paid' ? 'bg-green/20 text-green' :
                            selectedJob.insurance.status === 'supplement_approved' ? 'bg-cyan/20 text-cyan' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {selectedJob.insurance.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-400 uppercase tracking-wide">Insurance Company</label>
                            <input type="text" defaultValue={selectedJob.insurance.insurance_company}
                              onBlur={async (e) => {
                                const updated = { ...selectedJob, insurance: { ...selectedJob.insurance!, insurance_company: e.target.value } }
                                setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                              }}
                              className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="State Farm" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 uppercase tracking-wide">Claim Number</label>
                            <input type="text" defaultValue={selectedJob.insurance.claim_number}
                              onBlur={async (e) => {
                                const updated = { ...selectedJob, insurance: { ...selectedJob.insurance!, claim_number: e.target.value } }
                                setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                              }}
                              className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="CLM-12345" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 uppercase tracking-wide">Adjuster Name</label>
                            <input type="text" defaultValue={selectedJob.insurance.adjuster_name || ''}
                              onBlur={async (e) => {
                                const updated = { ...selectedJob, insurance: { ...selectedJob.insurance!, adjuster_name: e.target.value || null } }
                                setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                              }}
                              className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="Adjuster name" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 uppercase tracking-wide">Adjuster Phone</label>
                            <input type="text" defaultValue={selectedJob.insurance.adjuster_phone || ''}
                              onBlur={async (e) => {
                                const updated = { ...selectedJob, insurance: { ...selectedJob.insurance!, adjuster_phone: e.target.value || null } }
                                setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                              }}
                              className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="Phone" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
                          {[
                            { label: 'Deductible', field: 'deductible' },
                            { label: 'Initial Payout', field: 'initial_payout' },
                            { label: 'Supplement Amount', field: 'supplement_amount' },
                            { label: 'Final Payout', field: 'final_payout' },
                          ].map(({ label, field }) => (
                            <div key={field}>
                              <label className="text-xs text-gray-400 uppercase tracking-wide">{label}</label>
                              <input type="number" step="0.01"
                                defaultValue={(selectedJob.insurance as unknown as Record<string, unknown>)[field] as number || ''}
                                onBlur={async (e) => {
                                  const updated = { ...selectedJob, insurance: { ...selectedJob.insurance!, [field]: parseFloat(e.target.value) || null } }
                                  setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                                }}
                                className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50" placeholder="$0.00" />
                            </div>
                          ))}
                        </div>
                        {(selectedJob.insurance.initial_payout || selectedJob.insurance.supplement_amount) && (
                          <div className="bg-dark-700/50 rounded-lg p-3 flex items-center justify-between">
                            <span className="text-sm text-gray-400">Total Expected</span>
                            <span className="text-lg font-bold text-green">
                              ${((selectedJob.insurance.initial_payout || 0) + (selectedJob.insurance.supplement_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-gray-400 uppercase tracking-wide">Claim Status</label>
                          <select defaultValue={selectedJob.insurance.status}
                            onChange={async (e) => {
                              const updated = { ...selectedJob, insurance: { ...selectedJob.insurance!, status: e.target.value as InsuranceClaim['status'] } }
                              setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                            }}
                            className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan/50">
                            <option value="pending">Pending</option>
                            <option value="adjuster_scheduled">Adjuster Scheduled</option>
                            <option value="inspection_done">Inspection Done</option>
                            <option value="supplement_submitted">Supplement Submitted</option>
                            <option value="supplement_approved">Supplement Approved</option>
                            <option value="paid">Paid</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 uppercase tracking-wide">Claim Notes</label>
                          <textarea defaultValue={selectedJob.insurance.notes} rows={3}
                            onBlur={async (e) => {
                              const updated = { ...selectedJob, insurance: { ...selectedJob.insurance!, notes: e.target.value } }
                              setSelectedJob(updated); setJobs(jobs.map(j => j.id === updated.id ? updated : j)); await saveJob(updated)
                            }}
                            className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan/50 resize-none"
                            placeholder="Adjuster notes, supplement strategy..." />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Photos tab */}
                {jobTab === 'photos' && (
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Camera className="w-4 h-4 text-cyan" /> Photo Documentation
                      </h4>
                      <div className="flex items-center gap-2">
                        <select value={photoCategory} onChange={(e) => setPhotoCategory(e.target.value as PhotoCategory)}
                          className="bg-dark-700 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-cyan/50">
                          <option value="overall_roof">Overall Roof</option>
                          <option value="ridge">Ridge</option>
                          <option value="valleys">Valleys</option>
                          <option value="gutters">Gutters</option>
                          <option value="downspouts">Downspouts</option>
                          <option value="skylights">Skylights</option>
                          <option value="interior_damage">Interior Damage</option>
                          <option value="before">Before</option>
                          <option value="after">After</option>
                          <option value="other">Other</option>
                        </select>
                        <button
                          onClick={() => photoInputRef.current?.click()}
                          className="flex items-center gap-1.5 bg-cyan/20 text-cyan px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-cyan/30"
                        >
                          <Camera className="w-3 h-3" /> Add Photo
                        </button>
                        <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = async (ev) => {
                              const dataUrl = ev.target?.result as string
                              const newPhoto: JobPhoto = {
                                id: Math.random().toString(36).substr(2, 9),
                                job_id: selectedJob.id,
                                category: photoCategory,
                                data_url: dataUrl,
                                caption: '',
                                taken_at: new Date().toISOString()
                              }
                              const updated = { ...selectedJob, photos: [...selectedJob.photos, newPhoto] }
                              setSelectedJob(updated)
                              setJobs(jobs.map(j => j.id === updated.id ? updated : j))
                              await saveJob(updated)
                            }
                            reader.readAsDataURL(file)
                            e.target.value = ''
                          }}
                        />
                      </div>
                    </div>
                    {selectedJob.photos.length === 0 ? (
                      <div className="text-center py-10">
                        <Camera className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-400 text-sm">No photos yet</p>
                        <p className="text-gray-500 text-xs mt-1">Select a category and tap Add Photo</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        {selectedJob.photos.map(photo => (
                          <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-white/10">
                            <img src={photo.data_url} alt={photo.caption || photo.category}
                              className="w-full h-28 object-cover" />
                            <div className="absolute bottom-0 left-0 right-0 bg-dark/80 px-2 py-1">
                              <p className="text-xs text-gray-300">{photo.category.replace(/_/g, ' ')}</p>
                            </div>
                            <button
                              onClick={async () => {
                                const updated = { ...selectedJob, photos: selectedJob.photos.filter(p => p.id !== photo.id) }
                                setSelectedJob(updated)
                                setJobs(jobs.map(j => j.id === updated.id ? updated : j))
                                await saveJob(updated)
                              }}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 glass rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <Briefcase className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Select a job to view details</p>
                  <p className="text-gray-500 text-xs mt-1">or create a new job to get started</p>
                </div>
              </div>
            )}

            {/* Stage summary strip - visible in list view */}
            <div className="glass rounded-lg p-3">
              <div className="flex gap-2 overflow-x-auto">
                {JOB_STAGES.map(stage => {
                  const count = jobs.filter(j => j.stage === stage.key).length
                  const value = jobs.filter(j => j.stage === stage.key).reduce((sum, j) => sum + (j.contract_amount || 0), 0)
                  return (
                    <button key={stage.key}
                      onClick={() => setJobStageFilter(jobStageFilter === stage.key ? 'all' : stage.key)}
                      className={`flex-shrink-0 px-3 py-2 rounded-lg text-center transition-all border ${jobStageFilter === stage.key ? 'border-cyan/50 bg-cyan/10' : 'border-white/5 bg-dark-700/30 hover:border-white/20'}`}
                    >
                      <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ backgroundColor: stage.color }} />
                      <p className="text-xs font-semibold text-white">{count}</p>
                      <p className="text-xs text-gray-500 whitespace-nowrap">{stage.label}</p>
                      {value > 0 && <p className="text-xs text-green mt-0.5">${(value / 1000).toFixed(0)}k</p>}
                    </button>
                  )
                })}
              </div>
            </div>
            </div>
          ) : (
            // KANBAN BOARD VIEW
            <div className="flex-1 flex gap-3 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
              {JOB_STAGES.map(stage => {
                const stageJobs = jobs.filter(j => j.stage === stage.key)
                return (
                  <div key={stage.key} className="flex-shrink-0 w-64">
                    <div className="glass rounded-lg p-3 mb-2">
                      <h3 className="text-sm font-bold text-white">{stage.label}</h3>
                      <span className="text-xs text-cyan">{stageJobs.length} jobs</span>
                    </div>
                    <div className="space-y-2">
                      {stageJobs.map(job => (
                        <div
                          key={job.id}
                          className="glass rounded-lg p-3 cursor-pointer hover:border-cyan/30 border border-transparent transition-all"
                          onClick={() => setSelectedJob(job)}
                        >
                          <p className="text-sm text-white font-medium truncate">{job.title}</p>
                          <p className="text-xs text-gray-400">{job.owner_name}</p>
                          <p className="text-sm text-cyan font-bold mt-2">${(job.contract_amount || 0).toLocaleString()}</p>
                        </div>
                      ))}
                      {stageJobs.length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-4">No jobs</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* SCREEN: SETTINGS */}
      {activeScreen === 'settings' && (
        <div className="absolute inset-4 top-[184px] z-30 flex gap-4 h-[calc(100vh-224px)]">
          <div className="w-full glass rounded-lg p-8 overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-8">Settings</h2>

            {/* Account */}
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Account</h3>
              <div className="bg-dark-700/50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-white font-medium">Email</p>
                    <p className="text-xs text-gray-400">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => signOut()}
                  className="px-4 py-2 bg-red/20 text-red-400 rounded-lg text-sm hover:bg-red/30 transition-all"
                >
                  Sign Out
                </button>
              </div>
            </section>

            {/* Company Info */}
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Company Info</h3>
              <div className="bg-dark-700/50 rounded-lg p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Company Name</label>
                  <input
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    placeholder="Your Company Name"
                    value={companySettings.company_name}
                    onChange={(e) => setCompanySettings({ ...companySettings, company_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Phone Number</label>
                  <input
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    placeholder="Phone Number"
                    value={companySettings.company_phone}
                    onChange={(e) => setCompanySettings({ ...companySettings, company_phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">License Number</label>
                  <input
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    placeholder="License #"
                    value={companySettings.license_number}
                    onChange={(e) => setCompanySettings({ ...companySettings, license_number: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Territory */}
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Territory</h3>
              <div className="bg-dark-700/50 rounded-lg p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Home Office City</label>
                  <input
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    placeholder="Huntsville, AL"
                    value={companySettings.home_city}
                    onChange={(e) => setCompanySettings({ ...companySettings, home_city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Service Radius (miles)</label>
                  <input
                    type="number"
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    placeholder="25"
                    value={companySettings.service_radius}
                    onChange={(e) => setCompanySettings({ ...companySettings, service_radius: e.target.value })}
                  />
                </div>
              </div>
            </section>

            {/* Proposal Defaults */}
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Proposal Defaults</h3>
              <div className="bg-dark-700/50 rounded-lg p-4 space-y-3">
                <div>
                  <label className="text-xs text-gray-400">Default Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    placeholder="8.5"
                    value={companySettings.tax_rate}
                    onChange={(e) => setCompanySettings({ ...companySettings, tax_rate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Default Payment Terms</label>
                  <select
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    value={companySettings.payment_terms}
                    onChange={(e) => setCompanySettings({ ...companySettings, payment_terms: e.target.value })}
                  >
                    <option value="50_50">50% deposit, 50% on completion</option>
                    <option value="100_completion">100% on completion</option>
                    <option value="net_30">Net 30</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Warranty Period</label>
                  <select
                    className="mt-1 w-full bg-dark-700 border border-white/10 rounded px-3 py-2 text-sm text-white"
                    value={companySettings.warranty_period}
                    onChange={(e) => setCompanySettings({ ...companySettings, warranty_period: e.target.value })}
                  >
                    <option value="1">1 year workmanship</option>
                    <option value="2">2 year workmanship</option>
                    <option value="5">5 year workmanship</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Notifications */}
            <section className="mb-8">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Notifications</h3>
              <div className="bg-dark-700/50 rounded-lg p-4 space-y-4">
                {[
                  { key: 'storm', label: 'Storm alerts in territory', desc: 'Get notified when severe weather hits your zip codes' },
                  { key: 'leads', label: 'New leads from Michael AI', desc: 'Daily lead recommendations from the AI engine' },
                  { key: 'status', label: 'Proposal viewed by client', desc: 'When a client opens your proposal' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-white">{label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (key === 'storm') setCompanySettings({ ...companySettings, notify_storm: !companySettings.notify_storm })
                        else if (key === 'leads') setCompanySettings({ ...companySettings, notify_leads: !companySettings.notify_leads })
                        else if (key === 'status') setCompanySettings({ ...companySettings, notify_status: !companySettings.notify_status })
                      }}
                      className={`w-10 h-5 rounded-full flex-shrink-0 relative cursor-pointer transition-all ${
                        (key === 'storm' ? companySettings.notify_storm : key === 'leads' ? companySettings.notify_leads : companySettings.notify_status)
                          ? 'bg-cyan/30'
                          : 'bg-white/10'
                      }`}
                    >
                      <div
                        className={`absolute w-4 h-4 bg-cyan rounded-full transition-all ${
                          (key === 'storm' ? companySettings.notify_storm : key === 'leads' ? companySettings.notify_leads : companySettings.notify_status)
                            ? 'right-0.5 top-0.5'
                            : 'left-0.5 top-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Save Button */}
            <section className="mb-8">
              <button
                onClick={() => {
                  localStorage.setItem('directive_company_settings', JSON.stringify(companySettings))
                  setSettingsSaved(true)
                  setTimeout(() => setSettingsSaved(false), 2000)
                }}
                className="px-6 py-3 bg-cyan/20 text-cyan rounded-lg text-sm font-semibold hover:bg-cyan/30 transition-all"
              >
                {settingsSaved ? 'Saved!' : 'Save Settings'}
              </button>
            </section>
          </div>
        </div>
      )}

      {/* Animation Keyframes */}
      <style jsx global>{`
        @keyframes stormPulse {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.02); }
        }
        @keyframes stormSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
