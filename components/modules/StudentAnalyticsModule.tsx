'use client'
import { useState, useMemo } from 'react'
import type { Profile, Attempt, Assignment, Submission, Course } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { exportCSV } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'

interface Props {
  profile: Profile
  attempts: Attempt[]
  assignments: (Assignment & { submissions?: Submission[] })[]
  courses: Course[]
  enrolledIds: string[]
}

export function StudentAnalyticsModule({ profile, attempts, assignments, courses, enrolledIds }: Props) {
  const [period, setPeriod] = useState<'all' | '30d' | '7d'>('all')

  const filtered = useMemo(() => {
    if (period === 'all') return attempts
    const cutoff = Date.now() - (period === '30d' ? 30 : 7) * 86400000
    return attempts.filter(a => new Date(a.submitted_at).getTime() > cutoff)
  }, [attempts, period])

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()),
    [filtered]
  )

  const avgScore = sorted.length ? Math.round(sorted.reduce((s, a) => s + (a.percent || 0), 0) / sorted.length) : 0
  const bestScore = sorted.length ? Math.max(...sorted.map(a => a.percent || 0)) : 0
  const worstScore = sorted.length ? Math.min(...sorted.map(a => a.percent || 0)) : 0

  // Score trend — moving average of last 5
  const movingAvg = useMemo(() => {
    if (sorted.length < 2) return []
    const window = Math.min(5, sorted.length)
    return sorted.map((_, i) => {
      const start = Math.max(0, i - window + 1)
      const slice = sorted.slice(start, i + 1)
      return Math.round(slice.reduce((s, a) => s + (a.percent || 0), 0) / slice.length)
    })
  }, [sorted])

  // Subject breakdown
  const bySubject = useMemo(() => {
    const map: Record<string, { scores: number[]; count: number }> = {}
    sorted.forEach(a => {
      // Infer subject from test_id — in real app we'd join tests table
      const key = 'tests'
      if (!map[key]) map[key] = { scores: [], count: 0 }
      map[key].scores.push(a.percent || 0)
      map[key].count++
    })
    return map
  }, [sorted])

  // Assignment scores
  const mySubs = useMemo(() =>
    assignments.flatMap(a => (a.submissions || []).filter((s: Submission) => s.student_id === profile.id && s.score != null)),
    [assignments, profile.id]
  )
  const avgAssignment = mySubs.length ? Math.round(mySubs.reduce((s, sub: Submission) => s + (sub.score || 0), 0) / mySubs.length) : 0

  // Streak calculation
  const streak = useMemo(() => {
    if (!sorted.length) return 0
    let count = 0
    for (let i = sorted.length - 1; i >= 0; i--) {
      if ((sorted[i].percent || 0) >= 60) count++
      else break
    }
    return count
  }, [sorted])

  // Progress over time — chart using CSS bars
  const maxBarCount = 20

  return (
    <>
      <PageHeader title="MY ANALYTICS" subtitle="Personal performance trends" />

      <div className="fade-up-1" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', '30d', '7d'] as const).map(p => (
          <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : ''}`} onClick={() => setPeriod(p)}>
            {p === 'all' ? 'All Time' : p === '30d' ? '30 Days' : '7 Days'}
          </button>
        ))}
        <button className="btn btn-sm" onClick={() => exportCSV('my-analytics.csv',
          ['Test', 'Score', 'Total', 'Percent', 'Date'],
          sorted.map(a => [a.test_id, a.score, a.total, a.percent, a.submitted_at?.slice(0, 10)])
        )}>
          <Icon name="download" size={11} /> Export
        </button>
      </div>

      <StatGrid items={[
        { label: 'Avg Score', value: `${avgScore}%` },
        { label: 'Best Score', value: `${bestScore}%` },
        { label: 'Tests Taken', value: sorted.length },
        { label: 'Pass Streak', value: `${streak} 🔥` },
      ]} columns={4} />

      {/* Score Trend Chart */}
      <div className="card fade-up-3" style={{ marginBottom: 20 }}>
        <SectionLabel>Score Trend</SectionLabel>
        {sorted.length > 1 ? (
          <div className="analytics-chart">
            {sorted.slice(-maxBarCount).map((a, i) => (
              <div key={a.id} className="analytics-chart-bar-wrap">
                <div className="analytics-chart-bar"
                  style={{
                    height: `${a.percent || 0}%`,
                    background: (a.percent || 0) >= 70 ? 'var(--success)' : (a.percent || 0) >= 40 ? 'var(--warn)' : 'var(--danger)',
                  }}
                />
                <div className="analytics-chart-label">{a.percent}%</div>
                <div className="analytics-chart-date">{a.submitted_at?.slice(5, 10)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Take more tests to see trends.</div>
        )}
        {movingAvg.length > 0 && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 8 }}>
            Moving average (last 5): {movingAvg[movingAvg.length - 1]}% {movingAvg.length > 1 && (
              <span style={{ color: movingAvg[movingAvg.length - 1] > movingAvg[movingAvg.length - 2] ? 'var(--success)' : 'var(--danger)' }}>
                {movingAvg[movingAvg.length - 1] > movingAvg[movingAvg.length - 2] ? '↑' : '↓'}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Score Distribution */}
      <div className="card fade-up-4" style={{ marginBottom: 20 }}>
        <SectionLabel>Score Distribution</SectionLabel>
        {(() => {
          const bins = { 'A (90-100)': 0, 'B (80-89)': 0, 'C (70-79)': 0, 'D (60-69)': 0, 'F (0-59)': 0 }
          sorted.forEach(a => {
            const p = a.percent || 0
            if (p >= 90) bins['A (90-100)']++
            else if (p >= 80) bins['B (80-89)']++
            else if (p >= 70) bins['C (70-79)']++
            else if (p >= 60) bins['D (60-69)']++
            else bins['F (0-59)']++
          })
          return Object.entries(bins).map(([label, count]) => {
            const pct = sorted.length ? Math.round((count / sorted.length) * 100) : 0
            const color = label.startsWith('A') || label.startsWith('B') ? 'var(--success)' : label.startsWith('C') || label.startsWith('D') ? 'var(--warn)' : 'var(--danger)'
            return (
              <div key={label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, marginBottom: 3 }}>
                  <span>{label}</span><span style={{ color: 'var(--fg-dim)' }}>{count} ({pct}%)</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.8s ease' }} />
                </div>
              </div>
            )
          })
        })()}
      </div>

      {/* Assignments Overview */}
      <div className="card fade-up-4" style={{ marginBottom: 20 }}>
        <SectionLabel>Assignment Performance</SectionLabel>
        <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 28 }}>{mySubs.length}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Graded</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 28, color: avgAssignment >= 70 ? 'var(--success)' : avgAssignment >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{avgAssignment}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Avg Score</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 28 }}>{enrolledIds.length}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Enrolled</div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="card fade-up-4">
        <SectionLabel>Performance Summary</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 4 }}>HIGHEST</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: 'var(--success)' }}>{bestScore}%</div>
          </div>
          <div style={{ padding: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 4 }}>LOWEST</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: 'var(--danger)' }}>{worstScore}%</div>
          </div>
          <div style={{ padding: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 4 }}>TOTAL XP</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 24, color: 'var(--warn)' }}>{profile.xp}</div>
          </div>
          <div style={{ padding: 12, border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 4 }}>GHOST WINS</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 24 }}>{profile.ghost_wins}</div>
          </div>
        </div>
      </div>
    </>
  )
}
