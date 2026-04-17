import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import {
  authorizeResearchJob,
  buildResearchJobStatusPayload,
} from '@/lib/researchJobs'

// Fast polling endpoint — reads job status from Supabase
export const maxDuration = 10

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }

  const { data: job, error } = await auth.supabase
    .from('research_jobs')
    .select('id, owner_id, address, status, result, error_message')
    .eq('id', jobId)
    .eq('owner_id', auth.user.id)
    .maybeSingle()

  const resolvedJob = await authorizeResearchJob(
    job,
    async (ownerId) => ownerId === auth.user.id,
  )

  if (error || !job || !resolvedJob) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(
    buildResearchJobStatusPayload(job),
  )
}
