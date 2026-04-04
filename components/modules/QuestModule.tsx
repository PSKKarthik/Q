'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, Quest, QuestProgress } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatGrid } from '@/components/ui/StatGrid'

interface Props {
  profile: Profile
}

const QUEST_ICONS: Record<string, string> = {
  test: '▫', course: '▪', streak: '◆', social: '◇', achievement: '★', xp: '◈',
}

export function QuestModule({ profile }: Props) {
  const { toast } = useToast()
  const [quests, setQuests] = useState<Quest[]>([])
  const [progress, setProgress] = useState<QuestProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [questsRes, progressRes] = await Promise.all([
        supabase.from('quests').select('*').order('created_at', { ascending: false }),
        supabase.from('quest_progress').select('*').eq('student_id', profile.id),
      ])
      if (questsRes.data) setQuests(questsRes.data as Quest[])
      if (progressRes.data) setProgress(progressRes.data as QuestProgress[])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load quests', 'error')
    }
    setLoading(false)
  }

  const claimReward = async (quest: Quest, prog: QuestProgress) => {
    if (!prog.completed || prog.claimed) return
    try {
      const { error: claimErr } = await supabase.from('quest_progress').update({ claimed: true }).eq('id', prog.id)
      if (claimErr) throw claimErr
      const { error: xpErr } = await supabase.rpc('atomic_xp_update', { p_user_id: profile.id, p_xp_delta: quest.xp_reward, p_best_score: 0, p_ghost_win_increment: 0 })
      if (xpErr) throw xpErr
      setProgress(prev => prev.map(p => p.id === prog.id ? { ...p, claimed: true } : p))
      toast(`+${quest.xp_reward} XP claimed!`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to claim reward', 'error')
    }
  }

  const getProgress = (questId: string) => progress.find(p => p.quest_id === questId)

  const completedCount = progress.filter(p => p.completed).length
  const totalXpEarned = progress.filter(p => p.claimed).reduce((sum, p) => {
    const q = quests.find(quest => quest.id === p.quest_id)
    return sum + (q?.xp_reward || 0)
  }, 0)

  const filteredQuests = quests.filter(q => {
    const prog = getProgress(q.id)
    if (filter === 'completed') return prog?.completed
    if (filter === 'active') return !prog?.completed
    return true
  })

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading quests...</div>

  return (
    <>
      <PageHeader title="QUESTS" subtitle="Complete challenges to earn XP" />

      <StatGrid items={[
        { label: 'Available', value: quests.length },
        { label: 'Completed', value: completedCount },
        { label: 'XP Earned', value: totalXpEarned },
        { label: 'Completion', value: quests.length ? `${Math.round(completedCount / quests.length * 100)}%` : '0%' },
      ]} columns={4} />

      <div className="fade-up-1" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['active', 'completed', 'all'] as const).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Daily Quests */}
      {(() => {
        const daily = filteredQuests.filter(q => q.type === 'daily')
        if (!daily.length) return null
        return (
          <>
            <SectionLabel>Daily Quests</SectionLabel>
            <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
              {daily.map(q => <QuestCard key={q.id} quest={q} progress={getProgress(q.id)} onClaim={claimReward} />)}
            </div>
          </>
        )
      })()}

      {/* Weekly Quests */}
      {(() => {
        const weekly = filteredQuests.filter(q => q.type === 'weekly')
        if (!weekly.length) return null
        return (
          <>
            <SectionLabel>Weekly Quests</SectionLabel>
            <div className="fade-up-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
              {weekly.map(q => <QuestCard key={q.id} quest={q} progress={getProgress(q.id)} onClaim={claimReward} />)}
            </div>
          </>
        )
      })()}

      {/* Achievement Quests */}
      {(() => {
        const achievements = filteredQuests.filter(q => q.type === 'special')
        if (!achievements.length) return null
        return (
          <>
            <SectionLabel>Achievements</SectionLabel>
            <div className="fade-up-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {achievements.map(q => <QuestCard key={q.id} quest={q} progress={getProgress(q.id)} onClaim={claimReward} />)}
            </div>
          </>
        )
      })()}

      {filteredQuests.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', textAlign: 'center', marginTop: 40 }}>
          {filter === 'completed' ? 'No completed quests yet. Keep going!' : 'No quests available right now.'}
        </div>
      )}
    </>
  )
}

function QuestCard({ quest, progress, onClaim }: { quest: Quest; progress?: QuestProgress; onClaim: (q: Quest, p: QuestProgress) => void }) {
  const pct = progress ? Math.min(100, Math.round((progress.progress / quest.target_count) * 100)) : 0
  const icon = QUEST_ICONS[quest.target_type] || '◉'

  return (
    <div className="card" style={{ padding: 20, opacity: progress?.claimed ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 24 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{quest.title}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{quest.description}</div>
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--warn)' }}>+{quest.xp_reward}</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, marginBottom: 4 }}>
          <span>{progress?.progress || 0}/{quest.target_count}</span>
          <span>{pct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 3, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {progress?.completed && !progress.claimed && (
        <button className="btn btn-primary btn-sm" onClick={() => onClaim(quest, progress)} style={{ width: '100%', justifyContent: 'center' }}>
          ◇ Claim Reward (+{quest.xp_reward} XP)
        </button>
      )}
      {progress?.claimed && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)', textAlign: 'center' }}>✓ Claimed</div>
      )}
    </div>
  )
}
