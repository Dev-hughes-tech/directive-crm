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

  return NextResponse.json({ profile: data ?? null })
}
