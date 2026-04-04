'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { generateQGXId } from '@/lib/utils'
import { logActivity } from '@/lib/actions'
import { Icon } from '@/components/ui/Icon'
import type { Role } from '@/types'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm]   = useState({ name: '', email: '', password: '', role: 'student' as Role, phone: '' })
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) { setError('All fields required'); return }
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email)) { setError('Invalid email format'); return }
    // Password strength: min 8 chars, at least 1 letter + 1 number
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) { setError('Password must contain at least one letter and one number'); return }
    setLoading(true); setError('')

    // Sign up with Supabase Auth
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name, role: form.role } }
    })
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }
    if (!data.user) { setError('Check your email to confirm your account before logging in.'); setLoading(false); return }

    // Generate QGX ID atomically via RPC to avoid race conditions
    let qgxId: string
    const { data: rpcId, error: rpcErr } = await supabase.rpc('generate_qgx_id', { p_role: form.role })
    if (rpcErr || !rpcId) {
      // Fallback if RPC doesn't exist yet
      const { count: roleCount } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true }).eq('role', form.role)
      qgxId = generateQGXId(form.role, roleCount || 0) + crypto.randomUUID().slice(0, 8).toUpperCase()
    } else {
      qgxId = rpcId
    }

    // Update profile with additional fields (trigger creates base profile)
    await supabase.from('profiles').upsert({
      id: data.user.id,
      name: form.name,
      email: form.email,
      role: form.role,
      phone: form.phone,
      avatar: form.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
      qgx_id: qgxId,
      xp: 0, score: 0, ghost_wins: 0,
      joined: new Date().toISOString().slice(0, 10),
    })

    await logActivity(`New ${form.role} registered: ${form.name}`, 'user_registered')
    router.push(`/dashboard/${form.role}`)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', position: 'relative' }}>
      <div className="grid-bg" />
        <div style={{ width: '100%', maxWidth: 420, padding: '0 16px', position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Create Account</div>
        </div>

        <div className="fade-up-1 card" style={{ padding: 32 }}>
          {(['name', 'email', 'password', 'phone'] as const).map((k) => (
            <div key={k} style={{ marginBottom: 16 }}>
              <label className="label">{k === 'phone' ? 'Phone (optional)' : k}</label>
              {k === 'password' ? (
                <div style={{ position: 'relative' }}>
                  <input className="input" type={showPw ? 'text' : 'password'}
                    value={form[k]} onChange={e => upd(k, e.target.value)} style={{ paddingRight: 40 }}
                    placeholder="Min 8 chars, 1 letter & 1 number" autoComplete="new-password"
                    onKeyDown={e => e.key === 'Enter' && handleRegister()} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-dim)', padding: 4, display: 'flex', alignItems: 'center' }}
                    aria-label={showPw ? 'Hide password' : 'Show password'}>
                    <Icon name={showPw ? 'eye-off' : 'eye'} size={16} />
                  </button>
                </div>
              ) : (
                <input className="input" type={k === 'email' ? 'email' : 'text'}
                  value={form[k]} onChange={e => upd(k, e.target.value)}
                  placeholder={k === 'name' ? 'Full name' : k === 'email' ? 'you@example.com' : k === 'phone' ? '+1 (555) 000-0000' : ''}
                  onKeyDown={e => e.key === 'Enter' && handleRegister()} />
              )}
            </div>
          ))}
          <div style={{ marginBottom: 24 }}>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => upd('role', e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
            </select>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 12 }}>{error}</div>}
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleRegister} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create Account →'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link href="/login" style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>Already have an account? Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
