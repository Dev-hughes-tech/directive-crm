export interface MichaelClientContext {
  activeScreen?: string
  leadCount?: number
  hotLeadCount?: number
  alertCount?: number
  weatherSummary?: string | null
  stormZip?: string
  stormRisk?: string
  stormEvents?: number
}

export interface MichaelVerifiedMetrics {
  propertyCount: number
  hotLeadCount: number
}

function formatClientStormContext(context: MichaelClientContext): string | null {
  if (!context.stormZip) return null

  return `Active Storm Focus (client-reported, unverified): ZIP ${context.stormZip} | Risk: ${context.stormRisk || 'unknown'} | Events (10yr): ${context.stormEvents ?? 'unknown'}`
}

export function buildMichaelSystemContext(params: {
  clientContext?: MichaelClientContext
  verifiedMetrics: MichaelVerifiedMetrics
}): string {
  const { clientContext, verifiedMetrics } = params

  const lines = [
    `- Active Screen (client-reported UI state): ${clientContext?.activeScreen || 'dashboard'}`,
    `- Properties Tracked (server-verified): ${verifiedMetrics.propertyCount}`,
    `- Hot Leads (server-verified, score 70+): ${verifiedMetrics.hotLeadCount}`,
  ]

  if (clientContext?.weatherSummary) {
    lines.push(`- Live Weather (client-reported, unverified): ${clientContext.weatherSummary}`)
  }

  if (typeof clientContext?.alertCount === 'number') {
    lines.push(`- Active Weather Alerts (client-reported, unverified): ${clientContext.alertCount}`)
  }

  const stormContext = formatClientStormContext(clientContext || {})
  if (stormContext) lines.push(`- ${stormContext}`)

  return lines.join('\n')
}
