import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { requireUser } from '@/lib/apiAuth'
import { decryptEmailCredential } from '@/lib/emailCredentials'

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const { account_id, to, subject, body: messageBody, reply_to_uid } = body

    if (!account_id || !to || !subject || !messageBody) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Create SMTP transporter
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_ssl, // true for 465, false for other ports (starttls)
      auth: {
        user: account.username,
        pass: decryptEmailCredential(account.password_enc),
      },
    })

    try {
      // Send email
      const info = await transporter.sendMail({
        from: account.email_address,
        to,
        subject,
        text: messageBody,
        html: `<p>${messageBody.replace(/\n/g, '<br>')}</p>`,
      })

      return NextResponse.json({
        ok: true,
        message_id: info.messageId,
      })
    } catch (smtpError) {
      console.error('SMTP error:', smtpError)
      return NextResponse.json(
        { error: smtpError instanceof Error ? smtpError.message : 'Failed to send email' },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error('/api/email/send POST:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
