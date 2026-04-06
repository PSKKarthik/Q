'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function ForgotPasswordInner() {
  const searchParams = useSearchParams()
  const [email, setEmail]   = useState('')
  const [error, setError]   = useState('')
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Show error if redirected from expired/failed reset link
    if (searchParams.get('error') === 'expired') {
      // Also check hash fragment for Supabase error details
      const hash = window.location.hash
      if (hash.includes('otp_expired')) {
        setError('Reset link has expired. Please request a new one.')
      } else {
        setError('Reset link is invalid or expired. Please request a new one.')
      }
      // Clean up the URL
      window.history.replaceState({}, '', '/forgot-password')
    }
  }, [searchParams])

  const handleReset = async () => {
    if (!email) { setError('Enter your email'); return }
    setLoading(true); setError('')

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (err) { setError(err.message); setLoading(false); return }
    setSent(true); setLoading(false)
  }

  return (
    <div className="auth-shell" style={{ background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div className="auth-wrap" style={{ position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Reset Password</div>
        </div>

        <div className="fade-up-1 card auth-card">
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>▸</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--fg)', marginBottom: 8 }}>Check your email</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.6 }}>
                We sent a password reset link to <strong style={{ color: 'var(--fg)' }}>{email}</strong>. Click the link in your email to set a new password.
              </div>
              <Link href="/login" style={{ display: 'inline-block', marginTop: 24, color: 'var(--fg)', fontFamily: 'var(--mono)', fontSize: 11 }}>← Back to Sign In</Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleReset()
              }}
            >
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 20, lineHeight: 1.6 }}>
                Enter the email address associated with your account and we&apos;ll send you a link to reset your password.
              </div>
              <div style={{ marginBottom: 24 }}>
                <label className="label">Email</label>
                <input className="input" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" />
              </div>
              {error && <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 16 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading}>
                {loading ? <span className="spinner" /> : 'Send Reset Link →'}
              </button>
            </form>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/login" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>← Back to Sign In</Link>
        </div>
      </div>
    </div>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading...</div>}>
      <ForgotPasswordInner />
    </Suspense>
  )
}
