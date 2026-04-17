import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveSettledSection } from '../lib/dashboardHydration.ts'
import { isDurableStorageSuccess } from '../lib/storageResults.ts'

test('isDurableStorageSuccess returns true only for synced Supabase saves', () => {
  assert.equal(isDurableStorageSuccess({ ok: true, source: 'supabase' }), true)
  assert.equal(isDurableStorageSuccess({ ok: false, source: 'local' }), false)
  assert.equal(isDurableStorageSuccess({ ok: false, source: null }), false)
})

test('resolveSettledSection preserves successful section data', () => {
  const resolved = resolveSettledSection<string[]>(
    { status: 'fulfilled', value: ['a', 'b'] },
    [],
  )

  assert.deepEqual(resolved, { value: ['a', 'b'], failed: false })
})

test('resolveSettledSection falls back per section instead of aborting the whole load', () => {
  const resolved = resolveSettledSection<string[]>(
    { status: 'rejected', reason: new Error('boom') },
    [],
  )

  assert.deepEqual(resolved, { value: [], failed: true })
})
