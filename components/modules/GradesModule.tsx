'use client'
import { useState, useEffect, useMemo } from 'react'
import type { Profile, Attempt, Assignment, Submission, AttendanceRecord } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatGrid } from '@/components/ui/StatGrid'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'

/* ╔══════════════════════════════════════════════════════════╗
   ║  GRADES & REPORT CARD MODULE                            ║
   ╠══════════════════════════════════════════════════════════╣
   ║  Student: Subject grades · GPA · Report card            ║
   ║  Teacher: Class overview · Per-student · Distribution    ║
   ╚══════════════════════════════════════════════════════════╝ */

/* ── helpers ────────────────────────────────────────────── */

function letterGrade(pct: number): string {
  if (pct >= 90) return 'A'
  if (pct >= 80) return 'B'
  if (pct >= 70) return 'C'
  if (pct >= 60) return 'D'
  return 'F'
}

function gradeColor(letter: string): string {
  switch (letter) {
    case 'A': return 'var(--success)'
    case 'B': return '#22d3ee'
    case 'C': return 'var(--warn)'
    case 'D': return '#f97316'
    default:  return 'var(--danger)'
  }
}

function gpaFromPercent(pct: number): number {
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

interface SubjectGrade {
  subject: string
  testAvg: number | null
  testCount: number
  assignAvg: number | null
  assignCount: number
  attendRate: number | null
  attendTotal: number
  combined: number
  letter: string
  gpa: number
}

interface TestMeta { id: string; title: string; subject: string }

function computeSubjectGrade(
  subject: string,
  attempts: Attempt[],
  testSubjectMap: Record<string, string>,
  submissions: { score?: number; max_points: number; assignment_subject?: string }[],
  attendance: AttendanceRecord[],
): SubjectGrade {
  const lo = subject.toLowerCase()

  // Tests
  const sub_att = attempts.filter(a => testSubjectMap[a.test_id]?.toLowerCase() === lo)
  const testAvg = sub_att.length
    ? Math.round(sub_att.reduce((s, a) => s + (a.percent || 0), 0) / sub_att.length)
    : null

  // Assignments
  const sub_subs = submissions.filter(s => s.assignment_subject?.toLowerCase() === lo && s.score != null)
  const assignAvg = sub_subs.length
    ? Math.round(sub_subs.reduce((s, sub) => s + (sub.max_points > 0 ? (sub.score! / sub.max_points) * 100 : 0), 0) / sub_subs.length)
    : null

  // Attendance
  const sub_at = attendance.filter(a => a.subject?.toLowerCase() === lo)
  const attendRate = sub_at.length
    ? Math.round(
        (sub_at.filter(a => a.status === 'present' || a.status === 'late').length / sub_at.length) * 100,
      )
    : null

  // Combined: weighted average (test 50%, assign 30%, attend 20%)
  let tw = 0, ws = 0
  if (testAvg != null)   { tw += 50; ws += testAvg * 50 }
  if (assignAvg != null) { tw += 30; ws += assignAvg * 30 }
  if (attendRate != null) { tw += 20; ws += attendRate * 20 }

  const combined = tw > 0 ? Math.round(ws / tw) : 0
  return {
    subject,
    testAvg, testCount: sub_att.length,
    assignAvg, assignCount: sub_subs.length,
    attendRate, attendTotal: sub_at.length,
    combined, letter: letterGrade(combined), gpa: gpaFromPercent(combined),
  }
}

/* ================================================================
   STUDENT GRADES MODULE
   ================================================================ */

interface StudentGradesProps {
  profile: Profile
  attempts: Attempt[]
  assignments: (Assignment & { submissions?: Submission[] })[]
  allCourses: { id: string; subject: string }[]
}

export function StudentGradesModule({ profile, attempts, assignments, allCourses }: StudentGradesProps) {
  const { toast } = useToast()
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [testsMeta, setTestsMeta]   = useState<TestMeta[]>([])
  const [view, setView]             = useState<'overview' | 'subjects' | 'report'>('overview')
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('attendance').select('*').eq('student_id', profile.id),
      supabase.from('tests').select('id, title, subject'),
    ]).then(([att, ts]) => {
      if (att.error) throw att.error
      if (ts.error) throw ts.error
      if (att.data) setAttendance(att.data)
      if (ts.data)  setTestsMeta(ts.data as TestMeta[])
    }).catch(err => {
      toast(err instanceof Error ? err.message : 'Failed to load grade data', 'error')
    })
  }, [profile.id, toast])

  const testSubjectMap = useMemo(() => {
    const m: Record<string, string> = {}
    testsMeta.forEach(t => { m[t.id] = t.subject })
    return m
  }, [testsMeta])

  const subjects = useMemo(() => {
    const set = new Set<string>()
    testsMeta.forEach(t => { if (t.subject) set.add(t.subject) })
    assignments.forEach(a => {
      const c = allCourses.find(c => c.id === a.course_id)
      if (c?.subject) set.add(c.subject)
    })
    attendance.forEach(a => { if (a.subject) set.add(a.subject) })
    return Array.from(set).sort()
  }, [testsMeta, assignments, allCourses, attendance])

  const mySubmissions = useMemo(() =>
    assignments.flatMap(a => {
      const c = allCourses.find(c => c.id === a.course_id)
      return (a.submissions || [])
        .filter(s => s.student_id === profile.id && !s.is_draft)
        .map(s => ({ ...s, max_points: a.max_points, assignment_subject: c?.subject || '', assignment_title: a.title }))
    }), [assignments, allCourses, profile.id])

  const subjectGrades = useMemo(() =>
    subjects.map(s => computeSubjectGrade(s, attempts, testSubjectMap, mySubmissions, attendance)),
    [subjects, attempts, testSubjectMap, mySubmissions, attendance])

  const overallGPA = useMemo(() => {
    if (!subjectGrades.length) return 0
    return +(subjectGrades.reduce((s, g) => s + g.gpa, 0) / subjectGrades.length).toFixed(2)
  }, [subjectGrades])

  const overallAvg = useMemo(() => {
    if (!subjectGrades.length) return 0
    return Math.round(subjectGrades.reduce((s, g) => s + g.combined, 0) / subjectGrades.length)
  }, [subjectGrades])

  const bestSubject = useMemo(() => {
    if (!subjectGrades.length) return '—'
    return subjectGrades.reduce((a, b) => a.combined > b.combined ? a : b).subject
  }, [subjectGrades])

  const sel = selectedSubject ? subjectGrades.find(g => g.subject === selectedSubject) : null

  return (
    <>
      <PageHeader title="GRADES & REPORT CARD" subtitle="Academic performance summary" />

      <div className="gr-views fade-up-1">
        {(['overview', 'subjects', 'report'] as const).map(v => (
          <button key={v} className={`gr-view-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
            {v === 'overview' ? 'Overview' : v === 'subjects' ? 'Subjects' : 'Report Card'}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {view === 'overview' && (
        <>
          <StatGrid items={[
            { label: 'GPA', value: overallGPA.toFixed(2) },
            { label: 'Overall Avg', value: `${overallAvg}%` },
            { label: 'Subjects', value: subjects.length },
            { label: 'Best Subject', value: bestSubject },
          ]} columns={4} />

          <SectionLabel>Grade Breakdown</SectionLabel>
          <div className="gr-subject-grid fade-up-3">
            {subjectGrades.map(g => (
              <div key={g.subject} className="gr-subject-card" onClick={() => { setSelectedSubject(g.subject); setView('subjects') }}>
                <div className="gr-subject-header">
                  <span className="gr-subject-name">{g.subject}</span>
                  <span className="gr-letter" style={{ color: gradeColor(g.letter) }}>{g.letter}</span>
                </div>
                <div className="gr-bar-wrap">
                  <div className="gr-bar-fill" style={{ width: `${g.combined}%`, background: gradeColor(g.letter) }} />
                </div>
                <div className="gr-subject-stats">
                  <span>{g.combined}%</span>
                  <span>GPA {g.gpa.toFixed(1)}</span>
                </div>
              </div>
            ))}
            {!subjectGrades.length && <div className="gr-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><Icon name="chart" size={32} />No grade data yet. Complete tests and assignments to see your grades.</div>}
          </div>
        </>
      )}

      {/* ── SUBJECTS DETAIL ── */}
      {view === 'subjects' && (
        <>
          <div className="gr-pill-row fade-up-2">
            {subjects.map(s => (
              <button key={s} className={`gr-pill ${selectedSubject === s ? 'active' : ''}`} onClick={() => setSelectedSubject(s)}>{s}</button>
            ))}
          </div>

          {sel ? (
            <div className="fade-up-3">
              <div className="gr-detail-header">
                <div>
                  <h3 className="gr-detail-title">{sel.subject}</h3>
                  <span className="gr-detail-sub">Combined: {sel.combined}% · GPA: {sel.gpa.toFixed(2)}</span>
                </div>
                <span className="gr-detail-letter" style={{ color: gradeColor(sel.letter) }}>{sel.letter}</span>
              </div>

              <div className="gr-breakdown-grid">
                <div className="gr-breakdown-card">
                  <div className="gr-breakdown-label"><Icon name="test" size={14} /> Tests</div>
                  <div className="gr-breakdown-value">{sel.testAvg != null ? `${sel.testAvg}%` : '—'}</div>
                  <div className="gr-breakdown-meta">{sel.testCount} test{sel.testCount !== 1 ? 's' : ''} · 50% weight</div>
                </div>
                <div className="gr-breakdown-card">
                  <div className="gr-breakdown-label"><Icon name="task" size={14} /> Assignments</div>
                  <div className="gr-breakdown-value">{sel.assignAvg != null ? `${sel.assignAvg}%` : '—'}</div>
                  <div className="gr-breakdown-meta">{sel.assignCount} graded · 30% weight</div>
                </div>
                <div className="gr-breakdown-card">
                  <div className="gr-breakdown-label"><Icon name="check" size={14} /> Attendance</div>
                  <div className="gr-breakdown-value">{sel.attendRate != null ? `${sel.attendRate}%` : '—'}</div>
                  <div className="gr-breakdown-meta">{sel.attendTotal} record{sel.attendTotal !== 1 ? 's' : ''} · 20% weight</div>
                </div>
              </div>

              <SectionLabel>Test Scores</SectionLabel>
              <div className="gr-scores-list">
                {attempts
                  .filter(a => testSubjectMap[a.test_id]?.toLowerCase() === sel.subject.toLowerCase())
                  .map(a => {
                    const t = testsMeta.find(t => t.id === a.test_id)
                    return (
                      <div key={a.id} className="gr-score-row">
                        <span className="gr-score-name">{t?.title || a.test_id}</span>
                        <span className="gr-score-val" style={{ color: gradeColor(letterGrade(a.percent)) }}>{a.percent}%</span>
                      </div>
                    )
                  })}
                {!attempts.filter(a => testSubjectMap[a.test_id]?.toLowerCase() === sel.subject.toLowerCase()).length && (
                  <div className="gr-empty">No test scores yet</div>
                )}
              </div>

              <SectionLabel>Assignment Scores</SectionLabel>
              <div className="gr-scores-list">
                {mySubmissions
                  .filter(s => s.assignment_subject?.toLowerCase() === sel.subject.toLowerCase() && s.score != null)
                  .map(s => {
                    const pct = Math.round((s.score! / s.max_points) * 100)
                    return (
                      <div key={s.id} className="gr-score-row">
                        <span className="gr-score-name">{s.assignment_title}</span>
                        <span className="gr-score-val" style={{ color: gradeColor(letterGrade(pct)) }}>{s.score}/{s.max_points} ({pct}%)</span>
                      </div>
                    )
                  })}
                {!mySubmissions.filter(s => s.assignment_subject?.toLowerCase() === sel.subject.toLowerCase() && s.score != null).length && (
                  <div className="gr-empty">No graded assignments yet</div>
                )}
              </div>
            </div>
          ) : (
            <div className="gr-empty fade-up-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><Icon name="book" size={32} />Select a subject to view detailed grades</div>
          )}
        </>
      )}

      {/* ── REPORT CARD ── */}
      {view === 'report' && (
        <div className="gr-report fade-up-2">
          <div className="gr-report-header">
            <div>
              <h3 className="gr-report-title">Academic Report Card</h3>
              <p className="gr-report-sub">{profile.name} · {profile.qgx_id} · Grade {profile.grade || '—'}</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
              <Icon name="download" size={12} /> Print / Save PDF
            </button>
          </div>

          <table className="gr-report-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Tests</th>
                <th>Assignments</th>
                <th>Attendance</th>
                <th>Combined</th>
                <th>Grade</th>
                <th>GPA</th>
              </tr>
            </thead>
            <tbody>
              {subjectGrades.map(g => (
                <tr key={g.subject}>
                  <td className="gr-report-subject">{g.subject}</td>
                  <td>{g.testAvg != null ? `${g.testAvg}%` : '—'}</td>
                  <td>{g.assignAvg != null ? `${g.assignAvg}%` : '—'}</td>
                  <td>{g.attendRate != null ? `${g.attendRate}%` : '—'}</td>
                  <td style={{ fontWeight: 600 }}>{g.combined}%</td>
                  <td><span className="gr-report-letter" style={{ color: gradeColor(g.letter) }}>{g.letter}</span></td>
                  <td>{g.gpa.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="gr-report-subject">Overall</td>
                <td>—</td>
                <td>—</td>
                <td>—</td>
                <td style={{ fontWeight: 600 }}>{overallAvg}%</td>
                <td><span className="gr-report-letter" style={{ color: gradeColor(letterGrade(overallAvg)) }}>{letterGrade(overallAvg)}</span></td>
                <td>{overallGPA.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          {!subjectGrades.length && <div className="gr-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}><Icon name="chart" size={32} />No grade data available for report card.</div>}
        </div>
      )}
    </>
  )
}

/* ================================================================
   TEACHER GRADES MODULE
   ================================================================ */

interface TeacherGradesProps {
  profile: Profile
  students: Profile[]
  allAttempts: Attempt[]
  assignments: (Assignment & { submissions?: Submission[] })[]
  courses: { id: string; subject: string }[]
}

export function TeacherGradesModule({ profile, students, allAttempts, assignments, courses }: TeacherGradesProps) {
  const { toast } = useToast()
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [testsMeta, setTestsMeta]   = useState<TestMeta[]>([])
  const [view, setView]             = useState<'overview' | 'students' | 'distribution'>('overview')
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('attendance').select('*').eq('teacher_id', profile.id),
      supabase.from('tests').select('id, title, subject').eq('teacher_id', profile.id),
    ]).then(([att, ts]) => {
      if (att.error) throw att.error
      if (ts.error) throw ts.error
      if (att.data) setAttendance(att.data)
      if (ts.data)  setTestsMeta(ts.data as TestMeta[])
    }).catch(err => {
      toast(err instanceof Error ? err.message : 'Failed to load grade data', 'error')
    })
  }, [profile.id, toast])

  const testSubjectMap = useMemo(() => {
    const m: Record<string, string> = {}
    testsMeta.forEach(t => { m[t.id] = t.subject })
    return m
  }, [testsMeta])

  const subjects = useMemo(() => {
    const set = new Set<string>()
    testsMeta.forEach(t => { if (t.subject) set.add(t.subject) })
    return Array.from(set).sort()
  }, [testsMeta])

  const studentGrades = useMemo(() => {
    return students.map(student => {
      const sa = allAttempts.filter(a => a.student_id === student.id)
      const ss = assignments.flatMap(a => {
        const c = courses.find(c => c.id === a.course_id)
        return (a.submissions || [])
          .filter(s => s.student_id === student.id && !s.is_draft)
          .map(s => ({ ...s, max_points: a.max_points, assignment_subject: c?.subject || '' }))
      })
      const sAtt = attendance.filter(a => a.student_id === student.id)

      const grades = subjects.map(s => computeSubjectGrade(s, sa, testSubjectMap, ss, sAtt))
      const avg = grades.length ? Math.round(grades.reduce((s, g) => s + g.combined, 0) / grades.length) : 0
      const gpa = grades.length ? +(grades.reduce((s, g) => s + g.gpa, 0) / grades.length).toFixed(2) : 0
      return { student, grades, avg, gpa, letter: letterGrade(avg) }
    }).sort((a, b) => b.avg - a.avg)
  }, [students, allAttempts, assignments, courses, attendance, subjects, testSubjectMap])

  const filteredStudents = useMemo(() => {
    if (!searchTerm) return studentGrades
    const q = searchTerm.toLowerCase()
    return studentGrades.filter(sg => sg.student.name.toLowerCase().includes(q) || sg.student.qgx_id?.toLowerCase().includes(q))
  }, [studentGrades, searchTerm])

  const classAvg = useMemo(() => {
    if (!studentGrades.length) return 0
    return Math.round(studentGrades.reduce((s, sg) => s + sg.avg, 0) / studentGrades.length)
  }, [studentGrades])

  const distribution = useMemo(() => {
    const d: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    studentGrades.forEach(sg => { d[sg.letter]++ })
    return d
  }, [studentGrades])

  const passingRate = useMemo(() => {
    if (!studentGrades.length) return 0
    return Math.round((studentGrades.filter(sg => sg.avg >= 60).length / studentGrades.length) * 100)
  }, [studentGrades])

  const selSG = selectedStudent ? studentGrades.find(sg => sg.student.id === selectedStudent) : null

  return (
    <>
      <PageHeader title="GRADES" subtitle="Class grades & distribution" />

      <div className="gr-views fade-up-1">
        {(['overview', 'students', 'distribution'] as const).map(v => (
          <button key={v} className={`gr-view-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
            {v === 'overview' ? 'Class Overview' : v === 'students' ? 'By Student' : 'Distribution'}
          </button>
        ))}
      </div>

      {/* ── CLASS OVERVIEW ── */}
      {view === 'overview' && (
        <>
          <StatGrid items={[
            { label: 'Class Average', value: `${classAvg}%` },
            { label: 'Students', value: students.length },
            { label: 'Pass Rate', value: `${passingRate}%` },
            { label: 'Subjects', value: subjects.length },
          ]} columns={4} />

          <SectionLabel>Class Rankings</SectionLabel>
          <div className="gr-rankings fade-up-3">
            {studentGrades.slice(0, 25).map((sg, i) => (
              <div key={sg.student.id} className={`gr-rank-row ${sg.avg < 60 ? 'failing' : ''}`} onClick={() => { setSelectedStudent(sg.student.id); setView('students') }}>
                <span className="gr-rank-pos">#{i + 1}</span>
                <span className="gr-rank-avatar">{sg.student.avatar}</span>
                <span className="gr-rank-name">{sg.student.name}</span>
                <span className="gr-rank-bar-wrap">
                  <span className="gr-rank-bar" style={{ width: `${sg.avg}%`, background: gradeColor(sg.letter) }} />
                </span>
                <span className="gr-rank-pct">{sg.avg}%</span>
                <span className="gr-rank-letter" style={{ color: gradeColor(sg.letter) }}>{sg.letter}</span>
              </div>
            ))}
            {!studentGrades.length && <div className="gr-empty">No student data available.</div>}
          </div>
        </>
      )}

      {/* ── BY STUDENT ── */}
      {view === 'students' && (
        <>
          <div className="gr-search fade-up-2">
            <input className="input" placeholder="Search students..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>

          <div className="gr-student-layout fade-up-3">
            <div className="gr-student-list">
              {filteredStudents.map(sg => (
                <div key={sg.student.id} className={`gr-student-item ${selectedStudent === sg.student.id ? 'active' : ''}`} onClick={() => setSelectedStudent(sg.student.id)}>
                  <span className="gr-rank-avatar">{sg.student.avatar}</span>
                  <div className="gr-student-info">
                    <span className="gr-student-sname">{sg.student.name}</span>
                    <span className="gr-student-meta">{sg.avg}% · {sg.letter}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="gr-student-detail">
              {selSG ? (
                <>
                  <div className="gr-detail-header">
                    <div>
                      <h3 className="gr-detail-title">{selSG.student.name}</h3>
                      <span className="gr-detail-sub">GPA: {selSG.gpa.toFixed(2)} · Overall: {selSG.avg}%</span>
                    </div>
                    <span className="gr-detail-letter" style={{ color: gradeColor(selSG.letter) }}>{selSG.letter}</span>
                  </div>
                  <div className="gr-scores-list">
                    {selSG.grades.map(g => (
                      <div key={g.subject} className="gr-score-row">
                        <span className="gr-score-name">{g.subject}</span>
                        <div className="gr-score-breakdown">
                          <span className="gr-score-part" title="Tests">{g.testAvg != null ? `T:${g.testAvg}%` : 'T:—'}</span>
                          <span className="gr-score-part" title="Assignments">{g.assignAvg != null ? `A:${g.assignAvg}%` : 'A:—'}</span>
                          <span className="gr-score-part" title="Attendance">{g.attendRate != null ? `P:${g.attendRate}%` : 'P:—'}</span>
                        </div>
                        <span className="gr-score-val" style={{ color: gradeColor(g.letter) }}>{g.combined}% {g.letter}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="gr-empty">Select a student to view their grades</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── DISTRIBUTION ── */}
      {view === 'distribution' && (
        <>
          <SectionLabel>Grade Distribution</SectionLabel>
          <div className="gr-dist-chart fade-up-2">
            {Object.entries(distribution).map(([letter, count]) => {
              const pct = studentGrades.length ? Math.round((count / studentGrades.length) * 100) : 0
              return (
                <div key={letter} className="gr-dist-col">
                  <span className="gr-dist-count">{count}</span>
                  <div className="gr-dist-bar-wrap">
                    <div className="gr-dist-bar" style={{ height: `${pct}%`, background: gradeColor(letter) }} />
                  </div>
                  <span className="gr-dist-label" style={{ color: gradeColor(letter) }}>{letter}</span>
                  <span className="gr-dist-pct">{pct}%</span>
                </div>
              )
            })}
          </div>

          <SectionLabel>Per-Subject Averages</SectionLabel>
          <div className="gr-per-subject fade-up-3">
            {subjects.map(subject => {
              const subDist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
              studentGrades.forEach(sg => {
                const g = sg.grades.find(g => g.subject === subject)
                if (g) subDist[g.letter]++
              })
              const subAvg = studentGrades.length
                ? Math.round(studentGrades.reduce((s, sg) => {
                    const g = sg.grades.find(g => g.subject === subject)
                    return s + (g?.combined || 0)
                  }, 0) / studentGrades.length)
                : 0
              return (
                <div key={subject} className="gr-subject-dist-card">
                  <div className="gr-subject-dist-header">
                    <span>{subject}</span>
                    <span style={{ color: gradeColor(letterGrade(subAvg)) }}>{subAvg}% ({letterGrade(subAvg)})</span>
                  </div>
                  <div className="gr-mini-dist">
                    {Object.entries(subDist).map(([l, c]) => (
                      <span key={l} className="gr-mini-dist-item" style={{ color: gradeColor(l) }}>{l}:{c}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {!subjects.length && <div className="gr-empty">No data available for distribution.</div>}
        </>
      )}
    </>
  )
}
