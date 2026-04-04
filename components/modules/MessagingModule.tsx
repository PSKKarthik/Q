'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { sanitizeText } from '@/lib/utils'
import type { Profile, Message, MessageGroup } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { PageHeader } from '@/components/ui/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { PAGE_SIZE } from '@/lib/constants'

interface Props {
  profile: Profile
  contacts: Profile[]
}

type ThreadItem = { type: 'dm'; contact: Profile; lastMsg?: Message; unread: number }
  | { type: 'group'; group: MessageGroup; lastMsg?: Message; unread: number }

export function MessagingModule({ profile, contacts }: Props) {
  const { toast } = useToast()
  const [threads, setThreads] = useState<ThreadItem[]>([])
  const [activeContact, setActiveContact] = useState<Profile | null>(null)
  const [activeGroup, setActiveGroup] = useState<MessageGroup | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [threadPage, setThreadPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [editingMsg, setEditingMsg] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [groupModal, setGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<string[]>([])
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  const typingRef = useRef<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadThreads()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (typingRef.current) supabase.removeChannel(typingRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeContact) loadConversation(activeContact.id)
    else if (activeGroup) loadGroupConversation(activeGroup.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContact, activeGroup])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadThreads = async () => {
    setLoading(true)
    try {
      const [dmRes, groupRes] = await Promise.all([
        supabase.from('messages').select('*').is('group_id', null)
          .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
          .order('created_at', { ascending: false }),
        supabase.from('message_groups').select('*').contains('member_ids', [profile.id]),
      ])

    const allMsgs = (dmRes.data || []) as Message[]
    const groups = (groupRes.data || []) as MessageGroup[]

    // DM threads
    const threadMap: Record<string, { lastMsg: Message; unread: number }> = {}
    allMsgs.filter(m => !m.deleted).forEach((m) => {
      const otherId = m.sender_id === profile.id ? m.receiver_id : m.sender_id
      if (!threadMap[otherId]) threadMap[otherId] = { lastMsg: m, unread: 0 }
      if (!m.read && m.receiver_id === profile.id) threadMap[otherId].unread++
    })

    const dmThreads: ThreadItem[] = contacts
      .filter(c => threadMap[c.id])
      .map(c => ({ type: 'dm' as const, contact: c, lastMsg: threadMap[c.id].lastMsg, unread: threadMap[c.id].unread }))
      .sort((a, b) => new Date(b.lastMsg!.created_at).getTime() - new Date(a.lastMsg!.created_at).getTime())

    const withoutThread = contacts.filter(c => !threadMap[c.id] && c.id !== profile.id)
    const allDm: ThreadItem[] = [...dmThreads, ...withoutThread.map(c => ({ type: 'dm' as const, contact: c, unread: 0 }))]

    // Group threads
    const groupThreads: ThreadItem[] = []
    for (const g of groups) {
      const { data: gMsgs } = await supabase.from('messages').select('*').eq('group_id', g.id)
        .eq('deleted', false).order('created_at', { ascending: false }).limit(1)
      const lastMsg = gMsgs?.[0] as Message | undefined
      const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true })
        .eq('group_id', g.id).eq('read', false).neq('sender_id', profile.id)
      groupThreads.push({ type: 'group', group: g, lastMsg, unread: count || 0 })
    }

    setThreads([...groupThreads, ...allDm])
    setLoading(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load messages', 'error')
      setLoading(false)
    }
  }

  const loadConversation = async (contactId: string) => {
    try {
      const { data } = await supabase.from('messages').select('*').is('group_id', null)
        .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${profile.id})`)
        .order('created_at', { ascending: true })
      if (data) setMessages(data.filter((m: Message) => !m.deleted) as Message[])

      await supabase.from('messages').update({ read: true }).eq('sender_id', contactId).eq('receiver_id', profile.id).eq('read', false)
      setThreads(prev => prev.map(t => t.type === 'dm' && t.contact.id === contactId ? { ...t, unread: 0 } : t))
      setupChannel(`dm-${[profile.id, contactId].sort().join('-')}`, contactId)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load conversation', 'error')
    }
  }

  const loadGroupConversation = async (groupId: string) => {
    try {
      const { data } = await supabase.from('messages').select('*').eq('group_id', groupId)
        .order('created_at', { ascending: true })
      if (data) setMessages(data.filter((m: Message) => !m.deleted) as Message[])
      setupChannel(`grp-${groupId}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load group conversation', 'error')
    }
  }

  const setupChannel = (channelName: string, contactId?: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    if (typingRef.current) supabase.removeChannel(typingRef.current)

    channelRef.current = supabase.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const msg = payload.new as Message
          if (!msg.deleted) setMessages(prev => [...prev, msg])
          if (msg.receiver_id === profile.id) supabase.from('messages').update({ read: true }).eq('id', msg.id).then()
        } else if (payload.eventType === 'UPDATE') {
          const msg = payload.new as Message
          setMessages(prev => msg.deleted ? prev.filter(m => m.id !== msg.id) : prev.map(m => m.id === msg.id ? msg : m))
        }
      })
      .subscribe()

    // Typing indicators via presence
    typingRef.current = supabase.channel(`typing-${channelName}`)
      .on('presence', { event: 'sync' }, () => {
        const state = typingRef.current.presenceState()
        const typing = Object.values(state).flat().filter((u: any) => u.user_id !== profile.id && u.typing && Date.now() - (u.ts || 0) < 5000).map((u: any) => u.name)
        setTypingUsers(typing)
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await typingRef.current.track({ user_id: profile.id, name: profile.name, typing: false, ts: Date.now() })
        }
      })
  }

  const broadcastTyping = async (isTyping: boolean) => {
    if (typingRef.current) {
      await typingRef.current.track({ user_id: profile.id, name: profile.name, typing: isTyping, ts: Date.now() })
    }
  }

  const uploadAttachment = async (): Promise<{ url: string; name: string; type: string } | null> => {
    if (!attachment) return null
    setUploading(true)
    try {
      const ext = attachment.name.split('.').pop()
      const path = `messages/${profile.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('course-files').upload(path, attachment)
      if (error) { setUploading(false); toast('Failed to upload attachment', 'error'); return null }
      const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(path)
      setUploading(false)
      return { url: urlData.publicUrl, name: attachment.name, type: attachment.type }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to upload attachment', 'error')
      setUploading(false)
      return null
    }
  }

  const sendMessage = async () => {
    if (!profile) return
    if ((!draft.trim() && !attachment) || (!activeContact && !activeGroup)) return
    if (draft.length > 5000) { toast('Message too long (max 5,000 characters)', 'error'); return }
    try {
      const body = sanitizeText(draft.trim())
      const att = await uploadAttachment()

      const msg: any = {
        sender_id: profile.id,
        receiver_id: activeContact?.id || profile.id,
        body: body || (att ? `▸ ${att.name}` : ''),
        ...(att && { attachment_url: att.url, attachment_name: att.name, attachment_type: att.type }),
        ...(activeGroup && { group_id: activeGroup.id }),
      }

      await supabase.from('messages').insert(msg)
      setDraft('')
      setAttachment(null)
      if (fileRef.current) fileRef.current.value = ''
      broadcastTyping(false)
      loadThreads()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send message', 'error')
    }
  }

  const editMessage = async (msgId: string) => {
    if (!profile || !editDraft.trim()) return
    try {
      await supabase.from('messages').update({ body: sanitizeText(editDraft.trim()), edited_at: new Date().toISOString() }).eq('id', msgId).eq('sender_id', profile.id)
      setEditingMsg(null)
      setEditDraft('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to edit message', 'error')
    }
  }

  const deleteMessage = async (msgId: string) => {
    if (!confirm('Delete this message?')) return
    try {
      await supabase.from('messages').update({ deleted: true, body: '' }).eq('id', msgId).eq('sender_id', profile.id)
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete message', 'error')
    }
  }

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        setAttachment(file)
        // Auto-send voice note
        setUploading(true)
        const path = `messages/${profile.id}/${Date.now()}.webm`
        const { error } = await supabase.storage.from('course-files').upload(path, file)
        if (!error) {
          const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(path)
          const msg: any = {
            sender_id: profile.id,
            receiver_id: activeContact?.id || profile.id,
            body: '◈ Voice note',
            attachment_url: urlData.publicUrl,
            attachment_name: file.name,
            attachment_type: 'audio/webm',
            ...(activeGroup && { group_id: activeGroup.id }),
          }
          await supabase.from('messages').insert(msg)
          loadThreads()
        }
        setUploading(false)
        setAttachment(null)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
    } catch {
      toast('Microphone permission denied or unavailable', 'error')
    }
  }

  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) return
    try {
      const members = [...groupMembers, profile.id]
      await supabase.from('message_groups').insert({
        name: groupName.trim(), created_by: profile.id, member_ids: members,
      })
      setGroupModal(false)
      setGroupName('')
      setGroupMembers([])
      loadThreads()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create group', 'error')
    }
  }

  const openThread = (t: ThreadItem) => {
    if (t.type === 'dm') { setActiveGroup(null); setActiveContact(t.contact) }
    else { setActiveContact(null); setActiveGroup(t.group) }
    setMessages([])
  }

  const filteredThreads = search
    ? threads.filter(t => t.type === 'dm' ? t.contact.name.toLowerCase().includes(search.toLowerCase()) : t.group.name.toLowerCase().includes(search.toLowerCase()))
    : threads

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0)
  const senderName = (senderId: string) => contacts.find(c => c.id === senderId)?.name || 'Unknown'

  return (
    <>
      <PageHeader title="MESSAGES" subtitle={totalUnread > 0 ? `${totalUnread} unread` : 'Direct & group messages'} />

      <Modal open={groupModal} onClose={() => setGroupModal(false)} title="Create Group Chat">
        <div style={{ marginBottom: 14 }}>
          <label className="label">Group Name</label>
          <input className="input" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="e.g. Math Study Group" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Members</label>
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
            {contacts.filter(c => c.id !== profile.id).map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12 }}>
                <input type="checkbox" checked={groupMembers.includes(c.id)}
                  onChange={e => setGroupMembers(e.target.checked ? [...groupMembers, c.id] : groupMembers.filter(id => id !== c.id))} />
                <span className="avatar" style={{ width: 20, height: 20, fontSize: 8 }}>{c.avatar}</span>
                {c.name} <span className="tag" style={{ fontSize: 8 }}>{c.role}</span>
              </label>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={createGroup} disabled={!groupName.trim() || groupMembers.length === 0}>Create Group</button>
      </Modal>

      <div className="messaging-container fade-up-2">
        <div className="messaging-sidebar">
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <div className="search-wrap" style={{ margin: 0, flex: 1 }}>
              <Icon name="search" size={12} />
              <input className="search-input" placeholder="Search..." value={search} onChange={e => { setSearch(e.target.value); setThreadPage(0) }} style={{ border: 'none', padding: '6px 0' }} />
            </div>
            <button className="btn btn-xs" onClick={() => setGroupModal(true)} title="New group"><Icon name="users" size={12} /></button>
          </div>
          <div className="messaging-thread-list">
            {loading && <div style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)' }}>Loading...</div>}
            {filteredThreads.slice(threadPage * PAGE_SIZE, (threadPage + 1) * PAGE_SIZE).map((t, i) => {
              const isActive = t.type === 'dm' ? activeContact?.id === t.contact.id : activeGroup?.id === t.group.id
              const name = t.type === 'dm' ? t.contact.name : `◇ ${t.group.name}`
              const avatar = t.type === 'dm' ? t.contact.avatar : '◇'
              const preview = t.lastMsg ? (t.lastMsg.sender_id === profile.id ? 'You: ' : '') + t.lastMsg.body.slice(0, 35) : ''
              return (
                <div key={t.type === 'dm' ? t.contact.id : t.group.id} className={`messaging-thread ${isActive ? 'active' : ''}`} onClick={() => openThread(t)}>
                  <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, flexShrink: 0 }}>{avatar}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{name}</span>
                      {t.type === 'dm' && <span className={`tag ${t.contact.role === 'teacher' ? 'tag-warn' : t.contact.role === 'admin' ? 'tag-danger' : 'tag-success'}`} style={{ fontSize: 8 }}>{t.contact.role}</span>}
                      {t.type === 'group' && <span className="tag" style={{ fontSize: 8 }}>GROUP</span>}
                    </div>
                    {preview && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>}
                  </div>
                  {t.unread > 0 && <div className="messaging-unread">{t.unread}</div>}
                </div>
              )
            })}
            <Pagination page={threadPage} totalPages={Math.ceil(filteredThreads.length / PAGE_SIZE)} onPageChange={setThreadPage} />
          </div>
        </div>

        <div className="messaging-chat">
          {(activeContact || activeGroup) ? (
            <>
              <div className="messaging-chat-header">
                <button className="btn btn-xs messaging-back-btn" onClick={() => { setActiveContact(null); setActiveGroup(null) }}><Icon name="arrow" size={12} /></button>
                <div className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>{activeContact?.avatar || '◇'}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{activeContact?.name || activeGroup?.name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)' }}>
                    {activeContact ? `${activeContact.role} · ${activeContact.qgx_id}` : `${activeGroup?.member_ids.length || 0} members`}
                  </div>
                </div>
                {typingUsers.length > 0 && (
                  <div style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', animation: 'pulse 1.5s infinite' }}>
                    {typingUsers.join(', ')} typing...
                  </div>
                )}
              </div>
              <div className="messaging-messages">
                {messages.map(m => {
                  const isMine = m.sender_id === profile.id
                  return (
                    <div key={m.id} className={`messaging-bubble ${isMine ? 'sent' : 'received'}`}>
                      {activeGroup && !isMine && (
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', marginBottom: 2 }}>{senderName(m.sender_id)}</div>
                      )}
                      {editingMsg === m.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <input className="input" value={editDraft} onChange={e => setEditDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') editMessage(m.id); if (e.key === 'Escape') setEditingMsg(null) }}
                            autoFocus style={{ fontSize: 12, height: 28, flex: 1 }} />
                          <button className="btn btn-xs btn-primary" onClick={() => editMessage(m.id)}>✓</button>
                        </div>
                      ) : (
                        <>
                          <div className="messaging-bubble-body">{m.body}</div>
                          {m.attachment_url && (
                            <a href={m.attachment_url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)', marginTop: 4, textDecoration: 'none' }}>
                              ▸ {m.attachment_name || 'Attachment'}
                            </a>
                          )}
                        </>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="messaging-bubble-time">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {m.edited_at && <span style={{ marginLeft: 4, fontStyle: 'italic' }}>(edited)</span>}
                        </div>
                        {isMine && !editingMsg && (
                          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                            <button onClick={() => { setEditingMsg(m.id); setEditDraft(m.body) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--fg-dim)', padding: '0 2px' }} title="Edit">▫</button>
                            <button onClick={() => deleteMessage(m.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--fg-dim)', padding: '0 2px' }} title="Delete">×</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div className="messaging-input-bar">
                <input ref={fileRef} type="file" style={{ display: 'none' }}
                  onChange={e => setAttachment(e.target.files?.[0] || null)} />
                <button className="btn btn-xs" onClick={() => fileRef.current?.click()} title="Attach file" style={{ flexShrink: 0 }}>
                  ▸
                </button>
                <button className={`btn btn-xs ${recording ? 'btn-primary' : ''}`} onClick={toggleRecording} title={recording ? 'Stop recording' : 'Voice note'} style={{ flexShrink: 0 }}>
                  {recording ? '■' : '◈'}
                </button>
                {attachment && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {attachment.name}
                  </div>
                )}
                <input
                  className="input"
                  placeholder="Type a message..."
                  value={draft}
                  onChange={e => { setDraft(e.target.value); broadcastTyping(e.target.value.length > 0) }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  onBlur={() => broadcastTyping(false)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={(!draft.trim() && !attachment) || uploading}>
                  {uploading ? '...' : <><Icon name="chat" size={12} /> Send</>}
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--fg-dim)' }}>
              <Icon name="chat" size={32} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>Select a conversation or create a group chat</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
