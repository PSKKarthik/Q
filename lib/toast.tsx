'use client'
import { createContext, useContext, useState, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'error' | 'success' | 'info'
}

const ToastCtx = createContext<{
  toast: (msg: string, type?: Toast['type']) => void
}>({ toast: () => {} })

export function useToast() { return useContext(ToastCtx) }

let _nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = ++_nextId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
          {toasts.map(t => (
            <div key={t.id} className="toast-item" style={{
              padding: '12px 18px',
              borderRadius: 8,
              fontFamily: 'var(--mono)',
              fontSize: 12,
              lineHeight: 1.5,
              border: '1px solid',
              borderColor: t.type === 'error' ? 'var(--danger)' : t.type === 'success' ? 'var(--success)' : 'var(--border)',
              background: t.type === 'error' ? 'rgba(255,59,59,0.12)' : t.type === 'success' ? 'rgba(0,230,118,0.12)' : 'var(--card)',
              color: 'var(--fg)',
              backdropFilter: 'blur(12px)',
              animation: 'fadeUp 0.2s ease',
            }}>
              <span style={{ marginRight: 8 }}>{t.type === 'error' ? '✗' : t.type === 'success' ? '✓' : 'ℹ'}</span>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  )
}
