'use client'
import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { AdminBatchModule } from '@/components/modules/BatchModule'
import { CalendarModule } from '@/components/modules/CalendarModule'
import { ForumModule } from '@/components/modules/ForumModule'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'

function AdminDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [createUserModal, setCreateUserModal] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'student' })
  const [createUserLoading, setCreateUserLoading] = useState(false)
  const [announcePosting, setAnnouncePosting] = useState(false)
  const [userSaving, setUserSaving] = useState(false)
  const [questSaving, setQuestSaving] = useState(false)
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | Profile['role']>('all')
  const [xpFilter, setXpFilter] = useState<'all' | '0-99' | '100-999' | '1000+'>('all')
  const [joinFilter, setJoinFilter] = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [userSort, setUserSort] = useState<'latest' | 'oldest' | 'xp_desc' | 'xp_asc' | 'name_az'>('latest')
  const [activitySearch, setActivitySearch] = useState('')
  const [activityTypeFilter, setActivityTypeFilter] = useState('all')
  const handledDeepLink = useRef(false)

  const fetchAnnouncements = useCallback(async () => {
    try {
      const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false })
      if (data) setAnnouncements(data as Announcement[])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load announcements'
      toast(msg, 'error')
    }
  }, [toast])

  const fetchAll = useCallback(async () => {
    fetchAnnouncements()
    try {
      const results = await Promise.allSettled([
        supabase.from('profiles').select('*').order('joined', { ascending: false }).limit(200),
        supabase.from('tests').select('*').order('created_at', { ascending: false }),
        supabase.from('platform_settings').select('*').eq('key', 'double_xp').single(),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(500),
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
  }, [fetchAnnouncements])

  useEffect(() => {
    if (handledDeepLink.current) return
    const requestedTab = searchParams.get('tab')
    const openCreateUser = searchParams.get('createUser') === '1'
    const allowedTabs = new Set(['home', 'users', 'announcements', 'tests', 'courses', 'assignments', 'attendance', 'forums', 'analytics', 'activity', 'settings', 'batch', 'calendar', 'profile', 'grades', 'quests'])
    if (requestedTab && allowedTabs.has(requestedTab)) {
      setTab(requestedTab)
    }
    if (openCreateUser) {
      setTab('users')
      setCreateUserModal(true)
    }
    handledDeepLink.current = true
  }, [searchParams])

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
  }, [fetchAll, fetchAnnouncements, router])

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

  useEffect(() => {
    setUserPage(0)
  }, [debouncedSearch, userRoleFilter, xpFilter, joinFilter, userSort])

  useEffect(() => {
    setLogPage(0)
  }, [activitySearch, activityTypeFilter])

  const postAnnouncement = async () => {
    if (announcePosting) return
    if (!newAnnounce.title || !newAnnounce.body || !profile) return
    const validTargets = ['all', 'teachers', 'students', 'parents']
    if (!validTargets.includes(newAnnounce.target)) { toast('Invalid target audience', 'error'); return }
    setAnnouncePosting(true)
    try {
      const { error: insertErr } = await supabase.from('announcements').insert({ ...newAnnounce, author_id: profile.id, author_name: profile.name, role: 'admin' })
      if (insertErr) { toast(`Failed to post: ${insertErr.message}`, 'error'); return }
      // Notify only targeted users
      const targetIds = users.filter(u => {
        if (u.id === profile.id) return false
        if (newAnnounce.target === 'students') return u.role === 'student'
        if (newAnnounce.target === 'teachers') return u.role === 'teacher'
        if (newAnnounce.target === 'parents') return u.role === 'parent'
        return true // 'all'
      }).map(u => u.id)
      const { error: batchErr } = await pushNotificationBatch(targetIds, `◆ Admin announcement: ${newAnnounce.title}`, 'announcement')
      if (batchErr) { /* non-blocking dispatch helper failed */ }
      await logActivity(`Admin posted announcement: ${newAnnounce.title}`, 'announcement')
      setNewAnnounce({ title: '', body: '', target: 'all', pinned: false })
      setAnnounceModal(false)
      await fetchAnnouncements()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to post announcement', 'error')
    } finally {
      setAnnouncePosting(false)
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

  const createUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.role) { toast('All fields required', 'error'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newUser.email)) { toast('Invalid email format', 'error'); return }
    setCreateUserLoading(true)
    try {
      const res = await fetch('/api/batch-create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const data = await res.json()
      if (!res.ok) { toast(`Create failed: ${data.error || 'Unknown error'}`, 'error'); setCreateUserLoading(false); return }
      toast(`User created: ${newUser.email}`, 'success')
      setNewUser({ name: '', email: '', role: 'student' })
      setCreateUserModal(false)
      fetchAll()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create user', 'error')
    } finally {
      setCreateUserLoading(false)
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
    if (userSaving) return
    if (!userModal) return
    setUserSaving(true)
    try {
      const { name, phone, bio, role } = editUser
      if (role === 'admin' && userModal.role !== 'admin') {
        const ok = confirm('Grant admin privileges to this user? This gives full platform access.')
        if (!ok) return
      }
      if (userModal.id === profile?.id && role && role !== profile.role) {
        toast('You cannot change your own role from this panel.', 'error')
        return
      }
      const { error } = await supabase.from('profiles').update({ name, phone, bio, role }).eq('id', userModal.id)
      if (error) { toast(`Save failed: ${error.message}`, 'error'); return }
      setUsers(u => u.map(x => x.id === userModal.id ? { ...x, name: name ?? x.name, phone: phone ?? x.phone, bio: bio ?? x.bio, role: (role as Profile['role']) ?? x.role } : x))
      setUserModal(null)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save user', 'error')
    } finally {
      setUserSaving(false)
    }
  }

  const activateDoubleXP = async () => {
    try {
      const val = { active: true, ends_at: Date.now() + (platformSettings.double_xp_duration || DOUBLE_XP_DURATION_MS) }
      await supabase.from('platform_settings').upsert({ key: 'double_xp', value: val }, { onConflict: 'key' })
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
      setDoubleXP(val)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to deactivate Double XP', 'error')
    }
  }

  const students = users.filter(u => u.role === 'student')
  const teachers = users.filter(u => u.role === 'teacher')

  const userRoleCounts: Record<'all' | Profile['role'], number> = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    teacher: users.filter(u => u.role === 'teacher').length,
    student: users.filter(u => u.role === 'student').length,
    parent: users.filter(u => u.role === 'parent').length,
  }

  const daysSinceJoined = (joined?: string) => {
    if (!joined) return Number.POSITIVE_INFINITY
    const ts = Date.parse(joined)
    if (Number.isNaN(ts)) return Number.POSITIVE_INFINITY
    return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24))
  }

  const filteredUsers = users
    .filter(u => {
      const q = debouncedSearch.trim().toLowerCase()
      if (!q) return true
      return (u.name || '').toLowerCase().includes(q)
        || (u.email || '').toLowerCase().includes(q)
        || (u.qgx_id || '').toLowerCase().includes(q)
        || (u.role || '').toLowerCase().includes(q)
    })
    .filter(u => userRoleFilter === 'all' || u.role === userRoleFilter)
    .filter(u => {
      const xp = Number(u.xp || 0)
      if (xpFilter === 'all') return true
      if (xpFilter === '0-99') return xp < 100
      if (xpFilter === '100-999') return xp >= 100 && xp < 1000
      return xp >= 1000
    })
    .filter(u => {
      if (joinFilter === 'all') return true
      const days = daysSinceJoined(u.joined)
      if (joinFilter === '7d') return days <= 7
      if (joinFilter === '30d') return days <= 30
      return days <= 90
    })
    .sort((a, b) => {
      if (userSort === 'xp_desc') return Number(b.xp || 0) - Number(a.xp || 0)
      if (userSort === 'xp_asc') return Number(a.xp || 0) - Number(b.xp || 0)
      if (userSort === 'name_az') return (a.name || '').localeCompare(b.name || '')
      const da = Date.parse(a.joined || '') || 0
      const db = Date.parse(b.joined || '') || 0
      return userSort === 'oldest' ? da - db : db - da
    })
  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const pagedUsers = filteredUsers.slice(userPage * PAGE_SIZE, (userPage + 1) * PAGE_SIZE)

  const totalLogPages = Math.max(1, Math.ceil(activityLog.length / PAGE_SIZE))
  const pagedLogs = activityLog.slice(logPage * PAGE_SIZE, (logPage + 1) * PAGE_SIZE)
  const activityTypes = Array.from(new Set(activityLog.map(a => a.type).filter(Boolean))).sort()
  const filteredActivityLog = activityLog.filter(a => {
    const matchesType = activityTypeFilter === 'all' || a.type === activityTypeFilter
    if (!matchesType) return false
    const q = activitySearch.trim().toLowerCase()
    if (!q) return true
    const actor = users.find(u => u.id === a.actor_id)
    const actorName = actor?.name || ''
    const metadataText = a.metadata ? JSON.stringify(a.metadata).toLowerCase() : ''
    return a.message.toLowerCase().includes(q)
      || a.type.toLowerCase().includes(q)
      || actorName.toLowerCase().includes(q)
      || metadataText.includes(q)
  })
  const totalFilteredLogPages = Math.max(1, Math.ceil(filteredActivityLog.length / PAGE_SIZE))
  const pagedFilteredLogs = filteredActivityLog.slice(logPage * PAGE_SIZE, (logPage + 1) * PAGE_SIZE)
  const avgScore = allAttempts.length
    ? Math.round(allAttempts.reduce((sum, a) => sum + (a.percent || 0), 0) / allAttempts.length)
    : 0

  const formatLogDate = (createdAt?: string) => createdAt ? createdAt.slice(0, 16).replace('T', ' ') : 'unknown'
  const resolveActorName = (actorId?: string | null) => {
    if (!actorId) return 'System'
    const actor = users.find(u => u.id === actorId)
    return actor?.name || `${actorId.slice(0, 8)}...`
  }
  const getActivityIcon = (type: string) => {
    if (type.includes('announcement')) return 'bell'
    if (type.includes('delete') || type.includes('remove')) return 'trash'
    if (type.includes('create') || type.includes('register')) return 'plus'
    if (type.includes('attempt') || type.includes('test')) return 'test'
    if (type.includes('course')) return 'book'
    if (type.includes('attendance')) return 'check'
    if (type.includes('batch')) return 'users'
    return 'clock'
  }

  const navItems = [
    { id: 'home', label: 'Overview', icon: 'home' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'announcements', label: 'Announcements', icon: 'bell' },
    { id: 'tests', label: 'Tests', icon: 'test' },
    { id: 'courses', label: 'Courses', icon: 'book' },
    { id: 'assignments', label: 'Assignments', icon: 'task' },
    { id: 'attendance', label: 'Attendance', icon: 'check' },
    { id: 'forums', label: 'Forums', icon: 'chat' },
    { id: 'analytics', label: 'Analytics', icon: 'chart' },
    { id: 'activity', label: 'Activity Log', icon: 'clock' },
    { id: 'grades', label: 'Grades', icon: 'chart' },
    { id: 'quests', label: 'Quests', icon: 'star' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
    { id: 'batch', label: 'Batch Create', icon: 'plus' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ]

  if (!profile) return <DashboardSkeleton label="Loading admin dashboard..." />

  return (
    <DashboardLayout profile={profile} navItems={navItems} activeTab={tab} onTabChange={setTab}>
      {/* Announce Modal */}
      <Modal open={announceModal} onClose={() => setAnnounceModal(false)} title="New Announcement">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            postAnnouncement()
          }}
        >
          <div style={{ marginBottom: 14 }}><label className="label">Title</label><input className="input" required value={newAnnounce.title} onChange={e => setNewAnnounce(a => ({ ...a, title: e.target.value }))} /></div>
          <div style={{ marginBottom: 14 }}><label className="label">Message</label><textarea className="input" rows={4} required value={newAnnounce.body} onChange={e => setNewAnnounce(a => ({ ...a, body: e.target.value }))} /></div>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Target</label>
            <select className="input" value={newAnnounce.target} onChange={e => setNewAnnounce(a => ({ ...a, target: e.target.value }))}>
              <option value="all">All</option><option value="teachers">Teachers</option><option value="students">Students</option><option value="parents">Parents</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer', marginBottom: 16 }}>
            <input type="checkbox" checked={newAnnounce.pinned} onChange={e => setNewAnnounce(a => ({ ...a, pinned: e.target.checked }))} /> Pin announcement
          </label>
          <div className="modal-form-actions">
            <button className="btn btn-primary" type="submit" disabled={announcePosting}>{announcePosting ? <span className="spinner" /> : 'Post'}</button>
            <button className="btn" type="button" onClick={() => setAnnounceModal(false)} disabled={announcePosting}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Create User Modal */}
      <Modal open={createUserModal} onClose={() => setCreateUserModal(false)} title="Create User">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createUser()
          }}
        >
          <div style={{ marginBottom: 14 }}><label className="label">Name</label><input className="input" required value={newUser.name} onChange={e => setNewUser(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoComplete="name" /></div>
          <div style={{ marginBottom: 14 }}><label className="label">Email</label><input className="input" required type="email" value={newUser.email} onChange={e => setNewUser(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" autoComplete="email" /></div>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Role</label>
            <select className="input" value={newUser.role} onChange={e => setNewUser(f => ({ ...f, role: e.target.value }))}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="modal-form-actions">
            <button className="btn btn-primary" type="submit" disabled={createUserLoading}>{createUserLoading ? <span className="spinner" /> : 'Create'}</button>
            <button className="btn" type="button" onClick={() => setCreateUserModal(false)} disabled={createUserLoading}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* User Edit Modal */}
      <Modal open={!!userModal} onClose={() => setUserModal(null)} title="Edit User">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveUser()
          }}
        >
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
          <div className="modal-form-actions">
            <button className="btn btn-primary" type="submit" disabled={userSaving}>{userSaving ? <span className="spinner" /> : 'Save'}</button>
            <button className="btn" type="button" onClick={() => setUserModal(null)} disabled={userSaving}>Cancel</button>
          </div>
        </form>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }} className="fade-up-2">
              <div className="search-wrap">
                <Icon name="search" size={13} />
                <input className="search-input" placeholder="Search users..." value={search} onChange={e => {
                  setSearch(e.target.value)
                  if (searchTimer.current) clearTimeout(searchTimer.current)
                  searchTimer.current = setTimeout(() => { setDebouncedSearch(e.target.value); setUserPage(0) }, DEBOUNCE_MS)
                }} />
              </div>
              <button className="btn btn-sm" onClick={() => setCreateUserModal(true)}>
                <Icon name="plus" size={10} /> Create User
              </button>
            </div>
            <div className="fade-up-3" style={{ border: '1px solid var(--border)', padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Role</span>
                {([
                  ['all', 'All'],
                  ['admin', 'Admins'],
                  ['teacher', 'Teachers'],
                  ['student', 'Students'],
                  ['parent', 'Parents'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    className={`btn btn-xs ${userRoleFilter === value ? 'btn-primary' : ''}`}
                    onClick={() => setUserRoleFilter(value)}
                    style={{ gap: 6 }}
                  >
                    {label}
                    <span className="mono" style={{ fontSize: 10, opacity: 0.85 }}>
                      {userRoleCounts[value]}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Sort</span>
                <select className="input" value={userSort} onChange={e => setUserSort(e.target.value as typeof userSort)} style={{ maxWidth: 190, height: 34 }}>
                  <option value="latest">Newest Joined</option>
                  <option value="oldest">Oldest Joined</option>
                  <option value="xp_desc">Highest XP</option>
                  <option value="xp_asc">Lowest XP</option>
                  <option value="name_az">Name A-Z</option>
                </select>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>XP</span>
                <select className="input" value={xpFilter} onChange={e => setXpFilter(e.target.value as typeof xpFilter)} style={{ maxWidth: 150, height: 34 }}>
                  <option value="all">All XP</option>
                  <option value="0-99">0 - 99</option>
                  <option value="100-999">100 - 999</option>
                  <option value="1000+">1000+</option>
                </select>
                <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Joined</span>
                <select className="input" value={joinFilter} onChange={e => setJoinFilter(e.target.value as typeof joinFilter)} style={{ maxWidth: 150, height: 34 }}>
                  <option value="all">Any Time</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
                <button
                  className="btn btn-xs"
                  onClick={() => {
                    setSearch('')
                    setDebouncedSearch('')
                    setUserRoleFilter('all')
                    setXpFilter('all')
                    setJoinFilter('all')
                    setUserSort('latest')
                    setUserPage(0)
                  }}
                >
                  <Icon name="refresh" size={10} /> Reset Filters
                </button>
              </div>
              <div className="mono" style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-dim)' }}>
                Showing {filteredUsers.length} of {users.length} users
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
                          <button className="btn btn-xs" onClick={() => { setEditUser({ name: u.name, phone: u.phone || '', bio: u.bio || '', role: u.role }); setUserModal(u) }}><Icon name="edit" size={10} /></button>
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
                      <div style={{ height: 6, background: 'var(--border)', borderRadius: 0 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warn)' : 'var(--danger)', borderRadius: 0, transition: 'width 0.8s ease' }} />
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
                      <div style={{ height: 6, background: 'var(--border)', borderRadius: 0 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 0, transition: 'width 0.8s ease' }} />
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
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 0 }}>
                    <div style={{ height: '100%', width: `${users.length ? (Number(count)/users.length)*100 : 0}%`, background: String(color), borderRadius: 0, transition: 'width 0.8s ease' }} />
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

        {/* ACTIVITY */}
        {tab === 'activity' && (
          <>
            <PageHeader title="ACTIVITY LOG" subtitle="Platform audit trail with actor and metadata" />

            <div className="fade-up-2" style={{ border: '1px solid var(--border)', padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="search-wrap" style={{ minWidth: 260, flex: 1 }}>
                  <Icon name="search" size={13} />
                  <input
                    className="search-input"
                    placeholder="Search message, type, actor, metadata..."
                    value={activitySearch}
                    onChange={e => setActivitySearch(e.target.value)}
                  />
                </div>
                <select
                  className="input"
                  value={activityTypeFilter}
                  onChange={e => setActivityTypeFilter(e.target.value)}
                  style={{ maxWidth: 220, height: 34 }}
                >
                  <option value="all">All types</option>
                  {activityTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="btn btn-sm" onClick={() => {
                  setActivitySearch('')
                  setActivityTypeFilter('all')
                }}>
                  <Icon name="refresh" size={11} /> Reset
                </button>
                <button className="btn btn-sm" onClick={() => exportCSV(
                  'activity-log-export.csv',
                  ['Date', 'Type', 'Actor', 'Message', 'Metadata'],
                  filteredActivityLog.map(a => [
                    formatLogDate(a.created_at),
                    a.type,
                    resolveActorName(a.actor_id),
                    a.message,
                    a.metadata ? JSON.stringify(a.metadata) : '',
                  ])
                )}>
                  <Icon name="download" size={11} /> Export CSV
                </button>
              </div>
              <div className="mono" style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-dim)' }}>
                Showing {filteredActivityLog.length} of {activityLog.length} logs
              </div>
            </div>

            <div className="fade-up-3" style={{ border: '1px solid var(--border)' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Type</th>
                    <th>Actor</th>
                    <th>Time</th>
                    <th>Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFilteredLogs.map(a => {
                    const hasMetadata = !!(a.metadata && Object.keys(a.metadata).length)
                    return (
                      <tr key={a.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Icon name={getActivityIcon(a.type)} size={12} />
                            <span style={{ fontSize: 12 }}>{a.message}</span>
                          </div>
                        </td>
                        <td><span className="tag">{a.type}</span></td>
                        <td><span className="mono" style={{ fontSize: 11 }}>{resolveActorName(a.actor_id)}</span></td>
                        <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{formatLogDate(a.created_at)}</span></td>
                        <td>
                          {hasMetadata ? (
                            <details>
                              <summary className="mono" style={{ fontSize: 10, cursor: 'pointer' }}>View</summary>
                              <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', maxWidth: 360, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                                {JSON.stringify(a.metadata, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>none</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {pagedFilteredLogs.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>
                  No activity logs match the current filters.
                </div>
              )}
            </div>
            <Pagination page={logPage} totalPages={totalFilteredLogPages} onPageChange={setLogPage} />
          </>
        )}

        {/* QUESTS MANAGEMENT */}
        {tab === 'quests' && (() => {
          const saveQuest = async () => {
            if (questSaving) return
            if (!editQuest.title?.trim()) { toast('Title is required', 'error'); return }
            setQuestSaving(true)
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
            finally { setQuestSaving(false) }
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
                            <button className="btn btn-sm" type="button" disabled={questSaving} onClick={() => { setEditQuest(q); setQuestModal(true) }}>Edit</button>
                            <button className="btn btn-sm" type="button" disabled={questSaving} onClick={() => toggleActive(q)}>{q.active ? 'Disable' : 'Enable'}</button>
                            <button className="btn btn-sm" type="button" style={{ color: 'var(--danger)' }} disabled={questSaving} onClick={() => deleteQuest(q.id)}>Delete</button>
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
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveQuest()
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <div>
                    <label className="label">Title</label>
                    <input className="input" required value={editQuest.title || ''} onChange={e => setEditQuest(p => ({ ...p, title: e.target.value }))} placeholder="Complete 3 tests" />
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
                      <input className="input" type="number" min={1} required value={editQuest.target_count || 1} onChange={e => setEditQuest(p => ({ ...p, target_count: parseInt(e.target.value) || 1 }))} />
                    </div>
                    <div>
                      <label className="label">XP Reward</label>
                      <input className="input" type="number" min={1} required value={editQuest.xp_reward || 50} onChange={e => setEditQuest(p => ({ ...p, xp_reward: parseInt(e.target.value) || 50 }))} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editQuest.active ?? true} onChange={e => setEditQuest(p => ({ ...p, active: e.target.checked }))} />
                    Active
                  </label>
                  <div className="modal-form-actions">
                    <button className="btn btn-primary" type="submit" disabled={questSaving}>{questSaving ? <span className="spinner" /> : (editQuest.id ? 'Update Quest' : 'Create Quest')}</button>
                    <button className="btn" type="button" onClick={() => setQuestModal(false)} disabled={questSaving}>Cancel</button>
                  </div>
                </form>
              </Modal>
            </>
          )
        })()}

        {/* CALENDAR */}
        {tab === 'calendar' && (
          <CalendarModule tests={tests} assignments={assignments} timetable={[]} />
        )}

        {/* FORUMS */}
        {tab === 'forums' && (
          <ForumModule profile={profile} />
        )}

        {/* BATCH OPERATIONS */}
        {tab === 'batch' && (
          <AdminBatchModule users={users} onUsersChange={setUsers} />
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (() => {
          const saveSetting = async (key: string, value: any) => {
            const { error } = await supabase.from('platform_settings').upsert({ key, value }, { onConflict: 'key' })
            if (error) { toast(error.message, 'error'); return }
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
                      <option value="parents">Parents</option>
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
                    const updated = [...levels, { level: maxLvl + 1, name: `LEVEL ${maxLvl + 1}`, xp: maxXP + 1000, icon: '*', color: '#6b7280' }]
                    setPlatformSettings(prev => ({ ...prev, xp_levels: updated }))
                  }
                  const removeLevel = (idx: number) => {
                    if (levels.length <= 2) { toast('Need at least 2 levels', 'error'); return }
                    const updated = levels.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 }))
                    setPlatformSettings(prev => ({ ...prev, xp_levels: updated }))
                  }
                  return (
                    <div className="card" style={{ marginBottom: 16 }}>
                      <SectionLabel>XP Levels</SectionLabel>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {levels.map((l, idx) => (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 96px 64px 32px', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>Lv.{l.level}</span>
                            <input className="input" value={l.name} onChange={e => updateLevel(idx, 'name', e.target.value)} />
                            <input className="input" type="number" min={0} value={l.xp} onChange={e => updateLevel(idx, 'xp', parseInt(e.target.value) || 0)} />
                            <input className="input" value={l.icon} onChange={e => updateLevel(idx, 'icon', e.target.value)} />
                            <button className="btn btn-xs btn-danger" onClick={() => removeLevel(idx)} title="Remove level">x</button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <button className="btn btn-sm" onClick={addLevel}><Icon name="plus" size={10} /> Add Level</button>
                          <button className="btn btn-primary btn-sm" onClick={() => saveSetting('xp_levels', levels)}>Save Levels</button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          {levels.map((l, idx) => (
                            <div key={`preview-${idx}`} style={{ border: '1px solid var(--border)', padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
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
                    { key: 'tests_weight', label: 'Tests', fallback: 40 },
                    { key: 'assignments_weight', label: 'Assignments', fallback: 30 },
                    { key: 'attendance_weight', label: 'Attendance', fallback: 10 },
                    { key: 'participation_weight', label: 'Participation', fallback: 20 },
                  ].map(w => (
                    <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, width: 100 }}>{w.label}</span>
                      <input className="input" type="number" min={0} max={100} style={{ width: 70 }}
                        value={platformSettings[`gw_${w.key}`] ?? w.fallback}
                        onChange={e => setPlatformSettings(prev => ({ ...prev, [`gw_${w.key}`]: parseInt(e.target.value) || 0 }))} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>%</span>
                    </div>
                  ))}
                  <button className="btn btn-primary btn-sm" onClick={async () => {
                    const keys = ['tests_weight', 'assignments_weight', 'attendance_weight', 'participation_weight']
                    const fallbacks = [40, 30, 10, 20]
                    const vals = keys.map((k, i) => platformSettings[`gw_${k}`] ?? fallbacks[i])
                    if (vals.reduce((a, b) => a + b, 0) !== 100) { toast('Weights must total 100%', 'error'); return }
                    try {
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

export default function AdminDashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton label="Loading admin dashboard..." />}>
      <AdminDashboardContent />
    </Suspense>
  )
}
