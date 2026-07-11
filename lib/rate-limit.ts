/**
 * MAYA Rate Limiter — In-memory sliding window rate limiting.
 * 
 * For production at scale, replace with Redis (Upstash) or Vercel KV.
 * This in-memory implementation is sufficient for single-instance deploys.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 300_000)

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number
  /** Window duration in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfterSeconds?: number
}

/**
 * Check and consume a rate limit token.
 * @param key - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const entry = store.get(key)

  // Window expired or doesn't exist — reset
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + windowMs }
  }

  // Within window — check limit
  if (entry.count >= config.maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, remaining: 0, resetAt: entry.resetAt, retryAfterSeconds }
  }

  // Allow and increment
  entry.count++
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

/**
 * Extract a rate limit key from a request.
 * Uses X-Forwarded-For header (Vercel/proxy), falls back to a generic key.
 */
export function getRateLimitKey(request: Request, prefix: string = ''): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown'
  return `${prefix}:${ip}`
}

// ─── Pre-configured Limits ──────────────────────────────────────────────────

/** Build API: 3 builds per 10 minutes per IP */
export const BUILD_LIMIT: RateLimitConfig = { maxRequests: 3, windowSeconds: 600 }

/** Chat edit: 20 requests per minute per IP */
export const CHAT_LIMIT: RateLimitConfig = { maxRequests: 20, windowSeconds: 60 }

/** Transcribe: 30 requests per minute per IP */
export const TRANSCRIBE_LIMIT: RateLimitConfig = { maxRequests: 30, windowSeconds: 60 }

/** Health check: 10 per minute (prevent abuse) */
export const HEALTH_LIMIT: RateLimitConfig = { maxRequests: 10, windowSeconds: 60 }

/** General API: 60 requests per minute per IP */
export const GENERAL_LIMIT: RateLimitConfig = { maxRequests: 60, windowSeconds: 60 }
