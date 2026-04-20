'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import type { Profile, Test, Question, Attempt, AntiCheat } from '@/types'
import { fisher_yates, formatTimer } from '@/lib/utils'
import { checkAnswer } from '@/lib/checkAnswer'

/* ─── types ─── */
interface StudentTestModuleProps {
  profile: Profile
  tests: Test[]
  attempts: Attempt[]
  doubleXP: { active: boolean; ends_at: number | null }
  allStudents: Profile[]
  onExamStateChange?: (active: boolean) => void
  onAttemptDone: (attempt: Attempt, xpData: { newXP: number }) => void
}

/* ─── helpers ─── */
const qTypeLabel: Record<string, string> = { mcq:'Single Choice', msq:'Multi Select', tf:'True / False', fib:'Fill in Blank', match:'Match' }
const difficultyColor = (marks: number) => marks >= 3 ? 'var(--danger)' : marks >= 2 ? 'var(--warn)' : 'var(--success)'

/* ────────────────────────────────────────────── */
export function StudentTestModule({ profile, tests, attempts, doubleXP, allStudents, onExamStateChange, onAttemptDone }: StudentTestModuleProps) {
  const { toast } = useToast()

  /* views */
  const [view, setView] = useState<'list' | 'attempt' | 'result' | 'review'>('list')
  const [filter, setFilter] = useState<'all' | 'available' | 'attempted'>('all')
  const [searchQ, setSearchQ] = useState('')

  /* test attempt */
  const [activeTest, setActiveTest] = useState<Test | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [currentQ, setCurrentQ] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [qTimeLeft, setQTimeLeft] = useState(0)
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [showNav, setShowNav] = useState(false)
  const [ghostScore, setGhostScore] = useState<number | null>(null)
  const [doubleXPLocked, setDoubleXPLocked] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [ackIncomplete, setAckIncomplete] = useState(false)

  /* result */
  const [testResult, setTestResult] = useState<{
    score: number; total: number; percent: number; date: string
    xpEarned: number; isDoubleXP: boolean; ghostMsg: string; ghostBonus: number
    answerMap: Record<string, any>
    questsCompleted: Array<{ title: string; xp_reward: number }>
  } | null>(null)

  /* review */
  const [reviewTest, setReviewTest] = useState<Test | null>(null)
  const [reviewAttempt, setReviewAttempt] = useState<Attempt | null>(null)
  const [reviewQ, setReviewQ] = useState(0)

  /* anti-cheat state */
  const [tabWarnings, setTabWarnings] = useState(0)
  const [tabWarningVisible, setTabWarningVisible] = useState(false)
  const [fsWarningVisible, setFsWarningVisible] = useState(false)

  /* refs */
  const timerRef = useRef<any>(null)
  const qTimerRef = useRef<any>(null)
  const handleSubmitRef = useRef<() => void>(() => {})
  const submittingRef = useRef(false)
  const visHandlerRef = useRef<(() => void) | null>(null)
  const fsHandlerRef = useRef<(() => void) | null>(null)
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const startTimeRef = useRef<number>(0)
  const isOfflineRef = useRef(false)
  const pendingSubmitRef = useRef(false)

  const attempted = attempts.map(a => a.test_id)

  const canReviewAttempt = (test?: Test | null) => {
    if (!test) return false
    return test.type === 'quiz' || test.anti_cheat?.allowImmediateReview === true
  }

  /* keep handleSubmitRef in sync */
  useEffect(() => { handleSubmitRef.current = handleSubmit })

  useEffect(() => {
    onExamStateChange?.(view === 'attempt')
  }, [view, onExamStateChange])

  /* global timer */
  useEffect(() => {
    if (!activeTest || testResult || view !== 'attempt') return
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmitRef.current(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTest, testResult, view])

  /* per-Q timer */
  useEffect(() => {
    if (!activeTest || !activeTest.anti_cheat?.timePerQ || testResult || view !== 'attempt') return
    clearInterval(qTimerRef.current)
    setQTimeLeft(activeTest.anti_cheat.timePerQ)
    qTimerRef.current = setInterval(() => {
      setQTimeLeft(t => {
        if (t <= 1) {
          clearInterval(qTimerRef.current)
          setCurrentQ(q => {
            if (q >= questions.length - 1) { handleSubmitRef.current(); return q }
            return q + 1
          })
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(qTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQ, activeTest, testResult, view])

  /* autosave answers */
  useEffect(() => {
    if (!activeTest || testResult) return
    try { localStorage.setItem(`qgx-test-${activeTest.id}`, JSON.stringify(answers)) } catch (e) {
      console.warn('Failed to autosave answers to localStorage:', e)
      setIsOffline(prev => { if (!prev) toast('△ Storage full — your answers may not be saved locally. Submit soon!', 'error'); return prev })
    }
  }, [answers, activeTest, testResult, toast])

  /* offline detection */
  useEffect(() => {
    const on = () => {
      isOfflineRef.current = false
      setIsOffline(false)
      if (pendingSubmitRef.current) {
        pendingSubmitRef.current = false
        toast('◈ Back online — submitting your test…', 'info')
        setTimeout(() => handleSubmitRef.current(), 300)
      }
    }
    const off = () => { isOfflineRef.current = true; setIsOffline(true) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [toast])

  /* cleanup on unmount */
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current); clearInterval(qTimerRef.current)
      if (visHandlerRef.current) document.removeEventListener('visibilitychange', visHandlerRef.current)
      if (fsHandlerRef.current) document.removeEventListener('fullscreenchange', fsHandlerRef.current)
      if (keyHandlerRef.current) document.removeEventListener('keydown', keyHandlerRef.current)
    }
  }, [])

  /* ── start test ── */
  const startTest = async (test: Test) => {
    // max attempts check
    const ac = test.anti_cheat || {} as AntiCheat
    const prevAttempts = attempts.filter(a => a.test_id === test.id)
    const maxAtt = ac.maxAttempts || 1
    if (prevAttempts.length >= maxAtt) return

    // Lazy-load questions only when starting a test
    let testWithQuestions = test
    if (!test.questions?.length) {
      const { data: fullTest } = await supabase
        .from('tests').select('*, questions(*)').eq('id', test.id).single()
      if (!fullTest?.questions?.length) return
      testWithQuestions = fullTest as Test
    }

    let qs = [...(testWithQuestions.questions || [])]
    if (ac.randomQ) qs = fisher_yates(qs)
    if (ac.randomOpts) qs = qs.map(q => {
      if ((q.type === 'mcq' || q.type === 'msq') && q.options) {
        const shuffled = fisher_yates(q.options.map((o: string, i: number) => ({ o, i })))
        const newOpts = shuffled.map((x: any) => x.o)
        if (q.type === 'mcq') {
          const newAns = shuffled.findIndex((x: any) => x.i === q.answer)
          return { ...q, options: newOpts, answer: newAns }
        } else {
          // MSQ: remap array of correct indices
          const oldAns = (q.answer as number[]) || []
          const newAns = oldAns.map(oldIdx => shuffled.findIndex((x: any) => x.i === oldIdx)).filter(i => i >= 0)
          return { ...q, options: newOpts, answer: newAns }
        }
      }
      return q
    })
    if (ac.fullscreen) { try { await document.documentElement.requestFullscreen() } catch {} }

    const bestPrevPercent = attempts.filter(a => a.test_id === test.id).reduce((max, a) => Math.max(max, a.percent || 0), 0)
    setGhostScore(bestPrevPercent)
    setDoubleXPLocked(!!(doubleXP.active && doubleXP.ends_at && Date.now() < doubleXP.ends_at))

    // Tab switch detection: warn first, auto-submit on 2nd
    setTabWarnings(0); setTabWarningVisible(false)
    if (ac.tabSwitch) {
      if (visHandlerRef.current) document.removeEventListener('visibilitychange', visHandlerRef.current)
      let warnings = 0
      const handler = () => {
        if (document.hidden) {
          warnings++
          if (warnings >= 2) {
            handleSubmitRef.current()
          } else {
            setTabWarnings(warnings)
            setTabWarningVisible(true)
            setTimeout(() => setTabWarningVisible(false), 5000)
          }
        }
      }
      visHandlerRef.current = handler
      document.addEventListener('visibilitychange', handler)
    }

    // Fullscreen exit detection
    setFsWarningVisible(false)
    if (ac.fullscreen) {
      if (fsHandlerRef.current) document.removeEventListener('fullscreenchange', fsHandlerRef.current)
      const fsHandler = () => {
        if (!document.fullscreenElement) {
          setFsWarningVisible(true)
          // Re-request fullscreen after brief delay
          setTimeout(async () => {
            try { await document.documentElement.requestFullscreen() } catch {}
            setFsWarningVisible(false)
          }, 2000)
        }
      }
      fsHandlerRef.current = fsHandler
      document.addEventListener('fullscreenchange', fsHandler)
    }

    // Block keyboard shortcuts: Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+X, Print Screen
    if (ac.copyPaste) {
      if (keyHandlerRef.current) document.removeEventListener('keydown', keyHandlerRef.current)
      const keyHandler = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && ['c','v','a','x','p'].includes(e.key.toLowerCase())) {
          e.preventDefault()
        }
        if (e.key === 'PrintScreen') e.preventDefault()
      }
      keyHandlerRef.current = keyHandler
      document.addEventListener('keydown', keyHandler)
    }

    let restored: Record<string, any> = {}
    try { const saved = localStorage.getItem(`qgx-test-${test.id}`); if (saved) restored = JSON.parse(saved) } catch {}

    // Track start time for timer persistence across refreshes
    const existingStart = localStorage.getItem(`qgx-start-${test.id}`)
    const startTime = existingStart ? parseInt(existingStart) : Date.now()
    if (!existingStart) localStorage.setItem(`qgx-start-${test.id}`, String(startTime))
    startTimeRef.current = startTime
    const elapsed = Math.floor((Date.now() - startTime) / 1000)
    const remaining = Math.max(0, test.duration * 60 - elapsed)

    setActiveTest(testWithQuestions); setQuestions(qs); setAnswers(restored)
    setCurrentQ(0); setTimeLeft(remaining); setTestResult(null)
    setFlagged(new Set()); setShowNav(false); setConfirmSubmit(false); setAckIncomplete(false)
    if (ac.timePerQ > 0) setQTimeLeft(ac.timePerQ)
    if (remaining <= 0) { setView('attempt'); setTimeout(() => handleSubmitRef.current(), 100); return }
    setView('attempt')
  }

  /* ── submit ── */
  const handleSubmit = async () => {
    if (!activeTest || !profile || submittingRef.current) return
    if (isOfflineRef.current) {
      pendingSubmitRef.current = true
      toast("You're offline — answers saved locally. Test will auto-submit when you reconnect.", 'error')
      setConfirmSubmit(false)
      return
    }
    submittingRef.current = true
    clearInterval(timerRef.current); clearInterval(qTimerRef.current)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    if (visHandlerRef.current) { document.removeEventListener('visibilitychange', visHandlerRef.current); visHandlerRef.current = null }
    if (fsHandlerRef.current) { document.removeEventListener('fullscreenchange', fsHandlerRef.current); fsHandlerRef.current = null }
    if (keyHandlerRef.current) { document.removeEventListener('keydown', keyHandlerRef.current); keyHandlerRef.current = null }
    // Note: localStorage is cleared only on success — keeps answers available if submission fails

    const answerMap: Record<string, any> = {}
    questions.forEach(q => { answerMap[q.id] = answers[q.id] })

    try {
      // Pre-submit check: verify test still exists (#16)
      const { data: testCheck } = await supabase.from('tests').select('id').eq('id', activeTest.id).single()
      if (!testCheck) {
        // Test was deleted mid-exam — save answers locally
        try { localStorage.setItem(`qgx-test-backup-${activeTest.id}`, JSON.stringify(answerMap)) } catch {}
        toast('This test was removed by the teacher. Your answers have been saved locally as a backup.', 'info')
        setView('list'); setActiveTest(null); submittingRef.current = false; setConfirmSubmit(false)
        return
      }

      const res = await fetch('/api/submit-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: activeTest.id, answer_map: answerMap, is_double_xp: doubleXPLocked }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Submission failed')

      const { score, total, percent, xpEarned, isDoubleXP, ghostMsg, ghostBonus, newXP } = json.data || json

      // Fetch quest progress that advanced from this submission (DB trigger fires asynchronously)
      let questsCompleted: Array<{ title: string; xp_reward: number }> = []
      try {
        await new Promise(r => setTimeout(r, 800)) // brief wait for DB trigger
        const { data: qpData } = await supabase
          .from('quest_progress')
          .select('quest_id, completed, claimed, quests(title, xp_reward, target_type)')
          .eq('student_id', profile.id)
          .eq('completed', true)
          .eq('claimed', false)
        if (qpData) {
          questsCompleted = qpData
            .filter((p: any) => p.quests?.target_type === 'test' || p.quests?.target_type === 'xp')
            .map((p: any) => ({ title: p.quests.title, xp_reward: p.quests.xp_reward }))
        }
      } catch { /* non-blocking */ }

      // Clear saved answers only after confirmed success
      try { localStorage.removeItem(`qgx-test-${activeTest.id}`); localStorage.removeItem(`qgx-start-${activeTest.id}`) } catch {}
      setTestResult({ score, total, percent, date: new Date().toISOString().slice(0, 10), xpEarned, isDoubleXP, ghostMsg, ghostBonus, answerMap, questsCompleted })
      onAttemptDone({ id: `temp-${Date.now()}`, student_id: profile.id, test_id: activeTest.id, score, total, percent, xp_earned: xpEarned, answer_map: answerMap, submitted_at: new Date().toISOString() }, { newXP })
      setView('result')
    } catch (e: any) {
      // If network dropped mid-submission, queue for auto-retry when reconnected
      if (isOfflineRef.current) {
        pendingSubmitRef.current = true
        toast('You went offline during submission — will auto-retry when reconnected.', 'error')
      } else {
        toast(`Submission error: ${e.message}`, 'error')
      }
    }
    submittingRef.current = false; setConfirmSubmit(false)
  }

  /* ── review ── */
  const openReview = async (attempt: Attempt) => {
    let test = tests.find(t => t.id === attempt.test_id)
    if (!test) return
    if (!test.questions?.length) {
      const { data: fullTest } = await supabase
        .from('tests').select('*, questions(*)').eq('id', test.id).single()
      if (!fullTest?.questions?.length) { toast('No questions available to review', 'error'); return }
      test = fullTest as Test
    }
    setReviewTest(test); setReviewAttempt(attempt); setReviewQ(0)
    setView('review')
  }

  /* ── toggle flag ── */
  const toggleFlag = (qId: string) => setFlagged(prev => {
    const next = new Set(prev)
    next.has(qId) ? next.delete(qId) : next.add(qId)
    return next
  })

  /* ── filter & search ── */
  const filteredTests = tests.filter(t => {
    if (filter === 'available') return !attempted.includes(t.id)
    if (filter === 'attempted') return attempted.includes(t.id)
    return true
  }).filter(t => !searchQ || t.title.toLowerCase().includes(searchQ.toLowerCase()) || t.subject?.toLowerCase().includes(searchQ.toLowerCase()))

  const answeredCount = questions.filter(q => answers[q.id] !== undefined).length
  const sortedLeaderboard = [...allStudents].sort((a, b) => (b.xp || 0) - (a.xp || 0))

  /* ────────── LIST VIEW ────────── */
  if (view === 'list') {
    return (
      <div className="test-module">
        <PageHeader title="TESTS & QUIZZES" subtitle="Take tests, track your progress, review answers" />

        {/* Filter bar */}
        <div className="tm-filter-bar fade-up-1">
          <div className="tm-filter-pills">
            {(['all', 'available', 'attempted'] as const).map(f => (
              <button key={f} className={`tm-pill ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? `All (${tests.length})` : f === 'available' ? `Available (${tests.filter(t => !attempted.includes(t.id)).length})` : `Attempted (${Array.from(new Set(attempts.map(a => a.test_id))).length})`}
              </button>
            ))}
          </div>
          <div className="tm-search-box">
            <Icon name="search" size={12} />
            <input placeholder="Search tests..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          </div>
        </div>

        {/* Test cards */}
        <div className="tm-grid fade-up-2">
          {filteredTests.map(t => {
            const att = attempts.find(a => a.test_id === t.id)
            const attCount = attempts.filter(a => a.test_id === t.id).length
            const maxAtt = t.anti_cheat?.maxAttempts || 1
            const isLocked = t.status === 'locked'
            const blocked = attCount >= maxAtt || isLocked
            const qCount = t.questions?.length || 0
            const canReview = canReviewAttempt(t)
            const acFeatures = []
            if (t.anti_cheat?.tabSwitch) acFeatures.push('Tab Lock')
            if (t.anti_cheat?.copyPaste) acFeatures.push('No Copy')
            if (t.anti_cheat?.fullscreen) acFeatures.push('Fullscreen')
            if (t.anti_cheat?.randomQ) acFeatures.push('Shuffled')
            if (t.anti_cheat?.timePerQ) acFeatures.push(`${t.anti_cheat.timePerQ}s/Q`)

            return (
              <div key={t.id} className={`tm-card ${att ? 'attempted' : ''}`}>
                <div className="tm-card-header">
                  <div className="tm-card-badges">
                    <span className={`tag ${t.type === 'quiz' ? 'tag-info' : 'tag-warn'}`}>{t.type.toUpperCase()}</span>
                    {att && <span className="tag tag-success">DONE</span>}
                    {isLocked && <span className="tag tag-danger" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>■ LOCKED</span>}
                    {!isLocked && blocked && <span className="tag tag-danger">MAX ATTEMPTS</span>}
                    {t.anti_cheat?.fullscreen && <span className="tm-shield">◆</span>}
                  </div>
                  <span className="tm-card-id">{t.id}</span>
                </div>

                <h3 className="tm-card-title">{t.title}</h3>

                <div className="tm-card-meta">
                  <div className="tm-meta-item"><Icon name="user" size={11} /> {t.teacher_name}</div>
                  <div className="tm-meta-item"><Icon name="clock" size={11} /> {t.duration} min</div>
                  <div className="tm-meta-item"><Icon name="test" size={11} /> {qCount} Q&apos;s</div>
                  <div className="tm-meta-item"><Icon name="star" size={11} /> {t.total_marks} marks</div>
                  {(t.xp_reward > 0) && <div className="tm-meta-item" style={{ color: 'var(--warn)' }}>◈ {t.xp_reward} XP</div>}
                </div>

                {acFeatures.length > 0 && (
                  <div className="tm-ac-features">
                    {acFeatures.map(f => <span key={f} className="tm-ac-tag">{f}</span>)}
                  </div>
                )}

                {t.anti_cheat?.maxAttempts > 1 && (
                  <div className="tm-attempts-bar">
                    <div className="tm-attempts-label">Attempts: {attCount}/{maxAtt}</div>
                    <div className="tm-attempts-track">
                      <div className="tm-attempts-fill" style={{ width: `${(attCount / maxAtt) * 100}%` }} />
                    </div>
                  </div>
                )}

                {att && (
                  <div className="tm-score-display">
                    <div className="tm-score-ring" data-color={att.percent >= 70 ? 'success' : att.percent >= 40 ? 'warn' : 'danger'}>
                      <svg viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="16" fill="none" stroke="var(--border)" strokeWidth="2" />
                        <circle cx="18" cy="18" r="16" fill="none" stroke={att.percent >= 70 ? 'var(--success)' : att.percent >= 40 ? 'var(--warn)' : 'var(--danger)'} strokeWidth="2"
                          strokeDasharray={`${att.percent} ${100 - att.percent}`} strokeDashoffset="25" strokeLinecap="round" />
                      </svg>
                      <span className="tm-score-val">{att.percent}%</span>
                    </div>
                    <div className="tm-score-info">
                      <div className="tm-score-marks">{att.score}/{att.total}</div>
                      <div className="tm-score-date">{att.submitted_at?.slice(0, 10)}</div>
                    </div>
                  </div>
                )}

                <div className="tm-card-actions">
                  {att && canReview && (
                    <button className="btn btn-sm tm-review-btn" onClick={() => openReview(att)}>
                      <Icon name="book" size={12} /> Review
                    </button>
                  )}
                  {!blocked && !isLocked && (
                    <button className="btn btn-primary btn-sm" onClick={() => startTest(t)}>
                      <Icon name="arrow" size={12} /> {att ? 'Retry' : 'Start'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {filteredTests.length === 0 && (
          <div className="tm-empty fade-up-2">
            <Icon name="test" size={32} />
            <div>{filter === 'available' ? 'No available tests right now' : filter === 'attempted' ? 'You haven\'t attempted any tests yet' : 'No tests found'}</div>
          </div>
        )}
      </div>
    )
  }

  /* ────────── ATTEMPT VIEW ────────── */
  if (view === 'attempt' && activeTest) {
    const ac = activeTest.anti_cheat || {} as AntiCheat
    const q = questions[currentQ]
    if (!q) return null
    const progress = questions.length ? (answeredCount / questions.length) * 100 : 0
    const unansweredCount = Math.max(0, questions.length - answeredCount)
    const requiresAllAnswered = !!ac.requireAllAnswered
    const canSubmitNow = requiresAllAnswered ? unansweredCount === 0 : (unansweredCount === 0 || ackIncomplete)
    const qTimePct = ac.timePerQ > 0 ? (qTimeLeft / ac.timePerQ) * 100 : 100

    return (
      <div className="tm-attempt"
        onContextMenu={ac.copyPaste ? e => e.preventDefault() : undefined}
        onCopy={ac.copyPaste ? e => e.preventDefault() : undefined}
        onPaste={ac.copyPaste ? e => e.preventDefault() : undefined}
        onCut={ac.copyPaste ? e => e.preventDefault() : undefined}
        style={ac.copyPaste ? { userSelect: 'none', WebkitUserSelect: 'none' } : undefined}
      >
        {/* Anti-cheat warnings */}
        {tabWarningVisible && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'var(--danger)', color: '#fff', textAlign: 'center', padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.1em', zIndex: 9999, animation: 'fadeIn 0.2s' }}>
            △ TAB SWITCH DETECTED ({tabWarnings}/1) — Next violation will AUTO-SUBMIT your test!
          </div>
        )}
        {fsWarningVisible && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'var(--warn)', color: '#000', textAlign: 'center', padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '0.1em', zIndex: 9999 }}>
            △ FULLSCREEN REQUIRED — Re-entering fullscreen...
          </div>
        )}
        {/* Confirm submit modal */}
        <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)} title="Submit Test?">
          <div className="tm-confirm-body">
            <div className="tm-confirm-stats">
              <div className="tm-confirm-stat">
                <div className="tm-confirm-stat-val">{answeredCount}</div>
                <div className="tm-confirm-stat-label">Answered</div>
              </div>
              <div className="tm-confirm-stat">
                <div className="tm-confirm-stat-val">{unansweredCount}</div>
                <div className="tm-confirm-stat-label">Unanswered</div>
              </div>
              <div className="tm-confirm-stat">
                <div className="tm-confirm-stat-val">{flagged.size}</div>
                <div className="tm-confirm-stat-label">Flagged</div>
              </div>
            </div>
            {unansweredCount > 0 && (
              <div className="tm-confirm-warn">△ You have {unansweredCount} unanswered question{unansweredCount > 1 ? 's' : ''}</div>
            )}
            {unansweredCount > 0 && !requiresAllAnswered && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
                <input type="checkbox" checked={ackIncomplete} onChange={e => setAckIncomplete(e.target.checked)} />
                I understand unanswered questions will be marked incorrect.
              </label>
            )}
            {unansweredCount > 0 && requiresAllAnswered && (
              <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--danger)' }}>
                This test requires all questions to be answered before submission.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" disabled={submittingRef.current || !canSubmitNow} onClick={handleSubmit}><Icon name="check" size={14} /> Confirm Submit</button>
              <button className="btn" onClick={() => setConfirmSubmit(false)}>Continue Test</button>
            </div>
          </div>
        </Modal>

        {isOffline && (
          <div className="tm-offline-bar">△ You are offline — answers are saved locally</div>
        )}

        {/* Top bar */}
        <div className="tm-topbar">
          <div className="tm-topbar-left">
            <div className="tm-test-name">{activeTest.title}</div>
            <div className="tm-test-meta">
              {activeTest.id} · {questions.length} Q&apos;s
              {ghostScore !== null && ghostScore > 0 && <span className="tm-ghost">◇ Ghost: {ghostScore}%</span>}
              {doubleXPLocked && <span className="tm-double-xp">◈ 2× XP</span>}
            </div>
          </div>
          <div className="tm-topbar-right">
            <div className={`tm-timer ${timeLeft < 300 ? 'danger' : timeLeft < 600 ? 'warn' : ''}`}>
              <Icon name="clock" size={14} />
              <span>{formatTimer(timeLeft)}</span>
            </div>
            {timeLeft <= 60 && timeLeft > 0 && (
              <div className="tm-timer-warn">Auto-submit in {timeLeft}s!</div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="tm-progress-bar">
          <div className="tm-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        {ac.timePerQ > 0 && (
          <div className="tm-q-timer">
            <div className="tm-q-timer-fill" style={{ width: `${qTimePct}%`, background: qTimePct < 30 ? 'var(--danger)' : 'var(--warn)' }} />
          </div>
        )}

        {/* Main layout */}
        <div className="tm-attempt-layout">
          {/* Question nav sidebar (desktop) / overlay (mobile) */}
          <div className={`tm-q-nav ${showNav ? 'open' : ''}`}>
            <div className="tm-q-nav-header">
              <span>Questions</span>
              <span className="tm-q-nav-count">{answeredCount}/{questions.length}</span>
              <button className="tm-q-nav-close" onClick={() => setShowNav(false)}><Icon name="x" size={14} /></button>
            </div>
            <div className="tm-q-nav-grid">
              {questions.map((qItem, i) => {
                const isAnswered = answers[qItem.id] !== undefined
                const isFlagged = flagged.has(qItem.id)
                const isCurrent = i === currentQ
                return (
                  <button key={i} onClick={() => { setCurrentQ(i); setShowNav(false) }}
                    className={`tm-q-dot ${isCurrent ? 'current' : ''} ${isAnswered ? 'answered' : ''} ${isFlagged ? 'flagged' : ''}`}
                    title={`Q${i + 1}${isAnswered ? ' ✓' : ''}${isFlagged ? ' ⚑' : ''}`}
                  >
                    {i + 1}
                    {isFlagged && <span className="tm-flag-dot" />}
                  </button>
                )
              })}
            </div>
            <div className="tm-q-nav-legend">
              <span><span className="tm-legend-dot current" /> Current</span>
              <span><span className="tm-legend-dot answered" /> Answered</span>
              <span><span className="tm-legend-dot flagged" /> Flagged</span>
            </div>
          </div>

          {/* Question area */}
          <div className="tm-q-area">
            <div className="tm-q-info">
              <div className="tm-q-badge">
                <span className="tm-q-num">Q{currentQ + 1}</span>
                <span className="tm-q-type">{qTypeLabel[q.type] || q.type}</span>
                <span className="tm-q-marks" style={{ borderColor: difficultyColor(q.marks) }}>{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
              </div>
              <button className={`tm-flag-btn ${flagged.has(q.id) ? 'active' : ''}`} onClick={() => toggleFlag(q.id)} title="Flag for review">
                <Icon name="pin" size={14} />
              </button>
            </div>

            <div className="tm-q-text">{q.text}</div>

            {/* MCQ */}
            {q.type === 'mcq' && (
              <div className="tm-options">
                {(q.options as string[]).map((o, j) => (
                  <button key={j} className={`tm-option ${answers[q.id] === j ? 'selected' : ''}`}
                    onClick={() => setAnswers(a => ({ ...a, [q.id]: j }))}>
                    <span className="tm-option-letter">{String.fromCharCode(65 + j)}</span>
                    <span className="tm-option-text">{o}</span>
                    {answers[q.id] === j && <span className="tm-option-check"><Icon name="check" size={12} /></span>}
                  </button>
                ))}
              </div>
            )}

            {/* MSQ */}
            {q.type === 'msq' && (
              <div className="tm-options">
                {(q.options as string[]).map((o, j) => {
                  const sel: number[] = answers[q.id] || []
                  return (
                    <button key={j} className={`tm-option ${sel.includes(j) ? 'selected' : ''}`}
                      onClick={() => setAnswers(a => { const cur = a[q.id] || []; return { ...a, [q.id]: cur.includes(j) ? cur.filter((x: number) => x !== j) : [...cur, j] } })}>
                      <span className="tm-option-letter">{String.fromCharCode(65 + j)}</span>
                      <span className="tm-option-text">{o}</span>
                      {sel.includes(j) && <span className="tm-option-check"><Icon name="check" size={12} /></span>}
                    </button>
                  )
                })}
                <div className="tm-hint">Select all that apply</div>
              </div>
            )}

            {/* True/False */}
            {q.type === 'tf' && (
              <div className="tm-tf-options">
                {[true, false].map(v => (
                  <button key={String(v)} className={`tm-tf-btn ${answers[q.id] === v ? 'selected' : ''}`}
                    onClick={() => setAnswers(a => ({ ...a, [q.id]: v }))}>
                    <span className="tm-tf-icon">{v ? '✓' : '✗'}</span>
                    <span>{v ? 'TRUE' : 'FALSE'}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Fill in blank */}
            {q.type === 'fib' && (
              <div className="tm-fib">
                <input className="input tm-fib-input" placeholder="Type your answer..." value={answers[q.id] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && currentQ < questions.length - 1) setCurrentQ(currentQ + 1) }}
                />
              </div>
            )}

            {/* Match */}
            {q.type === 'match' && (
              <div className="tm-match">
                <div className="tm-match-header">
                  <span>Column A</span><span>Your Match</span>
                </div>
                {(Array.isArray(q.answer) ? q.answer : []).map((pair: any, i: number) => (
                  <div key={i} className="tm-match-row">
                    <div className="tm-match-left">{pair.left}</div>
                    <input className="input" placeholder="Match..." value={(answers[q.id] || {})[pair.left] || ''}
                      onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [pair.left]: e.target.value } }))} />
                  </div>
                ))}
              </div>
            )}

            {/* Navigation */}
            <div className="tm-q-footer">
              <div className="tm-q-footer-left">
                <button className="btn btn-sm tm-nav-toggle" onClick={() => setShowNav(!showNav)}>
                  <Icon name="test" size={12} /> {answeredCount}/{questions.length}
                </button>
                <button className="btn btn-sm" onClick={() => setCurrentQ(q => Math.max(0, q - 1))} disabled={currentQ === 0}>← Prev</button>
                <button className="btn btn-sm" onClick={() => setCurrentQ(q => Math.min(questions.length - 1, q + 1))} disabled={currentQ === questions.length - 1}>Next →</button>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setConfirmSubmit(true)}>
                <Icon name="check" size={12} /> Submit
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ────────── RESULT VIEW ────────── */
  if (view === 'result' && testResult && activeTest) {
    const tier = testResult.percent >= 90 ? 'S' : testResult.percent >= 70 ? 'A' : testResult.percent >= 50 ? 'B' : testResult.percent >= 30 ? 'C' : 'D'
    const tierColor = tier === 'S' ? 'var(--warn)' : tier === 'A' ? 'var(--success)' : tier === 'B' ? 'rgba(100,180,255,0.9)' : tier === 'C' ? 'var(--fg-dim)' : 'var(--danger)'

    return (
      <div className="tm-result fade-up">
        <div className="tm-result-card">
          <div className="tm-result-header">TEST COMPLETE</div>

          <div className="tm-result-score-area">
            <div className="tm-result-ring">
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="6" />
                <circle cx="60" cy="60" r="52" fill="none" stroke={testResult.percent >= 70 ? 'var(--success)' : testResult.percent >= 40 ? 'var(--warn)' : 'var(--danger)'}
                  strokeWidth="6" strokeDasharray={`${(testResult.percent / 100) * 327} 327`}
                  strokeDashoffset="82" strokeLinecap="round" className="tm-result-ring-fill" />
              </svg>
              <div className="tm-result-ring-text">
                <div className="tm-result-percent">{testResult.percent}%</div>
                <div className="tm-result-marks">{testResult.score}/{testResult.total}</div>
              </div>
            </div>

            <div className="tm-result-tier" style={{ borderColor: tierColor, color: tierColor }}>
              GRADE {tier}
            </div>
          </div>

          <div className="tm-result-stats">
            <div className="tm-result-stat">
              <div className="tm-result-stat-icon">◈</div>
              <div className="tm-result-stat-val" style={{ color: testResult.isDoubleXP ? 'var(--warn)' : 'var(--fg)' }}>+{testResult.xpEarned}</div>
              <div className="tm-result-stat-label">{testResult.isDoubleXP ? '2× XP' : 'XP Earned'}</div>
            </div>
            {testResult.ghostMsg && (
              <div className="tm-result-stat">
                <div className="tm-result-stat-icon">◇</div>
                <div className="tm-result-stat-val">{testResult.ghostMsg}</div>
                <div className="tm-result-stat-label">{testResult.ghostBonus > 0 ? `+${testResult.ghostBonus} bonus` : 'Ghost Mode'}</div>
              </div>
            )}
            <div className="tm-result-stat">
              <div className="tm-result-stat-icon">▫</div>
              <div className="tm-result-stat-val">{testResult.date}</div>
              <div className="tm-result-stat-label">Completed</div>
            </div>
          </div>

          {testResult.questsCompleted.length > 0 && (
            <div style={{ margin: '16px 0', border: '1px solid var(--warn)', padding: 14 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--warn)', letterSpacing: '0.1em', marginBottom: 8 }}>◇ QUEST COMPLETE</div>
              {testResult.questsCompleted.map((q, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 4 }}>
                  <span>{q.title}</span>
                  <span style={{ color: 'var(--warn)' }}>+{q.xp_reward} XP ready to claim</span>
                </div>
              ))}
            </div>
          )}

          <div className="tm-result-actions">
            {canReviewAttempt(activeTest) && (
              <button className="btn btn-sm" onClick={() => openReview({ id: '', student_id: profile.id, test_id: activeTest.id, score: testResult.score, total: testResult.total, percent: testResult.percent, xp_earned: testResult.xpEarned, answer_map: testResult.answerMap, submitted_at: testResult.date })}>
                <Icon name="book" size={12} /> Review Answers
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => { setActiveTest(null); setTestResult(null); setView('list') }}>
              ← Back to Tests
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ────────── REVIEW VIEW ────────── */
  if (view === 'review' && reviewTest && reviewAttempt) {
    const qs = reviewTest.questions || []
    const q = qs[reviewQ]
    if (!q) return null
    const userAnswer = reviewAttempt.answer_map[q.id]
    const isCorrect = checkAnswer(q, userAnswer)

    return (
      <div className="tm-review fade-up">
        <div className="tm-review-topbar">
          <button className="btn btn-sm" onClick={() => { setView('list'); setReviewTest(null); setReviewAttempt(null) }}>← Back</button>
          <div className="tm-review-title">{reviewTest.title} — Review</div>
          <div className="tm-review-score">
            <span style={{ color: reviewAttempt.percent >= 70 ? 'var(--success)' : reviewAttempt.percent >= 40 ? 'var(--warn)' : 'var(--danger)' }}>
              {reviewAttempt.percent}%
            </span>
            <span className="tm-review-marks">{reviewAttempt.score}/{reviewAttempt.total}</span>
          </div>
        </div>

        {/* Q dots */}
        <div className="tm-review-dots">
          {qs.map((qItem, i) => {
            const ua = reviewAttempt.answer_map[qItem.id]
            const correct = checkAnswer(qItem, ua)
            return (
              <button key={i} className={`tm-q-dot ${i === reviewQ ? 'current' : ''} ${correct ? 'correct' : 'wrong'}`}
                onClick={() => setReviewQ(i)}>
                {i + 1}
              </button>
            )
          })}
        </div>

        <div className="tm-review-card">
          <div className={`tm-review-verdict ${isCorrect ? 'correct' : 'wrong'}`}>
            {isCorrect ? '✓ Correct' : '✗ Incorrect'}
          </div>

          <div className="tm-q-info" style={{ marginBottom: 0 }}>
            <div className="tm-q-badge">
              <span className="tm-q-num">Q{reviewQ + 1}</span>
              <span className="tm-q-type">{qTypeLabel[q.type] || q.type}</span>
              <span className="tm-q-marks">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="tm-q-text">{q.text}</div>

          {/* MCQ review */}
          {q.type === 'mcq' && q.options && (
            <div className="tm-options">
              {(q.options as string[]).map((o, j) => {
                const isUser = userAnswer === j
                const isRight = q.answer === j
                return (
                  <div key={j} className={`tm-option review ${isRight ? 'correct' : ''} ${isUser && !isRight ? 'wrong' : ''}`}>
                    <span className="tm-option-letter">{String.fromCharCode(65 + j)}</span>
                    <span className="tm-option-text">{o}</span>
                    {isRight && <span className="tm-option-badge correct">✓</span>}
                    {isUser && !isRight && <span className="tm-option-badge wrong">✗</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* MSQ review */}
          {q.type === 'msq' && q.options && (
            <div className="tm-options">
              {(q.options as string[]).map((o, j) => {
                const userSel: number[] = Array.isArray(userAnswer) ? userAnswer as number[] : []
                const correctSel: number[] = Array.isArray(q.answer) ? q.answer as number[] : []
                const isUser = userSel.includes(j)
                const isRight = correctSel.includes(j)
                return (
                  <div key={j} className={`tm-option review ${isRight ? 'correct' : ''} ${isUser && !isRight ? 'wrong' : ''}`}>
                    <span className="tm-option-letter">{String.fromCharCode(65 + j)}</span>
                    <span className="tm-option-text">{o}</span>
                    {isRight && <span className="tm-option-badge correct">✓</span>}
                    {isUser && !isRight && <span className="tm-option-badge wrong">✗</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* TF review */}
          {q.type === 'tf' && (
            <div className="tm-tf-options">
              {[true, false].map(v => (
                <div key={String(v)} className={`tm-tf-btn review ${v === q.answer ? 'correct' : ''} ${v === userAnswer && v !== q.answer ? 'wrong' : ''}`}>
                  <span>{v ? 'TRUE' : 'FALSE'}</span>
                  {v === q.answer && <span className="tm-option-badge correct">✓</span>}
                  {v === userAnswer && v !== q.answer && <span className="tm-option-badge wrong">✗</span>}
                </div>
              ))}
            </div>
          )}

          {/* FIB review */}
          {q.type === 'fib' && (
            <div className="tm-fib-review">
              <div className="tm-fib-row">
                <span className="tm-fib-label">Your answer:</span>
                <span className={`tm-fib-val ${isCorrect ? 'correct' : 'wrong'}`}>{String(userAnswer || '—')}</span>
              </div>
              {!isCorrect && (
                <div className="tm-fib-row">
                  <span className="tm-fib-label">Correct:</span>
                  <span className="tm-fib-val correct">{String(q.answer)}</span>
                </div>
              )}
            </div>
          )}

          {/* Match review */}
          {q.type === 'match' && (
            <div className="tm-match">
              <div className="tm-match-header">
                <span>Column A</span><span>Correct</span><span>Yours</span>
              </div>
              {(Array.isArray(q.answer) ? q.answer : []).map((pair: any, i: number) => {
                const userVal = (userAnswer as any)?.[pair.left] || '—'
                const isRight = String(userVal).trim().toLowerCase() === String(pair.right).trim().toLowerCase()
                return (
                  <div key={i} className="tm-match-row review">
                    <div className="tm-match-left">{pair.left}</div>
                    <div className="tm-match-right correct">{pair.right}</div>
                    <div className={`tm-match-right ${isRight ? 'correct' : 'wrong'}`}>{userVal}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="tm-q-footer">
          <div className="tm-q-footer-left">
            <button className="btn btn-sm" onClick={() => setReviewQ(q => Math.max(0, q - 1))} disabled={reviewQ === 0}>← Prev</button>
            <button className="btn btn-sm" onClick={() => setReviewQ(q => Math.min(qs.length - 1, q + 1))} disabled={reviewQ === qs.length - 1}>Next →</button>
          </div>
          <span className="tm-review-counter">{reviewQ + 1} / {qs.length}</span>
        </div>
      </div>
    )
  }

  return null
}

