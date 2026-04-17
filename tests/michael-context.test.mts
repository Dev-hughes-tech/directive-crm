import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMichaelSystemContext,
  type MichaelClientContext,
} from '../lib/michaelContext.ts'

const clientContext: MichaelClientContext = {
  activeScreen: 'dashboard',
  leadCount: 999,
  hotLeadCount: 777,
  alertCount: 55,
  weatherSummary: '72F and sunny',
  stormZip: '36066',
  stormRisk: 'High',
  stormEvents: 14,
}

test('buildMichaelSystemContext favors server-verified counts over client-supplied numbers', () => {
  const context = buildMichaelSystemContext({
    clientContext,
    verifiedMetrics: {
      propertyCount: 12,
      hotLeadCount: 4,
    },
  })

  assert.match(context, /Properties Tracked \(server-verified\): 12/)
  assert.match(context, /Hot Leads \(server-verified, score 70\+\): 4/)
  assert.doesNotMatch(context, /999/)
  assert.doesNotMatch(context, /777/)
})

test('buildMichaelSystemContext labels remaining browser context as client-reported', () => {
  const context = buildMichaelSystemContext({
    clientContext,
    verifiedMetrics: {
      propertyCount: 12,
      hotLeadCount: 4,
    },
  })

  assert.match(context, /Active Screen \(client-reported UI state\): dashboard/)
  assert.match(context, /Live Weather \(client-reported, unverified\): 72F and sunny/)
  assert.match(context, /Active Weather Alerts \(client-reported, unverified\): 55/)
  assert.match(context, /Active Storm Focus \(client-reported, unverified\): ZIP 36066 \| Risk: High \| Events \(10yr\): 14/)
})
