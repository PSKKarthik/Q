'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { useTheme } from '@/lib/theme'
import { resolveAvatarUrl } from '@/lib/avatar'

export function ProfileModal({ profile, onClose, onUpdate }: {
  profile: Profile; onClose: () => void; onUpdate: (p: Profile) => void
}) {
  const { toast } = useToast()
  const { theme, toggleTheme } = useTheme()
  const [form, setForm] = useState({ ...profile })
  const [newPassword, setNewPassword] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarPreviewSrc, setAvatarPreviewSrc] = useState<string | null>(profile.avatar_url || null)
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const resolved = await resolveAvatarUrl(form.avatar_url)
      if (!cancelled) setAvatarPreviewSrc(resolved)
    })()
    return () => {
      cancelled = true
    }
  }, [form.avatar_url])

  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast('Please upload an image file', 'error'); return }
    if (file.size > 5 * 1024 * 1024) { toast('Avatar image must be under 5MB', 'error'); return }
    setUploadingAvatar(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `avatars/${profile.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('course-files').upload(path, file, { upsert: true })
      if (error) throw error
      setForm(f => ({ ...f, avatar_url: path }))
      toast('Avatar uploaded', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to upload avatar', 'error')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const save = async () => {
    if (newPassword && newPassword.length < 8) {
      toast('Password must be at least 8 characters', 'error')
      return
    }
    const { data, error } = await supabase.from('profiles').update({
      name: form.name, phone: form.phone, bio: form.bio, avatar: form.avatar, avatar_url: form.avatar_url, theme: form.theme
    }).eq('id', profile.id).select().single()
    if (error) { toast(error.message); return }
    if (newPassword) {
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
      if (pwErr) { toast(pwErr.message, 'error'); return }
    }
    if (data) onUpdate(data as Profile)
    if (form.theme && form.theme !== theme) toggleTheme()
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
          {avatarPreviewSrc ? (
            <Image src={avatarPreviewSrc} alt="Avatar" width={64} height={64} unoptimized style={{ width: 64, height: 64, border: '1px solid var(--border)', objectFit: 'cover', borderRadius: 6 }} />
          ) : (
            <div style={{ width: 64, height: 64, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 24 }}>
              {form.avatar}
            </div>
          )}
          <div>
            <label className="label">Avatar (2 letters)</label>
            <input className="input" value={form.avatar || ''} onChange={e => upd('avatar', e.target.value.toUpperCase().slice(0, 2))} style={{ width: 80 }} maxLength={2} />
            <div style={{ marginTop: 8 }}>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f) }} />
              {uploadingAvatar && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Uploading...</div>}
            </div>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {[['name', 'Full Name'], ['phone', 'Phone'], ['bio', 'Bio']].map(([k, lbl]) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <label className="label">{lbl}</label>
              {k === 'bio'
                ? <textarea className="input" value={(form as any)[k] || ''} onChange={e => upd(k, e.target.value)} rows={3} />
                : <input className="input" value={(form as any)[k] || ''} onChange={e => upd(k, e.target.value)} />
              }
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label className="label">Theme</label>
            <select className="input" value={form.theme || theme} onChange={e => upd('theme', e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="label">New Password (optional)</label>
            <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div className="modal-form-actions">
            <button className="btn btn-primary" type="submit">Save Changes</button>
            <button className="btn" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
