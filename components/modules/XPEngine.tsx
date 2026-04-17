'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import type { Profile, Attempt } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { Pagination } from '@/components/ui/Pagination'
import { PAGE_SIZE } from '@/lib/constants'
import { DEFAULT_XP_LEVELS, type XPLevel } from '@/lib/utils'

/* ╔══════════════════════════════════════════════════════╗
   ║  XP ENGINE — Immersive Gamification System           ║
   ╠══════════════════════════════════════════════════════╣
   ║  Streaks · Badges · Tier Progress · Leaderboard     ║
   ║  XP History · Quests · QGX Wrapped                  ║
   ╚══════════════════════════════════════════════════════╝ */

/* ── Tier System (derived from admin-configurable XP levels) ── */
function buildTiers(levels: XPLevel[]) {
  const sorted = [...levels].sort((a, b) => a.xp - b.xp)
  return sorted.map((l, i) => ({
    label: l.name,
    color: l.color,
    min: l.xp,
    max: i < sorted.length - 1 ? sorted[i + 1].xp - 1 : 999999,
    icon: l.icon,
    level: l.level,
  }))
}

function getTierData(xp: number, tiers: ReturnType<typeof buildTiers>) {
  const tier = [...tiers].reverse().find(t => xp >= t.min) || tiers[0]
  const idx = tiers.indexOf(tier)
  const nextTier = tiers[idx + 1]
  const progress = nextTier
    ? ((xp - tier.min) / (tier.max - tier.min + 1)) * 100
    : 100
  const xpToNext = nextTier ? tier.max + 1 - xp : 0
  return { ...tier, idx, nextTier: nextTier || null, progress: Math.min(progress, 100), xpToNext }
}

/* ── Badge System ── */
interface Badge {
  id: string
  name: string
  desc: string
  icon: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  check: (s: StudentStats) => boolean
}

interface StudentStats {
  xp: number
  ghostWins: number
  testsCompleted: number
  bestScore: number
  avgScore: number
  perfectTests: number
  streak: number
  totalStudyDays: number
  forumPosts: number
}

const BADGE_COLORS = {
  bronze:   { bg: 'rgba(205,127,50,.12)',  border: '#cd7f32', text: '#cd7f32' },
  silver:   { bg: 'rgba(192,192,192,.12)', border: '#c0c0c0', text: '#c0c0c0' },
  gold:     { bg: 'rgba(255,215,0,.12)',   border: '#ffd700', text: '#ffd700' },
  platinum: { bg: 'rgba(139,92,246,.12)',  border: '#8b5cf6', text: '#8b5cf6' },
}

const BADGES: Badge[] = [
  // XP milestones
  { id: 'xp_100',    name: 'First Steps',      desc: 'Earn 100 XP',            icon: '◇', tier: 'bronze',   check: s => s.xp >= 100 },
  { id: 'xp_500',    name: 'Rising Star',       desc: 'Earn 500 XP',            icon: '★', tier: 'bronze',   check: s => s.xp >= 500 },
  { id: 'xp_1000',   name: 'Scholar',           desc: 'Earn 1,000 XP',          icon: '▪', tier: 'silver',   check: s => s.xp >= 1000 },
  { id: 'xp_2500',   name: 'Knowledge Seeker',  desc: 'Earn 2,500 XP',          icon: '◈', tier: 'gold',     check: s => s.xp >= 2500 },
  { id: 'xp_5000',   name: 'XP Master',         desc: 'Earn 5,000 XP',          icon: '★', tier: 'platinum', check: s => s.xp >= 5000 },

  // Test milestones
  { id: 'test_1',    name: 'First Test',        desc: 'Complete your first test', icon: '▫', tier: 'bronze',   check: s => s.testsCompleted >= 1 },
  { id: 'test_10',   name: 'Regular',           desc: 'Complete 10 tests',       icon: '▫', tier: 'silver',   check: s => s.testsCompleted >= 10 },
  { id: 'test_25',   name: 'Dedicated',         desc: 'Complete 25 tests',       icon: '▪', tier: 'gold',     check: s => s.testsCompleted >= 25 },
  { id: 'test_50',   name: 'Test Machine',      desc: 'Complete 50 tests',       icon: '◈', tier: 'platinum', check: s => s.testsCompleted >= 50 },

  // Score achievements
  { id: 'score_80',  name: 'High Scorer',       desc: 'Score 80%+ on a test',   icon: '◉', tier: 'bronze',   check: s => s.bestScore >= 80 },
  { id: 'score_90',  name: 'Sharp Mind',        desc: 'Score 90%+ on a test',   icon: '◈', tier: 'silver',   check: s => s.bestScore >= 90 },
  { id: 'score_100', name: 'Perfectionist',     desc: 'Score 100% on a test',   icon: '★', tier: 'gold',     check: s => s.bestScore >= 100 },
  { id: 'perfect_5', name: 'Flawless',          desc: 'Get 5 perfect scores',   icon: '★', tier: 'platinum', check: s => s.perfectTests >= 5 },

  // Ghost victories
  { id: 'ghost_1',   name: 'Ghost Buster',      desc: 'Beat your ghost once',    icon: '◇', tier: 'bronze',   check: s => s.ghostWins >= 1 },
  { id: 'ghost_5',   name: 'Ghost Hunter',      desc: 'Beat your ghost 5 times', icon: '◈', tier: 'silver',   check: s => s.ghostWins >= 5 },
  { id: 'ghost_15',  name: 'Ghost Slayer',      desc: 'Beat your ghost 15 times',icon: '◆', tier: 'gold',     check: s => s.ghostWins >= 15 },

  // Streak badges
  { id: 'streak_3',  name: 'On a Roll',         desc: '3-day streak',            icon: '◆', tier: 'bronze',   check: s => s.streak >= 3 },
  { id: 'streak_7',  name: 'Week Warrior',      desc: '7-day streak',            icon: '◈', tier: 'silver',   check: s => s.streak >= 7 },
  { id: 'streak_14', name: 'Unstoppable',       desc: '14-day streak',           icon: '◆', tier: 'gold',     check: s => s.streak >= 14 },
  { id: 'streak_30', name: 'Legendary Grind',   desc: '30-day streak',           icon: '★', tier: 'platinum', check: s => s.streak >= 30 },

  // Consistency
  { id: 'avg_80',    name: 'Consistent',        desc: '80%+ average score',      icon: '▪', tier: 'silver',   check: s => s.avgScore >= 80 && s.testsCompleted >= 5 },
  { id: 'avg_90',    name: 'Elite Student',      desc: '90%+ average score',      icon: '◇', tier: 'gold',     check: s => s.avgScore >= 90 && s.testsCompleted >= 5 },

  // Forum participation
  { id: 'forum_1',   name: 'Speaker',           desc: 'Create a forum post',     icon: '◇', tier: 'bronze',   check: s => s.forumPosts >= 1 },
  { id: 'forum_10',  name: 'Contributor',       desc: 'Create 10 forum posts',   icon: '◈', tier: 'silver',   check: s => s.forumPosts >= 10 },
  { id: 'forum_25',  name: 'Community Voice',   desc: 'Create 25 forum posts',   icon: '◆', tier: 'gold',     check: s => s.forumPosts >= 25 },

  // Study days
  { id: 'days_7',    name: 'Regular Learner',   desc: 'Study on 7 different days',  icon: '▫', tier: 'bronze',  check: s => s.totalStudyDays >= 7 },
  { id: 'days_30',   name: 'Month Scholar',     desc: 'Study on 30 different days', icon: '▫', tier: 'silver',  check: s => s.totalStudyDays >= 30 },
  { id: 'days_100',  name: 'Centurion',         desc: 'Study on 100 different days',icon: '★', tier: 'platinum',check: s => s.totalStudyDays >= 100 },

  // Combo badges
  { id: 'combo_all', name: 'Completionist',     desc: 'Earn 20+ badges',         icon: '★', tier: 'platinum', check: s => s.xp >= 2500 && s.testsCompleted >= 25 && s.streak >= 7 && s.ghostWins >= 5 },
]

