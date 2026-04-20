'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/ui/Icon'
import { isSafeRedirect } from '@/lib/utils'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'
  const redirectPath = searchParams.get('redirect')

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  // Redirect already-authenticated users to their dashboard
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setCheckingSession(false); return }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', data.user.id).single()
      if (profile?.role) {
        const target = redirectPath && isSafeRedirect(redirectPath)
          ? redirectPath
          : `/dashboard/${profile.role}`
        router.replace(target)
      } else {
        setCheckingSession(false)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogin = async () => {
    if (!identifier || !password) { setError('Enter email or QGX ID and password'); return }
    setLoading(true); setError('')

    let loginEmail = identifier.trim()

    // If input looks like a QGX ID (starts with QGX-), resolve to email
    if (loginEmail.toUpperCase().startsWith('QGX-')) {
      const { data: profile, error: lookupErr } = await supabase
        .from('profiles').select('email').eq('qgx_id', loginEmail.toUpperCase()).single()
      if (lookupErr || !profile) {
        setError('QGX ID not found'); setLoading(false); return
      }
      loginEmail = profile.email
    }

    const { data, error: err } = await supabase.auth.signInWithPassword({ email: loginEmail, password })
    if (err) { setError(err.message); setLoading(false); return }

    // Get profile to determine role
    const { data: profile } = await supabase
      .from('profiles').select('role, qgx_id').eq('id', data.user.id).single()

    if (!profile?.role) {
      setError('Account setup incomplete. Please contact an administrator.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // Backfill QGX ID if missing (users who registered before the fix)
    if (!profile.qgx_id) {
      const meta = data.user.user_metadata
      fetch('/api/setup-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.user.id,
          name: meta?.name || '',
          email: data.user.email || '',
          role: profile.role,
        }),
      }).catch(() => {})
    }

    const target = redirectPath && isSafeRedirect(redirectPath)
      ? redirectPath
      : `/dashboard/${profile.role}`
    router.push(target)
  }

  if (checkingSession) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div className="auth-shell" style={{ background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div className="auth-wrap" style={{ position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Sign In</div>
        </div>

        <form
          className="fade-up-1 card auth-card"
          onSubmit={(e) => {
            e.preventDefault()
            handleLogin()
          }}
        >
          {resetSuccess && (
            <div style={{ color: 'var(--success)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 16, textAlign: 'center' }}>
              ✓ Password updated! Sign in with your new password.
            </div>
          )}
          <div style={{ marginBottom: 18 }}>
            <label className="label">Email or QGX ID</label>
            <input className="input" type="text" value={identifier} onChange={e => setIdentifier(e.target.value)}
              placeholder="you@example.com or QGX-S0001-A7F2" autoComplete="username" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label className="label">Password</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                style={{ paddingRight: 40 }} autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 4, display: 'flex', alignItems: 'center' }}
                aria-label={showPw ? 'Hide password' : 'Show password'}>
                <Icon name={showPw ? 'eye-off' : 'eye'} size={16} />
              </button>
            </div>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 16 }}>{error}</div>}
          <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In →'}
          </button>
          <div style={{ textAlign: 'right', marginTop: 12 }}>
            <Link href="/forgot-password" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>Forgot password?</Link>
          </div>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>No account? </span>
            <Link href="/register" style={{ color: 'var(--fg)', fontFamily: 'var(--mono)', fontSize: 11 }}>Register</Link>
          </div>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
