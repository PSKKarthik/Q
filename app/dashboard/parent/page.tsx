'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { pushNotificationBatch } from '@/lib/actions'
import type { Profile, Attempt, AttendanceRecord, Test, Assignment, Submission, TimetableSlot, AbsenceExcuse, MeetingSlot, Announcement, Notification } from '@/types'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { AnnouncementCard } from '@/components/ui/AnnouncementCard'
import { ProfileTab } from '@/components/ui/ProfileTab'
import { ReportCardModule } from '@/components/modules/ReportCardModule'
import { MeetingSchedulerModule } from '@/components/modules/MeetingSchedulerModule'
import { MessagingModule } from '@/components/modules/MessagingModule'
import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/lib/toast'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'

function ParentDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handledDeepLink = useRef(false)
  const { toast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tab, setTab] = useState('home')
  const [linkedStudents, setLinkedStudents] = useState<Profile[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null)
  const [studentDataLoading, setStudentDataLoading] = useState(false)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [tests, setTests] = useState<Test[]>([])
  const [assignments, setAssignments] = useState<(Assignment & { submissions?: Submission[] })[]>([])
  const [timetable, setTimetable] = useState<TimetableSlot[]>([])
  const [linkCode, setLinkCode] = useState('')
  const [linkError, setLinkError] = useState('')
  const [excuses, setExcuses] = useState<AbsenceExcuse[]>([])
  const [excuseForm, setExcuseForm] = useState({ date: '', reason: '' })
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [alerts, setAlerts] = useState<{ type: string; message: string }[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  // Link student: 2-step OTP flow
  const [linkStep, setLinkStep] = useState<'id' | 'otp'>('id')
  const [linkToken, setLinkToken] = useState('')
  const [linkStudentName, setLinkStudentName] = useState('')
  const [linkOtp, setLinkOtp] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [institutionName, setInstitutionName] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.institution_id) return
    supabase.from('institutions').select('name').eq('id', profile.institution_id).single()
      .then(({ data }) => { if (data) setInstitutionName(data.name) })
  }, [profile?.institution_id])

  useEffect(() => {
    if (handledDeepLink.current) return
    const requestedTab = searchParams.get('tab')
    const allowedTabs = new Set(['home','grades','attendance','timetable','report','excuses','meetings','messaging','alerts','notifications','profile'])
    if (requestedTab && allowedTabs.has(requestedTab)) setTab(requestedTab)
    handledDeepLink.current = true
  }, [searchParams])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => {
          if (!p) return
          if ((p as Profile).role !== 'parent') { router.push(`/dashboard/${(p as Profile).role}`); return }
          setProfile(p as Profile)
          loadLinkedStudents(p as Profile)
        })
    }).catch(() => { router.push('/login') })

    // Load teachers independently so messaging works even with no linked students
    supabase.from('profiles').select('*').eq('role', 'teacher')
      .then(({ data }) => { if (data) setTeachers(data as Profile[]) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.push('/login')
    })

    return () => { subscription.unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadLinkedStudents = async (p: Profile) => {
    try {
      const { data } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', p.id)
      if (!data?.length) return
      const studentIds = data.map((d: any) => d.student_id)
      const { data: students } = await supabase
        .from('profiles')
        .select('*')
        .in('id', studentIds)
      if (students?.length) {
        setLinkedStudents(students as Profile[])
        setSelectedStudent(students[0] as Profile)
        loadStudentData(students[0] as Profile)
      }
    } catch (err) {
      toast((err as any)?.message ||'Failed to load linked students', 'error')
    }
  }

  const loadStudentData = async (student: Profile) => {
    setStudentDataLoading(true)
    try {
      const [att, attn, tt, ann, excData] = await Promise.all([
        supabase.from('attempts').select('*').eq('student_id', student.id).order('submitted_at', { ascending: false }),
        supabase.from('attendance').select('*').eq('student_id', student.id).order('date', { ascending: false }),
        supabase.from('timetable').select('*'),
        supabase.from('announcements').select('*').in('target', ['all', 'parents']).order('created_at', { ascending: false }),
        supabase.from('absence_excuses').select('*').eq('student_id', student.id).order('created_at', { ascending: false }),
      ])

      if (att.data) setAttempts(att.data as Attempt[])
      if (attn.data) setAttendance(attn.data as AttendanceRecord[])
      if (ann.data) setAnnouncements(ann.data as Announcement[])
      if (excData.data) setExcuses(excData.data as AbsenceExcuse[])

      // Filter timetable by subjects the student actually attends
      if (tt.data) {
        const studentSubjects = new Set((attn.data || []).map((r: any) => r.subject).filter(Boolean))
        const filtered = studentSubjects.size > 0
          ? (tt.data as TimetableSlot[]).filter(s => studentSubjects.has(s.subject))
          : tt.data as TimetableSlot[]
        setTimetable(filtered)
      }

      // Fetch only assignments this student has submitted to (inner join) + active assignments in their subjects
      const studentSubjectSet = new Set((attn.data || []).map((r: any) => r.subject).filter(Boolean))
      const [asgSubmitted, asgActive, testsRes] = await Promise.all([
        // Assignments the student has already submitted
        supabase.from('assignments')
          .select('*, submissions!inner(*)')
          .eq('submissions.student_id', student.id)
          .order('created_at', { ascending: false }),
        // Active assignments in the student's subjects
        studentSubjectSet.size > 0
          ? supabase.from('assignments')
              .select('*, submissions(*)')
              .eq('status', 'active')
              .in('subject', Array.from(studentSubjectSet))
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        // Tests filtered by student's subjects
        studentSubjectSet.size > 0
          ? supabase.from('tests').select('id, title, subject, scheduled_date').in('subject', Array.from(studentSubjectSet))
          : supabase.from('tests').select('id, title, subject, scheduled_date'),
      ])

      // Merge submitted + active assignments without duplicates
      const submittedIds = new Set((asgSubmitted.data || []).map((a: any) => a.id))
      const merged = [
        ...(asgSubmitted.data || []),
        ...(asgActive.data || []).filter((a: any) => !submittedIds.has(a.id)),
      ]
      setAssignments(merged)
      if (testsRes.data) setTests(testsRes.data as Test[])

      // Generate alerts based on student-specific data
      const newAlerts: typeof alerts = []
      const recentAtt = (attn.data || []) as AttendanceRecord[]
      const absentDays = recentAtt.filter(a => a.status === 'absent').length
      const totalDays = recentAtt.length
      if (totalDays > 0 && absentDays / totalDays > 0.2) {
        newAlerts.push({ type: 'danger', message: `△ ${student.name} has missed ${absentDays} out of ${totalDays} days (${Math.round(absentDays / totalDays * 100)}% absent)` })
      }
      const lowScores = ((att.data || []) as Attempt[]).filter(a => (a.percent || 0) < 50)
      if (lowScores.length > 0) {
        newAlerts.push({ type: 'warn', message: `▪ ${student.name} scored below 50% on ${lowScores.length} test(s)` })
      }
      // Only count unsubmitted active assignments for this student
      const studentSubIds = new Set((asgSubmitted.data || []).map((a: any) => a.id))
      const due3Days = merged.filter((asg: any) =>
        asg.status === 'active' &&
        asg.due_date &&
        !studentSubIds.has(asg.id) &&
        new Date(asg.due_date) > new Date() &&
        new Date(asg.due_date) < new Date(Date.now() + 3 * 86400000)
      )
      if (due3Days.length > 0) {
        newAlerts.push({ type: 'info', message: `▫ ${due3Days.length} assignment(s) due in the next 3 days` })
      }
      setAlerts(newAlerts)
    } catch (err) {
      toast((err as any)?.message ||'Failed to load student data', 'error')
    } finally {
      setStudentDataLoading(false)
    }
  }

  // Step 1: send OTP to student's email
  const requestOtp = async () => {
    if (!linkCode.trim() || !profile) return
    setLinkError('')
    setLinkLoading(true)
    try {
      const res = await fetch('/api/link-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', qgx_id: linkCode.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setLinkError(json.error || 'Failed to send code'); return }
      const data = json.data || json
      setLinkToken(data.token)
      setLinkStudentName(data.studentName)
      setLinkOtp('')
      setLinkStep('otp')
    } catch {
      setLinkError('Network error. Please try again.')
    } finally {
      setLinkLoading(false)
    }
  }

  // Step 2: verify OTP and create link
  const verifyOtp = async () => {
    if (!linkOtp.trim() || !profile) return
    setLinkError('')
    setLinkLoading(true)
    try {
      const res = await fetch('/api/link-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: linkToken, otp: linkOtp.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setLinkError(json.error || 'Verification failed'); return }
      const student = (json.data?.student || json.student) as Profile
      setLinkedStudents(prev => [...prev, student])
      if (!selectedStudent) {
        setSelectedStudent(student)
        loadStudentData(student)
      }
      setLinkCode('')
      setLinkOtp('')
      setLinkToken('')
      setLinkStudentName('')
      setLinkStep('id')
      toast(`✓ Linked to ${student.name}`, 'success')
    } catch {
      setLinkError('Network error. Please try again.')
    } finally {
      setLinkLoading(false)
    }
  }

  const resetLinkFlow = () => {
    setLinkStep('id')
    setLinkError('')
    setLinkOtp('')
    setLinkToken('')
    setLinkStudentName('')
  }

  const switchStudent = (student: Profile) => {
    setSelectedStudent(student)
    loadStudentData(student)
  }

  const navItems = [
    { id: 'home', label: 'Overview', icon: 'home' },
    { section: 'Monitor' },
    { id: 'grades', label: 'Grades & Tests', icon: 'star' },
    { id: 'attendance', label: 'Attendance', icon: 'check' },
    { id: 'timetable', label: 'Timetable', icon: 'clock' },
    { id: 'report', label: 'Report Card', icon: 'download' },
    { section: 'Communication' },
    { id: 'excuses', label: 'Absence Excuses', icon: 'edit' },
    { id: 'meetings', label: 'Book Meeting', icon: 'calendar' },
    { id: 'messaging', label: 'Teacher Messages', icon: 'chat' },
    { id: 'alerts', label: 'Academic Alerts', icon: 'zap' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { section: 'Account' },
    { id: 'profile', label: 'My Profile', icon: 'user' },
  ]

  if (!profile) return <DashboardSkeleton label="Loading parent dashboard..." />

  const studentAttempts = attempts
  const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'late').length
  const attRate = attendance.length ? Math.round((presentCount / attendance.length) * 100) : 0
  const avgScore = studentAttempts.length ? Math.round(studentAttempts.reduce((s, a) => s + (a.percent || 0), 0) / studentAttempts.length) : 0

  const studentSubs = selectedStudent
    ? assignments.flatMap(a => (a.submissions || []).filter((s: Submission) => s.student_id === selectedStudent.id))
    : []

  return (
    <DashboardLayout profile={profile} navItems={navItems} activeTab={tab} onTabChange={setTab}>
      <div className="page">
        {/* Student Selector */}
        {linkedStudents.length > 0 && (
          <div className="fade-up" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', letterSpacing: '0.1em' }}>VIEWING:</span>
            {linkedStudents.map(s => (
              <button key={s.id} className={`btn btn-sm ${selectedStudent?.id === s.id ? 'btn-primary' : ''}`} onClick={() => switchStudent(s)} disabled={studentDataLoading}>
                {s.name}
              </button>
            ))}
            {studentDataLoading && <span className="spinner" style={{ width: 14, height: 14 }} />}
          </div>
        )}

        {tab === 'home' && (
          <>
            <PageHeader title="PARENT DASHBOARD" subtitle={<>Welcome, {profile.name}{institutionName && <> · <span style={{ color:'var(--accent)' }}>{institutionName}</span></>}</>} />

            {linkedStudents.length === 0 ? (
              <div className="card fade-up-2" style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 24, marginBottom: 12 }}>LINK YOUR CHILD</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 20 }}>
                  {linkStep === 'id'
                    ? "Enter your child's QGX ID — a verification code will be sent to their email"
                    : `Code sent to ${linkStudentName}'s email. Enter it below to confirm.`}
                </div>
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <LinkStudentForm
                    linkStep={linkStep} linkCode={linkCode} linkOtp={linkOtp} linkError={linkError} linkLoading={linkLoading}
                    setLinkCode={setLinkCode} setLinkOtp={setLinkOtp}
                    onRequestOtp={requestOtp} onVerifyOtp={verifyOtp} onReset={resetLinkFlow}
                  />
                </div>
              </div>
            ) : selectedStudent && (
              <>
                <StatGrid items={[
                  { label: 'Student', value: selectedStudent.name },
                  { label: 'Avg Score', value: `${avgScore}%` },
                  { label: 'Tests Taken', value: studentAttempts.length },
                  { label: 'Attendance', value: `${attRate}%` },
                ]} columns={4} />

                {/* Link another student */}
                <div className="card fade-up-3" style={{ marginBottom: 20 }}>
                  <SectionLabel>Link Another Child</SectionLabel>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 10 }}>
                    {linkStep === 'otp'
                      ? `Code sent to ${linkStudentName}'s email`
                      : "A verification code will be sent to your child's email"}
                  </div>
                  <LinkStudentForm
                    linkStep={linkStep} linkCode={linkCode} linkOtp={linkOtp} linkError={linkError} linkLoading={linkLoading}
                    setLinkCode={setLinkCode} setLinkOtp={setLinkOtp}
                    onRequestOtp={requestOtp} onVerifyOtp={verifyOtp} onReset={resetLinkFlow}
                    compact
                  />
                </div>

                {/* Recent activity */}
                <SectionLabel>Recent Tests</SectionLabel>
                <div className="fade-up-4">
                  {studentAttempts.slice(0, 5).map(a => {
                    const test = tests.find(t => t.id === a.test_id)
                    return (
                      <div key={a.id} className="card" style={{ marginBottom: 8, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13 }}>{test?.title || a.test_id}</span>
                          <span className="mono" style={{ color: a.percent >= 70 ? 'var(--success)' : a.percent >= 40 ? 'var(--warn)' : 'var(--danger)' }}>
                            {a.score}/{a.total} ({a.percent}%)
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {studentAttempts.length === 0 && <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No tests taken yet.</div>}
                </div>

                <SectionLabel>Upcoming Tests</SectionLabel>
                <div className="fade-up-4" style={{ marginTop: 8 }}>
                  {tests
                    .filter(t => t.scheduled_date && new Date(t.scheduled_date) >= new Date(new Date().toISOString().slice(0, 10)))
                    .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''))
                    .slice(0, 5)
                    .map(t => (
                      <div key={t.id} className="card" style={{ marginBottom: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13 }}>{t.title}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{t.scheduled_date}</span>
                      </div>
                    ))}
                  {tests.filter(t => t.scheduled_date && new Date(t.scheduled_date) >= new Date(new Date().toISOString().slice(0, 10))).length === 0 && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No upcoming tests scheduled.</div>
                  )}
                </div>

                <SectionLabel>Announcements</SectionLabel>
                <div className="fade-up-4" style={{ marginTop: 8 }}>
                  {announcements.slice(0, 3).map((a) => (
                    <AnnouncementCard key={a.id} a={a} canDelete={false} />
                  ))}
                  {announcements.length === 0 && (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No announcements for parents right now.</div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'grades' && !selectedStudent && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 40, textAlign: 'center' }}>Link a student first to view their grades.</div>
        )}
        {tab === 'grades' && selectedStudent && studentDataLoading && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 40 }}>Loading grades...</div>
        )}
        {tab === 'grades' && selectedStudent && !studentDataLoading && (
          <>
            <PageHeader title="GRADES & TESTS" subtitle={`${selectedStudent.name}'s performance`} />
            <StatGrid items={[
              { label: 'Avg Score', value: `${avgScore}%` },
              { label: 'Tests', value: studentAttempts.length },
              { label: 'Assignments Graded', value: studentSubs.filter((s: Submission) => s.score != null).length },
              { label: 'XP', value: selectedStudent.xp || 0 },
            ]} columns={4} />
            <SectionLabel>Test History</SectionLabel>
            <div className="fade-up-3" style={{ border: '1px solid var(--border)' }}>
              <table className="table">
                <thead><tr><th>Test</th><th>Subject</th><th>Score</th><th>Grade</th><th>Date</th></tr></thead>
                <tbody>
                  {studentAttempts.map(a => {
                    const test = tests.find(t => t.id === a.test_id)
                    const grade = a.percent >= 90 ? 'A' : a.percent >= 80 ? 'B' : a.percent >= 70 ? 'C' : a.percent >= 60 ? 'D' : 'F'
                    return (
                      <tr key={a.id}>
                        <td>{test?.title || a.test_id}</td>
                        <td><span className="tag">{test?.subject || '-'}</span></td>
                        <td><span className="mono" style={{ color: a.percent >= 70 ? 'var(--success)' : a.percent >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{a.score}/{a.total} ({a.percent}%)</span></td>
                        <td><span style={{ fontWeight: 600 }}>{grade}</span></td>
                        <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{a.submitted_at?.slice(0, 10)}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'attendance' && !selectedStudent && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 40, textAlign: 'center' }}>Link a student first to view their attendance.</div>
        )}
        {tab === 'attendance' && selectedStudent && studentDataLoading && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 40 }}>Loading attendance...</div>
        )}
        {tab === 'attendance' && selectedStudent && !studentDataLoading && (
          <>
            <PageHeader title="ATTENDANCE" subtitle={`${selectedStudent.name}'s attendance record`} />
            <StatGrid items={[
              { label: 'Total Days', value: attendance.length },
              { label: 'Present', value: attendance.filter(a => a.status === 'present').length },
              { label: 'Late', value: attendance.filter(a => a.status === 'late').length },
              { label: 'Absent', value: attendance.filter(a => a.status === 'absent').length },
            ]} columns={4} />
            <div style={{ marginBottom: 16 }}>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 0 }}>
                <div style={{ height: '100%', width: `${attRate}%`, background: attRate >= 80 ? 'var(--success)' : attRate >= 60 ? 'var(--warn)' : 'var(--danger)', borderRadius: 0, transition: 'width 0.8s ease' }} />
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4, textAlign: 'right' }}>{attRate}% attendance</div>
            </div>
            <div className="fade-up-3" style={{ border: '1px solid var(--border)' }}>
              <table className="table">
                <thead><tr><th>Date</th><th>Subject</th><th>Status</th><th>Note</th></tr></thead>
                <tbody>
                  {attendance.slice(0, 50).map(a => (
                    <tr key={a.id}>
                      <td><span className="mono" style={{ fontSize: 11 }}>{a.date}</span></td>
                      <td><span className="tag">{a.subject}</span></td>
                      <td><span className={`tag ${a.status === 'present' ? 'tag-success' : a.status === 'absent' ? 'tag-danger' : 'tag-warn'}`}>{a.status}</span></td>
                      <td><span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{a.note || '-'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'timetable' && (
          <>
            <PageHeader title="TIMETABLE" subtitle={selectedStudent ? `${selectedStudent.name}'s schedule` : 'Schedule'} />
            {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const).map(day => {
              const slots = timetable.filter(s => s.day === day).sort((a, b) => a.time.localeCompare(b.time))
              if (!slots.length) return null
              return (
                <div key={day} style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--fg-dim)', marginBottom: 8 }}>{day.toUpperCase()}</div>
                  {slots.map(s => (
                    <div key={s.id} className="card" style={{ marginBottom: 6, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>{s.subject}</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>{s.teacher_name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--mono)', fontSize: 11 }}>
                        <span><Icon name="clock" size={10} /> {s.time}</span>
                        <span>{s.room}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}

        {tab === 'report' && !selectedStudent && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 40, textAlign: 'center' }}>Link a student first to view their report card.</div>
        )}
        {tab === 'report' && selectedStudent && (
          <ReportCardModule profile={selectedStudent} />
        )}

        {/* ABSENCE EXCUSES */}
        {tab === 'excuses' && !selectedStudent && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 40, textAlign: 'center' }}>Link a student first to submit absence excuses.</div>
        )}
        {tab === 'excuses' && selectedStudent && (
          <>
            <PageHeader title="ABSENCE EXCUSES" subtitle={`Submit excuses for ${selectedStudent.name}`} />
            <div className="card fade-up-2" style={{ marginBottom: 20 }}>
              <SectionLabel>Submit New Excuse</SectionLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <input className="input" type="date"
                min={new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)}
                max={new Date().toISOString().slice(0, 10)}
                value={excuseForm.date} onChange={e => setExcuseForm(f => ({ ...f, date: e.target.value }))} style={{ width: 180 }} />
                <input className="input" placeholder="Reason for absence..." value={excuseForm.reason} onChange={e => setExcuseForm(f => ({ ...f, reason: e.target.value }))} style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  if (!excuseForm.date || !excuseForm.reason.trim() || !profile) return
                  try {
                    const { data, error } = await supabase.from('absence_excuses').insert({
                      student_id: selectedStudent.id,
                      parent_id: profile.id,
                      date: excuseForm.date,
                      reason: excuseForm.reason.trim(),
                      status: 'pending',
                    }).select().single()
                    if (error) throw error
                    if (data) {
                      setExcuses(prev => [data as AbsenceExcuse, ...prev])
                      setExcuseForm({ date: '', reason: '' })
                      // Notify teachers: find those with attendance records for this student
                      const { data: attRecords } = await supabase
                        .from('attendance')
                        .select('teacher_id')
                        .eq('student_id', selectedStudent.id)
                      const teacherIds = Array.from(new Set((attRecords || []).map((r: any) => r.teacher_id).filter(Boolean))) as string[]
                      if (teacherIds.length > 0) {
                        await pushNotificationBatch(
                          teacherIds,
                          `${profile.name} submitted an absence excuse for ${selectedStudent.name} on ${excuseForm.date}.`,
                          'excuse_submitted'
                        )
                      }
                      // Send email to teachers via notify API
                      fetch('/api/notify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: 'excuse_submitted', payload: { excuse_id: (data as AbsenceExcuse).id } }),
                      }).catch(() => {/* non-blocking */})
                    }
                  } catch (err) {
                    toast((err as any)?.message ||'Failed to submit excuse', 'error')
                  }
                }}>Submit</button>
              </div>
            </div>
            <SectionLabel>Submitted Excuses</SectionLabel>
            <div className="fade-up-3">
              {excuses.map(exc => (
                <div key={exc.id} className="card" style={{ marginBottom: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, marginBottom: 2 }}>{exc.reason}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Date: {exc.date}</div>
                  </div>
                  <span className={`tag ${exc.status === 'approved' ? 'tag-success' : exc.status === 'rejected' ? 'tag-danger' : 'tag-warn'}`}>{exc.status}</span>
                </div>
              ))}
              {excuses.length === 0 && <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No excuses submitted yet.</div>}
            </div>
          </>
        )}

        {/* MEETINGS */}
        {tab === 'meetings' && (
          <MeetingSchedulerModule
            profile={profile}
            allowedTeacherIds={teachers.map(t => t.id)}
          />
        )}

        {/* TEACHER MESSAGING */}
        {tab === 'messaging' && (
          <MessagingModule profile={profile} contacts={teachers} />
        )}

        {/* ALERTS */}
        {tab === 'alerts' && (
          <>
            <PageHeader title="REAL-TIME ALERTS" subtitle={selectedStudent ? `Alerts for ${selectedStudent.name}` : 'Link a student to see alerts'} />
            <div className="fade-up-2">
              {alerts.length > 0 ? alerts.map((alert, i) => (
                <div key={i} className="card" style={{ marginBottom: 10, padding: '14px 18px', borderLeft: `4px solid ${alert.type === 'danger' ? 'var(--danger)' : alert.type === 'warn' ? 'var(--warn)' : 'var(--accent)'}` }}>
                  <div style={{ fontSize: 14 }}>{alert.message}</div>
                </div>
              )) : (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No active alerts. Everything looks good!</div>
              )}
            </div>
          </>
        )}

        {/* NOTIFICATIONS */}
        {tab === 'notifications' && (
          <>
            <PageHeader title="NOTIFICATIONS" subtitle="Your recent notifications" />
            <NotificationsTab profile={profile} notifications={notifications} setNotifications={setNotifications} />
          </>
        )}

        {tab === 'profile' && (
          <ProfileTab profile={profile} onUpdate={p => setProfile(p)} />
        )}
      </div>
    </DashboardLayout>
  )
}

