'use client'

import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '@/lib/authFetch'
import type { Client, Property } from '@/lib/types'
import {
  Mail,
  X,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  Lock,
} from 'lucide-react'

interface EmailAccount {
  id: string
  label: string
  email_address: string
  imap_host: string
  imap_port: number
  imap_ssl: boolean
  smtp_host: string
  smtp_port: number
  smtp_ssl: boolean
  username: string
  created_at: string
}

interface EmailMessage {
  id: string
  account_id: string
  from_email: string
  from_name: string | null
  subject: string
  preview: string | null
  body_text: string | null
  body_html: string | null
  received_at: string
  is_read: boolean
  client_id: string | null
}

interface EmailClientProps {
  clients: Client[]
  properties: Property[]
  onNavigateToSweep?: (address: string) => void
}

const PROVIDER_CONFIGS: Record<string, { imap: string; smtp: string; imap_port: number; smtp_port: number }> = {
  gmail: {
    imap: 'imap.gmail.com',
    smtp: 'smtp.gmail.com',
    imap_port: 993,
    smtp_port: 587,
  },
  outlook: {
    imap: 'outlook.office365.com',
    smtp: 'smtp.office365.com',
    imap_port: 993,
    smtp_port: 587,
  },
  yahoo: {
    imap: 'imap.mail.yahoo.com',
    smtp: 'smtp.mail.yahoo.com',
    imap_port: 993,
    smtp_port: 587,
  },
}

