'use client'
import Link from 'next/link'
import { useState } from 'react'

export default function Home() {
  const [hover, setHover] = useState<string | null>(null)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="grid-bg" />
      <div className="scanline" />

      {/* Nav */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 48px', borderBottom: '1px solid var(--border)', position: 'relative', zIndex: 10 }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: '0.15em' }}>QGX</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/login" className="btn btn-sm">Login</Link>
          <Link href="/register" className="btn btn-primary btn-sm">Register</Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 48px', position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 20 }}>
          ◈ Query Gen X — Learning Management System
        </div>
        <h1 className="fade-up-1" style={{ fontFamily: 'var(--display)', fontSize: 'clamp(72px,12vw,140px)', letterSpacing: '0.08em', lineHeight: 0.9, marginBottom: 32 }}>
          QGX
        </h1>
        <p className="fade-up-2" style={{ fontFamily: 'var(--sans)', fontSize: 18, color: 'var(--fg-dim)', maxWidth: 480, lineHeight: 1.6, marginBottom: 48 }}>
          Assessments. Courses. Collaboration.<br />Built for the modern classroom.
        </p>

        {/* Role cards */}
        <div className="fade-up-3" style={{ display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { role: 'student', label: 'S T U D E N T', sub: 'Learn & Attempt' },
            { role: 'teacher', label: 'T E A C H E R', sub: 'Create & Manage' },
            { role: 'admin',   label: 'A D M I N',   sub: 'Oversee & Control' },
          ].map(({ role, label, sub }) => (
            <Link
              key={role}
              href={`/login?role=${role}`}
              onMouseEnter={() => setHover(role)}
              onMouseLeave={() => setHover(null)}
              style={{
                padding: '24px 32px', cursor: 'pointer',
                background: hover === role ? 'rgba(128,128,128,0.08)' : 'rgba(128,128,128,0.03)',
                border: `1px solid ${hover === role ? 'var(--border-hover)' : 'var(--border)'}`,
                transition: 'all 0.2s', minWidth: 160, textDecoration: 'none', color: 'var(--fg)',
                display: 'block', textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>{sub}</div>
            </Link>
          ))}
        </div>

        {/* Demo creds */}
        <div className="fade-up-4" style={{ border: '1px solid var(--border)', padding: '16px 24px', maxWidth: 520, width: '100%' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.15em', color: 'var(--fg-dim)', textTransform: 'uppercase', marginBottom: 10 }}>
            Create your account to get started
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>
            Register as Admin / Teacher / Student → Login → Access your dashboard
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '16px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 5 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>QGX © 2026</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)', letterSpacing: '0.1em' }}>QUERY GEN X — LMS PLATFORM</span>
      </div>
    </div>
  )
}
