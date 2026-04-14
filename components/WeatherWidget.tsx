'use client'
import { useState, useEffect } from 'react'
import { Cloud, AlertTriangle, Wind, Droplets, Gauge } from 'lucide-react'
import { authFetch } from '@/lib/authFetch'

interface WeatherData {
  conditions: string | null
  windSpeed: number | null
  windUnit: string
  precipitation: number | null
  temperature: number | null
  tempUnit: string
  humidity: number | null
  alerts: string[]
}

interface WeatherWidgetProps {
  lat: number
  lng: number
  compact?: boolean
}

export default function WeatherWidget({ lat, lng, compact = false }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!lat || !lng) return
    setLoading(true)
    setError(false)
    authFetch(`/api/google-weather?lat=${lat}&lng=${lng}`)
      .then(r => r.json())
      .then(data => {
        if (!data.error) setWeather(data)
        else setError(true)
      })
      .catch(() => { setError(true) })
      .finally(() => setLoading(false))
  }, [lat, lng])

  if (loading) return <div className="text-white/30 text-xs animate-pulse">Loading weather...</div>
  if (error || !weather) return null

  const tempF = weather.temperature
    ? weather.tempUnit === 'CELSIUS'
      ? Math.round(weather.temperature * 9 / 5 + 32)
      : Math.round(weather.temperature)
    : null

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs text-white/70 flex-wrap">
        {tempF !== null && <span className="text-white font-medium">{tempF}°F</span>}
        {weather.conditions && <span className="text-white/60">{weather.conditions}</span>}
        {weather.alerts.length > 0 && (
          <span className="text-amber-400 font-medium">⚠ {weather.alerts[0]}</span>
        )}
      </div>
    )
  }

  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Cloud className="w-6 h-6 text-white/60" />
          <div>
            {tempF !== null && <div className="text-2xl font-bold text-white">{tempF}°F</div>}
            {weather.conditions && <div className="text-xs text-white/60">{weather.conditions}</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {weather.windSpeed !== null && (
          <div className="flex items-center gap-2 text-white/60">
            <Wind className="w-4 h-4" />
            <span>{Math.round(weather.windSpeed)} {weather.windUnit}</span>
          </div>
        )}
        {weather.precipitation !== null && (
          <div className="flex items-center gap-2 text-white/60">
            <Droplets className="w-4 h-4" />
            <span>{weather.precipitation}% rain</span>
          </div>
        )}
        {weather.humidity !== null && (
          <div className="flex items-center gap-2 text-white/60">
            <Gauge className="w-4 h-4" />
            <span>{weather.humidity}% humidity</span>
          </div>
        )}
      </div>

      {weather.alerts.length > 0 && (
        <div className="mt-2 space-y-1">
          {weather.alerts.map((alert, i) => (
            <div key={i} className="text-xs text-amber-400 bg-amber-400/10 rounded px-2 py-1 flex items-start gap-2">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{alert}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
