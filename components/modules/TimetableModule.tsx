'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import type { Profile, TimetableSlot } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { JitsiMeet } from '@/components/ui/JitsiMeet'

/* ── constants ── */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7) // 7:00 – 20:00
const DEFAULT_CHECKIN_XP = 10

const SUBJECT_COLORS: Record<string, string> = {
  math: '#3b82f6', mathematics: '#3b82f6', algebra: '#3b82f6', calculus: '#3b82f6', geometry: '#3b82f6',
  science: '#10b981', physics: '#10b981', chemistry: '#22d3ee', biology: '#34d399',
  english: '#f59e0b', literature: '#f59e0b', writing: '#f59e0b',
  history: '#ef4444', geography: '#ef4444', social: '#ef4444',
  coding: '#8b5cf6', programming: '#8b5cf6', computer: '#8b5cf6', cs: '#8b5cf6',
  art: '#ec4899', music: '#ec4899', drama: '#ec4899',
  pe: '#f97316', sports: '#f97316', health: '#f97316',
}

function getSubjectColor(subject: string): string {
  const lower = subject.toLowerCase()
  for (const [key, color] of Object.entries(SUBJECT_COLORS)) {
    if (lower.includes(key)) return color
  }
  let hash = 0
  for (let i = 0; i < lower.length; i++) hash = lower.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 55%)`
}

function parseTime(time: string): { startHour: number; startMin: number; endHour: number; endMin: number } | null {
  const match = time.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (!match) {
    const single = time.match(/(\d{1,2}):(\d{2})/)
    if (!single) return null
    const h = parseInt(single[1]), m = parseInt(single[2])
    return { startHour: h, startMin: m, endHour: h + 1, endMin: m }
  }
  return {
    startHour: parseInt(match[1]), startMin: parseInt(match[2]),
    endHour: parseInt(match[3]), endMin: parseInt(match[4]),
  }
}

function getDurationMins(time: string): number {
  const t = parseTime(time)
  if (!t) return 60
  return (t.endHour * 60 + t.endMin) - (t.startHour * 60 + t.startMin)
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function formatHour(h: number): string {
  const suffix = h >= 12 ? 'PM' : 'AM'
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${display} ${suffix}`
}

function isNowInSlot(day: string, time: string): boolean {
  const now = new Date()
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (dayNames[now.getDay()] !== day) return false
  const t = parseTime(time)
  if (!t) return false
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= t.startHour * 60 + t.startMin && mins <= t.endHour * 60 + t.endMin
}

/** Returns time in minutes until a slot starts today, or -1 if past/different day */
function minutesUntilSlot(day: string, time: string): number {
  const now = new Date()
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (dayNames[now.getDay()] !== day) return -1
  const t = parseTime(time)
  if (!t) return -1
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const startMins = t.startHour * 60 + t.startMin
  return startMins > nowMins ? startMins - nowMins : -1
}

function getCurrentTimePosition(): number {
  const now = new Date()
  const hour = now.getHours()
  const min = now.getMinutes()
  if (hour < 7 || hour >= 21) return -1
  return ((hour - 7) * 60 + min) / (14 * 60) * 100
}

type ViewMode = 'week' | 'day' | 'list'

/* ── component ── */
interface TimetableModuleProps {
  profile: Profile
  timetable: TimetableSlot[]
  setTimetable: React.Dispatch<React.SetStateAction<TimetableSlot[]>>
  onProfileUpdate?: (p: Profile) => void
  checkinXP?: number
}

