import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const requestedId = request.nextUrl.searchParams.get('userId')
  const targetId = requestedId ?? auth.user.id

  // Only self or admin can read a profile. An enterprise_manager can also
  // read profiles of reps that report to them.
  if (targetId !== auth.user.id && !auth.isAdmin) {
    if (auth.profile.role === 'enterprise_manager') {
      const { data: rep } = await auth.supabase
        .from('profiles')
        .select('id')
        .eq('id', targetId)
        .eq('manager_id', auth.user.id)
        .maybeSingle()
      if (!rep) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await auth.supabase
    .from('profiles')
    .select('*')
    .eq('id', targetId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message, profile: null }, { status: 500 })
  }

  // Auto-create profile row if missing (should not normally happen after migration 003,
  // but handles edge cases for existing users who bypassed the trigger)
  if (!data && targetId === auth.user.id) {
    try {
      await auth.supabase.from('profiles').insert({
        id: auth.user.id,
        email: auth.user.email,
        role: 'trial',
        created_at: new Date().toISOString(),
      })
    } catch { /* ignore */ }
    return NextResponse.json({ profile: { id: auth.user.id, email: auth.user.email, role: 'trial' } })
  }

  return NextResponse.json({ profile: data ?? null })
}

// PATCH /api/profile — update own profile (company_name only for now)
export async function PATCH(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const body = await request.json() as Record<string, unknown>

  // Whitelist — users can only update safe fields on their own profile
  const allowed: Record<string, unknown> = {}
  if (typeof body.company_name === 'string') allowed.company_name = body.company_name.slice(0, 120)
  if (typeof body.full_name === 'string') allowed.full_name = body.full_name.slice(0, 120)

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from('profiles')
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq('id', auth.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
