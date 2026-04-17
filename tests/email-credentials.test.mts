import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decryptEmailCredential,
  encryptEmailCredential,
} from '../lib/emailCredentials.ts'

test('encryptEmailCredential and decryptEmailCredential round-trip secrets', () => {
  process.env.EMAIL_ACCOUNT_ENCRYPTION_KEY = 'test-email-key'

  const encrypted = encryptEmailCredential('super-secret-password')

  assert.notEqual(encrypted, 'super-secret-password')
  assert.equal(decryptEmailCredential(encrypted), 'super-secret-password')
})

test('decryptEmailCredential rejects legacy plaintext when fallback is disabled', () => {
  process.env.EMAIL_ACCOUNT_ENCRYPTION_KEY = 'test-email-key'
  delete process.env.EMAIL_ALLOW_PLAINTEXT_FALLBACK

  assert.throws(
    () => decryptEmailCredential('legacy-plaintext-password'),
    /not encrypted/i,
  )
})

test('decryptEmailCredential allows legacy plaintext only when explicitly enabled', () => {
  process.env.EMAIL_ACCOUNT_ENCRYPTION_KEY = 'test-email-key'
  process.env.EMAIL_ALLOW_PLAINTEXT_FALLBACK = 'true'

  assert.equal(
    decryptEmailCredential('legacy-plaintext-password'),
    'legacy-plaintext-password',
  )
})
