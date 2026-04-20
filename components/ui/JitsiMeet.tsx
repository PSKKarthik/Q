'use client'
import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    JitsiMeetExternalAPI: any
  }
}

interface JitsiMeetProps {
  roomName: string
  displayName: string
  onClose: () => void
  subject?: string
  height?: string
  /** Extra buttons rendered in the header bar (e.g. "End Class") */
  actions?: React.ReactNode
}

const JITSI_SCRIPT_SRC = 'https://meet.jit.si/external_api.js'
const CONNECTION_TIMEOUT_MS = 30_000

export function JitsiMeet({ roomName, displayName, onClose, subject, height = 'calc(100vh - 180px)', actions }: JitsiMeetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<any>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const connectedRef = useRef(false)   // tracks join success — avoids stale `loading` closure
  const onCloseRef = useRef(onClose)   // always up-to-date reference to onClose
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Keep onCloseRef current every render without re-running the effect
  onCloseRef.current = onClose

  useEffect(() => {
    connectedRef.current = false

    const handleError = () => {
      clearTimeout(timeoutRef.current)
      setLoadError(true)
      setLoading(false)
    }

    const initJitsi = () => {
      if (!containerRef.current || apiRef.current) return
      try {
        apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
          roomName,
          parentNode: containerRef.current,
          userInfo: { displayName },
          configOverwrite: {
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            // prejoinConfig replaces the deprecated prejoinPageEnabled
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            // toolbarButtons replaces the deprecated interfaceConfigOverwrite.TOOLBAR_BUTTONS
            toolbarButtons: [
              'microphone', 'camera', 'desktop', 'chat',
              'raisehand', 'participants-pane', 'tileview',
              'fullscreen', 'hangup',
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            DEFAULT_BACKGROUND: '#000',
          },
        })

        // Use connectedRef (not `loading`) — `loading` is stale inside this closure
        timeoutRef.current = setTimeout(() => {
          if (!connectedRef.current) handleError()
        }, CONNECTION_TIMEOUT_MS)

        apiRef.current.addEventListener('videoConferenceJoined', () => {
          connectedRef.current = true
          clearTimeout(timeoutRef.current)
          setLoading(false)
        })
        // Use ref so we always call the current onClose even if parent re-renders
        apiRef.current.addEventListener('readyToClose', () => onCloseRef.current())
        apiRef.current.addEventListener('errorOccurred', handleError)
      } catch {
        handleError()
      }
    }

    if (window.JitsiMeetExternalAPI) {
      initJitsi()
    } else {
      // Avoid injecting the script twice if another JitsiMeet is already loading it
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${JITSI_SCRIPT_SRC}"]`)
      if (existing) {
        // Script already in DOM — wait for it or use API if already loaded
        if (window.JitsiMeetExternalAPI) {
          initJitsi()
        } else {
          existing.addEventListener('load', initJitsi, { once: true })
          existing.addEventListener('error', handleError, { once: true })
        }
      } else {
        const script = document.createElement('script')
        script.src = JITSI_SCRIPT_SRC
        script.async = true
        script.onload = initJitsi
        script.onerror = handleError
        document.head.appendChild(script)
      }
    }

    return () => {
      clearTimeout(timeoutRef.current)
      if (apiRef.current) {
        try { apiRef.current.dispose() } catch { /* ignore */ }
        apiRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, displayName])

  const openInTab = () => {
    window.open(
      `https://meet.jit.si/${encodeURIComponent(roomName)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          {subject && (
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, letterSpacing: '0.08em' }}>{subject}</div>
          )}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Room: {roomName}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actions}
          <button className="btn btn-sm" onClick={openInTab}>
            Open in Tab ↗
          </button>
          <button className="btn btn-sm" onClick={onClose}>← Back</button>
        </div>
      </div>

      {/* Video container */}
      <div style={{ position: 'relative', width: '100%', height, minHeight: 400, border: '1px solid var(--border)', background: '#000', overflow: 'hidden' }}>
        {/* Loading overlay */}
        {loading && !loadError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            background: '#000', zIndex: 2,
          }}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.08em' }}>
              CONNECTING TO {roomName.toUpperCase()}...
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>
              Slow to load?{' '}
              <button onClick={openInTab} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, textDecoration: 'underline', padding: 0 }}>
                Open in browser tab ↗
              </button>
            </span>
          </div>
        )}
        {/* Error state */}
        {loadError && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            background: '#000', zIndex: 2,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--danger)', textAlign: 'center', maxWidth: 320 }}>
              △ Could not load embedded call.
            </div>
            <button className="btn btn-sm btn-primary" onClick={openInTab}>
              Open in Browser Tab ↗
            </button>
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
