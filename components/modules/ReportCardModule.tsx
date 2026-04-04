'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, Attempt, AttendanceRecord, ReportComment, GradeWeights } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { Pagination } from '@/components/ui/Pagination'
import { PAGE_SIZE } from '@/lib/constants'

interface Props {
  profile: Profile
  students?: Profile[]
  isTeacher?: boolean
}

function getLetterGrade(pct: number) {
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'B'
  if (pct >= 70) return 'C'
  if (pct >= 60) return 'D'
  return 'F'
}

function GradeColor(grade: string) {
  if (grade === 'A') return 'var(--success)'
  if (grade === 'B') return 'var(--success)'
  if (grade === 'C') return 'var(--warn)'
  if (grade === 'D') return 'var(--warn)'
  return 'var(--danger)'
}

function getGPA(pct: number): number {
  if (pct >= 93) return 4.0
  if (pct >= 90) return 3.7
  if (pct >= 87) return 3.3
  if (pct >= 83) return 3.0
  if (pct >= 80) return 2.7
  if (pct >= 77) return 2.3
  if (pct >= 73) return 2.0
  if (pct >= 70) return 1.7
  if (pct >= 67) return 1.3
  if (pct >= 63) return 1.0
  if (pct >= 60) return 0.7
  return 0.0
}

function getConductRating(attRate: number, avgScore: number): { label: string; color: string } {
  const combined = attRate * 0.4 + avgScore * 0.6
  if (combined >= 85) return { label: 'Excellent', color: 'var(--success)' }
  if (combined >= 70) return { label: 'Good', color: 'var(--success)' }
  if (combined >= 55) return { label: 'Satisfactory', color: 'var(--warn)' }
  if (combined >= 40) return { label: 'Needs Improvement', color: 'var(--warn)' }
  return { label: 'Unsatisfactory', color: 'var(--danger)' }
}

interface ReportData {
  student: Profile
  tests: { subject: string; title: string; score: number; total: number; percent: number; date: string }[]
  assignments: { title: string; score: number; maxPoints: number; percent: number }[]
  attendance: { total: number; present: number; late: number; absent: number; rate: number }
  overallAvg: number
  overallGrade: string
  weightedAvg: number
  gpa: number
  conduct: { label: string; color: string }
  comments: ReportComment[]
  weights: GradeWeights | null
  prevTermAvg: number | null
}

const DEFAULT_WEIGHTS: GradeWeights = {
  id: '', course_id: '', tests_weight: 40, assignments_weight: 30, attendance_weight: 10, participation_weight: 20
}

