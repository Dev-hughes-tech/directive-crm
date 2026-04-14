// Next.js renders this for any unmatched route (or explicit notFound() calls).
// Keeps the brand feel so users know they're still in-app.

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <p className="text-6xl font-bold text-cyan mb-2">404</p>
        <h1 className="text-xl font-semibold text-white mb-2">Page not found</h1>
        <p className="text-sm text-gray-400 mb-6">
          That address isn&apos;t part of Directive CRM. It may have moved or never existed.
        </p>
        <Link
          href="/"
          className="inline-block bg-cyan/20 hover:bg-cyan/30 text-cyan border border-cyan/40 rounded-lg px-4 py-2 text-sm transition"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
