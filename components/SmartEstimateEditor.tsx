'use client'

import { X } from 'lucide-react'
import type { Estimate, Property } from '@/lib/types'
import { DocumentUploader } from '@/components/DocumentUploader'

interface SmartEstimateEditorProps {
  estimate: Estimate
  property?: Property | null
  onChange: (estimate: Estimate) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}

export function SmartEstimateEditor({ estimate, property, onChange, onSave, onDelete, onClose }: SmartEstimateEditorProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 py-10">
      <div className="glass w-full max-w-5xl rounded-2xl border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-white">Smart Estimate</p>
            <p className="mt-1 text-xs text-gray-500">{estimate.estimate_number} · {property?.address || 'Unassigned'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition-all hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Estimate Number</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={estimate.estimate_number}
                  onChange={(event) => onChange({ ...estimate, estimate_number: event.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Status</span>
                <select
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={estimate.status}
                  onChange={(event) => onChange({ ...estimate, status: event.target.value as Estimate['status'] })}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Title</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={estimate.title}
                  onChange={(event) => onChange({ ...estimate, title: event.target.value })}
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Scope of Work</span>
              <textarea
                className="h-64 w-full rounded-xl border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={estimate.scope}
                onChange={(event) => onChange({ ...estimate, scope: event.target.value })}
              />
            </label>

            <DocumentUploader documentType="estimate" documentId={estimate.id} />
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-dark-800/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-white">Pricing</p>
              <div className="mt-4 space-y-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-400">Subtotal</span>
                  <input
                    type="number"
                    step="0.01"
                    className="w-32 rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-right text-white outline-none"
                    value={estimate.subtotal}
                    onChange={(event) => {
                      const subtotal = Number(event.target.value || 0)
                      const taxAmount = subtotal * estimate.tax_rate
                      onChange({ ...estimate, subtotal, tax_amount: taxAmount, total: subtotal + taxAmount })
                    }}
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-400">Tax Rate (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    className="w-32 rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-right text-white outline-none"
                    value={estimate.tax_rate * 100}
                    onChange={(event) => {
                      const taxRate = Number(event.target.value || 0) / 100
                      const taxAmount = estimate.subtotal * taxRate
                      onChange({ ...estimate, tax_rate: taxRate, tax_amount: taxAmount, total: estimate.subtotal + taxAmount })
                    }}
                  />
                </label>
                <div className="flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Total</span>
                  <span className="text-lg font-bold text-cyan">${estimate.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Notes</span>
              <textarea
                className="h-48 w-full rounded-xl border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={estimate.notes}
                onChange={(event) => onChange({ ...estimate, notes: event.target.value })}
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              {onDelete ? (
                <button type="button" onClick={onDelete} className="rounded-lg border border-red/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red transition-all hover:bg-red/10">
                  Delete
                </button>
              ) : <span />}
              <button type="button" onClick={onSave} className="rounded-lg bg-cyan px-4 py-2 text-xs font-bold uppercase tracking-wide text-dark transition-all hover:opacity-90">
                Save Estimate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
