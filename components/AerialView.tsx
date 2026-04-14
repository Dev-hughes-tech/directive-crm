'use client'
import { useState, useEffect } from 'react'
import { authFetch } from '@/lib/authFetch'
import { X, Maximize2 } from 'lucide-react'

interface AerialViewProps {
  address: string
  className?: string
}

export default function AerialView({ address, className = '' }: AerialViewProps) {
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

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
    <>
      {/* Thumbnail — click to expand */}
      <div
        className={`relative rounded-lg overflow-hidden bg-black cursor-pointer group ${className}`}
        onClick={() => setFullscreen(true)}
      >
        <video
          src={videoUri}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white/70 text-xs px-2 py-1 rounded">
          Aerial View
        </div>
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded p-1">
          <Maximize2 className="w-3.5 h-3.5 text-white" />
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullscreen(false)}
        >
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-4xl w-full rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <video
              src={videoUri}
              autoPlay
              loop
              muted
              playsInline
              controls
              className="w-full"
            />
            <div className="bg-dark-800 px-4 py-2 text-xs text-gray-400">{address}</div>
          </div>
        </div>
      )}
    </>
  )
}
