import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 5, maxWidth: 480, padding: 32 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 120, letterSpacing: '0.1em', lineHeight: 1 }}>404</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 32, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Page not found
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Link href="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>← Back to Home</Link>
          <Link href="/login" className="btn" style={{ textDecoration: 'none' }}>Sign In</Link>
        </div>
      </div>
    </div>
  )
}
