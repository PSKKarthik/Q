'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Notification } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatGrid } from '@/components/ui/StatGrid'
import { Pagination } from '@/components/ui/Pagination'
import { Icon } from '@/components/ui/Icon'

const PAGE_SIZE = 20

type Filter = 'all' | 'unread' | 'read'
type TypeFilter = 'all' | string

export function NotificationsModule({ userId }: { userId: string }) {
  const { toast } = useToast()
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)

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

  const unread = notifs.filter(n => !n.read).length
  const types = Array.from(new Set(notifs.map(n => n.type)))

  const filtered = notifs.filter(n => {
    if (filter === 'unread' && n.read) return false
    if (filter === 'read' && !n.read) return false
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const markAll = async () => {
    if (!confirm('Mark all notifications as read?')) return
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
    if (!confirm('Delete this notification?')) return
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
    if (!confirm('Delete all read notifications?')) return
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

  return (
    <>
      <PageHeader title="NOTIFICATIONS" subtitle={`${unread} unread`} />

      <StatGrid items={[
        { label: 'Total', value: notifs.length },
        { label: 'Unread', value: unread },
        { label: 'Read', value: notifs.length - unread },
        { label: 'Types', value: types.length },
      ]} columns={4} />

      {/* Filters */}
      <div className="fade-up-2" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'unread', 'read'] as Filter[]).map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
            onClick={() => { setFilter(f); setPage(0) }}
            style={{ textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        <select className="input" style={{ width: 'auto', fontSize: 11, padding: '4px 8px' }}
          value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }}>
          <option value="all">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {unread > 0 && <button className="btn btn-sm" onClick={markAll} disabled={busy === 'markAll'}><Icon name="check" size={11} /> {busy === 'markAll' ? 'Marking...' : 'Mark all read'}</button>}
        {notifs.length - unread > 0 && <button className="btn btn-sm btn-danger" onClick={clearRead} disabled={busy === 'clearRead'}><Icon name="trash" size={11} /> {busy === 'clearRead' ? 'Clearing...' : 'Clear read'}</button>}
      </div>

      {/* List */}
      <div className="fade-up-3">
        {paged.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 40, textAlign: 'center', color: 'var(--fg-dim)' }}><Icon name="bell" size={32} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No notifications</span></div>
        )}
        {paged.map(n => (
          <div key={n.id} className="card" style={{ marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start', opacity: n.read ? 0.6 : 1 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'var(--border)' : 'var(--success)', marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, marginBottom: 2 }}>{n.message}</div>
              <div style={{ display: 'flex', gap: 10, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>
                <span>{n.created_at?.slice(0, 16).replace('T', ' ')}</span>
                <span className="tag" style={{ fontSize: 8 }}>{n.type}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {!n.read && <button className="btn btn-xs" onClick={() => markOne(n.id)} disabled={busy === n.id}><Icon name="check" size={10} /></button>}
              <button className="btn btn-xs btn-danger" onClick={() => deleteOne(n.id)} disabled={busy === n.id}><Icon name="trash" size={10} /></button>
            </div>
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </>
  )
}
