import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildIemLsrGeoJsonUrl,
  buildStormSearchBounds,
  normalizeIemHistoricalEvents,
  summarizeHistoricalEvents,
} from '../lib/stormHistory.ts'

test('historical storm queries use the IEM LSR endpoint instead of the broken NOAA 10-year path', () => {
  const start = new Date('2016-04-16T00:00:00Z')
  const end = new Date('2026-04-16T00:00:00Z')

  const url = buildIemLsrGeoJsonUrl({
    lat: 35.4676,
    lng: -97.5164,
    radiusMiles: 30,
    start,
    end,
  })

  assert.match(url, /^https:\/\/mesonet\.agron\.iastate\.edu\/geojson\/lsr\.geojson\?/)
  assert.doesNotMatch(url, /swdiws|ncdc\.noaa|ncei\.noaa/)
  assert.match(url, /north=/)
  assert.match(url, /south=/)
  assert.match(url, /east=/)
  assert.match(url, /west=/)
  assert.match(url, /sts=2016-04-16T00%3A00Z/)
  assert.match(url, /ets=2026-04-16T00%3A00Z/)
})

test('normalizeIemHistoricalEvents keeps hail tornado and wind reports and drops unrelated weather types', () => {
  const normalized = normalizeIemHistoricalEvents([
    {
      geometry: { coordinates: [-97.36, 35.8] },
      properties: {
        typetext: 'HAIL',
        valid: '2024-05-07T03:24:00Z',
        magnitude: '1.75',
        city: '7 SSE Guthrie',
        state: 'OK',
        remark: null,
        source: 'Emergency Mngr',
      },
    },
    {
      geometry: { coordinates: [-97.12, 35.33] },
      properties: {
        typetext: 'TORNADO',
        valid: '2024-04-26T09:52:00Z',
        magnitude: null,
        city: '4 WNW Bethel Acres',
        state: 'OK',
        remark: 'Trees and powerlines down.',
        source: 'Emergency Mngr',
      },
    },
    {
      geometry: { coordinates: [-97.46, 35.38] },
      properties: {
        typetext: 'TSTM WND GST',
        valid: '2024-05-06T16:42:00Z',
        magnitude: '89.0',
        city: '2 SE Valley Brook',
        state: 'OK',
        remark: 'Time estimated from radar.',
        source: 'Trained Spotter',
      },
    },
    {
      geometry: { coordinates: [-97.33, 35.74] },
      properties: {
        typetext: 'FREEZING RAIN',
        valid: '2024-01-22T15:30:00Z',
        magnitude: '0.12',
        city: '5 N Arcadia',
        state: 'OK',
        remark: null,
        source: 'Emergency Mngr',
      },
    },
  ])

  assert.equal(normalized.length, 3)
  assert.deepEqual(
    normalized.map((event) => event.type),
    ['hail', 'tornado', 'wind'],
  )
  assert.equal(normalized[0]?.size, 1.75)
  assert.equal(normalized[1]?.city, '4 WNW Bethel Acres')
  assert.equal(normalized[2]?.magnitude, 89)
})

test('summarizeHistoricalEvents derives the stormscope summary and yearly rollup from normalized events', () => {
  const events = normalizeIemHistoricalEvents([
    {
      geometry: { coordinates: [-97.36, 35.8] },
      properties: {
        typetext: 'HAIL',
        valid: '2024-05-07T03:24:00Z',
        magnitude: '1.75',
        city: '7 SSE Guthrie',
        state: 'OK',
        remark: null,
        source: 'Emergency Mngr',
      },
    },
    {
      geometry: { coordinates: [-97.39, 35.85] },
      properties: {
        typetext: 'HAIL',
        valid: '2024-05-07T03:22:00Z',
        magnitude: '2.25',
        city: '3 SE Guthrie',
        state: 'OK',
        remark: null,
        source: 'Public',
      },
    },
    {
      geometry: { coordinates: [-97.12, 35.33] },
      properties: {
        typetext: 'TORNADO',
        valid: '2024-04-26T09:52:00Z',
        magnitude: null,
        city: '4 WNW Bethel Acres',
        state: 'OK',
        remark: 'Trees and powerlines down.',
        source: 'Emergency Mngr',
      },
    },
    {
      geometry: { coordinates: [-97.46, 35.38] },
      properties: {
        typetext: 'TSTM WND GST',
        valid: '2024-05-06T16:42:00Z',
        magnitude: '89.0',
        city: '2 SE Valley Brook',
        state: 'OK',
        remark: 'Time estimated from radar.',
        source: 'Trained Spotter',
      },
    },
  ])

  const summary = summarizeHistoricalEvents(events, { years: 10, radiusMiles: 30 })

  assert.equal(summary.summary.totalEvents, 4)
  assert.equal(summary.summary.hailEvents, 2)
  assert.equal(summary.summary.severeHailEvents, 1)
  assert.equal(summary.summary.tornadoEvents, 1)
  assert.equal(summary.summary.windEvents, 1)
  assert.equal(summary.summary.maxHailSize, 2.25)
  assert.equal(summary.summary.yearsAnalyzed, 10)
  assert.equal(summary.summary.radiusMiles, 30)
  assert.equal(summary.summary.riskLevel, 'High')
  assert.equal(summary.yearSummary['2024']?.hail, 2)
  assert.equal(summary.yearSummary['2024']?.tornado, 1)
  assert.equal(summary.yearSummary['2024']?.wind, 1)
  assert.equal(summary.yearSummary['2024']?.radar_hail, 0)
  assert.equal(summary.yearSummary['2024']?.mesocyclone, 0)
  assert.equal(summary.events[0]?.date, '2024-05-07T03:24:00Z')
})

test('buildStormSearchBounds expands around the center point with sane cardinal ordering', () => {
  const bounds = buildStormSearchBounds(35.4676, -97.5164, 30)

  assert.ok(bounds.north > 35.4676)
  assert.ok(bounds.south < 35.4676)
  assert.ok(bounds.east > -97.5164)
  assert.ok(bounds.west < -97.5164)
})
