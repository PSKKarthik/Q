'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme'
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
  children: React.ReactNode
}

export default function DashboardLayout({ profile, navItems, activeTab, onTabChange, children }: DashboardLayoutProps) {
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const roleColor: Record<string, string> = {
    admin: 'var(--danger)', teacher: 'var(--warn)', student: 'var(--success)'
  }

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) { console.error('Logout failed:', error); alert('Logout failed. Please try again.'); return }
      router.push('/login')
    } catch {
      alert('Logout failed. Please try again.')
    }
  }

  return (
    <div style={{ display: 'flex', background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Mobile overlay */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} style={{ display: sidebarOpen ? 'block' : 'none' }} />

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
              : <div key={item.id} className={`nav-item ${activeTab === item.id ? 'active' : ''}`} onClick={() => { onTabChange(item.id!); setSidebarOpen(false) }} aria-current={activeTab === item.id ? 'page' : undefined}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-sm hamburger-btn" onClick={() => setSidebarOpen(o => !o)}>
              <Icon name={sidebarOpen ? 'x' : 'wrap'} size={14} />
            </button>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--fg-dim)', textTransform: 'uppercase' }}>
              {activeTab}
            </span>
          </div>
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