function NotificationsTab({ profile, notifications, setNotifications }: { profile: Profile; notifications: Notification[]; setNotifications: (n: Notification[]) => void }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase.from('notifications').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => {
        if (data) setNotifications(data as Notification[])
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  const markAllRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false)
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="fade-up-2">
      {unreadCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-sm" onClick={markAllRead}>Mark all read ({unreadCount})</button>
        </div>
      )}
      {loading && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading...</div>
      )}
      {!loading && notifications.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No notifications yet.</div>
      )}
      {notifications.map(n => (
        <div key={n.id} className="card" style={{ marginBottom: 8, padding: '12px 16px', opacity: n.read ? 0.6 : 1, borderLeft: `3px solid ${n.type === 'danger' ? 'var(--danger)' : n.type === 'warn' ? 'var(--warn)' : 'var(--accent)'}` }}>
          <div style={{ fontSize: 13 }}>{n.message}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
        </div>
      ))}
    </div>
  )
}

interface LinkStudentFormProps {
  linkStep: 'id' | 'otp'
  linkCode: string
  linkOtp: string
  linkError: string
  linkLoading: boolean
  setLinkCode: (v: string) => void
  setLinkOtp: (v: string) => void
  onRequestOtp: () => void
  onVerifyOtp: () => void
  onReset: () => void
  compact?: boolean
}

