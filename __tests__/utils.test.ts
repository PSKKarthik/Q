import { sanitizeText, generateQGXId, fisher_yates, getLevel, getTier, formatSize, getFileIcon, formatTimer, isSafeRedirect, DEFAULT_XP_LEVELS } from '@/lib/utils'

// ─── sanitizeText ───
describe('sanitizeText', () => {
  it('strips HTML tags', () => {
    expect(sanitizeText('<script>alert("xss")</script>')).toBe('alert("xss")')
    expect(sanitizeText('Hello <b>World</b>')).toBe('Hello World')
  })

  it('returns empty string for falsy input', () => {
    expect(sanitizeText('')).toBe('')
    expect(sanitizeText(null as any)).toBe('')
    expect(sanitizeText(undefined as any)).toBe('')
  })

  it('leaves plain text unchanged', () => {
    expect(sanitizeText('Hello World')).toBe('Hello World')
  })
})

// ─── generateQGXId ───
describe('generateQGXId', () => {
  it('generates correct prefix for each role', () => {
    expect(generateQGXId('admin', 0)).toBe('QGX-A0001')
    expect(generateQGXId('teacher', 4)).toBe('QGX-T0005')
    expect(generateQGXId('student', 99)).toBe('QGX-S0100')
    expect(generateQGXId('parent', 0)).toBe('QGX-P0001')
  })

  it('pads count to 4 digits', () => {
    expect(generateQGXId('student', 0)).toBe('QGX-S0001')
    expect(generateQGXId('student', 9998)).toBe('QGX-S9999')
  })
})

