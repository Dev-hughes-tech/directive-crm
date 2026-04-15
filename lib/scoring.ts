/**
 * Lead scoring and activity logging utilities.
 * Extracted from page.tsx for testability and reuse.
 */

import type { Property } from '@/lib/types'
import { saveActivity } from '@/lib/storage'

/** Returns a lead score 10–99 based on property data. */
export function calculateLeadScore(property: Property): number {
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
  if (
    property.listing_status &&
    (property.listing_status.toLowerCase().includes('for sale') ||
      property.listing_status.toLowerCase().includes('listed'))
  ) {
    score -= 15
  }

  // Recent roof permit penalty
  if (
    property.permit_count !== null &&
    property.permit_count > 0 &&
    property.roof_age_years !== null &&
    property.roof_age_years < 5
  ) {
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

/** Returns a Tailwind badge class string for a given lead score. */
export function getScoreBadgeColor(score: number | null): string {
  if (score === null) return 'bg-gray-700 text-gray-300'
  if (score >= 70) return 'bg-green/20 text-green border border-green/30'
  if (score >= 50) return 'bg-amber/20 text-amber border border-amber/30'
  return 'bg-red/20 text-red border border-red/30'
}

/** Logs a client activity to localStorage and Supabase (fire-and-forget). */
export function logClientActivity(
  clientId: string,
  action: string,
  activities: Record<string, Array<{ action: string; timestamp: string }>>
): Record<string, Array<{ action: string; timestamp: string }>> {
  const timestamp = new Date().toISOString()
  const newActivities = { ...activities }
  if (!newActivities[clientId]) newActivities[clientId] = []
  newActivities[clientId] = [...newActivities[clientId], { action, timestamp }]
  localStorage.setItem('directive_client_activities', JSON.stringify(newActivities))
  // Also persist to Supabase activity_log (fire-and-forget)
  saveActivity({
    entityType: 'client',
    entityId: clientId,
    action: 'update',
    metadata: { note: action },
  }).catch(() => {})
  return newActivities
}
