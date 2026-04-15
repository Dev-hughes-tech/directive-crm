import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  try {
    const { data, error } = await auth.supabase
      .from('email_accounts')
      .select('id, label, email_address, imap_host, imap_port, imap_ssl, smtp_host, smtp_port, smtp_ssl, username, created_at')
      .eq('owner_id', auth.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ accounts: data || [] })
  } catch (error) {
    console.error('/api/email/accounts GET:', error)
    return NextResponse.json({ error: 'Failed to fetch email accounts' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { label, email_address, imap_host, imap_port, imap_ssl, smtp_host, smtp_port, smtp_ssl, username, password } = body

    if (!email_address || !imap_host || !smtp_host || !username || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await auth.supabase
      .from('email_accounts')
      .insert([
        {
          owner_id: auth.user.id,
          label: label || 'My Email',
          email_address,
          imap_host,
          imap_port: imap_port || 993,
          imap_ssl: imap_ssl !== false,
          smtp_host,
          smtp_port: smtp_port || 587,
          smtp_ssl: smtp_ssl === true ? true : false,
          username,
          password_enc: password, // In production, encrypt this
        },
      ])
      .select('id, label, email_address, created_at')
      .single()

    if (error) throw error

    return NextResponse.json({ account: data }, { status: 201 })
  } catch (error) {
    console.error('/api/email/accounts POST:', error)
    return NextResponse.json({ error: 'Failed to save email account' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 })
    }

    // Verify ownership before deleting
    const { data: account, error: fetchError } = await auth.supabase
      .from('email_accounts')
      .select('id')
      .eq('id', id)
      .eq('owner_id', auth.user.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const { error } = await auth.supabase
      .from('email_accounts')
      .delete()
      .eq('id', id)
      .eq('owner_id', auth.user.id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('/api/email/accounts DELETE:', error)
    return NextResponse.json({ error: 'Failed to delete email account' }, { status: 500 })
  }
}
