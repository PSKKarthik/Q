'use client'
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#e0e0e0', fontFamily: 'sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: 480, padding: 32 }}>
            <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>ERROR</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 24, letterSpacing: '0.1em' }}>A critical error occurred</div>
            <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 32, padding: '12px 16px', border: '1px solid #333', wordBreak: 'break-word' }}>
              {error.message || 'An unexpected error occurred'}
            </div>
            <button onClick={reset} style={{ padding: '10px 24px', border: '1px solid #444', background: 'transparent', color: '#e0e0e0', cursor: 'pointer', fontSize: 12 }}>
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
