import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies
vi.mock('@/lib/deploy', () => ({
  promoteToProduction: vi.fn(),
  healthCheck: vi.fn(),
  storeLastKnownGood: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/store', () => ({
  getApp: vi.fn(),
  updateApp: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/path', () => ({
  getBuildsDir: vi.fn((...sub: string[]) => `/mock/builds/${sub.join('/')}`),
}))

import { POST } from '@/app/api/promote/route'
import { promoteToProduction, healthCheck } from '@/lib/deploy'
import { getApp } from '@/lib/store'

describe('POST /api/promote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when appId is missing', async () => {
    const request = new Request('http://localhost/api/promote', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('appId')
  })

  it('returns 404 when app not found', async () => {
    vi.mocked(getApp).mockResolvedValueOnce(null)

    const request = new Request('http://localhost/api/promote', {
      method: 'POST',
      body: JSON.stringify({ appId: 'nonexistent' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(404)
  })

  it('returns 400 when no preview deployment exists', async () => {
    vi.mocked(getApp).mockResolvedValueOnce({
      id: 'app-1', name: 'Test', nameHindi: 'T', descriptionEn: 'D',
      category: 'retail', url: '', projectId: 'proj-1',
      createdAt: '', status: 'building', files: [],
      // No deploymentId
    } as any)

    const request = new Request('http://localhost/api/promote', {
      method: 'POST',
      body: JSON.stringify({ appId: 'app-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('No preview deployment')
  })

  it('promotes successfully with healthy result', async () => {
    vi.mocked(getApp).mockResolvedValueOnce({
      id: 'app-1', name: 'Test', nameHindi: 'T', descriptionEn: 'D',
      category: 'retail', url: 'https://preview.vercel.app',
      projectId: 'proj-1', deploymentId: 'dpl-1',
      createdAt: '', status: 'preview', files: [],
    } as any)
    vi.mocked(promoteToProduction).mockResolvedValueOnce({
      url: 'https://prod.vercel.app',
      deploymentId: 'dpl-1',
    })
    vi.mocked(healthCheck).mockResolvedValueOnce({
      passed: true, statusCode: 200,
    })

    const request = new Request('http://localhost/api/promote', {
      method: 'POST',
      body: JSON.stringify({ appId: 'app-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.url).toBe('https://prod.vercel.app')
    expect(body.healthCheck.passed).toBe(true)
  })
})
