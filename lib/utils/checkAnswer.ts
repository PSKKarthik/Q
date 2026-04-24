import type { Question } from '@/types'

/** Returns true if userAnswer is correct for the given question (used for review display). */
export function checkAnswer(q: Question, userAnswer: any): boolean {
  if (userAnswer === undefined || userAnswer === null) return false
  switch (q.type) {
    case 'mcq':
    case 'tf':
      return userAnswer === q.answer
    case 'fib':
      return String(userAnswer).trim().toLowerCase() === String(q.answer).trim().toLowerCase()
    case 'msq': {
      const correct = Array.isArray(q.answer) ? Array.from(q.answer as number[]).sort() : []
      const user = Array.isArray(userAnswer) ? Array.from(userAnswer as number[]).sort() : []
      return JSON.stringify(correct) === JSON.stringify(user)
    }
    case 'match': {
      if (!userAnswer || typeof userAnswer !== 'object') return false
      const pairs = Array.isArray(q.answer) ? (q.answer as { left: string; right: string }[]) : []
      return pairs.every(p => String(userAnswer[p.left] || '').trim().toLowerCase() === p.right.trim().toLowerCase())
    }
    default: return false
  }
}
