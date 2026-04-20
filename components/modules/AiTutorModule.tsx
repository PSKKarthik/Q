'use client'
import { useState, useRef, useEffect } from 'react'
import type { Profile, Course } from '@/types'
import { useToast } from '@/lib/toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  profile: Profile
  courses: Course[]
  enrolledIds: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  fileName?: string
}

interface AttachedFile {
  name: string
  type: 'image' | 'pdf' | 'ppt'
  data: string
  mimeType: string
}

function renderInline(str: string): JSX.Element {
  const segs = str.split(/(`[^`\n]+`)/g)
  return (
    <>
      {segs.map((seg, i) => {
        if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2)
          return <code key={i} style={{ background: 'rgba(0,0,0,0.4)', padding: '1px 5px', borderRadius: 0, fontSize: '0.85em', fontFamily: 'var(--mono)' }}>{seg.slice(1, -1)}</code>
        const parts = seg.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
        if (parts.length === 1) return seg
        return (
          <span key={i}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={j}>{p.slice(2, -2)}</strong>
              if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={j}>{p.slice(1, -1)}</em>
              return p
            })}
          </span>
        )
      })}
    </>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const nodes: JSX.Element[] = []
  let rem = text
  let k = 0
  while (rem.length > 0) {
    const cb = rem.match(/^```(\w*)\n?([\s\S]*?)```/)
    if (cb) {
      const lang = cb[1]; const code = cb[2].replace(/\n$/, '')
      nodes.push(
        <pre key={k++} style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: 0, overflowX: 'auto', margin: '8px 0' }}>
          {lang && <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 9, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>{lang}</div>}
          <code style={{ fontFamily: 'var(--mono)', fontSize: 11, whiteSpace: 'pre', lineHeight: 1.6 }}>{code}</code>
        </pre>
      )
      rem = rem.slice(cb[0].length).replace(/^\n/, '')
      continue
    }
    const nl = rem.indexOf('\n')
    const line = nl === -1 ? rem : rem.slice(0, nl)
    rem = nl === -1 ? '' : rem.slice(nl + 1)
    if (/^### /.test(line)) nodes.push(<h3 key={k++} style={{ fontSize: 13, fontWeight: 700, margin: '10px 0 3px' }}>{renderInline(line.slice(4))}</h3>)
    else if (/^## /.test(line)) nodes.push(<h2 key={k++} style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 5px', fontFamily: 'var(--display)', letterSpacing: '0.04em' }}>{renderInline(line.slice(3))}</h2>)
    else if (/^# /.test(line)) nodes.push(<h1 key={k++} style={{ fontSize: 17, fontWeight: 700, margin: '12px 0 6px', fontFamily: 'var(--display)' }}>{renderInline(line.slice(2))}</h1>)
    else if (/^[-*] /.test(line)) nodes.push(<div key={k++} style={{ display: 'flex', gap: 7, margin: '2px 0', lineHeight: 1.5 }}><span style={{ color: 'var(--accent)', flexShrink: 0, fontSize: 10, marginTop: 3 }}>▸</span><span style={{ fontSize: 13 }}>{renderInline(line.slice(2))}</span></div>)
    else if (/^\d+\. /.test(line)) { const m = line.match(/^(\d+)\. (.*)$/); if (m) nodes.push(<div key={k++} style={{ display: 'flex', gap: 7, margin: '2px 0', lineHeight: 1.5 }}><span style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 11, flexShrink: 0 }}>{m[1]}.</span><span style={{ fontSize: 13 }}>{renderInline(m[2])}</span></div>) }
    else if (/^> /.test(line)) nodes.push(<div key={k++} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 10, margin: '6px 0', opacity: 0.8, fontStyle: 'italic', fontSize: 13 }}>{renderInline(line.slice(2))}</div>)
    else if (/^---$/.test(line.trim())) nodes.push(<hr key={k++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />)
    else if (line.trim() === '') nodes.push(<div key={k++} style={{ height: 6 }} />)
    else nodes.push(<p key={k++} style={{ margin: '3px 0', fontSize: 13, lineHeight: 1.6 }}>{renderInline(line)}</p>)
  }
  return <>{nodes}</>
}

export function AiTutorModule({ profile, courses, enrolledIds }: Props) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const storageKey = `qgx-ai-tutor-${profile.id}`

  const enrolledCourses = courses.filter(c => enrolledIds.includes(c.id))

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { selectedCourse?: string; messages?: Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }> }
      if (parsed.selectedCourse) setSelectedCourse(parsed.selectedCourse)
      if (parsed.messages?.length) {
        setMessages(parsed.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })))
      }
    } catch {
      // ignore malformed storage
    }
  }, [storageKey])

  useEffect(() => {
    const payload = {
      selectedCourse,
      messages: messages.slice(-30).map(m => ({ ...m, timestamp: m.timestamp.toISOString() })),
    }
    sessionStorage.setItem(storageKey, JSON.stringify(payload))
  }, [messages, selectedCourse, storageKey])

  const sendMessage = async () => {
    if ((!input.trim() && !attachedFile) || loading) return
    if (input.length > 2000) { toast('Message too long (max 2,000 characters)', 'error'); return }
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim() || (attachedFile ? `▸ ${attachedFile.name}` : ''),
      timestamp: new Date(),
      fileName: attachedFile?.name,
    }
    const fileToSend = attachedFile
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setAttachedFile(null)
    setLoading(true)

    try {
      const courseContext = selectedCourse
        ? enrolledCourses.find(c => c.id === selectedCourse)?.title || ''
        : ''

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'tutor',
          message: input.trim(),
          courseContext,
          history: messages.slice(-12).map(m => ({ role: m.role, content: m.content })),
          file: fileToSend ? {
            name: fileToSend.name,
            type: fileToSend.type,
            data: fileToSend.data,
            mimeType: fileToSend.mimeType,
          } : undefined,
        }),
      })

      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        const assistantId = (Date.now() + 1).toString()
        setIsStreaming(true)
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }])
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') continue
            try {
              const chunk = JSON.parse(payload)
              const token: string = chunk.choices?.[0]?.delta?.content ?? ''
              if (token) setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + token } : m))
            } catch { /* skip malformed chunk */ }
          }
        }
      } else {
        const json = await res.json()
        const reply = json.data?.reply || json.reply || json.error || 'Sorry, I could not process that request.'
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: reply,
          timestamp: new Date(),
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Connection error. Please check your internet and try again.',
        timestamp: new Date(),
      }])
    }
    setIsStreaming(false)
    setLoading(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) { toast('File too large. Maximum 5MB.', 'error'); return }
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]
    if (!allowedTypes.includes(file.type)) {
      toast('Unsupported file type. Use images, PDF, or PPT/PPTX.', 'error'); return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setAttachedFile({
        name: file.name,
        type: file.type.startsWith('image/') ? 'image' : file.type.includes('pdf') ? 'pdf' : 'ppt',
        data: base64,
        mimeType: file.type,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <>
      <PageHeader title="AI TUTOR" subtitle="Ask questions about your courses" />

      <div className="fade-up-1" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select className="input" value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} style={{ width: 260 }}>
          <option value="">General (no course context)</option>
          {enrolledCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <button className="btn btn-sm" onClick={() => { setMessages([]); setInput(''); sessionStorage.removeItem(storageKey) }}>Clear Chat</button>
      </div>

      {/* Chat area */}
      <div className="card fade-up-2" style={{ height: 'calc(100vh - 340px)', minHeight: 300, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>◈</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 20, marginBottom: 8 }}>QGX AI TUTOR</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', lineHeight: 1.8 }}>
                Ask me anything about your courses!<br />
                Select a course for context-aware answers.<br />
                I can explain concepts, solve problems, and quiz you.<br />
                Upload images, PDFs, or PPTs for AI analysis.
              </div>
              <div style={{ marginTop: 20, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['Explain this concept', 'Give me a practice problem', 'Summarize the topic', 'Quiz me', 'Analyze my upload'].map(suggestion => (
                  <button key={suggestion} className="btn btn-sm" onClick={() => { setInput(suggestion); }}
                    style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{suggestion}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{ marginBottom: 12, display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '75%',
                padding: '10px 14px',
                borderRadius: 0,
                background: msg.role === 'user' ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                color: msg.role === 'user' ? '#000' : 'var(--fg)',
              }}>
                {msg.fileName && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.7, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="upload" size={10} /> {msg.fileName}
                  </div>
                )}
                {msg.role === 'assistant'
                  ? <MarkdownContent text={msg.content} />
                  : <div style={{ fontSize: 13, lineHeight: 1.6 }}>{msg.content}</div>
                }
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, opacity: 0.5, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {msg.timestamp.toLocaleTimeString()}
                  {msg.role === 'assistant' && msg.content && (
                    <button onClick={() => navigator.clipboard.writeText(msg.content).then(() => toast('Copied!', 'success'))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontFamily: 'var(--mono)', fontSize: 9, opacity: 0.8 }}>copy</button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {loading && !isStreaming && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div style={{ padding: '10px 16px', borderRadius: 0, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, color: 'var(--fg-dim)', letterSpacing: 4, lineHeight: 1 }}>···</div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {attachedFile && (
            <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', background: 'rgba(128,128,128,0.12)',
                borderRadius: 0, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)',
              }}>
                <Icon name="upload" size={10} />
                {attachedFile.name}
                <button onClick={() => setAttachedFile(null)} style={{ background: 'none', border: 'none', color: 'var(--fg-dim)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <Icon name="x" size={10} />
                </button>
              </div>
            </div>
          )}
          <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.ppt,.pptx" onChange={handleFileSelect} style={{ display: 'none' }} />
            <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()} disabled={loading}
              title="Upload image, PDF, or PPT" style={{ flexShrink: 0, padding: '6px 10px' }}>
              <Icon name="upload" size={13} />
            </button>
            <input className="input" placeholder={attachedFile ? 'Add a message about the file...' : 'Ask a question...'} value={input}
              onChange={e => setInput(e.target.value.slice(0, 2000))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              style={{ flex: 1 }} disabled={loading} maxLength={2000} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: input.length > 1800 ? 'var(--danger)' : 'var(--fg-dim)', flexShrink: 0 }}>{input.length}/2000</span>
            <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={loading || (!input.trim() && !attachedFile)}>
              <Icon name="arrow" size={12} /> Send
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
