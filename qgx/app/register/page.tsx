'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, generateQGXId, logActivity, type Role } from '@/lib/supabase'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm]   = useState({ name: '', email: '', password: '', role: 'student' as Role, phone: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password) { setError('All fields required'); return }
    setLoading(true); setError('')

    // Count existing users of same role for QGX ID
    const { count } = await supabase
      .from('profiles').select('*', { count: 'exact', head: true })
      .eq('role', form.role)
    const qgxId = generateQGXId(form.role, count || 0)

    // Sign up with Supabase Auth
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name, role: form.role } }
    })
    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }

    // Update profile with additional fields (trigger creates base profile)
    await supabase.from('profiles').upsert({
      id: data.user!.id,
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
      <div style={{ width: 420, position: 'relative', zIndex: 5 }}>
        <div className="fade-up" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 48, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Create Account</div>
        </div>

        <div className="fade-up-1 card" style={{ padding: 32 }}>
          {(['name', 'email', 'password', 'phone'] as const).map((k) => (
            <div key={k} style={{ marginBottom: 16 }}>
              <label className="label">{k === 'phone' ? 'Phone (optional)' : k}</label>
              <input className="input" type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'}
                value={form[k]} onChange={e => upd(k, e.target.value)} />
            </div>
          ))}
          <div style={{ marginBottom: 24 }}>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => upd('role', e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
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
