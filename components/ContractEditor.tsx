'use client'

import { X } from 'lucide-react'
import type { Contract, Property } from '@/lib/types'
import { DocumentUploader } from '@/components/DocumentUploader'

interface ContractEditorProps {
  contract: Contract
  property?: Property | null
  onChange: (contract: Contract) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}

export function ContractEditor({ contract, property, onChange, onSave, onDelete, onClose }: ContractEditorProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 py-10">
      <div className="glass w-full max-w-5xl rounded-2xl border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-white">Contract Editor</p>
            <p className="mt-1 text-xs text-gray-500">{contract.contract_number} · {property?.address || contract.property_address || 'Unassigned'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition-all hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Contract Number</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={contract.contract_number}
                  onChange={(event) => onChange({ ...contract, contract_number: event.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Status</span>
                <select
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={contract.status}
                  onChange={(event) => onChange({ ...contract, status: event.target.value as Contract['status'] })}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="signed">Signed</option>
                  <option value="voided">Voided</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Homeowner Name</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={contract.homeowner_name ?? ''}
                  onChange={(event) => onChange({ ...contract, homeowner_name: event.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Contract Amount</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={contract.contract_amount}
                  onChange={(event) => onChange({ ...contract, contract_amount: Number(event.target.value || 0) })}
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Property Address</span>
              <textarea
                className="h-24 w-full rounded-xl border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={contract.property_address ?? ''}
                onChange={(event) => onChange({ ...contract, property_address: event.target.value })}
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Terms</span>
              <textarea
                className="h-56 w-full rounded-xl border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={contract.terms}
                onChange={(event) => onChange({ ...contract, terms: event.target.value })}
              />
            </label>

            <DocumentUploader documentType="contract" documentId={contract.id} />
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-dark-800/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-white">Execution</p>
              <div className="mt-4 space-y-3">
                <label className="space-y-2">
                  <span className="text-xs uppercase tracking-wide text-gray-500">Signed At</span>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                    value={contract.signed_at ? contract.signed_at.slice(0, 16) : ''}
                    onChange={(event) => onChange({ ...contract, signed_at: event.target.value ? new Date(event.target.value).toISOString() : null })}
                  />
                </label>
                <div className="rounded-lg border border-white/5 bg-dark-900/40 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Amount</p>
                  <p className="mt-2 text-3xl font-bold text-cyan">${contract.contract_amount.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Notes</span>
              <textarea
                className="h-48 w-full rounded-xl border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={contract.notes}
                onChange={(event) => onChange({ ...contract, notes: event.target.value })}
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              {onDelete ? (
                <button type="button" onClick={onDelete} className="rounded-lg border border-red/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red transition-all hover:bg-red/10">
                  Delete
                </button>
              ) : <span />}
              <button type="button" onClick={onSave} className="rounded-lg bg-cyan px-4 py-2 text-xs font-bold uppercase tracking-wide text-dark transition-all hover:opacity-90">
                Save Contract
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