function LinkStudentForm({ linkStep, linkCode, linkOtp, linkError, linkLoading, setLinkCode, setLinkOtp, onRequestOtp, onVerifyOtp, onReset, compact }: LinkStudentFormProps) {
  return (
    <div>
      {linkStep === 'id' ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="QGX-ABCD-EFGH"
            value={linkCode}
            onChange={e => setLinkCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') onRequestOtp() }}
            style={compact ? { maxWidth: 200 } : { flex: 1 }}
          />
          <button
            className={`btn btn-primary ${compact ? 'btn-sm' : ''}`}
            onClick={onRequestOtp}
            disabled={linkLoading || !linkCode.trim()}
          >
            {linkLoading ? '...' : 'Send Code'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>
            ✉ A 6-digit code was sent to your child&apos;s email. Enter it below.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="input"
              placeholder="_ _ _ _ _ _"
              value={linkOtp}
              onChange={e => setLinkOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => { if (e.key === 'Enter' && linkOtp.length === 6) onVerifyOtp() }}
              style={{ width: 150, letterSpacing: '0.4em', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 18 }}
              maxLength={6}
              inputMode="numeric"
              autoFocus
            />
            <button
              className={`btn btn-primary ${compact ? 'btn-sm' : ''}`}
              onClick={onVerifyOtp}
              disabled={linkLoading || linkOtp.length < 6}
            >
              {linkLoading ? '...' : 'Verify'}
            </button>
            <button className={`btn ${compact ? 'btn-sm' : ''}`} onClick={onReset}>
              ← Back
            </button>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
            Code expires in 10 minutes. Check spam if not received.
          </div>
        </div>
      )}
      {linkError && (
        <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6 }}>
          {linkError}
        </div>
      )}
    </div>
  )
}

export default function ParentDashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <ParentDashboardContent />
    </Suspense>
  )
}
