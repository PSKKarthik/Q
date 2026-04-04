'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Notification } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { Pagination } from '@/components/ui/Pagination'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'

const PAGE_SIZE = 20

type Filter = 'all' | 'unread' | 'read'
type TypeFilter = 'all' | string

/* Category icon + color mapping */
const CATEGORY_META: Record<string, { icon: string; color: string; label: string }> = {
  info: { icon: '◇', color: 'var(--info, #3b82f6)', label: 'Info' },
  success: { icon: '◆', color: 'var(--success)', label: 'Success' },
  warning: { icon: '△', color: 'var(--warn)', label: 'Warning' },
  error: { icon: '■', color: 'var(--danger)', label: 'Error' },
  xp: { icon: '★', color: 'var(--warn)', label: 'XP' },
  test: { icon: '◈', color: 'var(--danger)', label: 'Test' },
  course: { icon: '▪', color: 'var(--success)', label: 'Course' },
  assignment: { icon: '▫', color: 'var(--warn)', label: 'Assignment' },
  forum: { icon: '◇', color: 'var(--info, #3b82f6)', label: 'Forum' },
  system: { icon: '◆', color: 'var(--fg-dim)', label: 'System' },
}

const getCategoryMeta = (type: string) => CATEGORY_META[type] || CATEGORY_META.info

/* Relative time helper */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* Date group label */
function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const notifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = today.getTime() - notifDay.getTime()
  if (diff === 0) return 'Today'
  if (diff <= 86400000) return 'Yesterday'
  if (diff <= 7 * 86400000) return 'This Week'
  if (diff <= 30 * 86400000) return 'This Month'
  return 'Older'
}

