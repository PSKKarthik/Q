'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, pushNotification, logActivity, type Profile, type Announcement } from '@/lib/supabase'
import Layout, { Icon, AnnouncementCard, ProfileModal } from '@/components/Layout'

export default function AdminDashboard() {
  const router = useRouter()
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [tab, setTab]             = useState('home')
  const [users, setUsers]         = useState<Profile[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [tests, setTests]         = useState<any[]>([])
  const [showProfile, setShowProfile] = useState(false)
  const [announceModal, setAnnounceModal] = useState(false)
  const [userModal, setUserModal] = useState<any>(null)
  const [newAnnounce, setNewAnnounce] = useState({ title: '', body: '', target: 'all', pinned: false })
  const [editUser, setEditUser]   = useState<any>({})
  const [search, setSearch]       = useState('')
  const [doubleXP, setDoubleXP]   = useState<any>({ active: false, ends_at: null })
  const [xpTimer, setXpTimer]     = useState('')
  const [activityLog, setActivityLog] = useState<any[]>([])
  const [allAttempts, setAllAttempts] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => { if (p) setProfile(p as Profile) })
    })
    fetchAll()
    // Realtime: announcements
    const ch = supabase.channel('admin-announce')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' },
        () => fetchAnnouncements())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    if (!doubleXP.active || !doubleXP.ends_at) return
    const iv = setInterval(() => {
      const rem = Math.max(0, doubleXP.ends_at - Date.now())
      if (rem === 0) { setDoubleXP({ active: false, ends_at: null }); setXpTimer(''); return }
      const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000)
      setXpTimer(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(iv)
  }, [doubleXP])

  const fetchAll = async () => {
    fetchAnnouncements()
    const [u, t, d, al, at] = await Promise.all([
      supabase.from('profiles').select('*').order('joined', { ascending: false }),
      supabase.from('tests').select('*').order('created_at', { ascending: false }),
      supabase.from('platform_settings').select('*').eq('key', 'double_xp').single(),
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('attempts').select('*'),
    ])
    if (u.data) setUsers(u.data as Profile[])
    if (t.data) setTests(t.data)
    if (d.data) setDoubleXP(d.data.value)
    if (al.data) setActivityLog(al.data)
    if (at.data) setAllAttempts(at.data)
  }

  const fetchAnnouncements = async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
    if (data) setAnnouncements(data as Announcement[])
  }

  const postAnnouncement = async () => {
    if (!newAnnounce.title || !newAnnounce.body || !profile) return
    await supabase.from('announcements').insert({ ...newAnnounce, author_id: profile.id, author_name: profile.name, role: 'admin' })
    // Notify all users
    const targets = users.filter(u => u.id !== profile.id)
    for (const u of targets) {
      await pushNotification(u.id, `📢 Admin announcement: ${newAnnounce.title}`, 'announcement')
    }
    await logActivity(`Admin posted announcement: ${newAnnounce.title}`, 'announcement')
    setNewAnnounce({ title: '', body: '', target: 'all', pinned: false })
    setAnnounceModal(false)
  }

  const deleteAnnouncement = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id)
    setAnnouncements(a => a.filter(x => x.id !== id))
  }

  const deleteUser = async (id: string) => {
    await supabase.from('profiles').delete().eq('id', id)
    setUsers(u => u.filter(x => x.id !== id))
  }

  const saveUser = async () => {
    if (userModal === 'add') {
      // Can only create users via Supabase auth — show instruction
      alert('To add users, ask them to register at /register')
    } else {
      await supabase.from('profiles').update(editUser).eq('id', userModal.id)
      setUsers(u => u.map(x => x.id === userModal.id ? { ...x, ...editUser } : x))
    }
    setUserModal(null)
  }

  const activateDoubleXP = async () => {
    const val = { active: true, ends_at: Date.now() + 3600000 }
    await supabase.from('platform_settings').update({ value: val }).eq('key', 'double_xp')
    setDoubleXP(val)
    const students = users.filter(u => u.role === 'student')
    for (const s of students) await pushNotification(s.id, '⚡ Double XP Hour is now active! Earn 2x XP on tests!', 'double_xp')
  }
  const deactivateDoubleXP = async () => {
    const val = { active: false, ends_at: null }
    await supabase.from('platform_settings').update({ value: val }).eq('key', 'double_xp')
    setDoubleXP(val); setXpTimer('')
  }

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  const students  = users.filter(u => u.role === 'student')
  const teachers  = users.filter(u => u.role === 'teacher')
  const avgScore  = allAttempts.length ? Math.round(allAttempts.reduce((s, a) => s + (a.percent || 0), 0) / allAttempts.length) : 0

  const navItems = [
    { id: 'home',         label: 'Overview',        icon: 'home'   },
    { section: 'Management' },
    { id: 'users',        label: 'User Management', icon: 'users'  },
    { id: 'announcements',label: 'Announcements',   icon: 'bell'   },
    { id: 'analytics',   label: 'Analytics',       icon: 'chart'  },
    { section: 'Account' },
    { id: 'profile',      label: 'My Profile',      icon: 'user'   },
  ]

  if (!profile) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading...</div>

  return (
    <Layout profile={profile} navItems={navItems} activeTab={tab} onTabChange={setTab}>
      {showProfile && <ProfileModal profile={profile} onClose={() => setShowProfile(false)} onUpdate={p => setProfile(p)} />}

      {/* Announce Modal */}
      {announceModal && (
        <div className="modal-overlay" onClick={() => setAnnounceModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Announcement</div>
            <div style={{ marginBottom: 14 }}><label className="label">Title</label><input className="input" value={newAnnounce.title} onChange={e => setNewAnnounce(a => ({ ...a, title: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}><label className="label">Message</label><textarea className="input" rows={4} value={newAnnounce.body} onChange={e => setNewAnnounce(a => ({ ...a, body: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}>
              <label className="label">Target</label>
              <select className="input" value={newAnnounce.target} onChange={e => setNewAnnounce(a => ({ ...a, target: e.target.value }))}>
                <option value="all">All</option><option value="teachers">Teachers</option><option value="students">Students</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer', marginBottom: 16 }}>
              <input type="checkbox" checked={newAnnounce.pinned} onChange={e => setNewAnnounce(a => ({ ...a, pinned: e.target.checked }))} /> Pin announcement
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={postAnnouncement}>Post</button>
              <button className="btn" onClick={() => setAnnounceModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* User Edit Modal */}
      {userModal && userModal !== 'add' && (
        <div className="modal-overlay" onClick={() => setUserModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Edit User</div>
            {[['name','Name'],['phone','Phone'],['bio','Bio']].map(([k,lbl]) => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label className="label">{lbl}</label>
                <input className="input" value={editUser[k]||''} onChange={e => setEditUser((f: any) => ({...f,[k]:e.target.value}))} />
              </div>
            ))}
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={saveUser}>Save</button>
              <button className="btn" onClick={() => setUserModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="page">
        {/* HOME */}
        {tab === 'home' && (
          <>
            <div className="page-title fade-up">ADMIN OVERVIEW</div>
            <div className="page-sub fade-up-1" style={{ marginBottom: 28 }}>Welcome back, {profile.name}</div>

            <div className="grid-4 fade-up-2" style={{ marginBottom: 24 }}>
              {[['Total Users', users.length], ['Students', students.length], ['Teachers', teachers.length], ['Tests', tests.length]].map(([lbl, val]) => (
                <div key={String(lbl)} className="stat-card"><div className="stat-val">{val}</div><div className="stat-label">{lbl}</div></div>
              ))}
            </div>

            {/* Double XP Panel */}
            <div className="fade-up-3" style={{ marginBottom: 24, border: '1px solid var(--border)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 12 }}>⚡ Double XP Control</div>
              {doubleXP.active ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--warn)' }}>⚡ ACTIVE — {xpTimer}</span>
                  <button className="btn btn-sm btn-danger" onClick={deactivateDoubleXP}>Deactivate</button>
                </div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={activateDoubleXP}>⚡ Activate Double XP Hour</button>
              )}
            </div>

            <div className="grid-2 fade-up-4">
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Recent Announcements</div>
                {announcements.slice(0, 3).map(a => <AnnouncementCard key={a.id} a={a} canDelete={false} />)}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Recent Activity</div>
                {activityLog.slice(0, 5).map(al => (
                  <div key={al.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <div style={{ color: 'var(--fg)' }}>{al.message}</div>
                    <div style={{ color: 'var(--fg-dim)', fontSize: 9, marginTop: 2 }}>{al.created_at?.slice(0, 10)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <>
            <div className="page-title fade-up">USER MANAGEMENT</div>
            <div className="page-sub fade-up-1" style={{ marginBottom: 24 }}>Manage all platform users</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }} className="fade-up-2">
              <div className="search-wrap">
                <Icon name="search" size={13} />
                <input className="search-input" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="fade-up-3" style={{ border: '1px solid var(--border)' }}>
              <table className="table">
                <thead><tr><th>User</th><th>QGX ID</th><th>Email</th><th>Role</th><th>XP</th><th>Joined</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <tr key={u.id}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>{u.avatar}</div>{u.name}</div></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{u.qgx_id}</span></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{u.email}</span></td>
                      <td><span className={`tag ${u.role === 'admin' ? 'tag-danger' : u.role === 'teacher' ? 'tag-warn' : 'tag-success'}`}>{u.role}</span></td>
                      <td><span className="mono" style={{ fontSize: 12, color: 'var(--warn)' }}>{u.xp}</span></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{u.joined}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-xs" onClick={() => { setEditUser({ ...u }); setUserModal(u) }}><Icon name="edit" size={10} /></button>
                          <button className="btn btn-xs btn-danger" onClick={() => deleteUser(u.id)}><Icon name="trash" size={10} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ANNOUNCEMENTS */}
        {tab === 'announcements' && (
          <>
            <div className="page-title fade-up">ANNOUNCEMENTS</div>
            <div style={{ marginBottom: 16 }} className="fade-up-1">
              <button className="btn btn-primary btn-sm" onClick={() => setAnnounceModal(true)}><Icon name="plus" size={12} /> New Announcement</button>
            </div>
            <div className="fade-up-2">
              {announcements.map(a => <AnnouncementCard key={a.id} a={a} canDelete={true} onDelete={deleteAnnouncement} />)}
            </div>
          </>
        )}

        {/* ANALYTICS */}
        {tab === 'analytics' && (
          <>
            <div className="page-title fade-up">PLATFORM ANALYTICS</div>
            <div className="page-sub fade-up-1" style={{ marginBottom: 28 }}>Real-time platform insights</div>

            <div className="grid-4 fade-up-2" style={{ marginBottom: 28 }}>
              {[['Total Users', users.length], ['Total Attempts', allAttempts.length], ['Avg Score', `${avgScore}%`], ['Active Tests', tests.filter(t => t.status === 'scheduled').length]].map(([lbl, val]) => (
                <div key={String(lbl)} className="stat-card"><div className="stat-val" style={{ fontSize: 36 }}>{val}</div><div className="stat-label">{lbl}</div></div>
              ))}
            </div>

            {/* Role distribution */}
            <div className="fade-up-3" style={{ marginBottom: 28, border: '1px solid var(--border)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Role Distribution</div>
              {[['Admin', users.filter(u=>u.role==='admin').length, 'var(--danger)'], ['Teacher', teachers.length, 'var(--warn)'], ['Student', students.length, 'var(--success)']].map(([label, count, color]) => (
                <div key={String(label)} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 4 }}>
                    <span>{String(label)}</span><span style={{ color: 'var(--fg-dim)' }}>{count} ({users.length ? Math.round((Number(count)/users.length)*100) : 0}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${users.length ? (Number(count)/users.length)*100 : 0}%`, background: String(color), borderRadius: 2, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Top Students */}
            <div className="fade-up-4" style={{ marginBottom: 28, border: '1px solid var(--border)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Top 5 Students by XP</div>
              {[...students].sort((a,b)=>(b.xp||0)-(a.xp||0)).slice(0,5).map((s,i) => (
                <div key={s.id} className="leaderboard-row">
                  <div className={`rank ${i<3?'top':''}`}>{i+1}</div>
                  <div className="avatar">{s.avatar}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{s.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{s.qgx_id}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: 'var(--warn)' }}>{s.xp}</div>
                </div>
              ))}
            </div>

            {/* Activity feed */}
            <div className="fade-up-4" style={{ border: '1px solid var(--border)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Recent Activity</div>
              {activityLog.slice(0, 10).map(al => (
                <div key={al.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--fg-dim)' }}><Icon name={al.type === 'user_registered' ? 'user' : al.type === 'test_created' ? 'test' : al.type === 'announcement' ? 'bell' : 'check'} size={13} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{al.message}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)', marginTop: 2 }}>{al.created_at?.slice(0, 16).replace('T', ' ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* PROFILE */}
        {tab === 'profile' && (
          <div style={{ maxWidth: 480 }} className="fade-up">
            <div className="page-title" style={{ marginBottom: 20 }}>MY PROFILE</div>
            <div className="card" style={{ padding: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
                <div style={{ width: 72, height: 72, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontSize: 28 }}>{profile.avatar}</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{profile.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{profile.email}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{profile.qgx_id}</div>
                  <span className="tag tag-danger" style={{ marginTop: 6, fontSize: 9 }}>ADMIN</span>
                </div>
              </div>
              <div className="divider" />
              {[['Bio', profile.bio], ['Phone', profile.phone], ['Joined', profile.joined]].map(([k, v]) => (
                <div key={String(k)} style={{ marginBottom: 12 }}><div className="label">{k}</div><div style={{ fontSize: 13 }}>{v || '—'}</div></div>
              ))}
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowProfile(true)}><Icon name="edit" size={11} /> Edit Profile</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
