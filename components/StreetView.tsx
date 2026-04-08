'use client'

interface StreetViewProps {
  lat: number
  lng: number
  address: string
  className?: string
}

export default function StreetView({ lat, lng, address, className = '' }: StreetViewProps) {
  const apiKey = process.env.NEXT_PUBLIC_MAPS_API_KEY

  if (!apiKey || !lat || !lng) {
    return (
      <div className={`flex items-center justify-center bg-[#0d1117] border border-white/10 rounded-lg text-white/30 text-sm ${className}`}>
        No street view available
      </div>
    )
  }

  // Street View Static API — shows actual street-level photo of the property
  const streetViewUrl = `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${lat},${lng}&fov=90&pitch=5&source=outdoor&key=${apiKey}`

  // Fallback: satellite thumbnail via Maps Static API
  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=19&size=640x360&maptype=satellite&markers=color:red%7C${lat},${lng}&key=${apiKey}`

  return (
    <div className={`relative rounded-lg overflow-hidden bg-[#0d1117] ${className}`}>
      <img
        src={streetViewUrl}
        alt={`Street view of ${address}`}
        className="w-full h-full object-cover"
        onError={(e) => {
          // Fallback to satellite if street view not available
          const target = e.currentTarget
          if (!target.src.includes('staticmap')) {
            target.src = satelliteUrl
          }
        }}
      />
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white/70 text-xs px-2 py-1 rounded">
        Google Street View
      </div>
      <a
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-cyan-400 text-xs px-2 py-1 rounded hover:text-cyan-300 transition-colors"
      >
        Open in Maps ↗
      </a>
    </div>
  )
}
