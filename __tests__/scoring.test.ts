/**
 * Tests for the server-side scoring logic used in /api/submit-test.
 * We extract and test the scoring algorithm independently since the actual
 * API route requires Supabase auth context.
 *
 * Also covers checkAnswer (client-side review display logic).
 */
import { checkAnswer } from '@/lib/checkAnswer'

interface Question {
  id: string
  type: 'mcq' | 'msq' | 'tf' | 'fib' | 'match'
  marks: number
  answer: any
}

type AnswerMap = Record<string, any>

/** Scoring logic extracted from /api/submit-test/route.ts */
function scoreTest(questions: Question[], answerMap: AnswerMap): { score: number; total: number; percent: number } {
  let score = 0, total = 0
  questions.forEach((q) => {
    total += q.marks || 1
    const ans = answerMap[q.id]
    if (q.type === 'mcq' && ans === q.answer) score += q.marks || 1
    else if (q.type === 'tf' && ans === q.answer) score += q.marks || 1
    else if (q.type === 'fib' && typeof ans === 'string' && ans.trim().toLowerCase() === (q.answer as string)?.toLowerCase()) score += q.marks || 1
    else if (q.type === 'msq') {
      if (Array.isArray(q.answer) && Array.isArray(ans)) {
        const correct = JSON.stringify((q.answer as number[]).sort()) === JSON.stringify(([...ans]).sort())
        if (correct) score += q.marks || 1
      }
    } else if (q.type === 'match') {
      const pairs = q.answer as { left: string; right: string }[]
      if (Array.isArray(pairs) && ans && typeof ans === 'object') {
        const allCorrect = pairs.every((p: any) => ans[p.left]?.trim().toLowerCase() === p.right.trim().toLowerCase())
        if (allCorrect) score += q.marks || 1
      }
    }
  })
  const percent = total ? Math.round((score / total) * 100) : 0
  return { score, total, percent }
}

/** XP calculation logic from submit-test */
function calculateXP(opts: {
  percent: number
  testXPReward: number
  prevPercent: number | null
  isDoubleXP: boolean
  maxXPPerTest: number
}): number {
  const { percent, testXPReward, prevPercent, isDoubleXP, maxXPPerTest } = opts
  const prevXPBase = prevPercent !== null ? Math.round(testXPReward * (prevPercent / 100)) : 0
  let baseXP = Math.round(testXPReward * (percent / 100))
  let deltaXP = Math.max(0, baseXP - prevXPBase)
  let xpEarned = isDoubleXP ? deltaXP * 2 : deltaXP
  xpEarned = Math.max(0, Math.min(xpEarned, maxXPPerTest))
  return xpEarned
}

