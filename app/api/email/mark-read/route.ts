import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { message_id } = body

    if (!message_id) {
      return NextResponse.json({ error: 'Message ID required' }, { status: 400 })
    }

    // Verify ownership before updating
    const { data: message, error: fetchError } = await auth.supabase
      .from('email_cache')
      .select('id')
      .eq('id', message_id)
      .eq('owner_id', auth.user.id)
      .single()

    if (fetchError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const { error } = await auth.supabase
      .from('email_cache')
      .update({ is_read: true })
      .eq('id', message_id)
      .eq('owner_id', auth.user.id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('/api/email/mark-read POST:', error)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
