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

export type Screen = 'dashboard' | 'territory' | 'sweep' | 'stormscope' | 'michael' | 'clients' | 'proposals' | 'materials' | 'team'

export interface Client {
  id: string
  property_id: string
  status: 'new_lead' | 'contacted' | 'proposal_sent' | 'scheduled' | 'complete' | 'lost'
  notes: string
  last_contact: string | null
  assigned_to: string | null
  created_at: string
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
