// Server-side authentication + authorization helpers for API route handlers.
//
// Every mutating or PII-returning API route should call `requireUser(req)` at
// the top of the handler and return its `response` if one is produced. The
// helper:
//   1. Extracts the Supabase JWT from the Authorization header or cookie.
//   2. Verifies it with the Supabase admin client.
//   3. Loads the user's profile row (role).
//   4. Returns a typed context { user, profile, supabase, isAdmin } on success,
//      or a NextResponse with 401/403 on failure.
//
// This centralises the auth story so individual routes don't re-implement it
// and cannot silently forget it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { canAccess } from './tiers'

const UPGRADE_MESSAGE = 'Upgrade at directivecrm.com'

export type UserRole =
  | 'admin'
  | 'enterprise_manager'
  | 'enterprise_rep'
  | 'pro'
  | 'plus'
  | 'basic'
  | 'trial'

export interface AuthProfile {
  id: string
  email: string | null
  role: UserRole
  manager_id: string | null
  full_name: string | null
}

export interface AuthContext {
  ok: true
  user: { id: string; email: string | null }
  profile: AuthProfile
  supabase: SupabaseClient // service-role client
  isAdmin: boolean
}

export interface AuthFailure {
  ok: false
  response: NextResponse
}

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function extractToken(req: NextRequest): string | null {
  // 1. Authorization: Bearer <jwt>
  const auth = req.headers.get('authorization') || req.headers.get('Authorization')
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) return m[1].trim()
  }
  // 2. Supabase cookie (default storage key is sb-<ref>-auth-token)
  const cookieHeader = req.headers.get('cookie') || ''
  if (cookieHeader) {
    // Look for any sb-*-auth-token cookie; value is JSON stringified session.
    const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/)
    if (match) {
      try {
        const decoded = decodeURIComponent(match[1])
        const parsed = JSON.parse(decoded)
        if (parsed?.access_token) return String(parsed.access_token)
        if (Array.isArray(parsed) && parsed[0]) return String(parsed[0])
      } catch {
        // Some Supabase versions store the raw access token in the cookie
        return decodeURIComponent(match[1])
      }
    }
  }
  return null
}

/**
 * Require an authenticated Supabase user. Returns { ok:true, ... } on success
 * or { ok:false, response } with a pre-built 401/403 response.
 *
 * Usage:
 *   const auth = await requireUser(req)
 *   if (!auth.ok) return auth.response
 *   const { user, profile, supabase, isAdmin } = auth
 */
export async function requireUser(
  req: NextRequest,
  opts: { requiredRoles?: UserRole[] } = {},
): Promise<AuthContext | AuthFailure> {
  const supabase = getServiceClient()
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Server misconfigured: Supabase service role not set' },
        { status: 500 },
      ),
    }
  }

  const token = extractToken(req)
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const uid = userData.user.id
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id, email, role, manager_id, full_name')
    .eq('id', uid)
    .maybeSingle()

  const profile: AuthProfile = profileRow
    ? {
        id: profileRow.id,
        email: profileRow.email ?? userData.user.email ?? null,
        role: (profileRow.role as UserRole) ?? 'trial',
        manager_id: profileRow.manager_id ?? null,
        full_name: profileRow.full_name ?? null,
      }
    : {
        id: uid,
        email: userData.user.email ?? null,
        role: 'trial',
        manager_id: null,
        full_name: null,
      }

  if (opts.requiredRoles && !opts.requiredRoles.includes(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    ok: true,
    user: { id: uid, email: userData.user.email ?? null },
    profile,
    supabase,
    isAdmin: profile.role === 'admin',
  }
}

/**
 * True if `viewerId` is allowed to read/write data owned by `targetOwnerId`.
 * Admin can touch anything; enterprise_manager can touch their own reps;
 * everyone else only their own rows.
 */
export async function canAccessOwner(
  ctx: AuthContext,
  targetOwnerId: string | null | undefined,
): Promise<boolean> {
  if (!targetOwnerId) return false
  if (ctx.isAdmin) return true
  if (ctx.user.id === targetOwnerId) return true
  if (ctx.profile.role === 'enterprise_manager') {
    const { data } = await ctx.supabase
      .from('profiles')
      .select('id')
      .eq('id', targetOwnerId)
      .eq('manager_id', ctx.user.id)
      .maybeSingle()
    return !!data
  }
  return false
}

/**
 * Check that an authenticated user's plan tier grants access to a feature.
 * Call after requireUser succeeds. Returns a 403 NextResponse if denied,
 * or null if access is granted.
 *
 * Delegates to canAccess(role, feature) from tiers.ts for the canonical
 * feature access logic.
 *
 * Usage:
 *   const auth = await requireUser(req)
 *   if (!auth.ok) return auth.response
 *   const tierDenied = requireTier(auth, 'stormscope')
 *   if (tierDenied) return tierDenied
 */
export function requireTier(
  ctx: AuthContext,
  feature: string,
): NextResponse | null {
  if (ctx.isAdmin) return null
  // Delegate to the canonical canAccess function from tiers.ts
  const hasAccess = canAccess(ctx.profile.role, feature as any)
  if (!hasAccess) {
    return NextResponse.json(
      { error: `Your plan does not include ${feature}. ${UPGRADE_MESSAGE}.` },
      { status: 403 },
    )
  }
  return null
}