// ─── fisher_yates shuffle ───
describe('fisher_yates', () => {
  it('returns array of same length', () => {
    const arr = [1, 2, 3, 4, 5]
    const shuffled = fisher_yates(arr)
    expect(shuffled).toHaveLength(5)
  })

  it('contains all original elements', () => {
    const arr = [1, 2, 3, 4, 5]
    const shuffled = fisher_yates(arr)
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('does not mutate the original array', () => {
    const arr = [1, 2, 3]
    fisher_yates(arr)
    expect(arr).toEqual([1, 2, 3])
  })

  it('handles empty array', () => {
    expect(fisher_yates([])).toEqual([])
  })

  it('handles single element', () => {
    expect(fisher_yates([42])).toEqual([42])
  })
})

// ─── getLevel (XP system) ───
describe('getLevel', () => {
  it('returns ROOKIE for 0 XP', () => {
    const level = getLevel(0)
    expect(level.name).toBe('ROOKIE')
    expect(level.level).toBe(1)
  })

  it('returns SCHOLAR at 500 XP', () => {
    const level = getLevel(500)
    expect(level.name).toBe('SCHOLAR')
  })

  it('returns ACHIEVER at 1000 XP', () => {
    const level = getLevel(1000)
    expect(level.name).toBe('ACHIEVER')
  })

  it('returns ELITE at 2000 XP', () => {
    expect(getLevel(2000).name).toBe('ELITE')
  })

  it('returns LEGEND at 3500 XP', () => {
    expect(getLevel(3500).name).toBe('LEGEND')
  })

  it('returns MYTHIC at 5000 XP', () => {
    expect(getLevel(5000).name).toBe('MYTHIC')
  })

  it('returns IMMORTAL at 7500+ XP', () => {
    expect(getLevel(7500).name).toBe('IMMORTAL')
    expect(getLevel(10000).name).toBe('IMMORTAL')
  })

  it('calculates progress correctly mid-level', () => {
    // At 250 XP: between ROOKIE (0) and SCHOLAR (500) → 50%
    const level = getLevel(250)
    expect(level.name).toBe('ROOKIE')
    expect(level.progress).toBe(50)
    expect(level.xpToNext).toBe(250)
  })

  it('shows 100% progress at max level', () => {
    const level = getLevel(7500)
    expect(level.progress).toBe(100)
    expect(level.xpToNext).toBe(0)
  })

  it('identifies next level correctly', () => {
    const level = getLevel(600)
    expect(level.name).toBe('SCHOLAR')
    expect(level.next?.name).toBe('ACHIEVER')
    expect(level.next?.xp).toBe(1000)
  })

  it('has no next level at IMMORTAL', () => {
    const level = getLevel(8000)
    expect(level.next).toBeNull()
  })

  it('uses custom levels when provided', () => {
    const custom = [
      { level: 1, name: 'NOOB', xp: 0, icon: '◇', color: '#aaa' },
      { level: 2, name: 'PRO', xp: 100, icon: '★', color: '#fff' },
    ]
    expect(getLevel(50, custom).name).toBe('NOOB')
    expect(getLevel(100, custom).name).toBe('PRO')
  })
})

// ─── getTier ───
describe('getTier', () => {
  it('returns correct tier labels at boundaries', () => {
    expect(getTier(0).label).toBe('ROOKIE')
    expect(getTier(500).label).toBe('ROOKIE')
    expect(getTier(501).label).toBe('SCHOLAR')
    expect(getTier(1001).label).toBe('ACHIEVER')
    expect(getTier(2001).label).toBe('ELITE')
    expect(getTier(3501).label).toBe('LEGEND')
    expect(getTier(5001).label).toBe('MYTHIC')
    expect(getTier(7501).label).toBe('IMMORTAL')
  })
})

// ─── formatSize ───
describe('formatSize', () => {
  it('returns empty for 0 or falsy', () => {
    expect(formatSize(0)).toBe('')
    expect(formatSize(null as any)).toBe('')
  })

  it('formats bytes', () => {
    expect(formatSize(512)).toBe('512B')
  })

  it('formats kilobytes', () => {
    expect(formatSize(2048)).toBe('2.0KB')
  })

  it('formats megabytes', () => {
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0MB')
  })
})

// ─── getFileIcon ───
describe('getFileIcon', () => {
  it('returns correct icons for file types', () => {
    expect(getFileIcon('application/pdf')).toBe('▪')
    expect(getFileIcon('video/mp4')).toBe('▸')
    expect(getFileIcon('image/png')).toBe('◇')
    expect(getFileIcon('application/zip')).toBe('◈')
    expect(getFileIcon('text/plain')).toBe('▪')
  })

  it('returns default icon for unknown type', () => {
    expect(getFileIcon('')).toBe('▪')
    expect(getFileIcon('application/octet-stream')).toBe('▪')
  })
})

// ─── formatTimer ───
describe('formatTimer', () => {
  it('formats seconds only', () => {
    expect(formatTimer(45)).toBe('45 sec')
  })

  it('formats minutes and seconds', () => {
    expect(formatTimer(125)).toBe('2 min 05 sec')
  })

  it('pads seconds to 2 digits with minutes', () => {
    expect(formatTimer(61)).toBe('1 min 01 sec')
  })

  it('handles zero', () => {
    expect(formatTimer(0)).toBe('0 sec')
  })

  it('handles exact minutes', () => {
    expect(formatTimer(120)).toBe('2 min 00 sec')
  })
})

// ─── isSafeRedirect ───
describe('isSafeRedirect', () => {
  it('allows /dashboard/* paths', () => {
    expect(isSafeRedirect('/dashboard/student')).toBe(true)
    expect(isSafeRedirect('/dashboard/teacher')).toBe(true)
    expect(isSafeRedirect('/dashboard/admin')).toBe(true)
    expect(isSafeRedirect('/dashboard/parent')).toBe(true)
    expect(isSafeRedirect('/dashboard/admin/settings')).toBe(true)
  })

  it('blocks protocol-relative URLs', () => {
    expect(isSafeRedirect('//evil.com')).toBe(false)
    expect(isSafeRedirect('//evil.com/dashboard/student')).toBe(false)
  })

  it('blocks external http/https URLs', () => {
    expect(isSafeRedirect('https://evil.com')).toBe(false)
    expect(isSafeRedirect('http://evil.com/dashboard/student')).toBe(false)
  })

  it('blocks empty and falsy values', () => {
    expect(isSafeRedirect('')).toBe(false)
    expect(isSafeRedirect(null as any)).toBe(false)
    expect(isSafeRedirect(undefined as any)).toBe(false)
  })

  it('blocks non-dashboard internal paths', () => {
    expect(isSafeRedirect('/login')).toBe(false)
    expect(isSafeRedirect('/register')).toBe(false)
    expect(isSafeRedirect('/')).toBe(false)
    expect(isSafeRedirect('/api/ai')).toBe(false)
  })

  it('blocks javascript: and data: URIs', () => {
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false)
    expect(isSafeRedirect('data:text/html,<script>alert(1)</script>')).toBe(false)
  })
})
