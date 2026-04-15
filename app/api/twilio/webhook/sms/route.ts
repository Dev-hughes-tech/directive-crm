import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

// Validate that the request actually came from Twilio's servers
function validateTwilioSignature(req: NextRequest, rawBody: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.warn('[twilio/sms] TWILIO_AUTH_TOKEN not set — skipping signature validation')
    return true
  }

  const signature = req.headers.get('x-twilio-signature') || ''
  if (!signature) {
    console.warn('[twilio/sms] Missing X-Twilio-Signature header')
    return false
  }

  const url = process.env.TWILIO_WEBHOOK_BASE_URL
    ? `${process.env.TWILIO_WEBHOOK_BASE_URL}/api/twilio/webhook/sms`
    : `${req.nextUrl.protocol}//${req.nextUrl.host}/api/twilio/webhook/sms`

  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(rawBody)
  searchParams.forEach((value, key) => { params[key] = value })

  return twilio.validateRequest(authToken, signature, url, params)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!validateTwilioSignature(req, rawBody)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body        = new URLSearchParams(rawBody)
  const from        = body.get('From')  || ''
  const messageBody = body.get('Body')  || ''

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    try {
      const phoneDigits = from.replace(/\D/g, '').slice(-10)

      const { data: property } = await supabase
        .from('properties')
        .select('id, owner_id')
        .ilike('owner_phone', `%${phoneDigits}%`)
        .maybeSingle()

      // Persist inbound SMS
      await supabase.from('sms_messages').insert({
        owner_id:    property?.owner_id || null,
        from_number: from,
        to_number:   process.env.TWILIO_PHONE_NUMBER || '',
        body:        messageBody,
        direction:   'inbound',
        property_id: property?.id || null,
        client_id:   null,
        read:        false,
        created_at:  new Date().toISOString(),
      })

      // Surface in chat_messages if we know the owner
      if (property?.owner_id) {
        await supabase.from('chat_messages').insert({
          owner_id:    property.owner_id,
          channel:     from,
          sender_name: 'SMS Client',
          sender_role: 'rep',
          message:     messageBody,
          timestamp:   new Date().toISOString(),
          read:        false,
        })
      }
    } catch (err) {
      console.error('[twilio/sms] Processing error:', err)
    }
  }

  // Acknowledge receipt — no reply body needed
  const twiml = new twilio.twiml.MessagingResponse()
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
