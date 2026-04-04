'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { pushNotificationBatch } from '@/lib/actions'
import type { Profile, LiveClass } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  profile: Profile
  isTeacher?: boolean
}

export function LiveClassModule({ profile, isTeacher }: Props) {
  const { toast } = useToast()
  const [classes, setClasses] = useState<LiveClass[]>([])
  const [loading, setLoading] = useState(true)
  const [createModal, setCreateModal] = useState(false)
  const [form, setForm] = useState({ title: '', subject: '', scheduled_at: '', duration: 60 })
  const [activeClass, setActiveClass] = useState<LiveClass | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pastLimit, setPastLimit] = useState(20)

  const loadClasses = useCallback(async () => {
    setLoading(true)
    try {
      const query = isTeacher
        ? supabase.from('live_classes').select('*').eq('teacher_id', profile.id).order('scheduled_at', { ascending: true })
        : supabase.from('live_classes').select('*').order('scheduled_at', { ascending: true })
      const { data, error } = await query
      if (error) throw error
      if (data) setClasses(data as LiveClass[])
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load classes', 'error')
    }
    setLoading(false)
  }, [isTeacher, profile.id, toast])

  useEffect(() => {
    loadClasses()
    const ch = supabase.channel('live-classes').on('postgres_changes', { event: '*', schema: 'public', table: 'live_classes' }, () => loadClasses()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [loadClasses])

  const createClass = async () => {
    if (!form.title.trim() || !form.scheduled_at) { toast('Title and date are required', 'error'); return }
    if (new Date(form.scheduled_at) <= new Date()) { toast('Scheduled time must be in the future', 'error'); return }
    setBusy('create')
    try {
      const roomId = `qgx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const { data, error } = await supabase.from('live_classes').insert({
        teacher_id: profile.id,
        teacher_name: profile.name,
        title: form.title.trim(),
        subject: form.subject.trim() || 'General',
        room_id: roomId,
        scheduled_at: form.scheduled_at,
        duration: form.duration,
        status: 'scheduled',
      }).select().single()
      if (error) throw error
      if (data) setClasses(prev => [...prev, data as LiveClass])
      setForm({ title: '', subject: '', scheduled_at: '', duration: 60 })
      setCreateModal(false)
      toast('Class scheduled', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to create class', 'error')
    }
    setBusy(null)
  }

  const startClass = async (cls: LiveClass) => {
    setBusy(cls.id)
    try {
      const { error } = await supabase.from('live_classes').update({ status: 'live' }).eq('id', cls.id)
      if (error) throw error
      const liveClass = { ...cls, status: 'live' as const }
      setClasses(prev => prev.map(c => c.id === cls.id ? liveClass : c))
      if (isTeacher) {
        const { data: students } = await supabase.from('profiles').select('id').eq('role', 'student')
        const studentIds = (students || []).map((s: any) => s.id)
        await pushNotificationBatch(studentIds, `● Class is live: ${cls.title} (${cls.subject}) by ${cls.teacher_name}`, 'live_class')
      }
      joinClass(liveClass)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to start class', 'error')
    }
    setBusy(null)
  }

  const endClass = async (cls: LiveClass) => {
    if (!confirm('End this class for all participants?')) return
    setBusy(cls.id)
    try {
      const { error } = await supabase.from('live_classes').update({ status: 'ended' }).eq('id', cls.id)
      if (error) throw error
      setClasses(prev => prev.map(c => c.id === cls.id ? { ...c, status: 'ended' } : c))
      setActiveClass(null)
      toast('Class ended', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to end class', 'error')
    }
    setBusy(null)
  }

  const joinClass = (cls: LiveClass) => {
    // Only allow joining classes that are explicitly live.
    if (cls.status !== 'live') {
      toast('This class is not currently live', 'error')
      return
    }
    // Validate room_id format to prevent Jitsi URL injection
    if (!/^qgx-[a-z0-9]+-[a-z0-9]+$/i.test(cls.room_id)) {
      toast('Invalid class room', 'error')
      return
    }
    setActiveClass(cls)
  }

  const now = new Date()
  const upcoming = classes.filter(c => c.status === 'scheduled' && new Date(c.scheduled_at) > now)
  const live = classes.filter(c => c.status === 'live')
  const missed = classes.filter(c => c.status === 'scheduled' && new Date(c.scheduled_at) <= now)
  const past = classes.filter(c => c.status === 'ended')

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading live classes...</div>

  // Active class view with embedded Jitsi
  if (activeClass) {
    const jitsiUrl = `https://meet.jit.si/${encodeURIComponent(activeClass.room_id)}#userInfo.displayName="${encodeURIComponent(profile.name)}"`
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '0.08em' }}>{activeClass.title}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
              {activeClass.subject} · {activeClass.teacher_name}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setActiveClass(null)}>
              <Icon name="back" size={11} /> Back
            </button>
            {isTeacher && activeClass.status === 'live' && (
              <button className="btn btn-sm btn-danger" onClick={() => endClass(activeClass)} disabled={busy === activeClass.id}>{busy === activeClass.id ? 'Ending...' : 'End Class'}</button>
            )}
          </div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', height: 'calc(100vh - 200px)', minHeight: 400 }}>
          <iframe
            src={jitsiUrl}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="camera; microphone; fullscreen; display-capture"
            title="Live Class"
          />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="LIVE CLASSES" subtitle={isTeacher ? 'Schedule and manage live sessions' : 'Join live sessions'} />

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Schedule Live Class">
        <div style={{ marginBottom: 14 }}><label className="label">Title</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
        <div style={{ marginBottom: 14 }}><label className="label">Subject</label><input className="input" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} /></div>
        <div style={{ marginBottom: 14 }}><label className="label">Scheduled Date & Time</label><input className="input" type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} /></div>
        <div style={{ marginBottom: 14 }}><label className="label">Duration (minutes)</label><input className="input" type="number" min={15} max={180} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 60 }))} /></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={createClass} disabled={busy === 'create'}>{busy === 'create' ? 'Scheduling...' : 'Schedule'}</button>
          <button className="btn" onClick={() => setCreateModal(false)}>Cancel</button>
        </div>
      </Modal>

      {isTeacher && (
        <div className="fade-up-1" style={{ marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateModal(true)}>
            <Icon name="plus" size={11} /> Schedule Class
          </button>
        </div>
      )}

      {/* Live now */}
      {live.length > 0 && (
        <>
          <SectionLabel>● Live Now</SectionLabel>
          <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
            {live.map(cls => (
              <div key={cls.id} className="card" style={{ padding: 20, borderLeft: '4px solid var(--danger)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1.5s infinite' }} />
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{cls.title}</span>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12 }}>
                  {cls.subject} · {cls.teacher_name} · {cls.duration}min
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => joinClass(cls)} style={{ flex: 1, justifyContent: 'center' }}>
                    Join Class
                  </button>
                  {isTeacher && cls.teacher_id === profile.id && (
                    <button className="btn btn-sm btn-danger" onClick={() => endClass(cls)} disabled={busy === cls.id}>{busy === cls.id ? 'Ending...' : 'End'}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <>
          <SectionLabel>Upcoming</SectionLabel>
          <div className="fade-up-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
            {upcoming.map(cls => (
              <div key={cls.id} className="card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{cls.title}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
                  {cls.subject} · {cls.teacher_name}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginBottom: 12 }}>
                  <Icon name="clock" size={10} /> {new Date(cls.scheduled_at).toLocaleString()} · {cls.duration}min
                </div>
                {isTeacher && cls.teacher_id === profile.id && (
                  <button className="btn btn-primary btn-sm" onClick={() => startClass(cls)} disabled={busy === cls.id} style={{ width: '100%', justifyContent: 'center' }}>
                    {busy === cls.id ? 'Starting...' : 'Start Now'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Past */}
      {missed.length > 0 && (
        <>
          <SectionLabel>Missed / Unstarted</SectionLabel>
          <div className="fade-up-4" style={{ border: '1px solid var(--border)', marginBottom: 18 }}>
            <table className="table">
              <thead><tr><th>Title</th><th>Subject</th><th>Teacher</th><th>Scheduled</th><th>Status</th></tr></thead>
              <tbody>
                {missed.slice(0, pastLimit).map(cls => (
                  <tr key={cls.id}>
                    <td>{cls.title}</td>
                    <td><span className="tag">{cls.subject}</span></td>
                    <td><span className="mono" style={{ fontSize: 11 }}>{cls.teacher_name}</span></td>
                    <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{new Date(cls.scheduled_at).toLocaleString()}</span></td>
                    <td><span className="mono" style={{ fontSize: 11, color: 'var(--warn)' }}>MISSED</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <SectionLabel>Past Sessions</SectionLabel>
          <div className="fade-up-4" style={{ border: '1px solid var(--border)' }}>
            <table className="table">
              <thead><tr><th>Title</th><th>Subject</th><th>Teacher</th><th>Date</th><th>Duration</th></tr></thead>
              <tbody>
                {past.slice(0, pastLimit).map(cls => (
                  <tr key={cls.id}>
                    <td>{cls.title}</td>
                    <td><span className="tag">{cls.subject}</span></td>
                    <td><span className="mono" style={{ fontSize: 11 }}>{cls.teacher_name}</span></td>
                    <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{new Date(cls.scheduled_at).toLocaleDateString()}</span></td>
                    <td><span className="mono" style={{ fontSize: 11 }}>{cls.duration}min</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {past.length > pastLimit && (
            <button className="btn" style={{ marginTop: 8, width: '100%' }} onClick={() => setPastLimit(l => l + 20)}>
              <Icon name="chevron-down" size={14} /> Load More ({past.length - pastLimit} remaining)
            </button>
          )}
        </>
      )}

      {classes.length === 0 && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', padding: 40 }}><Icon name="video" size={32} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No live classes scheduled yet.</span></div>}
    </>
  )
}
