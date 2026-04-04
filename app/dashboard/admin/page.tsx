'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { pushNotificationBatch, logActivity } from '@/lib/actions'
import { PAGE_SIZE, DEBOUNCE_MS, DOUBLE_XP_DURATION_MS } from '@/lib/constants'
import { exportCSV, DEFAULT_XP_LEVELS, type XPLevel } from '@/lib/utils'
import type { Profile, Announcement, Attempt, Test, ActivityLog, Course, Assignment, Submission, AttendanceRecord, Quest } from '@/types'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Icon } from '@/components/ui/Icon'
import { AnnouncementCard } from '@/components/ui/AnnouncementCard'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { Pagination } from '@/components/ui/Pagination'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ProfileTab } from '@/components/ui/ProfileTab'
import { AdminTestModule } from '@/components/modules/AdminTestModule'
import { NotificationsModule } from '@/components/modules/NotificationsModule'
import { AdminBatchModule } from '@/components/modules/BatchModule'
import { CalendarModule } from '@/components/modules/CalendarModule'

export default function AdminDashboard() {
  const router = useRouter()
  const { toast } = useToast()
  const [profile, setProfile]     = useState<Profile | null>(null)
  const [tab, setTab]             = useState('home')
  const [users, setUsers]         = useState<Profile[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [tests, setTests]         = useState<Test[]>([])
  const [announceModal, setAnnounceModal] = useState(false)
  const [userModal, setUserModal] = useState<Profile | null>(null)
  const [newAnnounce, setNewAnnounce] = useState({ title: '', body: '', target: 'all', pinned: false })
  const [editUser, setEditUser]   = useState<Record<string, string>>({})
  const [search, setSearch]       = useState('')
  const [doubleXP, setDoubleXP]   = useState<{ active: boolean; ends_at: number | null }>({ active: false, ends_at: null })
  const [xpTimer, setXpTimer]     = useState('')
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([])
  const [allAttempts, setAllAttempts] = useState<Attempt[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [assignments, setAssignments] = useState<(Assignment & { submissions?: Submission[] })[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [adminQuests, setAdminQuests] = useState<Quest[]>([])
  const [questModal, setQuestModal] = useState(false)
  const [editQuest, setEditQuest] = useState<Partial<Quest>>({ title: '', description: '', type: 'daily', target_type: 'test', target_count: 1, xp_reward: 50, active: true })
  const [userPage, setUserPage] = useState(0)
  const [logPage, setLogPage] = useState(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [platformSettings, setPlatformSettings] = useState<Record<string, any>>({})

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => {
          if (!p) return
          if ((p as Profile).role !== 'admin') { router.push(`/dashboard/${(p as Profile).role}`); return }
          setProfile(p as Profile)
          fetchAll() // Only fetch after confirming admin role
        })
    })

    // Listen for auth state changes (logout in another tab, session expiry)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    // Realtime: announcements
    const ch = supabase.channel('admin-announce')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' },
        () => fetchAnnouncements())
      .subscribe()
    return () => { supabase.removeChannel(ch); subscription.unsubscribe(); if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [])

  useEffect(() => {
    if (!doubleXP.active || !doubleXP.ends_at) return
    const iv = setInterval(() => {
      const rem = Math.max(0, doubleXP.ends_at! - Date.now())
      if (rem === 0) { setDoubleXP({ active: false, ends_at: null }); setXpTimer(''); return }
      const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000)
      setXpTimer(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`)
    }, 1000)
    return () => clearInterval(iv)
  }, [doubleXP])

  const fetchAll = async () => {
    fetchAnnouncements()
    try {
      const results = await Promise.allSettled([
        supabase.from('profiles').select('*').order('joined', { ascending: false }).limit(200),
        supabase.from('tests').select('*').order('created_at', { ascending: false }),
        supabase.from('platform_settings').select('*').eq('key', 'double_xp').single(),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('attempts').select('*').order('submitted_at', { ascending: false }).limit(500),
        supabase.from('courses').select('*').order('created_at', { ascending: false }),
        supabase.from('assignments').select('*, submissions(*)').order('created_at', { ascending: false }),
        supabase.from('attendance').select('*').order('date', { ascending: false }),
        supabase.from('quests').select('*').order('created_at', { ascending: false }),
      ])
      if (results[0].status === 'fulfilled' && results[0].value.data) setUsers(results[0].value.data as Profile[])
      if (results[1].status === 'fulfilled' && results[1].value.data) setTests(results[1].value.data)
      if (results[2].status === 'fulfilled' && results[2].value.data) setDoubleXP(results[2].value.data.value)
      if (results[3].status === 'fulfilled' && results[3].value.data) setActivityLog(results[3].value.data)
      if (results[4].status === 'fulfilled' && results[4].value.data) setAllAttempts(results[4].value.data)
      if (results[5].status === 'fulfilled' && results[5].value.data) setCourses(results[5].value.data as Course[])
      if (results[6].status === 'fulfilled' && results[6].value.data) setAssignments(results[6].value.data)
      if (results[7].status === 'fulfilled' && results[7].value.data) setAttendance(results[7].value.data as AttendanceRecord[])
      if (results[8].status === 'fulfilled' && results[8].value.data) setAdminQuests(results[8].value.data as Quest[])
      // Load all platform settings
      const { data: psData } = await supabase.from('platform_settings').select('*')
      if (psData) {
        const map: Record<string, any> = {}
        psData.forEach((s: any) => { map[s.key] = s.value })
        setPlatformSettings(map)
      }
    } catch {
      // fetchAll failed — non-fatal, UI shows empty state
    }
  }

  const fetchAnnouncements = async () => {
    try {
      const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
      if (data) setAnnouncements(data as Announcement[])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load announcements', 'error')
    }
  }

  const postAnnouncement = async () => {
    if (!newAnnounce.title || !newAnnounce.body || !profile) return
    const validTargets = ['all', 'teachers', 'students']
    if (!validTargets.includes(newAnnounce.target)) { toast('Invalid target audience', 'error'); return }
    try {
      const { error: insertErr } = await supabase.from('announcements').insert({ ...newAnnounce, author_id: profile.id, author_name: profile.name, role: 'admin' })
      if (insertErr) { toast(`Failed to post: ${insertErr.message}`, 'error'); return }
      // Notify only targeted users
      const targetIds = users.filter(u => {
        if (u.id === profile.id) return false
        if (newAnnounce.target === 'students') return u.role === 'student'
        if (newAnnounce.target === 'teachers') return u.role === 'teacher'
        return true // 'all'
      }).map(u => u.id)
      const { error: batchErr, failedCount } = await pushNotificationBatch(targetIds, `◆ Admin announcement: ${newAnnounce.title}`, 'announcement')
      if (batchErr) { /* batch notification failed — non-critical */ }
      await logActivity(`Admin posted announcement: ${newAnnounce.title}`, 'announcement')
      setNewAnnounce({ title: '', body: '', target: 'all', pinned: false })
      setAnnounceModal(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to post announcement', 'error')
    }
  }

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Delete this announcement?')) return
    try {
      await supabase.from('announcements').delete().eq('id', id)
      setAnnouncements(a => a.filter(x => x.id !== id))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete announcement', 'error')
    }
  }

  const deleteUser = async (id: string) => {
    if (!profile || profile.role !== 'admin') return
    if (id === profile.id) { toast('You cannot delete your own account.', 'error'); return }
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return
    try {
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        toast(`Delete failed: ${error || 'Unknown error'}`, 'error')
        return
      }
      setUsers(u => u.filter(x => x.id !== id))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete user', 'error')
    }
  }

  const saveUser = async () => {
    if (!userModal) return
    try {
      const { name, phone, bio, role } = editUser
      const { error } = await supabase.from('profiles').update({ name, phone, bio, role }).eq('id', userModal.id)
      if (error) { toast(`Save failed: ${error.message}`, 'error'); return }
      setUsers(u => u.map(x => x.id === userModal.id ? { ...x, name: name ?? x.name, phone: phone ?? x.phone, bio: bio ?? x.bio, role: (role as Profile['role']) ?? x.role } : x))
      setUserModal(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save user', 'error')
    }
  }

  const activateDoubleXP = async () => {
    try {
      const val = { active: true, ends_at: Date.now() + DOUBLE_XP_DURATION_MS }
      await supabase.from('platform_settings').update({ value: val }).eq('key', 'double_xp')
      setDoubleXP(val)
      const studentIds = users.filter(u => u.role === 'student').map(u => u.id)
      await pushNotificationBatch(studentIds, '◈ Double XP Hour is now active! Earn 2x XP on tests!', 'double_xp')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to activate Double XP', 'error')
    }
  }
  const deactivateDoubleXP = async () => {
    try {
      const val = { active: false, ends_at: null }
      await supabase.from('platform_settings').update({ value: val }).eq('key', 'double_xp')
      setDoubleXP(val); setXpTimer('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to deactivate Double XP', 'error')
    }
  }

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(debouncedSearch.toLowerCase())
  )
  const pagedUsers = filteredUsers.slice(userPage * PAGE_SIZE, (userPage + 1) * PAGE_SIZE)
  const totalUserPages = Math.ceil(filteredUsers.length / PAGE_SIZE)
  const pagedLogs = activityLog.slice(logPage * PAGE_SIZE, (logPage + 1) * PAGE_SIZE)
  const totalLogPages = Math.ceil(activityLog.length / PAGE_SIZE)

  const students  = users.filter(u => u.role === 'student')
  const teachers  = users.filter(u => u.role === 'teacher')
  const avgScore  = allAttempts.length ? Math.round(allAttempts.reduce((s, a) => s + (a.percent || 0), 0) / allAttempts.length) : 0

  const navItems = [
    { id: 'home',         label: 'Overview',        icon: 'home'   },
    { section: 'Management' },
    { id: 'users',        label: 'User Management', icon: 'users'  },
    { id: 'announcements',label: 'Announcements',   icon: 'bell'   },
    { id: 'tests',         label: 'Tests Overview',  icon: 'test'   },
    { id: 'courses',      label: 'Courses',          icon: 'book'   },
    { id: 'assignments',  label: 'Assignments',      icon: 'task'   },
    { id: 'attendance',   label: 'Attendance',        icon: 'check'  },
    { id: 'grades',       label: 'Grades',            icon: 'star'   },
    { id: 'analytics',   label: 'Analytics',       icon: 'chart'  },
    { id: 'quests',      label: 'Quests',           icon: 'star'   },
    { id: 'calendar',    label: 'Calendar',        icon: 'calendar' },
    { id: 'batch',       label: 'Batch Operations', icon: 'users'  },
    { id: 'notifications', label: 'Notifications', icon: 'bell'  },
    { id: 'settings',      label: 'Settings',      icon: 'wrap'   },
    { section: 'Account' },
    { id: 'profile',      label: 'My Profile',      icon: 'user'   },
  ]

  if (!profile) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', gap: 16 }}>
      <div style={{ fontFamily: 'var(--display)', fontSize: 32, letterSpacing: '0.15em', opacity: 0.15 }}>QGX</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.2em' }}>LOADING ADMIN PANEL...</div>
    </div>
  )

  return (
    <DashboardLayout profile={profile} navItems={navItems} activeTab={tab} onTabChange={setTab}>
      {/* Announce Modal */}
      <Modal open={announceModal} onClose={() => setAnnounceModal(false)} title="New Announcement">
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
      </Modal>

      {/* User Edit Modal */}
      <Modal open={!!userModal} onClose={() => setUserModal(null)} title="Edit User">
        {userModal && [
          ['name', 'Name'],
          ['phone', 'Phone'],
          ['bio', 'Bio'],
        ].map(([k, lbl]) => (
          <div key={k} style={{ marginBottom: 14 }}>
            <label className="label">{lbl}</label>
            <input className="input" value={editUser[k] || ''} onChange={e => setEditUser(f => ({ ...f, [k]: e.target.value }))} />
          </div>
        ))}
        {userModal && (
          <div style={{ marginBottom: 14 }}>
            <label className="label">Role</label>
            <select className="input" value={editUser.role || userModal.role} onChange={e => setEditUser(f => ({ ...f, role: e.target.value }))}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={saveUser}>Save</button>
          <button className="btn" onClick={() => setUserModal(null)}>Cancel</button>
        </div>
      </Modal>

      <div className="page">
        {/* HOME */}
        {tab === 'home' && (
          <>
            <PageHeader title="ADMIN OVERVIEW" subtitle={`Welcome back, ${profile.name}`} />

            <StatGrid items={[
              { label: 'Total Users', value: users.length },
              { label: 'Students', value: students.length },
              { label: 'Teachers', value: teachers.length },
              { label: 'Tests', value: tests.length },
            ]} />

            {/* Double XP Panel */}
            <div className="fade-up-3" style={{ marginBottom: 24, border: '1px solid var(--border)', padding: 20 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-dim)', marginBottom: 12 }}>◈ Double XP Control</div>
              {doubleXP.active ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 28, color: 'var(--warn)' }}>◈ ACTIVE — {xpTimer}</span>
                  <button className="btn btn-sm btn-danger" onClick={deactivateDoubleXP}>Deactivate</button>
                </div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={activateDoubleXP}>◈ Activate Double XP Hour</button>
              )}
            </div>

            <div className="grid-2 fade-up-4">
              <div>
                <SectionLabel>Recent Announcements</SectionLabel>
                {announcements.slice(0, 3).map(a => <AnnouncementCard key={a.id} a={a} canDelete={false} />)}
              </div>
              <div>
                <SectionLabel>Recent Activity</SectionLabel>
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
                <input className="search-input" placeholder="Search users..." value={search} onChange={e => {
                  setSearch(e.target.value)
                  if (searchTimer.current) clearTimeout(searchTimer.current)
                  searchTimer.current = setTimeout(() => { setDebouncedSearch(e.target.value); setUserPage(0) }, DEBOUNCE_MS)
                }} />
              </div>
            </div>
            <div className="fade-up-3" style={{ border: '1px solid var(--border)' }}>
              <table className="table">
                <thead><tr><th>User</th><th>QGX ID</th><th>Email</th><th>Role</th><th>XP</th><th>Joined</th><th>Actions</th></tr></thead>
                <tbody>
                  {pagedUsers.map(u => (
                    <tr key={u.id}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>{u.avatar}</div>{u.name}</div></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{u.qgx_id}</span></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{u.email}</span></td>
                      <td><span className={`tag ${u.role === 'admin' ? 'tag-danger' : u.role === 'teacher' ? 'tag-warn' : 'tag-success'}`}>{u.role}</span></td>
                      <td><span className="mono" style={{ fontSize: 12, color: 'var(--warn)' }}>{u.xp}</span></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{u.joined}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-xs" onClick={() => { setEditUser({ name: u.name, phone: u.phone || '', bio: u.bio || '' }); setUserModal(u) }}><Icon name="edit" size={10} /></button>
                          <button className="btn btn-xs btn-danger" onClick={() => deleteUser(u.id)}><Icon name="trash" size={10} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={userPage} totalPages={totalUserPages} onPageChange={setUserPage} />
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

        {/* TESTS OVERVIEW */}
        {tab === 'tests' && (
          <AdminTestModule tests={tests} allAttempts={allAttempts} users={users} />
        )}

        {/* COURSES */}
        {tab === 'courses' && (
          <>
            <PageHeader title="ALL COURSES" subtitle={`${courses.length} courses platform-wide`} />
            <StatGrid items={[
              { label: 'Total Courses', value: courses.length },
              { label: 'Published', value: courses.filter(c => c.status === 'published').length },
              { label: 'Draft', value: courses.filter(c => c.status === 'draft').length },
              { label: 'Teachers', value: new Set(courses.map(c => c.teacher_id)).size },
            ]} columns={4} />
            {/* Bulk actions */}
            <div className="fade-up-2" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={async () => {
                const draftCourses = courses.filter(c => c.status === 'draft')
                if (!draftCourses.length) { toast('No draft courses to publish.', 'info'); return }
                if (!confirm(`Publish all ${draftCourses.length} draft courses?`)) return
                try {
                  await Promise.all(draftCourses.map(c => supabase.from('courses').update({ status: 'published' }).eq('id', c.id)))
                  setCourses(prev => prev.map(c => c.status === 'draft' ? { ...c, status: 'published' } : c))
                } catch (err) { toast(err instanceof Error ? err.message : 'Failed to publish courses', 'error') }
              }}><Icon name="check" size={11} /> Publish All Drafts</button>
              <button className="btn btn-sm" onClick={() => exportCSV('courses-export.csv', ['Title', 'Subject', 'Teacher', 'Status', 'Created'], courses.map(c => [c.title, c.subject, c.teacher_name, c.status, c.created_at?.slice(0, 10)]))}>
                <Icon name="download" size={11} /> Export CSV
              </button>
            </div>
            <div className="fade-up-3" style={{ border: '1px solid var(--border)' }}>
              <table className="table">
                <thead><tr><th>Course</th><th>Subject</th><th>Teacher</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  {courses.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.title}</td>
                      <td><span className="tag">{c.subject}</span></td>
                      <td><span className="mono" style={{ fontSize: 11 }}>{c.teacher_name}</span></td>
                      <td><span className={`tag ${c.status === 'published' ? 'tag-success' : 'tag-warn'}`}>{c.status}</span></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{c.created_at?.slice(0, 10)}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {c.status === 'draft' && (
                            <button className="btn btn-xs" onClick={async () => {
                              const { error } = await supabase.from('courses').update({ status: 'published' }).eq('id', c.id)
                              if (error) { toast(error.message, 'error'); return }
                              setCourses(prev => prev.map(x => x.id === c.id ? { ...x, status: 'published' } : x))
                            }} title="Publish"><Icon name="check" size={10} /></button>
                          )}
                          {c.status === 'published' && (
                          <button className="btn btn-xs" onClick={async () => {
                              const { error } = await supabase.from('courses').update({ status: 'draft' }).eq('id', c.id)
                              if (error) { toast(error.message, 'error'); return }
                              setCourses(prev => prev.map(x => x.id === c.id ? { ...x, status: 'draft' } : x))
                            }} title="Unpublish"><Icon name="eye-off" size={10} /></button>
                          )}
                          <button className="btn btn-xs btn-danger" onClick={async () => {
                            if (!confirm(`Delete course "${c.title}"?`)) return
                            const { error } = await supabase.from('courses').delete().eq('id', c.id)
                            if (error) { toast(error.message, 'error'); return }
                            setCourses(prev => prev.filter(x => x.id !== c.id))
                          }}><Icon name="trash" size={10} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ASSIGNMENTS */}
        {tab === 'assignments' && (
          <>
            <PageHeader title="ALL ASSIGNMENTS" subtitle={`${assignments.length} assignments platform-wide`} />
            <StatGrid items={[
              { label: 'Total', value: assignments.length },
              { label: 'Active', value: assignments.filter(a => a.status === 'active').length },
              { label: 'Closed', value: assignments.filter(a => a.status === 'closed').length },
              { label: 'Submissions', value: assignments.reduce((s, a) => s + (a.submissions?.length || 0), 0) },
            ]} columns={4} />
            <div className="fade-up-2" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-sm" onClick={async () => {
                const overdue = assignments.filter(a => a.status === 'active' && a.due_date && new Date(a.due_date) < new Date())
                if (!overdue.length) { toast('No overdue assignments to close.', 'info'); return }
                if (!confirm(`Close ${overdue.length} overdue assignments?`)) return
                try {
                  await Promise.all(overdue.map(a => supabase.from('assignments').update({ status: 'closed' }).eq('id', a.id)))
                  setAssignments(prev => prev.map(a => overdue.find(o => o.id === a.id) ? { ...a, status: 'closed' } : a))
                } catch (err) { toast(err instanceof Error ? err.message : 'Failed to close assignments', 'error') }
              }}><Icon name="check" size={11} /> Close Overdue</button>
              <button className="btn btn-sm" onClick={() => exportCSV('assignments-export.csv', ['Title', 'Teacher', 'Due', 'Priority', 'Submissions', 'Status'], assignments.map(a => [a.title, a.teacher_name, a.due_date?.slice(0, 10), a.priority, a.submissions?.length || 0, a.status]))}>
                <Icon name="download" size={11} /> Export CSV
              </button>
            </div>
            <div className="fade-up-3" style={{ border: '1px solid var(--border)' }}>
              <table className="table">
                <thead><tr><th>Assignment</th><th>Teacher</th><th>Due</th><th>Priority</th><th>Submissions</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>{a.title}</td>
                      <td><span className="mono" style={{ fontSize: 11 }}>{a.teacher_name}</span></td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{a.due_date?.slice(0, 10)}</span></td>
                      <td><span className={`tag ${a.priority === 'critical' ? 'tag-danger' : a.priority === 'high' ? 'tag-warn' : 'tag-success'}`}>{a.priority}</span></td>
                      <td><span className="mono" style={{ fontSize: 12 }}>{a.submissions?.length || 0}</span></td>
                      <td><span className={`tag ${a.status === 'active' ? 'tag-success' : 'tag-warn'}`}>{a.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {a.status === 'active' && (
                            <button className="btn btn-xs" onClick={async () => {
                              const { error } = await supabase.from('assignments').update({ status: 'closed' }).eq('id', a.id)
                              if (error) { toast(error.message, 'error'); return }
                              setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, status: 'closed' } : x))
                            }} title="Close"><Icon name="check" size={10} /></button>
                          )}
                          <button className="btn btn-xs btn-danger" onClick={async () => {
                            if (!confirm(`Delete assignment "${a.title}"?`)) return
                            const { error } = await supabase.from('assignments').delete().eq('id', a.id)
                            if (error) { toast(error.message, 'error'); return }
                            setAssignments(prev => prev.filter(x => x.id !== a.id))
                          }}><Icon name="trash" size={10} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ATTENDANCE */}
        {tab === 'attendance' && (() => {
          const totalRecords = attendance.length
          const present = attendance.filter(a => a.status === 'present').length
          const absent = attendance.filter(a => a.status === 'absent').length
          const late = attendance.filter(a => a.status === 'late').length
          const rate = totalRecords ? Math.round((present / totalRecords) * 100) : 0
          const bySubject = attendance.reduce<Record<string, { total: number; present: number }>>((acc, a) => {
            if (!acc[a.subject]) acc[a.subject] = { total: 0, present: 0 }
            acc[a.subject].total++
            if (a.status === 'present') acc[a.subject].present++
            return acc
          }, {})
          return (
            <>
              <PageHeader title="ATTENDANCE OVERVIEW" subtitle="Platform-wide attendance statistics" />
              <div style={{ marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={() => exportCSV('attendance-export.csv', ['Student', 'Subject', 'Date', 'Status'], attendance.map(a => [a.student_name, a.subject, a.date, a.status]))}>
                  <Icon name="download" size={11} /> Export CSV
                </button>
              </div>
              <StatGrid items={[
                { label: 'Total Records', value: totalRecords },
                { label: 'Present', value: present },
                { label: 'Absent', value: absent },
                { label: 'Attendance Rate', value: `${rate}%` },
              ]} columns={4} />
              <SectionLabel>By Subject</SectionLabel>
              <div className="fade-up-3">
                {Object.entries(bySubject).map(([subject, { total, present: p }]) => {
                  const pct = Math.round((p / total) * 100)
                  return (
                    <div key={subject} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 4 }}>
                        <span>{subject}</span>
                        <span style={{ color: 'var(--fg-dim)' }}>{p}/{total} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warn)' : 'var(--danger)', borderRadius: 2, transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <SectionLabel>Recent Records</SectionLabel>
              <div className="fade-up-4" style={{ border: '1px solid var(--border)' }}>
                <table className="table">
                  <thead><tr><th>Student</th><th>Subject</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>
                    {attendance.slice(0, 50).map(a => (
                      <tr key={a.id}>
                        <td>{a.student_name}</td>
                        <td><span className="tag">{a.subject}</span></td>
                        <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{a.date}</span></td>
                        <td><span className={`tag ${a.status === 'present' ? 'tag-success' : a.status === 'absent' ? 'tag-danger' : 'tag-warn'}`}>{a.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}

        {/* GRADES */}
        {tab === 'grades' && (() => {
          const studentAttempts = allAttempts.reduce<Record<string, number[]>>((acc, a) => {
            if (!acc[a.student_id]) acc[a.student_id] = []
            acc[a.student_id].push(a.percent || 0)
            return acc
          }, {})
          const studentAvgs = Object.entries(studentAttempts).map(([sid, pcts]) => ({
            student: users.find(u => u.id === sid),
            avg: Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length),
            count: pcts.length,
          })).filter(x => x.student).sort((a, b) => b.avg - a.avg)
          const overallAvg = allAttempts.length ? Math.round(allAttempts.reduce((s, a) => s + (a.percent || 0), 0) / allAttempts.length) : 0
          const gradeDistrib = { A: 0, B: 0, C: 0, D: 0, F: 0 }
          allAttempts.forEach(a => {
            const p = a.percent || 0
            if (p >= 90) gradeDistrib.A++
            else if (p >= 80) gradeDistrib.B++
            else if (p >= 70) gradeDistrib.C++
            else if (p >= 60) gradeDistrib.D++
            else gradeDistrib.F++
          })
          return (
            <>
              <PageHeader title="GRADES OVERVIEW" subtitle="Platform-wide grade distribution" />
              <div style={{ marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={() => exportCSV('grades-export.csv', ['Student', 'Avg Score', 'Tests Taken'], studentAvgs.map(sa => [sa.student!.name, sa.avg, sa.count]))}>
                  <Icon name="download" size={11} /> Export CSV
                </button>
              </div>
              <StatGrid items={[
                { label: 'Avg Score', value: `${overallAvg}%` },
                { label: 'Total Attempts', value: allAttempts.length },
                { label: 'Students Graded', value: Object.keys(studentAttempts).length },
                { label: 'Pass Rate', value: `${allAttempts.length ? Math.round(allAttempts.filter(a => (a.percent || 0) >= 60).length / allAttempts.length * 100) : 0}%` },
              ]} columns={4} />
              <SectionLabel>Grade Distribution</SectionLabel>
              <div className="fade-up-3" style={{ marginBottom: 24 }}>
                {Object.entries(gradeDistrib).map(([grade, count]) => {
                  const pct = allAttempts.length ? Math.round((count / allAttempts.length) * 100) : 0
                  const color = grade === 'A' ? 'var(--success)' : grade === 'B' ? 'var(--success)' : grade === 'C' ? 'var(--warn)' : grade === 'D' ? 'var(--warn)' : 'var(--danger)'
                  return (
                    <div key={grade} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 3 }}>
                        <span>{grade}</span><span style={{ color: 'var(--fg-dim)' }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <SectionLabel>Student Rankings</SectionLabel>
              <div className="fade-up-4" style={{ border: '1px solid var(--border)' }}>
                <table className="table">
                  <thead><tr><th>#</th><th>Student</th><th>Avg Score</th><th>Tests Taken</th></tr></thead>
                  <tbody>
                    {studentAvgs.slice(0, 20).map((sa, i) => (
                      <tr key={sa.student!.id}>
                        <td><span className="mono" style={{ fontSize: 12, color: i < 3 ? 'var(--warn)' : 'var(--fg-dim)' }}>{i + 1}</span></td>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{sa.student!.avatar}</div>{sa.student!.name}</div></td>
                        <td><span className="mono" style={{ fontSize: 12, color: sa.avg >= 70 ? 'var(--success)' : sa.avg >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{sa.avg}%</span></td>
                        <td><span className="mono" style={{ fontSize: 12 }}>{sa.count}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        })()}

        {/* ANALYTICS */}
        {tab === 'analytics' && (
          <>
            <PageHeader title="PLATFORM ANALYTICS" subtitle="Real-time platform insights" />
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-sm" onClick={() => exportCSV('users-export.csv', ['Name', 'Email', 'Role', 'XP', 'Joined'], users.map(u => [u.name, u.email, u.role, u.xp, u.joined]))}>
                <Icon name="download" size={11} /> Export Users CSV
              </button>
            </div>

            <StatGrid items={[
              { label: 'Total Users', value: users.length },
              { label: 'Total Attempts', value: allAttempts.length },
              { label: 'Avg Score', value: `${avgScore}%` },
              { label: 'Active Tests', value: tests.filter(t => t.status === 'scheduled').length },
            ]} />

            {/* Role distribution */}
            <div className="fade-up-3" style={{ marginBottom: 28, border: '1px solid var(--border)', padding: 20 }}>
              <SectionLabel>Role Distribution</SectionLabel>
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
              <SectionLabel>Top 5 Students by XP</SectionLabel>
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
              <SectionLabel>Recent Activity</SectionLabel>
              {pagedLogs.map(al => (
                <div key={al.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--fg-dim)' }}><Icon name={al.type === 'user_registered' ? 'user' : al.type === 'test_created' ? 'test' : al.type === 'announcement' ? 'bell' : 'check'} size={13} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{al.message}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)', marginTop: 2 }}>{al.created_at?.slice(0, 16).replace('T', ' ')}</div>
                  </div>
                </div>
              ))}
              <Pagination page={logPage} totalPages={totalLogPages} onPageChange={setLogPage} />
            </div>
          </>
        )}

        {/* PROFILE */}
        {tab === 'notifications' && <NotificationsModule userId={profile.id} />}

        {/* QUESTS MANAGEMENT */}
        {tab === 'quests' && (() => {
          const saveQuest = async () => {
            if (!editQuest.title?.trim()) { toast('Title is required', 'error'); return }
            try {
              if (editQuest.id) {
                const { error } = await supabase.from('quests').update({
                  title: editQuest.title, description: editQuest.description || '',
                  type: editQuest.type, target_type: editQuest.target_type,
                  target_count: editQuest.target_count, xp_reward: editQuest.xp_reward, active: editQuest.active,
                }).eq('id', editQuest.id)
                if (error) throw error
                setAdminQuests(prev => prev.map(q => q.id === editQuest.id ? { ...q, ...editQuest } as Quest : q))
                toast('Quest updated', 'success')
              } else {
                const { data, error } = await supabase.from('quests').insert({
                  title: editQuest.title, description: editQuest.description || '',
                  type: editQuest.type || 'daily', target_type: editQuest.target_type || 'test',
                  target_count: editQuest.target_count || 1, xp_reward: editQuest.xp_reward || 50, active: editQuest.active ?? true,
                }).select().single()
                if (error) throw error
                if (data) setAdminQuests(prev => [data as Quest, ...prev])
                toast('Quest created', 'success')
              }
              setQuestModal(false)
              setEditQuest({ title: '', description: '', type: 'daily', target_type: 'test', target_count: 1, xp_reward: 50, active: true })
            } catch (err: any) { console.error('Quest save error:', err); toast(err?.message || JSON.stringify(err) || 'Failed to save quest', 'error') }
          }
          const deleteQuest = async (id: string) => {
            const { error } = await supabase.from('quests').delete().eq('id', id)
            if (error) { toast(error.message, 'error'); return }
            setAdminQuests(prev => prev.filter(q => q.id !== id))
            toast('Quest deleted', 'success')
          }
          const toggleActive = async (q: Quest) => {
            const { error } = await supabase.from('quests').update({ active: !q.active }).eq('id', q.id)
            if (error) { toast(error.message, 'error'); return }
            setAdminQuests(prev => prev.map(x => x.id === q.id ? { ...x, active: !x.active } : x))
          }
          return (
            <>
              <PageHeader title="QUEST MANAGEMENT" subtitle="Create and manage student quests" />
              <StatGrid items={[
                { label: 'Total Quests', value: adminQuests.length },
                { label: 'Active', value: adminQuests.filter(q => q.active).length },
                { label: 'Daily', value: adminQuests.filter(q => q.type === 'daily').length },
                { label: 'Weekly', value: adminQuests.filter(q => q.type === 'weekly').length },
              ]} columns={4} />
              <div style={{ marginBottom: 16 }}>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  setEditQuest({ title: '', description: '', type: 'daily', target_type: 'test', target_count: 1, xp_reward: 50, active: true })
                  setQuestModal(true)
                }}>+ New Quest</button>
              </div>
              {['daily', 'weekly', 'special'].map(type => {
                const group = adminQuests.filter(q => q.type === type)
                if (!group.length) return null
                return (
                  <div key={type}>
                    <SectionLabel>{type.charAt(0).toUpperCase() + type.slice(1)} Quests</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
                      {group.map(q => (
                        <div key={q.id} className="card" style={{ padding: 16, opacity: q.active ? 1 : 0.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{q.title}</div>
                            <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--warn)' }}>+{q.xp_reward}</span>
                          </div>
                          {q.description && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>{q.description}</div>}
                          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 12 }}>
                            Target: {q.target_type} x{q.target_count} | {q.active ? 'Active' : 'Inactive'}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-sm" onClick={() => { setEditQuest(q); setQuestModal(true) }}>Edit</button>
                            <button className="btn btn-sm" onClick={() => toggleActive(q)}>{q.active ? 'Disable' : 'Enable'}</button>
                            <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteQuest(q.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {adminQuests.length === 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center', marginTop: 40 }}>
                  No quests yet. Create one to get started.
                </div>
              )}
              <Modal open={questModal} onClose={() => setQuestModal(false)} title={editQuest.id ? 'Edit Quest' : 'New Quest'}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label className="label">Title</label>
                    <input className="input" value={editQuest.title || ''} onChange={e => setEditQuest(p => ({ ...p, title: e.target.value }))} placeholder="Complete 3 tests" />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <input className="input" value={editQuest.description || ''} onChange={e => setEditQuest(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Type</label>
                      <select className="input" value={editQuest.type || 'daily'} onChange={e => setEditQuest(p => ({ ...p, type: e.target.value as Quest['type'] }))}>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="special">Special</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Target Type</label>
                      <select className="input" value={editQuest.target_type || 'test'} onChange={e => setEditQuest(p => ({ ...p, target_type: e.target.value }))}>
                        <option value="test">Tests</option>
                        <option value="course">Courses</option>
                        <option value="streak">Streaks</option>
                        <option value="social">Social</option>
                        <option value="xp">XP</option>
                        <option value="achievement">Achievement</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label className="label">Target Count</label>
                      <input className="input" type="number" min={1} value={editQuest.target_count || 1} onChange={e => setEditQuest(p => ({ ...p, target_count: parseInt(e.target.value) || 1 }))} />
                    </div>
                    <div>
                      <label className="label">XP Reward</label>
                      <input className="input" type="number" min={1} value={editQuest.xp_reward || 50} onChange={e => setEditQuest(p => ({ ...p, xp_reward: parseInt(e.target.value) || 50 }))} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editQuest.active ?? true} onChange={e => setEditQuest(p => ({ ...p, active: e.target.checked }))} />
                    Active
                  </label>
                  <button className="btn btn-primary" onClick={saveQuest}>{editQuest.id ? 'Update Quest' : 'Create Quest'}</button>
                </div>
              </Modal>
            </>
          )
        })()}

        {/* CALENDAR */}
        {tab === 'calendar' && (
          <CalendarModule tests={tests} assignments={assignments} timetable={[]} />
        )}

        {/* BATCH OPERATIONS */}
        {tab === 'batch' && (
          <AdminBatchModule users={users} onUsersChange={setUsers} />
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (() => {
          const saveSetting = async (key: string, value: any) => {
            await supabase.from('platform_settings').upsert({ key, value }, { onConflict: 'key' })
            setPlatformSettings(prev => ({ ...prev, [key]: value }))
          }
          return (
            <>
              <PageHeader title="PLATFORM SETTINGS" subtitle="Configure platform behavior" />
              <div className="fade-up-2" style={{ maxWidth: 600 }}>
                <div className="card" style={{ marginBottom: 16 }}>
                  <SectionLabel>Platform Name</SectionLabel>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="input"
                      value={platformSettings.platform_name || 'QGX'}
                      onChange={e => setPlatformSettings(prev => ({ ...prev, platform_name: e.target.value }))}
                    />
                    <button className="btn btn-primary btn-sm" onClick={() => saveSetting('platform_name', platformSettings.platform_name || 'QGX')}>Save</button>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <SectionLabel>Announcement Defaults</SectionLabel>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
                    <input type="checkbox" checked={platformSettings.announce_pinned_default || false}
                      onChange={e => saveSetting('announce_pinned_default', e.target.checked)} />
                    Pin new announcements by default
                  </label>
                  <div>
                    <label className="label" style={{ fontSize: 11 }}>Default target</label>
                    <select className="input" style={{ width: 'auto' }} value={platformSettings.announce_target_default || 'all'}
                      onChange={e => saveSetting('announce_target_default', e.target.value)}>
                      <option value="all">All</option>
                      <option value="teachers">Teachers</option>
                      <option value="students">Students</option>
                    </select>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <SectionLabel>Feature Flags</SectionLabel>
                  {['forums', 'xp_engine', 'attendance', 'grades'].map(feature => (
                    <label key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer', marginBottom: 8, textTransform: 'capitalize' }}>
                      <input type="checkbox" checked={platformSettings[`feature_${feature}`] !== false}
                        onChange={e => saveSetting(`feature_${feature}`, e.target.checked)} />
                      {feature.replace('_', ' ')}
                    </label>
                  ))}
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <SectionLabel>Double XP Duration</SectionLabel>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input"
                      type="number"
                      min={5}
                      max={120}
                      value={Math.round((platformSettings.double_xp_duration || 3600000) / 60000)}
                      onChange={e => setPlatformSettings(prev => ({ ...prev, double_xp_duration: parseInt(e.target.value) * 60000 }))}
                      style={{ width: 80 }}
                    />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>minutes</span>
                    <button className="btn btn-primary btn-sm" onClick={() => saveSetting('double_xp_duration', platformSettings.double_xp_duration || 3600000)}>Save</button>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <SectionLabel>Timetable Check-in XP</SectionLabel>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8 }}>XP students earn for checking in to a live class.</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={500}
                      value={platformSettings.checkin_xp ?? 10}
                      onChange={e => setPlatformSettings(prev => ({ ...prev, checkin_xp: parseInt(e.target.value) || 0 }))}
                      style={{ width: 80 }}
                    />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>XP per check-in</span>
                    <button className="btn btn-primary btn-sm" onClick={() => saveSetting('checkin_xp', platformSettings.checkin_xp ?? 10)}>Save</button>
                  </div>
                </div>

                {/* XP Leveling System */}
                {(() => {
                  const levels: XPLevel[] = platformSettings.xp_levels || DEFAULT_XP_LEVELS
                  const updateLevel = (idx: number, field: keyof XPLevel, val: string | number) => {
                    const updated = levels.map((l, i) => i === idx ? { ...l, [field]: val } : l)
                    setPlatformSettings(prev => ({ ...prev, xp_levels: updated }))
                  }
                  const addLevel = () => {
                    const maxLvl = levels.length ? Math.max(...levels.map(l => l.level)) : 0
                    const maxXP = levels.length ? Math.max(...levels.map(l => l.xp)) : 0
                    const updated = [...levels, { level: maxLvl + 1, name: `LEVEL ${maxLvl + 1}`, xp: maxXP + 1000, icon: '★', color: '#6b7280' }]
                    setPlatformSettings(prev => ({ ...prev, xp_levels: updated }))
                  }
                  const removeLevel = (idx: number) => {
                    if (levels.length <= 2) { toast('Need at least 2 levels', 'error'); return }
                    const updated = levels.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 }))
                    setPlatformSettings(prev => ({ ...prev, xp_levels: updated }))
                  }
                  const saveXPLevels = () => {
                    const sorted = [...levels].sort((a, b) => a.xp - b.xp).map((l, i) => ({ ...l, level: i + 1 }))
                    for (let i = 1; i < sorted.length; i++) {
                      if (sorted[i].xp <= sorted[i - 1].xp) { toast('Each level must require more XP than the previous one', 'error'); return }
                    }
                    if (sorted[0].xp !== 0) { toast('First level must start at 0 XP', 'error'); return }
                    saveSetting('xp_levels', sorted)
                    setPlatformSettings(prev => ({ ...prev, xp_levels: sorted }))
                    toast('XP levels saved!', 'success')
                  }
                  return (
                    <div className="card" style={{ marginBottom: 16 }}>
                      <SectionLabel>XP Leveling System</SectionLabel>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 12 }}>
                        Configure XP thresholds for each level. First level must start at 0 XP.
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span style={{ width: 32 }}>Lvl</span>
                        <span style={{ width: 28 }}>Icon</span>
                        <span style={{ flex: 1 }}>Name</span>
                        <span style={{ width: 80 }}>XP Required</span>
                        <span style={{ width: 64 }}>Color</span>
                        <span style={{ width: 28 }} />
                      </div>
                      {levels.map((l, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, width: 32, color: l.color, fontWeight: 700 }}>{l.level}</span>
                          <input className="input" value={l.icon} onChange={e => updateLevel(idx, 'icon', e.target.value)} style={{ width: 28, padding: '4px 2px', textAlign: 'center', fontSize: 16 }} maxLength={2} />
                          <input className="input" value={l.name} onChange={e => updateLevel(idx, 'name', e.target.value.toUpperCase())} style={{ flex: 1, fontSize: 11 }} maxLength={20} />
                          <input className="input" type="number" min={0} value={l.xp} onChange={e => updateLevel(idx, 'xp', parseInt(e.target.value) || 0)} style={{ width: 80, fontSize: 11 }} />
                          <input type="color" value={l.color} onChange={e => updateLevel(idx, 'color', e.target.value)} style={{ width: 28, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} />
                          <button onClick={() => removeLevel(idx)} style={{ width: 28, height: 28, border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', borderRadius: 4, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="btn btn-sm" onClick={addLevel} style={{ fontSize: 11 }}>+ Add Level</button>
                        <button className="btn btn-sm" onClick={() => { setPlatformSettings(prev => ({ ...prev, xp_levels: DEFAULT_XP_LEVELS })); toast('Reset to defaults', 'info') }} style={{ fontSize: 11 }}>Reset Defaults</button>
                        <button className="btn btn-primary btn-sm" onClick={saveXPLevels}>Save Levels</button>
                      </div>
                      {/* Preview */}
                      <div style={{ marginTop: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'rgba(139,92,246,.04)' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {levels.map(l => (
                            <div key={l.level} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, border: `1px solid ${l.color}`, background: `${l.color}18`, fontFamily: 'var(--mono)', fontSize: 11 }}>
                              <span>{l.icon}</span>
                              <span style={{ color: l.color, fontWeight: 700 }}>Lv.{l.level}</span>
                              <span style={{ color: 'var(--fg-dim)' }}>{l.name}</span>
                              <span style={{ color: 'var(--fg-dim)', fontSize: 9 }}>{l.xp.toLocaleString()} XP</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                <div className="card" style={{ marginBottom: 16 }}>
                  <SectionLabel>Grade Weights (Report Cards)</SectionLabel>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 12 }}>Must total 100%</div>
                  {[
                    { key: 'tests_weight', label: 'Tests' },
                    { key: 'assignments_weight', label: 'Assignments' },
                    { key: 'attendance_weight', label: 'Attendance' },
                    { key: 'participation_weight', label: 'Participation' },
                  ].map(w => (
                    <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, width: 100 }}>{w.label}</span>
                      <input className="input" type="number" min={0} max={100} style={{ width: 70 }}
                        id={`gw-${w.key}`}
                        defaultValue={platformSettings[`gw_${w.key}`] ?? (w.key === 'tests_weight' ? 40 : w.key === 'assignments_weight' ? 30 : w.key === 'attendance_weight' ? 10 : 20)} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>%</span>
                    </div>
                  ))}
                  <button className="btn btn-primary btn-sm" onClick={async () => {
                    const vals = ['tests_weight', 'assignments_weight', 'attendance_weight', 'participation_weight'].map(k =>
                      parseInt((document.getElementById(`gw-${k}`) as HTMLInputElement).value) || 0
                    )
                    if (vals.reduce((a, b) => a + b, 0) !== 100) { toast('Weights must total 100%', 'error'); return }
                    try {
                      const keys = ['tests_weight', 'assignments_weight', 'attendance_weight', 'participation_weight']
                      for (let i = 0; i < keys.length; i++) {
                        await saveSetting(`gw_${keys[i]}`, vals[i])
                      }
                      // Also save to grade_weights table for report card module
                      await supabase.from('grade_weights').upsert({
                        id: 'default',
                        tests_weight: vals[0], assignments_weight: vals[1],
                        attendance_weight: vals[2], participation_weight: vals[3],
                      }, { onConflict: 'id' })
                    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to save weights', 'error') }
                  }}>Save Weights</button>
                </div>
              </div>
            </>
          )
        })()}

        {tab === 'profile' && (
          <ProfileTab profile={profile} onUpdate={p => setProfile(p)} />
        )}
      </div>
    </DashboardLayout>
  )
}
