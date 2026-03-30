'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Profile, type Notification } from '@/lib/supabase'
import { useTheme } from '@/app/layout'

// ─── Icons ────────────────────────────────────────────────────────────────────
export const Icon = ({ name, size = 14 }: { name: string; size?: number }) => {
  const icons: Record<string, JSX.Element> = {
    home:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
    users:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    bell:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    book:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
    test:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg>,
    trophy:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="8,21 12,21 16,21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 4H17L16 12a4 4 0 01-8 0L7 4z"/><path d="M5 4H3s0 6 4 8"/><path d="M19 4h2s0 6-4 8"/></svg>,
    calendar: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    task:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
    video:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
    user:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    logout:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    plus:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    edit:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
    x:        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    check:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="20 6 9 17 4 12"/></svg>,
    ai:       <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
    upload:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>,
    search:   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    arrow:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
    sun:      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
    moon:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
    chart:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    star:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    pin:      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l2 6h6l-5 4 2 6-5-3-5 3 2-6-5-4h6z"/></svg>,
    clock:    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    zap:      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    wrap:     <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  }
  return icons[name] || <span>{name}</span>
}

// ─── Notification Bell ────────────────────────────────────────────────────────
function NotificationBell({ userId }: { userId: string }) {
  const [notifs, setNotifs]     = useState<Notification[]>([])
  const [open, setOpen]         = useState(false)
  const dropRef                 = useRef<HTMLDivElement>(null)

  const fetchNotifs = async () => {
    const { data } = await supabase
      .from('notifications').select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setNotifs(data)
  }

  useEffect(() => {
    fetchNotifs()
    // Realtime subscription
    const ch = supabase.channel('notifs-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p) => setNotifs(prev => [p.new as Notification, ...prev].slice(0, 10)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = notifs.filter(n => !n.read).length

  const markAll = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    setNotifs(n => n.map(x => ({ ...x, read: true })))
  }

  const markOne = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x))
  }

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      <button className="btn btn-sm" onClick={() => setOpen(o => !o)} style={{ position: 'relative' }}>
        <Icon name="bell" size={13} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--danger)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9 }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Notifications</span>
            {unread > 0 && <button className="btn btn-xs" onClick={markAll}>Mark all read</button>}
          </div>
          {notifs.length === 0 && (
            <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>No notifications</div>
          )}
          {notifs.map(n => (
            <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, marginBottom: 2 }}>{n.message}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{n.created_at?.slice(0, 10)}</div>
              </div>
              {!n.read && (
                <button className="btn btn-xs" onClick={() => markOne(n.id)} style={{ flexShrink: 0 }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Layout ───────────────────────────────────────────────────────────────────
interface NavItem {
  id?: string; label?: string; icon?: string; section?: string
}

interface LayoutProps {
  profile: Profile
  navItems: NavItem[]
  activeTab: string
  onTabChange: (tab: string) => void
  children: React.ReactNode
}

export default function Layout({ profile, navItems, activeTab, onTabChange, children }: LayoutProps) {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()

  const roleColor: Record<string, string> = {
    admin: 'var(--danger)', teacher: 'var(--warn)', student: 'var(--success)'
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ display: 'flex', background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>Query Gen X</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item, i) =>
            item.section
              ? <div key={i} className="nav-section">{item.section}</div>
              : <div key={item.id} className={`nav-item ${activeTab === item.id ? 'active' : ''}`} onClick={() => onTabChange(item.id!)}>
                  <Icon name={item.icon!} size={13} /> {item.label}
                </div>
          )}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div className="avatar">{profile.avatar}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.2 }}>{profile.name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: roleColor[profile.role] }}>{profile.role.toUpperCase()}</div>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-muted)', marginBottom: 12 }}>{profile.qgx_id}</div>
          <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLogout}>
            <Icon name="logout" size={11} /> Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <div className="topbar">
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--fg-dim)', textTransform: 'uppercase' }}>
            {activeTab}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-sm" onClick={toggleTheme}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={12} />
            </button>
            <NotificationBell userId={profile.id} />
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}

// ─── Shared components ────────────────────────────────────────────────────────
export function AnnouncementCard({ a, canDelete, onDelete }: {
  a: any; canDelete: boolean; onDelete?: (id: string) => void
}) {
  return (
    <div className="announce-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="ac-meta">
            {a.pinned && '📌 PINNED · '}
            <span style={{ textTransform: 'uppercase' }}>{a.role}</span> · {a.author_name} · {a.created_at?.slice(0, 10)}
          </div>
          <div className="ac-title">{a.title}</div>
          <div className="ac-body">{a.body}</div>
        </div>
        {canDelete && onDelete && (
          <button className="btn btn-xs btn-danger" style={{ marginLeft: 12 }} onClick={() => onDelete(a.id)}>
            <Icon name="trash" size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

export function ProfileModal({ profile, onClose, onUpdate }: {
  profile: Profile; onClose: () => void; onUpdate: (p: Profile) => void
}) {
  const [form, setForm] = useState({ ...profile })
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const { data } = await supabase.from('profiles').update({
      name: form.name, phone: form.phone, bio: form.bio, avatar: form.avatar
    }).eq('id', profile.id).select().single()
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
