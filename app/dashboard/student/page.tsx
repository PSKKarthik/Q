'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Test, Attempt, Course, Assignment, Submission, TimetableSlot, Announcement } from '@/types'
import { getLevel, DEFAULT_XP_LEVELS, type XPLevel } from '@/lib/utils'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { AnnouncementCard } from '@/components/ui/AnnouncementCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ProfileTab } from '@/components/ui/ProfileTab'
import { ForumModule } from '@/components/modules/ForumModule'
import { StudentTestModule } from '@/components/modules/TestModule'
import { TimetableModule } from '@/components/modules/TimetableModule'
import { XPEngine } from '@/components/modules/XPEngine'
import { StudentCourseModule } from '@/components/modules/CourseModule'
import { StudentAssignmentModule } from '@/components/modules/AssignmentModule'
import { StudentAttendanceModule } from '@/components/modules/AttendanceModule'
import { StudentGradesModule } from '@/components/modules/GradesModule'
import { MessagingModule } from '@/components/modules/MessagingModule'
import { ReportCardModule } from '@/components/modules/ReportCardModule'
import { StudentAnalyticsModule } from '@/components/modules/StudentAnalyticsModule'
import { CertificateModule } from '@/components/modules/CertificateModule'
import { CalendarModule } from '@/components/modules/CalendarModule'
import { AiTutorModule } from '@/components/modules/AiTutorModule'
import { LiveClassModule } from '@/components/modules/LiveClassModule'
import { QuestModule } from '@/components/modules/QuestModule'
import { CollaborationModule } from '@/components/modules/CollaborationModule'
import { CodePlaygroundModule } from '@/components/modules/CodePlaygroundModule'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'