/* ── Daily Quests ── */
interface Quest {
  id: string
  name: string
  desc: string
  icon: string
  xpReward: number
  check: (todayAttempts: Attempt[]) => boolean
}

function getTodayQuests(seed: number): Quest[] {
  const ALL_QUESTS: Quest[] = [
    { id: 'q_test_any',    name: 'Take a Test',       desc: 'Complete any test today',                 icon: '▫', xpReward: 25,  check: (a) => a.length >= 1 },
    { id: 'q_score_70',    name: 'Pass with 70%+',    desc: 'Score 70%+ on any test today',            icon: '◉', xpReward: 35,  check: (a) => a.some(at => at.percent >= 70) },
    { id: 'q_score_90',    name: 'Ace It',             desc: 'Score 90%+ on any test today',            icon: '★', xpReward: 50,  check: (a) => a.some(at => at.percent >= 90) },
    { id: 'q_test_2',      name: 'Double Down',        desc: 'Complete 2 tests today',                  icon: '◇', xpReward: 40,  check: (a) => a.length >= 2 },
    { id: 'q_perfect',     name: 'Perfect Run',        desc: 'Score 100% on any test today',            icon: '★', xpReward: 75,  check: (a) => a.some(at => at.percent === 100) },
    { id: 'q_beat_ghost',  name: 'Ghost Buster',       desc: 'Beat your ghost score on any test today', icon: '◇', xpReward: 50,  check: () => false /* tracked server-side */ },
    { id: 'q_improve',     name: 'Self Improver',      desc: 'Improve a previous test score today',     icon: '▪', xpReward: 30,  check: () => false /* tracked server-side */ },
  ]
  // Pick 3 quests deterministically based on date seed
  const shuffled = ALL_QUESTS.map((q, i) => ({ q, s: (seed * (i + 7) * 31) % 100 }))
    .sort((a, b) => a.s - b.s)
  return shuffled.slice(0, 3).map(x => x.q)
}

/* ── Streak Calculator ── */
function calcStreak(attempts: Attempt[]): { current: number; best: number; activeDays: Set<string> } {
  if (!attempts.length) return { current: 0, best: 0, activeDays: new Set() }

  const days = new Set<string>()
  attempts.forEach(a => {
    if (a.submitted_at) days.add(a.submitted_at.slice(0, 10))
  })

  const sorted = Array.from(days).sort().reverse()
  const today = new Date().toISOString().slice(0, 10)

  let current = 0
  let check = today
  // Allow "today" or "yesterday" as start
  if (sorted[0] === today || sorted[0] === getYesterday()) {
    check = sorted[0]
    for (const day of sorted) {
      if (day === check) { current++; check = getPrevDay(check) }
      else if (day < check) break
    }
  }

  // Best streak
  let best = 0, run = 0, prev = ''
  for (const day of Array.from(days).sort()) {
    if (prev && isConsecutive(prev, day)) run++
    else run = 1
    best = Math.max(best, run)
    prev = day
  }

  return { current, best, activeDays: days }
}

function getYesterday(): string {
  const d = new Date(); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
function getPrevDay(s: string): string {
  const d = new Date(s); d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}
function isConsecutive(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b)
  return Math.abs(db.getTime() - da.getTime()) <= 86400000
}

