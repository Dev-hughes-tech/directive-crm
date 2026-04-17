import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  const svc = getSupabaseClient()
  const checks = {
    app: 'ok',
    supabaseConfigured: Boolean(svc),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    mapsConfigured: Boolean(process.env.NEXT_PUBLIC_MAPS_API_KEY || process.env.MAPS_API_KEY),
    emailEncryptionConfigured: Boolean(process.env.EMAIL_ACCOUNT_ENCRYPTION_KEY),
  }

  let database = 'not_configured'
  if (svc) {
    const { error } = await svc.from('profiles').select('id').limit(1)
    database = error ? 'error' : 'ok'
  }

  const ok = checks.supabaseConfigured && database === 'ok'

  return NextResponse.json({
    ok,
    timestamp: new Date().toISOString(),
    checks: {
      ...checks,
      database,
    },
  }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
