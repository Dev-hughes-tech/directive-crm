import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // Twilio webhooks send form-encoded data and include their own signature validation
  // For now, we skip signature verification — in production, use twilio.validateRequest()
  const body = await req.formData()
  const from = (body.get('From') as string) || ''
  const to = (body.get('To') as string) || ''

  // Initialize Supabase service client to look up the caller
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  let callerName = 'Unknown Caller'
  let callerAddress = ''

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    try {
      // Extract the last 10 digits of the phone number (US format)
      const phoneDigits = from.replace(/\D/g, '').slice(-10)

      // Look up the property by owner_phone matching the caller's number
      const { data: property } = await supabase
        .from('properties')
        .select('id, address, owner_name, owner_phone')
        .ilike('owner_phone', `%${phoneDigits}%`)
        .maybeSingle()

      if (property) {
        callerName = property.owner_name || 'Unknown Caller'
        callerAddress = property.address || ''
      }
    } catch (err) {
      console.error('Error looking up caller:', err)
    }
  }

  // Generate TwiML response
  const twiml = new twilio.twiml.VoiceResponse()

  // If a forward number is configured, dial it with a message
  const forwardTo = process.env.TWILIO_FORWARD_TO
  if (forwardTo) {
    twiml.say(`Directive CRM. Call from ${callerName}.`)
    const dial = twiml.dial({ callerId: to })
    dial.number(forwardTo)
  } else {
    // Otherwise, attempt to connect to browser SDK client
    twiml.say(`Incoming call from ${callerName}.`)
    const dial = twiml.dial()
    dial.client('browser')
  }

  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
