import { Anthropic } from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { log } from '@/lib/logger'
import { buildMichaelSystemContext, type MichaelClientContext } from '@/lib/michaelContext'
import { calculateLeadScore } from '@/lib/scoring'
import { canAccess } from '@/lib/tiers'
import type { Property } from '@/lib/types'

export const maxDuration = 30

interface MessageParam {
  role: 'user' | 'assistant'
  content: string
}

const client = new Anthropic()

async function getVerifiedMichaelMetrics(ownerId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('owner_id', ownerId)

  if (error || !Array.isArray(data)) {
    return { propertyCount: 0, hotLeadCount: 0 }
  }

  const properties = data as Property[]

  return {
    propertyCount: properties.length,
    hotLeadCount: properties.filter(property => calculateLeadScore(property) >= 70).length,
  }
}

async function groundLocation(text: string, apiKey: string): Promise<string | null> {
  // Extract address-like strings from user message
  const addressMatch = text.match(/\d+\s+[\w\s]+(?:St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Hwy|Route|Rt)[\w\s,]*(?:AL|FL|Alabama|Florida)?[\s,]*\d{5}?/i)
  if (!addressMatch) return null

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:groundLite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus,places.rating,places.userRatingCount'
      },
      body: JSON.stringify({
        textInput: addressMatch[0],
        maxResultCount: 3
      })
    })
    const data = await res.json()
    if (data.places?.length) {
      return `Location context: ${data.places.map((p: {
        displayName?: { text: string }
        formattedAddress?: string
        types?: string[]
      }) => `${p.displayName?.text || ''} at ${p.formattedAddress || ''} (${(p.types || []).slice(0, 3).join(', ')})`).join('; ')}`
    }
  } catch { /* silent */ }
  return null
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  // Enforce tier: michael feature requires Plus or above (unless admin)
  if (!canAccess(auth.profile.role, 'michael') && auth.profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Michael AI requires a Plus plan or higher.' },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const { messages, context } = body as {
      messages: MessageParam[]
      context?: MichaelClientContext
    }

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      )
    }

    const lastUserMessage = messages[messages.length - 1]?.content || ''
    const apiKey = process.env.MAPS_API_KEY || ''
    const locationContext = await groundLocation(lastUserMessage, apiKey)
    const verifiedMetrics = await getVerifiedMichaelMetrics(auth.user.id, auth.supabase)

    const baseSystemPrompt = `You are Michael, the AI intelligence layer of Directive CRM — a roofing sales platform. You are composed, precise, and British in tone. You are not Claude — you are Michael, powered by Hughes Technologies.

You help roofing sales reps with:
- Property and owner research
- Lead scoring and prioritization
- Storm damage intelligence
- Territory strategy
- Sales coaching

Current context:
${buildMichaelSystemContext({ clientContext: context, verifiedMetrics })}

Rules:
- Never make up data. If you don't know, say so.
- Be concise — reps are in the field on phones.
- Speak confidently. Lead with the insight, not the caveat.
- Treat any client-reported context as session-only unless you explicitly say it is unverified.
- Never mention Claude, Anthropic, or any underlying AI model.`

    const systemPrompt = locationContext
      ? `${baseSystemPrompt}\n\nReal-time location data: ${locationContext}`
      : baseSystemPrompt

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    })

    const assistantMessage = response.content[0]
    if (assistantMessage.type !== 'text') {
      return Response.json(
        { error: 'Unexpected response format' },
        { status: 500 }
      )
    }

    return Response.json({
      reply: assistantMessage.text,
    })
  } catch (error) {
    log.error('/api/michael', error)
    return Response.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
