import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import type { UserRole } from '@/lib/tiers'

const VALID_ROLES: UserRole[] = [
  'admin',
  'enterprise_manager',
  'enterprise_rep',
  'pro',
  'plus',
  'basic',
  'trial',
]

// GET /api/admin/users — list all users (admin only)
export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  // Admin-only check
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await auth.supabase
    .from('profiles')
    .select('id, email, full_name, role, trial_ends_at, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: data || [] })
}

// PATCH /api/admin/users — update a user's role and/or trial_ends_at (admin only)
export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  // Admin-only check
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json()) as Record<string, unknown>
  const userId = body.userId as string | undefined
  const role = body.role as string | undefined
  const trial_ends_at = body.trial_ends_at as string | null | undefined

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }

  // Validate role if provided
  if (role && !VALID_ROLES.includes(role as UserRole)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  // Build update object
  const updates: Record<string, unknown> = {}
  if (role) updates.role = role
  if (trial_ends_at !== undefined) updates.trial_ends_at = trial_ends_at

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'At least one of role or trial_ends_at must be provided' },
      { status: 400 }
    )
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
