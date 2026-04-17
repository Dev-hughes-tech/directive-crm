import test from 'node:test'
import assert from 'node:assert/strict'

import {
  authorizeResearchJob,
  buildResearchJobStatusPayload,
} from '../lib/researchJobs.ts'

test('authorizeResearchJob denies access when the viewer cannot access the job owner', async () => {
  const job = {
    id: 'job_123',
    owner_id: 'owner_b',
    address: '123 Audit Trail Ln, Atlanta, GA',
  }

  const resolved = await authorizeResearchJob(job, async () => false)

  assert.equal(resolved, null)
})

test('authorizeResearchJob returns the stored job address for authorized work', async () => {
  const job = {
    id: 'job_123',
    owner_id: 'owner_a',
    address: '123 Audit Trail Ln, Atlanta, GA',
  }

  const resolved = await authorizeResearchJob(job, async (ownerId) => ownerId === 'owner_a')

  assert.deepEqual(resolved, {
    jobId: 'job_123',
    ownerId: 'owner_a',
    address: '123 Audit Trail Ln, Atlanta, GA',
  })
})

test('buildResearchJobStatusPayload preserves nullable result and error fields', () => {
  const payload = buildResearchJobStatusPayload({
    id: 'job_123',
    status: 'running',
    result: null,
    error_message: null,
  })

  assert.deepEqual(payload, {
    jobId: 'job_123',
    status: 'running',
    data: null,
    error: null,
  })
})
