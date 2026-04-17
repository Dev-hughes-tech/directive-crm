import { NextRequest } from 'next/server'
import twilio from 'twilio'

function allowUnsignedTwilioWebhook(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.TWILIO_ALLOW_UNSIGNED_WEBHOOKS === 'true'
}

export function validateTwilioRequest(
  req: NextRequest,
  rawBody: string,
  path: string,
  logPrefix: string,
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    if (allowUnsignedTwilioWebhook()) {
      console.warn(`[${logPrefix}] TWILIO_AUTH_TOKEN not set — allowing unsigned webhook in non-production because TWILIO_ALLOW_UNSIGNED_WEBHOOKS=true`)
      return true
    }

    console.error(`[${logPrefix}] TWILIO_AUTH_TOKEN not set — rejecting unsigned webhook`)
    return false
  }

  const signature = req.headers.get('x-twilio-signature') || ''
  if (!signature) {
    console.warn(`[${logPrefix}] Missing X-Twilio-Signature header`)
    return false
  }

  const url = process.env.TWILIO_WEBHOOK_BASE_URL
    ? `${process.env.TWILIO_WEBHOOK_BASE_URL}${path}`
    : `${req.nextUrl.protocol}//${req.nextUrl.host}${path}`

  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(rawBody)
  searchParams.forEach((value, key) => { params[key] = value })

  return twilio.validateRequest(authToken, signature, url, params)
}
