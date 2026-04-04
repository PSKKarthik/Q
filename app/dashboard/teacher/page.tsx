'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { pushNotificationBatch, logActivity } from '@/lib/actions'
import { useToast } from '@/lib/toast'
import type { Profile, Test, Course, Assignment, Submission, TimetableSlot, Announcement, Attempt, Quest, QuestProgress } from '@/types'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { Icon } from '@/components/ui/Icon'
import { AnnouncementCard } from '@/components/ui/AnnouncementCard'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ProfileTab } from '@/components/ui/ProfileTab'
import { ForumModule } from '@/components/modules/ForumModule'
import { TeacherTestModule } from '@/components/modules/TeacherTestModule'
import { TimetableModule } from '@/components/modules/TimetableModule'
import { TeacherCourseModule } from '@/components/modules/CourseModule'
import { TeacherAssignmentModule } from '@/components/modules/AssignmentModule'
import { TeacherAttendanceModule } from '@/components/modules/AttendanceModule'
import { TeacherGradesModule } from '@/components/modules/GradesModule'
import { NotificationsModule } from '@/components/modules/NotificationsModule'
import { MessagingModule } from '@/components/modules/MessagingModule'
import { ReportCardModule } from '@/components/modules/ReportCardModule'
import { TeacherBatchGradeModule } from '@/components/modules/BatchModule'
import { CalendarModule } from '@/components/modules/CalendarModule'
import { LiveClassModule } from '@/components/modules/LiveClassModule'
import { PlagiarismModule } from '@/components/modules/PlagiarismModule'
import { MeetingSchedulerModule } from '@/components/modules/MeetingSchedulerModule'
import { PredictiveAlertsModule } from '@/components/modules/PredictiveAlertsModule'

