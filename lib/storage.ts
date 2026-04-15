import { supabase } from './supabase'
import type { Property, Client, Proposal, ProposalLineItem, Material, ChatMessage, Job } from './types'
import type { UserRole } from './tiers'

// ── STORAGE RESULT TYPE ─────────────────────────────────────────────────────

export interface StorageResult {
  ok: boolean
  source: 'supabase' | 'local' | null
  error?: string
}

// ── AUTH / OWNERSHIP HELPERS ────────────────────────────────────────────────
// Every row in the hardened schema (Migration 002) carries an owner_id that
// RLS policies check against auth.uid(). Client-side writes need to attach
// the current user's id before hitting Postgres or the insert will be rejected.

async function getOwnerId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  } catch {
    return null
  }
}

// Attach owner_id + updated_at if missing. Returns the payload unchanged when
// no user is signed in so that local-only tests don't throw; RLS will still
// reject the write at the DB layer in that case.
async function withOwner<T extends Record<string, unknown>>(row: T): Promise<T & { owner_id?: string }> {
  const ownerId = await getOwnerId()
  if (!ownerId) return row
  return { owner_id: ownerId, ...row }
}

// ── USER PROFILE / ROLE ──────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  company_name: string | null
  plan_expires_at: string | null
  manager_id: string | null   // For enterprise reps — points to manager user id
  created_at: string
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) return null
    return data as UserProfile
  } catch { return null }
}

export async function upsertUserProfile(profile: Partial<UserProfile> & { id: string }): Promise<StorageResult> {
  try {
    const { error } = await supabase.from('profiles').upsert(profile)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── COMPANY SETTINGS ─────────────────────────────────────────────────────────

export interface CompanySettings {
  company_name: string
  company_phone: string
  company_email: string
  license_number: string
  service_radius_miles: number
  tax_rate: number        // stored as decimal 0–1 in DB (e.g. 0.085 = 8.5%)
  default_warranty_years: number
  default_payment_terms: string
  notification_prefs: Record<string, unknown>
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return null
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .eq('owner_id', ownerId)
      .maybeSingle()
    if (error || !data) return null
    return data as CompanySettings
  } catch { return null }
}

export async function saveCompanySettings(settings: Partial<CompanySettings>): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase.from('company_settings').upsert({
      owner_id: ownerId,
      ...settings,
      updated_at: new Date().toISOString(),
    })
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── PROPERTIES ──────────────────────────────────────────────────────────────

export async function getProperties(): Promise<Property[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as Property[]
  } catch {
    return []
  }
}

export async function saveProperty(property: Property): Promise<StorageResult> {
  try {
    const payload = await withOwner(property as unknown as Record<string, unknown>)
    const { error } = await supabase.from('properties').upsert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteProperty(id: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase.from('properties').delete().eq('id', id).eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── CLIENTS ─────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as Client[]
  } catch {
    return []
  }
}

export async function saveClient(client: Client): Promise<StorageResult> {
  try {
    const payload = await withOwner(client as unknown as Record<string, unknown>)
    const { error } = await supabase.from('clients').upsert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteClient(id: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase.from('clients').delete().eq('id', id).eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── ACTIVITY LOG ─────────────────────────────────────────────────────────────

export async function saveActivity(params: {
  entityType: 'property' | 'client' | 'proposal' | 'job' | 'claim' | 'settings'
  entityId: string
  action: 'create' | 'update' | 'delete' | 'status_change' | 'login' | 'ai_call' | string
  metadata?: Record<string, unknown>
}): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase.from('activity_log').insert({
      owner_id: ownerId,
      actor_id: ownerId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      metadata: params.metadata ?? {},
    })
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    // Fail silently — activity log is non-critical
    return { ok: false, source: null, error: String(e) }
  }
}

// ── PROPOSALS ────────────────────────────────────────────────────────────────

export async function getProposals(): Promise<Proposal[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('proposals')
      .select('*, proposal_line_items(*)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((p: Record<string, unknown>) => ({
      ...p,
      line_items: p.proposal_line_items || []
    })) as Proposal[]
  } catch {
    return []
  }
}