describe('Test Scoring Logic', () => {
  describe('MCQ scoring', () => {
    it('scores correct MCQ answer', () => {
      const qs: Question[] = [{ id: 'q1', type: 'mcq', marks: 5, answer: 'B' }]
      const result = scoreTest(qs, { q1: 'B' })
      expect(result).toEqual({ score: 5, total: 5, percent: 100 })
    })

    it('scores incorrect MCQ answer as 0', () => {
      const qs: Question[] = [{ id: 'q1', type: 'mcq', marks: 5, answer: 'B' }]
      const result = scoreTest(qs, { q1: 'A' })
      expect(result).toEqual({ score: 0, total: 5, percent: 0 })
    })

    it('scores unanswered MCQ as 0', () => {
      const qs: Question[] = [{ id: 'q1', type: 'mcq', marks: 5, answer: 'B' }]
      const result = scoreTest(qs, {})
      expect(result).toEqual({ score: 0, total: 5, percent: 0 })
    })
  })

  describe('True/False scoring', () => {
    it('scores correct T/F answer', () => {
      const qs: Question[] = [{ id: 'q1', type: 'tf', marks: 2, answer: true }]
      expect(scoreTest(qs, { q1: true }).score).toBe(2)
    })

    it('scores incorrect T/F answer as 0', () => {
      const qs: Question[] = [{ id: 'q1', type: 'tf', marks: 2, answer: true }]
      expect(scoreTest(qs, { q1: false }).score).toBe(0)
    })
  })

  describe('Fill-in-the-blank scoring', () => {
    it('scores exact match (case-insensitive)', () => {
      const qs: Question[] = [{ id: 'q1', type: 'fib', marks: 3, answer: 'Newton' }]
      expect(scoreTest(qs, { q1: 'newton' }).score).toBe(3)
      expect(scoreTest(qs, { q1: 'NEWTON' }).score).toBe(3)
    })

    it('trims whitespace', () => {
      const qs: Question[] = [{ id: 'q1', type: 'fib', marks: 3, answer: 'Newton' }]
      expect(scoreTest(qs, { q1: '  newton  ' }).score).toBe(3)
    })

    it('rejects wrong answer', () => {
      const qs: Question[] = [{ id: 'q1', type: 'fib', marks: 3, answer: 'Newton' }]
      expect(scoreTest(qs, { q1: 'Einstein' }).score).toBe(0)
    })
  })

  describe('MSQ (multi-select) scoring', () => {
    it('scores when all correct options selected', () => {
      const qs: Question[] = [{ id: 'q1', type: 'msq', marks: 4, answer: ['A', 'C'] }]
      expect(scoreTest(qs, { q1: ['C', 'A'] }).score).toBe(4) // order independent
    })

    it('scores 0 when incorrect options selected', () => {
      const qs: Question[] = [{ id: 'q1', type: 'msq', marks: 4, answer: ['A', 'C'] }]
      expect(scoreTest(qs, { q1: ['A', 'B'] }).score).toBe(0)
    })

    it('scores 0 when partially correct', () => {
      const qs: Question[] = [{ id: 'q1', type: 'msq', marks: 4, answer: ['A', 'B', 'C'] }]
      expect(scoreTest(qs, { q1: ['A', 'B'] }).score).toBe(0) // all-or-nothing
    })
  })

  describe('Match scoring', () => {
    it('scores when all pairs matched correctly', () => {
      const qs: Question[] = [{
        id: 'q1', type: 'match', marks: 5,
        answer: [{ left: 'Newton', right: 'Physics' }, { left: 'Euler', right: 'Math' }]
      }]
      expect(scoreTest(qs, { q1: { Newton: 'Physics', Euler: 'Math' } }).score).toBe(5)
    })

    it('is case-insensitive', () => {
      const qs: Question[] = [{
        id: 'q1', type: 'match', marks: 5,
        answer: [{ left: 'Newton', right: 'Physics' }]
      }]
      expect(scoreTest(qs, { q1: { Newton: 'physics' } }).score).toBe(5)
    })

    it('scores 0 when any pair is wrong', () => {
      const qs: Question[] = [{
        id: 'q1', type: 'match', marks: 5,
        answer: [{ left: 'Newton', right: 'Physics' }, { left: 'Euler', right: 'Math' }]
      }]
      expect(scoreTest(qs, { q1: { Newton: 'Physics', Euler: 'Chemistry' } }).score).toBe(0)
    })
  })

  describe('Mixed question test', () => {
    it('scores a realistic test correctly', () => {
      const qs: Question[] = [
        { id: 'q1', type: 'mcq', marks: 4, answer: '1' },
        { id: 'q2', type: 'tf', marks: 4, answer: false },
        { id: 'q3', type: 'fib', marks: 4, answer: 'e^x' },
        { id: 'q4', type: 'mcq', marks: 4, answer: 'Linear' },
        { id: 'q5', type: 'msq', marks: 4, answer: ['Chain Rule', 'Product Rule', 'Quotient Rule'] },
      ]
      const answers = {
        q1: '1',           // correct
        q2: false,         // correct
        q3: 'E^X',         // correct (case insensitive)
        q4: 'Jump',        // wrong
        q5: ['Chain Rule', 'Product Rule', 'Quotient Rule'], // correct
      }
      const result = scoreTest(qs, answers)
      expect(result.score).toBe(16) // 4+4+4+0+4
      expect(result.total).toBe(20)
      expect(result.percent).toBe(80)
    })
  })

  describe('Percent calculation', () => {
    it('returns 0 when total is 0', () => {
      expect(scoreTest([], {}).percent).toBe(0)
    })

    it('rounds percent correctly', () => {
      const qs: Question[] = [
        { id: 'q1', type: 'mcq', marks: 1, answer: 'A' },
        { id: 'q2', type: 'mcq', marks: 1, answer: 'B' },
        { id: 'q3', type: 'mcq', marks: 1, answer: 'C' },
      ]
      // 1 out of 3 correct = 33%
      const result = scoreTest(qs, { q1: 'A', q2: 'X', q3: 'X' })
      expect(result.percent).toBe(33)
    })
  })
})

