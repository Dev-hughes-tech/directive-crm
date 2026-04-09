import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Returns immediately with jobId. Research runs via after() which Vercel
// keeps alive even after the response is sent (no premature kill).
export const maxDuration = 60

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

  const jobId = job.id

  // Use after() so Vercel keeps this function alive until research completes.
  // This avoids the fire-and-forget kill problem on serverless.
  after(async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.directivecrm.com'
    try {
      await fetch(`${baseUrl}/api/research/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, address }),
      })
    } catch (err) {
      console.error('Process fetch error:', err)
      // Mark job as error so frontend stops polling
      await supabase
        .from('research_jobs')
        .update({ status: 'error', error_message: 'Failed to reach process worker', updated_at: new Date().toISOString() })
        .eq('id', jobId)
    }
  })

  // Return immediately — frontend can start polling
  return NextResponse.json({ jobId, status: 'pending' })
}
