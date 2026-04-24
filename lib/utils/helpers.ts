import type { Role } from '@/types'

/** Strip HTML tags as defense-in-depth (React auto-escapes, but this guards against dangerouslySetInnerHTML misuse) */
export function sanitizeText(text: string): string {
  if (!text) return ''
  return text.replace(/<[^>]*>/g, '')
}

/**
 * Validates that a redirect path is safe for use — prevents open-redirect attacks.
 * Only allows paths that start with /dashboard/ (never // or external URLs).
 */
export function isSafeRedirect(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  return path.startsWith('/dashboard/')
}

export function generateQGXId(role: Role, count: number): string {
  const prefix = role === 'admin' ? 'A' : role === 'teacher' ? 'T' : role === 'parent' ? 'P' : 'S'
  return `QGX-${prefix}${String(count + 1).padStart(4, '0')}`
}

export function fisher_yates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface XPLevel {
  level: number
  name: string
  xp: number
  icon: string
  color: string
}

export const DEFAULT_XP_LEVELS: XPLevel[] = [
  { level: 1, name: 'ROOKIE',   xp: 0,    icon: '◇', color: '#6b7280' },
  { level: 2, name: 'SCHOLAR',  xp: 500,  icon: '◈', color: '#10b981' },
  { level: 3, name: 'ACHIEVER', xp: 1000, icon: '◆', color: '#f59e0b' },
  { level: 4, name: 'ELITE',    xp: 2000, icon: '★', color: '#ff9500' },
  { level: 5, name: 'LEGEND',   xp: 3500, icon: '◆', color: '#ef4444' },
  { level: 6, name: 'MYTHIC',   xp: 5000, icon: '◈', color: '#8b5cf6' },
  { level: 7, name: 'IMMORTAL', xp: 7500, icon: '■', color: '#ec4899' },
]

export function getLevel(xp: number, levels?: XPLevel[]) {
  const lvls = (levels && levels.length >= 2) ? levels : DEFAULT_XP_LEVELS
  const sorted = [...lvls].sort((a, b) => b.xp - a.xp)
  const current = sorted.find(l => xp >= l.xp) || sorted[sorted.length - 1]
  const currentIdx = lvls.findIndex(l => l.level === current.level)
  const next = currentIdx < lvls.length - 1 ? lvls[currentIdx + 1] : null
  const progress = next
    ? Math.min(((xp - current.xp) / (next.xp - current.xp)) * 100, 100)
    : 100
  const xpToNext = next ? next.xp - xp : 0
  return { ...current, idx: currentIdx, next, progress, xpToNext }
}

export function getTier(xp: number) {
  if (xp <= 500)  return { label: 'ROOKIE',    color: 'var(--fg-dim)' }
  if (xp <= 1000) return { label: 'SCHOLAR',   color: 'var(--success)' }
  if (xp <= 2000) return { label: 'ACHIEVER',  color: 'var(--warn)' }
  if (xp <= 3500) return { label: 'ELITE',     color: '#ff9500' }
  if (xp <= 5000) return { label: 'LEGEND',    color: 'var(--danger)' }
  if (xp <= 7500) return { label: 'MYTHIC',    color: '#8b5cf6' }
  return                  { label: 'IMMORTAL',  color: '#ec4899' }
}

export function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function getFileIcon(type: string): string {
  if (!type) return '▪'
  if (type.includes('pdf')) return '▪'
  if (type.includes('video')) return '▸'
  if (type.includes('image')) return '◇'
  if (type.includes('word') || type.includes('document')) return '▫'
  if (type.includes('sheet') || type.includes('excel')) return '▪'
  if (type.includes('zip')) return '◈'
  return '▪'
}

/** Export tabular data as CSV file download */
export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} sec` : `${s} sec`
}
