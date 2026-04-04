import { DEFAULT_ANTICHEAT, DAYS, PAGE_SIZE, MAX_XP_PER_TEST, MAX_FILE_SIZE, DEBOUNCE_MS } from '@/lib/constants'

describe('constants', () => {
  describe('DEFAULT_ANTICHEAT', () => {
    it('has all anti-cheat fields defaulting to safe values', () => {
      expect(DEFAULT_ANTICHEAT.tabSwitch).toBe(false)
      expect(DEFAULT_ANTICHEAT.copyPaste).toBe(false)
      expect(DEFAULT_ANTICHEAT.randomQ).toBe(false)
      expect(DEFAULT_ANTICHEAT.randomOpts).toBe(false)
      expect(DEFAULT_ANTICHEAT.fullscreen).toBe(false)
      expect(DEFAULT_ANTICHEAT.timePerQ).toBe(0)
      expect(DEFAULT_ANTICHEAT.maxAttempts).toBe(1)
    })
  })

  describe('DAYS', () => {
    it('contains 6 school days', () => {
      expect(DAYS).toHaveLength(6)
      expect(DAYS).toContain('Monday')
      expect(DAYS).toContain('Saturday')
      expect(DAYS).not.toContain('Sunday')
    })
  })

  describe('limits', () => {
    it('PAGE_SIZE is reasonable', () => {
      expect(PAGE_SIZE).toBeGreaterThanOrEqual(10)
      expect(PAGE_SIZE).toBeLessThanOrEqual(100)
    })

    it('MAX_XP_PER_TEST caps at 500', () => {
      expect(MAX_XP_PER_TEST).toBe(500)
    })

    it('MAX_FILE_SIZE is 50MB', () => {
      expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024)
    })

    it('DEBOUNCE_MS is positive', () => {
      expect(DEBOUNCE_MS).toBeGreaterThan(0)
    })
  })
})
