'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, Institution, Classroom, ClassroomMember } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'

interface Props { profile: Profile; allUsers: Profile[] }

function generateCode(name: string) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) +
    Math.floor(100 + Math.random() * 900)
}

export function InstitutionModule({ profile, allUsers }: Props) {
  const { toast } = useToast()

  // Institutions
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Record<string, 'members' | 'classrooms'>>({})
  const [instModal, setInstModal] = useState<'create' | 'edit' | null>(null)
  const [instForm, setInstForm] = useState({ name: '', code: '', description: '' })
  const [editingInst, setEditingInst] = useState<Institution | null>(null)
  const [instBusy, setInstBusy] = useState(false)

  // Institution-level members (profiles.institution_id)
  const [instMembers, setInstMembers] = useState<Record<string, Profile[]>>({})
  const [instMemberSearch, setInstMemberSearch] = useState<Record<string, string>>({})
  const [instMemberBusy, setInstMemberBusy] = useState<Record<string, boolean>>({})

  // Classrooms per institution
  const [classrooms, setClassrooms] = useState<Record<string, Classroom[]>>({})
  const [classroomMembers, setClassroomMembers] = useState<Record<string, ClassroomMember[]>>({})
  const [expandedClass, setExpandedClass] = useState<string | null>(null)
  const [classModal, setClassModal] = useState<string | null>(null)
  const [classForm, setClassForm] = useState({ name: '', grade: '', section: '', academic_year: new Date().getFullYear().toString() })
  const [classBusy, setClassBusy] = useState(false)

  // Classroom member management
  const [memberSearch, setMemberSearch] = useState<Record<string, string>>({})
  const [memberRole, setMemberRole] = useState<Record<string, 'teacher' | 'student'>>({})
  const [memberBusy, setMemberBusy] = useState<Record<string, boolean>>({})

  const loadInstitutions = useCallback(async () => {
    const { data } = await supabase.from('institutions').select('*').order('created_at', { ascending: false })
    if (data) setInstitutions(data as Institution[])
  }, [])

  useEffect(() => { loadInstitutions() }, [loadInstitutions])

  const loadInstMembers = async (institutionId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('institution_id', institutionId).order('name')
    if (data) setInstMembers(prev => ({ ...prev, [institutionId]: data as Profile[] }))
  }

  const loadClassrooms = async (institutionId: string) => {
    const { data } = await supabase.from('classrooms').select('*').eq('institution_id', institutionId).order('name')
    if (data) setClassrooms(prev => ({ ...prev, [institutionId]: data as Classroom[] }))
  }

  const loadClassroomMembers = async (classroomId: string) => {
    const { data } = await supabase.from('classroom_members').select('*').eq('classroom_id', classroomId)
    if (data) setClassroomMembers(prev => ({ ...prev, [classroomId]: data as ClassroomMember[] }))
  }

  const toggleExpand = async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    const tab = activeTab[id] || 'members'
    if (tab === 'members' && !instMembers[id]) await loadInstMembers(id)
    if (tab === 'classrooms' && !classrooms[id]) await loadClassrooms(id)
  }

  const switchTab = async (instId: string, tab: 'members' | 'classrooms') => {
    setActiveTab(prev => ({ ...prev, [instId]: tab }))
    if (tab === 'members' && !instMembers[instId]) await loadInstMembers(instId)
    if (tab === 'classrooms' && !classrooms[instId]) await loadClassrooms(instId)
  }

  const toggleExpandClass = async (id: string) => {
    if (expandedClass === id) { setExpandedClass(null); return }
    setExpandedClass(id)
    if (!classroomMembers[id]) await loadClassroomMembers(id)
  }

  // ── Institution CRUD ──────────────────────────────────────────
  const openCreateInst = () => {
    setEditingInst(null)
    setInstForm({ name: '', code: '', description: '' })
    setInstModal('create')
  }

  const openEditInst = (inst: Institution) => {
    setEditingInst(inst)
    setInstForm({ name: inst.name, code: inst.code, description: inst.description || '' })
    setInstModal('edit')
  }

  const saveInstitution = async () => {
    if (!instForm.name.trim()) { toast('Name is required', 'error'); return }
    const code = instForm.code.trim() || generateCode(instForm.name)
    setInstBusy(true)
    try {
      if (editingInst) {
        const { data, error } = await supabase.from('institutions')
          .update({ name: instForm.name.trim(), code, description: instForm.description.trim() || null })
          .eq('id', editingInst.id).select().single()
        if (error) throw error
        setInstitutions(prev => prev.map(i => i.id === editingInst.id ? data as Institution : i))
        toast('Institution updated', 'success')
      } else {
        const { data, error } = await supabase.from('institutions').insert({
          name: instForm.name.trim(), code, description: instForm.description.trim() || null,
          active: true, created_by: profile.id,
        }).select().single()
        if (error) throw error
        setInstitutions(prev => [data as Institution, ...prev])
        toast('Institution created', 'success')
      }
      setInstModal(null)
    } catch (err: any) {
      toast(err?.message || 'Failed to save institution', 'error')
    }
    setInstBusy(false)
  }

  const toggleActive = async (inst: Institution) => {
    const { data, error } = await supabase.from('institutions')
      .update({ active: !inst.active }).eq('id', inst.id).select().single()
    if (error) { toast(error.message, 'error'); return }
    setInstitutions(prev => prev.map(i => i.id === inst.id ? data as Institution : i))
  }

  const deleteInstitution = async (id: string) => {
    if (!confirm('Delete this institution and all its classrooms? This cannot be undone.')) return
    const { error } = await supabase.from('institutions').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setInstitutions(prev => prev.filter(i => i.id !== id))
    if (expanded === id) setExpanded(null)
    toast('Institution deleted', 'success')
  }

  // ── Institution-level member management ───────────────────────
  const addInstMember = async (institutionId: string) => {
    const query = (instMemberSearch[institutionId] || '').trim().toLowerCase()
    if (!query) { toast('Enter a name, email or QGX ID', 'error'); return }

    const match = allUsers.find(u =>
      u.name.toLowerCase().includes(query) ||
      u.qgx_id?.toLowerCase() === query ||
      u.email.toLowerCase() === query
    )
    if (!match) { toast('User not found', 'error'); return }

    const already = (instMembers[institutionId] || []).find(m => m.id === match.id)
    if (already) { toast(`${match.name} is already in this institution`, 'error'); return }

    setInstMemberBusy(prev => ({ ...prev, [institutionId]: true }))
    try {
      const { error } = await supabase.from('profiles')
        .update({ institution_id: institutionId })
        .eq('id', match.id)
      if (error) throw error
      setInstMembers(prev => ({ ...prev, [institutionId]: [...(prev[institutionId] || []), { ...match, institution_id: institutionId }] }))
      setInstMemberSearch(prev => ({ ...prev, [institutionId]: '' }))
      toast(`${match.name} added to institution`, 'success')
    } catch (err: any) {
      toast(err?.message || 'Failed to add member', 'error')
    }
    setInstMemberBusy(prev => ({ ...prev, [institutionId]: false }))
  }

  const removeInstMember = async (institutionId: string, userId: string, name: string) => {
    if (!confirm(`Remove ${name} from this institution? This will also unlink them from any classrooms here.`)) return
    // Clear institution_id on profile
    const { error } = await supabase.from('profiles').update({ institution_id: null }).eq('id', userId)
    if (error) { toast(error.message, 'error'); return }
    // Also remove from all classrooms in this institution
    const instClassrooms = classrooms[institutionId] || []
    if (instClassrooms.length > 0) {
      await supabase.from('classroom_members')
        .delete()
        .eq('user_id', userId)
        .in('classroom_id', instClassrooms.map(c => c.id))
    }
    setInstMembers(prev => ({ ...prev, [institutionId]: (prev[institutionId] || []).filter(m => m.id !== userId) }))
    toast(`${name} removed from institution`, 'success')
  }

  // ── Classroom CRUD ────────────────────────────────────────────
  const saveClassroom = async () => {
    if (!classModal || !classForm.name.trim()) { toast('Classroom name is required', 'error'); return }
    setClassBusy(true)
    try {
      const { data, error } = await supabase.from('classrooms').insert({
        institution_id: classModal,
        name: classForm.name.trim(),
        grade: classForm.grade.trim() || null,
        section: classForm.section.trim() || null,
        academic_year: classForm.academic_year || new Date().getFullYear().toString(),
        created_by: profile.id,
      }).select().single()
      if (error) throw error
      setClassrooms(prev => ({ ...prev, [classModal]: [...(prev[classModal] || []), data as Classroom] }))
      setClassModal(null)
      setClassForm({ name: '', grade: '', section: '', academic_year: new Date().getFullYear().toString() })
      toast('Classroom created', 'success')
    } catch (err: any) {
      toast(err?.message || 'Failed to create classroom', 'error')
    }
    setClassBusy(false)
  }

  const deleteClassroom = async (classroomId: string, institutionId: string) => {
    if (!confirm('Delete this classroom and remove all members?')) return
    const { error } = await supabase.from('classrooms').delete().eq('id', classroomId)
    if (error) { toast(error.message, 'error'); return }
    setClassrooms(prev => ({ ...prev, [institutionId]: (prev[institutionId] || []).filter(c => c.id !== classroomId) }))
    if (expandedClass === classroomId) setExpandedClass(null)
    toast('Classroom deleted', 'success')
  }

  // ── Classroom member management ───────────────────────────────
  const addMember = async (classroomId: string, institutionId: string) => {
    const query = (memberSearch[classroomId] || '').trim().toLowerCase()
    const role = memberRole[classroomId] || 'student'
    if (!query) { toast('Enter a name or QGX ID', 'error'); return }

    const match = allUsers.find(u =>
      u.name.toLowerCase().includes(query) ||
      u.qgx_id?.toLowerCase() === query ||
      u.email.toLowerCase() === query
    )
    if (!match) { toast('User not found', 'error'); return }

    const existing = (classroomMembers[classroomId] || []).find(m => m.user_id === match.id)
    if (existing) { toast('User already in this classroom', 'error'); return }

    setMemberBusy(prev => ({ ...prev, [classroomId]: true }))
    try {
      const { data, error } = await supabase.from('classroom_members').insert({
        classroom_id: classroomId, user_id: match.id, role,
      }).select().single()
      if (error) throw error

      // Auto-link user to institution if not already linked
      if (!match.institution_id) {
        await supabase.from('profiles').update({ institution_id: institutionId }).eq('id', match.id)
        setInstMembers(prev => ({
          ...prev,
          [institutionId]: [...(prev[institutionId] || []), { ...match, institution_id: institutionId }],
        }))
      }

      setClassroomMembers(prev => ({ ...prev, [classroomId]: [...(prev[classroomId] || []), data as ClassroomMember] }))
      setMemberSearch(prev => ({ ...prev, [classroomId]: '' }))
      toast(`${match.name} added as ${role}`, 'success')
    } catch (err: any) {
      toast(err?.message || 'Failed to add member', 'error')
    }
    setMemberBusy(prev => ({ ...prev, [classroomId]: false }))
  }

  const removeMember = async (classroomId: string, memberId: string, userId: string) => {
    const { error } = await supabase.from('classroom_members').delete().eq('id', memberId)
    if (error) { toast(error.message, 'error'); return }
    setClassroomMembers(prev => ({ ...prev, [classroomId]: (prev[classroomId] || []).filter(m => m.id !== memberId) }))
  }

  const getMemberProfile = (userId: string) => allUsers.find(u => u.id === userId)

  return (
    <>
      <PageHeader title="INSTITUTIONS" subtitle="Manage institutions, classrooms and members" />

      <div className="fade-up-1" style={{ marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={openCreateInst}>
          <Icon name="plus" size={12} /> New Institution
        </button>
      </div>

      {institutions.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', padding: 40, textAlign: 'center' }}>
          No institutions yet. Create the first one above.
        </div>
      )}

      {institutions.map(inst => {
        const tab = activeTab[inst.id] || 'members'
        const members = instMembers[inst.id] || []
        const cls = classrooms[inst.id] || []

        return (
          <div key={inst.id} className="card fade-up" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            {/* Institution header */}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
              onClick={() => toggleExpand(inst.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{inst.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--border)', padding: '2px 6px' }}>{inst.code}</span>
                  <span className={`tag ${inst.active ? 'tag-success' : 'tag-warn'}`}>{inst.active ? 'Active' : 'Inactive'}</span>
                </div>
                {inst.description && <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 2 }}>{inst.description}</div>}
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>
                  {members.length} member{members.length !== 1 ? 's' : ''} · {cls.length} classroom{cls.length !== 1 ? 's' : ''} · Created {new Date(inst.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm" onClick={() => toggleActive(inst)}>{inst.active ? 'Deactivate' : 'Activate'}</button>
                <button className="btn btn-sm" onClick={() => openEditInst(inst)}><Icon name="edit" size={11} /></button>
                <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteInstitution(inst.id)}><Icon name="trash" size={11} /></button>
                <button className="btn btn-sm">{expanded === inst.id ? '▲' : '▼'}</button>
              </div>
            </div>

            {expanded === inst.id && (
              <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                {/* Tab switcher */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 18px' }}>
                  {(['members', 'classrooms'] as const).map(t => (
                    <button key={t} className="btn btn-sm"
                      onClick={() => switchTab(inst.id, t)}
                      style={{
                        borderRadius: 0, border: 'none', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                        color: tab === t ? 'var(--accent)' : 'var(--fg-dim)', padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: 11, textTransform: 'uppercase',
                      }}>
                      {t === 'members' ? `Members (${members.length})` : `Classrooms (${cls.length})`}
                    </button>
                  ))}
                </div>

                {/* Members tab */}
                {tab === 'members' && (
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      <input className="input" placeholder="Search by name, email or QGX ID..."
                        value={instMemberSearch[inst.id] || ''}
                        onChange={e => setInstMemberSearch(prev => ({ ...prev, [inst.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addInstMember(inst.id) }}
                        style={{ flex: 1 }} />
                      <button className="btn btn-primary btn-sm" disabled={instMemberBusy[inst.id]} onClick={() => addInstMember(inst.id)}>
                        <Icon name="plus" size={12} /> Add
                      </button>
                    </div>

                    {members.length === 0 && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', padding: '8px 0' }}>
                        No members yet. Add users above or assign them to a classroom.
                      </div>
                    )}

                    {/* Group by role */}
                    {(['admin', 'teacher', 'student', 'parent'] as const).map(role => {
                      const group = members.filter(m => m.role === role)
                      if (!group.length) return null
                      return (
                        <div key={role} style={{ marginBottom: 14 }}>
                          <SectionLabel>{role.charAt(0).toUpperCase() + role.slice(1)}s ({group.length})</SectionLabel>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {group.map(m => (
                              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#000', flexShrink: 0 }}>
                                    {m.avatar || m.name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{m.qgx_id} · {m.email}</div>
                                  </div>
                                </div>
                                <button className="btn btn-sm" style={{ color: 'var(--danger)' }}
                                  onClick={() => removeInstMember(inst.id, m.id, m.name)}>
                                  <Icon name="trash" size={11} /> Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Classrooms tab */}
                {tab === 'classrooms' && (
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                      <button className="btn btn-sm btn-primary"
                        onClick={() => { setClassModal(inst.id); setClassForm({ name: '', grade: '', section: '', academic_year: new Date().getFullYear().toString() }) }}>
                        <Icon name="plus" size={11} /> Add Classroom
                      </button>
                    </div>

                    {cls.length === 0 && (
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', padding: '8px 0' }}>No classrooms yet.</div>
                    )}

                    {cls.map(c => (
                      <div key={c.id} style={{ marginBottom: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                          onClick={() => toggleExpandClass(c.id)}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</span>
                            {c.grade && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>Grade {c.grade}{c.section ? ` · ${c.section}` : ''}</span>}
                            {c.academic_year && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>AY {c.academic_year}</span>}
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>
                              {(classroomMembers[c.id] || []).length} member{(classroomMembers[c.id] || []).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                            <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteClassroom(c.id, inst.id)}><Icon name="trash" size={11} /></button>
                            <button className="btn btn-sm">{expandedClass === c.id ? '▲' : '▼'}</button>
                          </div>
                        </div>

                        {expandedClass === c.id && (
                          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px', background: 'rgba(0,0,0,0.15)' }}>
                            {/* Add member to classroom */}
                            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                              <input className="input" placeholder="Name, email or QGX ID..."
                                value={memberSearch[c.id] || ''}
                                onChange={e => setMemberSearch(prev => ({ ...prev, [c.id]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') addMember(c.id, inst.id) }}
                                style={{ flex: 1, minWidth: 180 }} />
                              <select className="input" style={{ width: 100 }}
                                value={memberRole[c.id] || 'student'}
                                onChange={e => setMemberRole(prev => ({ ...prev, [c.id]: e.target.value as 'teacher' | 'student' }))}>
                                <option value="student">Student</option>
                                <option value="teacher">Teacher</option>
                              </select>
                              <button className="btn btn-primary btn-sm" disabled={memberBusy[c.id]} onClick={() => addMember(c.id, inst.id)}>Add</button>
                            </div>

                            {(classroomMembers[c.id] || []).length === 0 && (
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>No members yet.</div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {(classroomMembers[c.id] || []).map(m => {
                                const p = getMemberProfile(m.user_id)
                                return (
                                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                    <div>
                                      <span style={{ fontSize: 13 }}>{p?.name || m.user_id}</span>
                                      <span className={`tag ${m.role === 'teacher' ? 'tag-warn' : 'tag-success'}`} style={{ marginLeft: 8 }}>{m.role}</span>
                                      {p?.qgx_id && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>{p.qgx_id}</span>}
                                    </div>
                                    <button className="btn btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeMember(c.id, m.id, m.user_id)}>
                                      <Icon name="trash" size={11} />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Institution Modal */}
      <Modal open={!!instModal} onClose={() => setInstModal(null)} title={editingInst ? 'Edit Institution' : 'New Institution'}>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Name *</label>
          <input className="input" value={instForm.name} onChange={e => setInstForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Greenwood Academy" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Join Code</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" value={instForm.code}
              onChange={e => setInstForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
              placeholder="Auto-generated if blank" style={{ flex: 1 }} maxLength={12} />
            <button className="btn btn-sm" onClick={() => setInstForm(f => ({ ...f, code: generateCode(f.name || 'INST') }))}>Generate</button>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>Students enter this code on the register page to join.</div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="label">Description (optional)</label>
          <textarea className="input" rows={2} value={instForm.description} onChange={e => setInstForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="modal-form-actions">
          <button className="btn btn-primary" onClick={saveInstitution} disabled={instBusy}>{instBusy ? <span className="spinner" /> : (editingInst ? 'Save' : 'Create')}</button>
          <button className="btn" onClick={() => setInstModal(null)}>Cancel</button>
        </div>
      </Modal>

      {/* Classroom Modal */}
      <Modal open={!!classModal} onClose={() => setClassModal(null)} title="New Classroom">
        <div style={{ marginBottom: 14 }}>
          <label className="label">Classroom Name *</label>
          <input className="input" value={classForm.name} onChange={e => setClassForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Grade 10 - Section A" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Grade</label>
            <input className="input" value={classForm.grade} onChange={e => setClassForm(f => ({ ...f, grade: e.target.value }))} placeholder="10" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Section</label>
            <input className="input" value={classForm.section} onChange={e => setClassForm(f => ({ ...f, section: e.target.value }))} placeholder="A" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="label">Academic Year</label>
            <input className="input" value={classForm.academic_year} onChange={e => setClassForm(f => ({ ...f, academic_year: e.target.value }))} placeholder="2025" />
          </div>
        </div>
        <div className="modal-form-actions">
          <button className="btn btn-primary" onClick={saveClassroom} disabled={classBusy}>{classBusy ? <span className="spinner" /> : 'Create'}</button>
          <button className="btn" onClick={() => setClassModal(null)}>Cancel</button>
        </div>
      </Modal>
    </>
  )
}
