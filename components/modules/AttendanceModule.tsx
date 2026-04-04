'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import type { Profile, AttendanceRecord, AttendanceStatus, TimetableSlot } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatGrid } from '@/components/ui/StatGrid'
import { supabase } from '@/lib/supabase'
import { pushNotificationBatch, logActivity } from '@/lib/actions'
import { useToast } from '@/lib/toast'

/* ╔══════════════════════════════════════════════════════════╗
   ║  ATTENDANCE MODULE — Heatmap + Bulk Mark + Analytics     ║
   ╠══════════════════════════════════════════════════════════╣
   ║  Student: Calendar heatmap · Streak · Stats · Logs      ║
   ║  Teacher: Bulk mark · Date picker · History · Export     ║
   ╚══════════════════════════════════════════════════════════╝ */

const STATUS_CFG: Record<AttendanceStatus, { label: string; color: string; icon: string }> = {
  present: { label: 'Present', color: 'var(--success)', icon: '✓' },
  absent:  { label: 'Absent',  color: 'var(--danger)',  icon: '✗' },
  late:    { label: 'Late',    color: 'var(--warn)',    icon: '⏱' },
  excused: { label: 'Excused', color: '#8b5cf6',       icon: '✎' },
}
const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toDateStr(d: Date): string { return d.toISOString().slice(0, 10) }
function parseDate(s: string): Date { return new Date(s + 'T00:00:00') }

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate() + 1) }
  return days
}

function getWeekday(d: Date): number { return d.getDay() } // 0=Sun

/* ================================================================
   STUDENT ATTENDANCE MODULE
   ================================================================ */
interface StudentAttendanceProps {
  profile: Profile
}

