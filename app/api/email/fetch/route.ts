import { NextRequest, NextResponse } from 'next/server'
import { ImapFlow } from 'imapflow'
import { requireUser } from '@/lib/apiAuth'
import { decryptEmailCredential } from '@/lib/emailCredentials'

export const maxDuration = 60

function extractText(bodyParts: Record<string, any>): { text: string; html: string } {
  let text = ''
  let html = ''

  if (bodyParts.text) text = bodyParts.text
  if (bodyParts.html) html = bodyParts.html

  return { text, html }
}

function getPreview(text: string, html: string): string {
  const content = text || html || ''
  return content.substring(0, 200).replace(/\n/g, ' ').trim()
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { account_id, mailbox = 'INBOX', limit = 50 } = body

    if (!account_id) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 })
    }

    // Load account from DB
    const { data: account, error: accountError } = await auth.supabase
      .from('email_accounts')
      .select('*')
      .eq('id', account_id)
      .eq('owner_id', auth.user.id)
      .single()

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    // Connect to IMAP
    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_ssl,
      auth: { user: account.username, pass: decryptEmailCredential(account.password_enc) },
      logger: false,
    })

    try {
      await client.connect()

      // Get mailbox lock and fetch messages
      const lock = await client.getMailboxLock(mailbox)
      const messages: any[] = []

      try {
        // Fetch last `limit` messages (newest first)
        let count = 0
        for await (const msg of client.fetch(
          { all: true },
          { envelope: true, bodyStructure: true, source: true },
          { uid: true },
        )) {
          if (count >= limit) break
          count++

          const from = msg.envelope?.from?.[0]
          const fromEmail = from?.address || 'unknown'
          const fromName = from?.name || ''
          const subject = msg.envelope?.subject || '(no subject)'
          const received = msg.envelope?.date || new Date()

          // Parse body
          let bodyText = ''
          let bodyHtml = ''
          if (msg.source) {
            try {
              // For simplicity, extract text from source (RFC 2822 format)
              // In production, use a MIME parser
              const sourceStr = msg.source.toString()
              const match = sourceStr.match(/\r?\n\r?\n([\s\S]*)/)
              if (match) {
                bodyText = match[1].substring(0, 2000)
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          messages.push({
            uid: msg.uid,
            from_email: fromEmail,
            from_name: fromName || null,
            subject,
            preview: getPreview(bodyText, bodyHtml),
            body_text: bodyText,
            body_html: bodyHtml,
            received_at: new Date(received).toISOString(),
          })
        }
      } finally {
        lock.release()
      }

      await client.logout()

      // Get properties with owner_email to match incoming emails
      const { data: properties } = await auth.supabase
        .from('properties')
        .select('id, owner_email')
        .eq('owner_id', auth.user.id)
        .not('owner_email', 'is', null)

      const emailToPropertyId: Record<string, string> = {}
      if (properties) {
        for (const prop of properties) {
          if (prop.owner_email) {
            emailToPropertyId[prop.owner_email.toLowerCase()] = prop.id
          }
        }
      }

      // Upsert messages into email_cache
      const toInsert = messages.map((msg) => ({
        owner_id: auth.user.id,
        account_id: account_id,
        message_uid: String(msg.uid),
        from_email: msg.from_email.toLowerCase(),
        from_name: msg.from_name,
        subject: msg.subject,
        preview: msg.preview,
        body_text: msg.body_text,
        body_html: msg.body_html,
        received_at: msg.received_at,
        is_read: false,
        client_id: null, // Would need to look up via properties table
      }))

      // Bulk upsert
      if (toInsert.length > 0) {
        const { error: upsertError } = await auth.supabase
          .from('email_cache')
          .upsert(toInsert, { onConflict: 'account_id,message_uid' })

        if (upsertError) {
          console.error('Upsert error:', upsertError)
          throw upsertError
        }
      }

      // Fetch the newly cached messages
      const { data: cached, error: fetchError } = await auth.supabase
        .from('email_cache')
        .select('*')
        .eq('account_id', account_id)
        .order('received_at', { ascending: false })
        .limit(limit)

      if (fetchError) throw fetchError

      return NextResponse.json({ messages: cached || [] })
    } catch (imapError) {
      console.error('IMAP error:', imapError)
      return NextResponse.json(
        { error: imapError instanceof Error ? imapError.message : 'Failed to fetch emails' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('/api/email/fetch POST:', error)
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 })
  }
}
