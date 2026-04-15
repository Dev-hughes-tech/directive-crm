import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

// Validate that the request actually came from Twilio's servers
function validateTwilioSignature(req: NextRequest, rawBody: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    // If auth token not configured, skip validation (dev mode)
    console.warn('[twilio/voice] TWILIO_AUTH_TOKEN not set — skipping signature validation')
    return true
  }

  const signature = req.headers.get('x-twilio-signature') || ''
  if (!signature) {
    console.warn('[twilio/voice] Missing X-Twilio-Signature header')
    return false
  }

  // Build the full URL Twilio signed (protocol + host + path)
  const url = process.env.TWILIO_WEBHOOK_BASE_URL
    ? `${process.env.TWILIO_WEBHOOK_BASE_URL}/api/twilio/webhook/voice`
    : `${req.nextUrl.protocol}//${req.nextUrl.host}/api/twilio/webhook/voice`

  // Parse params from form body for signature computation
  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(rawBody)
  searchParams.forEach((value, key) => { params[key] = value })

  return twilio.validateRequest(authToken, signature, url, params)
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Reject requests that don't come from Twilio
  if (!validateTwilioSignature(req, rawBody)) {
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
