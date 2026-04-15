'use client'

import { useState, useRef, useEffect } from 'react'
import {
  BarChart3, Navigation, Brain, Users, MoreHorizontal,
  Search, MapPin, Cloud, AlertTriangle, Phone, Mail,
  FileText, Package, MessageSquare, Briefcase, Settings,
  Radio, ChevronRight, X, Plus, Send, Loader2,
  Home, Zap, Shield, Star, Clock, CheckCircle2, CalendarDays, Calculator
} from 'lucide-react'
import type { Property, Client, Proposal, Job, Screen } from '@/lib/types'
import type { WeatherCurrent, WeatherAlert } from '@/lib/types'
import { getTierConfig, canAccess, TIER_DESCRIPTIONS } from '@/lib/tiers'
import type { UserRole } from '@/lib/tiers'
import { saveClient, saveProperty, saveJob } from '@/lib/storage'
import { JOB_STAGES } from '@/lib/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface MobileLayoutProps {
  // Auth
  user: { id: string; email: string | undefined } | null
  userRole: UserRole
  onSignOut: () => void

  // Navigation
  activeScreen: Screen
  setActiveScreen: (s: Screen) => void

  // Properties / Sweep
  properties: Property[]
  sweepAddress: string
  setSweepAddress: (a: string) => void
  sweepLoading: boolean
  sweepPhase: 'idle' | 'geocoding' | 'researching' | 'scoring'
  sweepResult: Property | null
  sweepError: string | null
  onSweepResearch: () => void
  onSaveProperty: (p: Property) => void

  // Weather
  weather: WeatherCurrent | null
  alerts: WeatherAlert[]
  forecast: Array<{ name: string; temperature: number; shortForecast: string; isDaytime: boolean }>

  // Clients
  clients: Client[]
  selectedClient: Client | null
  setSelectedClient: (c: Client | null) => void
  onSaveClient: (c: Client) => void

  // Proposals
  proposals: Proposal[]
  setSelectedProposal: (p: Proposal | null) => void

  // Michael AI
  michaelZip: string
  setMichaelZip: (z: string) => void
  michaelLeadsLoading: boolean
  michaelLeads: Array<{ address: string; reason: string; score: number; source: string; roofAge: number | null; stormHits: number }>
  michaelStormData: { riskLevel: string; hailCount: number; tornadoCount: number; city: string; state: string; yearsAnalyzed: number; maxHailSize: number; severeHailCount: number } | null
  onMichaelSearch: (zip: string) => void

  // Chat
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  chatInput: string
  setChatInput: (v: string) => void
  chatLoading: boolean
  onSendChat: () => void

  // Storm
  stormImpactZones: Array<{ zip: string; city: string; riskLevel: string; hailCount: number; tornadoCount: number }>

  // Jobs (mobile pipeline)
  jobs: Job[]
  onSaveJob: (j: Job) => void

  // Settings (mobile)
  companySettings: { company_name: string; company_phone: string; license_number: string; home_city: string; service_radius: string; tax_rate: string; payment_terms: string; warranty_period: string; notify_storm: boolean; notify_leads: boolean; notify_status: boolean }
  onSaveSettings: () => void
  settingsSaved: boolean
  setCompanySettings: (s: { company_name: string; company_phone: string; license_number: string; home_city: string; service_radius: string; tax_rate: string; payment_terms: string; warranty_period: string; notify_storm: boolean; notify_leads: boolean; notify_status: boolean }) => void
}

// ── Score color helper ────────────────────────────────────────────────────

