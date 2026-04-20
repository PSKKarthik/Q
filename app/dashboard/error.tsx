'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error)
  }, [error])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 16,
      padding: 32,
      textAlign: 'center',
    }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 40, letterSpacing: '0.08em', color: 'var(--danger)' }}>!</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '0.06em' }}>Something went wrong</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', maxWidth: 480 }}>
        {error?.message || 'An unexpected error occurred in this section of the dashboard.'}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={reset}
        >
          Try Again
        </button>
        <button
          className="btn btn-sm"
          onClick={() => window.location.reload()}
        >
          Reload Page
        </button>
      </div>
      {error?.digest && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>
          Error ID: {error.digest}
        </div>
      )}
    </div>
  )
}
