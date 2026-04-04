'use client'
import { useState, useMemo } from 'react'
import type { Test, Assignment, TimetableSlot } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { DAYS } from '@/lib/constants'

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
  type: 'test' | 'assignment' | 'class'
  subject?: string
  color: string
}

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function CalendarModule({ tests, assignments, timetable }: Props) {
  const [viewDate, setViewDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Build events from tests, assignments, and timetable
  const events = useMemo(() => {
    const evts: CalendarEvent[] = []

    tests.forEach(t => {
      if (t.scheduled_date) {
        evts.push({
          id: `test-${t.id}`,
          title: t.title,
          date: t.scheduled_date,
          time: t.scheduled_time || undefined,
          type: 'test',
          subject: t.subject,
          color: 'var(--danger)',
        })
      }
    })

    assignments.forEach(a => {
      if (a.due_date) {
        evts.push({
          id: `asgn-${a.id}`,
          title: a.title,
          date: a.due_date,
          type: 'assignment',
          subject: a.teacher_name,
          color: 'var(--warn)',
        })
      }
    })

    // Map timetable to the visible calendar range (includes prev/next month overflow)
    const gridStart = new Date(year, month, 1)
    const gridStartDay = gridStart.getDay()
    gridStart.setDate(gridStart.getDate() - (gridStartDay === 0 ? 6 : gridStartDay - 1)) // back to Monday start
    const gridEnd = new Date(gridStart)
    gridEnd.setDate(gridEnd.getDate() + 42) // 6-week grid
    for (let d = new Date(gridStart); d < gridEnd; d.setDate(d.getDate() + 1)) {
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
      const dateStr = localDate(d)
      timetable.filter(s => s.day === dayName).forEach(s => {
        evts.push({
          id: `class-${s.id}-${dateStr}`,
          title: s.subject,
          date: dateStr,
          time: s.time,
          type: 'class',
          subject: `${s.teacher_name} · ${s.room}`,
          color: 'var(--success)',
        })
      })
    }

    return evts
  }, [tests, assignments, timetable, year, month])

  // Calendar grid (Monday-first)
  const firstOfMonth = new Date(year, month, 1)
  const startDay = firstOfMonth.getDay() // 0=Sun
  const adjustedStartDay = startDay === 0 ? 6 : startDay - 1 // 0=Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = localDate(new Date())

  const calendarDays: { date: string; day: number; inMonth: boolean }[] = []
  // Fill prev month
  for (let i = adjustedStartDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    calendarDays.push({ date: localDate(d), day: d.getDate(), inMonth: false })
  }
  // Fill current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    calendarDays.push({ date: localDate(d), day: i, inMonth: true })
  }
  // Fill next month to complete row
  const remaining = 42 - calendarDays.length
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i)
    calendarDays.push({ date: localDate(d), day: i, inMonth: false })
  }

  const navigate = (dir: number) => {
    if (view === 'month') {
      setViewDate(new Date(year, month + dir, 1))
    } else {
      setViewDate(new Date(viewDate.getTime() + dir * 7 * 86400000))
    }
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

  // Week view
  const weekStart = new Date(viewDate)
  const wDay = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - (wDay === 0 ? 6 : wDay - 1)) // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return { date: localDate(d), day: d.getDate(), name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] }
  })

  const dayEvents = selectedDay ? events.filter(e => e.date === selectedDay) : []

  // Smart scheduling — conflict detection
  const conflicts = useMemo(() => {
    const byDateTime = new Map<string, CalendarEvent[]>()
    events.forEach(e => {
      if (e.time) {
        const key = `${e.date}-${e.time}`
        byDateTime.set(key, [...(byDateTime.get(key) || []), e])
      }
    })
    return Array.from(byDateTime.entries()).filter(([, evts]) => evts.length > 1).map(([key, evts]) => ({ key, events: evts }))
  }, [events])

  // iCal export
  const exportICal = () => {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QGX//Calendar//EN']
    events.forEach(e => {
      const d = e.date.replace(/-/g, '')
      const t = e.time ? e.time.replace(/:/g, '') + '00' : '000000'
      lines.push('BEGIN:VEVENT', `DTSTART:${d}T${t}`, `SUMMARY:${e.title}`, `DESCRIPTION:${e.type} - ${e.subject || ''}`, 'END:VEVENT')
    })
    lines.push('END:VCALENDAR')
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'qgx-calendar.ics'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader title="CALENDAR" subtitle="Tests, assignments & timetable" />

      <div className="fade-up-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => navigate(-1)}><Icon name="arrow" size={12} /></button>
          <span style={{ fontFamily: 'var(--display)', fontSize: 20, minWidth: 200, textAlign: 'center' }}>
            {view === 'month' ? `${monthNames[month]} ${year}` : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </span>
          <button className="btn btn-sm" style={{ transform: 'scaleX(-1)' }} onClick={() => navigate(1)}><Icon name="arrow" size={12} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${view === 'month' ? 'btn-primary' : ''}`} onClick={() => setView('month')}>Month</button>
          <button className={`btn btn-sm ${view === 'week' ? 'btn-primary' : ''}`} onClick={() => setView('week')}>Week</button>
          <button className="btn btn-sm" onClick={() => { setViewDate(new Date()); setSelectedDay(today) }}>Today</button>
          <button className="btn btn-sm" onClick={exportICal}>▸ iCal</button>
        </div>
      </div>

      {/* Conflicts warning */}
      {conflicts.length > 0 && (
        <div className="fade-up-1" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>△ {conflicts.length} Schedule Conflict{conflicts.length !== 1 ? 's' : ''} Detected</div>
          {conflicts.slice(0, 3).map(c => (
            <div key={c.key} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 2 }}>
              {c.events.map(e => e.title).join(' vs ')} — {c.events[0].date} at {c.events[0].time}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="fade-up-1" style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {[{ color: 'var(--danger)', label: 'Tests' }, { color: 'var(--warn)', label: 'Assignments' }, { color: 'var(--success)', label: 'Classes' }].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Month View */}
      {view === 'month' && (
        <div className="calendar-grid fade-up-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="calendar-header">{d}</div>
          ))}
          {calendarDays.map(({ date, day, inMonth }) => {
            const dayEvts = events.filter(e => e.date === date)
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

      {/* Week View */}
      {view === 'week' && (
        <div className="calendar-week fade-up-2">
          {weekDays.map(({ date, day, name }) => {
            const dayEvts = events.filter(e => e.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''))
            const isToday = date === today
            return (
              <div key={date} className={`calendar-week-day ${isToday ? 'calendar-day-today' : ''}`}>
                <div className="calendar-week-header">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{name}</span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 20 }}>{day}</span>
                </div>
                <div className="calendar-week-events">
                  {dayEvts.map(e => (
                    <div key={e.id} className="calendar-week-event" style={{ borderLeftColor: e.color }}>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{e.title}</div>
                      {e.time && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{e.time}</div>}
                      {e.subject && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{e.subject}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Day detail */}
      {selectedDay && dayEvents.length > 0 && (
        <div className="card fade-up-3" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16 }}>
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>{dayEvents.length} events</span>
          </div>
          {dayEvents.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(e => (
            <div key={e.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div style={{ width: 4, height: 32, borderRadius: 2, background: e.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{e.title}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                  {e.type === 'test' ? '▫ Test' : e.type === 'assignment' ? '▫ Assignment' : '▪ Class'}
                  {e.time && ` · ${e.time}`}
                  {e.subject && ` · ${e.subject}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
