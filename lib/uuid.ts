import { uuidv7 } from 'uuidv7'

/**
 * UUIDv7 — time-ordered, sortable. Use for ALL database primary keys
 * (properties, jobs, clients, proposals, materials, chat messages, photos, etc.)
 * Better Postgres B-tree index performance than v4.
 */
export function generateId(): string {
  return uuidv7()
}

/**
 * UUIDv4 — fully random, no timestamp leakage. Use for public-facing or
 * security-sensitive IDs: share links, session tokens, password reset tokens.
 */
export function generatePublicId(): string {
  return crypto.randomUUID()
}
