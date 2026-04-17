import test from 'node:test'
import assert from 'node:assert/strict'

import { interpretMichaelLeadResponse } from '../lib/michaelLeadSearch.ts'

test('interpretMichaelLeadResponse preserves API error messages for non-OK responses', () => {
  const result = interpretMichaelLeadResponse(
    { ok: false, status: 403 },
    { error: 'Michael AI requires a Plus plan or higher. Upgrade at directive-crm.com.' },
    'Michael lead search failed — try again.',
  )

  assert.deepEqual(result, {
    ok: false,
    error: 'Michael AI requires a Plus plan or higher. Upgrade at directive-crm.com.',
  })
})

test('interpretMichaelLeadResponse returns success payloads unchanged for OK responses', () => {
  const payload = {
    zip: '35801',
    riskLevel: 'Critical',
    leads: [{ address: '208 Marsheutz Ave SE, Huntsville, AL 35801, USA', score: 91 }],
  }

  const result = interpretMichaelLeadResponse(
    { ok: true, status: 200 },
    payload,
    'Michael lead search failed — try again.',
  )

  assert.deepEqual(result, {
    ok: true,
    data: payload,
  })
})