export function StudentAttendanceModule({ profile }: StudentAttendanceProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear]   = useState(new Date().getFullYear())
  const [filterSubject, setFilterSubject] = useState('all')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const { toast } = useToast()

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', profile.id)
        .order('date', { ascending: false })
      if (error) throw error
      setRecords((data || []) as AttendanceRecord[])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load attendance', 'error')
    } finally {
      setLoading(false)
    }
  }, [profile.id, toast])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const subjects = useMemo(() => {
    const set = new Set(records.map(r => r.subject))
    return ['all', ...Array.from(set).sort()]
  }, [records])

  const filtered = useMemo(() =>
    filterSubject === 'all' ? records : records.filter(r => r.subject === filterSubject),
  [records, filterSubject])

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length
    const present = filtered.filter(r => r.status === 'present').length
    const absent  = filtered.filter(r => r.status === 'absent').length
    const late    = filtered.filter(r => r.status === 'late').length
    const excused = filtered.filter(r => r.status === 'excused').length
    const rate = total ? Math.round(((present + late) / total) * 100) : 0
    return { total, present, absent, late, excused, rate }
  }, [filtered])

  // Streak calculation
  const streak = useMemo(() => {
    const sorted = [...filtered].filter(r => r.status === 'present' || r.status === 'late')
      .map(r => r.date).sort().reverse()
    if (!sorted.length) return 0
    let count = 1
    for (let i = 1; i < sorted.length; i++) {
      const prev = parseDate(sorted[i - 1])
      const curr = parseDate(sorted[i])
      const diff = (prev.getTime() - curr.getTime()) / 86400000
      if (diff <= 1) count++
      else break
    }
    return count
  }, [filtered])

  // Calendar heatmap data
  const calDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth])
  const dateMap = useMemo(() => {
    const m = new Map<string, AttendanceRecord[]>()
    filtered.forEach(r => {
      const arr = m.get(r.date) || []
      arr.push(r)
      m.set(r.date, arr)
    })
    return m
  }, [filtered])

  const dayRecords = selectedDate ? (dateMap.get(selectedDate) || []) : []

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  const monthLabel = new Date(calYear, calMonth).toLocaleString('default', { month: 'long', year: 'numeric' })

  if (loading) return <div className="att-loading">Loading attendance…</div>

  return (
    <>
      <PageHeader title="MY ATTENDANCE" subtitle={<>Streak: <span style={{ color: 'var(--success)' }}>{streak} days</span> · Rate: <span style={{ color: stats.rate >= 80 ? 'var(--success)' : stats.rate >= 60 ? 'var(--warn)' : 'var(--danger)' }}>{stats.rate}%</span></>} />

      <StatGrid items={[
        { label: 'Present', value: stats.present },
        { label: 'Absent', value: stats.absent },
        { label: 'Late', value: stats.late },
        { label: 'Excused', value: stats.excused },
      ]} columns={4} />

      {/* Subject filter */}
      <div className="att-toolbar">
        <div className="att-filter-row">
          {subjects.map(s => (
            <button key={s} className={`att-pill ${filterSubject === s ? 'active' : ''}`} onClick={() => setFilterSubject(s)}>
              {s === 'all' ? 'All Subjects' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Heatmap */}
      <SectionLabel>Calendar</SectionLabel>
      <div className="att-cal card fade-up">
        <div className="att-cal-header">
          <button className="att-cal-nav" onClick={prevMonth}><span style={{ transform: 'rotate(180deg)', display: 'flex' }}><Icon name="arrow" /></span></button>
          <span className="att-cal-title">{monthLabel}</span>
          <button className="att-cal-nav" onClick={nextMonth}><Icon name="arrow" /></button>
        </div>
        <div className="att-cal-weekdays">
          {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="att-cal-wd">{d}</div>)}
        </div>
        <div className="att-cal-grid">
          {/* Leading blank cells */}
          {Array.from({ length: getWeekday(calDays[0]) }).map((_, i) => <div key={`b-${i}`} className="att-cal-cell empty" />)}
          {calDays.map(d => {
            const ds = toDateStr(d)
            const dayRecs = dateMap.get(ds) || []
            const today = toDateStr(new Date()) === ds
            let cellColor = 'transparent'
            if (dayRecs.length) {
              const allPresent = dayRecs.every(r => r.status === 'present')
              const anyAbsent = dayRecs.some(r => r.status === 'absent')
              const anyLate = dayRecs.some(r => r.status === 'late')
              if (allPresent) cellColor = 'rgba(16,185,129,0.25)'
              else if (anyAbsent) cellColor = 'rgba(239,68,68,0.25)'
              else if (anyLate) cellColor = 'rgba(245,158,11,0.25)'
              else cellColor = 'rgba(139,92,246,0.2)'
            }
            return (
              <div key={ds} className={`att-cal-cell ${today ? 'today' : ''} ${dayRecs.length ? 'has-data' : ''} ${selectedDate === ds ? 'selected' : ''}`}
                style={{ background: cellColor }}
                onClick={() => dayRecs.length ? setSelectedDate(selectedDate === ds ? null : ds) : undefined}>
                <span className="att-cal-num">{d.getDate()}</span>
                {dayRecs.length > 0 && (
                  <div className="att-cal-dots">
                    {dayRecs.slice(0, 3).map((r, i) => (
                      <span key={i} className="att-cal-dot" style={{ background: STATUS_CFG[r.status].color }} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day detail */}
      {selectedDate && dayRecords.length > 0 && (
        <div className="att-day-detail card fade-up" style={{ marginTop: 12 }}>
          <SectionLabel>{parseDate(selectedDate).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</SectionLabel>
          {dayRecords.map(r => (
            <div key={r.id} className="att-record-row">
              <span className="att-status-badge" style={{ background: STATUS_CFG[r.status].color }}>{STATUS_CFG[r.status].icon} {STATUS_CFG[r.status].label}</span>
              <span className="att-record-subject">{r.subject}</span>
              {r.note && <span className="att-record-note">— {r.note}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Recent records table */}
      <SectionLabel>Recent Records</SectionLabel>
      <div className="card fade-up-2">
        <table className="table">
          <thead><tr><th>Date</th><th>Subject</th><th>Status</th><th>Note</th></tr></thead>
          <tbody>
            {filtered.slice(0, 30).map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.date}</td>
                <td>{r.subject}</td>
                <td><span className="att-status-badge sm" style={{ background: STATUS_CFG[r.status].color }}>{STATUS_CFG[r.status].label}</span></td>
                <td style={{ color: 'var(--fg-dim)', fontSize: 11 }}>{r.note || '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--fg-dim)', padding: 20 }}><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={24} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No attendance records yet</span></div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ================================================================
   TEACHER ATTENDANCE MODULE
   ================================================================ */
interface TeacherAttendanceProps {
  profile: Profile
  students: Profile[]
  timetable: TimetableSlot[]
}

type BulkEntry = { student_id: string; student_name: string; status: AttendanceStatus; note: string }

export function TeacherAttendanceModule({ profile, students, timetable }: TeacherAttendanceProps) {
  const [records, setRecords]     = useState<AttendanceRecord[]>([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState<'mark' | 'history' | 'analytics'>('mark')

  // Mark attendance state
  const [markDate, setMarkDate]   = useState(toDateStr(new Date()))
  const [markSubject, setMarkSubject] = useState(profile.subject || '')
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([])
  const [saving, setSaving]       = useState(false)
  const [search, setSearch]       = useState('')
  const { toast } = useToast()

  // History state
  const [histDate, setHistDate]   = useState(toDateStr(new Date()))
  const [histSubject, setHistSubject] = useState('all')
  const [editModal, setEditModal] = useState<AttendanceRecord | null>(null)
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('present')
  const [editNote, setEditNote]   = useState('')

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('teacher_id', profile.id)
        .order('date', { ascending: false })
      if (error) throw error
      setRecords((data || []) as AttendanceRecord[])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load attendance', 'error')
    } finally {
      setLoading(false)
    }
  }, [profile.id, toast])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  // Init bulk entries when students/date/subject change
  useEffect(() => {
    // Check if records already exist for this date+subject
    const existing = markSubject
      ? records.filter(r => r.date === markDate && r.subject === markSubject)
      : []
    const existMap = new Map(existing.map(r => [r.student_id, r]))

    const entries: BulkEntry[] = students.map(s => {
      const ex = existMap.get(s.id)
      return {
        student_id: s.id,
        student_name: s.name,
        status: ex?.status || 'present',
        note: ex?.note || '',
      }
    })
    setBulkEntries(entries)
  }, [students, markDate, markSubject, records])

  const subjects = useMemo(() => {
    const set = new Set(records.map(r => r.subject))
    if (profile.subject) set.add(profile.subject)
    return Array.from(set).sort()
  }, [records, profile.subject])

  // Filtered history
  const histRecords = useMemo(() => {
    let r = records.filter(rec => rec.date === histDate)
    if (histSubject !== 'all') r = r.filter(rec => rec.subject === histSubject)
    return r
  }, [records, histDate, histSubject])

  // Analytics
  const analytics = useMemo(() => {
    const byStudent = new Map<string, { name: string; present: number; absent: number; late: number; excused: number; total: number }>()
    records.forEach(r => {
      const entry = byStudent.get(r.student_id) || { name: r.student_name, present: 0, absent: 0, late: 0, excused: 0, total: 0 }
      entry[r.status]++
      entry.total++
      byStudent.set(r.student_id, entry)
    })
    return Array.from(byStudent.entries())
      .map(([id, data]) => ({ id, ...data, rate: data.total ? Math.round(((data.present + data.late) / data.total) * 100) : 0 }))
      .sort((a, b) => b.rate - a.rate)
  }, [records])

  const overallRate = useMemo(() => {
    if (!records.length) return 0
    const attended = records.filter(r => r.status === 'present' || r.status === 'late').length
    return Math.round((attended / records.length) * 100)
  }, [records])

  // ── Timetable auto-detect: today's slots ──
  const todaySlots = useMemo(() => {
    const selectedDay = DAYS[parseDate(markDate).getDay()]
    return timetable.filter(s => s.day === selectedDay)
  }, [timetable, markDate])

  const markedSubjects = useMemo(() => {
    return new Set(records.filter(r => r.date === markDate).map(r => r.subject))
  }, [records, markDate])

  const quickMark = (subject: string) => {
    setMarkSubject(subject)
  }

  // ── Actions ──
  const markAll = (status: AttendanceStatus) => {
    setBulkEntries(prev => prev.map(e => ({ ...e, status })))
  }

  const updateEntry = (studentId: string, field: 'status' | 'note', value: string) => {
    setBulkEntries(prev => prev.map(e =>
      e.student_id === studentId ? { ...e, [field]: value } : e
    ))
  }

  const saveBulk = async () => {
    if (!markSubject || !markDate) return
    setSaving(true)
    try {
      const rows = bulkEntries.map(e => ({
        student_id: e.student_id,
        student_name: e.student_name,
        teacher_id: profile.id,
        subject: markSubject,
        date: markDate,
        status: e.status,
        note: e.note || null,
      }))

      const { error } = await supabase
        .from('attendance')
        .upsert(rows, { onConflict: 'student_id,teacher_id,subject,date' })

      if (error) throw error

      // Notify absent students
      const absentIds = bulkEntries.filter(e => e.status === 'absent').map(e => e.student_id)
      if (absentIds.length) {
        await pushNotificationBatch(absentIds, `⚠️ Marked absent in ${markSubject} on ${markDate}`, 'attendance')
      }
      await logActivity(`${profile.name} marked attendance for ${markSubject} on ${markDate}`, 'attendance')
      await fetchRecords()
      toast('Attendance saved', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save attendance', 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateRecord = async () => {
    if (!editModal) return
    try {
      const { error } = await supabase
        .from('attendance')
        .update({ status: editStatus, note: editNote || null })
        .eq('id', editModal.id)
      if (error) throw error
      setEditModal(null)
      await fetchRecords()
      toast('Record updated', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update record', 'error')
    }
  }

  const deleteRecord = async (id: string) => {
    if (!confirm('Delete this attendance record?')) return
    try {
      const { error } = await supabase.from('attendance').delete().eq('id', id)
      if (error) throw error
      await fetchRecords()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete record', 'error')
    }
  }

  const filteredBulk = search
    ? bulkEntries.filter(e => e.student_name.toLowerCase().includes(search.toLowerCase()))
    : bulkEntries

  if (loading) return <div className="att-loading">Loading attendance…</div>

  return (
    <>
      <PageHeader title="ATTENDANCE" subtitle={<>Overall rate: <span style={{ color: overallRate >= 80 ? 'var(--success)' : overallRate >= 60 ? 'var(--warn)' : 'var(--danger)' }}>{overallRate}%</span> · {records.length} records</>} />

      {/* View tabs */}
      <div className="att-view-tabs">
        {(['mark', 'history', 'analytics'] as const).map(v => (
          <button key={v} className={`att-view-tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
            <Icon name={v === 'mark' ? 'check' : v === 'history' ? 'clock' : 'chart'} size={14} />
            {v === 'mark' ? 'Mark' : v === 'history' ? 'History' : 'Analytics'}
          </button>
        ))}
      </div>

      {/* ── MARK ATTENDANCE ── */}
      {view === 'mark' && (
        <div className="fade-up">

          {/* Quick Mark — timetable-based auto-detect */}
          {todaySlots.length > 0 && (
            <div className="att-quick-section">
              <SectionLabel>Today&apos;s Timetable — Quick Mark</SectionLabel>
              <div className="att-quick-grid">
                {todaySlots.map(slot => {
                  const done = markedSubjects.has(slot.subject)
                  return (
                    <button key={slot.id}
                      className={`att-quick-card card ${done ? 'done' : ''} ${markSubject === slot.subject ? 'active' : ''}`}
                      onClick={() => quickMark(slot.subject)}>
                      <div className="att-quick-subject">{slot.subject}</div>
                      <div className="att-quick-meta">
                        <span><Icon name="clock" size={11} /> {slot.time}</span>
                        {slot.room && <span>📍 {slot.room}</span>}
                      </div>
                      {done && <div className="att-quick-done">✓ Marked</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="att-mark-controls card">
            <div className="att-mark-row">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={markDate} onChange={e => setMarkDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Subject</label>
                <input className="input" value={markSubject} onChange={e => setMarkSubject(e.target.value)} placeholder="e.g. Mathematics" list="att-subjects" />
                <datalist id="att-subjects">
                  {subjects.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
            </div>
            <div className="att-bulk-actions">
              <span className="label" style={{ marginRight: 8 }}>Quick set all:</span>
              {STATUSES.map(s => (
                <button key={s} className="att-bulk-btn" style={{ borderColor: STATUS_CFG[s].color, color: STATUS_CFG[s].color }} onClick={() => markAll(s)}>
                  {STATUS_CFG[s].icon} {STATUS_CFG[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="att-search">
            <Icon name="search" size={14} />
            <input className="input" placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Student list */}
          <div className="att-student-list card">
            {filteredBulk.map((entry, idx) => (
              <div key={entry.student_id} className={`att-student-row ${idx % 2 === 0 ? 'even' : ''}`}>
                <div className="att-student-name">{entry.student_name}</div>
                <div className="att-student-controls">
                  {STATUSES.map(s => (
                    <button key={s}
                      className={`att-status-btn ${entry.status === s ? 'active' : ''}`}
                      style={entry.status === s ? { background: STATUS_CFG[s].color, borderColor: STATUS_CFG[s].color, color: '#000' } : { borderColor: 'var(--border)', color: 'var(--fg-dim)' }}
                      onClick={() => updateEntry(entry.student_id, 'status', s)}
                      title={STATUS_CFG[s].label}>
                      {STATUS_CFG[s].icon}
                    </button>
                  ))}
                  <input className="att-note-input" placeholder="Note…" value={entry.note} onChange={e => updateEntry(entry.student_id, 'note', e.target.value)} />
                </div>
              </div>
            ))}
            {filteredBulk.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11 }}>No students found</div>}
          </div>

          <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={saveBulk} disabled={saving || !markSubject}>
            {saving ? 'Saving…' : `Save Attendance (${bulkEntries.length} students)`}
          </button>
        </div>
      )}

      {/* ── HISTORY ── */}
      {view === 'history' && (
        <div className="fade-up">
          <div className="att-hist-controls card">
            <div className="att-mark-row">
              <div>
                <label className="label">Date</label>
                <input type="date" className="input" value={histDate} onChange={e => setHistDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Subject</label>
                <select className="input" value={histSubject} onChange={e => setHistSubject(e.target.value)}>
                  <option value="all">All Subjects</option>
                  {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <StatGrid items={[
            { label: 'Present', value: histRecords.filter(r => r.status === 'present').length },
            { label: 'Absent', value: histRecords.filter(r => r.status === 'absent').length },
            { label: 'Late', value: histRecords.filter(r => r.status === 'late').length },
            { label: 'Excused', value: histRecords.filter(r => r.status === 'excused').length },
          ]} columns={4} />

          <div className="card">
            <table className="table">
              <thead><tr><th>Student</th><th>Subject</th><th>Status</th><th>Note</th><th style={{ width: 70 }}>Actions</th></tr></thead>
              <tbody>
                {histRecords.map(r => (
                  <tr key={r.id}>
                    <td>{r.student_name}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.subject}</td>
                    <td><span className="att-status-badge sm" style={{ background: STATUS_CFG[r.status].color }}>{STATUS_CFG[r.status].label}</span></td>
                    <td style={{ color: 'var(--fg-dim)', fontSize: 11 }}>{r.note || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" title="Edit" onClick={() => { setEditModal(r); setEditStatus(r.status); setEditNote(r.note || '') }}><Icon name="edit" size={13} /></button>
                        <button className="btn-icon" title="Delete" onClick={() => deleteRecord(r.id)}><Icon name="trash" size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {histRecords.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--fg-dim)' }}>No records for this date</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ANALYTICS ── */}
      {view === 'analytics' && (
        <div className="fade-up">
          <StatGrid items={[
            { label: 'Total Records', value: records.length },
            { label: 'Students Tracked', value: analytics.length },
            { label: 'Overall Rate', value: `${overallRate}%` },
            { label: 'Subjects', value: subjects.length },
          ]} columns={4} />

          <SectionLabel>Student Breakdown</SectionLabel>
          <div className="card">
            <table className="table">
              <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th><th>Rate</th></tr></thead>
              <tbody>
                {analytics.map(a => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td style={{ color: 'var(--success)' }}>{a.present}</td>
                    <td style={{ color: 'var(--danger)' }}>{a.absent}</td>
                    <td style={{ color: 'var(--warn)' }}>{a.late}</td>
                    <td style={{ color: '#8b5cf6' }}>{a.excused}</td>
                    <td>
                      <div className="att-rate-bar">
                        <div className="att-rate-fill" style={{ width: `${a.rate}%`, background: a.rate >= 80 ? 'var(--success)' : a.rate >= 60 ? 'var(--warn)' : 'var(--danger)' }} />
                        <span className="att-rate-label">{a.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {analytics.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-dim)' }}>No data yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Edit Attendance">
        {editModal && (
          <>
            <div style={{ marginBottom: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
              {editModal.student_name} · {editModal.subject} · {editModal.date}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="label">Status</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {STATUSES.map(s => (
                  <button key={s}
                    className={`att-status-btn ${editStatus === s ? 'active' : ''}`}
                    style={editStatus === s ? { background: STATUS_CFG[s].color, borderColor: STATUS_CFG[s].color, color: '#000' } : { borderColor: 'var(--border)' }}
                    onClick={() => setEditStatus(s)}>
                    {STATUS_CFG[s].icon} {STATUS_CFG[s].label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="label">Note</label>
              <input className="input" value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Optional note…" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={updateRecord}>Save</button>
              <button className="btn" onClick={() => setEditModal(null)}>Cancel</button>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