export function ReportCardModule({ profile, students, isTeacher }: Props) {
  const { toast } = useToast()
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(isTeacher ? null : profile)
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [term, setTerm] = useState<string>('all')
  const [commentText, setCommentText] = useState('')
  const [conductNote, setConductNote] = useState('')
  const [testPage, setTestPage] = useState(0)
  const [asgPage, setAsgPage] = useState(0)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedStudent) generateReport(selectedStudent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, term])

  const getTermRange = (termStr: string) => {
    if (termStr === 'all') return null
    const [year, q] = termStr.split('-Q')
    const qStart = new Date(parseInt(year), (parseInt(q) - 1) * 3, 1)
    const qEnd = new Date(parseInt(year), parseInt(q) * 3, 0)
    return { qStart, qEnd }
  }

  const getPrevTerm = (termStr: string): string | null => {
    if (termStr === 'all') return null
    const [year, q] = termStr.split('-Q')
    const qNum = parseInt(q)
    if (qNum > 1) return `${year}-Q${qNum - 1}`
    return `${parseInt(year) - 1}-Q4`
  }

  const generateReport = async (student: Profile) => {
    setLoading(true)
    try {
      const [attemptsRes, assignmentsRes, attendanceRes, testsRes, weightsRes, commentsRes] = await Promise.all([
      supabase.from('attempts').select('*').eq('student_id', student.id),
      supabase.from('submissions').select('*, assignments(title, max_points)').eq('student_id', student.id).not('score', 'is', null),
      supabase.from('attendance').select('*').eq('student_id', student.id),
      supabase.from('tests').select('id, title, subject, scheduled_date'),
      supabase.from('grade_weights').select('*').limit(1).single(),
      supabase.from('report_comments').select('*').eq('student_id', student.id).eq('term', term).order('created_at', { ascending: false }),
    ])

    const attempts = (attemptsRes.data || []) as Attempt[]
    const submissions = (assignmentsRes.data || []) as any[]
    const attendance = (attendanceRes.data || []) as AttendanceRecord[]
    const testsMap = new Map((testsRes.data || []).map((t: any) => [t.id, t]))
    const weights = (weightsRes.data as GradeWeights) || null
    const comments = (commentsRes.data || []) as ReportComment[]
    const w = weights || DEFAULT_WEIGHTS

    const filterByTerm = (termStr: string) => {
      const range = getTermRange(termStr)
      let fAttempts = attempts
      let fAttendance = attendance
      if (range) {
        fAttempts = attempts.filter(a => {
          const d = new Date(a.submitted_at)
          return d >= range.qStart && d <= range.qEnd
        })
        fAttendance = attendance.filter(a => {
          const d = new Date(a.date)
          return d >= range.qStart && d <= range.qEnd
        })
      }
      return { fAttempts, fAttendance }
    }

    const { fAttempts, fAttendance } = filterByTerm(term)

    const testRows = fAttempts.map(a => {
      const t = testsMap.get(a.test_id)
      return {
        subject: t?.subject || 'General',
        title: t?.title || a.test_id,
        score: a.score,
        total: a.total,
        percent: a.percent,
        date: a.submitted_at?.slice(0, 10) || '',
      }
    })

    const assignmentRows = submissions.map((s: any) => ({
      title: s.assignments?.title || 'Assignment',
      score: s.score || 0,
      maxPoints: s.assignments?.max_points || 100,
      percent: s.assignments?.max_points ? Math.round((s.score / s.assignments.max_points) * 100) : 0,
    }))

    const attTotal = fAttendance.length
    const attPresent = fAttendance.filter(a => a.status === 'present').length
    const attLate = fAttendance.filter(a => a.status === 'late').length
    const attAbsent = fAttendance.filter(a => a.status === 'absent').length
    const attRate = attTotal ? Math.round(((attPresent + attLate) / attTotal) * 100) : 0

    // Weighted average
    const testAvg = testRows.length ? testRows.reduce((s, t) => s + t.percent, 0) / testRows.length : 0
    const assignAvg = assignmentRows.length ? assignmentRows.reduce((s, a) => s + a.percent, 0) / assignmentRows.length : 0
    const totalWeight = w.tests_weight + w.assignments_weight + w.attendance_weight + w.participation_weight
    const weightedAvg = Math.round(
      (testAvg * w.tests_weight + assignAvg * w.assignments_weight + attRate * w.attendance_weight + Math.min(attRate, 100) * w.participation_weight) / totalWeight
    )

    const allScores = [...testRows.map(t => t.percent), ...assignmentRows.map(a => a.percent)]
    const overallAvg = allScores.length ? Math.round(allScores.reduce((s, p) => s + p, 0) / allScores.length) : 0

    // Previous term comparison
    let prevTermAvg: number | null = null
    const prevTerm = getPrevTerm(term)
    if (prevTerm) {
      const { fAttempts: pAttempts } = filterByTerm(prevTerm)
      const prevScores = pAttempts.map(a => a.percent).filter(p => p != null && !isNaN(p))
      if (prevScores.length) prevTermAvg = Math.round(prevScores.reduce((s, p) => s + p, 0) / prevScores.length)
    }

    const conduct = getConductRating(attRate, overallAvg)

    setReport({
      student,
      tests: testRows,
      assignments: assignmentRows,
      attendance: { total: attTotal, present: attPresent, late: attLate, absent: attAbsent, rate: attRate },
      overallAvg,
      overallGrade: getLetterGrade(weightedAvg),
      weightedAvg,
      gpa: getGPA(weightedAvg),
      conduct,
      comments,
      weights,
      prevTermAvg,
    })
    setLoading(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to generate report', 'error')
      setLoading(false)
    }
  }

  const addComment = async () => {
    if (!commentText.trim() || !selectedStudent || !isTeacher) return
    try {
      const { data } = await supabase.from('report_comments').insert({
        student_id: selectedStudent.id,
        teacher_id: profile.id,
        teacher_name: profile.name,
        term,
        comment: commentText.trim(),
        category: conductNote || 'general',
      }).select().single()
      if (data) setReport(prev => prev ? { ...prev, comments: [data as ReportComment, ...prev.comments] } : prev)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add comment', 'error')
    }
    setCommentText('')
    setConductNote('')
  }

  const handlePrint = () => {
    if (!printRef.current) return
    const w = window.open('', '_blank')
    if (!w) return
    const safeName = (report?.student.name || '').replace(/[<>"'&]/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' } as Record<string,string>)[c] || c)
    w.document.write(`
      <html><head><title>Report Card — ${safeName}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        h2 { font-size: 16px; margin: 24px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 12px; }
        th { background: #f5f5f5; font-weight: 600; }
        .grade-big { font-size: 64px; font-weight: bold; text-align: center; margin: 20px 0; }
        .summary { display: flex; gap: 32px; margin-bottom: 20px; }
        .summary div { text-align: center; }
        .summary .val { font-size: 24px; font-weight: bold; }
        .summary .lbl { font-size: 11px; color: #666; }
        .comment-box { border: 1px solid #ddd; padding: 10px; margin: 6px 0; border-radius: 4px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `)
    w.document.close()
    w.print()
  }

  const now = new Date()
  const termOptions = [{ value: 'all', label: 'All Time' }]
  for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
    for (let q = 4; q >= 1; q--) {
      termOptions.push({ value: `${y}-Q${q}`, label: `${y} Q${q}` })
    }
  }

  return (
    <>
      <PageHeader title="REPORT CARDS" subtitle="Weighted grade reports with teacher comments" />

      <div className="fade-up-1" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {isTeacher && students && (
          <select className="input" style={{ width: 220 }} value={selectedStudent?.id || ''} onChange={e => {
            const s = students.find(st => st.id === e.target.value)
            setSelectedStudent(s || null)
          }}>
            <option value="">Select student...</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.qgx_id})</option>)}
          </select>
        )}
        <select className="input" style={{ width: 140 }} value={term} onChange={e => setTerm(e.target.value)}>
          {termOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {report && (
          <button className="btn btn-primary btn-sm" onClick={handlePrint}>
            <Icon name="download" size={11} /> Print Report
          </button>
        )}
      </div>

      {loading && <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Generating report...</div>}

      {report && !loading && (
        <div ref={printRef}>
          {/* Header */}
          <div className="card fade-up-2" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h1 style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: '0.1em', margin: 0 }}>QGX REPORT CARD</h1>
                <div className="meta" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginTop: 4 }}>
                  {term === 'all' ? 'All Time' : term} · Generated {new Date().toLocaleDateString()}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{report.student.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{report.student.qgx_id} · {report.student.grade || 'N/A'}</div>
              </div>
            </div>

            <StatGrid items={[
              { label: 'Overall Grade', value: report.overallGrade },
              { label: 'Weighted Avg', value: `${report.weightedAvg}%` },
              { label: 'GPA', value: report.gpa.toFixed(1) },
              { label: 'Tests Taken', value: report.tests.length },
              { label: 'Attendance', value: `${report.attendance.rate}%` },
              { label: 'Conduct', value: report.conduct.label },
            ]} columns={6} />

            {/* Term comparison */}
            {report.prevTermAvg !== null && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>vs Previous Term:</span>
                {(() => {
                  const diff = report.weightedAvg - report.prevTermAvg!
                  const color = diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--danger)' : 'var(--fg-dim)'
                  return <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color }}>{diff > 0 ? '▲' : diff < 0 ? '▼' : '—'} {Math.abs(diff)}% ({report.prevTermAvg}% → {report.weightedAvg}%)</span>
                })()}
              </div>
            )}

            {/* Weight breakdown */}
            <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Tests', w: (report.weights || DEFAULT_WEIGHTS).tests_weight },
                { label: 'Assignments', w: (report.weights || DEFAULT_WEIGHTS).assignments_weight },
                { label: 'Attendance', w: (report.weights || DEFAULT_WEIGHTS).attendance_weight },
                { label: 'Participation', w: (report.weights || DEFAULT_WEIGHTS).participation_weight },
              ].map(item => (
                <div key={item.label} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                  {item.label}: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{item.w}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tests */}
          {report.tests.length > 0 && (
            <div className="card fade-up-3" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '0.08em', marginBottom: 12 }}>TEST SCORES</h2>
              <div style={{ border: '1px solid var(--border)' }}>
                <table className="table">
                  <thead><tr><th>Subject</th><th>Test</th><th>Score</th><th>Grade</th><th>Date</th></tr></thead>
                  <tbody>
                    {report.tests.slice(testPage * PAGE_SIZE, (testPage + 1) * PAGE_SIZE).map((t, i) => (
                      <tr key={i}>
                        <td><span className="tag">{t.subject}</span></td>
                        <td>{t.title}</td>
                        <td><span className="mono" style={{ color: t.percent >= 70 ? 'var(--success)' : t.percent >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{t.score}/{t.total} ({t.percent}%)</span></td>
                        <td><span style={{ fontWeight: 600, color: GradeColor(getLetterGrade(t.percent)) }}>{getLetterGrade(t.percent)}</span></td>
                        <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{t.date}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={testPage} totalPages={Math.ceil(report.tests.length / PAGE_SIZE)} onPageChange={setTestPage} />
            </div>
          )}

          {/* Assignments */}
          {report.assignments.length > 0 && (
            <div className="card fade-up-4" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '0.08em', marginBottom: 12 }}>ASSIGNMENT SCORES</h2>
              <div style={{ border: '1px solid var(--border)' }}>
                <table className="table">
                  <thead><tr><th>Assignment</th><th>Score</th><th>Grade</th></tr></thead>
                  <tbody>
                    {report.assignments.slice(asgPage * PAGE_SIZE, (asgPage + 1) * PAGE_SIZE).map((a, i) => (
                      <tr key={i}>
                        <td>{a.title}</td>
                        <td><span className="mono">{a.score}/{a.maxPoints} ({a.percent}%)</span></td>
                        <td><span style={{ fontWeight: 600, color: GradeColor(getLetterGrade(a.percent)) }}>{getLetterGrade(a.percent)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={asgPage} totalPages={Math.ceil(report.assignments.length / PAGE_SIZE)} onPageChange={setAsgPage} />
            </div>
          )}

          {/* Attendance */}
          <div className="card fade-up-4" style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '0.08em', marginBottom: 12 }}>ATTENDANCE</h2>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 36, color: report.attendance.rate >= 80 ? 'var(--success)' : report.attendance.rate >= 60 ? 'var(--warn)' : 'var(--danger)' }}>{report.attendance.rate}%</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Attendance Rate</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 36, color: 'var(--success)' }}>{report.attendance.present}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Present</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 36, color: 'var(--warn)' }}>{report.attendance.late}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Late</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 36, color: 'var(--danger)' }}>{report.attendance.absent}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Absent</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 36 }}>{report.attendance.total}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Total Days</div>
              </div>
            </div>
          </div>

          {/* Conduct */}
          <div className="card fade-up-4" style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '0.08em', marginBottom: 12 }}>CONDUCT & BEHAVIOR</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', border: `3px solid ${report.conduct.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--display)', fontSize: 14, color: report.conduct.color }}>{report.conduct.label.charAt(0)}</span>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: report.conduct.color }}>{report.conduct.label}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>
                  Based on {report.attendance.rate}% attendance and {report.overallAvg}% academic performance
                </div>
              </div>
            </div>
          </div>

          {/* Teacher Comments */}
          <div className="card fade-up-4" style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '0.08em', marginBottom: 12 }}>TEACHER COMMENTS</h2>
            {report.comments.length > 0 ? report.comments.map(c => (
              <div key={c.id} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent)' }}>
                <div style={{ fontSize: 13, marginBottom: 4 }}>{c.comment}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', display: 'flex', gap: 12 }}>
                  <span>{c.teacher_name}</span>
                  <span className="tag" style={{ fontSize: 9 }}>{c.category}</span>
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            )) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}><Icon name="chat" size={14} /> No comments for this term.</div>
            )}
          </div>
        </div>
      )}

      {/* Teacher comment form */}
      {isTeacher && selectedStudent && report && (
        <div className="card fade-up-4" style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: '0.08em', marginBottom: 12 }}>ADD COMMENT</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select className="input" style={{ width: 150 }} value={conductNote} onChange={e => setConductNote(e.target.value)}>
              <option value="">Category...</option>
              <option value="academic">Academic</option>
              <option value="behavior">Behavior</option>
              <option value="effort">Effort</option>
              <option value="improvement">Improvement</option>
              <option value="general">General</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" placeholder="Write a comment for this student's report..." value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addComment() }} style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={addComment} disabled={!commentText.trim()}>Add</button>
          </div>
        </div>
      )}

      {!selectedStudent && isTeacher && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 20 }}>
          <Icon name="user" size={32} />
          Select a student to generate their report card.
        </div>
      )}
    </>
  )
}
