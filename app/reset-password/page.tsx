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
    // With implicit flow, Supabase redirects with hash fragment:
    // #access_token=...&type=recovery
    // The Supabase client auto-detects and processes this.

    // Check for error in URL hash
    const hash = window.location.hash
    if (hash.includes('error')) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const desc = params.get('error_description')?.replace(/\+/g, ' ')
      setError(desc || 'Reset link is invalid or expired.')
      setChecking(false)
      return
    }

    // Listen for PASSWORD_RECOVERY event (fired when hash tokens are processed)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[reset-password] auth event:', event, !!session)
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true)
        setChecking(false)
      } else if (event === 'SIGNED_IN' && session) {
        // Fallback: some Supabase versions fire SIGNED_IN instead
        setReady(true)
        setChecking(false)
      } else if (event === 'INITIAL_SESSION' && session) {
        // Session already existed before listener was registered
        setReady(true)
        setChecking(false)
      }
    })

    // Fallback: also try exchanging code if present (PKCE path from /auth/callback)
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ data, error: err }) => {
          if (!err && data.session) {
            setReady(true)
            setChecking(false)
          }
          window.history.replaceState({}, '', '/reset-password')
        })
    }

    // Final fallback timeout
    const timer = setTimeout(() => {
      setChecking(prev => {
        if (prev) {
          // Log debug info for troubleshooting
          console.log('[reset-password] Timed out. URL:', window.location.href)
          console.log('[reset-password] Hash:', window.location.hash)
          setError('Reset link expired or was already used. Please request a new one.')
          return false
        }
        return prev
      })
    }, 6000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdate = async () => {
    if (!password)           { setError('Enter a new password'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')

    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) { setError(err.message); setLoading(false); return }

    // Sign out after reset so the user logs in fresh
    await supabase.auth.signOut()
    router.push('/login?reset=success')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div style={{ width: '100%', maxWidth: 400, padding: '0 16px', position: 'relative', zIndex: 5 }}>

        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>New Password</div>
        </div>

        <div className="fade-up-1 card" style={{ padding: 32 }}>
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
            <>
              <div style={{ marginBottom: 18 }}>
                <label className="label">New Password</label>
                <input
                  className="input" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label className="label">Confirm Password</label>
                <input
                  className="input" type="password"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUpdate()}
                />
              </div>
              {/* Strength hint */}
              {password.length > 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: password.length >= 8 ? 'var(--success)' : 'var(--warn)', marginBottom: 12 }}>
                  {password.length >= 8 ? '✓ Strong enough' : `${8 - password.length} more character(s) needed`}
                </div>
              )}
              {error && (
                <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 16 }}>{error}</div>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleUpdate}
                disabled={loading}
              >
                {loading ? <span className="spinner" /> : 'Update Password →'}
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/login" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>← Back to Sign In</Link>
        </div>
      </div>
    </div>
  )
}
