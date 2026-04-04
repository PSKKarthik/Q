'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, MeetingSlot } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatGrid } from '@/components/ui/StatGrid'

interface Props {
  profile: Profile
  allowedTeacherIds?: string[]
}

export function MeetingSchedulerModule({ profile, allowedTeacherIds = [] }: Props) {
  const isTeacher = profile.role === 'teacher'
  const { toast } = useToast()
  const [slots, setSlots] = useState<MeetingSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [newSlot, setNewSlot] = useState({ date: '', start_time: '', end_time: '' })
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [filterDate, setFilterDate] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (isTeacher) {
        const { data, error } = await supabase.from('meeting_slots').select('*').eq('teacher_id', profile.id).order('date', { ascending: true })
        if (error) throw error
        if (data) setSlots(data as MeetingSlot[])
      } else {
        const [slotsRes, teachersRes] = await Promise.all([
          supabase.from('meeting_slots').select('*').order('date', { ascending: true }),
          supabase.from('profiles').select('*').eq('role', 'teacher'),
        ])
        if (slotsRes.error) throw slotsRes.error
        if (slotsRes.data) setSlots(slotsRes.data as MeetingSlot[])
        if (teachersRes.data) setTeachers(teachersRes.data as Profile[])
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load meetings', 'error')
    }
    setLoading(false)
  }, [isTeacher, profile.id, toast])

  useEffect(() => { loadData() }, [loadData])

  const createSlot = async () => {
    if (!newSlot.date || !newSlot.start_time || !newSlot.end_time) {
      toast('Please fill in date, start time, and end time', 'error'); return
    }
    const today = new Date().toISOString().split('T')[0]
    if (newSlot.date < today) { toast('Cannot create slots in the past', 'error'); return }
    if (newSlot.start_time >= newSlot.end_time) { toast('Start time must be before end time', 'error'); return }
    setBusy('create')
    try {
      const { data, error } = await supabase.from('meeting_slots').insert({
        teacher_id: profile.id,
        teacher_name: profile.name,
        date: newSlot.date,
        start_time: newSlot.start_time,
        end_time: newSlot.end_time,
        status: 'available',
      }).select().single()
      if (error) throw error
      if (data) {
        setSlots(prev => [...prev, data as MeetingSlot])
        setNewSlot({ date: '', start_time: '', end_time: '' })
        setShowForm(false)
        toast('Slot created', 'success')
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to create slot', 'error')
    }
    setBusy(null)
  }

  const deleteSlot = async (id: string) => {
    if (!confirm('Delete this availability slot?')) return
    setBusy(id)
    try {
      const { error } = await supabase.from('meeting_slots').delete().eq('id', id).eq('teacher_id', profile.id)
      if (error) throw error
      setSlots(prev => prev.filter(s => s.id !== id))
      toast('Slot removed', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to delete slot', 'error')
    }
    setBusy(null)
  }

  const bookSlot = async (slot: MeetingSlot) => {
    setBusy(slot.id)
    try {
      const { data, error } = await supabase.from('meeting_slots').update({
        booked_by: profile.id,
        parent_name: profile.name,
        status: 'booked',
      }).eq('id', slot.id).eq('status', 'available').select().single()
      if (error) {
        toast('This slot was already booked. Refreshing...', 'error')
        loadData()
        setBusy(null)
        return
      }
      if (data) {
        setSlots(prev => prev.map(s => s.id === slot.id ? data as MeetingSlot : s))
        toast('Meeting booked!', 'success')
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to book slot', 'error')
      loadData()
    }
    setBusy(null)
  }

  const cancelBooking = async (slot: MeetingSlot) => {
    if (!confirm('Cancel this booking?')) return
    setBusy(slot.id)
    try {
      const { data, error } = await supabase.from('meeting_slots').update({
        booked_by: null,
        parent_name: null,
        status: 'available',
      }).eq('id', slot.id).select().single()
      if (error) throw error
      if (data) {
        setSlots(prev => prev.map(s => s.id === slot.id ? data as MeetingSlot : s))
        toast('Booking cancelled', 'success')
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to cancel booking', 'error')
    }
    setBusy(null)
  }

  const allowedTeacherSet = new Set(allowedTeacherIds)
  const available = slots.filter(s => {
    const dateOk = !filterDate || s.date === filterDate
    const teacherOk = isTeacher || allowedTeacherSet.size === 0 || allowedTeacherSet.has(s.teacher_id)
    return s.status === 'available' && dateOk && teacherOk
  })
  const booked = slots.filter(s => s.status === 'booked')
  const myBookings = isTeacher ? booked : booked.filter(s => s.booked_by === profile.id)

  const markCompleted = async (slot: MeetingSlot) => {
    if (!isTeacher || slot.teacher_id !== profile.id) return
    setBusy(slot.id)
    try {
      const { data, error } = await supabase.from('meeting_slots').update({ status: 'completed' }).eq('id', slot.id).select().single()
      if (error) throw error
      if (data) {
        setSlots(prev => prev.map(s => s.id === slot.id ? data as MeetingSlot : s))
        toast('Meeting marked as completed', 'success')
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to mark completed', 'error')
    }
    setBusy(null)
  }

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading meetings...</div>

  return (
    <>
      <PageHeader title="MEETINGS" subtitle={isTeacher ? 'Manage your availability' : 'Book a meeting with a teacher'} />

      <StatGrid items={[
        { label: 'Available Slots', value: available.length },
        { label: 'Booked', value: booked.length },
        { label: 'My Meetings', value: myBookings.length },
      ]} columns={3} />

      {isTeacher && (
        <>
          <div className="fade-up-1" style={{ marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ Add Availability'}
            </button>
          </div>

          {showForm && (
            <div className="card fade-up-1" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label className="label">Date</label>
                  <input className="input" type="date" value={newSlot.date} min={new Date().toISOString().split('T')[0]} onChange={e => setNewSlot(s => ({ ...s, date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Start</label>
                  <input className="input" type="time" value={newSlot.start_time} onChange={e => setNewSlot(s => ({ ...s, start_time: e.target.value }))} />
                </div>
                <div>
                  <label className="label">End</label>
                  <input className="input" type="time" value={newSlot.end_time} onChange={e => setNewSlot(s => ({ ...s, end_time: e.target.value }))} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={createSlot} disabled={busy === 'create'}>{busy === 'create' ? 'Creating...' : 'Create Slot'}</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* My Bookings */}
      {myBookings.length > 0 && (
        <>
          <SectionLabel>My Meetings</SectionLabel>
          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {myBookings.map(s => (
              <div key={s.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '3px solid var(--accent)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {isTeacher ? `With ${s.parent_name}` : `With ${s.teacher_name}`}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                    {s.date} · {s.start_time} — {s.end_time}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => cancelBooking(s)} disabled={busy === s.id} style={{ color: 'var(--danger)' }}>{busy === s.id ? 'Cancelling...' : 'Cancel'}</button>
                {isTeacher && s.teacher_id === profile.id && (
                  <button className="btn btn-sm" onClick={() => markCompleted(s)} disabled={busy === s.id}>
                    {busy === s.id ? 'Updating...' : 'Mark Completed'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Available slots */}
      <SectionLabel>{isTeacher ? 'Your Availability' : 'Available Slots'}</SectionLabel>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="input" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ width: 'auto' }} />
        {filterDate && <button className="btn btn-sm" onClick={() => setFilterDate('')}>Clear</button>}
      </div>
      <div className="fade-up-3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {available.map(s => (
          <div key={s.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {!isTeacher && <div style={{ fontWeight: 600, fontSize: 13 }}>{s.teacher_name}</div>}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
                {s.date} · {s.start_time} — {s.end_time}
              </div>
            </div>
            {isTeacher ? (
              <button className="btn btn-sm" onClick={() => deleteSlot(s.id)} disabled={busy === s.id} style={{ color: 'var(--danger)' }}>{busy === s.id ? 'Removing...' : 'Remove'}</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => bookSlot(s)} disabled={busy === s.id}>{busy === s.id ? 'Booking...' : 'Book'}</button>
            )}
          </div>
        ))}
        {available.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', padding: 40 }}>
            <Icon name="calendar" size={32} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{isTeacher ? 'No availability set. Add slots above.' : 'No available slots right now.'}</span>
          </div>
        )}
      </div>
    </>
  )
}
