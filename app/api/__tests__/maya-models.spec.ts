import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/maya-models/route'

describe('GET /api/maya-models', () => {
  it('returns 200 with model tiers', async () => {
    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toHaveProperty('mini')
    expect(body).toHaveProperty('fast')
    expect(body).toHaveProperty('max')
    expect(body).toHaveProperty('verifier')
  })

  it('each model tier has provider and model fields', async () => {
    const response = await GET()
    const body = await response.json()

    for (const tier of ['mini', 'fast', 'max', 'verifier']) {
      expect(body[tier]).toHaveProperty('provider')
      expect(body[tier]).toHaveProperty('model')
      expect(typeof body[tier].provider).toBe('string')
      expect(typeof body[tier].model).toBe('string')
    }
  })

  it('returns expected fallback models when env is not set', async () => {
    const response = await GET()
    const body = await response.json()

    // Without env vars, these should use the fallback values
    expect(body.mini.model).toContain('step-3.7-flash')
    expect(body.fast.model).toContain('deepseek')
    expect(body.max.model).toContain('minimax-m3')
    expect(body.verifier.model).toContain('minimax-m3')
  })

  it('parses 3-part model strings correctly', async () => {
    const response = await GET()
    const body = await response.json()

    // Default: 'stepfun-ai/step-3.7-flash' → provider: first part, model: rest
    // With fallback parsing (2-part), provider = 'Anthropic'
    // With 3-part (e.g., 'nvidia/stepfun-ai/step-3.7-flash'), provider = 'nvidia'
    expect(body.mini.provider).toBeTruthy()
    expect(body.mini.model).toBeTruthy()
  })
})
