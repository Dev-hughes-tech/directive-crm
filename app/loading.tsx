// Route-level Suspense fallback. Shown while the root route segment is
// preparing (fonts, data, dynamic imports).

import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-cyan animate-spin" />
        <p className="text-xs text-gray-400">Loading Directive CRM…</p>
      </div>
    </div>
  )
}
