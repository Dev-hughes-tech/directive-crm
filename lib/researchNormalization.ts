const CURRENT_RESEARCH_YEAR = new Date().getUTCFullYear()
const OLD_ROOF_THRESHOLD_YEARS = 20

function normalizePhone(value: unknown): string | null {
  if (!value) return null

  const digits = String(value).replace(/\D/g, '')
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return null
}

function toInt(value: unknown, min: number, max: number): number | null {
  const parsed = parseInt(String(value ?? ''), 10)
  return !Number.isNaN(parsed) && parsed >= min && parsed <= max ? parsed : null
}

function toMoney(value: unknown, min: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'string'
    ? parseFloat(value.replace(/[$,]/g, ''))
    : Number(value)
  return !Number.isNaN(parsed) && parsed >= min ? Math.round(parsed) : null
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function extractPermitYear(permitLastDate: unknown, currentYear: number): number | null {
  const normalized = normalizeString(permitLastDate)
  if (!normalized) return null

  const match = normalized.match(/\b(18|19|20)\d{2}\b/)
  if (!match) return null

  const year = parseInt(match[0], 10)
  return !Number.isNaN(year) && year >= 1800 && year <= currentYear ? year : null
}

function normalizeSources(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).filter(([, sourceValue]) => typeof sourceValue === 'string' && sourceValue.trim()),
  ) as Record<string, string>
}

export function normalizeResearchData<T extends Record<string, unknown>>(
  raw: T,
  options: { currentYear?: number } = {},
): T {
  const currentYear = options.currentYear ?? CURRENT_RESEARCH_YEAR
  const data = { ...raw } as Record<string, unknown>

  data.ownerPhone = normalizePhone(data.ownerPhone)
  data.yearBuilt = toInt(data.yearBuilt, 1800, currentYear)
  data.sqft = toInt(data.sqft, 100, 100000)
  data.lotSqft = toInt(data.lotSqft, 100, 5000000)
  data.bedrooms = toInt(data.bedrooms, 0, 30)
  data.bathrooms = toInt(data.bathrooms, 0, 30)
  data.ownerAge = toInt(data.ownerAge, 18, 120)
  data.permitCount = toInt(data.permitCount, 0, 100)
  data.marketValue = toMoney(data.marketValue, 5000)
  data.assessedValue = toMoney(data.assessedValue, 1000)
  data.appraisedValue = toMoney(data.appraisedValue, 1000)
  data.lastSalePrice = toMoney(data.lastSalePrice, 100)
  data.listingPrice = toMoney(data.listingPrice, 100)
  data.taxAnnual = toMoney(data.taxAnnual, 0)
  data.hoaMonthly = toMoney(data.hoaMonthly, 0)
  data.permitLastDate = normalizeString(data.permitLastDate)

  const permitYear = extractPermitYear(data.permitLastDate, currentYear)
  data.roofAgeYears = permitYear ? currentYear - permitYear : null
  data.roofAgeEstimated = false

  const sources = normalizeSources(data.sources)
  if (data.roofAgeYears === null) {
    delete sources.roofAgeYears
    delete sources.roofAgeEstimated
  }
  data.sources = sources

  const rawFlags = Array.isArray(data.flags)
    ? data.flags.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0)
    : []
  const flags = rawFlags.filter((flag) => flag !== 'estimated-roof-age' && flag !== 'old-roof')

  if (typeof data.marketValue === 'number' && data.marketValue > 250000 && !flags.includes('high-value')) {
    flags.push('high-value')
  }
  if (typeof data.roofAgeYears === 'number' && data.roofAgeYears >= OLD_ROOF_THRESHOLD_YEARS) {
    flags.push('old-roof')
  }

  data.flags = [...new Set(flags)]

  return data as T
}
