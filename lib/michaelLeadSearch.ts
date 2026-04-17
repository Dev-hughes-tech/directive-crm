export interface MichaelLeadResponseMeta {
  ok: boolean
  status: number
}

export type MichaelLeadResponseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export function interpretMichaelLeadResponse<T>(
  response: MichaelLeadResponseMeta,
  body: unknown,
  fallbackError: string,
): MichaelLeadResponseResult<T> {
  if (response.ok) {
    return { ok: true, data: (body ?? {}) as T }
  }

  if (body && typeof body === 'object' && 'error' in body) {
    const error = body.error
    if (typeof error === 'string' && error.trim()) {
      return { ok: false, error }
    }
  }

  if (response.status === 404) {
    return { ok: false, error: 'ZIP code not found' }
  }

  if (response.status === 401) {
    return { ok: false, error: 'Session expired. Sign in again.' }
  }

  if (response.status === 0) {
    return { ok: false, error: 'Network error. Check your connection and try again.' }
  }

  return { ok: false, error: fallbackError }
}
