import { supabase } from './supabase'
import type { Property, Client, Proposal, ProposalLineItem, Material, ChatMessage, Job } from './types'
import type { UserRole } from './tiers'

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

export async function upsertUserProfile(profile: Partial<UserProfile> & { id: string }): Promise<void> {
  try {
    await supabase.from('profiles').upsert(profile)
  } catch { /* silent */ }
}

// ── PROPERTIES ──────────────────────────────────────────────────────────────

export async function getProperties(): Promise<Property[]> {
  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as Property[]
  } catch {
    return []
  }
}

export async function saveProperty(property: Property): Promise<void> {
  try {
    const payload = await withOwner(property as unknown as Record<string, unknown>)
    await supabase.from('properties').upsert(payload)
  } catch {
    // Fail silently
  }
}

export async function deleteProperty(id: string): Promise<void> {
  try {
    await supabase.from('properties').delete().eq('id', id)
  } catch {
    // Fail silently
  }
}

// ── CLIENTS ─────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as Client[]
  } catch {
    return []
  }
}

export async function saveClient(client: Client): Promise<void> {
  try {
    const payload = await withOwner(client as unknown as Record<string, unknown>)
    await supabase.from('clients').upsert(payload)
  } catch {
    // Fail silently
  }
}

export async function deleteClient(id: string): Promise<void> {
  try {
    await supabase.from('clients').delete().eq('id', id)
  } catch {
    // Fail silently
  }
}

// ── ACTIVITY LOG ─────────────────────────────────────────────────────────────

export async function saveActivity(params: {
  entityType: 'property' | 'client' | 'proposal' | 'job' | 'claim' | 'settings'
  entityId: string
  action: 'create' | 'update' | 'delete' | 'status_change' | 'login' | 'ai_call' | string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const ownerId = await getOwnerId()
    if (!ownerId) return
    await supabase.from('activity_log').insert({
      owner_id: ownerId,
      actor_id: ownerId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      metadata: params.metadata ?? {},
    })
  } catch {
    // Fail silently — activity log is non-critical
  }
}

// ── PROPOSALS ────────────────────────────────────────────────────────────────

export async function getProposals(): Promise<Proposal[]> {
  try {
    const { data, error } = await supabase
      .from('proposals')
      .select('*, proposal_line_items(*)')
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

export async function saveProposal(proposal: Proposal): Promise<void> {
  try {
    const { line_items, ...proposalData } = proposal
    const payload = await withOwner(proposalData as unknown as Record<string, unknown>)
    await supabase.from('proposals').upsert(payload)
    if (line_items?.length) {
      await supabase.from('proposal_line_items').delete().eq('proposal_id', proposal.id)
      await supabase.from('proposal_line_items').insert(
        line_items.map((item: ProposalLineItem, idx: number) => ({
          ...item,
          proposal_id: proposal.id,
          sort_order: idx,
        }))
      )
    }
  } catch {
    // Fail silently
  }
}

// ── MATERIALS ────────────────────────────────────────────────────────────────

export async function getMaterials(): Promise<Material[]> {
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('name')
    if (error) throw error
    return (data || []) as Material[]
  } catch {
    return []
  }
}

export async function saveMaterial(material: Material): Promise<void> {
  try {
    const payload = await withOwner(material as unknown as Record<string, unknown>)
    await supabase.from('materials').upsert(payload)
  } catch {
    // Fail silently
  }
}

export async function deleteMaterial(id: string): Promise<void> {
  try {
    await supabase.from('materials').delete().eq('id', id)
  } catch {
    // Fail silently
  }
}

// ── CHAT MESSAGES ────────────────────────────────────────────────────────────

export async function getChatMessages(channel: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel', channel)
      .order('timestamp', { ascending: true })
    if (error) throw error
    return (data || []) as ChatMessage[]
  } catch {
    return []
  }
}

export async function saveChatMessage(message: ChatMessage): Promise<void> {
  try {
    const ownerId = await getOwnerId()
    const payload = ownerId
      ? { ...message, owner_id: ownerId, sender_id: ownerId }
      : message
    await supabase.from('chat_messages').insert(payload)
  } catch {
    // Fail silently
  }
}

export async function markMessagesRead(channel: string, role: string): Promise<void> {
  try {
    await supabase
      .from('chat_messages')
      .update({ read: true })
      .eq('channel', channel)
      .neq('sender_role', role)
  } catch {
    // Fail silently
  }
}

// ── JOBS ─────────────────────────────────────────────────────────────────────

export async function getJobs(): Promise<Job[]> {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map((j: Record<string, unknown>) => ({
      ...j,
      crew_members: (j.crew_members as string[]) || [],
      photos: (j.photos as Job['photos']) || [],
      insurance: (j.insurance as Job['insurance']) || null,
    })) as Job[]
  } catch {
    // Fallback to localStorage for offline support
    try {
      const stored = localStorage.getItem('directive_jobs')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }
}

export async function saveJob(job: Job): Promise<void> {
  // Always save to localStorage for offline resilience
  try {
    const existing = JSON.parse(localStorage.getItem('directive_jobs') || '[]') as Job[]
    const updated = existing.filter((j: Job) => j.id !== job.id)
    updated.unshift(job)
    localStorage.setItem('directive_jobs', JSON.stringify(updated))
  } catch { /* ignore */ }

  try {
    const payload = await withOwner(job as unknown as Record<string, unknown>)
    await supabase.from('jobs').upsert(payload)
  } catch { /* fail silently */ }
}

export async function deleteJob(id: string): Promise<void> {
  try {
    const existing = JSON.parse(localStorage.getItem('directive_jobs') || '[]') as Job[]
    localStorage.setItem('directive_jobs', JSON.stringify(existing.filter((j: Job) => j.id !== id)))
  } catch { /* ignore */ }
  try {
    await supabase.from('jobs').delete().eq('id', id)
  } catch { /* fail silently */ }
}
