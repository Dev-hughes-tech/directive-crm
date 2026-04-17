import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeResearchData } from '../lib/researchNormalization.ts'

const CURRENT_YEAR = new Date().getUTCFullYear()

test('normalizeResearchData does not derive roof age from year built alone', () => {
  const normalized = normalizeResearchData({
    yearBuilt: 2006,
    roofAgeYears: null,
    roofAgeEstimated: true,
    permitLastDate: null,
    flags: ['estimated-roof-age', 'old-roof', 'high-value'],
    sources: { roofAgeYears: 'year built heuristic' },
  })

  assert.equal(normalized.roofAgeYears, null)
  assert.equal(normalized.roofAgeEstimated, false)
  assert.deepEqual(normalized.flags, ['high-value'])
})

test('normalizeResearchData computes roof age from permit date instead of trusting model output', () => {
  const permitYear = CURRENT_YEAR - 8

  const normalized = normalizeResearchData({
    yearBuilt: 1994,
    permitLastDate: `${permitYear}-05-20`,
    roofAgeYears: 31,
    roofAgeEstimated: true,
    flags: [],
    sources: { permitLastDate: 'county permit portal' },
  })

  assert.equal(normalized.roofAgeYears, 8)
  assert.equal(normalized.roofAgeEstimated, false)
})

test('normalizeResearchData adds old-roof only for permit-backed ages over the threshold', () => {
  const permitYear = CURRENT_YEAR - 24

  const normalized = normalizeResearchData({
    permitLastDate: `${permitYear}-02-11`,
    roofAgeYears: null,
    flags: ['estimated-roof-age'],
    sources: { permitLastDate: 'permit search' },
  })

  assert.equal(normalized.roofAgeYears, 24)
  assert.deepEqual(normalized.flags, ['old-roof'])
})
