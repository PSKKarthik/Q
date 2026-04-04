'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Room {
  id: string
  name: string
  subject: string
  created_by: string
  creator_name: string
  created_at: string
  is_active: boolean
}

interface RoomMessage {
  id: string
  room_id: string
  user_id: string
  user_name: string
  content: string
  created_at: string
}

interface Props {
  profile: Profile
}

export function CollaborationModule({ profile }: Props) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [input, setInput] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newRoom, setNewRoom] = useState({ name: '', subject: '' })
  const [loading, setLoading] = useState(true)
  const [onlineUsers, setOnlineUsers] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState(false)

  const loadRooms = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('collaboration_rooms').select('*').eq('is_active', true).order('created_at', { ascending: false })
      if (error) throw error
      if (data) setRooms(data)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load rooms', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadRooms()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [loadRooms])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const createRoom = async () => {
    if (!newRoom.name.trim()) return
    setCreating(true)
    try {
      const { data, error } = await supabase.from('collaboration_rooms').insert({
        name: newRoom.name.trim(),
        subject: newRoom.subject.trim(),
        created_by: profile.id,
        creator_name: profile.name,
        is_active: true,
      }).select().single()
      if (error) throw error
      if (data) {
        setRooms(prev => [data, ...prev])
        setNewRoom({ name: '', subject: '' })
        setShowCreate(false)
        joinRoom(data)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create room', 'error')
    } finally {
      setCreating(false)
    }
  }

  const joinRoom = async (room: Room) => {
    setActiveRoom(room)
    // Load existing messages
    try {
      const { data, error } = await supabase.from('room_messages').select('*').eq('room_id', room.id).order('created_at', { ascending: true }).limit(100)
      if (error) throw error
      if (data) setMessages(data)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load messages', 'error')
    }

    // Clean up old channel
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    // Subscribe to new messages + presence
    const channel = supabase.channel(`room-${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${room.id}` },
        (payload) => setMessages(prev => [...prev, payload.new as RoomMessage])
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const users = Object.values(state).flat().map((p: any) => p.name)
        setOnlineUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ name: profile.name, user_id: profile.id })
        }
      })

    channelRef.current = channel
  }

  const leaveRoom = () => {
    if (channelRef.current) {
      channelRef.current.untrack()
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    setActiveRoom(null)
    setMessages([])
    setOnlineUsers([])
  }

  const sendMessage = async () => {
    if (!input.trim() || !activeRoom) return
    if (input.length > 5000) { toast('Message too long (max 5,000 characters)', 'error'); return }
    const msg = input.trim()
    setInput('')
    setSending(true)
    try {
      const { error } = await supabase.from('room_messages').insert({
        room_id: activeRoom.id,
        user_id: profile.id,
        user_name: profile.name,
        content: msg,
      })
      if (error) throw error
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send message', 'error')
      setInput(msg)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading rooms...</div>

  if (activeRoom) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <button className="btn btn-sm" onClick={leaveRoom} style={{ marginRight: 12 }}>← Back</button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '0.08em' }}>{activeRoom.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>{activeRoom.subject}</span>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)' }}>
            🟢 {onlineUsers.length} online
          </div>
        </div>

        {onlineUsers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {onlineUsers.map((u, i) => (
              <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 8px', background: 'var(--surface)', borderRadius: 4, color: 'var(--fg-dim)' }}>{u}</span>
            ))}
          </div>
        )}

        <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {messages.map(m => (
              <div key={m.id} style={{ marginBottom: 10, textAlign: m.user_id === profile.id ? 'right' : 'left' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 2 }}>
                  {m.user_name} · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div style={{
                  display: 'inline-block', maxWidth: '70%', padding: '8px 12px', borderRadius: 8,
                  background: m.user_id === profile.id ? 'var(--accent)' : 'var(--bg)',
                  color: m.user_id === profile.id ? '#000' : 'var(--fg)',
                  fontFamily: 'var(--sans)', fontSize: 13, textAlign: 'left',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Type a message..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
            />
            <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="COLLABORATION ROOMS" subtitle="Study together in real-time" />

      <div className="fade-up-1" style={{ marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ Create Room'}
        </button>
      </div>

      {showCreate && (
        <div className="card fade-up-1" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Room name..." value={newRoom.name} onChange={e => setNewRoom(r => ({ ...r, name: e.target.value }))} />
            <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="Subject (optional)" value={newRoom.subject} onChange={e => setNewRoom(r => ({ ...r, subject: e.target.value }))} />
            <button className="btn btn-primary btn-sm" onClick={createRoom} disabled={creating}>{creating ? 'Creating...' : 'Create'}</button>
          </div>
        </div>
      )}

      <SectionLabel>Active Rooms</SectionLabel>
      <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {rooms.map(r => (
          <div key={r.id} className="card" style={{ padding: 16, cursor: 'pointer' }} onClick={() => joinRoom(r)}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{r.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 8 }}>
              {r.subject && <>{r.subject} · </>}Created by {r.creator_name}
            </div>
            <button className="btn btn-sm btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Join Room</button>
          </div>
        ))}
        {rooms.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', padding: 40 }}><Icon name="users" size={32} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No active rooms. Create one to get started!</span></div>
        )}
      </div>
    </>
  )
}
