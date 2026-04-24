'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword]  = useState('')
  const [confirm, setConfirm]    = useState('')
  const [error, setError]        = useState('')
  const [loading, setLoading]    = useState(false)
  const [ready, setReady]        = useState(false)
  const [checking, setChecking]  = useState(true)

  useEffect(() => {
    let cancelled = false

    const resolve = () => {
      if (!cancelled) { setReady(true); setChecking(false) }
    }
    const fail = (msg: string) => {
      if (!cancelled) { setError(msg); setChecking(false) }
    }

    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))

    // Path 1 — token_hash in query string (our custom email flow)
    const tokenHash = searchParams.get('token_hash')
    const type = searchParams.get('type')
    if (tokenHash && type === 'recovery') {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        .then(({ data, error: err }) => {
          if (err || !data.session) {
            fail(err?.message || 'Reset link expired or was already used.')
          } else {
            window.history.replaceState({}, '', '/reset-password')
            resolve()
          }
        })
      return
    }

    // Path 2 — PKCE code in query string
    const code = searchParams.get('code')
    if (code) {
      window.history.replaceState({}, '', '/reset-password')
      supabase.auth.exchangeCodeForSession(code).then(({ data, error: err }) => {
        if (err || !data.session) fail('Reset link expired or was already used.')
        else resolve()
      })
      return
    }

    // Path 3 — implicit flow: access_token in hash
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token') || ''
    if (accessToken) {
      window.history.replaceState({}, '', '/reset-password')
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error: err }) => {
          if (err || !data.session) fail('Reset link expired or was already used.')
          else resolve()
        })
      return
    }

    // Path 4 — hash error from Supabase
    if (hashParams.get('error')) {
      const desc = hashParams.get('error_description')?.replace(/\+/g, ' ')
      fail(desc || 'Reset link is invalid or expired.')
      return
    }

    // No token found at all
    fail('No reset token found. Please request a new link.')

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdate = async () => {
    if (!password)           { setError('Enter a new password'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number')
      return
    }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')

    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setLoading(false); return }

    // Sign out after reset so the user logs in fresh
    await supabase.auth.signOut()
    router.push('/login?reset=success')
  }

  return (
    <div className="auth-shell" style={{ background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div className="auth-wrap" style={{ position: 'relative', zIndex: 5 }}>

        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>New Password</div>
        </div>

        <div className="fade-up-1 card auth-card">
          {/* Error state */}
          {!checking && !ready && error ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.6, marginBottom: 16 }}>
                {error}
              </div>
              <Link href="/forgot-password" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center' }}>
                Request New Reset Link →
              </Link>
            </div>
          ) : checking ? (
            /* Loading state */
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.6 }}>
                Verifying reset link…
              </div>
              <div style={{ marginTop: 16 }}><span className="spinner" /></div>
            </div>
          ) : (
            /* Ready — show form */
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleUpdate()
              }}
            >
              <div style={{ marginBottom: 18 }}>
                <label className="label">New Password</label>
                <input
                  className="input" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                  required
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label className="label">Confirm Password</label>
                <input
                  className="input" type="password"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              {/* Strength hint */}
              {password.length > 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: password.length >= 8 ? 'var(--success)' : 'var(--warn)', marginBottom: 12 }}>
                  {password.length >= 8 ? '✓ Length OK (include letters and numbers)' : `${8 - password.length} more character(s) needed`}
                </div>
              )}
              {error && (
                <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 16 }}>{error}</div>
              )}
              <button
                className="btn btn-primary"
                type="submit"
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : 'Update Password →'}
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
