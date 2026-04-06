'use client'
import { useState, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { pushNotification, pushNotificationBatch, logActivity } from '@/lib/actions'
import { MAX_FILE_SIZE } from '@/lib/constants'
import type { Profile, Assignment, Submission } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { useToast } from '@/lib/toast'

/* ═══ SHARED HELPERS ═══ */

const PRIORITIES = [
  { key: 'low', label: 'Low', color: 'var(--fg-dim)' },
  { key: 'medium', label: 'Medium', color: 'var(--warn)' },
  { key: 'high', label: 'High', color: '#f97316' },
  { key: 'critical', label: 'Critical', color: 'var(--danger)' },
] as const

function GradeRing({ percent, size = 40 }: { percent: number; size?: number }) {
  const safePercent = percent != null && isFinite(percent) ? percent : 0
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(safePercent, 100) / 100) * circ
  const color = safePercent >= 80 ? 'var(--success)' : safePercent >= 60 ? 'var(--warn)' : 'var(--danger)'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fill: 'var(--fg)', fontSize: size * 0.28, fontFamily: 'var(--mono)', transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        {safePercent}%
      </text>
    </svg>
  )
}

function getCountdown(dueDate: string) {
  if (!dueDate) return { text: 'No deadline', urgency: 'none' as const }
  const now = new Date()
  const due = new Date(dueDate + 'T23:59:59')
  const diff = due.getTime() - now.getTime()
  if (diff < 0) {
    const days = Math.ceil(Math.abs(diff) / (1000 * 60 * 60 * 24))
    return { text: `${days}d overdue`, urgency: 'overdue' as const }
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 7) return { text: `${days}d left`, urgency: 'safe' as const }
  if (days > 2) return { text: `${days}d ${hours}h`, urgency: 'warning' as const }
  if (days > 0) return { text: `${days}d ${hours}h`, urgency: 'urgent' as const }
  return { text: `${hours}h left`, urgency: 'critical' as const }
}

const urgencyColors: Record<string, string> = {
  none: 'var(--fg-dim)', safe: 'var(--success)', warning: 'var(--warn)',
  urgent: '#f97316', critical: 'var(--danger)', overdue: 'var(--danger)',
}

function PriorityPill({ priority }: { priority: string }) {
  const p = PRIORITIES.find(pr => pr.key === priority) || PRIORITIES[1]
  return <span className="assign-priority-pill" style={{ borderColor: p.color, color: p.color }}>{p.label}</span>
}

