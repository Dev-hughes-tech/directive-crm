'use client'

import { Plus, Trash2, X } from 'lucide-react'
import type { Invoice, InvoiceLineItem } from '@/lib/types'
import { DocumentUploader } from '@/components/DocumentUploader'

interface InvoiceEditorProps {
  invoice: Invoice
  onChange: (invoice: Invoice) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}

export function InvoiceEditor({ invoice, onChange, onSave, onDelete, onClose }: InvoiceEditorProps) {
  const updateLineItem = (index: number, patch: Partial<InvoiceLineItem>) => {
    const next = invoice.line_items.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const updated = { ...item, ...patch }
      return {
        ...updated,
        total: Number(updated.quantity || 0) * Number(updated.unit_price || 0),
      }
    })
    const subtotal = next.reduce((sum, item) => sum + item.total, 0)
    const taxAmount = subtotal * Number(invoice.tax_rate || 0)
    onChange({
      ...invoice,
      line_items: next,
      subtotal,
      tax_amount: taxAmount,
      total: subtotal + taxAmount,
    })
  }

  const addLineItem = () => {
    onChange({
      ...invoice,
      line_items: [
        ...invoice.line_items,
        { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, total: 0 },
      ],
    })
  }

  const removeLineItem = (index: number) => {
    const next = invoice.line_items.filter((_, itemIndex) => itemIndex !== index)
    const subtotal = next.reduce((sum, item) => sum + item.total, 0)
    const taxAmount = subtotal * Number(invoice.tax_rate || 0)
    onChange({
      ...invoice,
      line_items: next,
      subtotal,
      tax_amount: taxAmount,
      total: subtotal + taxAmount,
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 py-10">
      <div className="glass w-full max-w-5xl rounded-2xl border border-white/10">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-white">Invoice Editor</p>
            <p className="mt-1 text-xs text-gray-500">{invoice.invoice_number}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition-all hover:bg-white/5 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Invoice Number</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={invoice.invoice_number}
                  onChange={(event) => onChange({ ...invoice, invoice_number: event.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Status</span>
                <select
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={invoice.status}
                  onChange={(event) => onChange({ ...invoice, status: event.target.value as Invoice['status'] })}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="void">Void</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Bill To</span>
                <input
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={invoice.bill_to_name ?? ''}
                  onChange={(event) => onChange({ ...invoice, bill_to_name: event.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-wide text-gray-500">Issue Date</span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                  value={invoice.issue_date}
                  onChange={(event) => onChange({ ...invoice, issue_date: event.target.value })}
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Billing Address</span>
              <textarea
                className="h-24 w-full rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={invoice.bill_to_address ?? ''}
                onChange={(event) => onChange({ ...invoice, bill_to_address: event.target.value })}
              />
            </label>

            <div className="rounded-xl border border-white/10 bg-dark-800/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-white">Line Items</p>
                <button type="button" onClick={addLineItem} className="inline-flex items-center gap-2 rounded-lg bg-dark-700/70 px-3 py-2 text-xs text-gray-300 transition-all hover:bg-dark-700 hover:text-white">
                  <Plus className="h-3.5 w-3.5 text-cyan" />
                  Add Item
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {invoice.line_items.map((item, index) => (
                  <div key={item.id} className="grid gap-3 rounded-lg border border-white/5 bg-dark-900/40 p-3 md:grid-cols-[1fr_90px_110px_70px]">
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
                      type="number"
                      step="0.01"
                      className="rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                      value={item.unit_price}
                      onChange={(event) => updateLineItem(index, { unit_price: Number(event.target.value || 0) })}
                    />
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2">
                      <span className="text-sm font-semibold text-white">${item.total.toFixed(2)}</span>
                      <button type="button" onClick={() => removeLineItem(index)} className="text-gray-500 transition-all hover:text-red">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DocumentUploader documentType="invoice" documentId={invoice.id} />
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-dark-800/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-white">Totals</p>
              <div className="mt-4 space-y-3 text-sm">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-gray-400">Tax Rate</span>
                  <input
                    type="number"
                    step="0.01"
                    className="w-28 rounded-lg border border-white/10 bg-dark-900/60 px-3 py-2 text-right text-white outline-none"
                    value={Number(invoice.tax_rate || 0) * 100}
                    onChange={(event) => {
                      const taxRate = Number(event.target.value || 0) / 100
                      const taxAmount = invoice.subtotal * taxRate
                      onChange({ ...invoice, tax_rate: taxRate, tax_amount: taxAmount, total: invoice.subtotal + taxAmount })
                    }}
                  />
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="font-semibold text-white">${invoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Tax</span>
                  <span className="font-semibold text-white">${invoice.tax_amount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-white/10 pt-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Total</span>
                  <span className="text-lg font-bold text-cyan">${invoice.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Notes</span>
              <textarea
                className="h-48 w-full rounded-xl border border-white/10 bg-dark-900/60 px-3 py-2 text-sm text-white outline-none"
                value={invoice.notes}
                onChange={(event) => onChange({ ...invoice, notes: event.target.value })}
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              {onDelete ? (
                <button type="button" onClick={onDelete} className="rounded-lg border border-red/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red transition-all hover:bg-red/10">
                  Delete
                </button>
              ) : <span />}
              <button type="button" onClick={onSave} className="rounded-lg bg-cyan px-4 py-2 text-xs font-bold uppercase tracking-wide text-dark transition-all hover:opacity-90">
                Save Invoice
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
