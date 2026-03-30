'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const defaultRole = params.get('role') || ''

  const DEMO = {
    admin:   { email: '', hint: 'Register as Admin first' },
    teacher: { email: '', hint: 'Register as Teacher first' },
    student: { email: '', hint: 'Register as Student first' },
  }

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async () => {
    if (!email || !password) { setError('Enter email and password'); return }
    setLoading(true); setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError(err.message); setLoading(false); return }

    // Get profile to determine role
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', data.user.id).single()

    const role = profile?.role || 'student'
    router.push(`/dashboard/${role}`)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div style={{ width: 400, position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Sign In</div>
        </div>

        <div className="fade-up-1 card" style={{ padding: 32 }}>
          <div style={{ marginBottom: 18 }}>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 16 }}>{error}</div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleLogin} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign In →'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>No account? </span>
            <Link href="/register" style={{ color: 'var(--fg)', fontFamily: 'var(--mono)', fontSize: 11 }}>Register</Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>← Back to Home</Link>
        </div>
      </div>
    </div>
  )
}