/* ── XP History ── */
function buildXPHistory(attempts: Attempt[]): { date: string; xp: number; cumulative: number }[] {
  const byDate = new Map<string, number>()
  attempts.forEach(a => {
    const day = a.submitted_at ? a.submitted_at.slice(0, 10) : 'unknown'
    const xp = (a as any).xp_earned ?? Math.round((a.percent || 0) * 0.5)
    byDate.set(day, (byDate.get(day) || 0) + xp)
  })
  const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  let cum = 0
  return sorted.map(([date, xp]) => { cum += xp; return { date, xp, cumulative: cum } })
}

/* ── Activity Heatmap ── */
function buildHeatmap(attempts: Attempt[]): Map<string, number> {
  const map = new Map<string, number>()
  attempts.forEach(a => {
    const day = a.submitted_at ? a.submitted_at.slice(0, 10) : ''
    if (day) map.set(day, (map.get(day) || 0) + 1)
  })
  return map
}

function getHeatColor(count: number): string {
  if (count === 0) return 'rgba(255,255,255,.03)'
  if (count === 1) return 'rgba(139,92,246,.2)'
  if (count === 2) return 'rgba(139,92,246,.4)'
  if (count <= 4)  return 'rgba(139,92,246,.6)'
  return 'rgba(139,92,246,.85)'
}

/* ── Types ── */
type XPTab = 'overview' | 'badges' | 'leaderboard' | 'quests' | 'wrapped'

interface XPEngineProps {
  profile: Profile
  attempts: Attempt[]
  allStudents: Profile[]
  tests: { id: string; title: string }[]
  doubleXP: { active: boolean; ends_at: number | null }
  onProfileUpdate: (p: Profile) => void
  xpLevels?: XPLevel[]
}

/* ══════════════════════════════════════════════════════════
   ██  MAIN COMPONENT
   ══════════════════════════════════════════════════════════ */

