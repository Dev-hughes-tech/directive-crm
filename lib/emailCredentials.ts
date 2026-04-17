import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const VERSION = 'v1'
const IV_BYTES = 12

function getEncryptionKey(): Buffer {
  const secret = process.env.EMAIL_ACCOUNT_ENCRYPTION_KEY
  if (!secret) {
    throw new Error('EMAIL_ACCOUNT_ENCRYPTION_KEY is not configured')
  }

  return createHash('sha256').update(secret).digest()
}

export function encryptEmailCredential(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

export function decryptEmailCredential(payload: string): string {
  if (!payload.startsWith(`${VERSION}:`)) {
    if (process.env.EMAIL_ALLOW_PLAINTEXT_FALLBACK === 'true') {
      return payload
    }
    throw new Error('Stored email credential is not encrypted')
  }

  const [, ivRaw, authTagRaw, encryptedRaw] = payload.split(':')
  if (!ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error('Stored email credential is malformed')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivRaw, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(authTagRaw, 'base64url'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}
