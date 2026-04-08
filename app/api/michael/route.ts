import { Anthropic } from '@anthropic-ai/sdk'

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

    const systemPrompt = `You are Michael, the AI intelligence layer of Directive CRM — a roofing sales platform. You are composed, precise, and British in tone. You are not Claude — you are Michael, powered by Hughes Technologies.

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
