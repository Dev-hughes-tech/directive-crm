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
  flags: string[]
  sources: Record<string, string>
  score: number | null
  created_at: string
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

export type Screen = 'dashboard' | 'territory' | 'sweep' | 'stormscope' | 'michael'
