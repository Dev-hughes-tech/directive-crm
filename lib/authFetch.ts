// Client-side helper: wraps fetch() and attaches the user's Supabase JWT as a
// Bearer token so server routes that call `requireUser` can identify them.
//
// Use this for EVERY call into /api/* from the browser. If the user isn't
// logged in, the request still fires (some /api routes are public) — the
// server decides whether to 401.

import { supabase } from './supabase'

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let token: string | null = null
  try {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token ?? null
  } catch {
    token = null
  }

  const headers = new Headers(init.headers || {})
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(input, { ...init, headers })
}
