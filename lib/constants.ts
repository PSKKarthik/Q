import type { AntiCheat } from '@/types'

export const DEFAULT_ANTICHEAT: AntiCheat = {
  tabSwitch: false,
  copyPaste: false,
  randomQ: false,
  randomOpts: false,
  fullscreen: false,
  timePerQ: 0,
  maxAttempts: 1,
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const PAGE_SIZE = 20
export const MAX_XP_PER_TEST = 500
export const DOUBLE_XP_DURATION_MS = 3_600_000 // 1 hour
export const DEBOUNCE_MS = 300
export const NOTIFICATION_LIMIT = 10
export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
