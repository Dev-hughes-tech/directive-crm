import { NextRequest, NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { requireUser } from '@/lib/apiAuth'

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { imap_host, imap_port, imap_ssl, username, password } = body

    if (!imap_host || !username || !password) {
      return NextResponse.json({ error: 'Missing IMAP credentials' }, { status: 400 })
    }

    const client = new ImapFlow({
      host: imap_host,
      port: imap_port || 993,
      secure: imap_ssl !== false,
      auth: { user: username, pass: password },
      logger: false,
    })

    try {
      await client.connect()
      const mailboxes = await client.list()
      await client.logout()

      return NextResponse.json({
        ok: true,
        mailboxes: mailboxes.map((m) => m.path),
      })
    } catch (imapError) {
      return NextResponse.json({
        ok: false,
        error: imapError instanceof Error ? imapError.message : 'IMAP connection failed',
      })
    }
  } catch (error) {
    console.error('/api/email/connect POST:', error)
    return NextResponse.json({ error: 'Failed to test connection' }, { status: 500 })
  }
}
