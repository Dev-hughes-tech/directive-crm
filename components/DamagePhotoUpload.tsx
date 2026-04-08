'use client'
import { useState, useRef } from 'react'

interface DamagePhotoUploadProps {
  propertyId: string
  lat: number
  lng: number
  address: string
  onPhotoSaved?: (photoUrl: string) => void
}

export default function DamagePhotoUpload({ propertyId, lat, lng, address, onPhotoSaved }: DamagePhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)

    try {
      // For now, store locally as base64 (Street View Publish requires OAuth for full publish)
      // Save photo reference to property record
      const reader = new FileReader()
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string
        // Save to localStorage keyed by propertyId
        const existing = JSON.parse(localStorage.getItem(`photos_${propertyId}`) || '[]')
        existing.push({ url: dataUrl, timestamp: new Date().toISOString(), address })
        localStorage.setItem(`photos_${propertyId}`, JSON.stringify(existing))
        onPhotoSaved?.(dataUrl)
        setUploaded(true)
        setUploading(false)
      }
      reader.readAsDataURL(file)
    } catch {
      setError('Upload failed')
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 text-xs px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : uploaded ? '✓ Photo saved' : '📷 Add Damage Photo'}
      </button>
      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  )
}
