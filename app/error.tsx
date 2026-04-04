'use client'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 5, maxWidth: 480, padding: 32 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 72, letterSpacing: '0.1em', marginBottom: 12 }}>ERROR</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 24, letterSpacing: '0.1em' }}>
          Something went wrong
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--danger)', marginBottom: 32, padding: '12px 16px', border: '1px solid var(--border)', wordBreak: 'break-word' }}>
          {error.message || 'An unexpected error occurred'}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={reset}>Try Again</button>
          <a href="/" className="btn" style={{ textDecoration: 'none' }}>← Home</a>
        </div>
      </div>
    </div>
  )
}
