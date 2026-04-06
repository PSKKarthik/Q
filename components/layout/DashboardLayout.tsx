'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
import { useToast } from '@/lib/toast'
import { resolveAvatarUrl } from '@/lib/avatar'
import type { Profile } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { NotificationBell } from '@/components/layout/NotificationBell'

interface NavItem {
  id?: string; label?: string; icon?: string; section?: string
}

interface DashboardLayoutProps {
  profile: Profile
  navItems: NavItem[]
  activeTab: string
  onTabChange: (tab: string) => void
  locked?: boolean
  children: React.ReactNode
}

export default function DashboardLayout({ profile, navItems, activeTab, onTabChange, locked = false, children }: DashboardLayoutProps) {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const { toast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)
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

  const roleColor: Record<string, string> = {
    admin: 'var(--danger)', teacher: 'var(--warn)', student: 'var(--success)', parent: 'var(--fg-dim)'
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) { console.error('Logout failed:', error); toast('Logout failed. Please try again.', 'error'); return }
      router.replace('/login')
    } catch {
      toast('Logout failed. Please try again.', 'error')
    }
  }

  return (
    <div style={{ display: 'flex', background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Mobile overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => { if (!locked) setSidebarOpen(false) }} style={{ display: sidebarOpen ? 'block' : 'none' }} />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ fontFamily: 'var(--display)', fontSize: 26, letterSpacing: '0.15em' }}>QGX</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 }}>Query Gen X</div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item, i) =>
            item.section
              ? <div key={i} className="nav-section">{item.section}</div>
              : <div
                  key={item.id}
                  className={`nav-item ${activeTab === item.id ? 'active' : ''} ${locked ? 'disabled' : ''}`}
                  onClick={() => {
                    if (locked) return
                    onTabChange(item.id!)
                    setSidebarOpen(false)
                  }}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  aria-disabled={locked}
                  style={locked ? { pointerEvents: 'none', opacity: 0.45 } : undefined}
                >
                  <Icon name={item.icon!} size={13} /> {item.label}
                </div>
          )}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            {avatarSrc
              ? <Image src={avatarSrc} alt="Avatar" width={30} height={30} unoptimized style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: '50%', border: '1px solid var(--border)' }} />
              : <div className="avatar">{profile.avatar}</div>}
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
      <main className="main-content" style={{ position: 'relative' }}>
        <div className="grid-bg" />
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="btn btn-sm hamburger-btn" disabled={locked} onClick={() => setSidebarOpen(o => !o)}>
              <Icon name={sidebarOpen ? 'x' : 'wrap'} size={14} />
            </button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--fg-dim)', textTransform: 'uppercase' }}>
                {locked ? 'exam mode' : activeTab}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NotificationBell userId={profile.id} />
            <button className="btn btn-sm" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={12} />
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
