import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { createClient } from '@supabase/supabase-js'
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

// POST /api/admin/invite — invite a user by email (admin only)
export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  // Admin-only check
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json()) as Record<string, unknown>
  const email = body.email as string | undefined
  const role = (body.role as string) || 'trial'
  const trial_days = body.trial_days as number | undefined
  const full_name = body.full_name as string | undefined

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  // Validate email format (simple check)
  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // Validate role
  if (!VALID_ROLES.includes(role as UserRole)) {
    return NextResponse.json(
      { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  // Ensure service role key is available
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server misconfigured: Supabase service role not set' },
      { status: 500 }
    )
  }

  try {
    // Create admin client for inviting users
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // Invite user via Supabase auth (sends them an email with signup link)
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: full_name || '',
          invited_by: auth.user.id,
        },
      }
    )

    if (inviteError) {
      return NextResponse.json(
        { error: `Failed to invite user: ${inviteError.message}` },
        { status: 400 }
      )
    }

    // Calculate trial_ends_at if role is 'trial'
    let trial_ends_at: string | null = null
    if (role === 'trial' && trial_days) {
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + trial_days)
      trial_ends_at = expiryDate.toISOString()
    }

    // Upsert a profile row with the requested role and trial info
    const { error: profileError } = await auth.supabase.from('profiles').upsert(
      {
        id: inviteData.user.id,
        email: email,
        role: role,
        full_name: full_name || null,
        trial_ends_at: trial_ends_at,
        invited_by: auth.user.id,
        created_at: new Date().toISOString(),
      },
      {
        onConflict: 'id', // Upsert on id to avoid duplicates
      }
    )

    if (profileError) {
      return NextResponse.json(
        { error: `Failed to create profile: ${profileError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: `Invitation sent to ${email}`,
      userId: inviteData.user.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Invitation failed: ${message}` }, { status: 500 })
  }
}
