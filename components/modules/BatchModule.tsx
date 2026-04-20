'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { sanitizeText } from '@/lib/utils'
import { useToast } from '@/lib/toast'
import type { Profile, Assignment, Submission } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Modal } from '@/components/ui/Modal'

interface AdminBatchProps { users: Profile[]; onUsersChange: (users: Profile[]) => void }

export function AdminBatchModule({ users, onUsersChange }: AdminBatchProps) {
  const { toast } = useToast()
  const [csvPreview, setCsvPreview] = useState<{ name: string; email: string; role: string }[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.csv')) { toast('Please upload a CSV file', 'error'); return }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { toast('CSV must have a header row and at least one data row', 'error'); return }
      const header = lines[0].toLowerCase().split(',').map(h => h.trim())
      const nameIdx = header.findIndex(h => h === 'name')
      const emailIdx = header.findIndex(h => h === 'email')
      const roleIdx = header.findIndex(h => h === 'role')
      if (nameIdx === -1 || emailIdx === -1) { toast('CSV must have "name" and "email" columns', 'error'); return }
      const rows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        return {
          name: sanitizeText(cols[nameIdx] || ''),
          email: cols[emailIdx] || '',
          role: roleIdx !== -1 ? cols[roleIdx]?.toLowerCase() || 'student' : 'student',
        }
      }).filter(r => r.name && r.email)
      setCsvPreview(rows)
    }
    reader.readAsText(file)
  }

  const importUsers = async () => {
    if (!csvPreview.length) return
    if (!window.confirm(`Import ${csvPreview.length} users? This cannot be undone.`)) return
    // Validate emails before starting
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmails = csvPreview.filter(r => !emailRegex.test(r.email))
    if (invalidEmails.length > 0) {
      toast(`${invalidEmails.length} invalid email(s): ${invalidEmails.slice(0, 3).map(r => r.email).join(', ')}${invalidEmails.length > 3 ? '...' : ''}`, 'error')
      return
    }
    setImporting(true)
    const result = { success: 0, failed: 0, errors: [] as string[] }
    const BATCH_SIZE = 5

    for (let i = 0; i < csvPreview.length; i += BATCH_SIZE) {
      const batch = csvPreview.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map(async (row) => {
      if (!['admin', 'teacher', 'student', 'parent'].includes(row.role)) {
        result.failed++
        result.errors.push(`${row.email}: invalid role "${row.role}"`)
        return
      }
      // Check existing
      const { data: existing } = await supabase.from('profiles').select('id').eq('email', row.email).single()
      if (existing) {
        result.failed++
        result.errors.push(`${row.email}: already exists`)
        return
      }
      // Create via API (since we can't create auth users from client)
      const res = await fetch('/api/batch-create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.name, email: row.email, role: row.role }),
      })
      if (res.ok) {
        result.success++
      } else {
        result.failed++
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
        result.errors.push(`${row.email}: ${error}`)
      }
      }))
    }

    setImportResult(result)
    setImporting(false)
    setCsvPreview([])
    // Refresh users
    const { data } = await supabase.from('profiles').select('*').order('joined', { ascending: false })
    if (data) onUsersChange(data as Profile[])
  }

  return (
    <>
      <PageHeader title="BATCH OPERATIONS" subtitle="Bulk user import and management" />

      <div className="card fade-up-2" style={{ marginBottom: 20 }}>
        <SectionLabel>Bulk User Import</SectionLabel>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12 }}>
          Upload a CSV file with columns: name, email, role (optional, defaults to student)
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={11} /> Upload CSV
          </button>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
            Format: name,email,role
          </span>
        </div>
      </div>

      {/* CSV Preview */}
      {csvPreview.length > 0 && (
        <div className="card fade-up-3" style={{ marginBottom: 20 }}>
          <SectionLabel>Preview ({csvPreview.length} users)</SectionLabel>
          <div style={{ border: '1px solid var(--border)', maxHeight: 300, overflow: 'auto' }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
              <tbody>
                {csvPreview.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    <td>{row.name}</td>
                    <td><span className="mono" style={{ fontSize: 11 }}>{row.email}</span></td>
                    <td><span className={`tag ${row.role === 'teacher' ? 'tag-warn' : row.role === 'admin' ? 'tag-danger' : 'tag-success'}`}>{row.role}</span></td>
                  </tr>
                ))}
                {csvPreview.length > 50 && (
                  <tr><td colSpan={3} style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>...and {csvPreview.length - 50} more</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={importUsers} disabled={importing}>
              {importing ? <span className="spinner" /> : <><Icon name="check" size={11} /> Import {csvPreview.length} Users</>}
            </button>
            <button className="btn btn-sm" onClick={() => setCsvPreview([])}>Cancel</button>
          </div>
        </div>
      )}

      {/* Import Result */}
      {importResult && (
        <div className="card fade-up-3" style={{ marginBottom: 20 }}>
          <SectionLabel>Import Result</SectionLabel>
          <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
              <span style={{ color: 'var(--success)' }}>✓ {importResult.success}</span> imported
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
              <span style={{ color: 'var(--danger)' }}>✗ {importResult.failed}</span> failed
            </div>
          </div>
          {importResult.errors.length > 0 && (
            <div style={{ maxHeight: 200, overflow: 'auto', padding: 8, background: 'rgba(255,0,0,0.05)', border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 10 }}>
              {importResult.errors.map((e, i) => <div key={i} style={{ color: 'var(--danger)', marginBottom: 2 }}>{e}</div>)}
            </div>
          )}
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setImportResult(null)}>Dismiss</button>
        </div>
      )}
    </>
  )
}

