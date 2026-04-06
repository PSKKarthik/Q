'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, Assignment, Submission } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  profile: Profile
  assignments: (Assignment & { submissions?: Submission[] })[]
}

interface SimilarityResult {
  studentA: string
  studentB: string
  studentAId: string
  studentBId: string
  submissionA: string
  submissionB: string
  submissionAId: string
  submissionBId: string
  similarity: number
  sharedPhrases: string[]
}

interface PlagiarismFlag {
  id: string
  assignment_id: string
  submission_a_id: string
  submission_b_id: string
  similarity: number
  status: 'open' | 'reviewed' | 'dismissed'
}

function tokenize(text: string): string[] {
  if (!text) return []
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
}

function getNGrams(tokens: string[], n: number): Set<string> {
  const grams = new Set<string>()
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.add(tokens.slice(i, i + n).join(' '))
  }
  return grams
}

function computeSimilarity(textA: string, textB: string): { similarity: number; sharedPhrases: string[] } {
  const tokensA = tokenize(textA)
  const tokensB = tokenize(textB)
  if (tokensA.length < 5 || tokensB.length < 5) return { similarity: 0, sharedPhrases: [] }

  const ngramsA = getNGrams(tokensA, 4)
  const ngramsB = getNGrams(tokensB, 4)

  const shared: string[] = []
  ngramsA.forEach(g => { if (ngramsB.has(g)) shared.push(g) })

  const similarity = shared.length / Math.max(1, Math.min(ngramsA.size, ngramsB.size)) * 100
  return { similarity: Math.round(similarity), sharedPhrases: shared.slice(0, 5) }
}

