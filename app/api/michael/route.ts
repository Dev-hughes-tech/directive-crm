import { Anthropic } from '@anthropic-ai/sdk'

export const maxDuration = 30

interface MessageParam {
  role: 'user' | 'assistant'
  content: string
}

interface ContextData {
  activeScreen: string
  leadCount: number
  hotLeadCount: number
  alertCount: number
  weatherSummary: string | null
}

const client = new Anthropic()

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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, context } = body as {
      messages: MessageParam[]
      context?: ContextData
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

    const baseSystemPrompt = `You are Michael, the AI intelligence layer of Directive CRM — a roofing sales platform. You are composed, precise, and British in tone. You are not Claude — you are Michael, powered by Hughes Technologies.

You help roofing sales reps with:
- Property and owner research
- Lead scoring and prioritization
- Storm damage intelligence
- Territory strategy
- Sales coaching

Current context:
- Active Screen: ${context?.activeScreen || 'dashboard'}
- Properties Tracked: ${context?.leadCount || 0}
- Hot Leads (score 70+): ${context?.hotLeadCount || 0}
- Active Weather Alerts: ${context?.alertCount || 0}
- Weather: ${context?.weatherSummary || 'unknown'}

Rules:
- Never make up data. If you don't know, say so.
- Be concise — reps are in the field on phones.
- Speak confidently. Lead with the insight, not the caveat.
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
    console.error('Michael AI error:', error)
    return Response.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}
