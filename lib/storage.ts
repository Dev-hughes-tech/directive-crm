import { supabase } from './supabase'
import type {
  Property,
  Client,
  Proposal,
  ProposalLineItem,
  Material,
  ChatMessage,
  Job,
  WorkSession,
  Invoice,
  Estimate,
  Contract,
  DocumentFile,
} from './types'
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

// Attach owner_id + updated_at. THROWS if no user is signed in so callers
// surface a clear "not signed in" error instead of silently hitting RLS and
// appearing to succeed-but-not-persist.
async function withOwner<T extends Record<string, unknown>>(row: T): Promise<T & { owner_id: string; updated_at: string }> {
  const ownerId = await getOwnerId()
  if (!ownerId) {
    throw new Error('Not signed in — please log in again to save your work')
  }
  return { ...row, owner_id: ownerId, updated_at: new Date().toISOString() }
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

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', ownerId)
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
    await saveActivity({ entityType: 'property', entityId: id, action: 'delete' })
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── CLIENTS ─────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  const ownerId = await getOwnerId()
  if (!ownerId) {
    // Throw so the UI can show a re-login banner instead of silently wiping the list.
    throw new Error('NOT_SIGNED_IN')
  }
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as Client[]
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
    await saveActivity({ entityType: 'client', entityId: id, action: 'delete' })
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
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { line_items, ...proposalData } = proposal
    const payload = await withOwner(proposalData as unknown as Record<string, unknown>)
    const { error: proposalError } = await supabase.from('proposals').upsert(payload)
    if (proposalError) return { ok: false, source: 'supabase', error: proposalError.message }
    if (line_items?.length) {
      await supabase.from('proposal_line_items').delete().eq('proposal_id', proposal.id).eq('owner_id', ownerId)
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
    await supabase.from('proposal_line_items').delete().eq('proposal_id', id).eq('owner_id', ownerId)
    const { error } = await supabase.from('proposals').delete().eq('id', id).eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    await saveActivity({ entityType: 'proposal', entityId: id, action: 'delete' })
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
  if (!ownerId) return []
  const lsKey = `directive_jobs_${ownerId}`
  try {
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
  if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
  const lsKey = `directive_jobs_${ownerId}`
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
  if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
  const lsKey = `directive_jobs_${ownerId}`
  try {
    const existing = JSON.parse(localStorage.getItem(lsKey) || '[]') as Job[]
    localStorage.setItem(lsKey, JSON.stringify(existing.filter((j: Job) => j.id !== id)))
  } catch { /* ignore */ }
  try {
    const { error } = await supabase.from('jobs').delete().eq('id', id).eq('owner_id', ownerId)
    if (error) throw error
    await saveActivity({ entityType: 'job', entityId: id, action: 'delete' })
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: 'local', error: String(e) }
  }
}

// ── WORK SESSIONS ────────────────────────────────────────────────────────────

export async function getSessions(): Promise<WorkSession[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('owner_id', ownerId)
      .order('last_accessed_at', { ascending: false })
      .limit(50)
    if (error) return []
    return (data || []) as WorkSession[]
  } catch {
    return []
  }
}

