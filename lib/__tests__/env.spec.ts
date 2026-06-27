import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateEnv } from '@/lib/env'
import type { EnvCheck } from '@/lib/env'

describe('validateEnv', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('returns an array of checks', () => {
    const checks = validateEnv()
    expect(Array.isArray(checks)).toBe(true)
    expect(checks.length).toBeGreaterThanOrEqual(10)
  })

  it('checks all required env vars', () => {
    const checks = validateEnv()
    const envKeys = checks.map(c => c.envKey)

    expect(envKeys).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')
    expect(envKeys).toContain('CLERK_SECRET_KEY')
    expect(envKeys).toContain('NVIDIA_API_KEY_1')
    expect(envKeys).toContain('NVIDIA_API_KEY_2')
    expect(envKeys).toContain('NVIDIA_API_KEY_3')
    expect(envKeys).toContain('GROQ_KEY_1')
    expect(envKeys).toContain('GROQ_KEY_2')
    expect(envKeys).toContain('DEPLOY_TOKEN')
    expect(envKeys).toContain('NEXT_PUBLIC_CONVEX_URL')
    expect(envKeys).toContain('CONVEX_DEPLOY_KEY')
  })

  it('detects present env vars', () => {
    process.env.NVIDIA_API_KEY_1 = 'nvapi-test-key-1234'
    const checks = validateEnv()
    const nimCheck = checks.find(c => c.envKey === 'NVIDIA_API_KEY_1')
    expect(nimCheck?.present).toBe(true)
  })

  it('detects missing env vars', () => {
    delete process.env.NVIDIA_API_KEY_1
    delete process.env.NVIDIA_API_KEY_2
    delete process.env.NVIDIA_API_KEY_3
    const checks = validateEnv()
    const nimChecks = checks.filter(c => c.envKey.startsWith('NVIDIA_API_KEY'))
    for (const c of nimChecks) {
      expect(c.present).toBe(false)
    }
  })

  it('rejects YOUR_ placeholder values', () => {
    process.env.NVIDIA_API_KEY_1 = 'YOUR_API_KEY_HERE'
    const checks = validateEnv()
    const nimCheck = checks.find(c => c.envKey === 'NVIDIA_API_KEY_1')
    expect(nimCheck?.present).toBe(false)
  })

  it('rejects empty string values', () => {
    process.env.NVIDIA_API_KEY_1 = ''
    const checks = validateEnv()
    const nimCheck = checks.find(c => c.envKey === 'NVIDIA_API_KEY_1')
    expect(nimCheck?.present).toBe(false)
  })

  it('rejects whitespace-only values', () => {
    process.env.NVIDIA_API_KEY_1 = '   '
    const checks = validateEnv()
    const nimCheck = checks.find(c => c.envKey === 'NVIDIA_API_KEY_1')
    expect(nimCheck?.present).toBe(false)
  })

  it('each check has name, present, required, and envKey', () => {
    const checks = validateEnv()
    for (const check of checks) {
      expect(check).toHaveProperty('name')
      expect(check).toHaveProperty('present')
      expect(check).toHaveProperty('required')
      expect(check).toHaveProperty('envKey')
      expect(typeof check.name).toBe('string')
      expect(typeof check.present).toBe('boolean')
      expect(typeof check.required).toBe('boolean')
      expect(typeof check.envKey).toBe('string')
    }
  })

  it('logs warnings for missing keys', () => {
    delete process.env.NVIDIA_API_KEY_1
    delete process.env.NVIDIA_API_KEY_2
    delete process.env.NVIDIA_API_KEY_3
    validateEnv()
    expect(console.log).toHaveBeenCalled()
  })
})