interface TeacherBatchGradeProps {
  profile: Profile
  assignments: (Assignment & { submissions?: Submission[] })[]
  students: Profile[]
  onAssignmentsChange: (assignments: (Assignment & { submissions?: Submission[] })[]) => void
}

export function TeacherBatchGradeModule({ profile, assignments, students, onAssignmentsChange }: TeacherBatchGradeProps) {
  const [selectedAssignment, setSelectedAssignment] = useState<string>('')
  const [grades, setGrades] = useState<Record<string, { score: string; feedback: string }>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const assignment = assignments.find(a => a.id === selectedAssignment)
  const submissions = (assignment?.submissions || []) as Submission[]

  const initGrades = (subs: Submission[]) => {
    const map: typeof grades = {}
    subs.forEach(s => {
      map[s.id] = { score: String(s.score ?? ''), feedback: s.feedback || '' }
    })
    setGrades(map)
  }

  const saveAllGrades = async () => {
    if (!assignment) return
    const validCount = submissions.filter(sub => {
      const g = grades[sub.id]
      if (!g) return false
      const score = parseInt(g.score)
      return !isNaN(score)
    }).length
    if (!window.confirm(`Apply grades to ${validCount} submission(s) for "${assignment.title}"?`)) return
    setSaving(true)
    for (const sub of submissions) {
      const g = grades[sub.id]
      if (!g) continue
      const score = parseInt(g.score)
      if (isNaN(score)) continue
      await supabase.from('submissions').update({
        score,
        feedback: sanitizeText(g.feedback),
        grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
      }).eq('id', sub.id)
    }
    // Refresh
    const { data } = await supabase.from('assignments').select('*, submissions(*)').eq('teacher_id', profile.id).order('created_at', { ascending: false })
    if (data) onAssignmentsChange(data)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <>
      <PageHeader title="BULK GRADING" subtitle="Grade multiple submissions at once" />

      <div className="fade-up-1" style={{ marginBottom: 16 }}>
        <select className="input" style={{ maxWidth: 400 }} value={selectedAssignment} onChange={e => {
          setSelectedAssignment(e.target.value)
          const a = assignments.find(a => a.id === e.target.value)
          if (a?.submissions) initGrades(a.submissions as Submission[])
        }}>
          <option value="">Select assignment...</option>
          {assignments.map(a => (
            <option key={a.id} value={a.id}>{a.title} ({a.submissions?.length || 0} submissions)</option>
          ))}
        </select>
      </div>

      {assignment && submissions.length > 0 && (
        <div className="fade-up-2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
              {submissions.length} submissions · Max points: {assignment.max_points}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {saved && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)' }}>✓ Saved!</span>}
              <button className="btn btn-primary btn-sm" onClick={saveAllGrades} disabled={saving}>
                {saving ? <span className="spinner" /> : <><Icon name="check" size={11} /> Save All Grades</>}
              </button>
            </div>
          </div>
          <div style={{ border: '1px solid var(--border)', overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Student</th><th>Submitted</th><th>Score (/{assignment.max_points})</th><th>Feedback</th></tr></thead>
              <tbody>
                {submissions.map(sub => {
                  const student = students.find(s => s.id === sub.student_id)
                  return (
                    <tr key={sub.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{student?.avatar || '??'}</div>
                          {student?.name || sub.student_id}
                        </div>
                      </td>
                      <td><span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{sub.submitted_at?.slice(0, 10)}</span></td>
                      <td>
                        <input className="input" type="number" min={0} max={assignment.max_points}
                          value={grades[sub.id]?.score || ''} style={{ width: 80 }}
                          onChange={e => setGrades(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], score: e.target.value } }))}
                        />
                      </td>
                      <td>
                        <input className="input" placeholder="Feedback..."
                          value={grades[sub.id]?.feedback || ''} style={{ width: '100%' }}
                          onChange={e => setGrades(prev => ({ ...prev, [sub.id]: { ...prev[sub.id], feedback: e.target.value } }))}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {assignment && submissions.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No submissions yet for this assignment.</div>
      )}
    </>
  )
}
