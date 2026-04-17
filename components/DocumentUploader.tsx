'use client'

import { useEffect, useState } from 'react'
import { FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import type { DocumentFile } from '@/lib/types'
import {
  deleteDocumentFile,
  getDocumentFiles,
  getDocumentFileUrl,
  uploadDocumentFile,
} from '@/lib/storage'

interface DocumentUploaderProps {
  documentType: DocumentFile['document_type']
  documentId: string
}

export function DocumentUploader({ documentType, documentId }: DocumentUploaderProps) {
  const [files, setFiles] = useState<DocumentFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const next = await getDocumentFiles(documentType, documentId)
      if (!cancelled) {
        setFiles(next)
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [documentId, documentType])

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    const result = await uploadDocumentFile({ documentType, documentId, file })
    if (result.ok) {
      const next = await getDocumentFiles(documentType, documentId)
      setFiles(next)
    }
    setUploading(false)
    event.target.value = ''
  }

  const handleOpen = async (file: DocumentFile) => {
    const url = await getDocumentFileUrl(file.file_path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDelete = async (file: DocumentFile) => {
    const result = await deleteDocumentFile(file)
    if (!result.ok) return
    setFiles((prev) => prev.filter((entry) => entry.id !== file.id))
  }

  return (
    <div className="rounded-xl border border-white/10 bg-dark-800/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white">Attachments</p>
          <p className="mt-1 text-[11px] text-gray-500">Upload supporting files for this record.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-dark-700/70 px-3 py-2 text-xs text-gray-300 transition-all hover:bg-dark-700 hover:text-white">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-cyan" />}
          {uploading ? 'Uploading…' : 'Upload File'}
          <input className="hidden" type="file" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-dark-900/40 px-3 py-3 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading attachments…
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-dark-900/40 px-3 py-3 text-xs text-gray-500">
            <Paperclip className="h-3.5 w-3.5" />
            No attachments yet.
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-dark-900/40 px-3 py-3"
            >
              <button
                type="button"
                onClick={() => void handleOpen(file)}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-cyan" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-white">{file.file_name}</p>
                  <p className="text-[10px] text-gray-500">{Math.max(1, Math.round(file.file_size / 1024))} KB</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(file)}
                className="rounded-md p-2 text-gray-500 transition-all hover:bg-red/10 hover:text-red"
                aria-label={`Delete ${file.file_name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
