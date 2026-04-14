'use client'
import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/authFetch'

interface AerialViewProps {
  address: string
  className?: string
}

export default function AerialView({ address, className = '' }: AerialViewProps) {
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    setUnavailable(false)

    authFetch(`/api/aerial-view?address=${encodeURIComponent(address)}`)
      .then(r => r.json())
      .then(data => {
        if (data.videoUri) {
          setVideoUri(data.videoUri)
        } else {
          setUnavailable(true)
        }
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false))
  }, [address])

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-[#0d1117] border border-white/10 rounded-lg ${className}`}>
        <div className="text-cyan-400 text-xs animate-pulse">Loading aerial view...</div>
      </div>
    )
  }

  if (unavailable || !videoUri) {
    return (
      <div className={`flex items-center justify-center bg-[#0d1117] border border-white/10 rounded-lg ${className}`}>
        <div className="text-white/30 text-xs">No aerial footage available</div>
      </div>
    )
  }

  return (
    <div className={`relative rounded-lg overflow-hidden bg-black ${className}`}>
      <video
        src={videoUri}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white/70 text-xs px-2 py-1 rounded">
        Aerial View
      </div>
    </div>
  )
}
