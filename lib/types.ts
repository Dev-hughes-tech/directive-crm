// ===== Directive CRM Core Types =====

export interface Property {
  id: string
  address: string
  lat: number
  lng: number
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  year_built: number | null
  roof_age_years: number | null
  market_value: number | null
  assessed_value: number | null
  last_sale_date: string | null
  last_sale_price: number | null
  county: string | null
  parcel_id: string | null
  permit_count: number | null
  permit_last_date: string | null
  flags: string[]
  sources: Record<string, string>
  score: number | null
  created_at: string
  sqft: number | null
  lot_sqft: number | null
  bedrooms: number | null
  bathrooms: number | null
  appraised_value: number | null
  listing_status: string | null
  listing_price: number | null
  hoa_monthly: number | null
  subdivision: string | null
  occupancy_type: string | null
  property_class: string | null
  land_use: string | null
  deed_date: string | null
  deed_type: string | null
  deed_book: string | null
  tax_annual: number | null
  neighborhood: string | null
  owner_age: number | null
  roof_age_estimated: boolean
  storm_history: {
    hailEvents: Array<{ date: string | null; size: number | null; severity: string }>
    totalHailEvents: number
    maxHailSize: number | null
    lastHailDate: string | null
    severeHailCount: number
    tornadoEvents: Array<{ date: string | null; magnitude: string | null }>
    totalTornadoEvents: number
    lastTornadoDate: string | null
    windEvents: Array<{ date: string | null; speed: number | null }>
    totalWindEvents: number
    maxWindSpeed: number | null
    lastWindDate: string | null
    stormRiskLevel: string
  } | null
  roof_area_sqft: number | null
  roof_pitch: string | null
  roof_pitch_degrees: number | null
  pitch_multiplier: number | null
  roofing_squares: number | null
  roof_segments: number | null
  roof_segment_details: Array<{ name: string; area: number }> | null
  satellite_image_url: string | null
  roof_imagery_date: string | null
  roof_imagery_quality: string | null
}

export interface Territory {
  id: string
  name: string
  zips: string[]
  center_lat: number
  center_lng: number
  property_count: number
  avg_roof_age: number | null
  storm_events_90d: number
}

export interface DashboardStats {
  total_properties: number
  avg_roof_age: number | null
  active_alerts: number
  pipeline_value: number
  territories: number
  sweep_count: number
}

export interface WeatherCurrent {
  temperature_f: number | null
  wind_speed_mph: number | null
  wind_direction: string | null
  humidity_pct: number | null
  pressure_inhg: number | null
  conditions: string | null
  station: string | null
  observed_at: string | null
}

export interface WeatherAlert {
  id: string
  event: string
  severity: string
  headline: string
  description: string
  onset: string | null
  expires: string | null
  sender: string
}

export interface ForecastPeriod {
  name: string
  temperature: number
  temperatureUnit: string
  windSpeed: string
  windDirection: string
  shortForecast: string
  detailedForecast: string
  isDaytime: boolean
  icon: string
}

export interface NoaaHailEvent {
  lat: number
  lng: number
  size: number
  date: string
  severity: string
}

export interface StormEvent {
  event_type: string
  begin_date: string
  end_date: string
  magnitude: number | null
  damage_property: string | null
  injuries: number
  deaths: number
  description: string
}

export type Screen = 'dashboard' | 'territory' | 'sweep' | 'stormscope' | 'roof_analyzer' | 'dimensions' | 'michael' | 'clients' | 'email' | 'proposals' | 'estimates' | 'materials' | 'team' | 'jobs' | 'timeline' | 'settings'

export type JobStage =
  | 'sold'
  | 'permit_applied'
  | 'permit_approved'
  | 'crew_scheduled'
  | 'in_progress'
  | 'final_inspection'
  | 'supplement_filed'
  | 'invoice_sent'
  | 'collected'

export const JOB_STAGES: { key: JobStage; label: string; color: string }[] = [
  { key: 'sold',             label: 'Sold',              color: '#06B6D4' },
  { key: 'permit_applied',   label: 'Permit Applied',    color: '#8B5CF6' },
  { key: 'permit_approved',  label: 'Permit Approved',   color: '#A78BFA' },
  { key: 'crew_scheduled',   label: 'Crew Scheduled',    color: '#F59E0B' },
  { key: 'in_progress',      label: 'In Progress',       color: '#FB923C' },
  { key: 'final_inspection', label: 'Final Inspection',  color: '#60A5FA' },
  { key: 'supplement_filed', label: 'Supplement Filed',  color: '#F472B6' },
  { key: 'invoice_sent',     label: 'Invoice Sent',      color: '#34D399' },
  { key: 'collected',        label: 'Collected',         color: '#10B981' },
]

export type PhotoCategory =
  | 'overall_roof'
  | 'ridge'
  | 'valleys'
  | 'gutters'
  | 'downspouts'
  | 'skylights'
  | 'interior_damage'
  | 'before'
  | 'after'
  | 'other'

export interface JobPhoto {
  id: string
  job_id: string
  category: PhotoCategory
  data_url: string
  caption: string
  taken_at: string
}

export interface InsuranceClaim {
  id: string
  job_id: string
  insurance_company: string
  claim_number: string
  adjuster_name: string | null
  adjuster_phone: string | null
  adjuster_email: string | null
  deductible: number | null
  initial_payout: number | null
  supplement_amount: number | null
  final_payout: number | null
  status: 'pending' | 'adjuster_scheduled' | 'inspection_done' | 'supplement_submitted' | 'supplement_approved' | 'paid'
  notes: string
  created_at: string
}

export interface Job {
  id: string
  property_id: string | null
  client_id: string | null
  proposal_id: string | null
  stage: JobStage
  title: string
  address: string
  owner_name: string | null
  contract_amount: number | null
  contract_signed_at: string | null
  permit_number: string | null
  permit_applied_at: string | null
  permit_approved_at: string | null
  scheduled_date: string | null
  crew_lead: string | null
  crew_members: string[]
  started_at: string | null
  completed_at: string | null
  invoice_number: string | null
  invoice_sent_at: string | null
  amount_collected: number | null
  collected_at: string | null
  insurance: InsuranceClaim | null
  photos: JobPhoto[]
  notes: string
  created_at: string
}

export interface Client {
  id: string
  property_id: string
  status: 'new_lead' | 'contacted' | 'proposal_sent' | 'scheduled' | 'complete' | 'lost'
  notes: string
  last_contact: string | null
  assigned_to: string | null
  created_at: string
  damage_notes?: string | null
  inspection_findings?: string | null
  damage_severity?: 'none' | 'minor' | 'moderate' | 'severe' | 'total_loss' | null
  layers_of_shingles?: number | null
  assessment_date?: string | null
}

export interface Proposal {
  id: string
  client_id: string
  property_id: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  line_items: ProposalLineItem[]
  total: number
  notes: string
  created_at: string
  sent_at: string | null
}

export interface ProposalLineItem {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
}

export interface Material {
  id: string
  name: string
  category: 'shingles' | 'underlayment' | 'flashing' | 'fasteners' | 'ventilation' | 'other'
  unit: string
  unit_cost: number
  supplier: string
  supplier_phone: string | null
  notes: string
}

export interface ChatMessage {
  id: string
  channel: string
  sender_name: string
  sender_role: 'rep' | 'manager'
  message: string
  timestamp: string
  read: boolean
}
