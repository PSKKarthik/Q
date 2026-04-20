'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/actions'
import { Icon } from '@/components/ui/Icon'
import type { Role, Institution } from '@/types'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' as Role, phone: '', institution_id: '', join_code: '' })
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [joinMode, setJoinMode] = useState<'dropdown' | 'code'>('dropdown')
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    let mounted = true
    const init = async () => {
      // Check if already logged in as admin
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profile?.role === 'admin') { router.replace('/dashboard/admin?tab=users&createUser=1'); return }
      }
      // Load active institutions (public read — no auth needed)
      const { data } = await supabase.from('institutions').select('id, name, code, description').eq('active', true).order('name')
      if (mounted && data) setInstitutions(data as Institution[])
      if (mounted) setCheckingAdmin(false)
    }
    init()
    return () => { mounted = false }
  }, [router])

  if (checkingAdmin) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div className="spinner" />
      </div>
    )
  }

  // Resolve institution_id from either dropdown selection or join code
  const resolveInstitutionId = (): string | null => {
    if (joinMode === 'dropdown') return form.institution_id || null
    const code = form.join_code.trim().toUpperCase()
    if (!code) return null
    const match = institutions.find(i => i.code === code)
    if (!match) return 'NOT_FOUND'
    return match.id
  }

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) { setError('All fields required'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email)) { setError('Invalid email format'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      setError('Password must contain at least one letter and one number'); return
    }

    const institutionId = resolveInstitutionId()
    if (institutionId === 'NOT_FOUND') { setError('Institution code not found. Check and try again.'); return }

    setLoading(true); setError(''); setNotice('')

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name, role: form.role },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/login`,
      },
    })
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }
    if (!data.user) { setError('Check your email to confirm your account before logging in.'); setLoading(false); return }

    if (!data.session) {
      if ((data.user?.identities?.length ?? 0) === 0) {
        setError('An account with this email already exists. Please sign in instead.')
        setLoading(false); return
      }
      await fetch('/api/setup-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, name: form.name, email: form.email, role: form.role, phone: form.phone, institution_id: institutionId }),
      }).catch(() => {})
      setNotice('Account created. Please confirm your email, then sign in to continue.')
      setLoading(false); return
    }

    const profileRes = await fetch('/api/setup-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: data.user.id, name: form.name, email: form.email, role: form.role, phone: form.phone, institution_id: institutionId }),
    })
    if (!profileRes.ok) {
      const { error: profileErr } = await profileRes.json().catch(() => ({ error: 'Profile setup failed' }))
      setError(profileErr || 'Profile setup failed')
      setLoading(false); return
    }

    await logActivity(`New ${form.role} registered: ${form.name}`, 'user_registered')

    fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: form.email,
        subject: 'Welcome to QGX',
        template: 'Welcome to QGX',
        message: `Hi <strong>${form.name}</strong>,<br><br>Your <strong>${form.role}</strong> account has been created on the QGX Learning Platform. Sign in to get started.`,
      }),
    }).catch(() => {})

    setLoading(false)
    router.push(`/dashboard/${form.role}`)
  }

  const selectedInst = institutions.find(i => i.id === form.institution_id)

  return (
    <div className="auth-shell" style={{ background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
      <div className="auth-wrap" style={{ maxWidth: 420, position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Create Account</div>
        </div>

        <form className="fade-up-1 card auth-card" onSubmit={e => { e.preventDefault(); handleRegister() }}>
          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Full name" autoComplete="name" />
          </div>

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Email</label>
            <input className="input" type="text" value={form.email} onChange={e => upd('email', e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Password</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showPw ? 'text' : 'password'}
                value={form.password} onChange={e => upd('password', e.target.value)}
                style={{ paddingRight: 40 }} placeholder="Min 8 chars, 1 letter & 1 number" autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw(!showPw)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 4, display: 'flex', alignItems: 'center' }}
                aria-label={showPw ? 'Hide password' : 'Show password'}>
                <Icon name={showPw ? 'eye-off' : 'eye'} size={16} />
              </button>
            </div>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Phone (optional)</label>
            <input className="input" value={form.phone} onChange={e => upd('phone', e.target.value)} placeholder="+1 (555) 000-0000" autoComplete="tel" />
          </div>

          {/* Role */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => upd('role', e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
            </select>
          </div>

          {/* Institution */}
          {institutions.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label className="label">Institution (optional)</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button type="button" className={`btn btn-sm ${joinMode === 'dropdown' ? 'btn-primary' : ''}`}
                  onClick={() => setJoinMode('dropdown')}>Browse</button>
                <button type="button" className={`btn btn-sm ${joinMode === 'code' ? 'btn-primary' : ''}`}
                  onClick={() => setJoinMode('code')}>Enter Code</button>
              </div>

              {joinMode === 'dropdown' ? (
                <>
                  <select className="input" value={form.institution_id} onChange={e => upd('institution_id', e.target.value)}>
                    <option value="">— None / Independent —</option>
                    {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  {selectedInst?.description && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>{selectedInst.description}</div>
                  )}
                </>
              ) : (
                <input className="input" value={form.join_code}
                  onChange={e => upd('join_code', e.target.value.toUpperCase())}
                  placeholder="Enter institution join code (e.g. GREEN123)" />
              )}
            </div>
          )}

          {notice && <div style={{ color: 'var(--success)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 12 }}>{notice}</div>}
          {error && <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 12 }}>{error}</div>}

          <button className="btn btn-primary" type="submit" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Account →'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link href="/login" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>Already have an account? Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
