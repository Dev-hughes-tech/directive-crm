/**
 * fetchWithTimeout — thin wrapper around fetch() that aborts after `ms`
 * milliseconds. Throws an AbortError (caught as a network error) on timeout.
 *
 * Usage:
 *   const res = await fetchWithTimeout(url, { method: 'POST', ... }, 8000)
 *
 * Pick sensible defaults per service:
 *   Google Maps APIs  → 8_000  (8 s)
 *   NOAA / NWS / NWX  → 12_000 (12 s, public servers are slower)
 *   Anthropic / OpenAI → covered by Next.js maxDuration on the route
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  ms = 8_000,
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}
