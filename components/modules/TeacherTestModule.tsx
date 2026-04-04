'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { pushNotificationBatch, logActivity } from '@/lib/actions'
import { DEFAULT_ANTICHEAT } from '@/lib/constants'
import type { Profile, Test, Question, Attempt } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface TeacherTestModuleProps {
  profile: Profile
  tests: Test[]
  students: Profile[]
  allAttempts: Attempt[]
  onTestsChange: (tests: Test[]) => void
}

const qTypeLabel: Record<string, string> = { mcq:'Single Choice', msq:'Multi Select', tf:'True / False', fib:'Fill in Blank', match:'Match' }

export function TeacherTestModule({ profile, tests, students, allAttempts, onTestsChange }: TeacherTestModuleProps) {
  const { toast } = useToast()
  const [view, setView] = useState<'list' | 'bank' | 'analytics'>('list')
  const [subTab, setSubTab] = useState<'tests' | 'quizzes'>('tests')
  const [searchQ, setSearchQ] = useState('')

  /* Modals */
  const [testModal, setTestModal] = useState(false)
  const [qManualModal, setQManualModal] = useState(false)
  const [aiModal, setAiModal] = useState(false)

  /* Question bank */
  const [questionBank, setQuestionBank] = useState<Test | null>(null)

  /* Test form */
  const [newTest, setNewTest] = useState({ title: '', subject: '', scheduledDate: '', scheduledTime: '', duration: 60, type: 'test' as 'test' | 'quiz', xpReward: 100 })
  const [antiCheat, setAntiCheat] = useState({ ...DEFAULT_ANTICHEAT })
  const [showAC, setShowAC] = useState(false)

  /* Question form */
  const [qType, setQType] = useState<'mcq' | 'msq' | 'tf' | 'fib' | 'match'>('mcq')
  const [qStep, setQStep] = useState(1)
  const [qForm, setQForm] = useState<{ text: string; options: string[]; answer: number | boolean | string; marks: number; pairs: { left: string; right: string }[]; msqAnswers?: number[] }>({ text: '', options: ['', '', '', ''], answer: 0, marks: 2, pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] })

  /* AI */
  const [aiTopic, setAiTopic] = useState('')
  const [aiType, setAiType] = useState('mcq')
  const [aiCount, setAiCount] = useState(5)
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const [aiBloom, setAiBloom] = useState<string>('understand')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<Question[] | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiEditIdx, setAiEditIdx] = useState<number | null>(null)
  const [bankEditIdx, setBankEditIdx] = useState<string | null>(null)
  const [aiFile, setAiFile] = useState<{ name: string; type: 'image' | 'pdf' | 'ppt'; data: string; mimeType: string } | null>(null)
  const aiFileRef = useRef<HTMLInputElement>(null)
  const [creating, setCreating] = useState(false)

  const myTests = tests.filter(t => t.type === 'test')
  const myQuizzes = tests.filter(t => t.type === 'quiz')
  const displayTests = (subTab === 'tests' ? myTests : myQuizzes).filter(t =>
    !searchQ || t.title.toLowerCase().includes(searchQ.toLowerCase()) || t.subject?.toLowerCase().includes(searchQ.toLowerCase())
  )

  /* ── CRUD ── */
  const openQuestionBank = async (test: Test) => {
    setQuestionBank({ ...test, questions: [] })
    try {
      const { data } = await supabase.from('tests').select('*, questions(*)').eq('id', test.id).single()
      if (data) {
        setQuestionBank(data as Test)
        onTestsChange(tests.map(t => t.id === data.id ? data as Test : t))
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load questions', 'error')
    }
    setView('bank')
  }

  const createTest = async () => {
    if (!newTest.title?.trim() || creating) return
    setCreating(true)
    try {
      const prefix = newTest.type === 'quiz' ? 'Q' : 'T'
      const id = `${prefix}-${crypto.randomUUID().slice(0, 8)}`
      const row = { id, title: newTest.title, subject: newTest.subject, teacher_id: profile.id, teacher_name: profile.name, scheduled_date: newTest.scheduledDate || null, scheduled_time: newTest.scheduledTime || null, duration: newTest.duration, status: 'scheduled', total_marks: 0, type: newTest.type, anti_cheat: antiCheat, xp_reward: newTest.xpReward }
      const { data } = await supabase.from('tests').insert(row).select().single()
      if (data) {
        onTestsChange([{ ...data, questions: [] }, ...tests])
        await pushNotificationBatch(students.map(s => s.id), `▫ New ${newTest.type}: "${newTest.title}" by ${profile.name}`, 'test_created')
        await logActivity(`Teacher ${profile.name} created ${newTest.type}: ${newTest.title}`, 'test_created')
      }
      setTestModal(false)
      setNewTest({ title: '', subject: '', scheduledDate: '', scheduledTime: '', duration: 60, type: 'test', xpReward: 100 })
      setAntiCheat({ ...DEFAULT_ANTICHEAT })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create test', 'error')
    } finally {
      setCreating(false)
    }
  }

  const deleteTest = async (id: string) => {
    if (!confirm('Delete this test and all its questions? This cannot be undone.')) return
    try {
      await supabase.from('tests').delete().eq('id', id).eq('teacher_id', profile.id)
      onTestsChange(tests.filter(t => t.id !== id))
      if (questionBank?.id === id) { setQuestionBank(null); setView('list') }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete test', 'error')
    }
  }

  const toggleTestStatus = async (t: Test) => {
    const next = t.status === 'locked' ? 'scheduled' : 'locked'
    try {
      const { error } = await supabase.from('tests').update({ status: next }).eq('id', t.id).eq('teacher_id', profile.id)
      if (error) throw error
      onTestsChange(tests.map(x => x.id === t.id ? { ...x, status: next } : x))
      toast(`Test ${next === 'locked' ? 'locked' : 'activated'}`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update status', 'error')
    }
  }

  const updateAiQuestion = (idx: number, field: string, value: any) => {
    if (!aiResult) return
    setAiResult(aiResult.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  const deleteAiQuestion = (idx: number) => {
    if (!aiResult) return
    setAiResult(aiResult.filter((_, i) => i !== idx))
    setAiEditIdx(null)
  }

  const saveManualQuestion = async () => {
    if (!questionBank) return
    if (!qForm.text?.trim()) { toast('Question text is required', 'error'); return }
    if (qForm.marks < 0) { toast('Marks cannot be negative', 'error'); return }
    try {
      let answer: any = qForm.answer
      if (qType === 'match') answer = qForm.pairs
      if (qType === 'msq') answer = qForm.msqAnswers || []
      // Validate answer matches question type
      if (qType === 'mcq' && (typeof answer !== 'number' || answer < 0 || answer >= (qForm.options?.length || 4))) {
        toast('MCQ answer must be a valid option index', 'error'); return
      }
      if (qType === 'tf' && typeof answer !== 'boolean') {
        toast('True/False answer must be true or false', 'error'); return
      }
      if (qType === 'fib' && (typeof answer !== 'string' || !answer.toString().trim())) {
        toast('Fill-in-the-blank answer cannot be empty', 'error'); return
      }
      if (qType === 'msq' && (!Array.isArray(answer) || answer.length === 0)) {
        toast('Multi-select must have at least one correct answer', 'error'); return
      }
      if (qType === 'match' && (!Array.isArray(answer) || answer.some((p: any) => !p.left?.trim() || !p.right?.trim()))) {
        toast('All match pairs must have left and right values', 'error'); return
      }
      const q = { test_id: questionBank.id, type: qType, text: qForm.text, options: ['mcq', 'msq'].includes(qType) ? qForm.options : null, answer, marks: qForm.marks, order_index: (questionBank.questions?.length || 0) }
      const { data, error: insertErr } = await supabase.from('questions').insert(q).select().single()
      if (insertErr) { toast(insertErr.message || 'Failed to save question', 'error'); return }
      if (data) {
        const newMarks = (questionBank.questions?.reduce((s, x) => s + (x.marks || 1), 0) || 0) + qForm.marks
        await supabase.from('tests').update({ total_marks: newMarks }).eq('id', questionBank.id).eq('teacher_id', profile.id)
        const updatedQB = { ...questionBank, questions: [...(questionBank.questions || []), data as Question], total_marks: newMarks }
        setQuestionBank(updatedQB)
        onTestsChange(tests.map(t => t.id === questionBank.id ? updatedQB : t))
        toast('Question saved!', 'success')
      }
      // Only close + reset on success
      setQManualModal(false)
      setQForm({ text: '', options: ['', '', '', ''], answer: 0, marks: 2, pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] })
      setQStep(1)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save question', 'error')
    }
  }

  const updateBankQuestion = async (qId: string, field: string, value: any) => {
    if (!questionBank) return
    const qs = questionBank.questions || []
    const idx = qs.findIndex(q => q.id === qId)
    if (idx < 0) return
    const updated = { ...qs[idx], [field]: value }
    const updatedQs = [...qs]; updatedQs[idx] = updated
    const updatedQB = { ...questionBank, questions: updatedQs, total_marks: updatedQs.reduce((s, q) => s + (q.marks || 1), 0) }
    setQuestionBank(updatedQB)
    onTestsChange(tests.map(t => t.id === questionBank.id ? updatedQB : t))
  }

  const saveBankQuestion = async (qId: string) => {
    if (!questionBank) return
    const q = questionBank.questions?.find(x => x.id === qId)
    if (!q) return
    try {
      await supabase.from('questions').update({ text: q.text, options: q.options, answer: q.answer, marks: q.marks }).eq('id', qId).eq('test_id', questionBank.id)
      const totalMarks = questionBank.questions?.reduce((s, x) => s + (x.marks || 1), 0) || 0
      await supabase.from('tests').update({ total_marks: totalMarks }).eq('id', questionBank.id).eq('teacher_id', profile.id)
      toast('Question updated', 'success')
    } catch (err) { toast(err instanceof Error ? err.message : 'Failed to save', 'error') }
    setBankEditIdx(null)
  }

  const deleteQuestion = async (qId: string) => {
    if (!confirm('Delete this question?') || !questionBank) return
    try {
      await supabase.from('questions').delete().eq('id', qId).eq('test_id', questionBank.id)
      const updatedQB = { ...questionBank, questions: questionBank.questions?.filter(q => q.id !== qId) }
      setQuestionBank(updatedQB)
      onTestsChange(tests.map(t => t.id === questionBank.id ? updatedQB : t))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete question', 'error')
    }
  }

  const handleAiFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('File too large. Maximum 5MB.', 'error'); return }
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']
    if (!allowed.includes(file.type)) { toast('Use images, PDF, or PPT/PPTX.', 'error'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setAiFile({ name: file.name, type: file.type.startsWith('image/') ? 'image' : file.type.includes('pdf') ? 'pdf' : 'ppt', data: base64, mimeType: file.type })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const callGroqAI = async () => {
    if (!aiTopic && !aiFile) return
    setAiLoading(true); setAiResult(null); setAiError(null)
    try {
      const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: aiTopic, type: aiType, count: aiCount, difficulty: aiDifficulty, bloom: aiBloom, file: aiFile ? { name: aiFile.name, type: aiFile.type, data: aiFile.data, mimeType: aiFile.mimeType } : undefined }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `AI error: ${res.status}`)
      setAiResult(Array.isArray(data.questions) ? data.questions : [])
    } catch (e: any) { setAiError(`AI generation failed. (${e.message})`) }
    setAiLoading(false)
  }

  const injectAiQuestions = async () => {
    if (!questionBank || !aiResult) return
    try {
      const baseIndex = questionBank.questions?.length || 0
      const rows = aiResult.map((q, i) => ({ test_id: questionBank.id, type: q.type, text: q.text, options: q.options || null, answer: q.answer, marks: q.marks || 1, order_index: baseIndex + i }))
      const { error } = await supabase.from('questions').insert(rows)
      if (error) throw error
      setAiModal(false); setAiResult(null)
      const { data } = await supabase.from('tests').select('*, questions(*)').eq('id', questionBank.id).single()
      if (data) {
        setQuestionBank(data as Test)
        onTestsChange(tests.map(t => t.id === data.id ? data as Test : t))
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to inject AI questions', 'error')
    }
  }

  /* ── QBTest reference ── */
  const QBTest = questionBank ? tests.find(t => t.id === questionBank.id) || questionBank : null

  return (
    <div className="test-module">
      {/* ── Test Create Modal ── */}
      <Modal open={testModal} onClose={() => setTestModal(false)} title={newTest.type === 'quiz' ? 'Create Quiz' : 'Create Test'} width={580}>
        <div className="grid-2" style={{ marginBottom: 14 }}>
          <div><label className="label">Type</label>
            <select className="input" value={newTest.type} onChange={e => setNewTest(f => ({ ...f, type: e.target.value as any }))}>
              <option value="test">Test (Scheduled)</option>
              <option value="quiz">Quiz (Anytime)</option>
            </select>
          </div>
          <div><label className="label">Duration (min)</label>
            <input className="input" type="number" value={newTest.duration} onChange={e => setNewTest(f => ({ ...f, duration: +e.target.value }))} />
          </div>
          <div><label className="label">XP Reward</label>
            <input className="input" type="number" min={0} max={1000} value={newTest.xpReward} onChange={e => setNewTest(f => ({ ...f, xpReward: Math.min(1000, Math.max(0, +e.target.value)) }))} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Title</label>
          <input className="input" type="text" value={newTest.title} onChange={e => setNewTest(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Unit 1 Math Test" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Subject</label>
          <input className="input" type="text" value={newTest.subject} onChange={e => setNewTest(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Mathematics" />
        </div>
        <div className="grid-2" style={{ marginBottom: 14 }}>
          <div>
            <label className="label">Date{newTest.type === 'quiz' ? ' (optional)' : ''}</label>
            <input
              className="input" type="date"
              value={newTest.scheduledDate}
              onChange={e => setNewTest(f => ({ ...f, scheduledDate: e.target.value }))}
              style={{ colorScheme: 'dark' }}
            />
          </div>
          <div>
            <label className="label">Time{newTest.type === 'quiz' ? ' (optional)' : ''}</label>
            <input
              className="input" type="time"
              value={newTest.scheduledTime}
              onChange={e => setNewTest(f => ({ ...f, scheduledTime: e.target.value }))}
              style={{ colorScheme: 'dark' }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <button className="btn btn-sm" style={{ marginBottom: 10 }} onClick={() => setShowAC(s => !s)}>{showAC ? '▲' : '▼'} Anti-Cheat Settings</button>
          {showAC && (
            <div style={{ border: '1px solid var(--border)', padding: 16 }}>
              {[['tabSwitch', 'Tab Switch Detection'], ['copyPaste', 'Block Copy-Paste'], ['randomQ', 'Randomize Question Order'], ['randomOpts', 'Randomize Option Order'], ['fullscreen', 'Require Fullscreen']].map(([k, lbl]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 11, cursor: 'pointer', marginBottom: 8 }}>
                  <input type="checkbox" checked={(antiCheat as any)[k]} onChange={e => setAntiCheat(a => ({ ...a, [k]: e.target.checked }))} /> {lbl}
                </label>
              ))}
              <div className="grid-2" style={{ marginTop: 8 }}>
                <div><label className="label">Time Per Q (sec, 0=off)</label><input className="input" type="number" value={antiCheat.timePerQ} onChange={e => setAntiCheat(a => ({ ...a, timePerQ: +e.target.value }))} /></div>
                <div><label className="label">Max Attempts</label><input className="input" type="number" min={1} max={5} value={antiCheat.maxAttempts} onChange={e => setAntiCheat(a => ({ ...a, maxAttempts: +e.target.value }))} /></div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={createTest} disabled={creating || !newTest.title}>
            {creating ? <><span className="spinner" /> Creating...</> : 'Create & Add Questions'}
          </button>
          <button className="btn" onClick={() => setTestModal(false)}>Cancel</button>
        </div>
      </Modal>

      {/* ── Manual Question Modal ── */}
      <Modal open={qManualModal} onClose={() => { setQManualModal(false); setQStep(1) }} title="Add Question Manually" width={580}>
        {qStep === 1 && (
          <>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 16 }}>SELECT QUESTION TYPE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[['mcq', 'MCQ — Single Correct'], ['msq', 'MSQ — Multi Select'], ['tf', 'True / False'], ['fib', 'Fill in the Blank'], ['match', 'Match the Following']].map(([t, lbl]) => (
                <button key={t} className={`btn btn-sm ${qType === t ? 'btn-primary' : ''}`} onClick={() => { setQType(t as any); setQStep(2) }}>{lbl}</button>
              ))}
            </div>
          </>
        )}
        {qStep === 2 && (
          <>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 12 }}>{qType.toUpperCase()}</div>
            <div style={{ marginBottom: 14 }}>
              <label className="label">Question Text{qType === 'fib' ? ' (use ____ for blank)' : ''}</label>
              <textarea className="input" rows={3} value={qForm.text} onChange={e => setQForm((f: any) => ({ ...f, text: e.target.value }))} />
            </div>
            {(qType === 'mcq' || qType === 'msq') && qForm.options.map((opt: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {qType === 'mcq'
                  ? <input type="radio" name="mcq-ans" checked={qForm.answer === i} onChange={() => setQForm((f: any) => ({ ...f, answer: i }))} />
                  : <input type="checkbox" checked={(qForm.msqAnswers || []).includes(i)} onChange={e => setQForm((f: any) => ({ ...f, msqAnswers: e.target.checked ? [...(f.msqAnswers || []), i] : (f.msqAnswers || []).filter((x: number) => x !== i) }))} />
                }
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', width: 16 }}>{['A', 'B', 'C', 'D'][i]}</span>
                <input className="input" value={opt} onChange={e => setQForm((f: any) => ({ ...f, options: f.options.map((o: string, j: number) => j === i ? e.target.value : o) }))} style={{ flex: 1 }} placeholder={`Option ${['A', 'B', 'C', 'D'][i]}`} />
              </div>
            ))}
            {qType === 'tf' && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                {[true, false].map(v => (
                  <label key={String(v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 12, cursor: 'pointer' }}>
                    <input type="radio" checked={qForm.answer === v} onChange={() => setQForm((f: any) => ({ ...f, answer: v }))} /> {v ? 'TRUE' : 'FALSE'}
                  </label>
                ))}
              </div>
            )}
            {qType === 'fib' && (
              <div style={{ marginBottom: 14 }}>
                <label className="label">Correct Answer</label>
                <input className="input" value={String(qForm.answer || '')} onChange={e => setQForm((f: any) => ({ ...f, answer: e.target.value }))} />
              </div>
            )}
            {qType === 'match' && (
              <div style={{ marginBottom: 14 }}>
                <div className="grid-2" style={{ marginBottom: 6 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>COLUMN A</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>COLUMN B</div>
                </div>
                {qForm.pairs.map((p: any, i: number) => (
                  <div key={i} className="grid-2" style={{ gap: 8, marginBottom: 8 }}>
                    <input className="input" value={p.left} onChange={e => setQForm((f: any) => ({ ...f, pairs: f.pairs.map((x: any, j: number) => j === i ? { ...x, left: e.target.value } : x) }))} placeholder={`Left ${i + 1}`} />
                    <input className="input" value={p.right} onChange={e => setQForm((f: any) => ({ ...f, pairs: f.pairs.map((x: any, j: number) => j === i ? { ...x, right: e.target.value } : x) }))} placeholder={`Right ${i + 1}`} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <label className="label" style={{ marginBottom: 0 }}>Marks</label>
              <input className="input" type="number" min={1} max={10} value={qForm.marks} onChange={e => setQForm((f: any) => ({ ...f, marks: +e.target.value }))} style={{ width: 80 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={saveManualQuestion}>Save Question</button>
              <button className="btn" onClick={() => setQStep(1)}>← Back</button>
              <button className="btn" onClick={() => { setQManualModal(false); setQStep(1) }}>Cancel</button>
            </div>
          </>
        )}
      </Modal>

      {/* ── AI Modal ── */}
      <Modal open={aiModal} onClose={() => setAiModal(false)} title="" width={600}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="ai" size={18} />
            <div className="modal-title" style={{ marginBottom: 0 }}>AI Question Generator</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--success)', border: '1px solid var(--success)', padding: '2px 6px' }}>GROQ</span>
          </div>
        </div>
        <div className="grid-2" style={{ marginBottom: 14 }}>
          <div><label className="label">Type</label>
            <select className="input" value={aiType} onChange={e => setAiType(e.target.value)}>
              <option value="mcq">MCQ</option><option value="tf">True/False</option><option value="fib">Fill in Blank</option>
            </select>
          </div>
          <div><label className="label">Count</label>
            <input className="input" type="number" min={1} max={20} value={aiCount} onChange={e => setAiCount(+e.target.value)} />
          </div>
        </div>
        <div className="grid-2" style={{ marginBottom: 14 }}>
          <div><label className="label">Difficulty</label>
            <select className="input" value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value as any)}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </div>
          <div><label className="label">Bloom&apos;s Level</label>
            <select className="input" value={aiBloom} onChange={e => setAiBloom(e.target.value)}>
              <option value="remember">Remember</option><option value="understand">Understand</option>
              <option value="apply">Apply</option><option value="analyze">Analyze</option>
              <option value="evaluate">Evaluate</option><option value="create">Create</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Topic</label>
          <input className="input" value={aiTopic} onChange={e => setAiTopic(e.target.value)} placeholder="e.g. Calculus, Data Structures..." onKeyDown={e => e.key === 'Enter' && callGroqAI()} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Upload Source Material <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>(optional — images, PDF, PPT)</span></label>
          <input ref={aiFileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.ppt,.pptx" onChange={handleAiFileSelect} style={{ display: 'none' }} />
          {aiFile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(128,128,128,0.08)', border: '1px solid var(--border)' }}>
              <Icon name="upload" size={12} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, flex: 1 }}>{aiFile.name}</span>
              <button onClick={() => setAiFile(null)} style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', padding: 0, display: 'flex' }}><Icon name="x" size={12} /></button>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => aiFileRef.current?.click()} style={{ width: '100%', justifyContent: 'center' }}>
              <Icon name="upload" size={12} /> Choose File
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={callGroqAI} disabled={aiLoading || (!aiTopic && !aiFile)}>
            {aiLoading ? <><span className="spinner" /> Generating...</> : <><Icon name="ai" size={12} /> Generate</>}
          </button>
          {aiResult && !aiError && (
            <button className="btn btn-sm" style={{ borderColor: 'var(--success)', color: 'var(--success)' }} onClick={injectAiQuestions}>
              <Icon name="check" size={12} /> Add to Test ({aiResult.length})
            </button>
          )}
        </div>
        {(aiResult || aiError) && (
          <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', padding: 12 }}>
            {aiError
              ? <div style={{ color: 'var(--danger)', fontFamily: 'var(--mono)', fontSize: 11 }}>Error: {aiError}</div>
              : aiResult && aiResult.map((q, i) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(128,128,128,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Q{i + 1} · {q.type?.toUpperCase()} · {q.marks} mark{q.marks !== 1 ? 's' : ''}</div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-xs" onClick={() => setAiEditIdx(aiEditIdx === i ? null : i)}><Icon name={aiEditIdx === i ? 'check' : 'edit'} size={9} /> {aiEditIdx === i ? 'Done' : 'Edit'}</button>
                      <button className="btn btn-xs btn-danger" onClick={() => deleteAiQuestion(i)}><Icon name="trash" size={9} /></button>
                    </div>
                  </div>
                  {aiEditIdx === i ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      <input className="input" value={q.text} onChange={e => updateAiQuestion(i, 'text', e.target.value)} placeholder="Question text" style={{ fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1 }}><label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>MARKS</label><input className="input" type="number" min={1} max={10} value={q.marks} onChange={e => updateAiQuestion(i, 'marks', +e.target.value)} style={{ fontSize: 12 }} /></div>
                        {q.type === 'mcq' && <div style={{ flex: 1 }}><label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>CORRECT (0-3)</label><input className="input" type="number" min={0} max={3} value={typeof q.answer === 'number' ? q.answer : 0} onChange={e => updateAiQuestion(i, 'answer', +e.target.value)} style={{ fontSize: 12 }} /></div>}
                        {q.type === 'tf' && <div style={{ flex: 1 }}><label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>ANSWER</label><select className="input" value={q.answer ? 'true' : 'false'} onChange={e => updateAiQuestion(i, 'answer', e.target.value === 'true')} style={{ fontSize: 12 }}><option value="true">True</option><option value="false">False</option></select></div>}
                        {q.type === 'fib' && <div style={{ flex: 2 }}><label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>ANSWER</label><input className="input" value={String(q.answer)} onChange={e => updateAiQuestion(i, 'answer', e.target.value)} style={{ fontSize: 12 }} /></div>}
                      </div>
                      {q.options && q.options.map((o: string, j: number) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, width: 16, color: j === q.answer ? 'var(--success)' : 'var(--fg-dim)' }}>{String.fromCharCode(65 + j)}</span>
                          <input className="input" value={o} onChange={e => { const opts = [...(q.options as string[])]; opts[j] = e.target.value; updateAiQuestion(i, 'options', opts) }} style={{ fontSize: 12 }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13 }}>{q.text}</div>
                      {q.options && <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {q.options.map((o: string, j: number) => <span key={j} style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 8px', border: `1px solid ${j === q.answer ? 'var(--success)' : 'var(--border)'}`, color: j === q.answer ? 'var(--success)' : 'var(--fg-dim)' }}>{o}</span>)}
                      </div>}
                      {q.type === 'tf' && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)', marginTop: 4 }}>Answer: {q.answer ? 'True' : 'False'}</div>}
                      {q.type === 'fib' && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)', marginTop: 4 }}>Answer: {String(q.answer)}</div>}
                    </>
                  )}
                </div>
              ))
            }
          </div>
        )}
      </Modal>

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <>
          <PageHeader title="TESTS & QUIZZES" subtitle="Create, manage, and track student performance" />

          {/* Sub-tabs + actions bar */}
          <div className="tm-filter-bar fade-up-1">
            <div className="tm-filter-pills">
              <button className={`tm-pill ${subTab === 'tests' ? 'active' : ''}`} onClick={() => setSubTab('tests')}>
                Tests ({myTests.length})
              </button>
              <button className={`tm-pill ${subTab === 'quizzes' ? 'active' : ''}`} onClick={() => setSubTab('quizzes')}>
                Quizzes ({myQuizzes.length})
              </button>
              <button className="tm-pill" onClick={() => setView('analytics')} style={{ marginLeft: 8 }}>
                <Icon name="chart" size={10} /> Analytics
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="tm-search-box">
                <Icon name="search" size={12} />
                <input placeholder="Search..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => { setNewTest(f => ({ ...f, type: subTab === 'quizzes' ? 'quiz' : 'test' })); setTestModal(true) }}>
                <Icon name="plus" size={12} /> New {subTab === 'quizzes' ? 'Quiz' : 'Test'}
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="tm-teacher-grid fade-up-2">
            {displayTests.map(t => {
              const attCount = allAttempts.filter(a => a.test_id === t.id).length
              const avgPct = attCount > 0 ? Math.round(allAttempts.filter(a => a.test_id === t.id).reduce((s, a) => s + (a.percent || 0), 0) / attCount) : null
              return (
                <div key={t.id} className="tm-teacher-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{t.id}</span>
                        <span className="tag tag-info" style={t.status === 'locked' ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}>
                          {t.status === 'locked' ? '■ LOCKED' : t.status}
                        </span>
                      </div>
                      <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 4 }}>{t.title}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8 }}>
                    {t.scheduled_date && <>{t.scheduled_date} {t.scheduled_time} · </>}{t.duration} min · {t.questions?.length || 0} Q&apos;s · {t.total_marks} marks
                  </div>

                  {/* Mini stats */}
                  {attCount > 0 && (
                    <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 10, marginBottom: 8 }}>
                      <span><span style={{ color: 'var(--fg-dim)' }}>Attempts: </span>{attCount}</span>
                      <span><span style={{ color: 'var(--fg-dim)' }}>Avg: </span><span style={{ color: avgPct! >= 70 ? 'var(--success)' : avgPct! >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{avgPct}%</span></span>
                    </div>
                  )}

                  {/* Anti-cheat features */}
                  {t.anti_cheat && (
                    <div className="tm-ac-features" style={{ marginBottom: 10 }}>
                      {t.anti_cheat.tabSwitch && <span className="tm-ac-tag">Tab Lock</span>}
                      {t.anti_cheat.fullscreen && <span className="tm-ac-tag">Fullscreen</span>}
                      {t.anti_cheat.randomQ && <span className="tm-ac-tag">Shuffled</span>}
                      {t.anti_cheat.maxAttempts > 1 && <span className="tm-ac-tag">{t.anti_cheat.maxAttempts} Attempts</span>}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-xs" onClick={() => openQuestionBank(t)}><Icon name="edit" size={10} /> Questions</button>
                    <button className="btn btn-xs" onClick={() => toggleTestStatus(t)} style={{ borderColor: t.status === 'locked' ? 'var(--warn)' : 'var(--success)', color: t.status === 'locked' ? 'var(--warn)' : 'var(--success)' }}>
                      <Icon name={t.status === 'locked' ? 'eye-off' : 'eye'} size={10} /> {t.status === 'locked' ? 'Unlock' : 'Lock'}
                    </button>
                    <button className="btn btn-xs btn-danger" onClick={() => deleteTest(t.id)}><Icon name="trash" size={10} /></button>
                  </div>
                </div>
              )
            })}
          </div>

          {displayTests.length === 0 && (
            <div className="tm-empty fade-up-2">
              <Icon name="test" size={32} />
              <div>No {subTab} found{searchQ ? ` matching "${searchQ}"` : ''}</div>
            </div>
          )}
        </>
      )}

      {/* ── QUESTION BANK VIEW ── */}
      {view === 'bank' && QBTest && (
        <div className="fade-up">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => { setQuestionBank(null); setView('list') }}>← Back</button>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '0.08em' }}>{QBTest.title}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 10 }}>{QBTest.id} · {QBTest.questions?.length || 0} questions · {QBTest.total_marks} marks</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => setQManualModal(true)}><Icon name="plus" size={12} /> Add Manually</button>
            <button className="btn btn-sm" style={{ borderColor: 'var(--success)', color: 'var(--success)' }} onClick={() => setAiModal(true)}><Icon name="ai" size={12} /> AI Generate</button>
          </div>
          {(!QBTest.questions || QBTest.questions.length === 0) && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', padding: 20 }}><Icon name="test" size={32} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No questions yet. Add manually or generate with AI.</span></div>}
          {QBTest.questions?.map((q, i) => {
            const isEditing = bankEditIdx === q.id
            return (
            <div key={q.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Q{i + 1} · {q.type?.toUpperCase()} ·{' '}
                    {isEditing ? (
                      <input type="number" min={1} max={10} value={q.marks} onChange={e => updateBankQuestion(q.id, 'marks', Number(e.target.value))} style={{ width: 40, fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '1px 4px' }} />
                    ) : <>{q.marks}</>} mark{q.marks !== 1 ? 's' : ''}
                  </div>
                  {isEditing ? (
                    <textarea value={q.text} onChange={e => updateBankQuestion(q.id, 'text', e.target.value)} style={{ width: '100%', fontSize: 13, marginBottom: 8, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', fontFamily: 'inherit', padding: 6, resize: 'vertical', minHeight: 40 }} />
                  ) : (
                    <div style={{ fontSize: 13, marginBottom: 8 }}>{q.text}</div>
                  )}
                  {q.options && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(q.options as string[]).map((o, j) => isEditing ? (
                      <input key={j} value={o} onChange={e => { const newOpts = [...(q.options as string[])]; newOpts[j] = e.target.value; updateBankQuestion(q.id, 'options', newOpts) }} style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 8px', border: `1px solid ${j === q.answer ? 'var(--success)' : 'var(--border)'}`, color: j === q.answer ? 'var(--success)' : 'var(--fg)', background: 'var(--bg)', width: 120 }} />
                    ) : (
                      <span key={j} style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 8px', border: `1px solid ${j === q.answer ? 'var(--success)' : 'var(--border)'}`, color: j === q.answer ? 'var(--success)' : 'var(--fg-dim)' }}>{o}</span>
                    ))}
                  </div>}
                  {q.type === 'mcq' && isEditing && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 4 }}>Correct: <select value={q.answer as number} onChange={e => updateBankQuestion(q.id, 'answer', Number(e.target.value))} style={{ fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}>{(q.options as string[])?.map((_, j) => <option key={j} value={j}>{['A','B','C','D','E','F'][j]}</option>)}</select></div>}
                  {q.type === 'tf' && (isEditing ? <div style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>Answer: <select value={q.answer ? 'true' : 'false'} onChange={e => updateBankQuestion(q.id, 'answer', e.target.value === 'true')} style={{ fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)' }}><option value="true">True</option><option value="false">False</option></select></div> : <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)' }}>Answer: {q.answer ? 'True' : 'False'}</span>)}
                  {q.type === 'fib' && (isEditing ? <div style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>Answer: <input value={String(q.answer)} onChange={e => updateBankQuestion(q.id, 'answer', e.target.value)} style={{ fontFamily: 'var(--mono)', fontSize: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '1px 6px' }} /></div> : <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)' }}>Answer: {String(q.answer)}</span>)}
                  {q.type === 'msq' && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)' }}>Correct: {(q.answer as number[])?.map(i => ['A', 'B', 'C', 'D'][i]).join(', ')}</div>}
                  {q.type === 'match' && <div style={{ marginTop: 6 }}>{(q.answer as any[])?.map((p, i) => <div key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{p.left} → {p.right}</div>)}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 10 }}>
                  {isEditing ? (
                    <button className="btn btn-xs" style={{ borderColor: 'var(--success)', color: 'var(--success)' }} onClick={() => saveBankQuestion(q.id)}><Icon name="check" size={10} /></button>
                  ) : (
                    <button className="btn btn-xs" onClick={() => setBankEditIdx(q.id)}><Icon name="edit" size={10} /></button>
                  )}
                  <button className="btn btn-xs btn-danger" onClick={() => deleteQuestion(q.id)}><Icon name="trash" size={10} /></button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* ── ANALYTICS VIEW ── */}
      {view === 'analytics' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <button className="btn btn-sm" onClick={() => setView('list')}>← Back</button>
            <PageHeader title="TEST ANALYTICS" subtitle="Performance insights across all tests" />
          </div>

          {tests.map(t => {
            const tAttempts = allAttempts.filter(a => a.test_id === t.id)
            if (!tAttempts.length) return null
            const avg = Math.round(tAttempts.reduce((s, a) => s + (a.percent || 0), 0) / tAttempts.length)
            const high = Math.max(...tAttempts.map(a => a.percent || 0))
            const low = Math.min(...tAttempts.map(a => a.percent || 0))
            const pass = tAttempts.filter(a => (a.percent || 0) >= 60).length
            return (
              <div key={t.id} className="card fade-up" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div><span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{t.id} · </span><span style={{ fontWeight: 500 }}>{t.title}</span></div>
                  <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 11, flexWrap: 'wrap' }}>
                    <span><span style={{ color: 'var(--fg-dim)' }}>Attempts: </span>{tAttempts.length}</span>
                    <span><span style={{ color: 'var(--fg-dim)' }}>Avg: </span><span style={{ color: avg >= 70 ? 'var(--success)' : avg >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{avg}%</span></span>
                    <span><span style={{ color: 'var(--fg-dim)' }}>High: </span>{high}%</span>
                    <span><span style={{ color: 'var(--fg-dim)' }}>Low: </span>{low}%</span>
                    <span><span style={{ color: 'var(--fg-dim)' }}>Pass: </span>{pass}/{tAttempts.length}</span>
                  </div>
                </div>
                {tAttempts.map(a => {
                  const student = students.find(s => s.id === a.student_id)
                  return (
                    <div key={a.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, marginBottom: 3 }}>
                        <span>{student?.name || a.student_id}</span><span>{a.percent}%</span>
                      </div>
                      <div className="tm-perf-bar">
                        <div className="tm-perf-fill" style={{ width: `${a.percent}%`, background: a.percent >= 70 ? 'var(--success)' : a.percent >= 40 ? 'var(--warn)' : 'var(--danger)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {tests.every(t => allAttempts.filter(a => a.test_id === t.id).length === 0) && (
            <div className="tm-empty fade-up-2">
              <Icon name="chart" size={32} />
              <div>No attempts yet</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
