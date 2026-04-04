'use client'
import { useEffect, useRef, useId } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  width?: number
  children: ReactNode
}

export function Modal({ open, onClose, title, width, children }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  // Keep ref in sync without adding onClose to effect deps (avoids re-running on every render)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    // ESC key handler — uses ref so no stale closure issues
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', handleKey)

    // Focus trap — only runs once when modal opens, NOT on every parent re-render
    const dialog = dialogRef.current
    const prev = document.activeElement as HTMLElement | null
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable?.length) { focusable[0].focus() } else { dialog?.setAttribute('tabindex', '-1'); dialog?.focus() }

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !focusable?.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus() } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus() } }
    }
    document.addEventListener('keydown', trap)

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('keydown', trap)
      prev?.focus()
    }
  }, [open]) // ← ONLY depend on [open], NOT [onClose] — fixes the global typing bug

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal"
        style={width ? { width } : undefined}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-title" id={titleId}>{title}</div>
        {children}
      </div>
    </div>
  )
}
