'use client'
import { useEffect, useMemo, useState } from 'react'
import type { Assignment, Test, TimetableSlot } from '@/types'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'

interface Props {
  tests: Test[]
  assignments: Assignment[]
  timetable: TimetableSlot[]
}

interface CalendarEvent {
  id: string
  title: string
  date: string
  time?: string
  type: 'test' | 'assignment' | 'class' | 'personal'
  subject?: string
  color: string
  sourceId?: string
}

interface PersonalEventRow {
  id: string
  user_id: string
  title: string
  description: string | null
  event_date: string
  start_time: string | null
  all_day: boolean
  type: 'personal' | 'study' | 'meeting' | 'deadline'
  color: string | null
  location: string | null
}

interface CalendarPreferencesRow {
  default_view: 'month' | 'week' | 'day'
  show_tests: boolean
  show_assignments: boolean
  show_classes: boolean
  show_personal: boolean
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00`)
}

function diffDaysFromToday(dateStr: string): number {
  const today = parseLocalDate(localDate(new Date()))
  const target = parseLocalDate(dateStr)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((target.getTime() - today.getTime()) / msPerDay)
}

function urgencyLabel(event: CalendarEvent): { text: string; color: string } | null {
  if (event.type === 'class') return null
  const d = diffDaysFromToday(event.date)
  if (d < 0) return { text: 'Overdue', color: 'var(--danger)' }
  if (d === 0) return { text: 'Today', color: 'var(--warn)' }
  if (d === 1) return { text: 'Tomorrow', color: 'var(--warn)' }
  if (d <= 3) return { text: `In ${d} days`, color: 'var(--fg-dim)' }
  return null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

function toDateStamp(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function toUtcStamp(dateStr: string, time?: string, minuteOffset = 0): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = (time || '00:00').split(':').map(Number)
  const d = new Date(year, (month || 1) - 1, day || 1, hour || 0, (minute || 0) + minuteOffset, 0)
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function CalendarModule({ tests, assignments, timetable }: Props) {
  const { toast } = useToast()
  const [viewDate, setViewDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [visibleTypes, setVisibleTypes] = useState<Record<CalendarEvent['type'], boolean>>({
    test: true,
    assignment: true,
    class: true,
    personal: true,
  })
  const [userId, setUserId] = useState<string | null>(null)
  const [prefsLoaded, setPrefsLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [personalEvents, setPersonalEvents] = useState<PersonalEventRow[]>([])
  const [showAddPersonal, setShowAddPersonal] = useState(false)
  const [addingPersonal, setAddingPersonal] = useState(false)
  const [personalForm, setPersonalForm] = useState({
    title: '',
    event_date: localDate(new Date()),
    start_time: '',
    all_day: false,
    type: 'personal' as PersonalEventRow['type'],
    color: '#3b82f6',
    location: '',
    description: '',
    reminder_minutes: 'none',
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const today = localDate(new Date())

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setLoading(true)
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id || null
      if (!uid || cancelled) {
        setPrefsLoaded(true)
        setLoading(false)
        return
      }

      setUserId(uid)

      const [{ data: eventRows }, { data: prefRow }] = await Promise.all([
        supabase
          .from('personal_events')
          .select('id,user_id,title,description,event_date,start_time,all_day,type,color,location')
          .eq('user_id', uid)
          .order('event_date', { ascending: true }),
        supabase
          .from('calendar_preferences')
          .select('default_view,show_tests,show_assignments,show_classes,show_personal')
          .eq('user_id', uid)
          .maybeSingle(),
      ])

      if (cancelled) return

      if (eventRows) setPersonalEvents(eventRows as PersonalEventRow[])

      if (prefRow) {
        const prefs = prefRow as CalendarPreferencesRow
        setView(prefs.default_view || 'month')
        setVisibleTypes({
          test: prefs.show_tests,
          assignment: prefs.show_assignments,
          class: prefs.show_classes,
          personal: prefs.show_personal,
        })
      }

      setPrefsLoaded(true)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!prefsLoaded || !userId) return

    const payload = {
      user_id: userId,
      default_view: view,
      show_tests: visibleTypes.test,
      show_assignments: visibleTypes.assignment,
      show_classes: visibleTypes.class,
      show_personal: visibleTypes.personal,
    }

    supabase.from('calendar_preferences').upsert(payload)
  }, [prefsLoaded, userId, view, visibleTypes])

  const events = useMemo(() => {
    const evts: CalendarEvent[] = []

    tests.forEach(t => {
      if (!t.scheduled_date) return
      evts.push({
        id: `test-${t.id}`,
        sourceId: t.id,
        title: t.title,
        date: t.scheduled_date,
        time: t.scheduled_time || undefined,
        type: 'test',
        subject: t.subject,
        color: 'var(--danger)',
      })
    })

    assignments.forEach(a => {
      if (!a.due_date) return
      evts.push({
        id: `asgn-${a.id}`,
        sourceId: a.id,
        title: a.title,
        date: a.due_date,
        type: 'assignment',
        subject: a.teacher_name,
        color: 'var(--warn)',
      })
    })

    personalEvents.forEach(p => {
      evts.push({
        id: `personal-${p.id}`,
        sourceId: p.id,
        title: p.title,
        date: p.event_date,
        time: p.all_day ? undefined : (p.start_time || undefined),
        type: 'personal',
        subject: p.location || p.type,
        color: p.color || '#3b82f6',
      })
    })

    const gridStart = new Date(year, month, 1)
    const gridStartDay = gridStart.getDay()
    gridStart.setDate(gridStart.getDate() - (gridStartDay === 0 ? 6 : gridStartDay - 1))
    const gridEnd = new Date(gridStart)
    gridEnd.setDate(gridEnd.getDate() + 42)

    for (let d = new Date(gridStart); d < gridEnd; d.setDate(d.getDate() + 1)) {
      const dayName = dayNames[d.getDay()]
      const dateStr = localDate(d)
      timetable.filter(s => s.day === dayName).forEach(s => {
        evts.push({
          id: `class-${s.id}-${dateStr}`,
          sourceId: s.id,
          title: s.subject,
          date: dateStr,
          time: s.time,
          type: 'class',
          subject: `${s.teacher_name} - ${s.room}`,
          color: 'var(--success)',
        })
      })
    }

    return evts
  }, [tests, assignments, personalEvents, timetable, year, month])

  const filteredEvents = useMemo(
    () => events.filter(e => visibleTypes[e.type]),
    [events, visibleTypes]
  )

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    filteredEvents.forEach(e => {
      const arr = map.get(e.date) || []
      arr.push(e)
      map.set(e.date, arr)
    })
    map.forEach((arr, key) => {
      map.set(key, arr.sort((a, b) => (a.time || '').localeCompare(b.time || '')))
    })
    return map
  }, [filteredEvents])

  const firstOfMonth = new Date(year, month, 1)
  const startDay = firstOfMonth.getDay()
  const adjustedStartDay = startDay === 0 ? 6 : startDay - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const calendarDays: { date: string; day: number; inMonth: boolean }[] = []
  for (let i = adjustedStartDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    calendarDays.push({ date: localDate(d), day: d.getDate(), inMonth: false })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    calendarDays.push({ date: localDate(d), day: i, inMonth: true })
  }
  const remaining = 42 - calendarDays.length
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i)
    calendarDays.push({ date: localDate(d), day: i, inMonth: false })
  }

  const navigate = (dir: number) => {
    if (view === 'month') {
      setViewDate(new Date(year, month + dir, 1))
      return
    }
    if (view === 'week') {
      setViewDate(new Date(viewDate.getTime() + dir * 7 * 86400000))
      return
    }
    setViewDate(new Date(viewDate.getTime() + dir * 86400000))
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  const weekStart = new Date(viewDate)
  const wDay = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - (wDay === 0 ? 6 : wDay - 1))
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return { date: localDate(d), day: d.getDate(), name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] }
  })

  const dayEvents = selectedDay ? (eventsByDate.get(selectedDay) || []) : []

  const conflicts = useMemo(() => {
    const byDateTime = new Map<string, CalendarEvent[]>()
    filteredEvents.forEach(e => {
      if (!e.time) return
      const key = `${e.date}-${e.time}`
      byDateTime.set(key, [...(byDateTime.get(key) || []), e])
    })

    return Array.from(byDateTime.entries())
      .filter(([, evts]) => evts.length > 1)
      .map(([key, evts]) => ({ key, events: evts }))
  }, [filteredEvents])

  const exportICal = () => {
    const now = new Date()
    const dtstamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'PRODID:-//QGX//Calendar//EN']

    filteredEvents.forEach(e => {
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${e.id}@qgx-calendar`)
      lines.push(`DTSTAMP:${dtstamp}`)
      if (e.time) {
        lines.push(`DTSTART:${toUtcStamp(e.date, e.time)}`)
        lines.push(`DTEND:${toUtcStamp(e.date, e.time, 60)}`)
      } else {
        lines.push(`DTSTART;VALUE=DATE:${toDateStamp(e.date)}`)
        lines.push(`DTEND;VALUE=DATE:${toDateStamp(addDays(e.date, 1))}`)
      }
      lines.push(`SUMMARY:${escapeIcs(e.title)}`)
      lines.push(`DESCRIPTION:${escapeIcs(`${e.type.toUpperCase()}${e.subject ? ` - ${e.subject}` : ''}`)}`)
      lines.push('END:VEVENT')
    })

    lines.push('END:VCALENDAR')
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'qgx-calendar.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  const dayViewDate = localDate(viewDate)
  const dayViewEvents = eventsByDate.get(dayViewDate) || []
  const allDayEvents = dayViewEvents.filter(e => !e.time)
  const timedEvents = dayViewEvents.filter(e => e.time)
  const timelineHours = Array.from({ length: 17 }, (_, i) => i + 6)

  const toggleType = (type: CalendarEvent['type']) => {
    setVisibleTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }

  const addPersonalEvent = async () => {
    if (!userId) {
      toast('Please login again to create personal events', 'error')
      return
    }
    if (!personalForm.title.trim() || !personalForm.event_date) {
      toast('Title and date are required', 'error')
      return
    }

    setAddingPersonal(true)
    try {
      const payload = {
        user_id: userId,
        title: personalForm.title.trim(),
        description: personalForm.description.trim() || null,
        event_date: personalForm.event_date,
        start_time: personalForm.all_day ? null : (personalForm.start_time || null),
        all_day: personalForm.all_day,
        type: personalForm.type,
        color: personalForm.color || '#3b82f6',
        location: personalForm.location.trim() || null,
      }

      const { data, error } = await supabase
        .from('personal_events')
        .insert(payload)
        .select('id,user_id,title,description,event_date,start_time,all_day,type,color,location')
        .single()

      if (error) throw error

      if (data) {
        setPersonalEvents(prev => [...prev, data as PersonalEventRow])
      }

      const reminder = Number(personalForm.reminder_minutes)
      if (!Number.isNaN(reminder) && reminder > 0 && data?.id) {
        await supabase.from('personal_event_reminders').insert({
          event_id: data.id,
          remind_before_minutes: reminder,
          channel: 'in_app',
        })
      }

      setShowAddPersonal(false)
      setPersonalForm({
        title: '',
        event_date: localDate(new Date()),
        start_time: '',
        all_day: false,
        type: 'personal',
        color: '#3b82f6',
        location: '',
        description: '',
        reminder_minutes: 'none',
      })
      toast('Personal event saved', 'success')
    } catch (err) {
      toast((err as any)?.message ||'Failed to save event', 'error')
    } finally {
      setAddingPersonal(false)
    }
  }

  const removePersonalEvent = async (eventId?: string) => {
    if (!eventId) return
    const id = eventId.replace(/^personal-/, '')
    const prev = personalEvents
    setPersonalEvents(curr => curr.filter(e => e.id !== id))
    const { error } = await supabase.from('personal_events').delete().eq('id', id)
    if (error) {
      setPersonalEvents(prev)
      toast(error.message || 'Failed to delete personal event', 'error')
      return
    }
    toast('Personal event deleted', 'success')
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
      <div className="spinner" />
    </div>
  )

  return (
    <>
      <PageHeader title="CALENDAR" subtitle="Tests, assignments, timetable and personal plans" />

      <div className="calendar-toolbar fade-up-1">
        <div className="calendar-toolbar-left">
          <button className="btn btn-sm" onClick={() => navigate(-1)}><Icon name="arrow" size={12} /></button>
          <span className="calendar-toolbar-title">
            {view === 'month'
              ? `${monthNames[month]} ${year}`
              : view === 'week'
                ? `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : new Date(`${dayViewDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <button className="btn btn-sm" style={{ transform: 'scaleX(-1)' }} onClick={() => navigate(1)}><Icon name="arrow" size={12} /></button>
        </div>

        <div className="calendar-toolbar-right">
          <button className={`btn btn-sm ${view === 'month' ? 'btn-primary' : ''}`} onClick={() => setView('month')}>Month</button>
          <button className={`btn btn-sm ${view === 'week' ? 'btn-primary' : ''}`} onClick={() => setView('week')}>Week</button>
          <button className={`btn btn-sm ${view === 'day' ? 'btn-primary' : ''}`} onClick={() => setView('day')}>Day</button>
          <button className="btn btn-sm" onClick={() => { setViewDate(new Date()); setSelectedDay(today) }}>Today</button>
          <button className="btn btn-sm" onClick={() => setShowAddPersonal(s => !s)}><Icon name="plus" size={10} /> Event</button>
          <button className="btn btn-sm" onClick={exportICal}>iCal</button>
        </div>
      </div>

      {showAddPersonal && (
        <form
          className="card fade-up-1 calendar-event-form"
          onSubmit={(e) => {
            e.preventDefault()
            addPersonalEvent()
          }}
        >
          <div className="calendar-event-form-grid">
            <input className="input" required placeholder="Event title" value={personalForm.title} onChange={e => setPersonalForm(f => ({ ...f, title: e.target.value }))} />
            <input className="input" required type="date" value={personalForm.event_date} onChange={e => setPersonalForm(f => ({ ...f, event_date: e.target.value }))} />
            <input className="input" type="time" disabled={personalForm.all_day} value={personalForm.start_time} onChange={e => setPersonalForm(f => ({ ...f, start_time: e.target.value }))} />
            <select className="input" value={personalForm.type} onChange={e => setPersonalForm(f => ({ ...f, type: e.target.value as PersonalEventRow['type'] }))}>
              <option value="personal">Personal</option>
              <option value="study">Study</option>
              <option value="meeting">Meeting</option>
              <option value="deadline">Deadline</option>
            </select>
          </div>
          <div className="calendar-event-form-grid">
            <input className="input" placeholder="Location (optional)" value={personalForm.location} onChange={e => setPersonalForm(f => ({ ...f, location: e.target.value }))} />
            <input className="input calendar-color-input" type="color" value={personalForm.color} onChange={e => setPersonalForm(f => ({ ...f, color: e.target.value }))} />
            <select className="input" value={personalForm.reminder_minutes} onChange={e => setPersonalForm(f => ({ ...f, reminder_minutes: e.target.value }))}>
              <option value="none">No reminder</option>
              <option value="5">5 min before</option>
              <option value="10">10 min before</option>
              <option value="15">15 min before</option>
              <option value="30">30 min before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
            <label className="calendar-checkbox-row">
              <input type="checkbox" checked={personalForm.all_day} onChange={e => setPersonalForm(f => ({ ...f, all_day: e.target.checked }))} />
              All day
            </label>
          </div>
          <textarea className="input" rows={2} placeholder="Description (optional)" value={personalForm.description} onChange={e => setPersonalForm(f => ({ ...f, description: e.target.value }))} />
          <div className="calendar-event-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={addingPersonal}>{addingPersonal ? 'Saving...' : 'Save Event'}</button>
            <button type="button" className="btn btn-sm" onClick={() => setShowAddPersonal(false)}>Close</button>
          </div>
        </form>
      )}

      <div className="calendar-filters fade-up-1">
        <button className={`calendar-filter-chip ${visibleTypes.test ? 'active' : ''}`} onClick={() => toggleType('test')}>Tests</button>
        <button className={`calendar-filter-chip ${visibleTypes.assignment ? 'active' : ''}`} onClick={() => toggleType('assignment')}>Assignments</button>
        <button className={`calendar-filter-chip ${visibleTypes.class ? 'active' : ''}`} onClick={() => toggleType('class')}>Classes</button>
        <button className={`calendar-filter-chip ${visibleTypes.personal ? 'active' : ''}`} onClick={() => toggleType('personal')}>Personal</button>
      </div>

      {conflicts.length > 0 && (
        <div className="fade-up-1" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', borderRadius: 0, padding: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>
            {conflicts.length} Schedule Conflict{conflicts.length !== 1 ? 's' : ''} Detected
          </div>
          {conflicts.slice(0, 3).map(c => (
            <div key={c.key} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 2 }}>
              {c.events.map(e => e.title).join(' vs ')} - {c.events[0].date} at {c.events[0].time}
            </div>
          ))}
        </div>
      )}

      <div className="calendar-legend fade-up-1">
        {[
          { color: 'var(--danger)', label: 'Tests' },
          { color: 'var(--warn)', label: 'Assignments' },
          { color: 'var(--success)', label: 'Classes' },
          { color: '#3b82f6', label: 'Personal' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 0, background: color }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{label}</span>
          </div>
        ))}
      </div>

      {view === 'month' && (
        <div className="calendar-grid fade-up-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="calendar-header">{d}</div>
          ))}
          {calendarDays.map(({ date, day, inMonth }) => {
            const dayEvts = eventsByDate.get(date) || []
            const isToday = date === today
            const isSelected = date === selectedDay
            return (
              <div
                key={date}
                className={`calendar-day ${inMonth ? '' : 'calendar-day-muted'} ${isToday ? 'calendar-day-today' : ''} ${isSelected ? 'calendar-day-selected' : ''}`}
                onClick={() => setSelectedDay(date)}
              >
                <div className="calendar-day-num">{day}</div>
                <div className="calendar-day-events">
                  {dayEvts.slice(0, 3).map(e => (
                    <div key={e.id} className="calendar-event-dot" style={{ background: e.color }} title={e.title} />
                  ))}
                  {dayEvts.length > 3 && <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--fg-dim)' }}>+{dayEvts.length - 3}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'week' && (
        <div className="calendar-week fade-up-2">
          {weekDays.map(({ date, day, name }) => {
            const dayEvts = eventsByDate.get(date) || []
            const isToday = date === today
            return (
              <div key={date} className={`calendar-week-day ${isToday ? 'calendar-day-today' : ''}`}>
                <div className="calendar-week-header">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{name}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{day}</span>
                </div>
                <div className="calendar-week-events">
                  {dayEvts.map(e => {
                    const urgency = urgencyLabel(e)
                    return (
                      <div key={e.id} className="calendar-week-event" style={{ borderLeftColor: e.color }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 500 }}>{e.title}</div>
                          {urgency && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: urgency.color }}>{urgency.text}</span>}
                        </div>
                        {e.time && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{e.time}</div>}
                        {e.subject && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{e.subject}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'day' && (
        <div className="calendar-day-view fade-up-2">
          {allDayEvents.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>All Day</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allDayEvents.map(e => {
                  const urgency = urgencyLabel(e)
                  return (
                    <div key={e.id} className="calendar-week-event" style={{ borderLeftColor: e.color }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{e.title}</div>
                        {urgency && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: urgency.color }}>{urgency.text}</span>}
                      </div>
                      {e.subject && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{e.subject}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="calendar-day-timeline">
            {timelineHours.map(hour => {
              const hourEvents = timedEvents.filter(e => Number((e.time || '00:00').split(':')[0]) === hour)
              return (
                <div key={hour} className="calendar-hour-row">
                  <div className="calendar-hour-label">{pad2(hour)}:00</div>
                  <div className="calendar-hour-content">
                    {hourEvents.length === 0 ? (
                      <div className="calendar-hour-empty" />
                    ) : (
                      hourEvents.map(e => {
                        const urgency = urgencyLabel(e)
                        return (
                          <div key={e.id} className="calendar-week-event" style={{ borderLeftColor: e.color, marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{e.title}</div>
                              {urgency && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: urgency.color }}>{urgency.text}</span>}
                            </div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                              {e.time || '00:00'}{e.subject ? ` - ${e.subject}` : ''}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selectedDay && dayEvents.length > 0 && (
        <div className="card fade-up-3" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
              {new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>{dayEvents.length} events</span>
          </div>
          {dayEvents.map(e => {
            const urgency = urgencyLabel(e)
            return (
              <div key={e.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ width: 4, height: 32, borderRadius: 0, background: e.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.title}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {urgency && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: urgency.color }}>{urgency.text}</span>}
                      {e.type === 'personal' && (
                        <button className="btn btn-xs" onClick={() => removePersonalEvent(e.id)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                    {e.type === 'test' ? 'Test' : e.type === 'assignment' ? 'Assignment' : e.type === 'class' ? 'Class' : 'Personal'}
                    {e.time && ` - ${e.time}`}
                    {e.subject && ` - ${e.subject}`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
