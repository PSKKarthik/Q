'use client'
import { useState } from 'react'
import type { Profile, Test, Attempt } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface AdminTestModuleProps {
  tests: Test[]
  allAttempts: Attempt[]
  users: Profile[]
}

function ScoreRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r
  const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)'
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fill: 'var(--fg)', fontFamily: 'var(--mono)', fontSize: size * 0.24 }}>{pct}%</text>
    </svg>
  )
}

export function AdminTestModule({ tests, allAttempts, users }: AdminTestModuleProps) {
  const [view, setView] = useState<'overview' | 'detail'>('overview')
  const [selectedTest, setSelectedTest] = useState<Test | null>(null)
  const [searchQ, setSearchQ] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'attempts' | 'avg'>('date')

  const students = users.filter(u => u.role === 'student')
  const teachers = users.filter(u => u.role === 'teacher')

  const avgScore = allAttempts.length ? Math.round(allAttempts.reduce((s, a) => s + (a.percent || 0), 0) / allAttempts.length) : 0
  const passRate = allAttempts.length ? Math.round(allAttempts.filter(a => (a.percent || 0) >= 60).length / allAttempts.length * 100) : 0
  const highestScore = allAttempts.length ? Math.max(...allAttempts.map(a => a.percent || 0)) : 0

  const filteredTests = tests.filter(t =>
    !searchQ || t.title.toLowerCase().includes(searchQ.toLowerCase()) ||
    t.subject?.toLowerCase().includes(searchQ.toLowerCase()) ||
    t.teacher_name?.toLowerCase().includes(searchQ.toLowerCase())
  ).sort((a, b) => {
    const aAtts = allAttempts.filter(at => at.test_id === a.id)
    const bAtts = allAttempts.filter(at => at.test_id === b.id)
    if (sortBy === 'attempts') return bAtts.length - aAtts.length
    if (sortBy === 'avg') {
      const aAvg = aAtts.length ? aAtts.reduce((s, at) => s + (at.percent || 0), 0) / aAtts.length : 0
      const bAvg = bAtts.length ? bAtts.reduce((s, at) => s + (at.percent || 0), 0) / bAtts.length : 0
      return bAvg - aAvg
    }
    return (b.created_at || '').localeCompare(a.created_at || '')
  })

  const openDetail = (t: Test) => { setSelectedTest(t); setView('detail') }

  /* ── DETAIL VIEW ── */
  if (view === 'detail' && selectedTest) {
    const tAttempts = allAttempts.filter(a => a.test_id === selectedTest.id)
    const tAvg = tAttempts.length ? Math.round(tAttempts.reduce((s, a) => s + (a.percent || 0), 0) / tAttempts.length) : 0
    const tHigh = tAttempts.length ? Math.max(...tAttempts.map(a => a.percent || 0)) : 0
    const tLow = tAttempts.length ? Math.min(...tAttempts.map(a => a.percent || 0)) : 0
    const tPass = tAttempts.filter(a => (a.percent || 0) >= 60).length
    const teacher = users.find(u => u.id === selectedTest.teacher_id)

    // Score distribution buckets
    const buckets = [0, 0, 0, 0, 0] // 0-20, 21-40, 41-60, 61-80, 81-100
    tAttempts.forEach(a => {
      const p = a.percent || 0
      if (p <= 20) buckets[0]++
      else if (p <= 40) buckets[1]++
      else if (p <= 60) buckets[2]++
      else if (p <= 80) buckets[3]++
      else buckets[4]++
    })
    const maxBucket = Math.max(...buckets, 1)

    return (
      <div className="fade-up">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setView('overview')}>← Back</button>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '0.08em' }}>{selectedTest.title}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-dim)', marginLeft: 10 }}>
              {selectedTest.id} · {selectedTest.type} · {selectedTest.duration} min
            </span>
          </div>
        </div>

        {/* Teacher + Meta */}
        <div className="card fade-up-1" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>TEACHER</div>
              <div style={{ fontSize: 14 }}>{teacher?.name || selectedTest.teacher_name || '—'}</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>SUBJECT</div>
              <div style={{ fontSize: 14 }}>{selectedTest.subject || '—'}</div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>STATUS</div>
              <span className="tag tag-info">{selectedTest.status}</span>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>TOTAL MARKS</div>
              <div style={{ fontSize: 14 }}>{selectedTest.total_marks}</div>
            </div>
            {selectedTest.scheduled_date && <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>SCHEDULED</div>
              <div style={{ fontSize: 14 }}>{selectedTest.scheduled_date} {selectedTest.scheduled_time}</div>
            </div>}
          </div>
        </div>

        <StatGrid items={[
          { label: 'Attempts', value: tAttempts.length },
          { label: 'Average', value: `${tAvg}%` },
          { label: 'Highest', value: `${tHigh}%` },
          { label: 'Lowest', value: `${tLow}%` },
          { label: 'Pass Rate', value: `${tAttempts.length ? Math.round(tPass / tAttempts.length * 100) : 0}%` },
        ]} />

        {/* Score distribution */}
        {tAttempts.length > 0 && (
          <div className="card fade-up-3" style={{ marginBottom: 16 }}>
            <SectionLabel>Score Distribution</SectionLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120, marginTop: 12 }}>
              {['0-20', '21-40', '41-60', '61-80', '81-100'].map((label, i) => (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{buckets[i]}</span>
                  <div style={{
                    width: '100%', maxWidth: 48,
                    height: `${(buckets[i] / maxBucket) * 90}%`, minHeight: 4,
                    background: i <= 1 ? 'var(--danger)' : i === 2 ? 'var(--warn)' : 'var(--success)',
                    borderRadius: '2px 2px 0 0', transition: 'height 0.8s ease'
                  }} />
                  <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Anti-cheat config */}
        {selectedTest.anti_cheat && (
          <div className="card fade-up-3" style={{ marginBottom: 16 }}>
            <SectionLabel>Anti-Cheat Settings</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {selectedTest.anti_cheat.tabSwitch && <span className="tm-ac-tag">Tab Lock</span>}
              {selectedTest.anti_cheat.fullscreen && <span className="tm-ac-tag">Fullscreen</span>}
              {selectedTest.anti_cheat.randomQ && <span className="tm-ac-tag">Random Q</span>}
              {selectedTest.anti_cheat.randomOpts && <span className="tm-ac-tag">Random Opts</span>}
              {selectedTest.anti_cheat.copyPaste && <span className="tm-ac-tag">No Copy</span>}
              {selectedTest.anti_cheat.maxAttempts > 1 && <span className="tm-ac-tag">{selectedTest.anti_cheat.maxAttempts} Attempts</span>}
              {selectedTest.anti_cheat.timePerQ > 0 && <span className="tm-ac-tag">{selectedTest.anti_cheat.timePerQ}s/Q</span>}
            </div>
          </div>
        )}

        {/* Student attempts */}
        <div className="card fade-up-4" style={{ marginBottom: 16 }}>
          <SectionLabel>Student Attempts</SectionLabel>
          {tAttempts.length === 0
            ? <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12, padding: 16 }}>No attempts yet</div>
            : tAttempts.sort((a, b) => (b.percent || 0) - (a.percent || 0)).map(a => {
                const student = students.find(s => s.id === a.student_id)
                return (
                  <div key={a.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar" style={{ width: 22, height: 22, fontSize: 9 }}>{student?.avatar || '?'}</div>
                        <span style={{ fontSize: 13 }}>{student?.name || 'Unknown'}</span>
                        <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{student?.qgx_id}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="mono" style={{ fontSize: 12, color: (a.percent || 0) >= 70 ? 'var(--success)' : (a.percent || 0) >= 40 ? 'var(--warn)' : 'var(--danger)' }}>{a.percent}%</span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{a.score}/{a.total}</span>
                      </div>
                    </div>
                    <div className="tm-perf-bar">
                      <div className="tm-perf-fill" style={{
                        width: `${a.percent}%`,
                        background: (a.percent || 0) >= 70 ? 'var(--success)' : (a.percent || 0) >= 40 ? 'var(--warn)' : 'var(--danger)'
                      }} />
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>
    )
  }

  /* ── OVERVIEW ── */
  return (
    <>
      <PageHeader title="TESTS OVERVIEW" subtitle="Platform-wide test management and insights" />

      <StatGrid items={[
        { label: 'Total Tests', value: tests.length },
        { label: 'Total Attempts', value: allAttempts.length },
        { label: 'Platform Avg', value: `${avgScore}%` },
        { label: 'Pass Rate', value: `${passRate}%` },
        { label: 'Highest Score', value: `${highestScore}%` },
      ]} />

      {/* Toolbar */}
      <div className="tm-filter-bar fade-up-2">
        <div className="tm-filter-pills">
          {(['date', 'attempts', 'avg'] as const).map(s => (
            <button key={s} className={`tm-pill ${sortBy === s ? 'active' : ''}`} onClick={() => setSortBy(s)}>
              {s === 'date' ? 'Recent' : s === 'attempts' ? 'Most Attempts' : 'Best Avg'}
            </button>
          ))}
        </div>
        <div className="tm-search-box">
          <Icon name="search" size={12} />
          <input placeholder="Search tests, subjects, teachers..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </div>
      </div>

      {/* Test cards */}
      <div className="tm-teacher-grid fade-up-3">
        {filteredTests.map(t => {
          const tAttempts = allAttempts.filter(a => a.test_id === t.id)
          const tAvg = tAttempts.length ? Math.round(tAttempts.reduce((s, a) => s + (a.percent || 0), 0) / tAttempts.length) : null
          const teacher = users.find(u => u.id === t.teacher_id)

          return (
            <div key={t.id} className="tm-teacher-card" style={{ cursor: 'pointer' }} onClick={() => openDetail(t)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{t.id}</span>
                    <span className={`tag ${t.type === 'quiz' ? 'tag-warn' : 'tag-info'}`}>{t.type}</span>
                    <span className="tag tag-success">{t.status}</span>
                  </div>
                  <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 2 }}>{t.title}</div>
                  {t.subject && <div className="mono" style={{ fontSize: 10, color: 'var(--fg-dim)' }}>{t.subject}</div>}
                </div>
                {tAvg !== null && <ScoreRing pct={tAvg} size={52} />}
              </div>

              <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 8, flexWrap: 'wrap' }}>
                <span><Icon name="user" size={9} /> {teacher?.name || t.teacher_name || '—'}</span>
                <span><Icon name="clock" size={9} /> {t.duration} min</span>
                <span><Icon name="users" size={9} /> {tAttempts.length} attempts</span>
                {t.questions?.length ? <span><Icon name="test" size={9} /> {t.questions.length} Q&apos;s</span> : null}
              </div>
            </div>
          )
        })}
      </div>

      {filteredTests.length === 0 && (
        <div className="tm-empty fade-up-3">
          <Icon name="test" size={32} />
          <div>No tests found{searchQ ? ` matching "${searchQ}"` : ''}</div>
        </div>
      )}
    </>
  )
}
