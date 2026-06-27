import { describe, it, expect } from 'vitest'
import {
  checkRateLimit,
  getRateLimitKey,
  BUILD_LIMIT,
  CHAT_LIMIT,
  TRANSCRIBE_LIMIT,
  HEALTH_LIMIT,
  GENERAL_LIMIT,
} from '@/lib/rate-limit'
import type { RateLimitConfig, RateLimitResult } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  it('allows first request', () => {
    const key = `test-${Date.now()}-first`
    const result = checkRateLimit(key, { maxRequests: 5, windowSeconds: 60 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('tracks remaining requests', () => {
    const key = `test-${Date.now()}-track`
    const config: RateLimitConfig = { maxRequests: 3, windowSeconds: 60 }

    const r1 = checkRateLimit(key, config)
    expect(r1.remaining).toBe(2)

    const r2 = checkRateLimit(key, config)
    expect(r2.remaining).toBe(1)

    const r3 = checkRateLimit(key, config)
    expect(r3.remaining).toBe(0)
    expect(r3.allowed).toBe(true)
  })

  it('blocks after max requests', () => {
    const key = `test-${Date.now()}-block`
    const config: RateLimitConfig = { maxRequests: 2, windowSeconds: 60 }

    checkRateLimit(key, config) // 1
    checkRateLimit(key, config) // 2

    const blocked = checkRateLimit(key, config) // 3 — should be blocked
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('provides retryAfterSeconds when blocked', () => {
    const key = `test-${Date.now()}-retry`
    const config: RateLimitConfig = { maxRequests: 1, windowSeconds: 30 }

    checkRateLimit(key, config)
    const blocked = checkRateLimit(key, config)
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(30)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('returns a resetAt timestamp in the future', () => {
    const key = `test-${Date.now()}-reset`
    const result = checkRateLimit(key, { maxRequests: 10, windowSeconds: 60 })
    expect(result.resetAt).toBeGreaterThan(Date.now())
  })

  it('different keys have independent limits', () => {
    const config: RateLimitConfig = { maxRequests: 1, windowSeconds: 60 }
    const key1 = `test-${Date.now()}-a`
    const key2 = `test-${Date.now()}-b`

    checkRateLimit(key1, config)
    const blocked = checkRateLimit(key1, config)
    expect(blocked.allowed).toBe(false)

    const fresh = checkRateLimit(key2, config)
    expect(fresh.allowed).toBe(true)
  })
})

describe('getRateLimitKey', () => {
  it('extracts IP from X-Forwarded-For header', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    const key = getRateLimitKey(req, 'build')
    expect(key).toBe('build:1.2.3.4')
  })

  it('falls back to "unknown" when no header', () => {
    const req = new Request('http://localhost')
    const key = getRateLimitKey(req)
    expect(key).toBe(':unknown')
  })

  it('prefixes the key', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })
    const key = getRateLimitKey(req, 'chat')
    expect(key).toBe('chat:10.0.0.1')
  })
})

describe('Pre-configured limits', () => {
  it('BUILD_LIMIT: 3 per 10 minutes', () => {
    expect(BUILD_LIMIT.maxRequests).toBe(3)
    expect(BUILD_LIMIT.windowSeconds).toBe(600)
  })

  it('CHAT_LIMIT: 20 per minute', () => {
    expect(CHAT_LIMIT.maxRequests).toBe(20)
    expect(CHAT_LIMIT.windowSeconds).toBe(60)
  })

  it('TRANSCRIBE_LIMIT: 30 per minute', () => {
    expect(TRANSCRIBE_LIMIT.maxRequests).toBe(30)
    expect(TRANSCRIBE_LIMIT.windowSeconds).toBe(60)
  })

  it('HEALTH_LIMIT: 10 per minute', () => {
    expect(HEALTH_LIMIT.maxRequests).toBe(10)
    expect(HEALTH_LIMIT.windowSeconds).toBe(60)
  })

  it('GENERAL_LIMIT: 60 per minute', () => {
    expect(GENERAL_LIMIT.maxRequests).toBe(60)
    expect(GENERAL_LIMIT.windowSeconds).toBe(60)
  })
})
