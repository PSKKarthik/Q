'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { Profile, Role } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { ProfileModal } from '@/components/ui/ProfileModal'
import { resolveAvatarUrl } from '@/lib/avatar'

const ROLE_TAG: Record<Role, string> = {
  admin: 'tag-danger',
  teacher: 'tag-warn',
  student: 'tag-success',
  parent: 'tag-success',
}

interface ProfileTabProps {
  profile: Profile
  onUpdate: (p: Profile) => void
  extraFields?: [string, string | number | undefined][]
}

export function ProfileTab({ profile, onUpdate, extraFields = [] }: ProfileTabProps) {
  const [showEdit, setShowEdit] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(profile.avatar_url || null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const resolved = await resolveAvatarUrl(profile.avatar_url)
      if (!cancelled) setAvatarSrc(resolved)
    })()
    return () => {
      cancelled = true
    }
  }, [profile.avatar_url])

  const fields: [string, string | number | undefined][] = [
    ['Bio', profile.bio],
    ['Phone', profile.phone],
    ...extraFields,
    ['Joined', profile.joined],
  ]

  return (
    <div style={{ maxWidth: 480 }} className="fade-up">
      {showEdit && <ProfileModal profile={profile} onClose={() => setShowEdit(false)} onUpdate={onUpdate} />}
      <div className="page-title" style={{ marginBottom: 20 }}>MY PROFILE</div>
      <div className="card" style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          {avatarSrc ? (
            <Image src={avatarSrc} alt="Avatar" width={72} height={72} unoptimized style={{ width: 72, height: 72, border: '1px solid var(--border)', objectFit: 'cover', borderRadius: 0 }} />
          ) : (
            <div style={{ width: 72, height: 72, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 28 }}>
              {profile.avatar}
            </div>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{profile.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{profile.email}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: ROLE_TAG[profile.role] === 'tag-danger' ? 'var(--danger)' : ROLE_TAG[profile.role] === 'tag-warn' ? 'var(--warn)' : 'var(--success)', marginTop: 2 }}>
              {profile.qgx_id}
            </div>
            <span className={`tag ${ROLE_TAG[profile.role]}`} style={{ marginTop: 6, fontSize: 9 }}>{profile.role.toUpperCase()}</span>
          </div>
        </div>
        <div className="divider" />
        {fields.map(([k, v]) => (
          <div key={String(k)} style={{ marginBottom: 12 }}>
            <div className="label">{k}</div>
            <div style={{ fontSize: 13 }}>{v || '—'}</div>
          </div>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowEdit(true)}>
          <Icon name="edit" size={11} /> Edit Profile
        </button>
      </div>
    </div>
  )
}
