'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, Classroom, ClassroomMember, Institution } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatGrid } from '@/components/ui/StatGrid'
import { Icon } from '@/components/ui/Icon'

interface Props { profile: Profile }

export function ClassroomModule({ profile }: Props) {
  const { toast } = useToast()
  const [classrooms, setClassrooms] = useState<(Classroom & { institution_name?: string })[]>([])
  const [members, setMembers] = useState<Record<string, (ClassroomMember & { profile?: Profile })[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [allStudents, setAllStudents] = useState<Profile[]>([])
  const [search, setSearch] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Get classrooms this teacher belongs to
    const { data: memberRows } = await supabase
      .from('classroom_members')
      .select('classroom_id')
      .eq('user_id', profile.id)
      .eq('role', 'teacher')

    if (!memberRows?.length) { setLoading(false); return }

    const ids = memberRows.map((r: any) => r.classroom_id)
    const { data: cls } = await supabase
      .from('classrooms')
      .select('*, institutions(name)')
      .in('id', ids)
      .order('name')

    if (cls) {
      setClassrooms(cls.map((c: any) => ({ ...c, institution_name: c.institutions?.name })))
    }

    // Load all students for search
    const { data: students } = await supabase.from('profiles').select('*').eq('role', 'student')
    if (students) setAllStudents(students as Profile[])
    setLoading(false)
  }, [profile.id])

  useEffect(() => { load() }, [load])

  const loadMembers = async (classroomId: string) => {
    const { data } = await supabase
      .from('classroom_members')
      .select('*')
      .eq('classroom_id', classroomId)
    if (!data) return

    // Enrich with profiles
    const userIds = data.map((m: any) => m.user_id)
    const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]))
    setMembers(prev => ({ ...prev, [classroomId]: data.map((m: any) => ({ ...m, profile: profileMap[m.user_id] })) }))
  }

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!members[id]) await loadMembers(id)
  }

  const addStudent = async (classroomId: string) => {
    const query = (search[classroomId] || '').trim().toLowerCase()
    if (!query) { toast('Enter a name, email or QGX ID', 'error'); return }

    const match = allStudents.find(s =>
      s.name.toLowerCase().includes(query) ||
      s.email.toLowerCase() === query ||
      s.qgx_id?.toLowerCase() === query
    )
    if (!match) { toast('Student not found', 'error'); return }

    const existing = (members[classroomId] || []).find(m => m.user_id === match.id)
    if (existing) { toast('Student already in this classroom', 'error'); return }

    setBusy(prev => ({ ...prev, [classroomId]: true }))
    try {
      const { data, error } = await supabase.from('classroom_members').insert({
        classroom_id: classroomId, user_id: match.id, role: 'student',
      }).select().single()
      if (error) throw error
      setMembers(prev => ({ ...prev, [classroomId]: [...(prev[classroomId] || []), { ...data as ClassroomMember, profile: match }] }))
      setSearch(prev => ({ ...prev, [classroomId]: '' }))
      toast(`${match.name} added`, 'success')
    } catch (err: any) {
      toast(err?.message || 'Failed to add student', 'error')
    }
    setBusy(prev => ({ ...prev, [classroomId]: false }))
  }

  const removeStudent = async (classroomId: string, memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from this classroom?`)) return
    const { error } = await supabase.from('classroom_members').delete().eq('id', memberId)
    if (error) { toast(error.message, 'error'); return }
    setMembers(prev => ({ ...prev, [classroomId]: (prev[classroomId] || []).filter(m => m.id !== memberId) }))
  }

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginTop: 40 }}>Loading classrooms...</div>

  const totalStudents = Object.values(members).flat().filter(m => m.role === 'student').length

  return (
    <>
      <PageHeader title="MY CLASSROOMS" subtitle="Manage students in your assigned classrooms" />

      <StatGrid items={[
        { label: 'Classrooms', value: classrooms.length },
        { label: 'Students Loaded', value: totalStudents },
      ]} columns={2} />

      {classrooms.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', padding: 40, textAlign: 'center' }}>
          You have not been assigned to any classrooms yet. Ask your admin to add you.
        </div>
      )}

      {classrooms.map(cls => {
        const cls_members = members[cls.id] || []
        const teachers = cls_members.filter(m => m.role === 'teacher')
        const students = cls_members.filter(m => m.role === 'student')

        return (
          <div key={cls.id} className="card fade-up" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
              onClick={() => toggleExpand(cls.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{cls.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 2 }}>
                  {cls.institution_name && <span>{cls.institution_name} · </span>}
                  {cls.grade && <span>Grade {cls.grade}{cls.section ? ` ${cls.section}` : ''} · </span>}
                  {cls.academic_year && <span>AY {cls.academic_year} · </span>}
                  {expanded === cls.id
                    ? `${students.length} students · ${teachers.length} teachers`
                    : 'Click to manage'}
                </div>
              </div>
              <button className="btn btn-sm">{expanded === cls.id ? '▲' : '▼'}</button>
            </div>

            {expanded === cls.id && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', background: 'rgba(0,0,0,0.15)' }}>
                {/* Add student */}
                <SectionLabel>Add Student</SectionLabel>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input className="input" placeholder="Name, email or QGX ID..."
                    value={search[cls.id] || ''}
                    onChange={e => setSearch(prev => ({ ...prev, [cls.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addStudent(cls.id) }}
                    style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" disabled={busy[cls.id]} onClick={() => addStudent(cls.id)}>Add</button>
                </div>

                {/* Teachers */}
                {teachers.length > 0 && (
                  <>
                    <SectionLabel>Teachers ({teachers.length})</SectionLabel>
                    <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {teachers.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <span style={{ fontSize: 13 }}>{m.profile?.name || m.user_id}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>{m.profile?.qgx_id}</span>
                          </div>
                          <span className="tag tag-warn">Teacher</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Students */}
                <SectionLabel>Students ({students.length})</SectionLabel>
                {students.length === 0 && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>No students yet.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {students.map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <span style={{ fontSize: 13 }}>{m.profile?.name || m.user_id}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>{m.profile?.qgx_id}</span>
                        {m.profile?.grade && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>Grade {m.profile.grade}</span>}
                      </div>
                      <button className="btn btn-sm" style={{ color: 'var(--danger)' }}
                        onClick={() => removeStudent(cls.id, m.id, m.profile?.name || 'student')}>
                        <Icon name="trash" size={11} /> Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
