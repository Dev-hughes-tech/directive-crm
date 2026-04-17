import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function supabaseModuleUrl(): string {
  const fileUrl = pathToFileURL(path.resolve(process.cwd(), 'lib/supabase.ts')).href
  return `${fileUrl}?t=${Date.now()}`
}

test('supabase client fails soft when browser env vars are missing', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  try {
    const { supabase } = await import(supabaseModuleUrl())
    const sessionResult = await supabase.auth.getSession()
    const signInResult = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password123',
    })

    assert.equal(sessionResult.data.session, null)
    assert.match(signInResult.error?.message ?? '', /Supabase is not configured/i)
  } finally {
    if (typeof originalUrl === 'string') {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
    }

    if (typeof originalAnonKey === 'string') {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey
    } else {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    }
  }
})
