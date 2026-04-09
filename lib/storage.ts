import { supabase } from './supabase'
import type { Property, Client, Proposal, ProposalLineItem, Material, ChatMessage, Job } from './types'

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
    await supabase.from('properties').upsert(property)
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
    await supabase.from('clients').upsert(client)
  } catch {
    // Fail silently
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
    await supabase.from('proposals').upsert(proposalData)
    if (line_items?.length) {
      await supabase.from('proposal_line_items').delete().eq('proposal_id', proposal.id)
      await supabase.from('proposal_line_items').insert(
        line_items.map((item: ProposalLineItem) => ({ ...item, proposal_id: proposal.id }))
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
    await supabase.from('materials').upsert(material)
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
    await supabase.from('chat_messages').insert(message)
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
    await supabase.from('jobs').upsert(job)
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
