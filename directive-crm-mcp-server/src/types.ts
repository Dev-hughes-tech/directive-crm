// API Response Types
export interface ResearchResponse {
  data?: {
    ownerName: string | null;
    ownerPhone: string | null;
    ownerEmail: string | null;
    yearBuilt: number | null;
    marketValue: number | null;
    assessedValue: number | null;
    lastSaleDate: string | null;
    lastSalePrice: number | null;
    permitCount: number | null;
    roofAgeYears: number | null;
    county: string | null;
    parcelId: string | null;
    flags: string[];
    sources: Record<string, boolean>;
  };
  error?: string;
}

export interface GeocodeResponse {
  lat: number;
  lng: number;
  display_name: string;
}

export interface WeatherCurrentResponse {
  temperature_f: number;
  wind_speed_mph: number;
  wind_direction: string;
  humidity_pct: number;
  pressure_inhg: number;
  conditions: string;
  station: string;
  observed_at: string;
}

export interface WeatherAlert {
  id: string;
  event: string;
  severity: string;
  headline: string;
  description: string;
  onset: string;
  expires: string;
  sender: string;
}

export interface ForecastPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  isDaytime: boolean;
}

export interface HailEvent {
  lat: number;
  lng: number;
  size: number;
  date: string;
  severity: string;
}

export interface MichaelResponse {
  reply: string;
}

export interface MichaelMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Computed Types
export interface LeadScore {
  score: number;
  confidence: string;
  reasons: string[];
}

export interface StormRisk {
  riskLevel: 'High' | 'Moderate' | 'Low';
  score: number;
  factors: string[];
}

export interface PropertyCard {
  address: string;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  yearBuilt: number | null;
  roofAgeYears: number | null;
  marketValue: number | null;
  assessedValue: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  permitCount: number | null;
  county: string | null;
  parcelId: string | null;
  flags: string[];
  leadScore: LeadScore;
}

export interface PropertyReport {
  address: string;
  geocoding: {
    lat: number;
    lng: number;
    display_name: string;
  };
  property: PropertyCard;
  weather: {
    current: WeatherCurrentResponse;
    alerts: WeatherAlert[];
    forecast: ForecastPeriod[];
  };
  stormRisk: StormRisk;
  hailEvents: HailEvent[];
}
