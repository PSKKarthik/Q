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

export function JitsiMeet({ roomName, displayName, onClose, subject, height = 'calc(100vh - 180px)', actions }: JitsiMeetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let script: HTMLScriptElement | null = null

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
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_BRAND_WATERMARK: false,
            DEFAULT_BACKGROUND: '#000',
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'desktop', 'chat',
              'raisehand', 'participants-pane', 'tileview',
              'fullscreen', 'hangup',
            ],
          },
        })

        apiRef.current.addEventListener('videoConferenceJoined', () => setLoading(false))
        apiRef.current.addEventListener('readyToClose', onClose)

        // Style the iframe to fill the container
        setTimeout(() => {
          const iframe = containerRef.current?.querySelector('iframe')
          if (iframe) {
            iframe.style.width = '100%'
            iframe.style.height = '100%'
            iframe.style.border = 'none'
          }
        }, 500)
      } catch {
        setLoadError(true)
        setLoading(false)
      }
    }

    if (window.JitsiMeetExternalAPI) {
      initJitsi()
    } else {
      script = document.createElement('script')
      script.src = 'https://meet.jit.si/external_api.js'
      script.async = true
      script.onload = initJitsi
      script.onerror = () => {
        setLoadError(true)
        setLoading(false)
      }
      document.head.appendChild(script)
    }

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose()
        apiRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, displayName])

  const openInTab = () => {
    window.open(
      `https://meet.jit.si/${encodeURIComponent(roomName)}#userInfo.displayName=${encodeURIComponent(JSON.stringify(displayName))}`,
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
          {loadError && (
            <button className="btn btn-sm btn-primary" onClick={openInTab}>
              Open in Browser Tab ↗
            </button>
          )}
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
              △ Could not load embedded call.<br />Click &quot;Open in Browser Tab&quot; above to join.
            </div>
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}
