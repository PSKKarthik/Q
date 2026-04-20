'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/types'
import { Icon } from '@/components/ui/Icon'

export function NotificationBell({ userId }: { userId: string }) {
  const [notifs, setNotifs]     = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen]         = useState(false)
  const dropRef                 = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from('notifications').select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('read', false),
      ])
      if (data) setNotifs(data)
      setUnreadCount(count || 0)
    }
    load()
    const ch = supabase.channel('notifs-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p: { new: Notification }) => {
          setNotifs(prev => [p.new, ...prev].slice(0, 20))
          setUnreadCount(c => c + 1)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = unreadCount

  const markAll = async () => {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
    if (!error) {
      setNotifs(n => n.map(x => ({ ...x, read: true })))
      setUnreadCount(0)
    }
  }

  const markOne = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (!error) {
      setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x))
      setUnreadCount(c => Math.max(0, c - 1))
    }
  }

  return (
    <div ref={dropRef} style={{ position: 'relative' }}>
      <button className="btn btn-sm" onClick={() => setOpen(o => !o)} style={{ position: 'relative' }} aria-haspopup="true" aria-expanded={open} aria-label="Notifications">
        <Icon name="bell" size={13} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--danger)', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--mono)', fontSize: 9 }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" aria-live="polite">
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Notifications</span>
            {unread > 0 && <button className="btn btn-xs" onClick={markAll}>Mark all read</button>}
          </div>
          {notifs.length === 0 && (
            <div style={{ padding: 20, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>No notifications</div>
          )}
          {notifs.map(n => (
            <div key={n.id} className={`notif-item ${!n.read ? 'unread' : ''}`}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, marginBottom: 2 }}>{n.message}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>{n.created_at?.slice(0, 10)}</div>
              </div>
              {!n.read && (
                <button className="btn btn-xs" onClick={() => markOne(n.id)} style={{ flexShrink: 0 }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
