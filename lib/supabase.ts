/* eslint-disable @typescript-eslint/no-explicit-any */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

function createMissingConfigError(): Error {
  return new Error(
    'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

function createMissingQueryBuilder() {
  const result = Promise.resolve({
    data: null,
    error: createMissingConfigError(),
    count: null,
    status: 503,
    statusText: 'Supabase not configured',
  })

  const builder = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return result.then.bind(result)
        if (prop === 'catch') return result.catch.bind(result)
        if (prop === 'finally') return result.finally.bind(result)
        return () => builder
      },
    }
  )

  return builder
}

function createMissingStorageBucket() {
  return {
    upload: async () => ({ data: null, error: createMissingConfigError() }),
    createSignedUrl: async () => ({ data: null, error: createMissingConfigError() }),
    list: async () => ({ data: [], error: createMissingConfigError() }),
    remove: async () => ({ data: null, error: createMissingConfigError() }),
  }
}

function createMissingSupabaseClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      refreshSession: async () => ({
        data: { session: null, user: null },
        error: createMissingConfigError(),
      }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: createMissingConfigError(),
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: createMissingConfigError(),
      }),
      resetPasswordForEmail: async () => ({
        data: null,
        error: createMissingConfigError(),
      }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe() {},
          },
        },
      }),
    },
    from: () => createMissingQueryBuilder(),
    rpc: () => createMissingQueryBuilder(),
    storage: {
      from: () => createMissingStorageBucket(),
    },
  }
}

export const supabase: any = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : createMissingSupabaseClient()