function scoreColor(score: number | null) {
  if (!score) return 'text-gray-400'
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function riskColor(level: string) {
  if (level === 'Critical' || level === 'High') return 'text-red-400 bg-red-400/10 border-red-400/20'
  if (level === 'Moderate') return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
  return 'text-green-400 bg-green-400/10 border-green-400/20'
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function MobileLayout(props: MobileLayoutProps) {
  const [clientFilter, setClientFilter] = useState<'all' | 'new_lead' | 'contacted' | 'proposal_sent' | 'scheduled' | 'complete'>('all')

  const {
    user, userRole, onSignOut,
    activeScreen, setActiveScreen,
    properties, sweepAddress, setSweepAddress, sweepLoading, sweepPhase,
    sweepResult, sweepError, onSweepResearch, onSaveProperty,
    weather, alerts, forecast,
    clients, selectedClient, setSelectedClient, onSaveClient,
    proposals, setSelectedProposal,
    michaelZip, setMichaelZip, michaelLeadsLoading, michaelLeads, michaelStormData, onMichaelSearch,
    chatMessages, chatInput, setChatInput, chatLoading, onSendChat,
    stormImpactZones,
    jobs, onSaveJob,
    companySettings, onSaveSettings, settingsSaved, setCompanySettings,
  } = props

  const [showMore, setShowMore] = useState(false)
  const [mobileTab, setMobileTab] = useState<'dashboard' | 'sweep' | 'michael' | 'clients' | 'more'>('dashboard')
  const [michaelLocalTab, setMichaelLocalTab] = useState<'leads' | 'chat'>('leads')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Sync mobileTab ↔ activeScreen
  const navigate = (tab: typeof mobileTab, screen?: Screen) => {
    setMobileTab(tab)
    if (screen) setActiveScreen(screen)
    setShowMore(false)
  }

  // Hot leads from properties
  const hotLeads = properties
    .filter(p => p.roof_age_years !== null && p.roof_age_years >= 15)
    .sort((a, b) => (b.roof_age_years || 0) - (a.roof_age_years || 0))
    .slice(0, 5)

  // Filtered clients based on status filter
  const filteredClients = clientFilter === 'all'
    ? clients
    : clients.filter(c => c.status === clientFilter)

  // ── SCREENS ────────────────────────────────────────────────────────────────

  const renderDashboard = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Hero Stats — compact 9:16 grid */}
      <div className="px-3 pt-3 grid grid-cols-2 gap-2">
        <div className="bg-[#0d1117] border border-white/10 rounded-xl p-3">
          <p className="text-2xl font-bold text-cyan-400 leading-none">{properties.length}</p>
          <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Properties Scanned</p>
        </div>
        <div className="bg-[#0d1117] border border-white/10 rounded-xl p-3">
          <p className="text-2xl font-bold text-green-400 leading-none">
            {properties.filter(p => p.roof_age_years !== null && p.roof_age_years >= 15).length}
          </p>
          <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Qualifying Roofs</p>
        </div>
        <div className="bg-[#0d1117] border border-white/10 rounded-xl p-3">
          <p className="text-2xl font-bold text-amber-400 leading-none">
            {properties.length > 0
              ? Math.round(properties.reduce((s, p) => s + (p.roof_age_years || 0), 0) / properties.length)
              : '—'}
          </p>
          <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Avg Roof Age (yr)</p>
        </div>
        <div className="bg-[#0d1117] border border-white/10 rounded-xl p-3">
          <p className="text-2xl font-bold text-red-400 leading-none">
            {properties.filter(p => p.roof_age_years !== null && p.roof_age_years >= 20).length}
          </p>
          <p className="text-[10px] text-gray-400 mt-1.5 leading-tight">Critical (20+ yr)</p>
        </div>
      </div>

      {/* Weather Alert Banner — 9:16 compact */}
      {alerts.length > 0 && (
        <div className="mx-3 mt-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-300 truncate">{alerts[0].event}</p>
            <p className="text-[10px] text-amber-400/70 mt-0.5 line-clamp-2">{alerts[0].headline}</p>
          </div>
        </div>
      )}

      {/* Current Weather — 9:16 compact */}
      {weather && (
        <div className="mx-3 mt-2 bg-[#0d1117] border border-white/10 rounded-xl p-3">
          <div className="flex justify-between items-center mb-1.5">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Current Weather</p>
            <Cloud className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-white leading-none">{weather.temperature_f}°</p>
              <p className="text-[10px] text-gray-500 mt-1">Temp</p>
            </div>
            <div>
              <p className="text-xl font-bold text-cyan-400 leading-none">{weather.wind_speed_mph}</p>
              <p className="text-[10px] text-gray-500 mt-1">mph</p>
            </div>
            <div>
              <p className="text-xl font-bold text-blue-400 leading-none">{weather.humidity_pct}%</p>
              <p className="text-[10px] text-gray-500 mt-1">Humidity</p>
            </div>
          </div>
          {weather.conditions && <p className="text-[10px] text-gray-400 mt-1.5 text-center truncate">{weather.conditions}</p>}
        </div>
      )}

      {/* Quick Actions — 9:16 compact */}
      <div className="px-3 mt-3">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Quick Actions</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => navigate('sweep', 'sweep')}
            className="bg-cyan-400/10 border border-cyan-400/20 rounded-xl p-3 flex flex-col items-start gap-1 active:scale-95 transition-transform"
          >
            <Navigation className="w-5 h-5 text-cyan-400" />
            <p className="text-xs font-semibold text-white">GPS Sweep</p>
            <p className="text-[10px] text-gray-400 truncate w-full">Research address</p>
          </button>
          <button
            onClick={() => navigate('michael', 'michael')}
            className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 flex flex-col items-start gap-1 active:scale-95 transition-transform"
          >
            <Brain className="w-5 h-5 text-purple-400" />
            <p className="text-xs font-semibold text-white">Michael AI</p>
            <p className="text-[10px] text-gray-400 truncate w-full">ZIP leads</p>
          </button>
          <button
            onClick={() => navigate('clients', 'clients')}
            className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex flex-col items-start gap-1 active:scale-95 transition-transform"
          >
            <Users className="w-5 h-5 text-green-400" />
            <p className="text-xs font-semibold text-white">Clients</p>
            <p className="text-[10px] text-gray-400 truncate w-full">{clients.length} in pipeline</p>
          </button>
          <button
            onClick={() => { setShowMore(true); setMobileTab('more') }}
            className="bg-gray-700/30 border border-white/10 rounded-xl p-3 flex flex-col items-start gap-1 active:scale-95 transition-transform"
          >
            <MoreHorizontal className="w-5 h-5 text-gray-400" />
            <p className="text-xs font-semibold text-white">More</p>
            <p className="text-[10px] text-gray-400 truncate w-full">All features</p>
          </button>
        </div>
      </div>

      {/* Hot Leads — 9:16 compact */}
      {hotLeads.length > 0 && (
        <div className="px-3 mt-3 mb-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Hot Leads — Aging Roofs</p>
          <div className="space-y-1.5">
            {hotLeads.map(p => (
              <button
                key={p.id}
                onClick={() => { setSweepAddress(p.address); navigate('sweep', 'sweep') }}
                className="w-full bg-[#0d1117] border border-white/10 rounded-lg p-3 text-left flex justify-between items-center gap-2 active:bg-white/5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white truncate">{p.address}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate">{p.owner_name || 'Unknown owner'}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-base font-bold leading-none ${p.roof_age_years! >= 20 ? 'text-red-400' : 'text-amber-400'}`}>
                    {p.roof_age_years}yr
                  </p>
                  <p className="text-[9px] text-gray-500 mt-0.5">roof age</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const renderSweep = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* Search Bar */}
      <div className="px-4 pt-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={sweepAddress}
            onChange={e => { setSweepAddress(e.target.value); }}
            onKeyDown={e => e.key === 'Enter' && !sweepLoading && onSweepResearch()}
            placeholder="Enter address to research..."
            className="flex-1 bg-[#161b22] border border-white/20 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/50 text-sm"
          />
          <button
            onClick={onSweepResearch}
            disabled={sweepLoading || !sweepAddress.trim()}
            className="bg-cyan-400 text-[#0d1117] w-12 rounded-xl flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform flex-shrink-0"
          >
            {sweepLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </button>
        </div>

        {/* Phase indicator */}
        {sweepLoading && (
          <div className="mt-3 bg-cyan-400/10 border border-cyan-400/20 rounded-xl p-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-cyan-400 animate-spin flex-shrink-0" />
            <p className="text-sm text-cyan-300">
              {sweepPhase === 'geocoding' ? 'Finding address...' : sweepPhase === 'researching' ? 'Researching property data...' : 'Scoring lead...'}
            </p>
          </div>
        )}

        {sweepError && (
          <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <p className="text-sm text-red-300">{sweepError}</p>
          </div>
        )}
      </div>

      {/* Result Card */}
      {sweepResult && !sweepLoading && (
        <div className="px-3 mt-3 space-y-2.5">
          {/* Address Header */}
          <div className="bg-[#161b22] border border-cyan-400/20 rounded-xl p-3.5">
            <div className="flex justify-between items-start mb-2.5 gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-cyan-400 uppercase tracking-wide mb-0.5">Property Research</p>
                <p className="text-sm font-semibold text-white leading-tight break-words">{sweepResult.address}</p>
              </div>
              <button
                onClick={() => onSaveProperty(sweepResult)}
                className="bg-cyan-400 text-[#0d1117] text-[10px] font-bold px-2.5 py-1.5 rounded-lg flex-shrink-0 active:scale-95 transition-transform"
              >
                Save Lead
              </button>
            </div>

            {/* Owner Info */}
            <div className="space-y-2">
              {sweepResult.owner_name && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-cyan-400/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-cyan-400">{sweepResult.owner_name[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{sweepResult.owner_name}</p>
                    <p className="text-xs text-gray-400">Property Owner</p>
                  </div>
                </div>
              )}
              {sweepResult.owner_phone && (
                <a href={`tel:${sweepResult.owner_phone}`} className="flex items-center gap-3 text-cyan-400 active:opacity-70">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{sweepResult.owner_phone}</span>
                </a>
              )}
              {sweepResult.owner_email && (
                <a href={`mailto:${sweepResult.owner_email}`} className="flex items-center gap-3 text-cyan-400 active:opacity-70">
                  <Mail className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{sweepResult.owner_email}</span>
                </a>
              )}
            </div>
          </div>

          {/* Property Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Roof Age', value: sweepResult.roof_age_years ? `${sweepResult.roof_age_years} yrs${sweepResult.roof_age_estimated ? ' (est.)' : ''}` : '—', highlight: sweepResult.roof_age_years !== null && sweepResult.roof_age_years >= 20 },
              { label: 'Year Built', value: sweepResult.year_built || '—', highlight: false },
              { label: 'Market Value', value: sweepResult.market_value ? `$${sweepResult.market_value.toLocaleString()}` : '—', highlight: false },
              { label: 'Sqft', value: sweepResult.sqft ? sweepResult.sqft.toLocaleString() : '—', highlight: false },
              { label: 'Bedrooms', value: sweepResult.bedrooms || '—', highlight: false },
              { label: 'Assessed', value: sweepResult.assessed_value ? `$${sweepResult.assessed_value.toLocaleString()}` : '—', highlight: false },
              { label: 'Annual Tax', value: sweepResult.tax_annual ? `$${sweepResult.tax_annual.toLocaleString()}` : '—', highlight: false },
              { label: 'Parcel ID', value: sweepResult.parcel_id || '—', highlight: false },
            ].map(({ label, value, highlight }) => (
              <div key={label} className={`bg-[#0d1117] border rounded-lg p-2.5 ${highlight ? 'border-red-400/30 bg-red-400/5' : 'border-white/10'}`}>
                <p className="text-[10px] text-gray-400 truncate">{label}</p>
                <p className={`text-sm font-bold mt-0.5 truncate ${highlight ? 'text-red-400' : 'text-white'}`}>{String(value)}</p>
              </div>
            ))}
          </div>

          {/* Occupancy */}
          {sweepResult.occupancy_type && (
            <div className="bg-[#0d1117] border border-white/10 rounded-xl p-3">
              <p className="text-xs text-gray-400">Occupancy</p>
              <p className="text-sm font-medium text-white mt-0.5">{sweepResult.occupancy_type}</p>
            </div>
          )}

          {/* Storm History */}
          {sweepResult.storm_history && (
            <div className={`border rounded-2xl p-4 ${sweepResult.storm_history.stormRiskLevel === 'high' ? 'bg-red-400/5 border-red-400/20' : sweepResult.storm_history.stormRiskLevel === 'moderate' ? 'bg-amber-400/5 border-amber-400/20' : 'bg-green-400/5 border-green-400/20'}`}>
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-semibold text-white">Storm History (5yr)</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${sweepResult.storm_history.stormRiskLevel === 'high' ? 'bg-red-400/20 text-red-400' : sweepResult.storm_history.stormRiskLevel === 'moderate' ? 'bg-amber-400/20 text-amber-400' : 'bg-green-400/20 text-green-400'}`}>
                  {sweepResult.storm_history.stormRiskLevel} risk
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-amber-400">{sweepResult.storm_history.totalHailEvents}</p>
                  <p className="text-xs text-gray-400">Hail</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-400">{sweepResult.storm_history.totalTornadoEvents}</p>
                  <p className="text-xs text-gray-400">Tornado</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-cyan-400">{sweepResult.storm_history.totalWindEvents}</p>
                  <p className="text-xs text-gray-400">Wind</p>
                </div>
              </div>
            </div>
          )}

          {/* Flags */}
          {sweepResult.flags && sweepResult.flags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sweepResult.flags.map(flag => (
                <span key={flag} className={`text-xs px-3 py-1 rounded-full font-medium ${flag.includes('old') || flag.includes('high') ? 'bg-red-400/15 text-red-400' : 'bg-gray-700 text-gray-300'}`}>
                  {flag.replace(/-/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!sweepResult && !sweepLoading && (
        <div className="px-4 mt-8 text-center">
          <Navigation className="w-16 h-16 text-cyan-400/20 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Enter any address above to research the property</p>
          <p className="text-gray-600 text-xs mt-2">Owner info, roof age, storm history, market value and more</p>

          {/* Recent searches */}
          {properties.length > 0 && (
            <div className="mt-6 text-left">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Recent Properties</p>
              <div className="space-y-2">
                {properties.slice(0, 4).map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSweepAddress(p.address)}
                    className="w-full bg-[#0d1117] border border-white/10 rounded-xl p-3 text-left flex justify-between items-center active:bg-white/5"
                  >
                    <p className="text-sm text-white truncate flex-1">{p.address}</p>
                    <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderMichael = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      {/* ZIP Search — 9:16 compact */}
      <div className="px-3 pt-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={michaelZip}
            onChange={e => setMichaelZip(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && michaelZip.trim().length >= 5 && onMichaelSearch(michaelZip.trim())}
            placeholder="Enter ZIP (e.g. 35801)..."
            maxLength={10}
            className="flex-1 bg-[#161b22] border border-white/20 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-purple-400/50 text-sm"
          />
          <button
            onClick={() => michaelZip.trim().length >= 5 && onMichaelSearch(michaelZip.trim())}
            disabled={michaelLeadsLoading || michaelZip.trim().length < 5}
            className="bg-purple-500 text-white w-11 rounded-lg flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform flex-shrink-0"
          >
            {michaelLeadsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">10-year NOAA analysis for lead generation</p>
      </div>

      {/* Storm Summary — 9:16 compact */}
      {michaelStormData && (
        <div className={`mx-3 mt-2 border rounded-xl p-3 ${riskColor(michaelStormData.riskLevel)}`}>
          <div className="flex justify-between items-center mb-2 gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{michaelZip} — {michaelStormData.city}</p>
              <p className="text-[10px] opacity-70">{michaelStormData.yearsAnalyzed}-year NOAA analysis</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-current whitespace-nowrap">{michaelStormData.riskLevel}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div>
              <p className="text-base font-bold text-amber-400 leading-none">{michaelStormData.hailCount}</p>
              <p className="text-[10px] opacity-60 mt-1">Hail</p>
            </div>
            <div>
              <p className="text-base font-bold text-red-400 leading-none">{michaelStormData.tornadoCount}</p>
              <p className="text-[10px] opacity-60 mt-1">Tornado</p>
            </div>
            <div>
              <p className="text-base font-bold text-cyan-400 leading-none">{michaelStormData.severeHailCount}</p>
              <p className="text-[10px] opacity-60 mt-1">Severe</p>
            </div>
            <div>
              <p className="text-base font-bold text-white leading-none">{michaelStormData.maxHailSize.toFixed(1)}"</p>
              <p className="text-[10px] opacity-60 mt-1">Max</p>
            </div>
          </div>

          {/* Historical breakdown — matches HWEL visual language */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-[10px] text-cyan-400 uppercase tracking-wide mb-1.5 font-semibold">Historical Weather Event Archive</p>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="bg-black/30 rounded p-1.5">
                <p className="text-sm font-bold text-white leading-none">
                  {Math.round((michaelStormData.hailCount + michaelStormData.tornadoCount) / michaelStormData.yearsAnalyzed)}
                </p>
                <p className="text-[9px] opacity-60 mt-0.5">Events/yr avg</p>
              </div>
              <div className="bg-black/30 rounded p-1.5">
                <p className="text-sm font-bold text-amber-400 leading-none">
                  {michaelStormData.hailCount > 0 ? ((michaelStormData.severeHailCount / michaelStormData.hailCount) * 100).toFixed(0) : 0}%
                </p>
                <p className="text-[9px] opacity-60 mt-0.5">Severe rate</p>
              </div>
              <div className="bg-black/30 rounded p-1.5">
                <p className="text-sm font-bold text-red-400 leading-none">
                  {michaelStormData.tornadoCount + michaelStormData.severeHailCount}
                </p>
                <p className="text-[9px] opacity-60 mt-0.5">Major events</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex mx-4 mt-4 bg-[#0d1117] rounded-xl p-1 gap-1">
        <button
          onClick={() => setMichaelLocalTab('leads')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${michaelLocalTab === 'leads' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-400'}`}
        >
          AI Leads {michaelLeads.length > 0 && <span className="ml-1 bg-purple-500 text-white text-xs px-1.5 rounded-full">{michaelLeads.length}</span>}
        </button>
        <button
          onClick={() => setMichaelLocalTab('chat')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${michaelLocalTab === 'chat' ? 'bg-cyan-400/20 text-cyan-300' : 'text-gray-400'}`}
        >
          Chat
        </button>
      </div>

      {/* Leads */}
      {michaelLocalTab === 'leads' && (
        <div className="px-4 mt-3 space-y-3">
          {michaelLeadsLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-300">Analyzing storm data for ZIP {michaelZip}...</p>
              <p className="text-xs text-gray-500 mt-1">Querying 10 years of NOAA records</p>
            </div>
          )}
          {!michaelLeadsLoading && michaelLeads.length === 0 && (
            <div className="text-center py-12">
              <Brain className="w-12 h-12 text-purple-400/20 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Enter a ZIP code above to generate leads</p>
            </div>
          )}
          {michaelLeads.map((lead, i) => (
            <div key={i} className="bg-[#0d1117] border border-white/10 rounded-2xl p-4">
              <div className="flex gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 border-2 ${lead.score >= 85 ? 'border-green-400 bg-green-400/10 text-green-400' : lead.score >= 70 ? 'border-amber-400 bg-amber-400/10 text-amber-400' : 'border-gray-600 bg-gray-700/30 text-gray-400'}`}>
                  {lead.score}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-snug">{lead.address}</p>
                  <p className="text-xs text-gray-400 mt-1">{lead.reason}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {lead.roofAge && <span className="text-xs bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full">~{lead.roofAge}yr roof</span>}
                    {lead.stormHits > 0 && <span className="text-xs bg-red-400/10 text-red-400 px-2 py-0.5 rounded-full">{lead.stormHits} hits</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setSweepAddress(lead.address); navigate('sweep', 'sweep') }}
                className="w-full mt-3 py-2 bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 rounded-xl text-sm font-medium active:bg-cyan-400/20 transition-colors"
              >
                Research in Sweep
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Chat */}
      {michaelLocalTab === 'chat' && (
        <div className="px-4 mt-3">
          <div className="bg-[#0d1117] border border-white/10 rounded-2xl overflow-hidden">
            <div className="h-64 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="flex items-center justify-center h-full text-center">
                  <div>
                    <Brain className="w-10 h-10 text-cyan-400/20 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Ask Michael about your leads or territory</p>
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-cyan-400 text-[#0d1117]' : 'bg-[#161b22] text-gray-200'}`}>
                    <p className="break-words">{msg.content}</p>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#161b22] px-3 py-2 rounded-2xl flex gap-1">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 p-3 border-t border-white/10">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !chatLoading && onSendChat()}
                placeholder="Ask Michael..."
                className="flex-1 bg-[#161b22] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
              />
              <button
                onClick={onSendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-cyan-400 text-[#0d1117] w-10 rounded-xl flex items-center justify-center disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const renderClients = () => {
    if (selectedClient) {
      const prop = properties.find(p => p.id === selectedClient.property_id)
      return (
        <div className="flex-1 overflow-y-auto pb-24">
          {/* Back */}
          <button
            onClick={() => setSelectedClient(null)}
            className="flex items-center gap-2 px-4 pt-4 text-cyan-400 text-sm active:opacity-70"
          >
            Back to clients
          </button>

          <div className="px-4 mt-4 space-y-3">
            {/* Property header */}
            <div className="bg-[#0d1117] border border-cyan-400/20 rounded-2xl p-5">
              <p className="text-xs text-cyan-400 uppercase tracking-wide mb-1">Property</p>
              <p className="text-base font-semibold text-white">{prop?.address || '—'}</p>
              <p className="text-sm text-gray-400 mt-1">{prop?.owner_name || 'Unknown Owner'}</p>

              {prop && (
                <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                  {prop.owner_phone && (
                    <a href={`tel:${prop.owner_phone}`} className="flex items-center gap-2 text-cyan-400">
                      <Phone className="w-4 h-4" />{prop.owner_phone}
                    </a>
                  )}
                  {prop.roof_age_years && (
                    <div><span className="text-gray-400">Roof: </span><span className={prop.roof_age_years >= 20 ? 'text-red-400 font-bold' : 'text-amber-400'}>{prop.roof_age_years}yr</span></div>
                  )}
                  {prop.market_value && (
                    <div><span className="text-gray-400">Value: </span><span className="text-white">${prop.market_value.toLocaleString()}</span></div>
                  )}
                  {prop.sqft && (
                    <div><span className="text-gray-400">Sqft: </span><span className="text-white">{prop.sqft.toLocaleString()}</span></div>
                  )}
                </div>
              )}
            </div>

            {/* Status */}
            <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-4">
              <p className="text-xs text-gray-400 mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {(['new_lead','contacted','proposal_sent','scheduled','complete','lost'] as const).map(s => (
                  <button
                    key={s}
                    onClick={async () => {
                      const updated = { ...selectedClient, status: s }
                      setSelectedClient(updated)
                      await onSaveClient(updated)
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${selectedClient.status === s ? 'bg-cyan-400 text-[#0d1117]' : 'bg-[#161b22] text-gray-300'}`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-[#0d1117] border border-white/10 rounded-2xl p-4">
              <p className="text-xs text-gray-400 mb-2">Notes</p>
              <textarea
                value={selectedClient.notes}
                onChange={async e => {
                  const updated = { ...selectedClient, notes: e.target.value }
                  setSelectedClient(updated)
                }}
                onBlur={async () => { await onSaveClient(selectedClient) }}
                className="w-full bg-[#161b22] border border-white/10 rounded-xl px-3 py-2 text-sm text-white h-24 focus:outline-none"
                placeholder="Add notes..."
              />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">CRM Pipeline</h2>
            <span className="text-sm text-gray-400">{clients.length} clients</span>
          </div>

          {/* Status filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {(['all','new_lead','contacted','proposal_sent','scheduled','complete'] as const).map(s => (
              <button
                key={s}
                onClick={() => setClientFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                  clientFilter === s
                    ? 'bg-cyan-500/30 border border-cyan-500/40 text-cyan-400'
                    : 'bg-[#0d1117] border border-white/10 text-gray-300'
                }`}
              >
                {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <div className="space-y-2 mt-4">
            {filteredClients.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No clients yet</p>
                <p className="text-xs text-gray-500 mt-1">Research a property in Sweep and save it as a lead</p>
              </div>
            ) : (
              filteredClients.map(client => {
                const prop = properties.find(p => p.id === client.property_id)
                const statusColors: Record<string, string> = {
                  new_lead: 'text-cyan-400 bg-cyan-400/10',
                  contacted: 'text-amber-400 bg-amber-400/10',
                  proposal_sent: 'text-yellow-400 bg-yellow-400/10',
                  scheduled: 'text-green-400 bg-green-400/10',
                  complete: 'text-green-300 bg-green-300/10',
                  lost: 'text-red-400 bg-red-400/10',
                }
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className="w-full bg-[#0d1117] border border-white/10 rounded-xl p-4 text-left flex justify-between items-center active:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{prop?.address || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{prop?.owner_name || 'Unknown Owner'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[client.status] || 'text-gray-400 bg-gray-700'}`}>
                          {client.status.replace(/_/g, ' ')}
                        </span>
                        {prop?.roof_age_years && (
                          <span className={`text-xs ${prop.roof_age_years >= 20 ? 'text-red-400' : 'text-amber-400'}`}>
                            {prop.roof_age_years}yr roof
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-500 flex-shrink-0 ml-3" />
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Mobile Jobs ─────────────────────────────────────────────────────────────
  const renderJobs = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => { setMobileTab('more') }} className="text-cyan-400 text-sm active:opacity-70">← Back</button>
          <h2 className="text-base font-bold text-white ml-1">Production Jobs</h2>
          <span className="ml-auto px-2 py-0.5 rounded-full bg-cyan-400/20 text-cyan-400 text-xs font-semibold">{jobs.length}</span>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No jobs yet</p>
            <p className="text-xs text-gray-500 mt-1">Create jobs from the desktop app</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => {
              const stage = JOB_STAGES.find(s => s.key === job.stage)
              const stages = JOB_STAGES.map(s => s.key)
              const idx = stages.indexOf(job.stage)
              const canAdvance = idx < stages.length - 1
              return (
                <div key={job.id} className="bg-[#161b22] border border-white/10 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{job.title}</p>
                      <p className="text-xs text-gray-400 truncate">{job.address}</p>
                      {job.contract_amount && (
                        <p className="text-xs text-green-400 mt-0.5 font-semibold">${job.contract_amount.toLocaleString()}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: (stage?.color || '#666') + '33', color: stage?.color || '#999' }}>
                      {stage?.label}
                    </span>
                  </div>
                  {/* Stage progress bar */}
                  <div className="flex gap-0.5 mb-3">
                    {JOB_STAGES.map((s, i) => (
                      <div key={s.key} className="flex-1 h-1 rounded-full"
                        style={{ backgroundColor: i <= idx ? s.color : '#374151' }} />
                    ))}
                  </div>
                  {canAdvance && (
                    <button
                      onClick={async () => {
                        const nextStage = stages[idx + 1]
                        const updated = { ...job, stage: nextStage as Job['stage'] }
                        await saveJob(updated)
                        onSaveJob(updated)
                      }}
                      className="w-full py-2 rounded-lg text-xs font-semibold bg-cyan-400/20 text-cyan-400 active:bg-cyan-400/30 transition-colors"
                    >
                      Advance → {JOB_STAGES[idx + 1]?.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  // ── Mobile Settings ───────────────────────────────────────────────────────
  const renderSettings = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 pt-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => { setMobileTab('more') }} className="text-cyan-400 text-sm active:opacity-70">← Back</button>
          <h2 className="text-base font-bold text-white ml-1">Settings</h2>
        </div>

        <div className="bg-[#161b22] border border-white/10 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Company</p>
          {[
            { label: 'Company Name', key: 'company_name' as const, placeholder: 'Your Company' },
            { label: 'Phone', key: 'company_phone' as const, placeholder: '(555) 000-0000' },
            { label: 'License #', key: 'license_number' as const, placeholder: 'License number' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <input
                type="text"
                value={companySettings[key]}
                onChange={e => setCompanySettings({ ...companySettings, [key]: e.target.value })}
                placeholder={placeholder}
                className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400/50"
              />
            </div>
          ))}
        </div>

        <button
          onClick={onSaveSettings}
          className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${settingsSaved ? 'bg-green-500/20 text-green-400' : 'bg-cyan-400/20 text-cyan-400 active:bg-cyan-400/30'}`}
        >
          {settingsSaved ? '✓ Saved!' : 'Save Settings'}
        </button>

        <div className="bg-[#161b22] border border-white/10 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-1">Account</p>
          <p className="text-sm text-white mb-3">{user?.email}</p>
          <button
            onClick={onSignOut}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-red-500/10 text-red-400 border border-red-500/20"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )

  const renderMore = () => (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 pt-4 space-y-2">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">All Features</p>

        {[
          { screen: 'territory' as Screen, label: 'Territory', icon: MapPin, desc: 'Property map & route planning', color: 'text-blue-400 bg-blue-400/10', feature: 'territory' as const },
          { screen: 'stormscope' as Screen, label: 'StormScope', icon: Radio, desc: 'Live radar & storm alerts', color: 'text-amber-400 bg-amber-400/10', feature: 'stormscope' as const },
          { screen: 'jobs' as Screen, label: 'Jobs', icon: Briefcase, desc: 'Production pipeline & insurance', color: 'text-orange-400 bg-orange-400/10', feature: 'jobs' as const },
          { screen: 'timeline' as Screen, label: 'Timeline', icon: CalendarDays, desc: 'Job milestones & activity', color: 'text-cyan-400 bg-cyan-400/10', feature: 'timeline' as const },
          { screen: 'proposals' as Screen, label: 'Proposals', icon: FileText, desc: 'Create & manage proposals', color: 'text-yellow-400 bg-yellow-400/10', feature: 'proposals' as const },
          { screen: 'estimates' as Screen, label: 'Smart Estimates', icon: Calculator, desc: 'AI-powered line-item estimates', color: 'text-teal-400 bg-teal-400/10', feature: 'smartEstimates' as const },
          { screen: 'materials' as Screen, label: 'Materials', icon: Package, desc: 'Calculator & estimating', color: 'text-green-400 bg-green-400/10', feature: 'materials' as const },
          { screen: 'team' as Screen, label: 'Team', icon: MessageSquare, desc: 'Chat with your team', color: 'text-purple-400 bg-purple-400/10', feature: 'team' as const },
          { screen: 'settings' as Screen, label: 'Settings', icon: Settings, desc: 'Account & preferences', color: 'text-gray-400 bg-gray-400/10', feature: 'settings' as const },
        ].map(item => {
          const Icon = item.icon
          const locked = !canAccess(userRole, item.feature)
          return (
            <button
              key={item.screen}
              onClick={() => !locked && navigate('more', item.screen)}
              className={`w-full bg-[#0d1117] border border-white/10 rounded-xl p-4 flex items-center gap-4 text-left transition-colors ${locked ? 'opacity-50' : 'active:bg-white/5'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
              {locked ? <span className="text-gray-600 text-sm">🔒</span> : <ChevronRight className="w-5 h-5 text-gray-500" />}
            </button>
          )
        })}

        {/* Account card */}
        <div className="mt-4 bg-[#0d1117] border border-white/10 rounded-2xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm font-semibold text-white">{user?.email}</p>
              <p className="text-xs font-bold mt-0.5" style={{ color: getTierConfig(userRole).color }}>
                {getTierConfig(userRole).name} Plan
              </p>
            </div>
            <button
              onClick={onSignOut}
              className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Render current screen content ─────────────────────────────────────────
  const renderContent = () => {
    // Screens with full mobile renderers
    if (mobileTab === 'more') {
      if (activeScreen === 'jobs') return renderJobs()
      if (activeScreen === 'settings') return renderSettings()
      // Screens not yet mobile-optimised
      if (activeScreen !== 'dashboard' && activeScreen !== 'sweep' && activeScreen !== 'michael' && activeScreen !== 'clients') {
        return (
          <div className="flex-1 overflow-y-auto pb-24">
            <button
              onClick={() => { setMobileTab('more') }}
              className="flex items-center gap-2 px-4 pt-4 text-cyan-400 text-sm active:opacity-70 mb-3"
            >
              ← Back
            </button>
            <div className="px-4">
              <p className="text-lg font-bold text-white mb-4">
                {activeScreen.charAt(0).toUpperCase() + activeScreen.slice(1).replace('-', ' ')}
              </p>
              <div className="bg-[#161b22] border border-white/10 rounded-2xl p-6 text-center">
                <p className="text-sm text-gray-400">This screen is optimized for desktop.</p>
                <p className="text-xs text-gray-500 mt-2">Open on a larger screen for the full {activeScreen} experience.</p>
                <p className="text-xs text-cyan-400 mt-3">Mobile: Dashboard, Sweep, Michael AI, Clients, Jobs, Settings</p>
              </div>
            </div>
          </div>
        )
      }
    }

    switch (mobileTab) {
      case 'dashboard': return renderDashboard()
      case 'sweep': return renderSweep()
      case 'michael': return renderMichael()
      case 'clients': return renderClients()
      case 'more': return renderMore()
      default: return renderDashboard()
    }
  }

  // ── Bottom Nav ─────────────────────────────────────────────────────────────
  const navItems = [
    { tab: 'dashboard' as const, icon: BarChart3, label: 'Home' },
    { tab: 'sweep' as const, icon: Navigation, label: 'Sweep' },
    { tab: 'michael' as const, icon: Brain, label: 'Michael' },
    { tab: 'clients' as const, icon: Users, label: 'Clients' },
    { tab: 'more' as const, icon: MoreHorizontal, label: 'More' },
  ]

  return (
    <div className="fixed inset-0 bg-[#0d1117] flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Top Bar — 9:16 optimized */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#0d1117]/95 backdrop-blur-md" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
        <img
          src="/directive-wordmark.png"
          alt="Directive CRM"
          className="h-10 w-auto object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[10px] text-green-400 font-medium">LIVE</span>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold border whitespace-nowrap"
            style={{
              color: getTierConfig(userRole).color,
              borderColor: getTierConfig(userRole).color + '40',
              backgroundColor: getTierConfig(userRole).color + '15',
            }}
          >
            {getTierConfig(userRole).name}
          </span>
        </div>
      </div>

      {/* Screen Title — 9:16 compact */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-white/5">
        <h1 className="text-sm font-bold text-white">
          {mobileTab === 'dashboard' ? 'Dashboard' :
           mobileTab === 'sweep' ? 'GPS Sweep' :
           mobileTab === 'michael' ? 'Michael AI' :
           mobileTab === 'clients' ? 'CRM Clients' : 'More'}
        </h1>
      </div>

      {/* Content */}
      {renderContent()}

      {/* Bottom Navigation */}
      <div className="flex-shrink-0 border-t border-white/10 bg-[#0d1117]/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex">
          {navItems.map(item => {
            const Icon = item.icon
            const active = mobileTab === item.tab
            return (
              <button
                key={item.tab}
                onClick={() => navigate(item.tab)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors active:opacity-70 relative ${active ? 'text-cyan-400' : 'text-gray-500'}`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-cyan-400' : 'text-gray-500'}`} />
                <span className={`text-[10px] font-medium ${active ? 'text-cyan-400' : 'text-gray-500'}`}>{item.label}</span>
                {active && <div className="absolute bottom-0 w-8 h-0.5 bg-cyan-400 rounded-full" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
