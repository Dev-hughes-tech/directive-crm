import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('root README documents Directive CRM instead of the starter template', () => {
  const readme = read('../README.md')

  assert.match(readme, /Directive CRM/)
  assert.doesNotMatch(readme, /create-next-app/i)
  assert.doesNotMatch(readme, /Geist/i)
})

test('MCP README describes verified and unverified capability boundaries', () => {
  const readme = read('../directive-crm-mcp-server/README.md')

  assert.match(readme, /verified/i)
  assert.match(readme, /unverified/i)
  assert.doesNotMatch(readme, /all core Directive CRM capabilities/i)
})

test('layout no longer carries the commented-out font experiment blocks', () => {
  const layout = read('../app/layout.tsx')

  assert.doesNotMatch(layout, /\/\/ const inter/i)
  assert.doesNotMatch(layout, /\/\/ const spaceGrotesk/i)
  assert.doesNotMatch(layout, /\/\/ const jetbrainsMono/i)
})

test('damage photo upload uses an authenticated backend path instead of localStorage placeholders', () => {
  const component = read('../components/DamagePhotoUpload.tsx')

  assert.doesNotMatch(component, /localStorage/)
  assert.match(component, /\/api\/properties\/photos/)
})

test('schema backfill migration defines profiles and hardens searches/core RLS', () => {
  const canonicalProfiles = read('../supabase/migrations/000_profiles_schema.sql')
  const liveBackfill = read('../supabase/migrations/010_profiles_and_rls_backfill.sql')

  assert.match(canonicalProfiles, /create table if not exists public\.profiles/i)
  assert.match(liveBackfill, /alter table if exists public\.searches enable row level security/i)
  assert.match(liveBackfill, /drop policy if exists "Allow all for anon" on public\.properties/i)
  assert.match(liveBackfill, /drop policy if exists open_access on public\.properties/i)
})

test('dashboard does not navigate to login during render', () => {
  const page = read('../app/page.tsx')

  assert.doesNotMatch(page, /if \(!user\)\s*\{\s*router\.push\('\/login'\)/)
})

test('migration versions are unique', () => {
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  const versions = files.map((file) => file.split('_', 1)[0])
  const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index)

  assert.deepEqual([...new Set(duplicates)], [])
})

test('harden schema migration backfills lat/lng before adding range constraints', () => {
  const migration = read('../supabase/migrations/002_harden_schema.sql')

  assert.match(migration, /alter table properties add column if not exists lat double precision;/i)
  assert.match(migration, /alter table properties add column if not exists lng double precision;/i)
})
