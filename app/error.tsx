'use client'

// Screen-level error boundary. Catches render/effect errors inside any route
// segment without taking down the whole app. A user can click "Try again" or
// navigate home instead of seeing a white screen.

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the error to the console so it shows up in Vercel logs.
    console.error('[app error boundary]', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-dark-700/50 border border-red-500/30 rounded-xl p-6 backdrop-blur-md">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
        </div>
        <p className="text-sm text-gray-300 mb-4">
          An unexpected error occurred while rendering this screen. We logged it for review.
        </p>
        {error.digest && (
          <p className="text-xs text-gray-500 font-mono mb-4">Ref: {error.digest}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 flex items-center justify-center gap-2 bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/40 rounded-lg py-2 text-sm transition"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
          <a
            href="/"
            className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg py-2 text-sm transition"
          >
            <Home className="w-4 h-4" /> Go home
          </a>
        </div>
      </div>
    </div>
  )
}
