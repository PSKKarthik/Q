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
  const [showVideo, setShowVideo] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (err instanceof Error && err.message) return err.message
    if (typeof err === 'object' && err !== null) {
      if ('message' in err) {
        const msg = (err as { message?: unknown }).message
        if (typeof msg === 'string' && msg.trim()) return msg
      }
      const e = err as { code?: unknown; details?: unknown; hint?: unknown }
      const parts = [e.code, e.details, e.hint].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      if (parts.length) return parts.join(' | ')
    }
    return fallback
  }

  const loadRooms = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase.from('collaboration_rooms').select('*').eq('is_active', true).order('created_at', { ascending: false })
      if (error) throw error
      if (data) setRooms(data)
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to load rooms')
      setLoadError(msg)
      toast(msg, 'error')
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

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 900)
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  const createRoom = async () => {
    if (!newRoom.name.trim()) return
    setCreating(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      const authUserId = authData.user?.id
      if (!authUserId) throw new Error('You are not authenticated. Please sign in again.')

      const payload = {
        name: newRoom.name.trim(),
        subject: newRoom.subject.trim(),
        created_by: authUserId,
        creator_name: profile.name,
        is_active: true,
      }

      // Avoid INSERT...SELECT coupling to RLS visibility.
      const { error: insertError } = await supabase.from('collaboration_rooms').insert(payload)
      if (insertError) throw insertError

      await loadRooms()

      const { data: createdRooms, error: fetchError } = await supabase
        .from('collaboration_rooms')
        .select('*')
        .eq('created_by', authUserId)
        .eq('name', payload.name)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)

      if (fetchError) throw fetchError

      const created = createdRooms?.[0] as Room | undefined
      setNewRoom({ name: '', subject: '' })
      setShowCreate(false)
      if (created) joinRoom(created)
    } catch (err) {
      toast(getErrorMessage(err, 'Failed to create room'), 'error')
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
      toast(getErrorMessage(err, 'Failed to load messages'), 'error')
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

  const getJitsiRoomName = (room: Room) => {
    const safeId = room.id.replace(/[^a-zA-Z0-9-]/g, '')
    return `QGX-Study-${safeId}`
  }

  const archiveRoom = async (room: Room) => {
    if (room.created_by !== profile.id) return
    if (!confirm('Archive this room? It will be removed from active rooms.')) return
    try {
      const { error } = await supabase.from('collaboration_rooms').update({ is_active: false }).eq('id', room.id)
      if (error) throw error
      setRooms(prev => prev.filter(r => r.id !== room.id))
      if (activeRoom?.id === room.id) leaveRoom()
      toast('Room archived', 'success')
    } catch (err) {
      toast(getErrorMessage(err, 'Failed to archive room'), 'error')
    }
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
      toast(getErrorMessage(err, 'Failed to send message'), 'error')
      setInput(msg)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading rooms...</div>

  if (activeRoom) {
    const jitsiRoom = getJitsiRoomName(activeRoom)
    const jitsiUrl = `https://meet.jit.si/${jitsiRoom}#config.prejoinPageEnabled=false&config.startWithAudioMuted=true&config.startWithVideoMuted=false`

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <button className="btn btn-sm" onClick={leaveRoom} style={{ marginRight: 12 }}>← Back</button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '0.08em' }}>{activeRoom.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginLeft: 8 }}>{activeRoom.subject}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)' }}>
              ● {onlineUsers.length} online
            </div>
            <button className="btn btn-sm" onClick={() => setShowVideo(v => !v)}>
              {showVideo ? 'Hide Jitsi' : 'Show Jitsi'}
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => window.open(jitsiUrl, '_blank', 'noopener,noreferrer')}
            >
              Open Jitsi
            </button>
          </div>
        </div>

        {onlineUsers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {onlineUsers.map((u, i) => (
              <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 10, padding: '2px 8px', background: 'var(--surface)', borderRadius: 0, color: 'var(--fg-dim)' }}>{u}</span>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: showVideo && !isMobile ? 'minmax(0, 1.2fr) minmax(0, 0.8fr)' : '1fr',
            gap: 12,
            minHeight: isMobile ? '70vh' : 'calc(100vh - 250px)',
            alignItems: 'stretch',
          }}
        >
          <div style={{ border: '1px solid var(--border)', borderRadius: 0, background: 'var(--surface)', display: 'flex', flexDirection: 'column', minHeight: isMobile ? '52vh' : 'calc(100vh - 250px)' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {messages.map(m => (
                <div key={m.id} style={{ marginBottom: 10, textAlign: m.user_id === profile.id ? 'right' : 'left' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 2 }}>
                    {m.user_name} · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{
                    display: 'inline-block', maxWidth: isMobile ? '88%' : '70%', padding: '8px 12px', borderRadius: 0,
                    background: m.user_id === profile.id ? 'var(--accent)' : 'var(--bg)',
                    color: m.user_id === profile.id ? '#000' : 'var(--fg)',
                    fontFamily: 'var(--sans)', fontSize: 13, textAlign: 'left',
                    wordBreak: 'break-word',
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

          {showVideo && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 0, overflow: 'hidden', background: 'var(--surface)', minHeight: isMobile ? '45vh' : 'calc(100vh - 250px)' }}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>
                Jitsi Room: {jitsiRoom}
              </div>
              <iframe
                title={`Jitsi ${activeRoom.name}`}
                src={jitsiUrl}
                style={{ width: '100%', height: isMobile ? '42vh' : 'calc(100% - 33px)', border: 0 }}
                allow="camera; microphone; fullscreen; display-capture"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
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
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-sm btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Join Room</button>
              {r.created_by === profile.id && (
                <button
                  className="btn btn-sm"
                  style={{ color: 'var(--danger)' }}
                  onClick={(e) => { e.stopPropagation(); archiveRoom(r) }}
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        ))}
        {rooms.length === 0 && !loadError && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', padding: 40 }}><Icon name="users" size={32} /><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No active rooms. Create one to get started!</span></div>
        )}
        {loadError && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 40, gridColumn: '1/-1' }}>
            <Icon name="alert-circle" size={32} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--danger)', textAlign: 'center', maxWidth: 420 }}>{loadError}</span>
            <button className="btn btn-sm" onClick={loadRooms}>Retry</button>
          </div>
        )}
      </div>
    </>
  )
}