export function TimetableModule({ profile, timetable, setTimetable, onProfileUpdate, checkinXP }: TimetableModuleProps) {
  const { toast } = useToast()
  const xpReward = checkinXP ?? DEFAULT_CHECKIN_XP
  const isStudent = profile.role === 'student'
  const isTeacher = profile.role === 'teacher' || profile.role === 'admin'
  const [view, setView] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth <= 480 ? 'day' : 'week'
  )
  const [selectedDay, setSelectedDay] = useState<string>(
    (() => { const d = new Date().getDay(); return DAYS[d === 0 ? 5 : d - 1] })()
  )
  const [slotModal, setSlotModal] = useState(false)
  const [jitsiRoom, setJitsiRoom] = useState<TimetableSlot | null>(null)
  const [editSlot, setEditSlot] = useState<TimetableSlot | null>(null)
  const [form, setForm] = useState({ subject: '', day: 'Monday', time: '', room: '' })
  const [searchQ, setSearchQ] = useState('')
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set())
  const [checkingIn, setCheckingIn] = useState<string | null>(null)
  const [, setTick] = useState(0) // force re-render every minute for countdown
  const tickRef = useRef<ReturnType<typeof setInterval>>()

  /* ── minute ticker for live countdown ── */
  useEffect(() => {
    tickRef.current = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(tickRef.current)
  }, [])

  /* ── Load today's check-ins from localStorage ── */
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const key = `qgx-checkins-${profile.id}-${todayStr}`
    const saved = localStorage.getItem(key)
    if (saved) {
      try { setCheckedIn(new Set(JSON.parse(saved))) } catch { /* empty */ }
    }
  }, [profile.id])

  /* ── today helpers ── */
  const todayName = (() => {
    const d = new Date().getDay()
    return DAYS[d === 0 ? 5 : d - 1]
  })()

  /* ── filtered timetable ── */
  const filtered = useMemo(() => {
    if (!searchQ.trim()) return timetable
    const q = searchQ.toLowerCase()
    return timetable.filter(s =>
      s.subject.toLowerCase().includes(q) ||
      s.teacher_name?.toLowerCase().includes(q) ||
      s.room?.toLowerCase().includes(q)
    )
  }, [timetable, searchQ])

  /* ── Check-in XP (students only) ── */
  const handleCheckIn = async (slot: TimetableSlot) => {
    if (!isStudent || checkedIn.has(slot.id) || checkingIn) return
    if (!isNowInSlot(slot.day, slot.time)) {
      toast('Check-in only available during live class', 'error'); return
    }
    setCheckingIn(slot.id)
    try {
      const todayStr = new Date().toISOString().slice(0, 10)
      // Server-side deduplication: check if attendance row already exists for this slot+date
      const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('student_id', profile.id)
        .eq('subject', slot.subject)
        .eq('date', todayStr)
        .limit(1)
      if (existing && existing.length > 0) {
        // Already checked in server-side — just update local state
        const updated = new Set(checkedIn)
        updated.add(slot.id)
        setCheckedIn(updated)
        const key = `qgx-checkins-${profile.id}-${todayStr}`
        localStorage.setItem(key, JSON.stringify(Array.from(updated)))
        toast('Already checked in for this class today', 'info')
        return
      }
      const newXP = (profile.xp || 0) + xpReward
      await supabase.from('profiles').update({ xp: newXP }).eq('id', profile.id)
      // Record attendance as server-side check-in proof
      await supabase.from('attendance').insert({
        student_id: profile.id,
        student_name: profile.name,
        teacher_id: slot.teacher_id,
        subject: slot.subject,
        date: todayStr,
        status: 'present',
        note: `Auto check-in +${xpReward} XP`,
      })
      const key = `qgx-checkins-${profile.id}-${todayStr}`
      const updated = new Set(checkedIn)
      updated.add(slot.id)
      setCheckedIn(updated)
      localStorage.setItem(key, JSON.stringify(Array.from(updated)))
      if (onProfileUpdate) onProfileUpdate({ ...profile, xp: newXP })
      toast(`✓ Checked in! +${xpReward} XP`, 'success')
    } catch {
      toast('Check-in failed', 'error')
    } finally {
      setCheckingIn(null)
    }
  }

  /* ── Weekly check-in count ── */
  const weeklyCheckIns = useMemo(() => {
    void checkedIn.size
    let total = 0
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = `qgx-checkins-${profile.id}-${d.toISOString().slice(0, 10)}`
      const saved = localStorage.getItem(key)
      if (saved) {
        try { total += JSON.parse(saved).length } catch { /* empty */ }
      }
    }
    return total
  }, [profile.id, checkedIn])

  /* ── CRUD (teacher only) ── */
  const openAdd = () => {
    setEditSlot(null)
    setForm({ subject: '', day: selectedDay || 'Monday', time: '', room: '' })
    setSlotModal(true)
  }

  const openEdit = (slot: TimetableSlot) => {
    setEditSlot(slot)
    setForm({ subject: slot.subject, day: slot.day, time: slot.time, room: slot.room })
    setSlotModal(true)
  }

  const saveSlot = async () => {
    if (!form.subject || !form.time) return
    if (!/^\d{1,2}:\d{2}(\s*-\s*\d{1,2}:\d{2})?$/.test(form.time.trim())) {
      toast('Time format: HH:MM or HH:MM - HH:MM', 'error'); return
    }
    try {
      const room = form.room || `qgx-${form.subject.toLowerCase().replace(/\s+/g, '-')}-${crypto.randomUUID().slice(0, 8)}`
      if (editSlot) {
        const { data } = await supabase.from('timetable').update({ ...form, room })
          .eq('id', editSlot.id).eq('teacher_id', profile.id).select().single()
        if (data) setTimetable(prev => prev.map(s => s.id === editSlot.id ? data : s))
      } else {
        const { data } = await supabase.from('timetable').insert({
          ...form, room, teacher_id: profile.id, teacher_name: profile.name,
        }).select().single()
        if (data) setTimetable(prev => [...prev, data])
      }
      setSlotModal(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save slot', 'error')
    }
  }

  const deleteSlot = async (id: string) => {
    if (!confirm('Delete this timetable slot?')) return
    try {
      await supabase.from('timetable').delete().eq('id', id).eq('teacher_id', profile.id)
      setTimetable(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete slot', 'error')
    }
  }

  /* ── stats ── */
  const todaySlots = timetable.filter(s => s.day === todayName)
    .sort((a, b) => {
      const ta = parseTime(a.time), tb = parseTime(b.time)
      if (!ta || !tb) return 0
      return (ta.startHour * 60 + ta.startMin) - (tb.startHour * 60 + tb.startMin)
    })
  const liveSlot = timetable.find(s => isNowInSlot(s.day, s.time))
  const uniqueSubjects = Array.from(new Set(timetable.map(s => s.subject)))

  /* ── Next upcoming class (today only) ── */
  const nextUp = useMemo(() => {
    let bestSlot: TimetableSlot | null = null
    let bestMins = Infinity
    for (const s of timetable) {
      const m = minutesUntilSlot(s.day, s.time)
      if (m > 0 && m < bestMins) { bestMins = m; bestSlot = s }
    }
    return bestSlot ? { slot: bestSlot, minutes: bestMins } : null
  }, [timetable])

  /* ── Total weekly hours ── */
  const totalWeeklyMins = useMemo(() =>
    timetable.reduce((sum, s) => sum + getDurationMins(s.time), 0)
  , [timetable])

  /* ── Jitsi room slug helper ── */
  const getJitsiSlug = (slot: TimetableSlot) =>
    `qgx-${slot.subject}-${slot.room}-${slot.day}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

  /* ── Embedded Jitsi view ── */
  if (jitsiRoom) {
    return (
      <JitsiMeet
        roomName={getJitsiSlug(jitsiRoom)}
        displayName={profile.name}
        subject={jitsiRoom.subject}
        onClose={() => setJitsiRoom(null)}
      />
    )
  }

  /* ── render slot card ── */
  const SlotCard = ({ slot, compact = false, periodNum }: { slot: TimetableSlot; compact?: boolean; periodNum?: number }) => {
    const color = getSubjectColor(slot.subject)
    const live = isNowInSlot(slot.day, slot.time)
    const dur = getDurationMins(slot.time)
    const didCheckIn = checkedIn.has(slot.id)
    return (
      <div className={`tt-slot ${live ? 'tt-slot-live' : ''} ${compact ? 'tt-slot-compact' : ''}`}
        style={{ borderLeftColor: color }}>
        <div className="tt-slot-header">
          <div className="tt-slot-header-left">
            {live && <div className="tt-live-badge"><span className="tt-live-dot" /> LIVE NOW</div>}
            {didCheckIn && <div className="tt-checkin-badge">✓ Checked In · +{xpReward} XP</div>}
            <div className="tt-slot-subject" style={{ color }}>
              {periodNum !== undefined && <span className="tt-period-num">P{periodNum}</span>}
              {slot.subject}
            </div>
            <div className="tt-slot-meta">
              <span className="tt-slot-time-pill"><Icon name="clock" size={9} /> {slot.time}</span>
              <span className="tt-slot-dur-pill">{formatDuration(dur)}</span>
            </div>
          </div>
          <div className="tt-slot-color-dot" style={{ background: color }} />
        </div>
        {!compact && (
          <div className="tt-slot-detail">
            <div className="tt-slot-teacher">
              <Icon name="user" size={9} /> {isTeacher ? `Room: ${slot.room}` : slot.teacher_name}
            </div>
            {!isTeacher && slot.room && (
              <div className="tt-slot-room">
                <Icon name="video" size={9} /> {slot.room}
              </div>
            )}
          </div>
        )}
        <div className="tt-slot-actions">
          <button className="btn btn-xs" style={{ borderColor: color, color }}
            onClick={e => { e.stopPropagation(); setJitsiRoom(slot) }}>
            <Icon name="video" size={10} /> Join
          </button>
          {isStudent && live && !didCheckIn && (
            <button className="btn btn-xs tt-checkin-btn" disabled={checkingIn === slot.id}
              onClick={e => { e.stopPropagation(); handleCheckIn(slot) }}>
              {checkingIn === slot.id ? '...' : `◈ Check In +${xpReward} XP`}
            </button>
          )}
          {isTeacher && (
            <>
              <button className="btn btn-xs" onClick={e => { e.stopPropagation(); openEdit(slot) }}>
                <Icon name="edit" size={10} />
              </button>
              <button className="btn btn-xs btn-danger" onClick={e => { e.stopPropagation(); deleteSlot(slot.id) }}>
                <Icon name="trash" size={10} />
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  /* ── WEEK GRID VIEW ── */
  const WeekView = () => {
    const daySlots = (day: string) => filtered.filter(s => s.day === day)
    const nowPos = getCurrentTimePosition()
    return (
      <div className="tt-week-grid">
        {/* Header row */}
        <div className="tt-week-header">
          <div className="tt-week-corner"></div>
          {DAYS.map(day => {
            const count = daySlots(day).length
            return (
              <div key={day} className={`tt-week-day-header ${day === todayName ? 'tt-week-today' : ''}`}
                onClick={() => { setSelectedDay(day); setView('day') }}>
                <span className="tt-day-short">{day.slice(0, 3)}</span>
                <span className="tt-day-full">{day}</span>
                {count > 0 && <span className="tt-week-day-count">{count}</span>}
                {day === todayName && <span className="tt-today-dot" />}
              </div>
            )
          })}
        </div>

        {/* Time rows */}
        <div className="tt-week-body" style={{ position: 'relative' }}>
          {/* Current time indicator */}
          {nowPos >= 0 && (
            <div className="tt-now-line" style={{ top: `${nowPos}%` }}>
              <div className="tt-now-dot" />
            </div>
          )}
          {HOURS.map(hour => (
            <div key={hour} className="tt-week-row">
              <div className="tt-week-time">{formatHour(hour)}</div>
              {DAYS.map(day => {
                const slots = daySlots(day).filter(s => {
                  const t = parseTime(s.time)
                  return t && t.startHour === hour
                })
                return (
                  <div key={day} className={`tt-week-cell ${day === todayName ? 'tt-week-cell-today' : ''}`}
                    onClick={() => {
                      if (isTeacher && !slots.length) {
                        setEditSlot(null)
                        setForm({ subject: '', day, time: `${hour}:00 - ${hour + 1}:00`, room: '' })
                        setSlotModal(true)
                      }
                    }}>
                    {slots.map(slot => {
                      const t = parseTime(slot.time)
                      const duration = t ? (t.endHour * 60 + t.endMin - t.startHour * 60 - t.startMin) / 60 : 1
                      const color = getSubjectColor(slot.subject)
                      const live = isNowInSlot(slot.day, slot.time)
                      return (
                        <div key={slot.id} className={`tt-week-slot ${live ? 'tt-week-slot-live' : ''}`}
                          style={{
                            background: `${color}18`, borderLeft: `3px solid ${color}`,
                            height: `${Math.max(duration * 100, 100)}%`,
                          }}
                          onClick={e => { e.stopPropagation(); setJitsiRoom(slot) }}>
                          {live && <span className="tt-live-dot-sm" />}
                          <div className="tt-week-slot-subject" style={{ color }}>{slot.subject}</div>
                          <div className="tt-week-slot-time">{slot.time}</div>
                          <div className="tt-week-slot-dur">{formatDuration(getDurationMins(slot.time))}</div>
                          {!isTeacher && <div className="tt-week-slot-teacher">{slot.teacher_name}</div>}
                          {isTeacher && (
                            <div className="tt-week-slot-actions" onClick={e => e.stopPropagation()}>
                              <button className="tt-micro-btn" onClick={() => openEdit(slot)}>✎</button>
                              <button className="tt-micro-btn tt-micro-danger" onClick={() => deleteSlot(slot.id)}>×</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ── DAY VIEW ── */
  const DayView = () => {
    const slots = filtered.filter(s => s.day === selectedDay)
      .sort((a, b) => {
        const ta = parseTime(a.time), tb = parseTime(b.time)
        if (!ta || !tb) return 0
        return (ta.startHour * 60 + ta.startMin) - (tb.startHour * 60 + tb.startMin)
      })

    return (
      <div className="tt-day-view">
        {/* Day tabs */}
        <div className="tt-day-tabs">
          {DAYS.map(day => {
            const count = timetable.filter(s => s.day === day).length
            return (
              <button key={day} className={`tt-day-tab ${selectedDay === day ? 'tt-day-tab-active' : ''} ${day === todayName ? 'tt-day-tab-today' : ''}`}
                onClick={() => setSelectedDay(day)}>
                <span className="tt-day-tab-name">{day.slice(0, 3)}</span>
                {count > 0 && <span className="tt-day-tab-count">{count}</span>}
              </button>
            )
          })}
        </div>

        {/* Timeline */}
        <div className="tt-timeline">
          {slots.length === 0 && (
            <div className="tt-empty-day">
              <div className="tt-empty-icon">◇</div>
              <div className="tt-empty-title">No classes on {selectedDay}</div>
              <div className="tt-empty-sub">Enjoy your free time!</div>
              {isTeacher && (
                <button className="btn btn-sm tt-empty-btn" onClick={openAdd}>
                  <Icon name="plus" size={11} /> Add a class
                </button>
              )}
            </div>
          )}
          {slots.map((slot, i) => (
            <div key={slot.id} className={`tt-timeline-item fade-up${Math.min(i, 3) > 0 ? `-${Math.min(i, 3)}` : ''}`}>
              <div className="tt-timeline-marker" style={{ background: getSubjectColor(slot.subject) }} />
              <div className="tt-timeline-line" />
              <SlotCard slot={slot} periodNum={i + 1} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* ── LIST VIEW ── */
  const ListView = () => (
    <div className="tt-list-view">
      {DAYS.map(day => {
        const slots = filtered.filter(s => s.day === day)
          .sort((a, b) => {
            const ta = parseTime(a.time), tb = parseTime(b.time)
            if (!ta || !tb) return 0
            return (ta.startHour * 60 + ta.startMin) - (tb.startHour * 60 + tb.startMin)
          })
        if (!slots.length) return null
        const dayMins = slots.reduce((s, sl) => s + getDurationMins(sl.time), 0)
        return (
          <div key={day} className="tt-list-day">
            <div className={`tt-list-day-header ${day === todayName ? 'tt-list-day-today' : ''}`}>
              <span>{day}</span>
              <span className="tt-list-day-meta">
                <span className="tt-list-day-count">{slots.length} class{slots.length !== 1 ? 'es' : ''}</span>
                <span className="tt-list-day-hrs">{formatDuration(dayMins)}</span>
              </span>
            </div>
            {slots.map((slot, i) => <SlotCard key={slot.id} slot={slot} periodNum={i + 1} />)}
          </div>
        )
      })}
      {filtered.length === 0 && (
        <div className="tt-empty-day tt-empty-day-lg">
          <div className="tt-empty-icon">▫</div>
          <div className="tt-empty-title">{searchQ ? 'No matching classes.' : 'No classes scheduled yet.'}</div>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* ── Add/Edit Modal ── */}
      <Modal open={slotModal} onClose={() => setSlotModal(false)} title={editSlot ? 'Edit Class' : 'Add Class'}>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Subject</label>
          <input className="input" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="e.g. Mathematics" />
          {form.subject && (
            <div className="tt-color-preview">
              <div className="tt-slot-color-dot" style={{ background: getSubjectColor(form.subject) }} />
              <span className="tt-color-preview-label">Color preview</span>
            </div>
          )}
        </div>
        <div className="grid-2" style={{ marginBottom: 14 }}>
          <div>
            <label className="label">Day</label>
            <select className="input" value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))}>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Time (e.g. 09:00 - 10:30)</label>
            <input className="input" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              placeholder="09:00 - 10:30" />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="label">Jitsi Room ID (optional)</label>
          <input className="input" value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
            placeholder="auto-generated if empty" />
          <div className="tt-room-hint">
            Join link: meet.jit.si/<strong>{form.room || 'auto-generated'}</strong>
          </div>
        </div>
        <div className="tt-modal-actions">
          <button className="btn btn-primary" onClick={saveSlot}>{editSlot ? 'Save Changes' : 'Add Class'}</button>
          <button className="btn" onClick={() => setSlotModal(false)}>Cancel</button>
        </div>
      </Modal>

      <PageHeader title="TIMETABLE" subtitle={isTeacher ? 'Manage your class schedule' : 'Your weekly class schedule'} />

      {/* ── Next Up Card (students) ── */}
      {!isTeacher && (liveSlot || nextUp) && (
        <div className="tt-next-up fade-up">
          {liveSlot ? (
            <>
              <div className="tt-next-up-badge tt-next-up-live"><span className="tt-live-dot" /> LIVE NOW</div>
              <div className="tt-next-up-subject" style={{ color: getSubjectColor(liveSlot.subject) }}>
                {liveSlot.subject}
              </div>
              <div className="tt-next-up-meta">
                <span><Icon name="clock" size={10} /> {liveSlot.time}</span>
                <span><Icon name="user" size={10} /> {liveSlot.teacher_name}</span>
                <span>{formatDuration(getDurationMins(liveSlot.time))}</span>
              </div>
              <div className="tt-next-up-actions">
                <button className="btn btn-sm btn-primary" onClick={() => setJitsiRoom(liveSlot)}>
                  <Icon name="video" size={11} /> Join Class
                </button>
                {isStudent && !checkedIn.has(liveSlot.id) && (
                  <button className="btn btn-sm tt-checkin-btn" disabled={checkingIn === liveSlot.id}
                    onClick={() => handleCheckIn(liveSlot)}>
                    {checkingIn === liveSlot.id ? '...' : `◈ Check In +${xpReward} XP`}
                  </button>
                )}
                {checkedIn.has(liveSlot.id) && (
                  <span className="tt-checkin-done">✓ Checked in</span>
                )}
              </div>
            </>
          ) : nextUp && (
            <>
              <div className="tt-next-up-badge">NEXT UP</div>
              <div className="tt-next-up-subject" style={{ color: getSubjectColor(nextUp.slot.subject) }}>
                {nextUp.slot.subject}
              </div>
              <div className="tt-next-up-meta">
                <span><Icon name="clock" size={10} /> {nextUp.slot.time}</span>
                <span><Icon name="user" size={10} /> {nextUp.slot.teacher_name}</span>
                <span>{formatDuration(getDurationMins(nextUp.slot.time))}</span>
              </div>
              <div className="tt-next-up-countdown">
                Starts in <strong>{nextUp.minutes < 60 ? `${nextUp.minutes}m` : `${Math.floor(nextUp.minutes / 60)}h ${nextUp.minutes % 60}m`}</strong>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="tt-stats fade-up">
        <div className="tt-stat">
          <div className="tt-stat-icon">▪</div>
          <div className="tt-stat-value">{timetable.length}</div>
          <div className="tt-stat-label">Weekly Classes</div>
        </div>
        <div className="tt-stat">
          <div className="tt-stat-icon">▫</div>
          <div className="tt-stat-value">{todaySlots.length}</div>
          <div className="tt-stat-label">Today</div>
        </div>
        <div className="tt-stat">
          <div className="tt-stat-icon">○</div>
          <div className="tt-stat-value">{formatDuration(totalWeeklyMins)}</div>
          <div className="tt-stat-label">Weekly Hours</div>
        </div>
        <div className="tt-stat">
          <div className="tt-stat-icon">◈</div>
          <div className="tt-stat-value">{uniqueSubjects.length}</div>
          <div className="tt-stat-label">Subjects</div>
        </div>
        {isStudent && (
          <div className="tt-stat tt-stat-xp">
            <div className="tt-stat-icon">◈</div>
            <div className="tt-stat-value">{weeklyCheckIns * xpReward}</div>
            <div className="tt-stat-label">Weekly XP</div>
          </div>
        )}
        {liveSlot && (
          <div className="tt-stat tt-stat-live">
            <div className="tt-stat-value"><span className="tt-live-dot" /> {liveSlot.subject}</div>
            <div className="tt-stat-label">Live Now</div>
          </div>
        )}
      </div>

      {/* ── Today's Schedule Strip (students) ── */}
      {!isTeacher && todaySlots.length > 0 && view !== 'day' && (
        <div className="tt-today-strip fade-up-1">
          <SectionLabel>Today&apos;s Schedule · {todayName}</SectionLabel>
          <div className="tt-today-slots">
            {todaySlots.map((slot, i) => {
              const color = getSubjectColor(slot.subject)
              const live = isNowInSlot(slot.day, slot.time)
              const done = (() => {
                const t = parseTime(slot.time)
                if (!t) return false
                const now = new Date()
                const nowMins = now.getHours() * 60 + now.getMinutes()
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                return dayNames[now.getDay()] === slot.day && nowMins > t.endHour * 60 + t.endMin
              })()
              return (
                <div key={slot.id} className={`tt-today-chip ${live ? 'tt-today-chip-live' : ''} ${done ? 'tt-today-chip-done' : ''}`}
                  style={{ borderColor: live ? 'var(--success)' : color }}
                  onClick={() => live ? setJitsiRoom(slot) : undefined}>
                  {live && <span className="tt-live-dot" />}
                  <span className="tt-today-chip-period">P{i + 1}</span>
                  <span className="tt-today-chip-subject" style={{ color: done ? 'var(--fg-dim)' : color }}>{slot.subject}</span>
                  <span className="tt-today-chip-time">{slot.time}</span>
                  {done && <span className="tt-today-chip-done-icon">✓</span>}
                  {checkedIn.has(slot.id) && <span className="tt-today-chip-xp">◈</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="tt-controls fade-up-1">
        <div className="tt-view-toggle">
          {(['week', 'day', 'list'] as ViewMode[]).map(v => (
            <button key={v} className={`tt-view-btn ${view === v ? 'tt-view-active' : ''}`}
              onClick={() => setView(v)}>
              {v === 'week' ? '▫' : v === 'day' ? '▫' : '▫'} {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="tt-search">
          <Icon name="search" size={11} />
          <input className="tt-search-input" value={searchQ} onChange={e => setSearchQ(e.target.value)}
            placeholder="Search classes..." />
          {searchQ && <button className="fm-clear-btn" onClick={() => setSearchQ('')}>×</button>}
        </div>
        {isTeacher && (
          <button className="btn btn-primary btn-sm" onClick={openAdd}>
            <Icon name="plus" size={12} /> Add Class
          </button>
        )}
      </div>

      {/* ── Views ── */}
      <div className="fade-up-2">
        {view === 'week' && <WeekView />}
        {view === 'day' && <DayView />}
        {view === 'list' && <ListView />}
      </div>

      {/* ── Subject Color Legend ── */}
      {uniqueSubjects.length > 0 && (
        <div className="tt-legend fade-up-3">
          <div className="tt-legend-title">Subjects</div>
          <div className="tt-legend-items">
            {uniqueSubjects.map(s => (
              <div key={s} className="tt-legend-item">
                <div className="tt-legend-dot" style={{ background: getSubjectColor(s) }} />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
