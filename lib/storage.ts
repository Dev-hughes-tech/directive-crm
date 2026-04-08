import type { Client, Proposal, Material, ChatMessage } from './types'

// ===== CLIENTS =====
export function getClients(): Client[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('directive_clients') || '[]')
  } catch {
    return []
  }
}

export function saveClients(clients: Client[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('directive_clients', JSON.stringify(clients))
}

// ===== PROPOSALS =====
export function getProposals(): Proposal[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('directive_proposals') || '[]')
  } catch {
    return []
  }
}

export function saveProposals(proposals: Proposal[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('directive_proposals', JSON.stringify(proposals))
}

// ===== MATERIALS =====
export function getMaterials(): Material[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('directive_materials') || '[]')
  } catch {
    return []
  }
}

export function saveMaterials(materials: Material[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('directive_materials', JSON.stringify(materials))
}

// ===== CHAT MESSAGES =====
export function getChatMessages(channel?: string): ChatMessage[] {
  if (typeof window === 'undefined') return []
  const key = channel ? `directive_chat_${channel}` : 'directive_chat_general'
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

export function saveChatMessages(messages: ChatMessage[], channel?: string): void {
  if (typeof window === 'undefined') return
  const key = channel ? `directive_chat_${channel}` : 'directive_chat_general'
  localStorage.setItem(key, JSON.stringify(messages))
}