export function NotificationsModule({ userId }: { userId: string }) {
  const { toast } = useToast()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchQ, setSearchQ] = useState('')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [showPrefs, setShowPrefs] = useState(false)
  const [mutedTypes, setMutedTypes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('qgx-notif-muted')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })

  const fetchNotifs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notifications').select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      if (data) setNotifs(data)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to load notifications', 'error')
    }
  }, [userId, toast])

  useEffect(() => { fetchNotifs() }, [fetchNotifs])

  /* Subscribe to realtime notifications */
  useEffect(() => {
    const channel = supabase.channel('notifs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload: { new: Notification }) => { setNotifs(prev => [payload.new, ...prev]) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const unread = notifs.filter(n => !n.read).length
  const types = useMemo(() => Array.from(new Set(notifs.map(n => n.type))), [notifs])

  const filtered = useMemo(() => notifs.filter(n => {
    if (filter === 'unread' && n.read) return false
    if (filter === 'read' && !n.read) return false
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    if (searchQ && !n.message.toLowerCase().includes(searchQ.toLowerCase())) return false
    if (mutedTypes.has(n.type)) return false
    return true
  }), [notifs, filter, typeFilter, searchQ, mutedTypes])

  /* Group by date */
  const grouped = useMemo(() => {
    const groups: { label: string; items: Notification[] }[] = []
    const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    paged.forEach(n => {
      const label = getDateGroup(n.created_at)
      const existing = groups.find(g => g.label === label)
      if (existing) existing.items.push(n)
      else groups.push({ label, items: [n] })
    })
    return groups
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  /* Type stats breakdown */
  const typeStats = useMemo(() => {
    const map: Record<string, number> = {}
    notifs.forEach(n => { map[n.type] = (map[n.type] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [notifs])

  const markAll = async () => {
    if (!window.confirm('Mark all notifications as read?')) return
    setBusy('markAll')
    try {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
      if (error) throw error
      setNotifs(n => n.map(x => ({ ...x, read: true })))
      toast('All marked as read', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to mark all read', 'error')
    }
    setBusy(null)
  }

  const markOne = async (id: string) => {
    setBusy(id)
    try {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
      if (error) throw error
      setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to mark as read', 'error')
    }
    setBusy(null)
  }

  const deleteOne = async (id: string) => {
    if (!window.confirm('Delete this notification?')) return
    setBusy(id)
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', id)
      if (error) throw error
      setNotifs(n => n.filter(x => x.id !== id))
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to delete notification', 'error')
    }
    setBusy(null)
  }

  const clearRead = async () => {
    if (!window.confirm('Delete all read notifications?')) return
    setBusy('clearRead')
    try {
      const { error } = await supabase.from('notifications').delete().eq('user_id', userId).eq('read', true)
      if (error) throw error
      setNotifs(n => n.filter(x => !x.read))
      toast('Read notifications cleared', 'success')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to clear notifications', 'error')
    }
    setBusy(null)
  }

  const toggleMute = (type: string) => {
    setMutedTypes(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      try { localStorage.setItem('qgx-notif-muted', JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }

  return (
    <>
      <PageHeader title="NOTIFICATIONS" subtitle={`${unread} unread`} />

      <StatGrid items={[
        { label: 'Total', value: notifs.length },
        { label: 'Unread', value: unread },
        { label: 'Read', value: notifs.length - unread },
        { label: 'Categories', value: types.length },
      ]} columns={4} />

      {/* Category breakdown */}
      {typeStats.length > 0 && (
        <div className="fade-up-1" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {typeStats.map(([type, count]) => {
            const meta = getCategoryMeta(type)
            const isActive = typeFilter === type
            return (
              <button key={type} className={`btn btn-sm ${isActive ? 'btn-primary' : ''}`}
                onClick={() => { setTypeFilter(isActive ? 'all' : type); setPage(0) }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: meta.color, fontSize: 14 }}>{meta.icon}</span>
                <span style={{ textTransform: 'capitalize' }}>{meta.label}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.7 }}>({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filters + Search */}
      <div className="fade-up-2" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'unread', 'read'] as Filter[]).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
            onClick={() => { setFilter(f); setPage(0) }}
            style={{ textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        <input className="input" style={{ width: 180, fontSize: 11, padding: '4px 8px' }}
          placeholder="Search notifications..." value={searchQ} onChange={e => { setSearchQ(e.target.value); setPage(0) }} />
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={() => setShowPrefs(!showPrefs)} title="Preferences">
          <Icon name="settings" size={11} /> Preferences
        </button>
        {unread > 0 && <button className="btn btn-sm" onClick={markAll} disabled={busy === 'markAll'}><Icon name="check" size={11} /> {busy === 'markAll' ? 'Marking...' : 'Mark all read'}</button>}
        {notifs.length - unread > 0 && <button className="btn btn-sm btn-danger" onClick={clearRead} disabled={busy === 'clearRead'}><Icon name="trash" size={11} /> {busy === 'clearRead' ? 'Clearing...' : 'Clear read'}</button>}
      </div>

      {/* Preferences panel */}
      {showPrefs && (
        <div className="card fade-up-2" style={{ marginBottom: 16 }}>
          <SectionLabel>Notification Preferences</SectionLabel>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 12 }}>
            Mute categories you don&apos;t want to see. This is saved locally.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            {types.map(type => {
              const meta = getCategoryMeta(type)
              const isMuted = mutedTypes.has(type)
              return (
                <button key={type} className="btn btn-sm" onClick={() => toggleMute(type)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isMuted ? 0.4 : 1, textDecoration: isMuted ? 'line-through' : 'none' }}>
                  <span style={{ color: meta.color }}>{meta.icon}</span>
                  <span style={{ textTransform: 'capitalize' }}>{meta.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10 }}>{isMuted ? 'OFF' : 'ON'}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Grouped List */}
      <div className="fade-up-3">
        {grouped.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 40, textAlign: 'center', color: 'var(--fg-dim)' }}><Icon name="bell" size={32} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No notifications</span></div>
        )}
        {grouped.map(group => (
          <div key={group.label} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingLeft: 4 }}>
              {group.label}
            </div>
            {group.items.map(n => {
              const meta = getCategoryMeta(n.type)
              return (
                <div key={n.id} className="card" style={{ marginBottom: 6, display: 'flex', gap: 12, alignItems: 'flex-start', opacity: n.read ? 0.6 : 1 }}>
                  <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: `${meta.color}18`, color: meta.color, fontSize: 16, flexShrink: 0, marginTop: 2 }}>
                    {meta.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, marginBottom: 2 }}>{n.message}</div>
                    <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>
                      <span>{timeAgo(n.created_at)}</span>
                      <span className="tag" style={{ fontSize: 8, textTransform: 'capitalize' }}>{meta.label}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {!n.read && <button className="btn btn-xs" onClick={() => markOne(n.id)} disabled={busy === n.id} title="Mark read"><Icon name="check" size={10} /></button>}
                    <button className="btn btn-xs btn-danger" onClick={() => deleteOne(n.id)} disabled={busy === n.id} title="Delete"><Icon name="trash" size={10} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </>
  )
}