export default function EmailClient({ clients, properties, onNavigateToSweep }: EmailClientProps) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [loading, setLoading] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const [testSuccess, setTestSuccess] = useState<string | null>(null)

  // Form state for adding account
  const [form, setForm] = useState({
    label: '',
    email_address: '',
    provider: 'gmail',
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_ssl: true,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_ssl: false,
    username: '',
    password: '',
  })

  // Compose state
  const [compose, setCompose] = useState({
    to: '',
    subject: selectedMessage ? `Re: ${selectedMessage.subject}` : '',
    body: '',
  })

  // Load accounts on mount
  useEffect(() => {
    loadAccounts()
  }, [])

  // Load messages when account changes
  useEffect(() => {
    if (selectedAccount) {
      loadMessages()
    }
  }, [selectedAccount])

  const loadAccounts = useCallback(async () => {
    try {
      const res = await authFetch('/api/email/accounts')
      const data = await res.json()
      setAccounts(data.accounts || [])
      if (data.accounts && data.accounts.length > 0 && !selectedAccount) {
        setSelectedAccount(data.accounts[0].id)
      }
    } catch (error) {
      console.error('Failed to load accounts:', error)
    }
  }, [selectedAccount])

  const loadMessages = useCallback(async () => {
    if (!selectedAccount) return
    setLoading(true)
    try {
      const res = await authFetch('/api/email/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selectedAccount, limit: 50 }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessages(data.messages || [])
        setSelectedMessage(null)
      } else {
        console.error('Failed to fetch messages:', data.error)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedAccount])

  const handleProviderChange = (provider: string) => {
    const config = PROVIDER_CONFIGS[provider]
    if (config) {
      setForm({
        ...form,
        provider,
        imap_host: config.imap,
        imap_port: config.imap_port,
        smtp_host: config.smtp,
        smtp_port: config.smtp_port,
      })
    }
  }

  const testConnection = async () => {
    setTestError(null)
    setTestSuccess(null)
    setLoading(true)

    try {
      const res = await authFetch('/api/email/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          imap_ssl: form.imap_ssl,
          username: form.username,
          password: form.password,
        }),
      })

      const data = await res.json()
      if (data.ok) {
        setTestSuccess(`Connected successfully. Found ${data.mailboxes?.length || 0} mailboxes.`)
      } else {
        setTestError(data.error || 'Connection failed')
      }
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'Connection test failed')
    } finally {
      setLoading(false)
    }
  }

  const saveAccount = async () => {
    if (!form.email_address || !form.username || !form.password) {
      setTestError('Email, username, and password are required')
      return
    }

    setLoading(true)
    try {
      const res = await authFetch('/api/email/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: form.label || form.email_address,
          email_address: form.email_address,
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          imap_ssl: form.imap_ssl,
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          smtp_ssl: form.smtp_ssl,
          username: form.username,
          password: form.password,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setTestSuccess('Account saved successfully!')
        setForm({
          label: '',
          email_address: '',
          provider: 'gmail',
          imap_host: 'imap.gmail.com',
          imap_port: 993,
          imap_ssl: true,
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          smtp_ssl: false,
          username: '',
          password: '',
        })
        setShowAddAccount(false)
        await loadAccounts()
      } else {
        setTestError(data.error || 'Failed to save account')
      }
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'Failed to save account')
    } finally {
      setLoading(false)
    }
  }

  const deleteAccount = async (accountId: string) => {
    if (!confirm('Are you sure? This cannot be undone.')) return

    setLoading(true)
    try {
      const res = await authFetch(`/api/email/accounts?id=${accountId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        await loadAccounts()
        if (selectedAccount === accountId) {
          setSelectedAccount(null)
          setMessages([])
        }
      }
    } catch (error) {
      console.error('Failed to delete account:', error)
    } finally {
      setLoading(false)
    }
  }

  const sendEmail = async () => {
    if (!compose.to || !compose.subject || !compose.body || !selectedAccount) {
      setTestError('To, subject, and body are required')
      return
    }

    setLoading(true)
    try {
      const res = await authFetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selectedAccount,
          to: compose.to,
          subject: compose.subject,
          body: compose.body,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setTestSuccess('Email sent successfully!')
        setShowCompose(false)
        setCompose({ to: '', subject: '', body: '' })
      } else {
        setTestError(data.error || 'Failed to send email')
      }
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'Failed to send email')
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (messageId: string) => {
    try {
      await authFetch('/api/email/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      })
      setMessages(messages.map((m) => (m.id === messageId ? { ...m, is_read: true } : m)))
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }

  const isClientMatch = (message: EmailMessage): boolean => {
    return properties.some((p) => p.owner_email?.toLowerCase() === message.from_email.toLowerCase())
  }

  return (
    <div className="flex h-full gap-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-lg overflow-hidden">
      {/* Left Panel: Account & Message List */}
      <div className="w-80 border-r border-slate-700 flex flex-col bg-slate-900/50">
        {/* Account Selector */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex gap-2 mb-3">
            <select
              value={selectedAccount || ''}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="flex-1 px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm"
            >
              <option value="">Select account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label} ({acc.email_address})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAddAccount(true)}
              className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm transition flex items-center gap-1"
            >
              <Plus size={16} /> Add
            </button>
          </div>
          <button
            onClick={loadMessages}
            disabled={!selectedAccount || loading}
            className="w-full px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-slate-400 text-sm">Loading messages...</div>}
          {!loading && messages.length === 0 && selectedAccount && (
            <div className="p-4 text-slate-400 text-sm">No messages</div>
          )}
          {!selectedAccount && (
            <div className="p-4 text-slate-400 text-sm">Select an account to view messages</div>
          )}
          {messages.map((msg) => {
            const isMatch = isClientMatch(msg)
            return (
              <button
                key={msg.id}
                onClick={() => {
                  setSelectedMessage(msg)
                  if (!msg.is_read) {
                    markAsRead(msg.id)
                  }
                }}
                className={`w-full px-4 py-3 border-b border-slate-700 text-left transition hover:bg-slate-800 ${
                  selectedMessage?.id === msg.id
                    ? 'bg-slate-700'
                    : 'hover:bg-slate-800'
                } ${isMatch ? 'border-l-4 border-l-green-500' : ''}`}
              >
                <div className="flex items-start gap-2 mb-1">
                  {!msg.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
                  {isMatch && <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${!msg.is_read ? 'text-white' : 'text-slate-300'}`}>
                      {msg.from_name || msg.from_email}
                    </div>
                  </div>
                </div>
                <div className={`text-xs truncate ${!msg.is_read ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>
                  {msg.subject}
                </div>
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{msg.preview}</div>
                <div className="text-xs text-slate-600 mt-1">
                  {new Date(msg.received_at).toLocaleDateString()}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right Panel: Message View or Add Account Form */}
      <div className="flex-1 flex flex-col bg-slate-900/30">
        {showAddAccount ? (
          // Add Account Form
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Mail size={20} /> Add Email Account
              </h2>
              <button
                onClick={() => {
                  setShowAddAccount(false)
                  setTestError(null)
                  setTestSuccess(null)
                }}
                className="p-2 hover:bg-slate-800 rounded transition"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            {testError && (
              <div className="mb-4 p-3 rounded bg-red-900/20 border border-red-700 flex gap-2 text-sm text-red-200">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                {testError}
              </div>
            )}
            {testSuccess && (
              <div className="mb-4 p-3 rounded bg-green-900/20 border border-green-700 flex gap-2 text-sm text-green-200">
                <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                {testSuccess}
              </div>
            )}

            <div className="space-y-4">
              {/* Provider Preset */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email Provider (Quick Setup)</label>
                <select
                  value={form.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm"
                >
                  <option value="gmail">Gmail</option>
                  <option value="outlook">Outlook / Office 365</option>
                  <option value="yahoo">Yahoo Mail</option>
                  <option value="custom">Custom / Other</option>
                </select>
              </div>

              {/* Account Label */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Account Label (optional)</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="My Gmail, Work Email, etc."
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm placeholder-slate-500"
                />
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={form.email_address}
                  onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-1">
                  <Lock size={14} /> Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">For Gmail, use an App Password (not your regular password)</p>
              </div>

              {/* IMAP Settings */}
              <div className="border-t border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">IMAP Settings</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Host</label>
                    <input
                      type="text"
                      value={form.imap_host}
                      onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Port</label>
                      <input
                        type="number"
                        value={form.imap_port}
                        onChange={(e) => setForm({ ...form, imap_port: parseInt(e.target.value) })}
                        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.imap_ssl}
                          onChange={(e) => setForm({ ...form, imap_ssl: e.target.checked })}
                          className="w-4 h-4"
                        />
                        SSL/TLS
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* SMTP Settings */}
              <div className="border-t border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">SMTP Settings</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Host</label>
                    <input
                      type="text"
                      value={form.smtp_host}
                      onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Port</label>
                      <input
                        type="number"
                        value={form.smtp_port}
                        onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) })}
                        className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={form.smtp_ssl}
                          onChange={(e) => setForm({ ...form, smtp_ssl: e.target.checked })}
                          className="w-4 h-4"
                        />
                        SSL/TLS
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-4">
                <button
                  onClick={testConnection}
                  disabled={loading}
                  className="flex-1 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm transition disabled:opacity-50"
                >
                  Test Connection
                </button>
                <button
                  onClick={saveAccount}
                  disabled={loading}
                  className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm transition disabled:opacity-50"
                >
                  Save Account
                </button>
              </div>
            </div>
          </div>
        ) : selectedMessage ? (
          // Message View
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b border-slate-700 p-6">
              <button
                onClick={() => setSelectedMessage(null)}
                className="mb-4 flex items-center gap-2 text-slate-400 hover:text-slate-300 transition text-sm"
              >
                <ChevronLeft size={16} /> Back to list
              </button>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-white">{selectedMessage.subject}</h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-300">
                      From: <span className="font-medium">{selectedMessage.from_name || selectedMessage.from_email}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(selectedMessage.received_at).toLocaleString()}
                    </p>
                  </div>
                  {isClientMatch(selectedMessage) && (
                    <div className="px-3 py-1 rounded bg-green-900/30 border border-green-700 text-green-200 text-xs font-medium">
                      CRM Client Match
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedMessage.body_html ? (
                <div
                  className="prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedMessage.body_html }}
                />
              ) : (
                <p className="text-slate-300 whitespace-pre-wrap">{selectedMessage.body_text}</p>
              )}
            </div>

            {/* Footer with Compose */}
            {!showCompose && (
              <div className="border-t border-slate-700 p-4">
                <button
                  onClick={() => {
                    setShowCompose(true)
                    setCompose({
                      to: selectedMessage.from_email,
                      subject: `Re: ${selectedMessage.subject}`,
                      body: '',
                    })
                  }}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm transition flex items-center gap-2"
                >
                  <Send size={16} /> Reply
                </button>
              </div>
            )}

            {showCompose && (
              <div className="border-t border-slate-700 p-4 space-y-3">
                <input
                  type="email"
                  value={compose.to}
                  onChange={(e) => setCompose({ ...compose, to: e.target.value })}
                  placeholder="To:"
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm placeholder-slate-500"
                />
                <input
                  type="text"
                  value={compose.subject}
                  onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                  placeholder="Subject:"
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm placeholder-slate-500"
                />
                <textarea
                  value={compose.body}
                  onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                  placeholder="Message..."
                  className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-600 text-white text-sm placeholder-slate-500 resize-none h-32"
                />
                <div className="flex gap-2">
                  <button
                    onClick={sendEmail}
                    disabled={loading}
                    className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm transition disabled:opacity-50"
                  >
                    Send
                  </button>
                  <button
                    onClick={() => {
                      setShowCompose(false)
                      setCompose({ to: '', subject: '', body: '' })
                      setTestError(null)
                    }}
                    className="flex-1 px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
                {testError && (
                  <div className="p-3 rounded bg-red-900/20 border border-red-700 flex gap-2 text-sm text-red-200">
                    <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                    {testError}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Empty state
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Mail size={48} className="mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400 text-lg">Select a message to read</p>
              <p className="text-slate-500 text-sm mt-2">Or add an account to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
