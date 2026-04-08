interface PropertyMapEmbedProps {
  address: string
  lat?: number
  lng?: number
  className?: string
  mode?: 'place' | 'streetview' | 'satellite'
}

export default function PropertyMapEmbed({ address, lat, lng, className = '', mode = 'place' }: PropertyMapEmbedProps) {
  const apiKey = process.env.NEXT_PUBLIC_MAPS_API_KEY
  if (!apiKey) return null

  const encoded = encodeURIComponent(address)

  let src = ''
  if (mode === 'streetview' && lat && lng) {
    src = `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${lat},${lng}&heading=0&pitch=0&fov=90`
  } else if (mode === 'satellite' && lat && lng) {
    src = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}&maptype=satellite&zoom=18`
  } else {
    src = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encoded}&zoom=17`
  }

  return (
    <div className={`relative rounded-lg overflow-hidden ${className}`}>
      <iframe
        src={src}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title={`Map of ${address}`}
      />
    </div>
  )
}
