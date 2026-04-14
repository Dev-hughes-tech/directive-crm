// Shared auth helpers so desktop + mobile behave identically.
//
// `signOut()`    — one canonical sign-out that always routes to /login.
// `redirectToLogin()` — used by authFetch when the server returns 401 after a
// refresh attempt.
//
// All auth-related client code should import from here instead of calling
// `supabase.auth.*` directly.

import { supabase } from './supabase'

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    // ignore — we always navigate away
  }
  if (typeof window !== 'undefined') {
    window.location.replace('/login')
  }
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname === '/login') return
  window.location.replace('/login')
}

/** Force-refresh the current Supabase session. Returns true on success. */
export async function refreshSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession()
    return !error && !!data.session
  } catch {
    return false
  }
}
