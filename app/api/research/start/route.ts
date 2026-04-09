import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This endpoint returns IMMEDIATELY with a jobId.
// The actual research runs in /api/research/process (fire-and-forget).
export const maxDuration = 10

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const { address } = await request.json()
  if (!address?.trim()) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  // Create the job record
  const { data: job, error } = await supabase
    .from('research_jobs')
    .insert({ address, status: 'pending' })
    .select('id')
    .single()

  if (error || !job) {
    console.error('Failed to create research job:', error)
    return NextResponse.json({ error: 'Could not start research' }, { status: 500 })
  }

  // Fire off the process endpoint — do NOT await it
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://www.directivecrm.com`
  fetch(`${baseUrl}/api/research/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: job.id, address }),
  }).catch(() => {/* fire and forget */})

  return NextResponse.json({ jobId: job.id, status: 'pending' })
}