export function PlagiarismModule({ profile, assignments }: Props) {
  const { toast } = useToast()
  const [selectedAssignment, setSelectedAssignment] = useState<string>('')
  const [results, setResults] = useState<SimilarityResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [students, setStudents] = useState<Record<string, string>>({})
  const [threshold, setThreshold] = useState(30)
  const [flags, setFlags] = useState<PlagiarismFlag[]>([])

  useEffect(() => {
    supabase.from('profiles').select('id, name').eq('role', 'student').then(({ data, error }) => {
      if (error) { toast('Failed to load student profiles', 'error'); return }
      if (data) {
        const map: Record<string, string> = {}
        data.forEach((s: any) => { map[s.id] = s.name })
        setStudents(map)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadFlags = async (assignmentId: string) => {
    const { data } = await supabase
      .from('plagiarism_flags')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: false })
    if (data) setFlags(data as PlagiarismFlag[])
  }

  const runScan = async () => {
    if (!selectedAssignment) return
    setScanning(true)
    setResults([])

    const assignment = assignments.find(a => a.id === selectedAssignment)
    let subs = assignment?.submissions?.filter(s => s.text_response && s.text_response.trim().length > 20) || []
    if (subs.length > 100) {
      toast('Large set — limiting scan to first 100 submissions', 'error')
      subs = subs.slice(0, 100)
    }

    const pairs: SimilarityResult[] = []
    for (let i = 0; i < subs.length; i++) {
      for (let j = i + 1; j < subs.length; j++) {
        const { similarity, sharedPhrases } = computeSimilarity(subs[i].text_response || '', subs[j].text_response || '')
        if (similarity >= threshold) {
          pairs.push({
            studentA: students[subs[i].student_id] || subs[i].student_id,
            studentB: students[subs[j].student_id] || subs[j].student_id,
            studentAId: subs[i].student_id,
            studentBId: subs[j].student_id,
            submissionA: (subs[i].text_response || '').slice(0, 100),
            submissionB: (subs[j].text_response || '').slice(0, 100),
            submissionAId: subs[i].id,
            submissionBId: subs[j].id,
            similarity,
            sharedPhrases,
          })
        }
      }
    }

    pairs.sort((a, b) => b.similarity - a.similarity)
    setResults(pairs)
    await loadFlags(selectedAssignment)
    setScanning(false)
  }

  const saveFlag = async (r: SimilarityResult) => {
    if (!selectedAssignment) return
    const { error } = await supabase.from('plagiarism_flags').insert({
      assignment_id: selectedAssignment,
      teacher_id: profile.id,
      student_a_id: r.studentAId,
      student_b_id: r.studentBId,
      submission_a_id: r.submissionAId,
      submission_b_id: r.submissionBId,
      similarity: r.similarity,
      status: 'open',
      shared_phrases: r.sharedPhrases,
    })
    if (error) {
      toast(error.message || 'Failed to flag case', 'error')
      return
    }
    toast('Case flagged for review', 'success')
    await loadFlags(selectedAssignment)
  }

  const updateFlagStatus = async (id: string, status: 'reviewed' | 'dismissed') => {
    const { error } = await supabase.from('plagiarism_flags').update({ status }).eq('id', id)
    if (error) { toast(error.message || 'Failed to update flag', 'error'); return }
    setFlags(prev => prev.map(f => f.id === id ? { ...f, status } : f))
  }

  const getFlag = (r: SimilarityResult) => flags.find(f =>
    f.assignment_id === selectedAssignment &&
    ((f.submission_a_id === r.submissionAId && f.submission_b_id === r.submissionBId) ||
     (f.submission_a_id === r.submissionBId && f.submission_b_id === r.submissionAId))
  )

  const assignmentsWithSubs = assignments.filter(a => (a.submissions?.length || 0) >= 2)

  return (
    <>
      <PageHeader title="PLAGIARISM CHECK" subtitle="Compare student submissions for similarity" />

      <div className="card fade-up-1" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Assignment</label>
            <select className="input" value={selectedAssignment} onChange={e => setSelectedAssignment(e.target.value)}>
              <option value="">Select assignment...</option>
              {assignmentsWithSubs.map(a => (
                <option key={a.id} value={a.id}>{a.title} ({a.submissions?.length || 0} submissions)</option>
              ))}
            </select>
          </div>
          <div style={{ width: 120 }}>
            <label className="label">Threshold %</label>
            <input className="input" type="number" min={10} max={90} value={threshold} onChange={e => setThreshold(Number(e.target.value))} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={runScan} disabled={!selectedAssignment || scanning}>
            {scanning ? 'Scanning...' : '◎ Scan'}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <>
          <SectionLabel>Results — {results.length} match{results.length !== 1 ? 'es' : ''} above {threshold}%</SectionLabel>
          <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map((r, i) => (
              <div key={i} className="card" style={{ padding: 16, borderLeft: `3px solid ${r.similarity >= 70 ? 'var(--danger)' : r.similarity >= 50 ? 'var(--warn)' : 'var(--accent)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {r.studentA} ↔ {r.studentB}
                  </div>
                  <div style={{
                    fontFamily: 'var(--display)', fontSize: 20,
                    color: r.similarity >= 70 ? 'var(--danger)' : r.similarity >= 50 ? 'var(--warn)' : 'var(--accent)',
                  }}>
                    {r.similarity}%
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', padding: 8, background: 'var(--bg)', borderRadius: 0 }}>
                    {r.submissionA}...
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', padding: 8, background: 'var(--bg)', borderRadius: 0 }}>
                    {r.submissionB}...
                  </div>
                </div>
                {r.sharedPhrases.length > 0 && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>
                    <span style={{ color: 'var(--fg-dim)' }}>Shared phrases: </span>
                    {r.sharedPhrases.map((p, j) => (
                      <span key={j} style={{ background: 'var(--warn)', color: '#000', padding: '1px 4px', borderRadius: 0, marginRight: 4, fontSize: 9 }}>{p}</span>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(() => {
                    const existing = getFlag(r)
                    if (!existing) {
                      return <button className="btn btn-xs" onClick={() => saveFlag(r)}>Flag Case</button>
                    }
                    return (
                      <>
                        <span className="tag">{existing.status.toUpperCase()}</span>
                        <button className="btn btn-xs" onClick={() => updateFlagStatus(existing.id, 'reviewed')}>Mark Reviewed</button>
                        <button className="btn btn-xs" onClick={() => updateFlagStatus(existing.id, 'dismissed')}>Dismiss</button>
                      </>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!scanning && results.length === 0 && selectedAssignment && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', textAlign: 'center', marginTop: 40 }}>
          <Icon name="search" size={32} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No matches found above {threshold}% threshold. Click Scan to check.</span>
        </div>
      )}
    </>
  )
}
