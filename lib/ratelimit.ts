/**
 * Redis-backed rate limiter via Upstash.
 *
 * Requires env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * Falls back to a simple in-memory limiter when those vars are absent
 * (local development only — not safe for multi-instance production).
 */

type RateLimitResult = { success: boolean; remaining: number }

// ─── Redis path ──────────────────────────────────────────────────────────────
let redisLimiter: ((id: string) => Promise<RateLimitResult>) | null = null

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  // Dynamic import keeps the module tree-shakeable in non-Redis builds
  const init = async () => {
    const { Ratelimit } = await import('@upstash/ratelimit')
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      prefix: 'qgx:rl',
    })
    redisLimiter = async (id: string) => {
      const result = await rl.limit(id)
      return { success: result.success, remaining: result.remaining }
    }
  }
  init().catch(() => {
    // Redis initialisation failed — fall back to in-memory silently
    redisLimiter = null
  })
}

// ─── In-memory fallback (dev / Redis unavailable) ────────────────────────────
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10
const rateMap = new Map<string, number[]>()

function inMemoryLimit(userId: string): RateLimitResult {
  const now = Date.now()
  const timestamps = (rateMap.get(userId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS
  )
  if (timestamps.length >= RATE_LIMIT) {
    rateMap.set(userId, timestamps)
    return { success: false, remaining: 0 }
  }
  timestamps.push(now)
  rateMap.set(userId, timestamps)
  return { success: true, remaining: RATE_LIMIT - timestamps.length }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  if (redisLimiter) {
    try {
      return await redisLimiter(userId)
    } catch {
      // If Redis call fails mid-request, degrade to in-memory
    }
  }
  return inMemoryLimit(userId)
}
