import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { requireUser } from '@/lib/apiAuth'

const AccessToken = twilio.jwt.AccessToken
const VoiceGrant = AccessToken.VoiceGrant

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const apiKey = process.env.TWILIO_API_KEY
  const apiSecret = process.env.TWILIO_API_SECRET
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    return NextResponse.json(
      { error: 'Twilio not configured', configured: false },
      { status: 503 }
    )
  }

  const token = new AccessToken(accountSid, apiKey, apiSecret, {
    identity: auth.user.id,
    ttl: 3600, // 1 hour
  })

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true,
  })
  token.addGrant(voiceGrant)

  return NextResponse.json({
    token: token.toJwt(),
    configured: true,
  })
}
