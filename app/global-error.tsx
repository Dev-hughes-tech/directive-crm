'use client'

// Last-line-of-defense error boundary. Catches errors thrown in the root
// layout. Unlike `app/error.tsx`, this must render its own <html> and <body>.

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global error boundary]', error)
    fetch('/api/observability/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'app/global-error',
        route: typeof window !== 'undefined' ? window.location.pathname : null,
        message: error.message,
        digest: error.digest,
        metadata: { stack: error.stack },
      }),
      keepalive: true,
    }).catch(() => {})
  }, [error])

  return (
    <html lang="en">
      <body style={{ background: '#0d1117', color: '#e5e7eb', fontFamily: 'system-ui', padding: 24 }}>
        <div style={{ maxWidth: 480, margin: '10vh auto', padding: 24, background: '#1f2937', borderRadius: 12, border: '1px solid #dc2626' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Application crashed</h1>
          <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 16 }}>
            A fatal error occurred. Please reload the page. If the problem persists, contact support.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace', marginBottom: 16 }}>Ref: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{ background: '#06b6d4', color: '#0d1117', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
