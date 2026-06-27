import { describe, it, expect, vi } from 'vitest'

// Mock verify dependencies
vi.mock('@/lib/visual-verifier', () => ({
  verifyVisualCorrectness: vi.fn().mockResolvedValue({
    allPassed: true,
    overallConfidence: 0.95,
    pages: [{ path: '/', passed: true, confidence: 0.95, issues: [] }],
  }),
}))

import { POST } from '@/app/api/verify/route'

describe('POST /api/verify', () => {
  it('returns 400 when url is missing', async () => {
    const request = new Request('http://localhost/api/verify', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)

    const body = await response.json()
    expect(body.error).toContain('url')
  })

  it('runs visual verification with provided URL', async () => {
    const request = new Request('http://localhost/api/verify', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://test-app.vercel.app' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.url).toBe('https://test-app.vercel.app')
    expect(body.allPassed).toBe(true)
    expect(body.overallConfidence).toBe(0.95)
    expect(body.verifiedAt).toBeDefined()
  })

  it('accepts custom pages array', async () => {
    const request = new Request('http://localhost/api/verify', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://test.app', pages: ['/', '/admin'] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
  })
})
