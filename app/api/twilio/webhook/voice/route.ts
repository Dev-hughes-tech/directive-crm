import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import { validateTwilioRequest } from '@/lib/twilioValidation'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Reject requests that don't come from Twilio
  if (!validateTwilioRequest(req, rawBody, '/api/twilio/webhook/voice', 'twilio/voice')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const body = new URLSearchParams(rawBody)
  const from = body.get('From') || ''
  const to   = body.get('To')   || ''

  // Resolve caller identity from CRM
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let callerName    = 'Unknown Caller'
  let callerAddress = ''

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
    try {
      const phoneDigits = from.replace(/\D/g, '').slice(-10)
      const { data: property } = await supabase
        .from('properties')
        .select('id, address, owner_name, owner_phone')
        .ilike('owner_phone', `%${phoneDigits}%`)
        .maybeSingle()

      if (property) {
        callerName    = property.owner_name || 'Unknown Caller'
        callerAddress = property.address    || ''
      }
    } catch (err) {
      console.error('[twilio/voice] Caller lookup error:', err)
    }
  }

  // Emit caller info header so the browser IncomingCallBanner can read it
  // (Twilio passes custom SIP headers via X-PH-* params if configured)
  void callerAddress // available for future SIP header injection

  // Build TwiML response
  const twiml    = new twilio.twiml.VoiceResponse()
  const forwardTo = process.env.TWILIO_FORWARD_TO

  if (forwardTo) {
    twiml.say(`Directive CRM. Call from ${callerName}.`)
    const dial = twiml.dial({ callerId: to })
    dial.number(forwardTo)
  } else {
    twiml.say(`Incoming call from ${callerName}.`)
    const dial = twiml.dial()
    dial.client('browser')
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
