import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SEVERE_HAIL_THRESHOLD_INCHES,
  buildHailEventKey,
  classifyHailSeverity,
  countSevereHailEvents,
  dedupeHailEvents,
} from '../lib/hailEvents.ts'

test('classifyHailSeverity uses the shared severe threshold', () => {
  assert.equal(SEVERE_HAIL_THRESHOLD_INCHES, 2)
  assert.equal(classifyHailSeverity(0.75), 'minor')
  assert.equal(classifyHailSeverity(1.75), 'moderate')
  assert.equal(classifyHailSeverity(2), 'severe')
})

test('dedupeHailEvents collapses overlapping events with the same normalized signature', () => {
  const events = [
    { source: 'spotter', date: '2026-04-10T10:02:00Z', lat: 32.12341, lng: -86.54321, size: 2.1 },
    { source: 'radar', date: '20260410100000', lat: 32.1234, lng: -86.5432, size: 2.08 },
    { source: 'radar', date: '2026-04-10T11:00:00Z', lat: 32.1234, lng: -86.5432, size: 1.25 },
  ]

  const deduped = dedupeHailEvents(events, event => event)

  assert.equal(deduped.length, 2)
  assert.deepEqual(deduped, [events[0], events[2]])
})

test('buildHailEventKey prefers provider event ids when available', () => {
  const withIds = buildHailEventKey({
    provider: 'mesonet',
    providerEventId: 'abc123',
    date: '2026-04-10T10:02:00Z',
    lat: 32.12,
    lng: -86.54,
    size: 2.1,
  })

  const withoutIds = buildHailEventKey({
    provider: 'mesonet',
    date: '2026-04-10T10:02:00Z',
    lat: 32.12,
    lng: -86.54,
    size: 2.1,
  })

  assert.equal(withIds, 'mesonet:id:abc123')
  assert.notEqual(withIds, withoutIds)
})

test('countSevereHailEvents uses the shared threshold for aggregate counts', () => {
  const events = [{ size: 1.5 }, { size: 1.99 }, { size: 2.0 }, { size: 2.75 }]

  assert.equal(countSevereHailEvents(events, event => event.size), 2)
})
