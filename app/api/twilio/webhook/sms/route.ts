import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // Twilio sends form-encoded SMS webhook data
  const body = await req.formData()
  const from = (body.get('From') as string) || ''
  const messageBody = (body.get('Body') as string) || ''

  // Initialize Supabase service client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })

    try {
      // Extract phone digits for lookup
      const phoneDigits = from.replace(/\D/g, '').slice(-10)

      // Find the property/client associated with this phone number
      const { data: property } = await supabase
        .from('properties')
        .select('id, owner_id')
        .ilike('owner_phone', `%${phoneDigits}%`)
        .maybeSingle()

      // Save the SMS to sms_messages table
      await supabase.from('sms_messages').insert({
        owner_id: property?.owner_id || null,
        from_number: from,
        to_number: process.env.TWILIO_PHONE_NUMBER || '',
        body: messageBody,
        direction: 'inbound',
        property_id: property?.id || null,
        client_id: null,
        read: false,
        created_at: new Date().toISOString(),
      })

      // Also optionally save to chat_messages if desired
      if (property?.owner_id) {
        await supabase.from('chat_messages').insert({
          owner_id: property.owner_id,
          channel: from, // phone number as channel
          sender_name: 'SMS Client',
          sender_role: 'rep',
          message: messageBody,
          timestamp: new Date().toISOString(),
          read: false,
        })
      }
    } catch (err) {
      console.error('Error processing SMS:', err)
    }
  }

  // Return empty 200 response to acknowledge receipt
  const twiml = new twilio.twiml.MessagingResponse()
  return new NextResponse(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
