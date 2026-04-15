/**
 * In-memory session cache — lives as long as the browser tab is open.
 * Used to avoid re-fetching weather/NOAA data on every screen switch.
 *
 * Usage:
 *   const hit = sessionCache.get<WeatherCurrent>('weather:current:lat:lng')
 *   if (hit) return hit
 *   const fresh = await fetchData()
 *   sessionCache.set('weather:current:lat:lng', fresh, 5 * 60 * 1000) // 5 min
 *   return fresh
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class SessionCache {
  private store = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return null
    }
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs })
  }

  invalidate(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }

  clear(): void {
    this.store.clear()
  }
}

export const sessionCache = new SessionCache()