export default function TeacherDashboard() {
  const router = useRouter()
  const { toast } = useToast()
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [tab, setTab]                 = useState('home')
  const [tests, setTests]             = useState<Test[]>([])
  const [courses, setCourses]         = useState<(Course & { _fileCount?: number })[]>([])
  const [assignments, setAssignments] = useState<(Assignment & { submissions?: Submission[] })[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [students, setStudents]       = useState<Profile[]>([])
  const [allAttempts, setAllAttempts] = useState<Attempt[]>([])
  const [timetable, setTimetable]     = useState<TimetableSlot[]>([])
  const [teacherQuests, setTeacherQuests] = useState<Quest[]>([])
  const [questProgress, setQuestProgress] = useState<QuestProgress[]>([])

  const [announceModal, setAnnounceModal] = useState(false)
  const [newAnnounce, setNewAnnounce] = useState({ title:'', body:'', pinned:false })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => {
          if (!p) return
          if ((p as Profile).role !== 'teacher') { router.push(`/dashboard/${(p as Profile).role}`); return }
          setProfile(p as Profile); fetchAll(p as Profile)
        })
    })

    // Listen for auth state changes (logout in another tab, session expiry)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    return () => { subscription.unsubscribe() }
  }, [])

  const fetchAll = async (p: Profile) => {
    try {
      const results = await Promise.allSettled([
        supabase.from('tests').select('*').eq('teacher_id', p.id).order('created_at', { ascending: false }),
        supabase.from('courses').select('id, title, subject, description, teacher_id, teacher_name, created_at, status, course_files(id)').eq('teacher_id', p.id).order('created_at', { ascending: false }),
        supabase.from('assignments').select('*, submissions(*)').eq('teacher_id', p.id).order('created_at', { ascending: false }),
        supabase.from('announcements').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'student'),
        supabase.from('attempts').select('*').limit(2000),
        supabase.from('timetable').select('*').eq('teacher_id', p.id).order('day'),
        supabase.from('quests').select('*').order('created_at', { ascending: false }),
        supabase.from('quest_progress').select('*'),
      ])
      if (results[0].status === 'fulfilled' && results[0].value.data) setTests(results[0].value.data as Test[])
      if (results[1].status === 'fulfilled' && results[1].value.data) setCourses(results[1].value.data.map((course: any) => ({ ...course, _fileCount: course.course_files?.length || 0 })))
      if (results[2].status === 'fulfilled' && results[2].value.data) setAssignments(results[2].value.data)
      if (results[3].status === 'fulfilled' && results[3].value.data) setAnnouncements(results[3].value.data)
      if (results[4].status === 'fulfilled' && results[4].value.data) setStudents(results[4].value.data as Profile[])
      if (results[5].status === 'fulfilled' && results[5].value.data) setAllAttempts(results[5].value.data)
      if (results[6].status === 'fulfilled' && results[6].value.data) setTimetable(results[6].value.data)
      if (results[7].status === 'fulfilled' && results[7].value.data) setTeacherQuests(results[7].value.data as Quest[])
      if (results[8].status === 'fulfilled' && results[8].value.data) setQuestProgress(results[8].value.data as QuestProgress[])
    } catch (err) {
      // Show error toast for fetch failures
      console.error('Teacher dashboard fetch failed:', err)
    }
  }


  const postAnnouncement = async () => {
    if (!newAnnounce.title || !newAnnounce.body || !profile) return
    try {
      const { error } = await supabase.from('announcements').insert({ ...newAnnounce, target:'students', author_id:profile.id, author_name:profile.name, role:'teacher' })
      if (error) throw error
      await pushNotificationBatch(students.map(s => s.id), `◆ ${profile.name}: ${newAnnounce.title}`, 'announcement')
      await logActivity(`Teacher ${profile.name} posted: ${newAnnounce.title}`, 'announcement')
      setNewAnnounce({ title:'', body:'', pinned:false }); setAnnounceModal(false)
      const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending:false })
      if (data) setAnnouncements(data)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to post announcement', 'error')
    }
  }

  const navItems = [
    { id:'home',          label:'Overview',        icon:'home'     },
    { section:'Teaching' },
    { id:'tests',         label:'Tests & Quizzes',  icon:'test'     },
    { id:'timetable',     label:'Timetable',        icon:'calendar' },
    { id:'courses',       label:'Courses',          icon:'book'     },
    { id:'assignments',   label:'Assignments',      icon:'task'     },
    { id:'attendance',    label:'Attendance',       icon:'check'    },
    { id:'grades',        label:'Grades',           icon:'star'     },
    { id:'analytics',     label:'Analytics',        icon:'chart'    },
    { id:'quests',         label:'Quests',            icon:'star'     },
    { id:'calendar',      label:'Calendar',         icon:'calendar' },
    { id:'live-classes',  label:'Live Classes',     icon:'zap'      },
    { id:'announcements', label:'Announcements',    icon:'bell'     },
    { id:'forums',        label:'Forums',           icon:'chat'     },
    { section:'Tools' },
    { id:'plagiarism',    label:'Plagiarism Check', icon:'test'     },
    { id:'meetings',      label:'Meetings',         icon:'calendar' },
    { id:'pred-alerts',   label:'Risk Alerts',      icon:'bell'     },
    { id:'messaging',     label:'Messages',         icon:'chat'     },
    { id:'report-card',   label:'Report Cards',     icon:'star'     },
    { id:'batch-grades',  label:'Batch Grades',     icon:'task'     },
    { id:'notifications', label:'Notifications',    icon:'bell'     },
    { section:'Account' },
    { id:'profile',       label:'My Profile',       icon:'user'     },
  ]

  const myTests   = tests.filter(t => t.type==='test')
  const myQuizzes = tests.filter(t => t.type==='quiz')

  const analyticsData = useMemo(() => tests.map(t => {
    const tAttempts = allAttempts.filter(a => a.test_id === t.id)
    if (!tAttempts.length) return null
    const avg  = Math.round(tAttempts.reduce((s, a) => s + (a.percent || 0), 0) / tAttempts.length)
    const high = Math.max(...tAttempts.map(a => a.percent || 0))
    const low  = Math.min(...tAttempts.map(a => a.percent || 0))
    const pass = tAttempts.filter(a => (a.percent || 0) >= 60).length
    return { test: t, tAttempts, avg, high, low, pass }
  }).filter(Boolean) as { test: Test; tAttempts: Attempt[]; avg: number; high: number; low: number; pass: number }[], [tests, allAttempts])

  if (!profile) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-dim)' }}>Loading...</div>
  )

  return (
    <DashboardLayout profile={profile} navItems={navItems} activeTab={tab} onTabChange={t=>{ setTab(t) }}>

      {/* ── Timetable — handled by TimetableModule ── */}

      <Modal open={announceModal} onClose={()=>setAnnounceModal(false)} title="New Announcement">
            <div style={{ marginBottom:14 }}><label className="label">Title</label><input className="input" value={newAnnounce.title} onChange={e=>setNewAnnounce(a=>({...a,title:e.target.value}))} /></div>
            <div style={{ marginBottom:14 }}><label className="label">Message</label><textarea className="input" rows={4} value={newAnnounce.body} onChange={e=>setNewAnnounce(a=>({...a,body:e.target.value}))} /></div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={postAnnouncement}>Post</button>
              <button className="btn" onClick={()=>setAnnounceModal(false)}>Cancel</button>
            </div>
      </Modal>

      <div className="page">
        {tab==='home' && (
          <>
            <PageHeader title="TEACHER OVERVIEW" subtitle={<>Welcome, {profile.name}</>} />
            <StatGrid items={[['My Tests',myTests.length],['My Quizzes',myQuizzes.length],['Courses',courses.length],['Timetable Slots',timetable.length]].map(([lbl,val])=>({label:String(lbl),value:val as number}))} columns={4} />
            <SectionLabel>Announcements</SectionLabel>
            <div className="fade-up-3">
              {announcements.slice(0,3).map((a:any)=><AnnouncementCard key={a.id} a={a} canDelete={false} />)}
            </div>
          </>
        )}

        {/* ── TIMETABLE ── */}
        {tab==='timetable' && (
          <TimetableModule profile={profile} timetable={timetable} setTimetable={setTimetable} />
        )}

        {/* ── COURSES ── */}
        {tab==='courses' && (
          <TeacherCourseModule
            profile={profile}
            courses={courses}
            students={students}
            onCoursesChange={setCourses}
          />
        )}

        {/* ── TESTS ── */}
        {tab==='tests' && (
          <TeacherTestModule
            profile={profile}
            tests={tests}
            students={students}
            allAttempts={allAttempts}
            onTestsChange={setTests}
          />
        )}

        {/* ── ASSIGNMENTS ── */}
        {tab==='assignments' && (
          <TeacherAssignmentModule
            profile={profile}
            assignments={assignments}
            students={students}
            onAssignmentsChange={setAssignments}
          />
        )}

        {/* ── ATTENDANCE ── */}
        {tab==='attendance' && (
          <TeacherAttendanceModule profile={profile} students={students} timetable={timetable} />
        )}

        {/* ── GRADES ── */}
        {tab==='grades' && (
          <TeacherGradesModule
            profile={profile}
            students={students}
            allAttempts={allAttempts}
            assignments={assignments}
            courses={courses}
          />
        )}

        {tab==='analytics' && (
          <>
            <PageHeader title="ANALYTICS" subtitle="Performance insights" />
            {analyticsData.map(({ test: t, tAttempts, avg, high, low, pass }) => (
                <div key={t.id} className="card fade-up" style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div><span className="mono" style={{ fontSize:10, color:'var(--fg-dim)' }}>{t.id} · </span><span style={{ fontWeight:500 }}>{t.title}</span></div>
                    <div style={{ display:'flex', gap:16, fontFamily:'var(--mono)', fontSize:11 }}>
                      <span><span style={{ color:'var(--fg-dim)' }}>Attempts: </span>{tAttempts.length}</span>
                      <span><span style={{ color:'var(--fg-dim)' }}>Avg: </span><span style={{ color:avg>=70?'var(--success)':avg>=40?'var(--warn)':'var(--danger)' }}>{avg}%</span></span>
                      <span><span style={{ color:'var(--fg-dim)' }}>High: </span>{high}%</span>
                      <span><span style={{ color:'var(--fg-dim)' }}>Low: </span>{low}%</span>
                      <span><span style={{ color:'var(--fg-dim)' }}>Pass: </span>{pass}/{tAttempts.length}</span>
                    </div>
                  </div>
                  {tAttempts.map(a=>{
                    const student = students.find(s=>s.id===a.student_id)
                    return (
                      <div key={a.id} style={{ marginBottom:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--mono)', fontSize:10, marginBottom:3 }}>
                          <span>{student?.name||a.student_id}</span><span>{a.percent}%</span>
                        </div>
                        <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                          <div style={{ height:'100%', width:`${a.percent}%`, background:a.percent>=70?'var(--success)':a.percent>=40?'var(--warn)':'var(--danger)', borderRadius:2, transition:'width 0.8s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
            ))}
            {analyticsData.length===0&&(
              <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No attempts yet.</div>
            )}
          </>
        )}

        {tab==='announcements' && (
          <>
            <PageHeader title="ANNOUNCEMENTS" />
            <div style={{ marginBottom:16 }} className="fade-up-1">
              <button className="btn btn-primary btn-sm" onClick={()=>setAnnounceModal(true)}><Icon name="plus" size={12}/> New Announcement</button>
            </div>
            <div className="fade-up-2">
              {announcements.filter((a:any)=>a.author_id===profile.id||a.role==='admin').map((a:any)=>(
                <AnnouncementCard key={a.id} a={a} canDelete={a.author_id===profile.id} onDelete={async id=>{ if(!confirm('Delete this announcement?')) return; await supabase.from('announcements').delete().eq('id',id).eq('author_id',profile.id); setAnnouncements(prev=>prev.filter((x:any)=>x.id!==id)) }} />
              ))}
            </div>
          </>
        )}

        {tab === 'forums' && <ForumModule profile={profile} />}

        {/* ── CALENDAR ── */}
        {tab === 'calendar' && (
          <CalendarModule tests={tests} assignments={assignments} timetable={timetable} />
        )}

        {/* ── LIVE CLASSES ── */}
        {tab === 'live-classes' && (
          <LiveClassModule profile={profile} />
        )}

        {/* ── PLAGIARISM ── */}
        {tab === 'plagiarism' && (
          <PlagiarismModule profile={profile} assignments={assignments} />
        )}

        {/* ── MEETINGS ── */}
        {tab === 'meetings' && (
          <MeetingSchedulerModule profile={profile} />
        )}

        {/* ── PREDICTIVE ALERTS ── */}
        {tab === 'pred-alerts' && (
          <PredictiveAlertsModule profile={profile} />
        )}

        {/* ── MESSAGING ── */}
        {tab === 'messaging' && (
          <MessagingModule profile={profile} contacts={students} />
        )}

        {/* ── REPORT CARDS ── */}
        {tab === 'report-card' && (
          <ReportCardModule profile={profile} students={students} isTeacher />
        )}

        {/* ── BATCH GRADES ── */}
        {tab === 'batch-grades' && (
          <TeacherBatchGradeModule
            profile={profile}
            assignments={assignments}
            students={students}
            onAssignmentsChange={setAssignments}
          />
        )}

        {tab === 'notifications' && <NotificationsModule userId={profile.id} />}

        {/* ── QUESTS OVERVIEW ── */}
        {tab === 'quests' && (() => {
          const totalStudents = students.length
          const getQuestStats = (q: Quest) => {
            const qp = questProgress.filter(p => p.quest_id === q.id)
            const completed = qp.filter(p => p.completed).length
            const claimed = qp.filter(p => p.claimed).length
            return { started: qp.length, completed, claimed }
          }
          return (
            <>
              <PageHeader title="QUEST OVERVIEW" subtitle="Monitor student quest progress" />
              <StatGrid items={[
                { label: 'Total Quests', value: teacherQuests.length },
                { label: 'Active', value: teacherQuests.filter(q => q.active).length },
                { label: 'Students', value: totalStudents },
                { label: 'Completions', value: questProgress.filter(p => p.completed).length },
              ]} columns={4} />
              {['daily', 'weekly', 'special'].map(type => {
                const group = teacherQuests.filter(q => q.type === type)
                if (!group.length) return null
                return (
                  <div key={type}>
                    <SectionLabel>{type.charAt(0).toUpperCase() + type.slice(1)} Quests</SectionLabel>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
                      {group.map(q => {
                        const stats = getQuestStats(q)
                        const pct = totalStudents ? Math.round(stats.completed / totalStudents * 100) : 0
                        return (
                          <div key={q.id} className="card" style={{ padding: 16, opacity: q.active ? 1 : 0.5 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{q.title}</div>
                              <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--warn)' }}>+{q.xp_reward}</span>
                            </div>
                            {q.description && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>{q.description}</div>}
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8 }}>
                              Target: {q.target_type} x{q.target_count}
                            </div>
                            <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 11 }}>
                              <span>Started: {stats.started}</span>
                              <span style={{ color: 'var(--success)' }}>Completed: {stats.completed}</span>
                              <span>Claimed: {stats.claimed}</span>
                            </div>
                            <div style={{ marginTop: 8, height: 6, background: 'var(--border)', borderRadius: 3 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.5s ease' }} />
                            </div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>{pct}% of students completed</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {teacherQuests.length === 0 && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center', marginTop: 40 }}>
                  No quests available. Ask an admin to create quests.
                </div>
              )}
            </>
          )
        })()}

        {tab==='profile' && (
          <ProfileTab
            profile={profile}
            onUpdate={p => setProfile(p)}
            extraFields={[['Subject', profile.subject], ['Joined', profile.joined]]}
          />
        )}
      </div>
    </DashboardLayout>
  )
}