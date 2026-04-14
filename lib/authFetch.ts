// Client-side fetch wrapper.
//
// 1. Attaches the current Supabase access token as `Authorization: Bearer …`.
// 2. On a 401 response, tries ONE session refresh + retry.
// 3. If still 401, redirects the browser to /login so the user re-auths.
//
// This is the only fetch wrapper clients should use for /api/* calls.

import { supabase } from './supabase'
import { redirectToLogin, refreshSession } from './authHooks'

async function currentToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

function withAuth(headers: HeadersInit | undefined, token: string | null): Headers {
  const h = new Headers(headers || {})
  if (token && !h.has('Authorization')) h.set('Authorization', `Bearer ${token}`)
  return h
}

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await currentToken()
  let res: Response
  try {
    res = await fetch(input, { ...init, headers: withAuth(init.headers, token) })
  } catch (e) {
    // Network error — surface a synthetic 0 status so callers handle uniformly.
    return new Response(JSON.stringify({ error: 'Network error' }), {
      status: 0 as unknown as number,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (res.status !== 401) return res

  // Attempt refresh then retry once.
  const refreshed = await refreshSession()
  if (!refreshed) {
    redirectToLogin()
    return res
  }
  const newToken = await currentToken()
  try {
    return await fetch(input, { ...init, headers: withAuth(init.headers, newToken) })
  } catch {
    return res
  }
}
