import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { log } from '@/lib/logger'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    source?: string
    route?: string
    message?: string
    digest?: string
    metadata?: Record<string, unknown>
  } | null

  if (!body?.source || !body.message) {
    return NextResponse.json({ error: 'source and message are required' }, { status: 400 })
  }

  const entry = {
    source: body.source,
    route: body.route || null,
    message: body.message,
    digest: body.digest || null,
    metadata: body.metadata ?? {},
  }

  log.error('/api/observability/error', new Error(body.message), {
    source: body.source,
    route: body.route || null,
    digest: body.digest || null,
    clientMetadata: body.metadata ?? {},
  })

  const svc = getServiceClient()
  if (svc) {
    await svc.from('app_error_events').insert(entry)
  }

  return NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
