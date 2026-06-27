import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies  
vi.mock('@/lib/visual-verifier', () => ({
  quickVerify: vi.fn().mockResolvedValue({
    healthy: true, statusCode: 200, contentLength: 5000, errors: [],
  }),
}))
vi.mock('@/lib/deploy', () => ({
  healthCheck: vi.fn().mockResolvedValue({ passed: true, statusCode: 200 }),
  storeLastKnownGood: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/store', () => ({
  getApp: vi.fn(),
  updateApp: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/path', () => ({
  getBuildsDir: vi.fn((...sub: string[]) => `/mock/builds/${sub.join('/')}`),
}))

// Mock global fetch for the smoke test's own fetches
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { POST } from '@/app/api/smoke-test/route'
import { getApp } from '@/lib/store'

describe('POST /api/smoke-test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default fetch response for smoke test's own route checks
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(
        '<html><head><link rel="stylesheet" href="/_next/static/css/app.css"></head>' +
        '<body><div id="__next"><script src="/_next/static/chunks/main.js"></script></div></body></html>'
      ),
    })
  })

  it('returns 400 when appId is missing', async () => {
    const request = new Request('http://localhost/api/smoke-test', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 404 when app not found', async () => {
    vi.mocked(getApp).mockResolvedValueOnce(null)

    const request = new Request('http://localhost/api/smoke-test', {
      method: 'POST',
      body: JSON.stringify({ appId: 'nonexistent' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(404)
  })

  it('returns 400 when no URL available', async () => {
    vi.mocked(getApp).mockResolvedValueOnce({
      id: 'app-1', name: 'Test', url: '', status: 'building',
    } as any)

    const request = new Request('http://localhost/api/smoke-test', {
      method: 'POST',
      body: JSON.stringify({ appId: 'app-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('No URL')
  })

  it('runs full smoke test suite with override URL', async () => {
    vi.mocked(getApp).mockResolvedValueOnce({
      id: 'app-1', name: 'Test', url: 'https://default.vercel.app',
      status: 'live', projectId: 'proj-1',
    } as any)

    const request = new Request('http://localhost/api/smoke-test', {
      method: 'POST',
      body: JSON.stringify({ appId: 'app-1', url: 'https://custom-url.vercel.app' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.url).toBe('https://custom-url.vercel.app')
    expect(body.results).toBeInstanceOf(Array)
    expect(body.results.length).toBeGreaterThanOrEqual(4)
    expect(body.score).toMatch(/\d+\/\d+/)
  })
})
