'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile } from '@/types'
import { Icon } from '@/components/ui/Icon'

export function ProfileModal({ profile, onClose, onUpdate }: {
  profile: Profile; onClose: () => void; onUpdate: (p: Profile) => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState({ ...profile })
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const { data, error } = await supabase.from('profiles').update({
      name: form.name, phone: form.phone, bio: form.bio, avatar: form.avatar
    }).eq('id', profile.id).select().single()
    if (error) { toast(error.message); return }
    if (data) onUpdate(data as Profile)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div className="modal-title">Edit Profile</div>
          <button className="btn btn-sm" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ width: 64, height: 64, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 24 }}>
            {form.avatar}
          </div>
          <div>
            <label className="label">Avatar (2 letters)</label>
            <input className="input" value={form.avatar || ''} onChange={e => upd('avatar', e.target.value.toUpperCase().slice(0, 2))} style={{ width: 80 }} maxLength={2} />
          </div>
        </div>
        {[['name', 'Full Name'], ['phone', 'Phone'], ['bio', 'Bio']].map(([k, lbl]) => (
          <div key={k} style={{ marginBottom: 14 }}>
            <label className="label">{lbl}</label>
            {k === 'bio'
              ? <textarea className="input" value={(form as any)[k] || ''} onChange={e => upd(k, e.target.value)} rows={3} />
              : <input className="input" value={(form as any)[k] || ''} onChange={e => upd(k, e.target.value)} />
            }
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={save}>Save Changes</button>
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