export default function StudentDashboard() {
  const router = useRouter()
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [tab, setTab]                 = useState('home')
  const [tests, setTests]             = useState<Test[]>([])
  const [attempts, setAttempts]       = useState<Attempt[]>([])
  const [allCourses, setAllCourses]   = useState<Course[]>([])
  const [enrolledIds, setEnrolledIds] = useState<string[]>([])
  const [assignments, setAssignments] = useState<(Assignment & { submissions?: Submission[] })[]>([])
  const [timetable, setTimetable]     = useState<TimetableSlot[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [allStudents, setAllStudents] = useState<Profile[]>([])
  const [allTeachers, setAllTeachers] = useState<Profile[]>([])
  const [peerIds, setPeerIds]         = useState<string[]>([])
  const [doubleXP, setDoubleXP]       = useState<{ active: boolean; ends_at: number | null }>({ active: false, ends_at: null })
  const [xpLevels, setXpLevels]       = useState<XPLevel[]>(DEFAULT_XP_LEVELS)
  const [checkinXP, setCheckinXP]     = useState(10)
  const [isExamMode, setIsExamMode]   = useState(false)
  const channelRefs = useRef<any[]>([])
  const [isOffline, setIsOffline]   = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => {
          if (!p) return
          if ((p as Profile).role !== 'student') { router.push(`/dashboard/${(p as Profile).role}`); return }
          setProfile(p as Profile); fetchAll(p as Profile)
        })
    }).catch(() => { router.push('/login') })

    // Listen for auth state changes (logout in another tab, session expiry)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    // Offline detection
    const goOffline = () => setIsOffline(true)
    const goOnline  = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      channelRefs.current.forEach(ch => supabase.removeChannel(ch))
      subscription.unsubscribe()
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [router])

  const fetchAll = async (p: Profile) => {
    const { data: enrollData } = await supabase.from('enrollments').select('course_id').eq('student_id', p.id)
    const eIds = enrollData?.map((e: any) => e.course_id) || []
    setEnrolledIds(eIds)

    try {
      const results = await Promise.allSettled([
        supabase.from('tests').select('id, title, subject, teacher_id, teacher_name, scheduled_date, scheduled_time, duration, status, total_marks, type, anti_cheat, xp_reward, created_at').in('status', ['scheduled','locked']),
        supabase.from('attempts').select('*').eq('student_id', p.id),
        // Always fetch course_files fresh
        supabase.from('courses').select('id, title, subject, description, teacher_id, teacher_name, created_at, status').order('created_at', { ascending: false }),
        supabase.from('assignments').select('*, submissions(*)').order('created_at', { ascending: false }),
        supabase.from('timetable').select('*'),
        supabase.from('announcements').select('*').in('target', ['all','students']).order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'student'),
        supabase.from('profiles').select('*').eq('role', 'teacher'),
        supabase.from('platform_settings').select('*').eq('key', 'double_xp').single(),
        supabase.from('enrollments').select('student_id,course_id').in('course_id', eIds),
      ])
      const allTests = (results[0].status === 'fulfilled' && results[0].value.data) ? results[0].value.data as Test[] : []
      if (results[1].status === 'fulfilled' && results[1].value.data)  setAttempts(results[1].value.data as Attempt[])
      const loadedCourses = (results[2].status === 'fulfilled' && results[2].value.data) ? results[2].value.data as Course[] : []
      if (loadedCourses.length) setAllCourses(loadedCourses)
      if (results[3].status === 'fulfilled' && results[3].value.data)  setAssignments(results[3].value.data)
      if (results[4].status === 'fulfilled' && results[4].value.data)  setTimetable(results[4].value.data)
      if (results[5].status === 'fulfilled' && results[5].value.data)  setAnnouncements(results[5].value.data)
      if (results[6].status === 'fulfilled' && results[6].value.data)  setAllStudents(results[6].value.data as Profile[])
      if (results[7].status === 'fulfilled' && results[7].value.data)  setAllTeachers(results[7].value.data as Profile[])
      if (results[8].status === 'fulfilled' && results[8].value.data)  setDoubleXP(results[8].value.data.value)
      if (results[9].status === 'fulfilled' && results[9].value.data) {
        const peers = new Set<string>()
        ;(results[9].value.data as { student_id: string }[]).forEach(r => peers.add(r.student_id))
        peers.delete(p.id)
        setPeerIds(Array.from(peers))
      }

      const enrolledCourses = loadedCourses.filter(c => eIds.includes(c.id))
      const allowedSubjects = new Set(enrolledCourses.map(c => c.subject).filter(Boolean))
      const allowedTeacherIds = new Set(enrolledCourses.map(c => c.teacher_id).filter(Boolean))
      const filteredTests = allTests.filter(t => allowedSubjects.has(t.subject) || allowedTeacherIds.has(t.teacher_id))
      setTests(filteredTests)

      // Fetch XP levels config
      const { data: xlData } = await supabase.from('platform_settings').select('*').eq('key', 'xp_levels').single()
      if (xlData?.value && Array.isArray(xlData.value) && xlData.value.length >= 2) setXpLevels(xlData.value)
      const { data: cxData } = await supabase.from('platform_settings').select('*').eq('key', 'checkin_xp').single()
      if (cxData?.value !== undefined && cxData.value !== null) setCheckinXP(Number(cxData.value) || 10)
    } catch {
      // fetchAll failed — non-fatal, UI shows empty state
    }

    channelRefs.current.forEach(ch => supabase.removeChannel(ch))
    channelRefs.current = []

    const ch1 = supabase.channel(`student-ann-${Date.now()}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'announcements' },
        (payload) => setAnnouncements(prev => [payload.new as Announcement, ...prev]))
      .subscribe()

    const ch2 = supabase.channel(`student-leaderboard-${p.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'role=eq.student' }, () => {
        supabase.from('profiles').select('*').eq('role', 'student').then(({ data }) => {
          if (data) setAllStudents(data as Profile[])
        })
      })
      .subscribe()

    channelRefs.current = [ch1, ch2]
  }

  // Forum CRUD now handled by ForumModule component

  // Course operations now handled by StudentCourseModule
  // Assignment operations now handled by StudentAssignmentModule
  const navItems = [
    { id:'home',        label:'Overview',    icon:'home'     },
    { section:'Learning' },
    { id:'tests',       label:'Tests',       icon:'test'     },
    { id:'courses',     label:'Courses',     icon:'book'     },
    { id:'assignments', label:'Assignments', icon:'task'     },
    { id:'attendance',  label:'Attendance',  icon:'check'    },
    { id:'grades',      label:'Grades',      icon:'star'     },
    { id:'timetable',   label:'Timetable',   icon:'clock'    },
    { id:'xp',          label:'XP Hub',      icon:'zap'      },
    { id:'forums',      label:'Forums',      icon:'chat'     },
    { id:'calendar',    label:'Calendar',    icon:'calendar' },
    { id:'live-classes',label:'Live Classes',icon:'video'    },
    { id:'quests',      label:'Quests',      icon:'trophy'   },
    { id:'collab',      label:'Study Rooms', icon:'users'    },
    { section:'Tools' },
    { id:'ai-tutor',    label:'AI Tutor',    icon:'ai'       },
    { id:'code',        label:'Code Lab',    icon:'code'     },
    { id:'messaging',   label:'Messages',    icon:'mail'     },
    { id:'report-card', label:'Report Card', icon:'download' },
    { id:'my-analytics',label:'My Analytics',icon:'chart'    },
    { id:'certificates',label:'Certificates',icon:'pin'      },
    { section:'Account' },
    { id:'profile',     label:'My Profile',  icon:'user'     },
  ]

  if (!profile) return <DashboardSkeleton label="Loading student dashboard..." />

  const myAttempts = attempts

  return (
    <DashboardLayout profile={profile} navItems={navItems} activeTab={tab} locked={isExamMode} onTabChange={t => { if (!isExamMode) setTab(t) }}>
      {isOffline && (
        <div style={{ background:'var(--danger)', color:'#fff', textAlign:'center', padding:'8px', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'0.1em' }}>
          △ You are offline — some features may not work
        </div>
      )}
      {doubleXP.active && (!doubleXP.ends_at || Date.now() < doubleXP.ends_at) && (
        <div style={{ background:'var(--warn)', color:'#000', textAlign:'center', padding:'8px', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'0.1em' }}>
          ◈ DOUBLE XP HOUR ACTIVE — Earn 2× XP on all tests!
        </div>
      )}

      <div className="page">
        {tab === 'home' && (
          <>
            <PageHeader title="STUDENT DASHBOARD" subtitle={<>Welcome, {profile.name} · <span style={{ color:'var(--fg-dim)' }}>{profile.qgx_id}</span></>} />
            {/* Level Card */}
            {(() => {
              const lvl = getLevel(profile.xp || 0, xpLevels)
              return (
                <div className="fade-up-1" style={{ marginBottom: 20, padding: 20, border: `1px solid ${lvl.color}40`, borderRadius: 12, background: `${lvl.color}08`, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: 40, lineHeight: 1 }}>{lvl.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--display)', fontSize: 24, color: lvl.color, fontWeight: 700 }}>LEVEL {lvl.level}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: lvl.color, letterSpacing: '0.1em' }}>{lvl.name}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
                        {(profile.xp || 0).toLocaleString()} XP{lvl.next ? ` · ${lvl.xpToNext.toLocaleString()} XP to Level ${lvl.next.level}` : ' · MAX LEVEL'}
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${lvl.color}99, ${lvl.color})`, width: `${lvl.progress}%`, transition: 'width 0.5s ease' }} />
                      </div>
                      {lvl.next && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>
                          <span>{lvl.xp.toLocaleString()} XP</span>
                          <span>{Math.round(lvl.progress)}%</span>
                          <span>{lvl.next.icon} {lvl.next.name} — {lvl.next.xp.toLocaleString()} XP</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
            <StatGrid items={[{label:'XP Points',value:profile.xp||0},{label:'Best Score',value:`${profile.score||0}%`},{label:'Tests Done',value:myAttempts.length},{label:'Enrolled',value:enrolledIds.length}]} columns={4} />
            <SectionLabel>Announcements</SectionLabel>
            <div className="fade-up-4">
              {announcements.slice(0,3).map((a:any)=><AnnouncementCard key={a.id} a={a} canDelete={false} />)}
            </div>
          </>
        )}

        {/* ── TESTS ── */}
        {tab === 'tests' && (
          <StudentTestModule
            profile={profile}
            tests={tests}
            attempts={myAttempts}
            doubleXP={doubleXP}
            allStudents={allStudents}
            onExamStateChange={setIsExamMode}
            onAttemptDone={(attempt, xpData) => {
              setProfile(p => p ? { ...p, xp: xpData.newXP, score: attempt.percent } : p)
              setAttempts(prev => [...prev.filter(a => a.test_id !== attempt.test_id), attempt])
            }}
          />
        )}

        {/* ── TIMETABLE ── */}
        {tab === 'timetable' && (
          <TimetableModule profile={profile} timetable={timetable} setTimetable={setTimetable} onProfileUpdate={p => setProfile(p)} checkinXP={checkinXP} />
        )}

        {/* ── COURSES ── */}
        {tab === 'courses' && (
          <StudentCourseModule
            profile={profile}
            courses={allCourses}
            enrolledIds={enrolledIds}
            onEnrolledChange={setEnrolledIds}
            onCoursesChange={setAllCourses}
          />
        )}

        {/* ── ASSIGNMENTS ── */}
        {tab === 'assignments' && (
          <StudentAssignmentModule
            profile={profile}
            assignments={assignments}
            enrolledIds={enrolledIds}
            onAssignmentsChange={setAssignments}
          />
        )}

        {/* ── ATTENDANCE ── */}
        {tab === 'attendance' && (
          <StudentAttendanceModule profile={profile} />
        )}

        {/* ── GRADES ── */}
        {tab === 'grades' && (
          <StudentGradesModule
            profile={profile}
            attempts={myAttempts}
            assignments={assignments}
            allCourses={allCourses}
          />
        )}

        {/* ── XP HUB ── */}
        {tab === 'xp' && (
          <XPEngine
            profile={profile}
            attempts={myAttempts}
            allStudents={allStudents}
            tests={tests.map(t => ({ id: t.id, title: t.title }))}
            doubleXP={doubleXP}
            onProfileUpdate={p => setProfile(p)}
            xpLevels={xpLevels}
          />
        )}

        {/* ── FORUMS ── */}
        {tab === 'forums' && <ForumModule profile={profile} />}

        {/* ── CALENDAR ── */}
        {tab === 'calendar' && (
          <CalendarModule tests={tests} assignments={assignments} timetable={timetable} />
        )}

        {/* ── MESSAGING ── */}
        {tab === 'messaging' && (
          <MessagingModule profile={profile} contacts={[
            ...allStudents.filter(s => peerIds.includes(s.id)),
            ...allTeachers.filter(t => allCourses.some(c => enrolledIds.includes(c.id) && c.teacher_id === t.id)),
          ]} />
        )}

        {/* ── REPORT CARD ── */}
        {tab === 'report-card' && (
          <ReportCardModule profile={profile} />
        )}

        {/* ── MY ANALYTICS ── */}
        {tab === 'my-analytics' && (
          <StudentAnalyticsModule
            profile={profile}
            attempts={myAttempts}
            assignments={assignments}
            courses={allCourses}
            enrolledIds={enrolledIds}
            tests={tests}
          />
        )}

        {/* ── CERTIFICATES ── */}
        {tab === 'certificates' && (
          <CertificateModule profile={profile} courses={allCourses} enrolledIds={enrolledIds} />
        )}

        {/* ── AI TUTOR ── */}
        {tab === 'ai-tutor' && (
          <AiTutorModule profile={profile} courses={allCourses.filter(c => enrolledIds.includes(c.id))} enrolledIds={enrolledIds} />
        )}

        {/* ── LIVE CLASSES ── */}
        {tab === 'live-classes' && (
          <LiveClassModule profile={profile} />
        )}

        {/* ── QUESTS ── */}
        {tab === 'quests' && (
          <QuestModule profile={profile} />
        )}

        {/* ── COLLABORATION ── */}
        {tab === 'collab' && (
          <CollaborationModule profile={profile} />
        )}

        {/* ── CODE PLAYGROUND ── */}
        {tab === 'code' && (
          <CodePlaygroundModule profile={profile} />
        )}

        {/* ── PROFILE ── */}
        {tab === 'profile' && (
          <ProfileTab
            profile={profile}
            onUpdate={p => setProfile(p)}
            extraFields={[['Grade', profile.grade], ['XP', `${profile.xp||0} points`]]}
          />
        )}
      </div>
    </DashboardLayout>
  )
}