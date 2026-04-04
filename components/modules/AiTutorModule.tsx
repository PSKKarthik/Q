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

export function AiTutorModule({ profile, courses, enrolledIds }: Props) {
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState<string>('')
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const enrolledCourses = courses.filter(c => enrolledIds.includes(c.id))

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if ((!input.trim() && !attachedFile) || loading) return
    if (input.length > 2000) { toast('Message too long (max 2,000 characters)', 'error'); return }
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim() || (attachedFile ? `📎 ${attachedFile.name}` : ''),
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
          history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
          file: fileToSend ? {
            name: fileToSend.name,
            type: fileToSend.type,
            data: fileToSend.data,
            mimeType: fileToSend.mimeType,
          } : undefined,
        }),
      })

      const data = await res.json()
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || data.error || 'Sorry, I could not process that request.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Connection error. Please check your internet and try again.',
        timestamp: new Date(),
      }])
    }
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
        <button className="btn btn-sm" onClick={() => { setMessages([]); setInput('') }}>Clear Chat</button>
      </div>

      {/* Chat area */}
      <div className="card fade-up-2" style={{ height: 'calc(100vh - 340px)', minHeight: 300, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🤖</div>
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
                borderRadius: 12,
                background: msg.role === 'user' ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                color: msg.role === 'user' ? '#000' : 'var(--fg)',
              }}>
                {msg.fileName && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, opacity: 0.7, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="upload" size={10} /> {msg.fileName}
                  </div>
                )}
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, opacity: 0.5, marginTop: 4 }}>
                  {msg.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Thinking...</div>
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
                borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)',
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
              <Icon name="plus" size={11} /> Send
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
