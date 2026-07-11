import { describe, it, expect, vi } from 'vitest'

// Mock all heavy dependencies
vi.mock('@/lib/worktree', () => ({
  mergeWorktree: vi.fn().mockResolvedValue({ success: true }),
  discardWorktree: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/deploy', () => ({
  deployToVercel: vi.fn().mockResolvedValue({ url: 'https://test.vercel.app' }),
}))
vi.mock('@/lib/store', () => ({
  getApp: vi.fn().mockResolvedValue({ id: 'app-1', name: 'Test', projectId: 'proj-1', status: 'live', url: 'https://old.vercel.app' }),
  addApp: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/path', () => ({
  getBuildsDir: vi.fn((...sub: string[]) => `/mock/builds/${sub.join('/')}`),
}))

import { POST } from '@/app/api/approve/route'

describe('POST /api/approve', () => {
  it('returns 400 when fields are missing', async () => {
    const request = new Request('http://localhost/api/approve', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain('Missing')
  })

  it('returns 400 for invalid decision', async () => {
    const request = new Request('http://localhost/api/approve', {
      method: 'POST',
      body: JSON.stringify({ appId: 'a', improvementId: 'b', decision: 'maybe' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('handles mock seed-1 approval', async () => {
    const request = new Request('http://localhost/api/approve', {
      method: 'POST',
      body: JSON.stringify({ appId: 'app-1', improvementId: 'seed-1', decision: 'accept' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.decision).toBe('accept')
    expect(body.message).toContain('Mock')
  })

  it('handles mock seed-1 rejection', async () => {
    const request = new Request('http://localhost/api/approve', {
      method: 'POST',
      body: JSON.stringify({ appId: 'app-1', improvementId: 'seed-1', decision: 'reject' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.decision).toBe('reject')
  })
})