export async function saveProposal(proposal: Proposal): Promise<StorageResult> {
  try {
    const { line_items, ...proposalData } = proposal
    const payload = await withOwner(proposalData as unknown as Record<string, unknown>)
    const { error: proposalError } = await supabase.from('proposals').upsert(payload)
    if (proposalError) return { ok: false, source: 'supabase', error: proposalError.message }
    if (line_items?.length) {
      await supabase.from('proposal_line_items').delete().eq('proposal_id', proposal.id)
      const { error: itemsError } = await supabase.from('proposal_line_items').insert(
        line_items.map((item: ProposalLineItem, idx: number) => ({
          ...item,
          proposal_id: proposal.id,
          sort_order: idx,
        }))
      )
      if (itemsError) return { ok: false, source: 'supabase', error: itemsError.message }
    }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteProposal(id: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    await supabase.from('proposal_line_items').delete().eq('proposal_id', id)
    const { error } = await supabase.from('proposals').delete().eq('id', id).eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── MATERIALS ────────────────────────────────────────────────────────────────

export async function getMaterials(): Promise<Material[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('owner_id', ownerId)
      .order('name')
    if (error) throw error
    return (data || []) as Material[]
  } catch {
    return []
  }
}

export async function saveMaterial(material: Material): Promise<StorageResult> {
  try {
    const payload = await withOwner(material as unknown as Record<string, unknown>)
    const { error } = await supabase.from('materials').upsert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteMaterial(id: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    await saveActivity({ entityType: 'property', entityId: id, action: 'delete', metadata: { table: 'materials' } })
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── CHAT MESSAGES ────────────────────────────────────────────────────────────

export async function getChatMessages(channel: string): Promise<ChatMessage[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('channel', channel)
      .order('timestamp', { ascending: true })
    if (error) throw error
    return (data || []) as ChatMessage[]
  } catch {
    return []
  }
}

export async function saveChatMessage(message: ChatMessage): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    // Refuse to insert ownerless chat messages — RLS policies depend on owner_id.
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const payload = { ...message, owner_id: ownerId, sender_id: ownerId }
    const { error } = await supabase.from('chat_messages').insert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function markMessagesRead(channel: string, role: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase
      .from('chat_messages')
      .update({ read: true })
      .eq('owner_id', ownerId)
      .eq('channel', channel)
      .neq('sender_role', role)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── JOBS ─────────────────────────────────────────────────────────────────────

export async function getJobs(): Promise<Job[]> {
  const ownerId = await getOwnerId()
  const lsKey = ownerId ? `directive_jobs_${ownerId}` : 'directive_jobs'
  try {
    if (!ownerId) {
      const stored = localStorage.getItem(lsKey)
      return stored ? (JSON.parse(stored) as Job[]) : []
    }
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((j: Record<string, unknown>) => ({
      ...j,
      crew_members: (j.crew_members as string[]) || [],
      photos: (j.photos as Job['photos']) || [],
      insurance: (j.insurance as Job['insurance']) || null,
    })) as Job[]
  } catch {
    // Fallback to per-user localStorage for offline support
    try {
      const stored = localStorage.getItem(lsKey)
      return stored ? (JSON.parse(stored) as Job[]) : []
    } catch {
      return []
    }
  }
}

export async function saveJob(job: Job): Promise<StorageResult> {
  const ownerId = await getOwnerId()
  const lsKey = ownerId ? `directive_jobs_${ownerId}` : 'directive_jobs'
  let localOk = false
  // Always save to per-user localStorage for offline resilience
  try {
    const existing = JSON.parse(localStorage.getItem(lsKey) || '[]') as Job[]
    const updated = existing.filter((j: Job) => j.id !== job.id)
    updated.unshift(job)
    localStorage.setItem(lsKey, JSON.stringify(updated))
    localOk = true
  } catch { /* ignore */ }

  try {
    const payload = await withOwner(job as unknown as Record<string, unknown>)
    const { error } = await supabase.from('jobs').upsert(payload)
    if (error) throw error
    return { ok: true, source: 'supabase' }
  } catch (e) {
    if (localOk) return { ok: false, source: 'local', error: String(e) }
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteJob(id: string): Promise<StorageResult> {
  const ownerId = await getOwnerId()
  const lsKey = ownerId ? `directive_jobs_${ownerId}` : 'directive_jobs'
  try {
    const existing = JSON.parse(localStorage.getItem(lsKey) || '[]') as Job[]
    localStorage.setItem(lsKey, JSON.stringify(existing.filter((j: Job) => j.id !== id)))
  } catch { /* ignore */ }
  try {
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase.from('jobs').delete().eq('id', id).eq('owner_id', ownerId)
    if (error) throw error
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: 'local', error: String(e) }
  }
}
