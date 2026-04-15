/**
 * Shared input validation helpers for API route handlers.
 * All functions return a typed error string on failure, null on success.
 */
import { NextResponse } from 'next/server'

// ── Primitive checks ─────────────────────────────────────────────────────────

export function isValidLat(v: unknown): v is number {
  const n = Number(v)
  return Number.isFinite(n) && n >= -90 && n <= 90
}

export function isValidLng(v: unknown): v is number {
  const n = Number(v)
  return Number.isFinite(n) && n >= -180 && n <= 180
}

export function isValidZip(v: unknown): v is string {
  return typeof v === 'string' && /^\d{5}(-\d{4})?$/.test(v.trim())
}

export function isValidAddress(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length >= 5 && v.trim().length <= 300
}

export function isPositiveNumber(v: unknown): v is number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0
}

// ── Coordinate pair validation (most common) ─────────────────────────────────

/**
 * Validate lat + lng from query params or body.
 * Returns { lat, lng } on success, or a 400 NextResponse on failure.
 */
export function validateCoords(
  lat: unknown,
  lng: unknown,
): { ok: true; lat: number; lng: number } | { ok: false; response: NextResponse } {
  const latN = Number(lat)
  const lngN = Number(lng)
  if (!isValidLat(latN)) {
    return { ok: false, response: NextResponse.json({ error: 'lat must be a number between -90 and 90' }, { status: 400 }) }
  }
  if (!isValidLng(lngN)) {
    return { ok: false, response: NextResponse.json({ error: 'lng must be a number between -180 and 180' }, { status: 400 }) }
  }
  return { ok: true, lat: latN, lng: lngN }
}

// ── Address validation ────────────────────────────────────────────────────────

export function validateAddress(
  address: unknown,
): { ok: true; address: string } | { ok: false; response: NextResponse } {
  if (!isValidAddress(address)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'address must be a non-empty string (5–300 characters)' },
        { status: 400 },
      ),
    }
  }
  return { ok: true, address: (address as string).trim() }
}
