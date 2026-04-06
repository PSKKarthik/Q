'use client'
import { useEffect, useRef } from 'react'

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
}

export function JitsiMeet({ roomName, displayName, onClose, subject, height = 'calc(100vh - 180px)' }: JitsiMeetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<any>(null)

  useEffect(() => {
    let script: HTMLScriptElement | null = null

    const initJitsi = () => {
      if (!containerRef.current || apiRef.current) return
      apiRef.current = new window.JitsiMeetExternalAPI('meet.jit.si', {
        roomName,
        parentNode: containerRef.current,
        userInfo: { displayName },
        configOverrides: {
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverrides: {
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

      apiRef.current.addEventListener('readyToClose', onClose)

      // Style the iframe to fill the container
      const iframe = containerRef.current?.querySelector('iframe')
      if (iframe) {
        iframe.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.border = 'none'
      }
    }

    // Load Jitsi External API script if not already loaded
    if (window.JitsiMeetExternalAPI) {
      initJitsi()
    } else {
      script = document.createElement('script')
      script.src = 'https://meet.jit.si/external_api.js'
      script.async = true
      script.onload = initJitsi
      script.onerror = () => {
        // Fallback: open in new tab if script fails to load
        window.open(`https://meet.jit.si/${roomName}#userInfo.displayName="${encodeURIComponent(displayName)}"`, '_blank', 'noopener,noreferrer')
        onClose()
      }
      document.head.appendChild(script)
    }

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose()
        apiRef.current = null
      }
    }
  }, [roomName, displayName, onClose])

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {subject && (
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '0.08em' }}>{subject}</div>
          )}
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Room: {roomName}
          </div>
        </div>
        <button className="btn btn-sm" onClick={onClose}>← Back</button>
      </div>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          minHeight: 400,
          border: '1px solid var(--border)',
          background: '#000',
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