/* ═══════════════════════════════════════════════════════════════════════════
   STUDENT ASSIGNMENT MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

export function StudentAssignmentModule({ profile, assignments, enrolledIds, onAssignmentsChange }: {
  profile: Profile
  assignments: (Assignment & { submissions?: Submission[] })[]
  enrolledIds: string[]
  onAssignmentsChange: (a: any[]) => void
}) {
  const [view, setView] = useState<'board' | 'list'>('board')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'due' | 'newest' | 'priority'>('due')
  const [activeAssign, setActiveAssign] = useState<(Assignment & { submissions?: Submission[] }) | null>(null)
  const [submitModal, setSubmitModal] = useState(false)
  const [submitText, setSubmitText] = useState('')
  const [submitFile, setSubmitFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)
  const submitFileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const mySub = (a: any) => a.submissions?.find((s: any) => s.student_id === profile.id)

  const filtered = useMemo(() => {
    let list = [...assignments]
    if (search) list = list.filter(a => a.title.toLowerCase().includes(search.toLowerCase()))
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    if (sort === 'due') list.sort((a, b) => {
      if (!a.due_date) return 1; if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
    if (sort === 'newest') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (sort === 'priority') list.sort((a, b) => (priorityOrder[a.priority || 'medium'] || 2) - (priorityOrder[b.priority || 'medium'] || 2))
    return list
  }, [assignments, search, sort])

  const todo = filtered.filter(a => { const s = mySub(a); return !s || s.is_draft })
  const submitted = filtered.filter(a => { const s = mySub(a); return s && !s.is_draft && !s.grade })
  const graded = filtered.filter(a => { const s = mySub(a); return s && !s.is_draft && s.grade })

  // Stats
  const submittedCount = assignments.filter(a => { const s = mySub(a); return s && !s.is_draft }).length
  const gradedCount = assignments.filter(a => { const s = mySub(a); return s && !s.is_draft && s.grade }).length
  const avgGrade = gradedCount > 0
    ? Math.round(assignments.reduce((sum, a) => { const s = mySub(a); return sum + (s?.score || 0) }, 0) / gradedCount)
    : 0
  const onTimeCount = assignments.filter(a => { const s = mySub(a); return s && !s.is_draft && !s.is_late }).length
  const onTimeRate = submittedCount > 0 ? Math.round((onTimeCount / submittedCount) * 100) : 100

  const submitAssignment = async (draft = false) => {
    if (!activeAssign || !profile) return
    if (activeAssign.course_id && !enrolledIds.includes(activeAssign.course_id)) {
      setSubmitStatus('× You must be enrolled in this course to submit.'); return
    }
    if (submitFile && submitFile.size > MAX_FILE_SIZE) { setSubmitStatus('× File too large. Max 50 MB.'); return }
    const ALLOWED_EXTENSIONS = ['.pdf','.doc','.docx','.ppt','.pptx','.jpg','.jpeg','.png','.zip','.txt']
    if (submitFile) {
      const ext = '.' + (submitFile.name.split('.').pop() || '').toLowerCase()
      if (!ALLOWED_EXTENSIONS.includes(ext)) { setSubmitStatus('× File type not allowed.'); return }
    }
    if (!draft && !submitText && !submitFile) { setSubmitStatus('× Please add a response or file.'); return }
    if (draft) setSavingDraft(true); else setSubmitting(true)
    setSubmitStatus(draft ? 'Saving draft...' : 'Submitting...')
    try {
      let file_url = '', file_name = ''
      if (submitFile) {
        const ext = submitFile.name.split('.').pop()
        const path = `submissions/${profile.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('course-files').upload(path, submitFile)
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(path)
          file_url = urlData.publicUrl; file_name = submitFile.name
        }
      }
      const isLate = !draft && activeAssign.due_date && new Date(activeAssign.due_date + 'T23:59:59') < new Date()
      const existing = activeAssign.submissions?.find((s: any) => s.student_id === profile.id)
      const payload: any = {
        text_response: submitText, file_url, file_name,
        submitted_at: new Date().toISOString(),
        is_draft: draft, is_late: isLate || false,
      }
      if (!file_url && existing?.file_url) { payload.file_url = existing.file_url; payload.file_name = existing.file_name }
      if (existing) {
        const { error } = await supabase.from('submissions').update(payload).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('submissions').insert({ assignment_id: activeAssign.id, student_id: profile.id, ...payload })
        if (error) throw error
      }
      if (!draft) {
        if (activeAssign.teacher_id) await pushNotification(activeAssign.teacher_id, `▫ ${profile.name} submitted: "${activeAssign.title}"`, 'submission')
        await logActivity(`${profile.name} submitted assignment: ${activeAssign.title}`, 'submission')
      }
      setSubmitStatus(draft ? '▪ Draft saved!' : '✓ Submitted!')
      if (!draft) { setSubmitText(''); setSubmitFile(null); if (submitFileRef.current) submitFileRef.current.value = '' }
      // Refresh — non-blocking: submission already saved, never overwrite success with refresh error
      try {
        const { data } = await supabase.from('assignments').select('*, submissions(*)').order('created_at', { ascending: false })
        if (data) { onAssignmentsChange(data); const r = data.find((a: any) => a.id === activeAssign.id); if (r) setActiveAssign(r) }
      } catch { /* swallow refresh errors */ }
      if (!draft) setTimeout(() => { setSubmitModal(false); setSubmitStatus('') }, 1200)
      else setTimeout(() => setSubmitStatus(''), 2000)
    } catch (e: any) {
      setSubmitStatus(`× Failed: ${e.message || 'Unknown error'}`)
      toast(e instanceof Error ? e.message : 'Failed to submit assignment', 'error')
    } finally {
      setSubmitting(false); setSavingDraft(false)
    }
  }

  const openAssign = (a: any) => {
    const sub = mySub(a)
    setActiveAssign(a)
    setSubmitText(sub?.text_response || '')
    setSubmitFile(null)
    setSubmitStatus('')
    setSubmitModal(true)
  }

  const renderCard = (a: any) => {
    const sub = mySub(a)
    const countdown = getCountdown(a.due_date)
    const scoreNum = sub?.score || parseInt(sub?.grade || '0') || 0
    return (
      <div key={a.id} className="assign-card fade-up" onClick={() => openAssign(a)}>
        <div className="assign-card-top">
          <PriorityPill priority={a.priority || 'medium'} />
          <span className="assign-countdown" style={{ color: urgencyColors[countdown.urgency] }}>
            <Icon name="clock" size={10} /> {countdown.text}
          </span>
        </div>
        <div className="assign-card-title">{a.title}</div>
        <div className="assign-card-teacher">{a.teacher_name}</div>
        {a.description && <div className="assign-card-desc">{a.description.slice(0, 80)}{a.description.length > 80 ? '...' : ''}</div>}
        <div className="assign-card-footer">
          {sub?.grade && <GradeRing percent={scoreNum} size={34} />}
          {sub?.is_draft && <span className="tag tag-warn" style={{ fontSize: 9 }}>DRAFT</span>}
          {sub?.is_late && <span className="tag" style={{ fontSize: 9, borderColor: 'var(--danger)', color: 'var(--danger)' }}>LATE</span>}
          {a.attachment_name && <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>▸</span>}
          {a.max_points && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{a.max_points}pts</span>}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ── Submit / Detail Modal ── */}
      <Modal open={submitModal && !!activeAssign} onClose={() => setSubmitModal(false)} title={activeAssign?.title || 'Assignment'} width={560}>
        {activeAssign && (() => {
          const sub = mySub(activeAssign)
          const isGraded = !!sub?.grade && !sub?.is_draft
          const scoreNum = sub?.score || parseInt(sub?.grade || '0') || 0
          return (<>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <PriorityPill priority={activeAssign.priority || 'medium'} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: urgencyColors[getCountdown(activeAssign.due_date).urgency] }}>
                {getCountdown(activeAssign.due_date).text}
              </span>
              {activeAssign.max_points && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Max: {activeAssign.max_points}pts</span>}
              {activeAssign.status === 'closed' && <span className="tag" style={{ fontSize: 9, borderColor: 'var(--fg-dim)', color: 'var(--fg-dim)' }}>CLOSED</span>}
            </div>

            {activeAssign.description && (
              <div className="card" style={{ padding: 12, fontSize: 13, color: 'var(--fg-dim)', marginBottom: 16, maxHeight: 120, overflowY: 'auto' }}>
                {activeAssign.description}
              </div>
            )}
            {activeAssign.attachment_url && (
              <div style={{ marginBottom: 16 }}>
                <a href={activeAssign.attachment_url} target="_blank" rel="noopener noreferrer"
                  className="btn btn-xs" style={{ borderColor: 'var(--success)', color: 'var(--success)', textDecoration: 'none' }}>
                  <Icon name="download" size={10} /> {activeAssign.attachment_name || 'Download'}
                </a>
              </div>
            )}

            {/* Grade display */}
            {isGraded && (
              <div className="assign-feedback-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: sub?.feedback ? 10 : 0 }}>
                  <GradeRing percent={scoreNum} size={52} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>Score: {sub?.grade}</div>
                    {sub?.is_late && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--danger)' }}>Submitted late</span>}
                  </div>
                </div>
                {sub?.feedback && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 0 }}>
                    ◇ {sub.feedback}
                  </div>
                )}
              </div>
            )}

            {/* Submit form */}
            {!isGraded && (<>
              <div style={{ marginBottom: 14 }}>
                <label className="label">Your Response</label>
                <textarea className="input" rows={5} value={submitText} onChange={e => setSubmitText(e.target.value)} placeholder="Type your answer..." />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="label">Upload File (optional)</label>
                <input ref={submitFileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.zip,.txt"
                  onChange={e => setSubmitFile(e.target.files?.[0] || null)}
                  style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg)' }} />
                {sub?.file_url && !submitFile && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--success)', marginTop: 6 }}>▸ Current: {sub.file_name}</div>
                )}
              </div>
              {submitStatus && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 12,
                  color: submitStatus.startsWith('✓') || submitStatus.startsWith('▪') ? 'var(--success)' : submitStatus.startsWith('×') ? 'var(--danger)' : 'var(--fg-dim)' }}>
                  {submitStatus}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => submitAssignment(false)} disabled={submitting || savingDraft || (!submitText && !submitFile)}>
                  {submitting ? <><span className="spinner" /> Submitting...</> : <><Icon name="upload" size={12} /> Submit</>}
                </button>
                <button className="btn" onClick={() => submitAssignment(true)} disabled={submitting || savingDraft || !submitText}
                  style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}>
                  {savingDraft ? <><span className="spinner" /> Saving...</> : '▪ Save Draft'}
                </button>
                <button className="btn" onClick={() => setSubmitModal(false)}>Cancel</button>
              </div>
            </>)}

            {isGraded && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-xs" onClick={() => { setActiveAssign({ ...activeAssign, submissions: activeAssign.submissions?.map((s: any) => s.student_id === profile.id ? { ...s, grade: undefined, score: undefined } : s) }) }}>
                  ↺ Resubmit
                </button>
                <button className="btn" onClick={() => setSubmitModal(false)}>Close</button>
              </div>
            )}
          </>)
        })()}
      </Modal>

      <PageHeader title="ASSIGNMENTS" subtitle="Track, submit, and earn your grades" />

      {/* ── Stats Bar ── */}
      <div className="assign-stats-bar fade-up-1">
        <div className="assign-stat">
          <div className="assign-stat-value">{assignments.length}</div>
          <div className="assign-stat-label">Total</div>
        </div>
        <div className="assign-stat">
          <div className="assign-stat-value" style={{ color: '#6366f1' }}>{submittedCount}</div>
          <div className="assign-stat-label">Submitted</div>
        </div>
        <div className="assign-stat">
          <div className="assign-stat-value" style={{ color: 'var(--success)' }}>{gradedCount}</div>
          <div className="assign-stat-label">Graded</div>
        </div>
        <div className="assign-stat">
          <div className="assign-stat-value">{avgGrade > 0 ? avgGrade + '%' : '—'}</div>
          <div className="assign-stat-label">Avg Grade</div>
        </div>
        <div className="assign-stat">
          <div className="assign-stat-value" style={{ color: onTimeRate >= 80 ? 'var(--success)' : 'var(--warn)' }}>{onTimeRate}%</div>
          <div className="assign-stat-label">On Time</div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="assign-controls fade-up-2">
        <div className="assign-search">
          <Icon name="search" size={14} />
          <input placeholder="Search assignments..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="assign-sort" value={sort} onChange={e => setSort(e.target.value as any)}>
            <option value="due">Due Date</option>
            <option value="newest">Newest</option>
            <option value="priority">Priority</option>
          </select>
          <button className={`assign-view-btn ${view === 'board' ? 'active' : ''}`} onClick={() => setView('board')}>Board</button>
          <button className={`assign-view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>List</button>
        </div>
      </div>

      {/* ── Board View (Kanban) ── */}
      {view === 'board' && (
        <div className="assign-board fade-up-3">
          <div className="assign-column">
            <div className="assign-column-header" style={{ borderColor: 'var(--warn)' }}>
              <span>▫ To Do</span><span className="assign-column-count">{todo.length}</span>
            </div>
            {todo.length === 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11, padding: 12 }}><Icon name="check" size={14} /> All caught up!</div>}
            {todo.map(renderCard)}
          </div>
          <div className="assign-column">
            <div className="assign-column-header" style={{ borderColor: '#6366f1' }}>
              <span>▸ Submitted</span><span className="assign-column-count">{submitted.length}</span>
            </div>
            {submitted.length === 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11, padding: 12 }}><Icon name="clock" size={14} /> Nothing pending.</div>}
            {submitted.map(renderCard)}
          </div>
          <div className="assign-column">
            <div className="assign-column-header" style={{ borderColor: 'var(--success)' }}>
              <span>✓ Graded</span><span className="assign-column-count">{graded.length}</span>
            </div>
            {graded.length === 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 11, padding: 12 }}><Icon name="chart" size={14} /> No grades yet.</div>}
            {graded.map(renderCard)}
          </div>
        </div>
      )}

      {/* ── List View ── */}
      {view === 'list' && (
        <div className="fade-up-3">
          {filtered.length === 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}><Icon name="search" size={14} /> No assignments found.</div>}
          {filtered.map(a => {
            const sub = mySub(a)
            const countdown = getCountdown(a.due_date)
            const scoreNum = sub?.score || parseInt(sub?.grade || '0') || 0
            return (
              <div key={a.id} className="assign-list-card fade-up" onClick={() => openAssign(a)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <PriorityPill priority={a.priority || 'medium'} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{a.title}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                      {a.teacher_name} · <span style={{ color: urgencyColors[countdown.urgency] }}>{countdown.text}</span>
                      {a.max_points ? ` · ${a.max_points}pts` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {sub?.is_late && <span className="tag" style={{ fontSize: 9, borderColor: 'var(--danger)', color: 'var(--danger)' }}>LATE</span>}
                  {sub?.is_draft && <span className="tag tag-warn" style={{ fontSize: 9 }}>DRAFT</span>}
                  {sub?.grade && !sub?.is_draft ? <GradeRing percent={scoreNum} size={32} />
                    : sub && !sub.is_draft ? <span className="tag" style={{ fontSize: 9, borderColor: '#6366f1', color: '#6366f1' }}>Submitted</span>
                    : <span className="tag" style={{ fontSize: 9 }}>Pending</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TEACHER ASSIGNMENT MODULE
   ═══════════════════════════════════════════════════════════════════════════ */

export function TeacherAssignmentModule({ profile, assignments, students, onAssignmentsChange }: {
  profile: Profile
  assignments: (Assignment & { submissions?: Submission[] })[]
  students: Profile[]
  onAssignmentsChange: (a: any[]) => void
}) {
  const [activeAssign, setActiveAssign] = useState<(Assignment & { submissions?: Submission[] }) | null>(null)
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [analyticsModal, setAnalyticsModal] = useState(false)
  const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null)
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' })
  const [assignFile, setAssignFile] = useState<File | null>(null)
  const [assignUploading, setAssignUploading] = useState(false)
  const assignFileRef = useRef<HTMLInputElement>(null)
  const [newAssign, setNewAssign] = useState({ title: '', description: '', due_date: '', priority: 'medium', max_points: '100' })
  const [editForm, setEditForm] = useState({ title: '', description: '', due_date: '', priority: 'medium', max_points: '100', status: 'active' })
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'newest' | 'due' | 'submissions'>('newest')
  const { toast } = useToast()

  const filtered = useMemo(() => {
    let list = [...assignments]
    if (search) list = list.filter(a => a.title.toLowerCase().includes(search.toLowerCase()))
    if (sort === 'newest') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (sort === 'due') list.sort((a, b) => {
      if (!a.due_date) return 1; if (!b.due_date) return -1
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    })
    if (sort === 'submissions') list.sort((a, b) => (b.submissions?.length || 0) - (a.submissions?.length || 0))
    return list
  }, [assignments, search, sort])

  const refreshAssign = async (id: string) => {
    try {
      const { data, error } = await supabase.from('assignments').select('*, submissions(*)').eq('id', id).single()
      if (error) throw error
      if (data) {
        setActiveAssign(data)
        onAssignmentsChange(assignments.map(a => a.id === id ? data : a))
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to refresh assignment', 'error')
    }
  }

  const createAssignment = async () => {
    if (!newAssign.title || !profile) return
    if (newAssign.due_date && new Date(newAssign.due_date) < new Date(new Date().toDateString())) {
      toast('Due date cannot be in the past', 'error'); return
    }
    if (assignFile && assignFile.size > MAX_FILE_SIZE) { toast('File too large. Max 50 MB.', 'error'); return }
    setAssignUploading(true)
    try {
      let attachment_url = '', attachment_name = ''
      if (assignFile) {
        const ext = assignFile.name.split('.').pop()
        const path = `assignments/${profile.id}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('course-files').upload(path, assignFile)
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(path)
        attachment_url = urlData.publicUrl; attachment_name = assignFile.name
      }
      const { data, error } = await supabase.from('assignments').insert({
        title: newAssign.title, description: newAssign.description,
        due_date: newAssign.due_date || null, teacher_id: profile.id,
        teacher_name: profile.name, attachment_url, attachment_name,
        priority: newAssign.priority, max_points: parseInt(newAssign.max_points) || 100,
      }).select('*, submissions(*)').single()
      if (error) throw error
      if (data) {
        onAssignmentsChange([data, ...assignments])
        await pushNotificationBatch(students.map(s => s.id), `▫ New assignment: "${newAssign.title}"`, 'assignment')
        await logActivity(`Teacher ${profile.name} created assignment: ${newAssign.title}`, 'assignment')
      }
      setNewAssign({ title: '', description: '', due_date: '', priority: 'medium', max_points: '100' })
      setAssignFile(null)
      if (assignFileRef.current) assignFileRef.current.value = ''
      setCreateModal(false)
      toast('Assignment created', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create assignment', 'error')
    } finally {
      setAssignUploading(false)
    }
  }

  const updateAssignment = async () => {
    if (!activeAssign) return
    if (editForm.due_date && new Date(editForm.due_date) < new Date(new Date().toDateString())) {
      toast('Due date cannot be in the past', 'error'); return
    }
    try {
      const { error } = await supabase.from('assignments').update({
        title: editForm.title, description: editForm.description,
        due_date: editForm.due_date || null, priority: editForm.priority,
        max_points: parseInt(editForm.max_points) || 100,
        status: editForm.status,
      }).eq('id', activeAssign.id).eq('teacher_id', profile.id)
      if (error) throw error
      const updated = { ...activeAssign, ...editForm, max_points: parseInt(editForm.max_points) || 100, status: editForm.status as Assignment['status'], priority: editForm.priority as Assignment['priority'] }
      setActiveAssign(updated)
      onAssignmentsChange(assignments.map(a => a.id === activeAssign.id ? { ...a, ...editForm, max_points: parseInt(editForm.max_points) || 100, status: editForm.status as Assignment['status'], priority: editForm.priority as Assignment['priority'] } : a))
      setEditModal(false)
      toast('Assignment updated', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update assignment', 'error')
    }
  }

  const deleteAssignment = async (id: string) => {
    if (!confirm('Delete this assignment and all submissions?')) return
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', id).eq('teacher_id', profile.id)
      if (error) throw error
      onAssignmentsChange(assignments.filter(a => a.id !== id))
      if (activeAssign?.id === id) setActiveAssign(null)
      toast('Assignment deleted', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete assignment', 'error')
    }
  }

  const submitGrade = async () => {
    if (!gradingSubmission || !gradeForm.score) return
    try {
      const score = parseInt(gradeForm.score)
      const { error } = await supabase.from('submissions').update({
        score, grade: score + '%', feedback: gradeForm.feedback,
      }).eq('id', gradingSubmission.id)
      if (error) throw error
      if (gradingSubmission.student_id)
        await pushNotification(gradingSubmission.student_id, `▫ "${activeAssign?.title}" graded: ${score}%`, 'grade')
      setGradingSubmission(null); setGradeForm({ score: '', feedback: '' })
      if (activeAssign) await refreshAssign(activeAssign.id)
      toast('Grade submitted', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to submit grade', 'error')
    }
  }

  const getAnalytics = (a: any) => {
    const subs: any[] = (a.submissions || []).filter((s: any) => !s.is_draft)
    const total = students.length
    const graded = subs.filter((s: any) => s.grade).length
    const late = subs.filter((s: any) => s.is_late).length
    const scores = subs.filter((s: any) => s.score != null).map((s: any) => s.score as number)
    const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
    const highest = scores.length > 0 ? Math.max(...scores) : 0
    const lowest = scores.length > 0 ? Math.min(...scores) : 0
    const dist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    scores.forEach(s => { if (s >= 90) dist.A++; else if (s >= 80) dist.B++; else if (s >= 70) dist.C++; else if (s >= 60) dist.D++; else dist.F++ })
    return { total, submitted: subs.length, graded, late, avg, highest, lowest, dist, scores }
  }

  /* ── DETAIL VIEW ── */
  if (activeAssign) {
    const analytics = getAnalytics(activeAssign)
    const subs = (activeAssign.submissions || []).filter((s: any) => !s.is_draft)
    const submittedIds = new Set(subs.map((s: any) => s.student_id))
    const missing = students.filter(s => !submittedIds.has(s.id))

    return (<>
      {/* Grade Modal */}
      <Modal open={!!gradingSubmission} onClose={() => setGradingSubmission(null)} title="Grade Submission" width={480}>
        {gradingSubmission && (<>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 16 }}>
            {gradingSubmission.student_name || gradingSubmission.student_id}
          </div>
          {gradingSubmission.text_response && (
            <div style={{ marginBottom: 16 }}>
              <label className="label">Response</label>
              <div className="card" style={{ padding: 12, fontSize: 13, color: 'var(--fg-dim)', maxHeight: 160, overflowY: 'auto' }}>{gradingSubmission.text_response}</div>
            </div>
          )}
          {gradingSubmission.file_url && (
            <div style={{ marginBottom: 16 }}>
              <a href={gradingSubmission.file_url} target="_blank" rel="noopener noreferrer"
                className="btn btn-xs" style={{ borderColor: 'var(--success)', color: 'var(--success)', textDecoration: 'none' }}>
                <Icon name="download" size={10} /> {gradingSubmission.file_name || 'View File'}
              </a>
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label className="label">Score (0–{activeAssign.max_points || 100})</label>
            <input className="input" type="number" min={0} max={activeAssign.max_points || 100} value={gradeForm.score}
              onChange={e => setGradeForm(f => ({ ...f, score: e.target.value }))} placeholder="e.g. 85" style={{ width: 120 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="label">Feedback (optional)</label>
            <textarea className="input" rows={3} value={gradeForm.feedback}
              onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} placeholder="Feedback for student..." />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={submitGrade}>Submit Grade</button>
            <button className="btn" onClick={() => setGradingSubmission(null)}>Cancel</button>
          </div>
        </>)}
      </Modal>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Assignment" width={520}>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Title</label>
          <input className="input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Description</label>
          <textarea className="input" rows={3} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Due Date</label>
            <input className="input" type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Max Points</label>
            <input className="input" type="number" min={1} value={editForm.max_points} onChange={e => setEditForm(f => ({ ...f, max_points: e.target.value }))} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Priority</label>
            <select className="input" value={editForm.priority} onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Status</label>
            <select className="input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={updateAssignment}>Save Changes</button>
          <button className="btn" onClick={() => setEditModal(false)}>Cancel</button>
        </div>
      </Modal>

      {/* Analytics Modal */}
      <Modal open={analyticsModal} onClose={() => setAnalyticsModal(false)} title="Assignment Analytics" width={500}>
        <div className="assign-analytics">
          <div className="assign-analytics-row">
            <div className="assign-analytics-stat">
              <div style={{ fontSize: 24, fontWeight: 700 }}>{analytics.submitted}/{analytics.total}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Submitted</div>
            </div>
            <div className="assign-analytics-stat">
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{analytics.avg}%</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Avg Score</div>
            </div>
            <div className="assign-analytics-stat">
              <div style={{ fontSize: 24, fontWeight: 700 }}>{analytics.graded}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Graded</div>
            </div>
            <div className="assign-analytics-stat">
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)' }}>{analytics.late}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Late</div>
            </div>
          </div>
          {analytics.scores.length > 0 && (<>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', margin: '16px 0 8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Grade Distribution
            </div>
            <div className="assign-dist-chart">
              {Object.entries(analytics.dist).map(([grade, count]) => (
                <div key={grade} className="assign-dist-bar">
                  <div className="assign-dist-fill" style={{
                    height: `${analytics.scores.length > 0 ? (count / analytics.scores.length) * 100 : 0}%`,
                    background: grade === 'A' ? 'var(--success)' : grade === 'B' ? '#22d3ee' : grade === 'C' ? 'var(--warn)' : grade === 'D' ? '#f97316' : 'var(--danger)'
                  }} />
                  <span className="assign-dist-label">{grade}</span>
                  <span className="assign-dist-count">{count}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 12 }}>
              Range: {analytics.lowest}% — {analytics.highest}%
            </div>
          </>)}
        </div>
      </Modal>

      {/* ── Detail Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => setActiveAssign(null)}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '0.08em' }}>{activeAssign.title}</span>
            <PriorityPill priority={activeAssign.priority || 'medium'} />
            {activeAssign.status === 'closed' && <span className="tag" style={{ fontSize: 9, borderColor: 'var(--fg-dim)', color: 'var(--fg-dim)' }}>CLOSED</span>}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
            Due: {activeAssign.due_date || 'No deadline'} · {activeAssign.max_points || 100}pts · {analytics.submitted}/{analytics.total} submitted
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-xs" onClick={() => setAnalyticsModal(true)}><Icon name="chart" size={10} /> Analytics</button>
          <button className="btn btn-xs" onClick={() => {
            setEditForm({
              title: activeAssign.title, description: activeAssign.description || '',
              due_date: activeAssign.due_date || '', priority: activeAssign.priority || 'medium',
              max_points: String(activeAssign.max_points || 100), status: activeAssign.status || 'active'
            }); setEditModal(true)
          }}><Icon name="edit" size={10} /> Edit</button>
          <button className="btn btn-xs" onClick={() => refreshAssign(activeAssign.id)}>↻ Refresh</button>
        </div>
      </div>

      {/* Description */}
      {activeAssign.description && (
        <div className="card" style={{ padding: 16, marginBottom: 20, fontSize: 13, color: 'var(--fg-dim)' }}>
          {activeAssign.description}
          {activeAssign.attachment_url && (
            <div style={{ marginTop: 10 }}>
              <a href={activeAssign.attachment_url} target="_blank" rel="noopener noreferrer"
                className="btn btn-xs" style={{ borderColor: 'var(--success)', color: 'var(--success)', textDecoration: 'none' }}>
                <Icon name="download" size={10} /> {activeAssign.attachment_name || 'Download'}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="assign-quick-stats fade-up-1">
        <div>▪ {Math.round((analytics.submitted / Math.max(analytics.total, 1)) * 100)}% submission rate</div>
        <div>▪ Avg: {analytics.avg}%</div>
        <div>★ High: {analytics.highest}%</div>
        <div style={{ color: analytics.late > 0 ? 'var(--danger)' : 'var(--fg-dim)' }}>○ {analytics.late} late</div>
      </div>

      {/* Submissions */}
      <SectionLabel>Submissions ({subs.length})</SectionLabel>
      {subs.length === 0 && <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>No submissions yet.</div>}
      {subs.map((sub: any) => {
        const student = students.find(s => s.id === sub.student_id)
        return (
          <div key={sub.id} className="card fade-up" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>
                {student?.name || sub.student_id}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)', marginLeft: 8 }}>{student?.qgx_id}</span>
                {sub.is_late && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--danger)', marginLeft: 8 }}>LATE</span>}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
                {sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : '—'}
              </div>
              {sub.text_response && (
                <div style={{ fontSize: 12, color: 'var(--fg-dim)', fontStyle: 'italic', marginTop: 4 }}>
                  &ldquo;{sub.text_response.slice(0, 80)}{sub.text_response.length > 80 ? '...' : ''}&rdquo;
                </div>
              )}
              {sub.file_url && (
                <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--success)', textDecoration: 'none' }}>
                  ▸ {sub.file_name || 'File'}
                </a>
              )}
              {sub.feedback && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>◇ {sub.feedback}</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginLeft: 12 }}>
              {sub.grade
                ? <GradeRing percent={sub.score || parseInt(sub.grade)} size={36} />
                : <span className="tag tag-warn">Ungraded</span>}
              <button className="btn btn-xs" onClick={() => {
                setGradingSubmission({ ...sub, student_name: student?.name })
                setGradeForm({ score: sub.score?.toString() || '', feedback: sub.feedback || '' })
              }}>
                <Icon name="edit" size={10} /> {sub.grade ? 'Re-grade' : 'Grade'}
              </button>
            </div>
          </div>
        )
      })}

      {/* Missing submissions */}
      {missing.length > 0 && (<>
        <SectionLabel>Not Submitted ({missing.length})</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {missing.map(s => <span key={s.id} className="tag" style={{ fontSize: 10 }}>{s.name}</span>)}
        </div>
      </>)}
    </>)
  }

  /* ── LIST VIEW ── */
  return (<>
    {/* Create Modal */}
    <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Assignment" width={540}>
      <div style={{ marginBottom: 14 }}>
        <label className="label">Title</label>
        <input className="input" value={newAssign.title} onChange={e => setNewAssign(a => ({ ...a, title: e.target.value }))} placeholder="e.g. Unit 2 Essay" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="label">Description / Instructions</label>
        <textarea className="input" rows={4} value={newAssign.description} onChange={e => setNewAssign(a => ({ ...a, description: e.target.value }))} placeholder="Describe the task, requirements..." />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label className="label">Due Date</label>
          <input className="input" type="date" value={newAssign.due_date} onChange={e => setNewAssign(a => ({ ...a, due_date: e.target.value }))} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label">Max Points</label>
          <input className="input" type="number" min={1} value={newAssign.max_points} onChange={e => setNewAssign(a => ({ ...a, max_points: e.target.value }))} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label className="label">Priority</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {PRIORITIES.map(p => (
            <button key={p.key} className={`assign-priority-btn ${newAssign.priority === p.key ? 'active' : ''}`}
              style={{ borderColor: p.color, color: newAssign.priority === p.key ? '#fff' : p.color, background: newAssign.priority === p.key ? p.color : 'transparent' }}
              onClick={() => setNewAssign(a => ({ ...a, priority: p.key }))}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label className="label">Attach File (optional)</label>
        <input ref={assignFileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.zip"
          onChange={e => setAssignFile(e.target.files?.[0] || null)}
          style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg)' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={createAssignment} disabled={assignUploading}>
          {assignUploading ? <><span className="spinner" /> Creating...</> : 'Create Assignment'}
        </button>
        <button className="btn" onClick={() => setCreateModal(false)}>Cancel</button>
      </div>
    </Modal>

    <PageHeader title="ASSIGNMENTS" subtitle="Create, manage, and grade student work" />

    <div className="assign-controls fade-up-1">
      <button className="btn btn-primary btn-sm" onClick={() => setCreateModal(true)}><Icon name="plus" size={12} /> New Assignment</button>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="assign-search">
          <Icon name="search" size={14} />
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="assign-sort" value={sort} onChange={e => setSort(e.target.value as any)}>
          <option value="newest">Newest</option>
          <option value="due">Due Date</option>
          <option value="submissions">Most Submissions</option>
        </select>
      </div>
    </div>

    {filtered.length === 0 && <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>No assignments yet.</div>}

    <div className="assign-teacher-grid fade-up-2">
      {filtered.map(a => {
        const subs = (a.submissions || []).filter((s: any) => !s.is_draft)
        const gradedCount = subs.filter((s: any) => s.grade).length
        const rate = students.length > 0 ? Math.round((subs.length / students.length) * 100) : 0
        const countdown = getCountdown(a.due_date)
        return (
          <div key={a.id} className="assign-teacher-card fade-up">
            <div style={{ cursor: 'pointer' }} onClick={() => refreshAssign(a.id)}>
              <div className="assign-card-top">
                <PriorityPill priority={a.priority || 'medium'} />
                {a.status === 'closed' && <span className="tag" style={{ fontSize: 8, borderColor: 'var(--fg-dim)', color: 'var(--fg-dim)' }}>CLOSED</span>}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: urgencyColors[countdown.urgency] }}>{countdown.text}</span>
              </div>
              <div className="assign-card-title">{a.title}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8 }}>
                {a.max_points || 100}pts · Due: {a.due_date || 'None'}
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)', marginBottom: 3 }}>
                  <span>{subs.length}/{students.length} submitted</span><span>{rate}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 0 }}>
                  <div style={{ height: '100%', width: `${rate}%`, borderRadius: 0, transition: 'width 0.6s ease',
                    background: rate >= 80 ? 'var(--success)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)' }} />
                </div>
              </div>
              <div className="assign-card-footer">
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: gradedCount === subs.length && subs.length > 0 ? 'var(--success)' : 'var(--fg-dim)' }}>
                  {gradedCount}/{subs.length} graded
                </span>
                {a.attachment_name && <span style={{ fontSize: 10 }}>▸</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn btn-xs" style={{ flex: 1 }} onClick={() => refreshAssign(a.id)}>
                <Icon name="edit" size={10} /> Manage
              </button>
              <button className="btn btn-xs btn-danger" onClick={() => deleteAssignment(a.id)}>
                <Icon name="trash" size={10} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  </>)
}