export async function createSession(
  name: string,
  opts?: { zip?: string | null; city?: string | null; state?: string | null }
): Promise<WorkSession | null> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return null

    await supabase
      .from('work_sessions')
      .update({ is_active: false })
      .eq('owner_id', ownerId)
      .eq('is_active', true)

    const now = new Date().toISOString()
    const payload = await withOwner({
      id: `ses_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      zip: opts?.zip ?? null,
      city: opts?.city ?? null,
      state: opts?.state ?? null,
      property_count: 0,
      client_count: 0,
      is_active: true,
      last_accessed_at: now,
      created_at: now,
    })

    const { data, error } = await supabase
      .from('work_sessions')
      .insert(payload)
      .select('*')
      .single()

    if (error) return null
    return data as WorkSession
  } catch {
    return null
  }
}

export async function activateSession(sessionId: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'Not signed in' }

    await supabase
      .from('work_sessions')
      .update({ is_active: false })
      .eq('owner_id', ownerId)
      .eq('is_active', true)

    const { error } = await supabase
      .from('work_sessions')
      .update({
        is_active: true,
        last_accessed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('owner_id', ownerId)

    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function renameSession(sessionId: string, name: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'Not signed in' }
    const { error } = await supabase
      .from('work_sessions')
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function copySession(sessionId: string, name?: string): Promise<WorkSession | null> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return null
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('owner_id', ownerId)
      .single()
    if (error || !data) return null
    return createSession(name ?? `${data.name} Copy`, {
      zip: data.zip,
      city: data.city,
      state: data.state,
    })
  } catch {
    return null
  }
}

export async function closeSession(sessionId?: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'Not signed in' }
    const query = supabase
      .from('work_sessions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('owner_id', ownerId)
    const { error } = sessionId ? await query.eq('id', sessionId) : await query.eq('is_active', true)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function getActiveSession(): Promise<WorkSession | null> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return null
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('is_active', true)
      .maybeSingle()
    if (error) return null
    return (data as WorkSession | null) ?? null
  } catch {
    return null
  }
}

export async function getSessionProperties(sessionId: string): Promise<Property[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as Property[]
  } catch {
    return []
  }
}

export async function updateSessionCounts(
  sessionId: string,
  propertyCount: number,
  clientCount: number
): Promise<void> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return
    await supabase
      .from('work_sessions')
      .update({
        property_count: propertyCount,
        client_count: clientCount,
        last_accessed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('owner_id', ownerId)
  } catch {
    // non-critical sync
  }
}

// ── ACCOUNTING DOCUMENTS ────────────────────────────────────────────────────

export function generateInvoiceNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  return `INV-${year}-${Date.now().toString(36).slice(-6).toUpperCase()}`
}

export async function getInvoices(): Promise<Invoice[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as Invoice[]
  } catch {
    return []
  }
}

export async function saveInvoice(invoice: Invoice): Promise<StorageResult> {
  try {
    const payload = await withOwner(invoice as unknown as Record<string, unknown>)
    const { error } = await supabase.from('invoices').upsert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteInvoice(id: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export function generateEstimateNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  return `EST-${year}-${Date.now().toString(36).slice(-6).toUpperCase()}`
}

export async function getEstimates(): Promise<Estimate[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('estimates')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as Estimate[]
  } catch {
    return []
  }
}

export async function saveEstimate(estimate: Estimate): Promise<StorageResult> {
  try {
    const payload = await withOwner(estimate as unknown as Record<string, unknown>)
    const { error } = await supabase.from('estimates').upsert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteEstimate(id: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase
      .from('estimates')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export function generateContractNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  return `CON-${year}-${Date.now().toString(36).slice(-6).toUpperCase()}`
}

export async function getContracts(): Promise<Contract[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as Contract[]
  } catch {
    return []
  }
}

export async function saveContract(contract: Contract): Promise<StorageResult> {
  try {
    const payload = await withOwner(contract as unknown as Record<string, unknown>)
    const { error } = await supabase.from('contracts').upsert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function deleteContract(id: string): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }
    const { error } = await supabase
      .from('contracts')
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

// ── DOCUMENT STORAGE ────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'directive-documents'

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function saveDocumentFileRecord(file: DocumentFile): Promise<StorageResult> {
  try {
    const payload = await withOwner(file as unknown as Record<string, unknown>)
    const { error } = await supabase.from('document_files').upsert(payload)
    if (error) return { ok: false, source: 'supabase', error: error.message }
    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function uploadDocumentFile(params: {
  documentType: DocumentFile['document_type']
  documentId: string
  file: File
}): Promise<StorageResult & { file?: DocumentFile }> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }

    const filePath = `${ownerId}/${params.documentType}/${params.documentId}/${Date.now()}-${sanitizeFileName(params.file.name)}`
    const { error: uploadError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(filePath, params.file, {
        upsert: false,
        contentType: params.file.type || undefined,
      })

    if (uploadError) {
      return { ok: false, source: 'supabase', error: uploadError.message }
    }

    const record: DocumentFile = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      document_type: params.documentType,
      document_id: params.documentId,
      file_name: params.file.name,
      file_path: filePath,
      file_size: params.file.size,
      mime_type: params.file.type || null,
      created_at: new Date().toISOString(),
    }

    const saveResult = await saveDocumentFileRecord(record)
    if (!saveResult.ok) return { ...saveResult }
    return { ok: true, source: 'supabase', file: record }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}

export async function getDocumentFiles(
  documentType: DocumentFile['document_type'],
  documentId: string
): Promise<DocumentFile[]> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return []
    const { data, error } = await supabase
      .from('document_files')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('document_type', documentType)
      .eq('document_id', documentId)
      .order('created_at', { ascending: false })
    if (error) return []
    return (data || []) as DocumentFile[]
  } catch {
    return []
  }
}

export async function getDocumentFileUrl(filePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, 60 * 60)
    if (error) return null
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

export async function deleteDocumentFile(file: DocumentFile): Promise<StorageResult> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return { ok: false, source: null, error: 'No user ID' }

    const { error: storageError } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .remove([file.file_path])
    if (storageError) return { ok: false, source: 'supabase', error: storageError.message }

    const { error } = await supabase
      .from('document_files')
      .delete()
      .eq('id', file.id)
      .eq('owner_id', ownerId)
    if (error) return { ok: false, source: 'supabase', error: error.message }

    return { ok: true, source: 'supabase' }
  } catch (e) {
    return { ok: false, source: null, error: String(e) }
  }
}