describe('XP Calculation Logic', () => {
  const MAX_XP = 500

  it('awards full XP on first attempt', () => {
    const xp = calculateXP({ percent: 80, testXPReward: 200, prevPercent: null, isDoubleXP: false, maxXPPerTest: MAX_XP })
    expect(xp).toBe(160) // 200 * 0.8
  })

  it('awards 0 XP when score does not improve', () => {
    const xp = calculateXP({ percent: 50, testXPReward: 200, prevPercent: 80, isDoubleXP: false, maxXPPerTest: MAX_XP })
    expect(xp).toBe(0)
  })

  it('awards only improvement delta XP on re-attempt', () => {
    const xp = calculateXP({ percent: 90, testXPReward: 200, prevPercent: 50, isDoubleXP: false, maxXPPerTest: MAX_XP })
    // First: 200*0.5=100, Now: 200*0.9=180, Delta: 80
    expect(xp).toBe(80)
  })

  it('doubles XP when double XP is active', () => {
    const xp = calculateXP({ percent: 100, testXPReward: 200, prevPercent: null, isDoubleXP: true, maxXPPerTest: MAX_XP })
    expect(xp).toBe(400) // 200 * 2
  })

  it('caps XP at MAX_XP_PER_TEST', () => {
    const xp = calculateXP({ percent: 100, testXPReward: 400, prevPercent: null, isDoubleXP: true, maxXPPerTest: MAX_XP })
    // 400 * 2 = 800 → capped at 500
    expect(xp).toBe(MAX_XP)
  })

  it('never returns negative XP', () => {
    const xp = calculateXP({ percent: 0, testXPReward: 200, prevPercent: 100, isDoubleXP: false, maxXPPerTest: MAX_XP })
    expect(xp).toBe(0)
  })

  it('handles perfect re-attempt correctly', () => {
    const xp = calculateXP({ percent: 100, testXPReward: 100, prevPercent: 100, isDoubleXP: false, maxXPPerTest: MAX_XP })
    expect(xp).toBe(0) // no improvement
  })
})

// ─── Minimal Question stub ────────────────────────────────────────────────────
type QStub = { id: string; test_id: string; type: any; text: string; answer: any; marks: number; order_index: number }

describe('checkAnswer (client-side review logic)', () => {
  const q = (type: string, answer: any): QStub => ({
    id: 'q1', test_id: 't1', type, text: 'Q', answer, marks: 1, order_index: 0,
  })

  describe('MCQ', () => {
    it('correct numeric index returns true', () => expect(checkAnswer(q('mcq', 2), 2)).toBe(true))
    it('wrong index returns false', () => expect(checkAnswer(q('mcq', 2), 1)).toBe(false))
    it('undefined returns false', () => expect(checkAnswer(q('mcq', 0), undefined)).toBe(false))
    it('null returns false', () => expect(checkAnswer(q('mcq', 0), null)).toBe(false))
  })

  describe('True/False', () => {
    it('true === true', () => expect(checkAnswer(q('tf', true), true)).toBe(true))
    it('false !== true', () => expect(checkAnswer(q('tf', true), false)).toBe(false))
  })

  describe('Fill-in-blank', () => {
    it('exact match', () => expect(checkAnswer(q('fib', 'Newton'), 'Newton')).toBe(true))
    it('case-insensitive', () => expect(checkAnswer(q('fib', 'Newton'), 'NEWTON')).toBe(true))
    it('trims whitespace', () => expect(checkAnswer(q('fib', 'Newton'), '  newton  ')).toBe(true))
    it('wrong answer', () => expect(checkAnswer(q('fib', 'Newton'), 'Einstein')).toBe(false))
  })

  describe('MSQ', () => {
    it('exact match regardless of order', () => expect(checkAnswer(q('msq', [0, 2]), [2, 0])).toBe(true))
    it('partial match returns false', () => expect(checkAnswer(q('msq', [0, 1, 2]), [0, 1])).toBe(false))
    it('extra option returns false', () => expect(checkAnswer(q('msq', [0, 1]), [0, 1, 2])).toBe(false))
    it('empty answer returns false', () => expect(checkAnswer(q('msq', [0]), [])).toBe(false))
  })

  describe('Match', () => {
    const pairs = [{ left: 'A', right: 'alpha' }, { left: 'B', right: 'beta' }]
    it('all correct', () => expect(checkAnswer(q('match', pairs), { A: 'alpha', B: 'beta' })).toBe(true))
    it('case-insensitive', () => expect(checkAnswer(q('match', pairs), { A: 'ALPHA', B: 'BETA' })).toBe(true))
    it('one wrong pair returns false', () => expect(checkAnswer(q('match', pairs), { A: 'alpha', B: 'gamma' })).toBe(false))
    it('missing pair returns false', () => expect(checkAnswer(q('match', pairs), { A: 'alpha' })).toBe(false))
    it('non-object answer returns false', () => expect(checkAnswer(q('match', pairs), 'wrong')).toBe(false))
  })
})
