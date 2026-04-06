import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/ratelimit'

const MAX_XP_PER_TEST = 500

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { success: rateLimitOk } = await checkRateLimit(`submit-test:${user.id}`)
  if (!rateLimitOk) return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })

  const userId = user.id
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (!profile || profile.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden: students only' }, { status: 403 })
  }

  const { test_id, answer_map, is_double_xp } = await req.json()
  if (!test_id || !answer_map || typeof answer_map !== 'object') {
    return NextResponse.json({ error: 'Missing test_id or answer_map' }, { status: 400 })
  }

  // Fetch the test with correct answers server-side
  const { data: test, error: testErr } = await supabase
    .from('tests').select('*, questions(*)').eq('id', test_id).single()
  if (testErr || !test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  }

  // Ensure the student can only submit tests they are allowed to see.
  // Access model mirrors student dashboard filtering: enrolled course subject or teacher.
  const { data: enrollRows, error: enrollErr } = await supabase
    .from('enrollments')
    .select('course_id')
    .eq('student_id', userId)

  if (enrollErr) {
    return NextResponse.json({ error: 'Could not verify enrollment' }, { status: 500 })
  }

  const enrolledCourseIds = (enrollRows || []).map((r: any) => r.course_id).filter(Boolean)
  if (enrolledCourseIds.length === 0) {
    return NextResponse.json({ error: 'You are not enrolled in any course' }, { status: 403 })
  }

  const { data: enrolledCourses, error: coursesErr } = await supabase
    .from('courses')
    .select('subject, teacher_id')
    .in('id', enrolledCourseIds)

  if (coursesErr) {
    return NextResponse.json({ error: 'Could not verify course access' }, { status: 500 })
  }

  const allowedSubjects = new Set((enrolledCourses || []).map((c: any) => c.subject).filter(Boolean))
  const allowedTeacherIds = new Set((enrolledCourses || []).map((c: any) => c.teacher_id).filter(Boolean))
  const hasAccess = (test.subject && allowedSubjects.has(test.subject)) || (test.teacher_id && allowedTeacherIds.has(test.teacher_id))

  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden: test is not assigned to your enrolled courses' }, { status: 403 })
  }

  if (test.status === 'locked') {
    return NextResponse.json({ error: 'This test is locked' }, { status: 403 })
  }

  // --- Deadline enforcement (#3) ---
  if (test.scheduled_date && test.scheduled_time) {
    const scheduledStart = new Date(`${test.scheduled_date}T${test.scheduled_time}`)
    const scheduledEnd = new Date(scheduledStart.getTime() + (test.duration || 60) * 60 * 1000 + 5 * 60 * 1000) // +5min grace
    const now = new Date()
    if (now > scheduledEnd) {
      return NextResponse.json({ error: 'Test deadline has passed' }, { status: 403 })
    }
  }

  // --- Max attempts enforcement (#4) ---
  const ac = test.anti_cheat || {}
  const maxAttempts = ac.maxAttempts || 1
  const { count: attemptCount } = await supabase
    .from('attempts')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
    .eq('test_id', test_id)
  if (attemptCount !== null && attemptCount >= maxAttempts) {
    return NextResponse.json({ error: `Maximum attempts (${maxAttempts}) reached` }, { status: 403 })
  }

  const questions: any[] = test.questions || []

  // Score server-side using the authoritative answers
  let score = 0, total = 0
  questions.forEach((q: any) => {
    total += q.marks || 1
    const ans = answer_map[q.id]
    if (q.type === 'mcq' && ans === q.answer) score += q.marks || 1
    else if (q.type === 'tf' && ans === q.answer) score += q.marks || 1
    else if (q.type === 'fib' && typeof ans === 'string' && ans.trim().toLowerCase() === (q.answer as string)?.toLowerCase()) score += q.marks || 1
    else if (q.type === 'msq') {
      if (Array.isArray(q.answer) && Array.isArray(ans)) {
        const correct = JSON.stringify((q.answer as number[]).sort()) === JSON.stringify(([...ans]).sort())
        if (correct) score += q.marks || 1
      }
    }
    else if (q.type === 'match') {
      const pairs = q.answer as { left: string; right: string }[]
      if (Array.isArray(pairs) && ans && typeof ans === 'object') {
        const allCorrect = pairs.every((p: any) => ans[p.left]?.trim().toLowerCase() === p.right.trim().toLowerCase())
        if (allCorrect) score += q.marks || 1
      }
    }
  })

  const percent = total ? Math.round((score / total) * 100) : 0

  // Check previous best attempt for ghost scoring
  const { data: prevAttempt } = await supabase
    .from('attempts')
    .select('percent')
    .eq('student_id', userId)
    .eq('test_id', test_id)
    .order('percent', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ghostScore = prevAttempt?.percent ?? 0

  // Compute XP — use teacher-set xp_reward, scaled by percentage
  const testXPReward = test.xp_reward || 100
  const prevXPBase = prevAttempt ? Math.round(testXPReward * (prevAttempt.percent / 100)) : 0
  let baseXP = Math.round(testXPReward * (percent / 100))
  let deltaXP = Math.max(0, baseXP - prevXPBase) // Only reward improvement
  let xpEarned = is_double_xp ? deltaXP * 2 : deltaXP
  xpEarned = Math.max(0, Math.min(xpEarned, MAX_XP_PER_TEST))

  let ghostMsg = '', ghostBonus = 0
  if (ghostScore > 0) {
    if (percent > ghostScore) { ghostMsg = '★ You beat your ghost!'; ghostBonus = 50; xpEarned += 50 }
    else if (percent === ghostScore) ghostMsg = '◇ Tied your ghost'
    else ghostMsg = '◇ Ghost wins this time'
  } else {
    ghostMsg = '◉ First attempt — this becomes your ghost score!'
  }

  // Write attempt (insert, not upsert — allows multiple attempts)
  const { error: attemptErr } = await supabase.from('attempts').insert({
    student_id: userId, test_id, score, total, percent, answer_map, xp_earned: xpEarned,
    attempt_number: (attemptCount || 0) + 1,
  })
  // Fallback to upsert if attempt_number column doesn't exist yet
  if (attemptErr) {
    await supabase.from('attempts').upsert({
      student_id: userId, test_id, score, total, percent, answer_map, xp_earned: xpEarned
    }, { onConflict: 'student_id,test_id' })
  }

  // Atomic profile update using RPC to prevent XP race condition (#11)
  // Uses increment-based update to avoid read-then-write race
  const newXP = (profile.xp || 0) + xpEarned
  const bestScore = Math.max(profile.score || 0, percent)
  const ghostWinIncrement = ghostBonus > 0 ? 1 : 0
  const { error: updateErr } = await supabase.rpc('atomic_xp_update', {
    p_user_id: userId,
    p_xp_delta: xpEarned,
    p_best_score: bestScore,
    p_ghost_win_increment: ghostWinIncrement,
  })
  // Fallback to direct update if RPC doesn't exist yet
  if (updateErr) {
    // Retry with RPC; if that also fails, fall back to direct update with stale data
    const retryResult = await supabase.rpc('atomic_xp_update', {
      p_user_id: userId, p_xp_delta: xpEarned,
      p_best_score: bestScore, p_ghost_win_increment: ghostWinIncrement,
    })
    if (retryResult.error) {
      const newGhostWins = ghostBonus > 0 ? (profile.ghost_wins || 0) + 1 : (profile.ghost_wins || 0)
      await supabase.from('profiles').update({
        xp: newXP,
        score: bestScore,
        ghost_wins: newGhostWins,
      }).eq('id', userId)
    }
  }

  // Activity log (non-critical, don't block response)
  supabase.from('activity_log').insert({
    message: `Student ${profile.name} submitted test ${test_id}: ${percent}%`,
    type: 'attempt',
    actor_id: userId,
    metadata: { test_id, percent, score, total, xp_earned: xpEarned },
  }).then(null, e => console.error('Activity log insert failed:', e))

  return NextResponse.json({
    score, total, percent, xpEarned, isDoubleXP: !!is_double_xp,
    ghostMsg, ghostBonus, newXP,
    date: new Date().toISOString().slice(0, 10),
  })
}
