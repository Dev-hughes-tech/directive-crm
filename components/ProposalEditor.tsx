'use client'

import { Plus, Trash2, X } from 'lucide-react'
import type { Proposal, ProposalLineItem, Property } from '@/lib/types'
import { DocumentUploader } from '@/components/DocumentUploader'

interface ProposalEditorProps {
  proposal: Proposal
  property?: Property | null
  onChange: (proposal: Proposal) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}

export function ProposalEditor({ proposal, property, onChange, onSave, onDelete, onClose }: ProposalEditorProps) {
  const recalc = (lineItems: ProposalLineItem[]) => {
    const total = lineItems.reduce((sum, item) => sum + item.total, 0)
    onChange({ ...proposal, line_items: lineItems, total })
  }

  const updateLineItem = (index: number, patch: Partial<ProposalLineItem>) => {
    const next = proposal.line_items.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const updated = { ...item, ...patch }
      return {
        ...updated,
        total: Number(updated.quantity || 0) * Number(updated.unit_price || 0),
      }
    })
    recalc(next)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 py-10">
      <div className="glass w-full max-w-5xl rounded-2xl border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-white">Proposal Editor</p>
            <p className="mt-1 text-xs text-gray-500">{property?.address || 'Proposal Draft'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition-all hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Status</span>
                <select
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={proposal.status}
                  onChange={(event) => onChange({ ...proposal, status: event.target.value as Proposal['status'] })}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Sent At</span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={proposal.sent_at?.slice(0, 10) ?? ''}
                  onChange={(event) => onChange({ ...proposal, sent_at: event.target.value ? new Date(event.target.value).toISOString() : null })}
                />
              </label>
            </div>

            <div className="rounded-xl border border-white/10 bg-dark-800/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-white">Scope</p>
                <button
                  type="button"
                  onClick={() => recalc([...proposal.line_items, { id: crypto.randomUUID(), description: '', quantity: 1, unit: 'ea', unit_price: 0, total: 0 }])}
                  className="inline-flex items-center gap-2 rounded-lg bg-dark-700/70 px-3 py-2 text-xs text-gray-300 transition-all hover:bg-dark-700 hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5 text-cyan" />
                  Add Line
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {proposal.line_items.map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-lg border border-white/5 bg-dark-900/40 p-3 md:grid-cols-[1fr_80px_90px_110px_70px]">
                    <input
                      className="rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                      placeholder="Description"
                      value={item.description}
                      onChange={(event) => updateLineItem(index, { description: event.target.value })}
                    />
                    <input
                      type="number"
                      className="rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                      value={item.quantity}
                      onChange={(event) => updateLineItem(index, { quantity: Number(event.target.value || 0) })}
                    />
                    <input
                      className="rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                      value={item.unit}
                      onChange={(event) => updateLineItem(index, { unit: event.target.value })}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                      value={item.unit_price}
                      onChange={(event) => updateLineItem(index, { unit_price: Number(event.target.value || 0) })}
                    />
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2">
                      <span className="text-sm font-semibold text-white">${item.total.toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => recalc(proposal.line_items.filter((_, itemIndex) => itemIndex !== index))}
                        className="text-gray-500 transition-all hover:text-red"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DocumentUploader documentType="proposal" documentId={proposal.id} />
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-dark-800/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-white">Total</p>
              <p className="mt-3 text-3xl font-bold text-cyan">${proposal.total.toFixed(2)}</p>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Notes</span>
              <textarea
                className="h-72 w-full rounded-xl border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={proposal.notes}
                onChange={(event) => onChange({ ...proposal, notes: event.target.value })}
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              {onDelete ? (
                <button type="button" onClick={onDelete} className="rounded-lg border border-red/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red transition-all hover:bg-red/10">
                  Delete
                </button>
              ) : <span />}
              <button type="button" onClick={onSave} className="rounded-lg bg-cyan px-4 py-2 text-xs font-bold uppercase tracking-wide text-dark transition-all hover:opacity-90">
                Save Proposal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