export function XPEngine({ profile, attempts, allStudents, tests, doubleXP, onProfileUpdate, xpLevels }: XPEngineProps) {
  const { toast } = useToast()
  const [tab, setTab] = useState<XPTab>('overview')
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'earned' | 'locked'>('all')
  const [leaderboardView, setLeaderboardView] = useState<'xp' | 'ghost' | 'score'>('xp')
  const [lbPage, setLbPage] = useState(0)
  const [forumCount, setForumCount] = useState(0)
  const [showBadgeDetail, setShowBadgeDetail] = useState<Badge | null>(null)
  const [showLevelUp, setShowLevelUp] = useState<{ from: ReturnType<typeof buildTiers>[number]; to: ReturnType<typeof buildTiers>[number] } | null>(null)
  const [dailyLoginClaimed, setDailyLoginClaimed] = useState(false)
  const [claimingLogin, setClaimingLogin] = useState(false)
  const prevTierRef = useRef<number>(-1)
  const prevBadgesRef = useRef<string[]>([])
  const [liveDoubleXP, setLiveDoubleXP] = useState(doubleXP)

  const TIERS = useMemo(() => buildTiers(xpLevels && xpLevels.length >= 2 ? xpLevels : DEFAULT_XP_LEVELS), [xpLevels])

  // Sync doubleXP prop
  useEffect(() => { setLiveDoubleXP(doubleXP) }, [doubleXP])

  // Auto-expire double XP when timer runs out
  useEffect(() => {
    if (!liveDoubleXP.active || !liveDoubleXP.ends_at) return
    const remaining = liveDoubleXP.ends_at - Date.now()
    if (remaining <= 0) { setLiveDoubleXP({ active: false, ends_at: null }); return }
    const timer = setTimeout(() => {
      setLiveDoubleXP({ active: false, ends_at: null })
      toast('Double XP event has ended', 'info')
    }, remaining)
    return () => clearTimeout(timer)
  }, [liveDoubleXP, toast])

  // Fetch forum post count
  useEffect(() => {
    supabase.from('forum_posts').select('id', { count: 'exact', head: true })
      .eq('author_id', profile.id)
      .then(({ count, error }) => {
        if (error) { toast('Failed to load forum activity', 'error'); return }
        setForumCount(count || 0)
      })
  }, [profile.id, toast])

  // Check daily login claim status
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    supabase
      .from('daily_xp_claims')
      .select('student_id')
      .eq('student_id', profile.id)
      .eq('claim_date', todayStr)
      .maybeSingle()
      .then(({ data }) => setDailyLoginClaimed(!!data))
  }, [profile.id])

  /* ── Computed stats ── */
  const streak = useMemo(() => calcStreak(attempts), [attempts])
  const xpHistory = useMemo(() => buildXPHistory(attempts), [attempts])
  const heatmap = useMemo(() => buildHeatmap(attempts), [attempts])

  const tierData = getTierData(profile.xp || 0, TIERS)

  const stats: StudentStats = useMemo(() => {
    const scores = attempts.map(a => a.percent || 0)
    return {
      xp: profile.xp || 0,
      ghostWins: profile.ghost_wins || 0,
      testsCompleted: attempts.length,
      bestScore: scores.length ? Math.max(...scores) : 0,
      avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      perfectTests: scores.filter(s => s === 100).length,
      streak: streak.current,
      totalStudyDays: streak.activeDays.size,
      forumPosts: forumCount,
    }
  }, [profile, attempts, streak, forumCount])

  const earnedBadges = useMemo(() => BADGES.filter(b => b.check(stats)), [stats])
  const lockedBadges = useMemo(() => BADGES.filter(b => !b.check(stats)), [stats])

  // --- Badge Persistence & Unlock Notifications ---
  useEffect(() => {
    const earnedIds = earnedBadges.map(b => b.id)
    const savedBadges = profile.badges || []
    const newBadges = earnedIds.filter(id => !savedBadges.includes(id))

    // Detect newly earned badges (skip on first render)
    if (prevBadgesRef.current.length > 0 && newBadges.length > 0) {
      newBadges.forEach(id => {
        const badge = BADGES.find(b => b.id === id)
        if (badge) toast(`${badge.icon} Badge Unlocked: ${badge.name}!`, 'success')
      })
    }
    prevBadgesRef.current = earnedIds

    // Persist to DB if badges changed
    if (newBadges.length > 0 && earnedIds.length > savedBadges.length) {
      supabase.from('profiles').update({ badges: earnedIds }).eq('id', profile.id)
        .then(() => onProfileUpdate({ ...profile, badges: earnedIds }))
    }
  }, [earnedBadges, onProfileUpdate, profile, toast])

  // --- Level-Up Detection ---
  useEffect(() => {
    const currentIdx = tierData.idx
    if (prevTierRef.current >= 0 && currentIdx > prevTierRef.current) {
      const fromTier = TIERS[prevTierRef.current]
      const toTier = TIERS[currentIdx]
      setShowLevelUp({ from: fromTier, to: toTier })
      toast(`${toTier.icon} TIER UP! You reached ${toTier.label}!`, 'success')
    }
    prevTierRef.current = currentIdx
  }, [tierData.idx, TIERS, toast])

  // --- Daily Login XP Claim ---
  const claimDailyLogin = async () => {
    if (dailyLoginClaimed || claimingLogin) return
    setClaimingLogin(true)
    const todayKey = new Date().toISOString().slice(0, 10)
    const loginXP = 10 + Math.min(streak.current * 2, 40) // 10 base + 2 per streak day (max 50)
    try {
      const { data, error } = await supabase.rpc('claim_daily_login_xp', {
        p_user_id: profile.id,
        p_claim_date: todayKey,
        p_xp_delta: loginXP,
      })
      if (error) throw error
      const result = data as { claimed?: boolean; xp?: number } | null
      if (!result?.claimed) {
        setDailyLoginClaimed(true)
        toast('Daily login bonus already claimed for today.', 'info')
        setClaimingLogin(false)
        return
      }
      setDailyLoginClaimed(true)
      const newXP = result?.xp ?? ((profile.xp || 0) + loginXP)
      onProfileUpdate({ ...profile, xp: newXP })
      toast(`◈ +${loginXP} XP — Daily login bonus! ${streak.current > 0 ? `(${streak.current}-day streak bonus!)` : ''}`, 'success')
    } catch {
      // RPC not available — fall back to atomic_xp_update, then direct update
      try {
        const { error: rpcErr } = await supabase.rpc('atomic_xp_update', {
          p_user_id: profile.id, p_xp_delta: loginXP,
          p_best_score: profile.score || 0, p_ghost_win_increment: 0,
        })
        if (rpcErr) throw rpcErr
        setDailyLoginClaimed(true)
        onProfileUpdate({ ...profile, xp: (profile.xp || 0) + loginXP })
        toast(`◈ +${loginXP} XP — Daily login bonus!${streak.current > 0 ? ` (${streak.current}-day streak bonus!)` : ''}`, 'success')
      } catch {
        // Final fallback: direct profile update
        const newXP = (profile.xp || 0) + loginXP
        const { error: directErr } = await supabase.from('profiles').update({ xp: newXP }).eq('id', profile.id)
        if (!directErr) {
          setDailyLoginClaimed(true)
          onProfileUpdate({ ...profile, xp: newXP })
          toast(`◈ +${loginXP} XP — Daily login bonus!${streak.current > 0 ? ` (${streak.current}-day streak bonus!)` : ''}`, 'success')
        } else {
          toast('Could not claim daily login bonus right now.', 'error')
        }
      }
    }
    setClaimingLogin(false)
  }

  const sortedLeaderboard = useMemo(() =>
    [...allStudents].sort((a, b) => {
      if (leaderboardView === 'xp') return (b.xp || 0) - (a.xp || 0)
      if (leaderboardView === 'score') return (b.score || 0) - (a.score || 0)
      return (b.ghost_wins || 0) - (a.ghost_wins || 0)
    }), [allStudents, leaderboardView])

  // Today's attempts for daily quest completion checks
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayAttempts = useMemo(() =>
    attempts.filter(a => a.submitted_at?.slice(0, 10) === todayStr), [attempts, todayStr])

  const rank = sortedLeaderboard.findIndex(s => s.id === profile.id) + 1

  // Daily quests
  const today = new Date()
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  const quests = getTodayQuests(seed)

  // Heatmap: last 12 weeks (84 days)
  const heatmapDays = useMemo(() => {
    const days: { date: string; count: number; dayOfWeek: number }[] = []
    for (let i = 83; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days.push({ date: key, count: heatmap.get(key) || 0, dayOfWeek: d.getDay() })
    }
    return days
  }, [heatmap])

  // XP spark chart (last 14 days)
  const sparkData = useMemo(() => {
    const days: number[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      const dayAttempts = attempts.filter(a => a.submitted_at && a.submitted_at.slice(0, 10) === key)
      days.push(dayAttempts.reduce((sum, a) => sum + Math.round((a.percent || 0) * 0.5), 0))
    }
    return days
  }, [attempts])

  const sparkMax = Math.max(...sparkData, 1)

  /* ── Copy wrapped ── */
  const copyWrapped = () => {
    const text = `QGX Wrapped ${new Date().getFullYear()} | ${profile.name} | ${profile.qgx_id}
━━━━━━━━━━━━━━━━━━━━━━
★ Tier: ${tierData.icon} ${tierData.label}
◈ XP: ${profile.xp} | Rank: #${rank}
▪ Best Score: ${stats.bestScore}% | Avg: ${stats.avgScore}%
▫ Tests: ${attempts.length}/${tests.length} | Perfect: ${stats.perfectTests}
◇ Ghost Wins: ${profile.ghost_wins || 0}
◆ Streak: ${streak.current} days (Best: ${streak.best})
◆ Badges: ${earnedBadges.length}/${BADGES.length}
━━━━━━━━━━━━━━━━━━━━━━`
    navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success'))
  }

  /* ══════════════════════════════════════
     RENDER
     ══════════════════════════════════════ */

  return (
    <div className="xp-engine">
      {/* ── Double XP Banner ── */}
      {liveDoubleXP.active && liveDoubleXP.ends_at && Date.now() < liveDoubleXP.ends_at && (
        <div className="xp-double-banner fade-up">
          <Icon name="zap" size={14} /> DOUBLE XP ACTIVE — Earn 2× XP on all tests!
          <span className="xp-double-timer">
            {Math.max(0, Math.round((liveDoubleXP.ends_at - Date.now()) / 60000))}m left
          </span>
        </div>
      )}

      {/* ── Level Up Celebration Modal ── */}
      {showLevelUp && (
        <div className="xp-levelup-overlay" onClick={() => setShowLevelUp(null)}>
          <div className="xp-levelup-card" onClick={e => e.stopPropagation()}>
            <div className="xp-levelup-particles">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="xp-particle" style={{
                  left: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${1.5 + Math.random() * 2}s`,
                }} />
              ))}
            </div>
            <div className="xp-levelup-icon" style={{ fontSize: 64 }}>{showLevelUp.to.icon}</div>
            <div className="xp-levelup-title" style={{ color: showLevelUp.to.color }}>TIER UP!</div>
            <div className="xp-levelup-from">{showLevelUp.from.icon} {showLevelUp.from.label}</div>
            <div className="xp-levelup-arrow">→</div>
            <div className="xp-levelup-to" style={{ color: showLevelUp.to.color }}>{showLevelUp.to.icon} {showLevelUp.to.label}</div>
            <div className="xp-levelup-msg">You have ascended to a new rank!</div>
            <button className="btn btn-primary" onClick={() => setShowLevelUp(null)} style={{ marginTop: 16 }}>Awesome!</button>
          </div>
        </div>
      )}

      {/* ── Daily Login Reward ── */}
      {!dailyLoginClaimed && (
        <div className="xp-daily-login fade-up">
          <div className="xp-daily-icon">◇</div>
          <div className="xp-daily-info">
            <div className="xp-daily-title">Daily Login Bonus</div>
            <div className="xp-daily-desc">+{10 + Math.min(streak.current * 2, 40)} XP {streak.current > 0 ? `(${streak.current}-day streak bonus!)` : ''}</div>
          </div>
          <button className="btn btn-primary btn-sm xp-daily-btn" onClick={claimDailyLogin} disabled={claimingLogin}>
            {claimingLogin ? 'Claiming...' : '◈ Claim'}
          </button>
        </div>
      )}

      {/* ── Tier Hero ── */}
      <div className="xp-hero fade-up">
        <div className="xp-hero-glow" style={{ background: `radial-gradient(circle, ${tierData.color}15 0%, transparent 70%)` }} />
        <div className="xp-hero-inner">
          <div className="xp-hero-icon">{tierData.icon}</div>
          <div className="xp-hero-tier" style={{ color: tierData.color }}>{tierData.label}</div>
          <div className="xp-hero-xp">{(profile.xp || 0).toLocaleString()} XP</div>
          <div className="xp-hero-rank">Rank #{rank} of {allStudents.length}</div>

          {/* Progress bar */}
          <div className="xp-progress-wrap">
            <div className="xp-progress-bar">
              <div className="xp-progress-fill" style={{ width: `${tierData.progress}%`, background: tierData.color }} />
            </div>
            <div className="xp-progress-labels">
              <span>{tierData.label}</span>
              {tierData.nextTier && <span>{tierData.xpToNext} XP to {tierData.nextTier.icon} {tierData.nextTier.label}</span>}
              {!tierData.nextTier && <span>MAX TIER</span>}
            </div>
          </div>

          {/* Spark chart */}
          <div className="xp-spark">
            <div className="xp-spark-label">Last 14 days</div>
            <div className="xp-spark-bars">
              {sparkData.map((v, i) => (
                <div key={i} className="xp-spark-col">
                  <div className="xp-spark-bar" style={{
                    height: `${Math.max((v / sparkMax) * 100, 2)}%`,
                    background: v > 0 ? tierData.color : 'var(--border)',
                    opacity: v > 0 ? 0.8 : 0.3,
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="xp-quick-stats fade-up-1">
        <div className="xp-qs">
          <div className="xp-qs-icon">◆</div>
          <div className="xp-qs-val">{streak.current}</div>
          <div className="xp-qs-label">Day Streak</div>
        </div>
        <div className="xp-qs">
          <div className="xp-qs-icon">▫</div>
          <div className="xp-qs-val">{attempts.length}</div>
          <div className="xp-qs-label">Tests Done</div>
        </div>
        <div className="xp-qs">
          <div className="xp-qs-icon">◇</div>
          <div className="xp-qs-val">{profile.ghost_wins || 0}</div>
          <div className="xp-qs-label">Ghost Wins</div>
        </div>
        <div className="xp-qs">
          <div className="xp-qs-icon">◆</div>
          <div className="xp-qs-val">{earnedBadges.length}/{BADGES.length}</div>
          <div className="xp-qs-label">Badges</div>
        </div>
        <div className="xp-qs">
          <div className="xp-qs-icon">▪</div>
          <div className="xp-qs-val">{stats.avgScore}%</div>
          <div className="xp-qs-label">Avg Score</div>
        </div>
      </div>

      {/* ── Tab Navigation ── */}
      <div className="xp-tabs fade-up-1">
        {([
          ['overview',     '◈', 'Overview'],
          ['badges',       '◆', 'Badges'],
          ['leaderboard',  '★', 'Leaderboard'],
          ['quests',       '◆', 'Quests'],
          ['wrapped',      '★', 'Wrapped'],
        ] as [XPTab, string, string][]).map(([id, icon, label]) => (
          <button key={id} className={`xp-tab ${tab === id ? 'xp-tab-active' : ''}`}
            onClick={() => setTab(id)}>
            <span className="xp-tab-icon">{icon}</span>
            <span className="xp-tab-label">{label}</span>
          </button>
        ))}
      </div>

      {/* ═══════ OVERVIEW TAB ═══════ */}
      {tab === 'overview' && (
        <div className="fade-up-2">
          {/* Activity Heatmap */}
          <div className="xp-section">
            <div className="xp-section-title">Activity Heatmap</div>
            <div className="xp-section-subtitle">Last 12 weeks</div>
            <div className="xp-heatmap">
              {heatmapDays.map((d, i) => (
                <div key={i} className="xp-heat-cell" style={{ background: getHeatColor(d.count) }}
                  title={`${d.date}: ${d.count} test${d.count !== 1 ? 's' : ''}`} />
              ))}
            </div>
            <div className="xp-heatmap-legend">
              <span>Less</span>
              {[0, 1, 2, 3, 5].map(n => (
                <div key={n} className="xp-heat-cell-sm" style={{ background: getHeatColor(n) }} />
              ))}
              <span>More</span>
            </div>
          </div>

          {/* Streak Info */}
          <div className="xp-section">
            <div className="xp-section-title">Streak</div>
            <div className="xp-streak-row">
              <div className="xp-streak-card">
                <div className="xp-streak-fire">{streak.current > 0 ? '◆' : '◇'}</div>
                <div className="xp-streak-num">{streak.current}</div>
                <div className="xp-streak-lbl">Current</div>
              </div>
              <div className="xp-streak-card">
                <div className="xp-streak-fire">★</div>
                <div className="xp-streak-num">{streak.best}</div>
                <div className="xp-streak-lbl">Best</div>
              </div>
              <div className="xp-streak-card">
                <div className="xp-streak-fire">▫</div>
                <div className="xp-streak-num">{streak.activeDays.size}</div>
                <div className="xp-streak-lbl">Active Days</div>
              </div>
            </div>
          </div>

          {/* XP Timeline */}
          {xpHistory.length > 0 && (
            <div className="xp-section">
              <div className="xp-section-title">XP Over Time</div>
              <div className="xp-chart">
                {xpHistory.map((h, i) => {
                  const maxXP = Math.max(...xpHistory.map(x => x.xp), 1)
                  return (
                    <div key={i} className="xp-chart-col" title={`${h.date}: +${h.xp} XP (Total: ${h.cumulative})`}>
                      <div className="xp-chart-bar" style={{
                        height: `${(h.xp / maxXP) * 100}%`,
                        background: tierData.color
                      }} />
                      <div className="xp-chart-date">{h.date.slice(5)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent badges */}
          {earnedBadges.length > 0 && (
            <div className="xp-section">
              <div className="xp-section-title">Recent Badges</div>
              <div className="xp-badge-grid">
                {earnedBadges.slice(-6).map(b => (
                  <div key={b.id} className="xp-badge-card xp-badge-earned"
                    style={{ background: BADGE_COLORS[b.tier].bg, borderColor: BADGE_COLORS[b.tier].border }}
                    onClick={() => setShowBadgeDetail(b)}>
                    <div className="xp-badge-icon">{b.icon}</div>
                    <div className="xp-badge-name" style={{ color: BADGE_COLORS[b.tier].text }}>{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tier progression roadmap */}
          <div className="xp-section">
            <div className="xp-section-title">Tier Roadmap</div>
            <div className="xp-roadmap">
              {TIERS.map((t, i) => {
                const reached = (profile.xp || 0) >= t.min
                const current = tierData.idx === i
                return (
                  <div key={t.label} className={`xp-road-node ${reached ? 'xp-road-reached' : ''} ${current ? 'xp-road-current' : ''}`}>
                    <div className="xp-road-icon" style={reached ? { borderColor: t.color } : {}}>{t.icon}</div>
                    <div className="xp-road-name" style={reached ? { color: t.color } : {}}>{t.label}</div>
                    <div className="xp-road-xp">{t.min.toLocaleString()}</div>
                    {i < TIERS.length - 1 && (
                      <div className="xp-road-line" style={reached ? { background: t.color } : {}} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ BADGES TAB ═══════ */}
      {tab === 'badges' && (
        <div className="fade-up-2">
          {/* Badge detail popup */}
          {showBadgeDetail && (
            <div className="xp-badge-detail" onClick={() => setShowBadgeDetail(null)}>
              <div className="xp-badge-detail-card" onClick={e => e.stopPropagation()}
                style={{ borderColor: BADGE_COLORS[showBadgeDetail.tier].border }}>
                <button className="xp-badge-close" onClick={() => setShowBadgeDetail(null)}>×</button>
                <div style={{ fontSize: 48, marginBottom: 12 }}>{showBadgeDetail.icon}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: BADGE_COLORS[showBadgeDetail.tier].text, marginBottom: 4 }}>
                  {showBadgeDetail.name}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
                  {showBadgeDetail.tier}
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 16 }}>{showBadgeDetail.desc}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: showBadgeDetail.check(stats) ? 'var(--success)' : 'var(--danger)' }}>
                  {showBadgeDetail.check(stats) ? '✓ EARNED' : '■ LOCKED'}
                </div>
              </div>
            </div>
          )}

          <div className="xp-badge-stats">
            <div className="xp-badge-stat">
              <div className="xp-badge-stat-val">{earnedBadges.length}</div>
              <div className="xp-badge-stat-lbl">Earned</div>
            </div>
            <div className="xp-badge-stat">
              <div className="xp-badge-stat-val">{lockedBadges.length}</div>
              <div className="xp-badge-stat-lbl">Locked</div>
            </div>
            <div className="xp-badge-stat">
              <div className="xp-badge-stat-val">{Math.round((earnedBadges.length / BADGES.length) * 100)}%</div>
              <div className="xp-badge-stat-lbl">Complete</div>
            </div>
          </div>

          <div className="xp-badge-filters">
            {(['all', 'earned', 'locked'] as const).map(f => (
              <button key={f} className={`xp-bf ${badgeFilter === f ? 'xp-bf-active' : ''}`}
                onClick={() => setBadgeFilter(f)}>
                {f === 'all' ? `All (${BADGES.length})` : f === 'earned' ? `Earned (${earnedBadges.length})` : `Locked (${lockedBadges.length})`}
              </button>
            ))}
          </div>

          <div className="xp-badge-grid xp-badge-grid-full">
            {(badgeFilter === 'all' ? BADGES : badgeFilter === 'earned' ? earnedBadges : lockedBadges).map(b => {
              const earned = b.check(stats)
              return (
                <div key={b.id} className={`xp-badge-card ${earned ? 'xp-badge-earned' : 'xp-badge-locked'}`}
                  style={earned ? { background: BADGE_COLORS[b.tier].bg, borderColor: BADGE_COLORS[b.tier].border } : {}}
                  onClick={() => setShowBadgeDetail(b)}>
                  <div className={`xp-badge-icon ${!earned ? 'xp-badge-icon-locked' : ''}`}>{b.icon}</div>
                  <div className="xp-badge-name" style={earned ? { color: BADGE_COLORS[b.tier].text } : {}}>{b.name}</div>
                  <div className="xp-badge-desc">{b.desc}</div>
                  <div className="xp-badge-tier-tag" style={earned ? { color: BADGE_COLORS[b.tier].text, borderColor: BADGE_COLORS[b.tier].border } : {}}>
                    {earned ? '✓' : '■'} {b.tier}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══════ LEADERBOARD TAB ═══════ */}
      {tab === 'leaderboard' && (
        <div className="fade-up-2">
          {/* Top 3 podium */}
          {sortedLeaderboard.length >= 3 && (
            <div className="xp-podium">
              {[1, 0, 2].map(pos => {
                const s = sortedLeaderboard[pos]
                if (!s) return null
                const t = getTierData(s.xp || 0, TIERS)
                return (
                  <div key={s.id} className={`xp-podium-place xp-podium-${pos + 1}`}>
                    <div className="xp-podium-avatar">{s.avatar}</div>
                    <div className="xp-podium-rank">{['①', '②', '③'][pos]}</div>
                    <div className="xp-podium-name">{s.name}</div>
                    <div className="xp-podium-xp" style={{ color: t.color }}>
                      {leaderboardView === 'xp' ? `${s.xp || 0} XP` :
                       leaderboardView === 'score' ? `${s.score || 0}%` :
                       `${s.ghost_wins || 0} Wins`}
                    </div>
                    <div className="xp-podium-tier">{t.icon} {t.label}</div>
                    <div className="xp-podium-bar" style={{ height: pos === 0 ? 100 : pos === 1 ? 70 : 50 }} />
                  </div>
                )
              })}
            </div>
          )}

          <div className="xp-lb-controls">
            {(['xp', 'score', 'ghost'] as const).map(v => (
              <button key={v} className={`xp-bf ${leaderboardView === v ? 'xp-bf-active' : ''}`}
                onClick={() => setLeaderboardView(v)}>
                {v === 'xp' ? '◈ XP' : v === 'score' ? '▪ Score' : '◇ Ghost Wins'}
              </button>
            ))}
          </div>

          <div className="xp-lb-list">
            {sortedLeaderboard.slice(lbPage * PAGE_SIZE, (lbPage + 1) * PAGE_SIZE).map((s, idx) => {
              const i = lbPage * PAGE_SIZE + idx
              const t = getTierData(s.xp || 0, TIERS)
              const isMe = s.id === profile.id
              return (
                <div key={s.id} className={`xp-lb-row ${isMe ? 'xp-lb-me' : ''}`}>
                  <div className="xp-lb-rank" style={i < 3 ? { color: ['#ffd700', '#c0c0c0', '#cd7f32'][i] } : {}}>
                    {i < 3 ? ['①', '②', '③'][i] : `#${i + 1}`}
                  </div>
                  <div className="xp-lb-avatar">{s.avatar}</div>
                  <div className="xp-lb-info">
                    <div className="xp-lb-name">
                      {s.name}
                      {isMe && <span className="xp-lb-you">YOU</span>}
                    </div>
                    <div className="xp-lb-tier" style={{ color: t.color }}>{t.icon} {t.label} · {s.qgx_id}</div>
                  </div>
                  <div className="xp-lb-val" style={{ color: t.color }}>
                    {leaderboardView === 'xp' ? (s.xp || 0).toLocaleString() :
                     leaderboardView === 'score' ? `${s.score || 0}%` :
                     (s.ghost_wins || 0)}
                    <div className="xp-lb-val-label">
                      {leaderboardView === 'xp' ? 'XP' : leaderboardView === 'score' ? 'BEST' : 'WINS'}
                    </div>
                  </div>
                </div>
              )
            })}
            <Pagination page={lbPage} totalPages={Math.ceil(sortedLeaderboard.length / PAGE_SIZE)} onPageChange={setLbPage} />
          </div>
        </div>
      )}

      {/* ═══════ QUESTS TAB ═══════ */}
      {tab === 'quests' && (
        <div className="fade-up-2">
          <div className="xp-section">
            <div className="xp-section-title">Daily Quests</div>
            <div className="xp-section-subtitle">Complete quests for bonus XP — refreshes daily</div>
            <div className="xp-quest-list">
              {quests.map(q => {
                const done = q.check(todayAttempts)
                return (
                  <div key={q.id} className={`xp-quest-card ${done ? 'xp-quest-done' : ''}`}>
                    <div className="xp-quest-icon">{q.icon}</div>
                    <div className="xp-quest-info">
                      <div className="xp-quest-name">{q.name}</div>
                      <div className="xp-quest-desc">{q.desc}</div>
                    </div>
                    <div className={`xp-quest-reward ${done ? 'xp-quest-complete' : ''}`}>
                      {done ? '✓' : `+${q.xpReward} XP`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Milestone quests (always visible) */}
          <div className="xp-section">
            <div className="xp-section-title">Milestone Quests</div>
            <div className="xp-quest-list">
              {[
                { name: 'Reach Scholar Tier', desc: 'Earn 501 XP total', reward: 100, done: (profile.xp || 0) >= 501, icon: '②' },
                { name: 'Reach Achiever Tier', desc: 'Earn 1,001 XP total', reward: 200, done: (profile.xp || 0) >= 1001, icon: '①' },
                { name: 'Reach Elite Tier', desc: 'Earn 2,001 XP total', reward: 300, done: (profile.xp || 0) >= 2001, icon: '◆' },
                { name: 'Reach Legend Tier', desc: 'Earn 3,501 XP total', reward: 500, done: (profile.xp || 0) >= 3501, icon: '◆' },
                { name: 'Complete 10 Tests', desc: 'Take and complete 10 tests', reward: 150, done: attempts.length >= 10, icon: '▫' },
                { name: '7-Day Streak', desc: 'Maintain a 7-day activity streak', reward: 200, done: streak.current >= 7, icon: '◈' },
                { name: 'Earn 10 Badges', desc: 'Collect 10 different badges', reward: 250, done: earnedBadges.length >= 10, icon: '◆' },
                { name: 'Perfect Score', desc: 'Get 100% on any test', reward: 100, done: stats.perfectTests > 0, icon: '★' },
              ].map((q, i) => (
                <div key={i} className={`xp-quest-card ${q.done ? 'xp-quest-done' : ''}`}>
                  <div className="xp-quest-icon">{q.icon}</div>
                  <div className="xp-quest-info">
                    <div className="xp-quest-name">{q.name}</div>
                    <div className="xp-quest-desc">{q.desc}</div>
                  </div>
                  <div className={`xp-quest-reward ${q.done ? 'xp-quest-complete' : ''}`}>
                    {q.done ? '✓' : `+${q.reward} XP`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ WRAPPED TAB ═══════ */}
      {tab === 'wrapped' && (() => {
        const consistency = tests.length ? Math.round((attempts.length / tests.length) * 100) : 0
        return (
          <div className="xp-wrapped fade-up-2">
            <div className="xp-wrapped-glow" style={{ background: `radial-gradient(ellipse at center, ${tierData.color}10 0%, transparent 60%)` }} />
            <div className="xp-wrapped-inner">
              <div className="xp-wrapped-header">QGX WRAPPED {new Date().getFullYear()}</div>
              <div className="xp-wrapped-name">{profile.name}</div>
              <div className="xp-wrapped-id">{profile.qgx_id}</div>

              <div className="xp-wrapped-tier" style={{ color: tierData.color }}>
                <span className="xp-wrapped-tier-icon">{tierData.icon}</span>
                {tierData.label}
              </div>
              <div className="xp-wrapped-tier-sub">XP TIER</div>

              <div className="xp-wrapped-grid">
                {[
                  ['Total XP',       (profile.xp || 0).toLocaleString()],
                  ['Global Rank',    `#${rank}`],
                  ['Best Score',     `${stats.bestScore}%`],
                  ['Tests Done',     `${attempts.length}`],
                  ['Avg Score',      `${stats.avgScore}%`],
                  ['Perfect Scores', `${stats.perfectTests}`],
                  ['Ghost Wins',     `${profile.ghost_wins || 0}`],
                  ['Day Streak',     `${streak.current}`],
                  ['Best Streak',    `${streak.best}`],
                  ['Active Days',    `${streak.activeDays.size}`],
                  ['Badges Earned',  `${earnedBadges.length}/${BADGES.length}`],
                  ['Consistency',    `${consistency}%`],
                ].map(([lbl, val]) => (
                  <div key={String(lbl)} className="xp-wrapped-stat">
                    <div className="xp-wrapped-val">{val}</div>
                    <div className="xp-wrapped-lbl">{lbl}</div>
                  </div>
                ))}
              </div>

              {/* Badge showcase */}
              {earnedBadges.length > 0 && (
                <div className="xp-wrapped-badges">
                  <div className="xp-wrapped-badges-title">Badges Collected</div>
                  <div className="xp-wrapped-badge-row">
                    {earnedBadges.map(b => (
                      <div key={b.id} className="xp-wrapped-badge" title={b.name}>{b.icon}</div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={copyWrapped}>
                ▫ Copy Summary
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
