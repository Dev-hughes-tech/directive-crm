export const SEVERE_HAIL_THRESHOLD_INCHES = 2

export type HailSeverity = 'severe' | 'moderate' | 'minor'

export interface HailEventIdentity {
  provider?: string | null
  providerEventId?: string | null
  type?: string | null
  date?: string | null
  lat?: number | null
  lng?: number | null
  size?: number | null
}

function parseHailNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseEventDate(date: string | null | undefined): Date | null {
  if (!date) return null

  if (/^\d{14}$/.test(date)) {
    const year = Number.parseInt(date.slice(0, 4), 10)
    const month = Number.parseInt(date.slice(4, 6), 10) - 1
    const day = Number.parseInt(date.slice(6, 8), 10)
    const hour = Number.parseInt(date.slice(8, 10), 10)
    const minute = Number.parseInt(date.slice(10, 12), 10)
    const second = Number.parseInt(date.slice(12, 14), 10)
    return new Date(Date.UTC(year, month, day, hour, minute, second))
  }

  const parsed = Date.parse(date)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed)
}

function normalizeEventTimestamp(date: string | null | undefined): string {
  const parsed = parseEventDate(date)
  if (!parsed) return 'unknown-time'

  const rounded = new Date(Math.round(parsed.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000))
  return rounded.toISOString().slice(0, 16)
}

function roundCoordinate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'na'
  return value.toFixed(3)
}

function roundSize(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'na'
  return value.toFixed(1)
}

export function classifyHailSeverity(size: number | string | null | undefined): HailSeverity {
  const parsedSize = parseHailNumber(size)
  if (parsedSize === null) return 'minor'
  if (parsedSize >= SEVERE_HAIL_THRESHOLD_INCHES) return 'severe'
  if (parsedSize >= 1) return 'moderate'
  return 'minor'
}

export function countSevereHailEvents<T>(
  events: T[],
  getSize: (event: T) => number | string | null | undefined,
): number {
  return events.filter(event => classifyHailSeverity(getSize(event)) === 'severe').length
}

export function buildHailEventKey(identity: HailEventIdentity): string {
  const provider = identity.provider?.trim() || 'unknown-provider'

  if (identity.providerEventId?.trim()) {
    return `${provider}:id:${identity.providerEventId.trim()}`
  }

  return [
    identity.type?.trim() || 'hail',
    normalizeEventTimestamp(identity.date),
    roundCoordinate(identity.lat),
    roundCoordinate(identity.lng),
    roundSize(identity.size),
  ].join('|')
}

export function dedupeHailEvents<T>(
  events: T[],
  getIdentity: (event: T) => HailEventIdentity,
): T[] {
  const seen = new Set<string>()
  const deduped: T[] = []

  for (const event of events) {
    const key = buildHailEventKey(getIdentity(event))
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(event)
  }

  return deduped
}
