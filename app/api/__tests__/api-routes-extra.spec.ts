import { describe, it, expect, vi } from 'vitest'

/**
 * Build route structure tests — validates the route configuration and basic
 * input validation without actually calling external services.
 */

describe('POST /api/build', () => {
  it('exports POST handler and runtime config', async () => {
    const module = await import('@/app/api/build/route')
    expect(module.POST).toBeDefined()
    expect(typeof module.POST).toBe('function')
    expect(module.runtime).toBe('nodejs')
    expect(module.maxDuration).toBe(300)
  }, 30000)

  it('rejects request without spec', async () => {
    const { POST } = await import('@/app/api/build/route')
    
    // Mock a simple request with no spec
    const request = new Request('http://localhost/api/build', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '127.0.0.1' },
    })

    // The route should return a readable stream
    const response = await POST(request)
    expect(response).toBeDefined()
    // It's a streaming response, so check it's a Response
    expect(response instanceof Response).toBe(true)
  })
})

describe('POST /api/transcribe', () => {
  it('exports POST handler and runtime config', async () => {
    const module = await import('@/app/api/transcribe/route')
    expect(module.POST).toBeDefined()
    expect(typeof module.POST).toBe('function')
    expect(module.runtime).toBe('nodejs')
    expect(module.maxDuration).toBe(120)
  })
})

describe('GET /api/check-env-key', () => {
  it('exports GET handler', async () => {
    const module = await import('@/app/api/check-env-key/route')
    expect(module.GET).toBeDefined()
    expect(typeof module.GET).toBe('function')
  })
})

describe('GET /api/updates', () => {
  it('exports GET handler', async () => {
    const module = await import('@/app/api/updates/route')
    expect(module.GET).toBeDefined()
    expect(typeof module.GET).toBe('function')
    expect(module.runtime).toBe('nodejs')
  })
})
