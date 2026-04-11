'use client'

import type { Property } from '@/lib/types'

interface PropertyGraphProps {
  properties: Property[]
  center: { lat: number; lng: number }
}

export default function PropertyGraph({ properties, center }: PropertyGraphProps) {
  const displayProps = properties.slice(0, 6)

  // Generate positions for property nodes in hexagonal layout around center
  const radius = 100
  const positions = displayProps.map((_, i) => {
    const angle = (i * 360) / Math.max(displayProps.length, 1)
    const rad = (angle * Math.PI) / 180
    return {
      x: 140 + radius * Math.cos(rad),
      y: 140 + radius * Math.sin(rad),
    }
  })

  const getScoreColor = (score: number | null) => {
    if (score === null) return '#6b7280'
    if (score >= 70) return '#22c55e'
    if (score >= 50) return '#f59e0b'
    return '#ef4444'
  }

  const calculateScore = (p: Property) => {
    let score = 50
    if (p.roof_age_years !== null) {
      if (p.roof_age_years >= 20) score += 35
      else if (p.roof_age_years >= 15) score += 20
    }
    if (p.owner_phone !== null) score += 15
    if (p.market_value !== null && p.market_value > 200000) score += 10
    if (p.permit_count !== null && p.permit_count > 0) score -= 10
    return Math.max(10, Math.min(99, score))
  }

  return (
    <div className="glass rounded-lg p-4 w-full max-h-72 overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Property Network</h3>

      <svg className="w-full max-h-48" viewBox="0 0 280 280">
        {/* Center hub */}
        <circle cx="140" cy="140" r="24" fill="#06b6d4" opacity="0.2" />
        <circle cx="140" cy="140" r="16" fill="#06b6d4" opacity="0.6" />
        <text x="140" y="145" textAnchor="middle" className="text-xs font-semibold fill-cyan" fontSize="10">
          HUB
        </text>

        {/* Lines from hub to properties */}
        {positions.map((pos, i) => (
          <line
            key={`line-${i}`}
            x1="140"
            y1="140"
            x2={pos.x}
            y2={pos.y}
            stroke="rgba(6,182,212,0.2)"
            strokeWidth="1"
          />
        ))}

        {/* Property nodes */}
        {displayProps.map((prop, i) => {
          const pos = positions[i]
          const score = calculateScore(prop)
          const color = getScoreColor(score)

          const addressLine = prop.address.split(',')[0].slice(0, 12)

          return (
            <g key={prop.id}>
              {/* Node circle */}
              <circle cx={pos.x} cy={pos.y} r="14" fill={color} opacity="0.3" />
              <circle cx={pos.x} cy={pos.y} r="10" fill={color} opacity="0.7" />

              {/* Address label below */}
              <text
                x={pos.x}
                y={pos.y + 28}
                textAnchor="middle"
                className="text-xs fill-gray-300"
                fontSize="9"
              >
                {addressLine}
              </text>

              {/* Score in node */}
              <text x={pos.x} y={pos.y + 3} textAnchor="middle" className="text-xs font-bold fill-white" fontSize="10">
                {score}
              </text>

              {/* Roof age label */}
              {prop.roof_age_years !== null && (
                <text
                  x={pos.x}
                  y={pos.y + 42}
                  textAnchor="middle"
                  className="text-xs fill-gray-400"
                  fontSize="8"
                >
                  {prop.roof_age_years}y old
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {displayProps.length === 0 && (
        <div className="flex items-center justify-center h-72 text-gray-400 text-sm">
          No properties in territory yet
        </div>
      )}
    </div>
  )
}
