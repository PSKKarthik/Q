'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { pushNotification } from '@/lib/actions'
import type { Profile, MeetingSlot, MeetingRequest } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatGrid } from '@/components/ui/StatGrid'
import { JitsiMeet } from '@/components/ui/JitsiMeet'

interface Props {
  profile: Profile
  allowedTeacherIds?: string[]
}

/** Generate a stable, URL-safe Jitsi room name for a meeting slot */
function meetingRoomName(slot: MeetingSlot): string {
  return `qgx-meeting-${slot.id.slice(0, 12)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-')
}

export function MeetingSchedulerModule({ profile, allowedTeacherIds = [] }: Props) {
  const isTeacher = profile.role === 'teacher'
  const { toast } = useToast()

  // Slots state
  const [slots, setSlots] = useState<MeetingSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [newSlot, setNewSlot] = useState({ date: '', start_time: '', end_time: '' })
  const [showSlotForm, setShowSlotForm] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [filterDate, setFilterDate] = useState('')
  const [jitsiMeeting, setJitsiMeeting] = useState<MeetingSlot | null>(null)

  // Meeting requests state
  const [requests, setRequests] = useState<MeetingRequest[]>([])
  const [teachers, setTeachers] = useState<Profile[]>([])
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [newRequest, setNewRequest] = useState({ teacher_id: '', date: '', start_time: '', end_time: '', message: '' })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (isTeacher) {
        const { data: slotsData, error: slotsErr } = await supabase
          .from('meeting_slots').select('*').eq('teacher_id', profile.id).order('date', { ascending: true })
        if (slotsErr) throw slotsErr
        if (slotsData) setSlots(slotsData as MeetingSlot[])
        // meeting_requests is optional — table may not exist yet
        const { data: reqData } = await supabase
          .from('meeting_requests').select('*').eq('teacher_id', profile.id).order('created_at', { ascending: false })
        if (reqData) setRequests(reqData as MeetingRequest[])
      } else {
        const today = new Date().toISOString().split('T')[0]
        const past30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
        const { data: slotsData, error: slotsErr } = await supabase
          .from('meeting_slots').select('*')
          .or(`date.gte.${today},and(booked_by.eq.${profile.id},date.gte.${past30})`)
          .order('date', { ascending: true })
        if (slotsErr) throw slotsErr
        if (slotsData) setSlots(slotsData as MeetingSlot[])
        // optional tables — silent failure if not yet migrated
        const { data: reqData } = await supabase
          .from('meeting_requests').select('*').eq('parent_id', profile.id).order('created_at', { ascending: false })
        if (reqData) setRequests(reqData as MeetingRequest[])
        const { data: teachersData } = await supabase.from('profiles').select('id, name').eq('role', 'teacher')
        if (teachersData) setTeachers(teachersData as Profile[])
      }
    } catch (err: unknown) {
      toast((err as { message?: string })?.message || 'Failed to load meetings', 'error')
    }
    setLoading(false)
  }, [isTeacher, profile.id, toast])

  useEffect(() => { loadData() }, [loadData])

  // ── Teacher: create availability slot ──────────────────────────
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
        setShowSlotForm(false)
        toast('Slot created', 'success')
      }
    } catch (err: unknown) {
      toast((err as { message?: string })?.message || 'Failed to create slot', 'error')
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
      toast((err as { message?: string })?.message || 'Failed to delete slot', 'error')
    }
    setBusy(null)
  }

  const notifySlot = (type: 'meeting_booked' | 'meeting_cancelled', slot_id: string) => {
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload: { slot_id } }),
    }).catch(() => {})
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
        loadData(); setBusy(null); return
      }
      if (data) {
        setSlots(prev => prev.map(s => s.id === slot.id ? data as MeetingSlot : s))
        toast('Meeting booked!', 'success')
        notifySlot('meeting_booked', slot.id)
      }
    } catch (err: unknown) {
      toast((err as { message?: string })?.message || 'Failed to book slot', 'error')
      loadData()
    }
    setBusy(null)
  }

  const cancelBooking = async (slot: MeetingSlot) => {
    if (!confirm('Cancel this booking?')) return
    setBusy(slot.id)
    try {
      let q = supabase.from('meeting_slots').update({ booked_by: null, parent_name: null, status: 'available' }).eq('id', slot.id)
      if (isTeacher) q = q.eq('teacher_id', profile.id)
      else q = q.eq('booked_by', profile.id)
      const { data, error } = await q.select().single()
      if (error) throw error
      if (data) {
        setSlots(prev => prev.map(s => s.id === slot.id ? data as MeetingSlot : s))
        toast('Booking cancelled', 'success')
        notifySlot('meeting_cancelled', slot.id)
      }
    } catch (err: unknown) {
      toast((err as { message?: string })?.message || 'Failed to cancel booking', 'error')
    }
    setBusy(null)
  }

  const markCompleted = async (slot: MeetingSlot) => {
    if (!isTeacher || slot.teacher_id !== profile.id) return
    setBusy(slot.id)
    try {
      const { data, error } = await supabase.from('meeting_slots')
        .update({ status: 'completed' }).eq('id', slot.id).eq('teacher_id', profile.id).select().single()
      if (error) throw error
      if (data) {
        setSlots(prev => prev.map(s => s.id === slot.id ? data as MeetingSlot : s))
        toast('Meeting marked as completed', 'success')
      }
    } catch (err: unknown) {
      toast((err as { message?: string })?.message || 'Failed to mark completed', 'error')
    }
    setBusy(null)
  }

  // ── Parent: submit a meeting request ──────────────────────────
  const submitRequest = async () => {
    if (!newRequest.teacher_id || !newRequest.date || !newRequest.start_time || !newRequest.end_time) {
      toast('Please fill in all required fields', 'error'); return
    }
    const today = new Date().toISOString().split('T')[0]
    if (newRequest.date < today) { toast('Please choose a future date', 'error'); return }
    if (newRequest.start_time >= newRequest.end_time) { toast('Start time must be before end time', 'error'); return }
    const teacher = teachers.find(t => t.id === newRequest.teacher_id)
    if (!teacher) return
    setBusy('request')
    try {
      const { data, error } = await supabase.from('meeting_requests').insert({
        teacher_id: newRequest.teacher_id,
        teacher_name: teacher.name,
        parent_id: profile.id,
        parent_name: profile.name,
        proposed_date: newRequest.date,
        proposed_start: newRequest.start_time,
        proposed_end: newRequest.end_time,
        message: newRequest.message.trim() || null,
        status: 'pending',
      }).select().single()
      if (error) throw error
      if (data) {
        setRequests(prev => [data as MeetingRequest, ...prev])
        setNewRequest({ teacher_id: '', date: '', start_time: '', end_time: '', message: '' })
        setShowRequestForm(false)
        toast('Request sent to teacher', 'success')
        // In-app notification to teacher
        await pushNotification(newRequest.teacher_id, `${profile.name} requested a meeting on ${newRequest.date} (${newRequest.start_time}–${newRequest.end_time}).`, 'meeting_requested')
        // Email notification
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'meeting_requested', payload: { request_id: (data as MeetingRequest).id } }),
        }).catch(() => {})
      }
    } catch (err: unknown) {
      toast((err as { message?: string })?.message || 'Failed to send request', 'error')
    }
    setBusy(null)
  }

  // ── Teacher: approve or reject a parent request ───────────────
  const reviewRequest = async (req: MeetingRequest, action: 'approved' | 'rejected') => {
    setBusy(req.id)
    try {
      if (action === 'approved') {
        // Create a booked slot for this time
        const { data: slot, error: slotErr } = await supabase.from('meeting_slots').insert({
          teacher_id: profile.id,
          teacher_name: profile.name,
          date: req.proposed_date,
          start_time: req.proposed_start,
          end_time: req.proposed_end,
          booked_by: req.parent_id,
          parent_name: req.parent_name,
          status: 'booked',
        }).select().single()
        if (slotErr) throw slotErr
        if (slot) setSlots(prev => [...prev, slot as MeetingSlot])
      }

      const { error } = await supabase.from('meeting_requests').update({ status: action }).eq('id', req.id)
      if (error) throw error
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: action } : r))
      toast(`Request ${action}`, 'success')

      // Notify parent
      const msg = action === 'approved'
        ? `Your meeting request on ${req.proposed_date} has been approved by ${profile.name}.`
        : `Your meeting request on ${req.proposed_date} was declined by ${profile.name}.`
      await pushNotification(req.parent_id, msg, 'meeting_request_reviewed')
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meeting_request_reviewed', payload: { request_id: req.id } }),
      }).catch(() => {})
    } catch (err: unknown) {
      toast((err as { message?: string })?.message || 'Failed to update request', 'error')
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
  const pendingRequests = requests.filter(r => r.status === 'pending')
  const reviewedRequests = requests.filter(r => r.status !== 'pending')

  /* ── Embedded Jitsi for a booked meeting ── */
  if (jitsiMeeting) {
    const roomName = meetingRoomName(jitsiMeeting)
    const otherParty = isTeacher ? jitsiMeeting.parent_name : jitsiMeeting.teacher_name
    return (
      <JitsiMeet
        roomName={roomName}
        displayName={profile.name}
        subject={`Meeting with ${otherParty} · ${jitsiMeeting.date} ${jitsiMeeting.start_time}–${jitsiMeeting.end_time}`}
        onClose={() => setJitsiMeeting(null)}
      />
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
      <div className="spinner" />
    </div>
  )

  return (
    <>
      <PageHeader title="MEETINGS" subtitle={isTeacher ? 'Manage availability and review requests' : 'Book a slot or request a meeting time'} />

      <StatGrid items={[
        { label: 'Available Slots', value: available.length },
        { label: 'My Meetings', value: myBookings.length },
        { label: isTeacher ? 'Pending Requests' : 'My Requests', value: isTeacher ? pendingRequests.length : requests.length },
      ]} columns={3} />

      {/* ── TEACHER: Add availability slot ── */}
      {isTeacher && (
        <div className="fade-up-1" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSlotForm(!showSlotForm)}>
            {showSlotForm ? 'Cancel' : '+ Add Availability'}
          </button>
        </div>
      )}
      {isTeacher && showSlotForm && (
        <div className="card fade-up-1" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={newSlot.date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setNewSlot(s => ({ ...s, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Start</label>
              <input className="input" type="time" value={newSlot.start_time}
                onChange={e => setNewSlot(s => ({ ...s, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="label">End</label>
              <input className="input" type="time" value={newSlot.end_time}
                onChange={e => setNewSlot(s => ({ ...s, end_time: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={createSlot} disabled={busy === 'create'}>
              {busy === 'create' ? 'Creating...' : 'Create Slot'}
            </button>
          </div>
        </div>
      )}

      {/* ── PARENT: Request a meeting ── */}
      {!isTeacher && (
        <div className="fade-up-1" style={{ marginBottom: 16 }}>
          <button className="btn btn-sm" onClick={() => setShowRequestForm(!showRequestForm)} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            {showRequestForm ? 'Cancel' : '+ Request a Meeting Time'}
          </button>
        </div>
      )}
      {!isTeacher && showRequestForm && (
        <div className="card fade-up-1" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
            Propose a meeting time — the teacher will approve or decline your request.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label">Teacher</label>
              <select className="input" value={newRequest.teacher_id} onChange={e => setNewRequest(r => ({ ...r, teacher_id: e.target.value }))}>
                <option value="">Select teacher...</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={newRequest.date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setNewRequest(r => ({ ...r, date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Start</label>
              <input className="input" type="time" value={newRequest.start_time}
                onChange={e => setNewRequest(r => ({ ...r, start_time: e.target.value }))} />
            </div>
            <div>
              <label className="label">End</label>
              <input className="input" type="time" value={newRequest.end_time}
                onChange={e => setNewRequest(r => ({ ...r, end_time: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Message (optional)</label>
              <input className="input" placeholder="Reason or note for teacher..." value={newRequest.message}
                onChange={e => setNewRequest(r => ({ ...r, message: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={submitRequest} disabled={busy === 'request'}>
              {busy === 'request' ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      )}

      {/* ── TEACHER: Pending requests ── */}
      {isTeacher && pendingRequests.length > 0 && (
        <>
          <SectionLabel>Pending Requests ({pendingRequests.length})</SectionLabel>
          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {pendingRequests.map(req => (
              <div key={req.id} className="card" style={{
                padding: 14,
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                flexWrap: 'wrap', gap: 8,
                borderLeft: '3px solid var(--warn)',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{req.parent_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                    {req.proposed_date} · {req.proposed_start} — {req.proposed_end}
                  </div>
                  {req.message && <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 4 }}>{req.message}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => reviewRequest(req, 'approved')} disabled={busy === req.id}>
                    {busy === req.id ? '...' : 'Approve'}
                  </button>
                  <button className="btn btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => reviewRequest(req, 'rejected')} disabled={busy === req.id}>
                    {busy === req.id ? '...' : 'Decline'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── PARENT: My requests ── */}
      {!isTeacher && requests.length > 0 && (
        <>
          <SectionLabel>My Requests</SectionLabel>
          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {requests.map(req => (
              <div key={req.id} className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{req.teacher_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                    {req.proposed_date} · {req.proposed_start} — {req.proposed_end}
                  </div>
                  {req.message && <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 2 }}>{req.message}</div>}
                </div>
                <span className={`tag ${req.status === 'approved' ? 'tag-success' : req.status === 'rejected' ? 'tag-danger' : 'tag-warn'}`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── My booked meetings ── */}
      {myBookings.length > 0 && (
        <>
          <SectionLabel>My Meetings</SectionLabel>
          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {myBookings.map(s => (
              <div key={s.id} className="card" style={{
                padding: 14,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 8,
                borderLeft: '3px solid var(--accent)',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {isTeacher ? `With ${s.parent_name ?? '—'}` : `With ${s.teacher_name}`}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                    {s.date} · {s.start_time} — {s.end_time}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => setJitsiMeeting(s)}>
                    <Icon name="video" size={10} /> Join
                  </button>
                  {isTeacher && s.teacher_id === profile.id && (
                    <button className="btn btn-sm" onClick={() => markCompleted(s)} disabled={busy === s.id}>
                      {busy === s.id ? 'Updating...' : 'Mark Completed'}
                    </button>
                  )}
                  <button className="btn btn-sm" onClick={() => cancelBooking(s)} disabled={busy === s.id}
                    style={{ color: 'var(--danger)' }}>
                    {busy === s.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Available slots ── */}
      <SectionLabel>{isTeacher ? 'Your Availability' : 'Available Slots'}</SectionLabel>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="input" type="date" value={filterDate}
          onChange={e => setFilterDate(e.target.value)} style={{ width: 'auto' }} />
        {filterDate && <button className="btn btn-sm" onClick={() => setFilterDate('')}>Clear</button>}
      </div>
      <div className="fade-up-3" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {available.map(s => (
          <div key={s.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {!isTeacher && <div style={{ fontWeight: 600, fontSize: 13 }}>{s.teacher_name}</div>}
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
                {s.date} · {s.start_time} — {s.end_time}
              </div>
            </div>
            {isTeacher ? (
              <button className="btn btn-sm" onClick={() => deleteSlot(s.id)} disabled={busy === s.id}
                style={{ color: 'var(--danger)' }}>
                {busy === s.id ? 'Removing...' : 'Remove'}
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => bookSlot(s)} disabled={busy === s.id}>
                {busy === s.id ? 'Booking...' : 'Book'}
              </button>
            )}
          </div>
        ))}
        {available.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', padding: 40 }}>
            <Icon name="calendar" size={32} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
              {isTeacher ? 'No availability set. Add slots above.' : 'No open slots — use "Request a Meeting Time" above to propose a time.'}
            </span>
          </div>
        )}
      </div>

      {/* ── TEACHER: Reviewed requests (collapsed) ── */}
      {isTeacher && reviewedRequests.length > 0 && (
        <>
          <SectionLabel>Reviewed Requests ({reviewedRequests.length})</SectionLabel>
          <div className="fade-up-3" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reviewedRequests.map(req => (
              <div key={req.id} className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13 }}>{req.parent_name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                    {req.proposed_date} · {req.proposed_start} — {req.proposed_end}
                  </div>
                </div>
                <span className={`tag ${req.status === 'approved' ? 'tag-success' : 'tag-danger'}`}>{req.status}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
