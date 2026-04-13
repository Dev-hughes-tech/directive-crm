import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  // Use service role key to bypass RLS
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message, profile: null }, { status: 200 })
  }

  return NextResponse.json({ profile: data })
}
