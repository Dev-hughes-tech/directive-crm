'use client'
import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/authFetch'

interface DamagePhotoUploadProps {
  propertyId: string
  lat: number
  lng: number
  address: string
  onPhotoSaved?: (photoUrl: string) => void
}

export default function DamagePhotoUpload({ propertyId, onPhotoSaved }: DamagePhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true

    const loadExistingPhotos = async () => {
      try {
        const res = await authFetch(`/api/properties/photos?property_id=${encodeURIComponent(propertyId)}`)
        if (!res.ok) return
        const data = await res.json()
        if (active) {
          setUploaded(Array.isArray(data.photos) && data.photos.length > 0)
        }
      } catch {
        if (active) setUploaded(false)
      }
    }

    setUploaded(false)
    loadExistingPhotos()

    return () => {
      active = false
    }
  }, [propertyId])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('property_id', propertyId)

      const res = await authFetch('/api/properties/photos', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.photo?.url) {
        throw new Error(data.error || 'Upload failed')
      }

      onPhotoSaved?.(data.photo.url)
      setUploaded(true)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed')
    } finally {
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
