'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatGrid } from '@/components/ui/StatGrid'
import { Pagination } from '@/components/ui/Pagination'
import { PAGE_SIZE } from '@/lib/constants'

interface Props {
  profile: Profile
}

interface StudentRisk {
  student: Profile
  riskScore: number // 0-100, higher = more at risk
  flags: string[]
  avgScore: number
  attRate: number
  missedAssignments: number
  recentTrend: 'declining' | 'stable' | 'improving'
}

export function PredictiveAlertsModule({ profile }: Props) {
  const { toast } = useToast()
  const [risks, setRisks] = useState<StudentRisk[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'high' | 'medium' | 'all'>('high')
  const [alertPage, setAlertPage] = useState(0)

  const analyzeStudents = useCallback(async () => {
    setLoading(true)
    try {
      const [studentsRes, attRes, attemptsRes, subsRes, assignRes, testsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'student'),
      supabase.from('attendance').select('*'),
      supabase.from('attempts').select('*'),
      supabase.from('submissions').select('*'),
      supabase.from('assignments').select('*').eq('teacher_id', profile.id),
      supabase.from('tests').select('*').eq('teacher_id', profile.id),
    ])

    const students = (studentsRes.data || []) as Profile[]
    const allAtt = attRes.data || []
    const allAttempts = attemptsRes.data || []
    const allSubs = subsRes.data || []
    const myAssignments = assignRes.data || []
    const myTests = testsRes.data || []
    const myAssignmentIds = new Set(myAssignments.map((a: any) => a.id))
    const myTestIds = new Set(myTests.map((t: any) => t.id))

    // Scope to students with activity in this teacher's tests/assignments
    const relevantStudentIds = new Set<string>()
    allAttempts.forEach((a: any) => { if (myTestIds.has(a.test_id)) relevantStudentIds.add(a.student_id) })
    allSubs.forEach((s: any) => { if (myAssignmentIds.has(s.assignment_id)) relevantStudentIds.add(s.student_id) })
    const scopedStudents = students.filter(s => relevantStudentIds.has(s.id))

    const riskData: StudentRisk[] = scopedStudents.map(s => {
      const flags: string[] = []
      let riskScore = 0

      // Attendance
      const att = allAtt.filter((a: any) => a.student_id === s.id)
      const present = att.filter((a: any) => a.status === 'present' || a.status === 'late').length
      const attRate = att.length ? Math.round((present / att.length) * 100) : -1
      if (attRate >= 0 && attRate < 70) { flags.push(`Low attendance (${attRate}%)`); riskScore += 30 }
      else if (attRate >= 0 && attRate < 85) { flags.push(`Attendance below 85% (${attRate}%)`); riskScore += 15 }

      // Test scores
      const attempts = allAttempts.filter((a: any) => a.student_id === s.id)
      const avgScore = attempts.length ? Math.round(attempts.reduce((s: number, a: any) => s + (a.percent || 0), 0) / attempts.length) : -1
      if (avgScore >= 0 && avgScore < 40) { flags.push(`Very low avg score (${avgScore}%)`); riskScore += 30 }
      else if (avgScore >= 0 && avgScore < 60) { flags.push(`Below-passing avg (${avgScore}%)`); riskScore += 15 }

      // Trend (compare last 3 vs previous 3 attempts)
      let recentTrend: 'stable' | 'declining' | 'improving' = 'stable'
      if (attempts.length >= 4) {
        const sorted = [...attempts].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        const recent3 = sorted.slice(0, 3).reduce((s: number, a: any) => s + (a.percent || 0), 0) / 3
        const prevSlice = sorted.slice(3, 6)
        const prev3 = prevSlice.length ? prevSlice.reduce((s: number, a: any) => s + (a.percent || 0), 0) / prevSlice.length : recent3
        if (recent3 < prev3 - 10) { recentTrend = 'declining'; flags.push('Declining performance'); riskScore += 15 }
        else if (recent3 > prev3 + 10) { recentTrend = 'improving' }
      }

      // Missed assignments
      const studentSubs = new Set(allSubs.filter((s2: any) => s2.student_id === s.id).map((s2: any) => s2.assignment_id))
      const missedAssignments = myAssignments.filter((a: any) =>
        !studentSubs.has(a.id) && new Date(a.due_date) < new Date()
      ).length
      if (missedAssignments >= 3) { flags.push(`${missedAssignments} missed assignments`); riskScore += 20 }
      else if (missedAssignments >= 1) { flags.push(`${missedAssignments} missed assignment(s)`); riskScore += 10 }

      // No recent activity (no attempts in last 14 days)
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
      const recentAttempts = attempts.filter((a: any) => new Date(a.created_at).getTime() > twoWeeksAgo)
      if (attempts.length > 0 && recentAttempts.length === 0) {
        flags.push('No activity in 2+ weeks'); riskScore += 10
      }

      return {
        student: s,
        riskScore: Math.min(100, riskScore),
        flags,
        avgScore: avgScore >= 0 ? avgScore : 0,
        attRate: attRate >= 0 ? attRate : 0,
        missedAssignments,
        recentTrend,
      }
    }).filter(r => r.flags.length > 0).sort((a, b) => b.riskScore - a.riskScore)

    setRisks(riskData)
    setLoading(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to analyze students', 'error')
      setLoading(false)
    }
  }, [profile.id, toast])

  useEffect(() => { analyzeStudents() }, [analyzeStudents])

  const filtered = risks.filter(r => {
    if (filter === 'high') return r.riskScore >= 40
    if (filter === 'medium') return r.riskScore >= 20
    return true
  })

  const highRisk = risks.filter(r => r.riskScore >= 40).length
  const medRisk = risks.filter(r => r.riskScore >= 20 && r.riskScore < 40).length

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Analyzing student data...</div>

  return (
    <>
      <PageHeader title="PREDICTIVE ALERTS" subtitle="AI-powered early warning system for at-risk students" />

      <StatGrid items={[
        { label: 'High Risk', value: highRisk },
        { label: 'Medium Risk', value: medRisk },
        { label: 'Total Flagged', value: risks.length },
      ]} columns={3} />

      <div className="fade-up-1" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['high', 'medium', 'all'] as const).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => { setFilter(f); setAlertPage(0) }}>
            {f === 'high' ? '● High Risk' : f === 'medium' ? '○ Medium+' : 'All Flagged'}
          </button>
        ))}
        <button className="btn btn-sm" onClick={analyzeStudents} style={{ marginLeft: 'auto' }}>◈ Refresh</button>
      </div>

      <div className="fade-up-2" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.slice(alertPage * PAGE_SIZE, (alertPage + 1) * PAGE_SIZE).map(r => (
          <div key={r.student.id} className="card" style={{
            padding: 16,
            borderLeft: `3px solid ${r.riskScore >= 60 ? 'var(--danger)' : r.riskScore >= 40 ? 'var(--warn)' : 'var(--accent)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.student.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>{r.student.grade}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: r.recentTrend === 'declining' ? 'var(--danger)' : r.recentTrend === 'improving' ? 'var(--success)' : 'var(--fg-dim)' }}>
                  {r.recentTrend === 'declining' ? '▼ Declining' : r.recentTrend === 'improving' ? '▲ Improving' : '— Stable'}
                </span>
                <div style={{
                  fontFamily: 'var(--display)', fontSize: 18,
                  color: r.riskScore >= 60 ? 'var(--danger)' : r.riskScore >= 40 ? 'var(--warn)' : 'var(--accent)',
                }}>
                  {r.riskScore}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8 }}>
              <span>Avg: {r.avgScore}%</span>
              <span>Attendance: {r.attRate}%</span>
              <span>Missed: {r.missedAssignments}</span>
            </div>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {r.flags.map((f, i) => (
                <span key={i} style={{
                  fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 6px', borderRadius: 0,
                  background: f.includes('Very low') || f.includes('Low attendance') || f.includes('Declining') ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                  color: f.includes('Very low') || f.includes('Low attendance') || f.includes('Declining') ? 'var(--danger)' : 'var(--warn)',
                }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center', marginTop: 40 }}>
            No at-risk students detected at this threshold. ◇
          </div>
        )}
        <Pagination page={alertPage} totalPages={Math.ceil(filtered.length / PAGE_SIZE)} onPageChange={setAlertPage} />
      </div>
    </>
  )
}
